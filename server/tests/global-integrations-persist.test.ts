import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { systemSettings, users, UserRole } from "../../shared/schema";
import { eq } from "drizzle-orm";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";
import request from "supertest";
import { createTestApp } from "../test-app";
import { hashPassword } from "../auth";
import type { Express } from "express";

const testSuperUserId = "test-super-user-gi-1";
const testSuperUserEmail = "super-gi@test.com";

describe("Global Integrations - Persistence and Secret Masking", () => {
  let app: Express;
  let authCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    await db.delete(users).where(eq(users.id, testSuperUserId));
    
    const passwordHash = await hashPassword("testpass123");
    await db.insert(users).values({
      id: testSuperUserId,
      email: testSuperUserEmail,
      name: "Test Super User",
      passwordHash,
      role: UserRole.SUPER_USER,
      tenantId: null,
      isActive: true,
    });

    const loginResponse = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: testSuperUserEmail, password: "testpass123" });
    
    authCookie = loginResponse.headers["set-cookie"]?.[0] || "";
    expect(authCookie).toBeTruthy();
  });

  afterAll(async () => {
    await db.update(systemSettings).set({
      mailgunDomain: null,
      mailgunFromEmail: null,
      mailgunRegion: null,
      mailgunApiKeyEncrypted: null,
      mailgunSigningKeyEncrypted: null,
      mailgunLastTestedAt: null,
      s3Region: null,
      s3BucketName: null,
      s3PublicBaseUrl: null,
      s3CloudfrontUrl: null,
      s3AccessKeyIdEncrypted: null,
      s3SecretAccessKeyEncrypted: null,
      s3LastTestedAt: null,
    }).where(eq(systemSettings.id, 1));
    
    await db.delete(users).where(eq(users.id, testSuperUserId));
  });

  describe("Mailgun Settings", () => {
    it("saves Mailgun config and persists to database", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/mailgun")
        .set("Cookie", authCookie)
        .send({
          domain: "mg.test.com",
          fromEmail: "noreply@test.com",
          region: "US",
          apiKey: "test-api-key-1234567890",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const [settings] = await db.select().from(systemSettings).limit(1);
      expect(settings).not.toBeNull();
      expect(settings.mailgunDomain).toBe("mg.test.com");
      expect(settings.mailgunFromEmail).toBe("noreply@test.com");
      expect(settings.mailgunRegion).toBe("US");
      expect(settings.mailgunApiKeyEncrypted).toBeTruthy();
    });

    it("retrieves Mailgun config with masked secrets", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", authCookie);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("configured");
      expect(response.body.config.domain).toBe("mg.test.com");
      expect(response.body.config.fromEmail).toBe("noreply@test.com");
      expect(response.body.secretMasked.apiKeyMasked).toMatch(/^••••.{4}$/);
      expect(response.body.secretMasked.apiKeyMasked).toBe("••••7890");
    });

    it("does not expose actual secret value in response", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", authCookie);

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain("test-api-key-1234567890");
    });

    it("clears Mailgun API key secret", async () => {
      const clearResponse = await request(app)
        .delete("/api/v1/super/integrations/mailgun/secret/apiKey")
        .set("Cookie", authCookie);

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body.success).toBe(true);

      const getResponse = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", authCookie);

      expect(getResponse.body.secretMasked.apiKeyMasked).toBeNull();
    });
  });

  describe("S3 Settings", () => {
    it("saves S3 config and persists to database", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/s3")
        .set("Cookie", authCookie)
        .send({
          region: "us-west-2",
          bucketName: "test-bucket",
          publicBaseUrl: "https://test-bucket.s3.amazonaws.com",
          accessKeyId: "AKIATEST1234567890AB",
          secretAccessKey: "secretkey1234567890abcdefghij",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const [settings] = await db.select().from(systemSettings).limit(1);
      expect(settings).not.toBeNull();
      expect(settings.s3Region).toBe("us-west-2");
      expect(settings.s3BucketName).toBe("test-bucket");
      expect(settings.s3AccessKeyIdEncrypted).toBeTruthy();
      expect(settings.s3SecretAccessKeyEncrypted).toBeTruthy();
    });

    it("retrieves S3 config with masked secrets", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", authCookie);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe("configured");
      expect(response.body.config.region).toBe("us-west-2");
      expect(response.body.config.bucketName).toBe("test-bucket");
      expect(response.body.secretMasked.accessKeyIdMasked).toMatch(/^••••.{4}$/);
      expect(response.body.secretMasked.secretAccessKeyMasked).toMatch(/^••••.{4}$/);
    });

    it("does not expose actual S3 secret values in response", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", authCookie);

      expect(response.status).toBe(200);
      expect(JSON.stringify(response.body)).not.toContain("AKIATEST1234567890AB");
      expect(JSON.stringify(response.body)).not.toContain("secretkey1234567890abcdefghij");
    });

    it("clears S3 secret access key", async () => {
      const clearResponse = await request(app)
        .delete("/api/v1/super/integrations/s3/secret/secretAccessKey")
        .set("Cookie", authCookie);

      expect(clearResponse.status).toBe(200);
      expect(clearResponse.body.success).toBe(true);

      const getResponse = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", authCookie);

      expect(getResponse.body.secretMasked.secretAccessKeyMasked).toBeNull();
    });
  });

  describe("Integration Status", () => {
    it("reports correct integration status", async () => {
      await request(app)
        .put("/api/v1/super/integrations/mailgun")
        .set("Cookie", authCookie)
        .send({
          domain: "mg.status.com",
          fromEmail: "test@status.com",
          region: "EU",
          apiKey: "status-api-key",
        });

      await request(app)
        .put("/api/v1/super/integrations/s3")
        .set("Cookie", authCookie)
        .send({
          region: "eu-west-1",
          bucketName: "status-bucket",
          accessKeyId: "AKIASTATUS",
          secretAccessKey: "statussecret",
        });

      const response = await request(app)
        .get("/api/v1/super/integrations/status")
        .set("Cookie", authCookie);

      expect(response.status).toBe(200);
      expect(response.body.mailgun).toBe(true);
      expect(response.body.s3).toBe(true);
    });
  });
});
