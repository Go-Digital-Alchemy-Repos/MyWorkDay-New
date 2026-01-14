import { describe, it, expect, beforeAll, afterAll, vi, beforeEach, afterEach } from "vitest";
import { TenantIntegrationService } from "../services/tenantIntegrations";
import { db } from "../db";
import { tenantIntegrations, tenants, users, TenantStatus, UserRole, IntegrationStatus } from "../../shared/schema";
import { eq, and } from "drizzle-orm";

const testTenant1Id = "test-tenant-int-1";
const testTenant2Id = "test-tenant-int-2";
const testUserId = "test-user-int-1";

describe("Tenant Integrations", () => {
  let service: TenantIntegrationService;

  beforeAll(async () => {
    service = new TenantIntegrationService();
    
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
    await db.delete(users).where(eq(users.id, testUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenant1Id));
    await db.delete(tenants).where(eq(tenants.id, testTenant2Id));
    
    await db.insert(tenants).values([
      {
        id: testTenant1Id,
        name: "Test Tenant 1",
        slug: "test-tenant-int-1",
        status: TenantStatus.ACTIVE,
      },
      {
        id: testTenant2Id,
        name: "Test Tenant 2",
        slug: "test-tenant-int-2",
        status: TenantStatus.ACTIVE,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
    await db.delete(tenants).where(eq(tenants.id, testTenant1Id));
    await db.delete(tenants).where(eq(tenants.id, testTenant2Id));
  });

  beforeEach(async () => {
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant1Id)
    );
    await db.delete(tenantIntegrations).where(
      eq(tenantIntegrations.tenantId, testTenant2Id)
    );
  });

  describe("Save and reload integration", () => {
    it("saves Mailgun config and reloads with public config", async () => {
      const publicConfig = {
        domain: "mg.example.com",
        fromEmail: "noreply@example.com",
        replyTo: "support@example.com",
      };

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig,
        secretConfig: { apiKey: "test-api-key-123" },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(reloaded).not.toBeNull();
      expect(reloaded!.provider).toBe("mailgun");
      expect(reloaded!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(reloaded!.publicConfig).toEqual(publicConfig);
      expect(reloaded!.secretConfigured).toBe(true);
    });

    it("saves S3 config and reloads with public config", async () => {
      const publicConfig = {
        bucketName: "my-bucket",
        region: "us-east-1",
        keyPrefixTemplate: "tenants/{tenantId}/",
      };

      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig,
        secretConfig: { accessKeyId: "AKIATEST", secretAccessKey: "secret123" },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "s3");
      
      expect(reloaded).not.toBeNull();
      expect(reloaded!.provider).toBe("s3");
      expect(reloaded!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(reloaded!.publicConfig).toEqual(publicConfig);
      expect(reloaded!.secretConfigured).toBe(true);
    });

    it("updates existing integration without losing data", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "mg1.example.com",
          fromEmail: "old@example.com",
        },
        secretConfig: { apiKey: "old-key" },
      });

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "mg2.example.com",
          fromEmail: "new@example.com",
        },
      });

      const reloaded = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(reloaded!.publicConfig).toEqual({
        domain: "mg2.example.com",
        fromEmail: "new@example.com",
      });
      expect(reloaded!.secretConfigured).toBe(true);
    });
  });

  describe("Tenant isolation", () => {
    it("tenant 1 cannot see tenant 2's integrations", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "tenant1.example.com",
          fromEmail: "t1@example.com",
        },
        secretConfig: { apiKey: "tenant1-key" },
      });

      await service.upsertIntegration(testTenant2Id, "mailgun", {
        publicConfig: {
          domain: "tenant2.example.com",
          fromEmail: "t2@example.com",
        },
        secretConfig: { apiKey: "tenant2-key" },
      });

      const tenant1Integration = await service.getIntegration(testTenant1Id, "mailgun");
      const tenant2Integration = await service.getIntegration(testTenant2Id, "mailgun");
      
      expect(tenant1Integration!.publicConfig).toEqual({
        domain: "tenant1.example.com",
        fromEmail: "t1@example.com",
      });
      expect(tenant2Integration!.publicConfig).toEqual({
        domain: "tenant2.example.com",
        fromEmail: "t2@example.com",
      });

      expect(tenant1Integration!.publicConfig).not.toEqual(tenant2Integration!.publicConfig);
    });

    it("lists only integrations for the specified tenant", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "tenant1.example.com",
          fromEmail: "t1@example.com",
        },
        secretConfig: { apiKey: "tenant1-mailgun-key" },
      });

      await service.upsertIntegration(testTenant2Id, "s3", {
        publicConfig: {
          bucketName: "tenant2-bucket",
          region: "eu-west-1",
          keyPrefixTemplate: "t2/",
        },
      });

      const tenant1List = await service.listIntegrations(testTenant1Id);
      const tenant2List = await service.listIntegrations(testTenant2Id);
      
      const tenant1Mailgun = tenant1List.find(i => i.provider === "mailgun");
      const tenant1S3 = tenant1List.find(i => i.provider === "s3");
      const tenant2Mailgun = tenant2List.find(i => i.provider === "mailgun");
      const tenant2S3 = tenant2List.find(i => i.provider === "s3");

      expect(tenant1Mailgun!.status).toBe(IntegrationStatus.CONFIGURED);
      expect(tenant1S3!.status).toBe(IntegrationStatus.NOT_CONFIGURED);
      expect(tenant2Mailgun!.status).toBe(IntegrationStatus.NOT_CONFIGURED);
      expect(tenant2S3!.status).toBe(IntegrationStatus.CONFIGURED);
    });

    it("returns null for non-existent tenant integration", async () => {
      const result = await service.getIntegration("non-existent-tenant", "mailgun");
      expect(result).toBeNull();
    });
  });

  describe("Integration status", () => {
    it("returns not_configured for new tenants", async () => {
      const integrations = await service.listIntegrations(testTenant1Id);
      
      for (const integration of integrations) {
        expect(integration.status).toBe(IntegrationStatus.NOT_CONFIGURED);
        expect(integration.publicConfig).toBeNull();
        expect(integration.secretConfigured).toBe(false);
      }
    });

    it("sets configured status when integration is saved with required fields", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "test.example.com",
          fromEmail: "test@example.com",
        },
        secretConfig: { apiKey: "test-api-key" },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      expect(integration!.status).toBe(IntegrationStatus.CONFIGURED);
    });

    it("S3 is configured without secret (uses IAM)", async () => {
      await service.upsertIntegration(testTenant1Id, "s3", {
        publicConfig: {
          bucketName: "test-bucket",
          region: "us-east-1",
          keyPrefixTemplate: "test/",
        },
      });

      const integration = await service.getIntegration(testTenant1Id, "s3");
      expect(integration!.status).toBe(IntegrationStatus.CONFIGURED);
    });
  });

  describe("Secret handling", () => {
    it("does not expose secrets in response", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "test.example.com",
          fromEmail: "test@example.com",
        },
        secretConfig: { apiKey: "super-secret-key" },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      
      expect(integration!.secretConfigured).toBe(true);
      expect((integration!.publicConfig as any).apiKey).toBeUndefined();
      expect((integration as any).secretConfig).toBeUndefined();
      expect((integration as any).configEncrypted).toBeUndefined();
    });

    it("preserves existing secret when updating public config only", async () => {
      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "old.example.com",
          fromEmail: "old@example.com",
        },
        secretConfig: { apiKey: "my-secret-key" },
      });

      await service.upsertIntegration(testTenant1Id, "mailgun", {
        publicConfig: {
          domain: "new.example.com",
          fromEmail: "new@example.com",
        },
      });

      const integration = await service.getIntegration(testTenant1Id, "mailgun");
      expect(integration!.secretConfigured).toBe(true);
      expect((integration!.publicConfig as any).domain).toBe("new.example.com");
    });
  });
});
