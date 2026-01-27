import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { users, tenants, UserRole, TenantStatus } from "../../shared/schema";
import { eq } from "drizzle-orm";
import request from "supertest";
import { createTestApp } from "../test-app";
import { hashPassword } from "../auth";
import type { Express } from "express";

const testSuperUserId = "test-super-soi-1";
const testAdminUserId = "test-admin-soi-1";
const testEmployeeUserId = "test-emp-soi-1";
const testTenantId = "test-tenant-soi-1";

describe("Global Integrations - Super User Only Access", () => {
  let app: Express;
  let superAuthCookie: string;
  let adminAuthCookie: string;
  let employeeAuthCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    await db.delete(users).where(eq(users.id, testSuperUserId));
    await db.delete(users).where(eq(users.id, testAdminUserId));
    await db.delete(users).where(eq(users.id, testEmployeeUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));

    await db.insert(tenants).values({
      id: testTenantId,
      name: "Test Tenant SOI",
      slug: "test-tenant-soi",
      status: TenantStatus.ACTIVE,
    });

    const passwordHash = await hashPassword("testpass123");
    
    await db.insert(users).values([
      {
        id: testSuperUserId,
        email: "super-soi@test.com",
        name: "Super User SOI",
        passwordHash,
        role: UserRole.SUPER_USER,
        tenantId: null,
        isActive: true,
      },
      {
        id: testAdminUserId,
        email: "admin-soi@test.com",
        name: "Admin User SOI",
        passwordHash,
        role: UserRole.ADMIN,
        tenantId: testTenantId,
        isActive: true,
      },
      {
        id: testEmployeeUserId,
        email: "employee-soi@test.com",
        name: "Employee User SOI",
        passwordHash,
        role: UserRole.EMPLOYEE,
        tenantId: testTenantId,
        isActive: true,
      },
    ]);

    const superLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "super-soi@test.com", password: "testpass123" });
    superAuthCookie = superLogin.headers["set-cookie"]?.[0] || "";

    const adminLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "admin-soi@test.com", password: "testpass123" });
    adminAuthCookie = adminLogin.headers["set-cookie"]?.[0] || "";

    const employeeLogin = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "employee-soi@test.com", password: "testpass123" });
    employeeAuthCookie = employeeLogin.headers["set-cookie"]?.[0] || "";
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, testSuperUserId));
    await db.delete(users).where(eq(users.id, testAdminUserId));
    await db.delete(users).where(eq(users.id, testEmployeeUserId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  describe("Mailgun Endpoints", () => {
    it("allows super user to GET Mailgun settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", superAuthCookie);

      expect(response.status).toBe(200);
    });

    it("denies admin user from GET Mailgun settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies employee user from GET Mailgun settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun")
        .set("Cookie", employeeAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies unauthenticated request to GET Mailgun settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/mailgun");

      expect(response.status).toBe(401);
    });

    it("allows super user to PUT Mailgun settings", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/mailgun")
        .set("Cookie", superAuthCookie)
        .send({ domain: "test.com" });

      expect(response.status).toBe(200);
    });

    it("denies admin user from PUT Mailgun settings", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/mailgun")
        .set("Cookie", adminAuthCookie)
        .send({ domain: "test.com" });

      expect(response.status).toBe(403);
    });

    it("denies admin user from testing Mailgun", async () => {
      const response = await request(app)
        .post("/api/v1/super/integrations/mailgun/test")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies admin user from sending test email", async () => {
      const response = await request(app)
        .post("/api/v1/super/integrations/mailgun/send-test-email")
        .set("Cookie", adminAuthCookie)
        .send({ toEmail: "test@test.com" });

      expect(response.status).toBe(403);
    });

    it("denies admin user from clearing Mailgun secrets", async () => {
      const response = await request(app)
        .delete("/api/v1/super/integrations/mailgun/secret/apiKey")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });
  });

  describe("S3 Endpoints", () => {
    it("allows super user to GET S3 settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", superAuthCookie);

      expect(response.status).toBe(200);
    });

    it("denies admin user from GET S3 settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies employee user from GET S3 settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3")
        .set("Cookie", employeeAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies unauthenticated request to GET S3 settings", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/s3");

      expect(response.status).toBe(401);
    });

    it("allows super user to PUT S3 settings", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/s3")
        .set("Cookie", superAuthCookie)
        .send({ region: "us-east-1" });

      expect(response.status).toBe(200);
    });

    it("denies admin user from PUT S3 settings", async () => {
      const response = await request(app)
        .put("/api/v1/super/integrations/s3")
        .set("Cookie", adminAuthCookie)
        .send({ region: "us-east-1" });

      expect(response.status).toBe(403);
    });

    it("denies admin user from testing S3", async () => {
      const response = await request(app)
        .post("/api/v1/super/integrations/s3/test")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });

    it("denies admin user from clearing S3 secrets", async () => {
      const response = await request(app)
        .delete("/api/v1/super/integrations/s3/secret/accessKeyId")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });
  });

  describe("Integration Status Endpoint", () => {
    it("allows super user to GET integration status", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/status")
        .set("Cookie", superAuthCookie);

      expect(response.status).toBe(200);
    });

    it("denies admin user from GET integration status", async () => {
      const response = await request(app)
        .get("/api/v1/super/integrations/status")
        .set("Cookie", adminAuthCookie);

      expect(response.status).toBe(403);
    });
  });
});
