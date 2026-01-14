import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { db } from "../db";
import { users, UserRole } from "../../shared/schema";
import { sql, eq } from "drizzle-orm";
import { hashPassword } from "../auth";

// Store original env values
const originalEnv = { ...process.env };

describe("Purge Endpoint Guards", () => {
  let app: ReturnType<typeof express>;
  let superUserCookie: string;

  beforeEach(async () => {
    // Reset env to original
    process.env = { ...originalEnv };
    
    // Clean users table
    await db.execute(sql`DELETE FROM users`);
    
    // Create a super user for testing
    const passwordHash = await hashPassword("testpassword123");
    await db.insert(users).values({
      email: "superadmin@test.com",
      name: "Super Admin",
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
    });

    // Create app with routes
    app = express();
    app.use(express.json());
    
    const { setupAuth } = await import("../auth");
    setupAuth(app as any);
    
    const superAdminRoutes = (await import("../routes/superAdmin")).default;
    app.use("/api/v1/super", superAdminRoutes);

    // Login to get session cookie
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "superadmin@test.com", password: "testpassword123" });
    
    superUserCookie = loginRes.headers["set-cookie"]?.[0] || "";
  });

  afterEach(async () => {
    process.env = { ...originalEnv };
    await db.execute(sql`DELETE FROM users`);
  });

  it("should reject purge without PURGE_APP_DATA_ALLOWED", async () => {
    delete process.env.PURGE_APP_DATA_ALLOWED;
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("not allowed");
  });

  it("should reject purge without X-Confirm-Purge header", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("confirmation");
  });

  it("should reject purge with wrong confirmation phrase", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "wrong_phrase");

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("confirmation");
  });

  it("should reject purge in production without PURGE_PROD_ALLOWED", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    process.env.NODE_ENV = "production";
    delete process.env.PURGE_PROD_ALLOWED;
    
    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", superUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
    expect(response.body.error).toContain("production");
  });

  it("should reject purge from non-super-user", async () => {
    process.env.PURGE_APP_DATA_ALLOWED = "true";
    
    // Create a regular user
    const passwordHash = await hashPassword("regularpassword");
    await db.insert(users).values({
      email: "regular@test.com",
      name: "Regular User",
      passwordHash,
      role: UserRole.EMPLOYEE,
      isActive: true,
    });

    // Login as regular user
    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "regular@test.com", password: "regularpassword" });
    
    const regularUserCookie = loginRes.headers["set-cookie"]?.[0] || "";

    const response = await request(app)
      .post("/api/v1/super/system/purge-app-data")
      .set("Cookie", regularUserCookie)
      .set("X-Confirm-Purge", "YES_PURGE_APP_DATA");

    expect(response.status).toBe(403);
  });
});

describe("Purge Script Guards", () => {
  it("should have correct environment variable requirements documented", () => {
    // This test verifies the script exists and has proper guards
    // The actual script testing is done via integration tests
    const fs = require("fs");
    const scriptPath = "server/scripts/purge_app_data.ts";
    
    expect(fs.existsSync(scriptPath)).toBe(true);
    
    const content = fs.readFileSync(scriptPath, "utf-8");
    
    // Verify safety guards are documented
    expect(content).toContain("PURGE_APP_DATA_ALLOWED");
    expect(content).toContain("PURGE_APP_DATA_CONFIRM");
    expect(content).toContain("PURGE_PROD_ALLOWED");
    expect(content).toContain("YES_PURGE_APP_DATA");
  });
});
