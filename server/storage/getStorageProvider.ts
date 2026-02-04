/**
 * Centralized Storage Provider Resolver
 * 
 * Implements hierarchical S3 configuration:
 * 1. Tenant-specific S3 config (priority)
 * 2. System-level S3 config (fallback)
 * 3. Throws STORAGE_NOT_CONFIGURED if neither exists
 * 
 * SECURITY:
 * - S3 credentials never exposed to client
 * - All resolution is server-side
 * - Tenant isolation enforced
 */

import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";
import { S3Client } from "@aws-sdk/client-s3";

export interface S3Config {
  bucketName: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefixTemplate?: string;
  endpoint?: string;
  publicUrl?: string; // Public URL for R2 bucket (r2.dev or custom domain)
  provider?: "s3" | "r2";
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
  if (process.env.S3_STORAGE_DEBUG === "true") {
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

async function getIntegrationConfig(tenantId: string | null, provider: string = "s3"): Promise<{
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
 * Build S3Config from integration config
 */
function buildConfigFromIntegration(
  publicConfig: S3PublicConfig,
  secretConfig: S3SecretConfig,
  provider: "s3" | "r2"
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
 * Resolution order (R2 is prioritized over S3):
 * 1. Tenant-specific R2 integration (if tenantId provided)
 * 2. Tenant-specific S3 integration (if tenantId provided)
 * 3. System-level R2 integration (tenantId = NULL) - preferred default
 * 4. System-level S3 integration (tenantId = NULL)
 * 5. Environment variables (legacy fallback)
 * 6. Throws StorageNotConfiguredError if none available
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

    const tenantS3Config = await getIntegrationConfig(tenantId, "s3");
    if (tenantS3Config && isValidS3Config(tenantS3Config.publicConfig, tenantS3Config.secretConfig)) {
      debugLog("Using tenant S3 configuration", { tenantId, integrationId: tenantS3Config.integrationId });
      return {
        config: buildConfigFromIntegration(tenantS3Config.publicConfig!, tenantS3Config.secretConfig!, "s3"),
        source: "tenant",
        sourceId: tenantId,
      };
    }
    debugLog("No valid tenant storage config, checking system fallback", { tenantId });
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

  const systemS3Config = await getIntegrationConfig(null, "s3");
  if (systemS3Config && isValidS3Config(systemS3Config.publicConfig, systemS3Config.secretConfig)) {
    debugLog("Using system S3 configuration (fallback)", { tenantId });
    return {
      config: buildConfigFromIntegration(systemS3Config.publicConfig!, systemS3Config.secretConfig!, "s3"),
      source: "system",
      sourceId: null,
    };
  }

  // Check for Cloudflare R2 environment variables (preferred over AWS S3)
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

  // Check for AWS S3 environment variables (legacy fallback)
  const envRegion = process.env.AWS_REGION;
  const envAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const envSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const envBucketName = process.env.AWS_S3_BUCKET_NAME;

  if (envRegion && envAccessKeyId && envSecretAccessKey && envBucketName) {
    debugLog("Using environment variable S3 configuration (legacy)", { tenantId });
    return {
      config: {
        bucketName: envBucketName,
        region: envRegion,
        accessKeyId: envAccessKeyId,
        secretAccessKey: envSecretAccessKey,
        keyPrefixTemplate: process.env.AWS_S3_KEY_PREFIX,
        provider: "s3",
      },
      source: "env" as const,
      sourceId: null,
    };
  }

  debugLog("No storage provider configured", { tenantId });
  throw new StorageNotConfiguredError();
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
  provider?: "r2" | "s3";
  tenantHasOverride: boolean;
  systemHasDefault: boolean;
  systemR2Configured: boolean;
  systemS3Configured: boolean;
  error?: string;
}> {
  let tenantHasOverride = false;
  let tenantProvider: "r2" | "s3" | undefined;
  let systemHasDefault = false;
  let systemR2Configured = false;
  let systemS3Configured = false;
  let error: string | undefined;

  if (tenantId) {
    try {
      const tenantR2Config = await getIntegrationConfig(tenantId, "r2");
      if (tenantR2Config && isValidS3Config(tenantR2Config.publicConfig, tenantR2Config.secretConfig)) {
        tenantHasOverride = true;
        tenantProvider = "r2";
      } else {
        const tenantS3Config = await getIntegrationConfig(tenantId, "s3");
        if (tenantS3Config && isValidS3Config(tenantS3Config.publicConfig, tenantS3Config.secretConfig)) {
          tenantHasOverride = true;
          tenantProvider = "s3";
        }
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
    
    const systemS3Config = await getIntegrationConfig(null, "s3");
    systemS3Configured = systemS3Config !== null && isValidS3Config(systemS3Config.publicConfig, systemS3Config.secretConfig);
    
    systemHasDefault = systemR2Configured || systemS3Configured;
  } catch (err) {
    if (err instanceof StorageDecryptionError || err instanceof StorageEncryptionNotAvailableError) {
      if (!error) error = err.message;
    } else {
      throw err;
    }
  }

  // Check for R2 env vars (preferred)
  const envR2Configured = !!(
    process.env.CF_R2_ACCOUNT_ID &&
    process.env.CF_R2_ACCESS_KEY_ID &&
    process.env.CF_R2_SECRET_ACCESS_KEY &&
    process.env.CF_R2_BUCKET_NAME
  );

  // Check for S3 env vars (legacy fallback)
  const envS3Configured = !!(
    process.env.AWS_REGION &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET_NAME
  );

  let source: "tenant" | "system" | "env" | "none" = "none";
  let provider: "r2" | "s3" | undefined;
  let configured = false;

  if (tenantHasOverride) {
    source = "tenant";
    provider = tenantProvider;
    configured = true;
  } else if (systemR2Configured) {
    source = "system";
    provider = "r2";
    configured = true;
  } else if (systemS3Configured) {
    source = "system";
    provider = "s3";
    configured = true;
  } else if (envR2Configured) {
    source = "env";
    provider = "r2";
    configured = true;
  } else if (envS3Configured) {
    source = "env";
    provider = "s3";
    configured = true;
  }

  return {
    configured,
    source,
    provider,
    error,
    tenantHasOverride,
    systemHasDefault,
    systemR2Configured,
    systemS3Configured,
  };
}
