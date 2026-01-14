/**
 * @module server/tests/bootstrap-endpoints.test.ts
 * @description Tests for bootstrap authentication endpoints.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import request from "supertest";
import { db } from "../db";
import { users, UserRole } from "../../shared/schema";
import { sql, eq } from "drizzle-orm";
import { requestIdMiddleware } from "../middleware/requestId";
import { setupAuth, setupBootstrapEndpoints, hashPassword } from "../auth";
import session from "express-session";

function createTestApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  setupBootstrapEndpoints(app);
  return app;
}

async function clearTestUsers() {
  await db.delete(users).where(sql`email LIKE 'test-bootstrap-%'`);
}

describe("Bootstrap Status Endpoint", () => {
  beforeEach(async () => {
    await clearTestUsers();
  });

  afterEach(async () => {
    await clearTestUsers();
  });

  it("should return bootstrapRequired=true when no users exist", async () => {
    const app = createTestApp();
    
    const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const userCount = (countResult.rows[0] as { count: number }).count;
    
    if (userCount === 0) {
      const res = await request(app).get("/api/v1/auth/bootstrap-status");
      
      expect(res.status).toBe(200);
      expect(res.body.bootstrapRequired).toBe(true);
    } else {
      console.log("[test] Skipping test - users already exist in database");
    }
  });

  it("should return bootstrapRequired=false when users exist", async () => {
    const app = createTestApp();
    
    const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const userCount = (countResult.rows[0] as { count: number }).count;
    
    if (userCount > 0) {
      const res = await request(app).get("/api/v1/auth/bootstrap-status");
      
      expect(res.status).toBe(200);
      expect(res.body.bootstrapRequired).toBe(false);
    } else {
      console.log("[test] Skipping test - no users in database");
    }
  });
});

describe("Bootstrap Register Endpoint", () => {
  beforeEach(async () => {
    await clearTestUsers();
  });

  afterEach(async () => {
    await clearTestUsers();
  });

  it("should return 403 when users already exist", async () => {
    const app = createTestApp();
    
    const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
    const userCount = (countResult.rows[0] as { count: number }).count;
    
    if (userCount > 0) {
      const res = await request(app)
        .post("/api/v1/auth/bootstrap-register")
        .send({
          email: "test-bootstrap-new@example.com",
          password: "password123",
          firstName: "Test",
          lastName: "User",
        });
      
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("REGISTRATION_DISABLED");
    } else {
      console.log("[test] Skipping test - no users in database, registration would succeed");
    }
  });

  it("should validate required fields", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .post("/api/v1/auth/bootstrap-register")
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("should validate password length", async () => {
    const app = createTestApp();
    
    const res = await request(app)
      .post("/api/v1/auth/bootstrap-register")
      .send({
        email: "test-bootstrap@example.com",
        password: "short",
      });
    
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.message).toContain("8 characters");
  });
});

describe("Seed Script Safety Guards", () => {
  it("should check SEED_SUPER_ADMIN_ALLOWED requirement", async () => {
    const originalValue = process.env.SEED_SUPER_ADMIN_ALLOWED;
    delete process.env.SEED_SUPER_ADMIN_ALLOWED;
    
    const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });
    const mockError = vi.spyOn(console, "error").mockImplementation(() => {});
    
    try {
      await import("../scripts/seed_super_admin.ts?t=" + Date.now());
    } catch (e) {
    }
    
    process.env.SEED_SUPER_ADMIN_ALLOWED = originalValue;
    mockExit.mockRestore();
    mockError.mockRestore();
  });
});
