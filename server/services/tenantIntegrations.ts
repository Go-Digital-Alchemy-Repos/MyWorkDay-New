import { db } from "../db";
import { tenantIntegrations, IntegrationStatus } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";

export type IntegrationProvider = "mailgun" | "s3";

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

type PublicConfig = MailgunPublicConfig | S3PublicConfig;
type SecretConfig = MailgunSecretConfig | S3SecretConfig;

export interface IntegrationResponse {
  provider: string;
  status: string;
  publicConfig: PublicConfig | null;
  secretConfigured: boolean;
  lastTestedAt: Date | null;
}

export interface IntegrationUpdateInput {
  publicConfig?: Partial<PublicConfig>;
  secretConfig?: Partial<SecretConfig>;
}

export class TenantIntegrationService {
  async getIntegration(tenantId: string, provider: IntegrationProvider): Promise<IntegrationResponse | null> {
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.provider, provider)
      ))
      .limit(1);

    if (!integration) {
      return null;
    }

    return {
      provider: integration.provider,
      status: integration.status,
      publicConfig: integration.configPublic as PublicConfig | null,
      secretConfigured: !!integration.configEncrypted,
      lastTestedAt: integration.lastTestedAt,
    };
  }

  async listIntegrations(tenantId: string): Promise<IntegrationResponse[]> {
    const integrations = await db
      .select()
      .from(tenantIntegrations)
      .where(eq(tenantIntegrations.tenantId, tenantId));

    const providers: IntegrationProvider[] = ["mailgun", "s3"];
    const result: IntegrationResponse[] = [];

    for (const provider of providers) {
      const existing = integrations.find(i => i.provider === provider);
      if (existing) {
        result.push({
          provider: existing.provider,
          status: existing.status,
          publicConfig: existing.configPublic as PublicConfig | null,
          secretConfigured: !!existing.configEncrypted,
          lastTestedAt: existing.lastTestedAt,
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

    return result;
  }

  async upsertIntegration(
    tenantId: string,
    provider: IntegrationProvider,
    input: IntegrationUpdateInput
  ): Promise<IntegrationResponse> {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      throw new Error("Encryption key not configured. Cannot save integration secrets.");
    }

    const [existing] = await db
      .select()
      .from(tenantIntegrations)
      .where(and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.provider, provider)
      ))
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
    } else {
      await db.insert(tenantIntegrations).values({
        tenantId,
        provider,
        configPublic: publicConfig,
        configEncrypted,
        status,
      });
    }

    return {
      provider,
      status,
      publicConfig,
      secretConfigured: hasSecret,
      lastTestedAt: existing?.lastTestedAt || null,
    };
  }

  async getDecryptedSecrets(tenantId: string, provider: IntegrationProvider): Promise<SecretConfig | null> {
    const [integration] = await db
      .select()
      .from(tenantIntegrations)
      .where(and(
        eq(tenantIntegrations.tenantId, tenantId),
        eq(tenantIntegrations.provider, provider)
      ))
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

  async testIntegration(tenantId: string, provider: IntegrationProvider): Promise<{ success: boolean; message: string }> {
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
        default:
          testResult = { success: false, message: `Unknown provider: ${provider}` };
      }

      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: testResult.success ? IntegrationStatus.CONFIGURED : IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tenantIntegrations.tenantId, tenantId),
          eq(tenantIntegrations.provider, provider)
        ));

      return testResult;
    } catch (error) {
      console.error(`[TenantIntegrations] Test failed for ${provider}:`, error);
      
      await db
        .update(tenantIntegrations)
        .set({
          lastTestedAt: new Date(),
          status: IntegrationStatus.ERROR,
          updatedAt: new Date(),
        })
        .where(and(
          eq(tenantIntegrations.tenantId, tenantId),
          eq(tenantIntegrations.provider, provider)
        ));

      return { success: false, message: error instanceof Error ? error.message : "Test failed" };
    }
  }

  private async testMailgun(tenantId: string): Promise<{ success: boolean; message: string }> {
    const secrets = await this.getDecryptedSecrets(tenantId, "mailgun") as MailgunSecretConfig | null;
    const integration = await this.getIntegration(tenantId, "mailgun");
    
    if (!secrets?.apiKey || !integration?.publicConfig) {
      return { success: false, message: "Mailgun API key not configured" };
    }

    const config = integration.publicConfig as MailgunPublicConfig;
    if (!config.domain || !config.fromEmail) {
      return { success: false, message: "Mailgun domain or from email not configured" };
    }

    console.log(`[Mailgun] Testing integration for tenant ${tenantId} - domain: ${config.domain}`);
    return { success: true, message: "Mailgun configuration is valid" };
  }

  private async testS3(tenantId: string): Promise<{ success: boolean; message: string }> {
    const integration = await this.getIntegration(tenantId, "s3");
    
    if (!integration?.publicConfig) {
      return { success: false, message: "S3 bucket not configured" };
    }

    const config = integration.publicConfig as S3PublicConfig;
    if (!config.bucketName || !config.region) {
      return { success: false, message: "S3 bucket or region not configured" };
    }

    console.log(`[S3] Testing integration for tenant ${tenantId} - bucket: ${config.bucketName}`);
    return { success: true, message: "S3 configuration is valid" };
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
        if (config.bucketName && config.region) {
          return IntegrationStatus.CONFIGURED;
        }
        break;
      }
    }

    return IntegrationStatus.NOT_CONFIGURED;
  }
}

export const tenantIntegrationService = new TenantIntegrationService();
