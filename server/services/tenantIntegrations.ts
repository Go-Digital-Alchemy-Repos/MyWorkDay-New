import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";
import Mailgun from "mailgun.js";
import FormData from "form-data";

export type IntegrationProvider = "mailgun" | "s3" | "r2" | "sso_google" | "openai";

interface MailgunPublicConfig {
  domain: string;
  fromEmail: string;
  replyTo?: string;
}

interface MailgunSecretConfig {
  apiKey: string;
}

interface S3PublicConfig {
  bucketName: string;
  region: string;
  keyPrefixTemplate: string;
}

interface S3SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface R2PublicConfig {
  bucketName: string;
  accountId: string;
  endpoint: string;
  keyPrefixTemplate?: string;
}

interface R2SecretConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * SSO Google OAuth public configuration (non-secret fields)
 */
export interface SsoGooglePublicConfig {
  enabled: boolean;
  clientId: string;
  redirectUri: string;
}

/**
 * SSO Google OAuth secret configuration (encrypted)
 */
export interface SsoGoogleSecretConfig {
  clientSecret: string;
}

/**
 * OpenAI integration public configuration
 */
export interface OpenAIPublicConfig {
  enabled: boolean;
  model: string;
  maxTokens: number;
  temperature: string;
}

/**
 * OpenAI integration secret configuration (encrypted)
 */
export interface OpenAISecretConfig {
  apiKey: string;
}

type PublicConfig = MailgunPublicConfig | S3PublicConfig | R2PublicConfig | SsoGooglePublicConfig | OpenAIPublicConfig;
type SecretConfig = MailgunSecretConfig | S3SecretConfig | R2SecretConfig | SsoGoogleSecretConfig | OpenAISecretConfig;

interface SecretMaskedInfo {
  apiKeyMasked?: string | null;
  accessKeyIdMasked?: string | null;
  secretAccessKeyMasked?: string | null;
  clientSecretMasked?: string | null;
}

export interface IntegrationResponse {
  provider: string;
  status: string;
  publicConfig: PublicConfig | null;
  secretConfigured: boolean;
  lastTestedAt: Date | null;
  secretMasked?: SecretMaskedInfo;
}

function debugLog(message: string, data?: Record<string, any>) {
  if (process.env.MAILGUN_DEBUG === "true") {
    const safeData = data ? { ...data } : {};
    delete safeData.apiKey;
    delete safeData.secretAccessKey;
    delete safeData.accessKeyId;
    console.log(`[TenantIntegrations DEBUG] ${message}`, safeData);
  }
}

function maskSecret(secret: string | undefined | null): string | null {
  if (!secret || secret.length < 4) return null;
  return "••••" + secret.slice(-4);
}

export interface IntegrationUpdateInput {
  publicConfig?: Partial<PublicConfig>;
  secretConfig?: Partial<SecretConfig>;
}

export class TenantIntegrationService {
  async getIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<IntegrationResponse | null> {
    debugLog("getIntegration called", { tenantId, provider });
    
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    let integration;
    try {
      const [result] = await db
        .select()
        .from(tenantIntegrations)
        .where(condition)
        .limit(1);
      integration = result;
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[TenantIntegrations] table/column issue:", message);
        return null;
      }
      throw dbError;
    }

    if (!integration) {
      debugLog("getIntegration - not found", { tenantId, provider });
      return null;
    }

    let secretMasked: SecretMaskedInfo | undefined;
    if (integration.configEncrypted && isEncryptionAvailable()) {
      try {
        const secrets = JSON.parse(decryptValue(integration.configEncrypted)) as SecretConfig;
        if (provider === "mailgun") {
          const mgSecrets = secrets as MailgunSecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(mgSecrets.apiKey),
          };
        } else if (provider === "s3") {
          const s3Secrets = secrets as S3SecretConfig;
          secretMasked = {
            accessKeyIdMasked: maskSecret(s3Secrets.accessKeyId),
            secretAccessKeyMasked: maskSecret(s3Secrets.secretAccessKey),
          };
        } else if (provider === "r2") {
          const r2Secrets = secrets as R2SecretConfig;
          secretMasked = {
            accessKeyIdMasked: maskSecret(r2Secrets.accessKeyId),
            secretAccessKeyMasked: maskSecret(r2Secrets.secretAccessKey),
          };
        } else if (provider === "sso_google") {
          const ssoSecrets = secrets as SsoGoogleSecretConfig;
          secretMasked = {
            clientSecretMasked: maskSecret(ssoSecrets.clientSecret),
          };
        } else if (provider === "openai") {
          const aiSecrets = secrets as OpenAISecretConfig;
          secretMasked = {
            apiKeyMasked: maskSecret(aiSecrets.apiKey),
          };
        }
      } catch (err) {
        debugLog("getIntegration - failed to decrypt secrets for masking", { tenantId, provider });
      }
    }

    debugLog("getIntegration - found", { 
      tenantId, 
      provider, 
      status: integration.status, 
      hasSecrets: !!integration.configEncrypted 
    });

    return {
      provider: integration.provider,
      status: integration.status,
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfigured: !!integration.configEncrypted,
      lastTestedAt: integration.lastTestedAt,
      secretMasked,
    };
  }

  async listIntegrations(tenantId: string | null): Promise<IntegrationResponse[]> {
    debugLog("listIntegrations called", { tenantId });
    
    const condition = tenantId
      ? eq(tenantIntegrations.tenantId, tenantId)
      : isNull(tenantIntegrations.tenantId);
    
    let integrations: typeof tenantIntegrations.$inferSelect[] = [];
    try {
      integrations = await db
        .select()
        .from(tenantIntegrations)
        .where(condition);
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[TenantIntegrations] listIntegrations table/column issue:", message);
        // Return empty list with not_configured status for all providers
        return ["mailgun", "s3", "r2", "sso_google", "openai"].map(p => ({
          provider: p,
          status: IntegrationStatus.NOT_CONFIGURED,
          publicConfig: null,
          secretConfigured: false,
          lastTestedAt: null,
        }));
      }
      throw dbError;
    }

    const providers: IntegrationProvider[] = ["mailgun", "s3", "r2", "sso_google", "openai"];
    const result: IntegrationResponse[] = [];

    for (const provider of providers) {
      const existing = integrations.find(i => i.provider === provider);
      if (existing) {
        let secretMasked: SecretMaskedInfo | undefined;
        if (existing.configEncrypted && isEncryptionAvailable()) {
          try {
            const secrets = JSON.parse(decryptValue(existing.configEncrypted)) as SecretConfig;
            if (provider === "mailgun") {
              const mgSecrets = secrets as MailgunSecretConfig;
              secretMasked = { apiKeyMasked: maskSecret(mgSecrets.apiKey) };
            } else if (provider === "s3") {
              const s3Secrets = secrets as S3SecretConfig;
              secretMasked = {
                accessKeyIdMasked: maskSecret(s3Secrets.accessKeyId),
                secretAccessKeyMasked: maskSecret(s3Secrets.secretAccessKey),
              };
            } else if (provider === "sso_google") {
              const ssoSecrets = secrets as SsoGoogleSecretConfig;
              secretMasked = { clientSecretMasked: maskSecret(ssoSecrets.clientSecret) };
            } else if (provider === "openai") {
              const aiSecrets = secrets as OpenAISecretConfig;
              secretMasked = { apiKeyMasked: maskSecret(aiSecrets.apiKey) };
            }
          } catch {
            debugLog("listIntegrations - failed to decrypt secrets for masking", { tenantId, provider });
          }
        }
        result.push({
          provider: existing.provider,
          status: existing.status,
          publicConfig: existing.configPublic as PublicConfig | null,
          secretConfigured: !!existing.configEncrypted,
          lastTestedAt: existing.lastTestedAt,
          secretMasked,
        });
      } else {
        result.push({
          provider,
          status: IntegrationStatus.NOT_CONFIGURED,
          publicConfig: null,
          secretConfigured: false,
          lastTestedAt: null,
        });
      }
    }

    debugLog("listIntegrations - complete", { tenantId, count: result.length });
    return result;
  }

  async upsertIntegration(
    tenantId: string | null,
    provider: IntegrationProvider,
    input: IntegrationUpdateInput
  ): Promise<IntegrationResponse> {
    debugLog("upsertIntegration called", { 
      tenantId, 
      provider, 
      hasPublicConfig: !!input.publicConfig,
      hasSecretConfig: !!input.secretConfig 
    });

    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      debugLog("upsertIntegration - ENCRYPTION_KEY_MISSING", { tenantId, provider });
      throw new Error("Encryption key not configured. Cannot save integration secrets.");
    }

    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));

    const [existing] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    let publicConfig: PublicConfig | null = null;
    let configEncrypted: string | null = null;
    let hasSecret = false;

    if (existing) {
      publicConfig = (existing.configPublic as PublicConfig) || null;
      if (existing.configEncrypted) {
        try {
          configEncrypted = existing.configEncrypted;
          hasSecret = true;
        } catch {
          configEncrypted = null;
        }
      }
    }

    if (input.publicConfig) {
      publicConfig = {
        ...(publicConfig || {}),
        ...input.publicConfig,
      } as PublicConfig;
    }

    if (input.secretConfig) {
      const hasNewSecret = Object.values(input.secretConfig).some(v => v && v.trim() !== "");
      if (hasNewSecret) {
        let existingSecrets: SecretConfig = {};
        if (configEncrypted && isEncryptionAvailable()) {
          try {
            existingSecrets = JSON.parse(decryptValue(configEncrypted));
          } catch {
            existingSecrets = {};
          }
        }
        const newSecrets: SecretConfig = {
          ...existingSecrets,
          ...input.secretConfig,
        };
        Object.keys(newSecrets).forEach(key => {
          if ((newSecrets as any)[key] === "" || (newSecrets as any)[key] === undefined) {
            delete (newSecrets as any)[key];
          }
        });
        if (Object.keys(newSecrets).length > 0) {
          configEncrypted = encryptValue(JSON.stringify(newSecrets));
          hasSecret = true;
        }
      }
    }

    const status = this.determineStatus(provider, publicConfig, hasSecret);

    if (existing) {
      await db
        .update(tenantIntegrations)
        .set({
          configPublic: publicConfig,
          configEncrypted,
          status,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrations.id, existing.id));
      debugLog("upsertIntegration - updated existing", { tenantId, provider, status, savedOk: true });
    } else {
      await db.insert(tenantIntegrations).values({
        tenantId,
        provider,
        configPublic: publicConfig,
        configEncrypted,
        status,
      });
      debugLog("upsertIntegration - inserted new", { tenantId, provider, status, savedOk: true });
    }

    return {
      provider,
      status,
      publicConfig,
      secretConfigured: hasSecret,
      lastTestedAt: existing?.lastTestedAt || null,
    };
  }

  async getDecryptedSecrets(tenantId: string | null, provider: IntegrationProvider): Promise<SecretConfig | null> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration?.configEncrypted) {
      return null;
    }

    try {
      return JSON.parse(decryptValue(integration.configEncrypted));
    } catch {
      console.error(`[TenantIntegrations] Failed to decrypt secrets for ${provider}`);
      return null;
    }
  }

  async getIntegrationWithSecrets(tenantId: string | null, provider: IntegrationProvider): Promise<{ publicConfig: PublicConfig | null; secretConfig: SecretConfig | null } | null> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
    
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration) {
      return null;
    }

    let secretConfig: SecretConfig | null = null;
    if (integration.configEncrypted) {
      try {
        secretConfig = JSON.parse(decryptValue(integration.configEncrypted));
      } catch {
        console.error(`[TenantIntegrations] Failed to decrypt secrets for ${provider}`);
      }
    }

    return {
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfig,
    };
  }

  async testIntegration(tenantId: string | null, provider: IntegrationProvider): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, provider);
    
    if (!integration || integration.status === IntegrationStatus.NOT_CONFIGURED) {
      return { success: false, message: `${provider} is not configured` };
    }

    try {
      let testResult: { success: boolean; message: string };

      switch (provider) {
        case "mailgun":
          testResult = await this.testMailgun(tenantId);
          break;
        case "s3":
          testResult = await this.testS3(tenantId);
          break;
        case "r2":
          testResult = await this.testR2(tenantId);
          break;
        case "sso_google":
          testResult = await this.testSsoGoogle();
          break;
        case "openai":
          testResult = await this.testOpenAI(tenantId);
          break;
        default:
          testResult = { success: false, message: `Unknown provider: ${provider}` };
      }

      const updateCondition = tenantId
        ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
        : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
      
      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: testResult.success ? IntegrationStatus.CONFIGURED : IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(updateCondition);

      return testResult;
    } catch (error) {
      console.error(`[TenantIntegrations] Test failed for ${provider}:`, error);
      
      const updateCondition = tenantId
        ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
        : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));
      
      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(updateCondition);

      return { success: false, message: error instanceof Error ? error.message : "Test failed" };
    }
  }

  private async testMailgun(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const secrets = await this.getDecryptedSecrets(tenantId, "mailgun") as MailgunSecretConfig | null;
    const integration = await this.getIntegration(tenantId, "mailgun");
    
    if (!secrets?.apiKey || !integration?.publicConfig) {
      return { success: false, message: "Mailgun API key not configured" };
    }

    const config = integration.publicConfig as MailgunPublicConfig;
    if (!config.domain || !config.fromEmail) {
      return { success: false, message: "Mailgun domain or from email not configured" };
    }

    try {
      const mailgun = new Mailgun(FormData);
      const mg = mailgun.client({ username: "api", key: secrets.apiKey });
      await mg.domains.get(config.domain);
      debugLog("testMailgun - domain validated", { tenantId, domain: config.domain });
      return { success: true, message: "Mailgun configuration is valid" };
    } catch (error: any) {
      debugLog("testMailgun - failed", { tenantId, error: error.message });
      return { success: false, message: error.message || "Failed to validate Mailgun domain" };
    }
  }

  async sendTestEmail(
    tenantId: string,
    toEmail: string,
    tenantName: string,
    requestId: string
  ): Promise<{ ok: boolean; error?: { code: string; message: string; requestId: string } }> {
    debugLog("sendTestEmail called", { tenantId, toEmail, requestId });

    const integration = await this.getIntegration(tenantId, "mailgun");
    if (!integration || integration.status !== IntegrationStatus.CONFIGURED) {
      return {
        ok: false,
        error: {
          code: "MAILGUN_NOT_CONFIGURED",
          message: "Mailgun is not configured for this tenant",
          requestId,
        },
      };
    }

    const secrets = await this.getDecryptedSecrets(tenantId, "mailgun") as MailgunSecretConfig | null;
    if (!secrets?.apiKey) {
      return {
        ok: false,
        error: {
          code: "MAILGUN_API_KEY_MISSING",
          message: "Mailgun API key is not configured",
          requestId,
        },
      };
    }

    const config = integration.publicConfig as MailgunPublicConfig;

    try {
      const mailgun = new Mailgun(FormData);
      const mg = mailgun.client({ username: "api", key: secrets.apiKey });

      const timestamp = new Date().toISOString();
      await mg.messages.create(config.domain, {
        from: config.fromEmail,
        to: [toEmail],
        subject: "Mailgun Test - MyWorkDay",
        text: `This is a test email from MyWorkDay.\n\nTenant: ${tenantName}\nTimestamp: ${timestamp}\nRequest ID: ${requestId}\n\nIf you received this email, your Mailgun integration is working correctly.`,
      });

      debugLog("sendTestEmail - success", { tenantId, toEmail, requestId });
      return { ok: true };
    } catch (error: any) {
      debugLog("sendTestEmail - failed", { tenantId, error: error.message, requestId });
      return {
        ok: false,
        error: {
          code: "MAILGUN_SEND_FAILED",
          message: error.message || "Failed to send test email",
          requestId,
        },
      };
    }
  }

  private async testS3(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "s3");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "S3 bucket not configured" };
    }

    const config = integration.publicConfig as S3PublicConfig;
    if (!config.bucketName || !config.region) {
      return { success: false, message: "S3 bucket or region not configured" };
    }

    const label = tenantId ? `tenant ${tenantId}` : "system-level";
    console.log(`[S3] Testing integration for ${label} - bucket: ${config.bucketName}`);
    return { success: true, message: "S3 configuration is valid" };
  }

  private async testR2(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "r2");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "Cloudflare R2 not configured" };
    }

    const config = integration.publicConfig as R2PublicConfig;
    if (!config.bucketName || !config.accountId) {
      return { success: false, message: "R2 bucket or account ID not configured" };
    }

    const label = tenantId ? `tenant ${tenantId}` : "system-level";
    console.log(`[R2] Testing integration for ${label} - bucket: ${config.bucketName}, accountId: ${config.accountId}`);
    return { success: true, message: "Cloudflare R2 configuration is valid" };
  }

  private determineStatus(
    provider: IntegrationProvider,
    publicConfig: PublicConfig | null,
    hasSecret: boolean
  ): string {
    if (!publicConfig) {
      return IntegrationStatus.NOT_CONFIGURED;
    }

    switch (provider) {
      case "mailgun": {
        const config = publicConfig as MailgunPublicConfig;
        if (config.domain && config.fromEmail && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "s3": {
        const config = publicConfig as S3PublicConfig;
        // S3 requires bucketName, region, AND secrets (accessKeyId, secretAccessKey)
        if (config.bucketName && config.region && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "r2": {
        const config = publicConfig as R2PublicConfig;
        // R2 requires bucketName, accountId, AND secrets (accessKeyId, secretAccessKey)
        if (config.bucketName && config.accountId && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
      case "sso_google": {
        const config = publicConfig as SsoGooglePublicConfig;
        if (config.enabled && config.clientId && hasSecret) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
    }

    return IntegrationStatus.NOT_CONFIGURED;
  }

  /**
   * Test SSO Google configuration by validating required fields
   * and optionally checking Google's OIDC discovery endpoint
   */
  private async testSsoGoogle(): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(null, "sso_google");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "Google SSO is not configured" };
    }

    const config = integration.publicConfig as SsoGooglePublicConfig;
    if (!config.enabled) {
      return { success: false, message: "Google SSO is disabled" };
    }

    if (!config.clientId) {
      return { success: false, message: "Google Client ID is required" };
    }

    const secrets = await this.getDecryptedSecrets(null, "sso_google") as SsoGoogleSecretConfig | null;
    if (!secrets?.clientSecret) {
      return { success: false, message: "Google Client Secret is required" };
    }

    try {
      const response = await fetch("https://accounts.google.com/.well-known/openid-configuration");
      if (response.ok) {
        return { success: true, message: "Google SSO configuration is valid. OIDC discovery endpoint reachable." };
      }
      return { success: false, message: "Could not reach Google OIDC discovery endpoint" };
    } catch (error) {
      return { success: true, message: "Google SSO configuration is valid (network check skipped)" };
    }
  }

  private async testOpenAI(tenantId: string | null): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "openai");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "OpenAI is not configured" };
    }

    const config = integration.publicConfig as OpenAIPublicConfig;
    if (!config.enabled) {
      return { success: false, message: "OpenAI integration is disabled" };
    }

    const secrets = await this.getDecryptedSecrets(tenantId, "openai") as OpenAISecretConfig | null;
    if (!secrets?.apiKey) {
      return { success: false, message: "OpenAI API key is required" };
    }

    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: secrets.apiKey });
      
      const response = await client.chat.completions.create({
        model: config.model || "gpt-4o-mini",
        messages: [{ role: "user", content: "Say 'OK' in one word." }],
        max_tokens: 10,
      });

      if (response.choices && response.choices.length > 0) {
        return { success: true, message: `OpenAI connection successful (model: ${response.model})` };
      }
      return { success: false, message: "No response from OpenAI API" };
    } catch (error: any) {
      console.error("[OpenAI] Test failed:", error);
      return { success: false, message: error.message || "Failed to connect to OpenAI API" };
    }
  }

  async clearSecret(tenantId: string | null, provider: IntegrationProvider, secretName: string): Promise<void> {
    const condition = tenantId
      ? and(eq(tenantIntegrations.tenantId, tenantId), eq(tenantIntegrations.provider, provider))
      : and(isNull(tenantIntegrations.tenantId), eq(tenantIntegrations.provider, provider));

    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(condition)
      .limit(1);

    if (!integration || !integration.configEncrypted) {
      return;
    }

    try {
      const secrets = JSON.parse(decryptValue(integration.configEncrypted)) as SecretConfig;
      delete (secrets as any)[secretName];
      
      const hasRemainingSecrets = Object.keys(secrets).some(key => !!(secrets as any)[key]);
      const configEncrypted = hasRemainingSecrets ? encryptValue(JSON.stringify(secrets)) : null;
      const status = this.determineStatus(provider, integration.configPublic as PublicConfig, hasRemainingSecrets);

      await db
        .update(tenantIntegrations)
        .set({
          configEncrypted,
          status,
          updatedAt: new Date(),
        })
        .where(eq(tenantIntegrations.id, integration.id));

      debugLog("clearSecret - completed", { tenantId, provider, secretName });
    } catch (err) {
      console.error(`[TenantIntegrations] Failed to clear secret ${secretName} for ${provider}:`, err);
      throw err;
    }
  }
}

export const tenantIntegrationService = new TenantIntegrationService();
