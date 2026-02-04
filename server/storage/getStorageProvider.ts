/**
 * Centralized Storage Provider Resolver
 * 
 * Implements hierarchical Cloudflare R2 configuration:
 * 1. Tenant-specific R2 config (priority)
 * 2. System-level R2 config (fallback)
 * 3. Environment variable R2 config (CF_R2_*)
 * 4. Throws STORAGE_NOT_CONFIGURED if none exists
 * 
 * Note: Cloudflare R2 is the exclusive storage provider for this application.
 * All S3 fallback code has been removed.
 * 
 * SECURITY:
 * - R2 credentials never exposed to client
 * - All resolution is server-side
 * - Tenant isolation enforced
 */

import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";
import { S3Client } from "@aws-sdk/client-s3";

/**
 * S3-compatible storage configuration (used for R2).
 * Named S3Config for SDK compatibility, but exclusively uses Cloudflare R2.
 */
export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefixTemplate?: string;
  endpoint?: string;
  publicUrl?: string; // Public URL for R2 bucket (r2.dev or custom domain)
  provider: "r2"; // Always R2 - kept for type compatibility
}

export interface StorageProviderResult {
  config: S3Config;
  source: "tenant" | "system" | "env";
  sourceId: string | null;
}

export class StorageNotConfiguredError extends Error {
  code = "STORAGE_NOT_CONFIGURED";
  
  constructor(message?: string) {
    super(message || "File storage has not been configured. Contact your administrator.");
    this.name = "StorageNotConfiguredError";
  }
}

interface S3PublicConfig {
  bucketName: string;
  region: string;
  keyPrefixTemplate?: string;
  endpoint?: string;
  publicUrl?: string;
}

interface S3SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

function debugLog(message: string, data?: Record<string, any>) {
  if (process.env.R2_STORAGE_DEBUG === "true") {
    const safeData = data ? { ...data } : {};
    delete safeData.accessKeyId;
    delete safeData.secretAccessKey;
    console.log(`[StorageProvider DEBUG] ${message}`, safeData);
  }
}

export class StorageDecryptionError extends Error {
  code = "STORAGE_DECRYPTION_FAILED";
  
  constructor(integrationId: string) {
    super(`Failed to decrypt storage credentials for integration ${integrationId}. Check APP_ENCRYPTION_KEY configuration.`);
    this.name = "StorageDecryptionError";
  }
}

export class StorageEncryptionNotAvailableError extends Error {
  code = "STORAGE_ENCRYPTION_NOT_AVAILABLE";
  
  constructor() {
    super("Encryption key not configured. Cannot access storage credentials.");
    this.name = "StorageEncryptionNotAvailableError";
  }
}

async function getIntegrationConfig(tenantId: string | null, provider: string = "r2"): Promise<{
  publicConfig: S3PublicConfig | null;
  secretConfig: S3SecretConfig | null;
  integrationId: string;
} | null> {
  const condition = tenantId 
    ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider), eq(tenantIntegrations.status, IntegrationStatus.CONFIGURED))
    : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider), eq(tenantIntegrations.status, IntegrationStatus.CONFIGURED));

  const [integration] = await db
    .select()
    .from(tenantIntegrations)
    .where(condition)
    .limit(1);

  if (!integration) {
    return null;
  }

  let secretConfig: S3SecretConfig | null = null;
  if (integration.configEncrypted) {
    if (!isEncryptionAvailable()) {
      console.error(`[StorageProvider] Encryption not available for integration ${integration.id}`);
      throw new StorageEncryptionNotAvailableError();
    }
    try {
      secretConfig = JSON.parse(decryptValue(integration.configEncrypted)) as S3SecretConfig;
    } catch (err) {
      console.error(`[StorageProvider] Failed to decrypt secrets for integration ${integration.id}:`, err);
      throw new StorageDecryptionError(integration.id);
    }
  }

  return {
    publicConfig: integration.configPublic as S3PublicConfig | null,
    secretConfig,
    integrationId: integration.id,
  };
}

function isValidS3Config(publicConfig: S3PublicConfig | null, secretConfig: S3SecretConfig | null): boolean {
  if (!publicConfig?.bucketName || !publicConfig?.region) {
    return false;
  }
  if (!secretConfig?.accessKeyId || !secretConfig?.secretAccessKey) {
    return false;
  }
  return true;
}

/**
 * Build S3Config from integration config (R2 only)
 */
function buildConfigFromIntegration(
  publicConfig: S3PublicConfig,
  secretConfig: S3SecretConfig,
  provider: "r2"
): S3Config {
  return {
    bucketName: publicConfig.bucketName,
    region: publicConfig.region || "auto",
    accessKeyId: secretConfig.accessKeyId!,
    secretAccessKey: secretConfig.secretAccessKey!,
    keyPrefixTemplate: publicConfig.keyPrefixTemplate,
    endpoint: publicConfig.endpoint,
    publicUrl: publicConfig.publicUrl,
    provider,
  };
}

/**
 * Get the storage provider configuration for a tenant.
 * 
 * Resolution order (Cloudflare R2 only):
 * 1. Tenant-specific R2 integration (if tenantId provided)
 * 2. System-level R2 integration (tenantId = NULL)
 * 3. Environment variables (CF_R2_*)
 * 4. Throws StorageNotConfiguredError if none available
 * 
 * @param tenantId - The tenant ID to resolve storage for, or null for system-level only
 * @returns StorageProviderResult with config and source information
 * @throws StorageNotConfiguredError if no storage is configured
 */
export async function getStorageProvider(tenantId: string | null): Promise<StorageProviderResult> {
  debugLog("Resolving storage provider", { tenantId });

  if (tenantId) {
    const tenantR2Config = await getIntegrationConfig(tenantId, "r2");
    if (tenantR2Config && isValidS3Config(tenantR2Config.publicConfig, tenantR2Config.secretConfig)) {
      debugLog("Using tenant R2 configuration", { tenantId, integrationId: tenantR2Config.integrationId });
      return {
        config: buildConfigFromIntegration(tenantR2Config.publicConfig!, tenantR2Config.secretConfig!, "r2"),
        source: "tenant",
        sourceId: tenantId,
      };
    }

    debugLog("No valid tenant R2 config, checking system fallback", { tenantId });
  }

  const systemR2Config = await getIntegrationConfig(null, "r2");
  if (systemR2Config && isValidS3Config(systemR2Config.publicConfig, systemR2Config.secretConfig)) {
    debugLog("Using system R2 configuration (preferred default)", { tenantId });
    return {
      config: buildConfigFromIntegration(systemR2Config.publicConfig!, systemR2Config.secretConfig!, "r2"),
      source: "system",
      sourceId: null,
    };
  }

  // Check for Cloudflare R2 environment variables
  // Trim all values to avoid signature mismatches from trailing whitespace
  const r2AccountId = process.env.CF_R2_ACCOUNT_ID?.trim();
  const r2AccessKeyId = process.env.CF_R2_ACCESS_KEY_ID?.trim();
  const r2SecretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY?.trim();
  const r2BucketName = process.env.CF_R2_BUCKET_NAME?.trim();
  const r2PublicUrl = process.env.CF_R2_PUBLIC_URL?.trim();

  if (r2AccountId && r2AccessKeyId && r2SecretAccessKey && r2BucketName) {
    debugLog("Using environment variable R2 configuration", { tenantId });
    return {
      config: {
        bucketName: r2BucketName,
        region: "auto",
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
        endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
        publicUrl: r2PublicUrl,
        provider: "r2",
      },
      source: "env" as const,
      sourceId: null,
    };
  }

  debugLog("No storage provider configured", { tenantId });
  throw new StorageNotConfiguredError("Cloudflare R2 storage is not configured. Set CF_R2_* environment variables or configure via Super Admin Integrations.");
}

/**
 * Create an S3Client from the resolved storage provider configuration.
 * Supports both AWS S3 and Cloudflare R2 (via custom endpoint).
 */
export function createS3ClientFromConfig(config: S3Config): S3Client {
  const clientConfig: any = {
    region: config.region || "auto",
    credentials: {
      accessKeyId: config.accessKeyId.trim(),
      secretAccessKey: config.secretAccessKey.trim(),
    },
  };

  if (config.endpoint) {
    clientConfig.endpoint = config.endpoint;
    clientConfig.forcePathStyle = true;
  }

  // Disable request checksums for R2 compatibility
  // R2 doesn't fully support SDK v3's default CRC32 checksums
  if (config.provider === "r2") {
    clientConfig.requestChecksumCalculation = "WHEN_REQUIRED";
    clientConfig.responseChecksumValidation = "WHEN_REQUIRED";
  }

  return new S3Client(clientConfig);
}

/**
 * Check the storage status for a tenant (for UI display).
 * Returns information about which storage source is being used.
 * 
 * Note: This is a safe check that won't throw errors - it catches
 * decryption/encryption errors and reports them in the status.
 */
export async function getStorageStatus(tenantId: string | null): Promise<{
  configured: boolean;
  source: "tenant" | "system" | "env" | "none";
  provider: "r2";
  tenantHasOverride: boolean;
  systemHasDefault: boolean;
  systemR2Configured: boolean;
  error?: string;
}> {
  let tenantHasOverride = false;
  let systemHasDefault = false;
  let systemR2Configured = false;
  let error: string | undefined;

  if (tenantId) {
    try {
      const tenantR2Config = await getIntegrationConfig(tenantId, "r2");
      if (tenantR2Config && isValidS3Config(tenantR2Config.publicConfig, tenantR2Config.secretConfig)) {
        tenantHasOverride = true;
      }
    } catch (err) {
      if (err instanceof StorageDecryptionError || err instanceof StorageEncryptionNotAvailableError) {
        error = err.message;
      } else {
        throw err;
      }
    }
  }

  try {
    const systemR2Config = await getIntegrationConfig(null, "r2");
    systemR2Configured = systemR2Config !== null && isValidS3Config(systemR2Config.publicConfig, systemR2Config.secretConfig);
    systemHasDefault = systemR2Configured;
  } catch (err) {
    if (err instanceof StorageDecryptionError || err instanceof StorageEncryptionNotAvailableError) {
      if (!error) error = err.message;
    } else {
      throw err;
    }
  }

  // Check for R2 env vars
  const envR2Configured = !!(
    process.env.CF_R2_ACCOUNT_ID &&
    process.env.CF_R2_ACCESS_KEY_ID &&
    process.env.CF_R2_SECRET_ACCESS_KEY &&
    process.env.CF_R2_BUCKET_NAME
  );

  let source: "tenant" | "system" | "env" | "none" = "none";
  let configured = false;

  if (tenantHasOverride) {
    source = "tenant";
    configured = true;
  } else if (systemR2Configured) {
    source = "system";
    configured = true;
  } else if (envR2Configured) {
    source = "env";
    configured = true;
  }

  return {
    configured,
    source,
    provider: "r2",
    error,
    tenantHasOverride,
    systemHasDefault,
    systemR2Configured,
  };
}
