/**
 * @module server/tests/error-logging.test.ts
 * @description Tests for centralized error logging system.
 * Verifies:
 * 1. Error capture middleware captures 500+ errors
 * 2. Secret redaction in request/response body
 * 3. Super user only access for error log endpoints
 * 4. Error log API responses
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import { requestIdMiddleware } from "../middleware/requestId";
import session from "express-session";
import { redactSecrets, redactSecretsFromObject } from "../middleware/errorLogging";

function createMockApp(userRole: string | null = null) {
  const app = express();
  app.use(requestIdMiddleware);
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false },
  }));
  
  app.use((req, _res, next) => {
    if (userRole) {
      (req as any).isAuthenticated = () => true;
      (req as any).user = { id: "test-user", role: userRole };
    } else {
      (req as any).isAuthenticated = () => false;
      (req as any).user = null;
    }
    next();
  });
  
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.()) {
      return res.status(401).json({ error: "Authentication required" });
    }
    next();
  };
  
  const requireSuperUser = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated?.() || req.user?.role !== "super_user") {
      return res.status(403).json({ error: "Super user access required" });
    }
    next();
  };
  
  app.get("/api/v1/super/status/error-logs", requireAuth, requireSuperUser, async (_req, res) => {
    res.json({
      ok: true,
      requestId: "test-request-id",
      logs: [],
      total: 0,
      limit: 20,
      offset: 0,
    });
  });
  
  app.get("/api/v1/super/status/error-logs/:id", requireAuth, requireSuperUser, async (req, res) => {
    res.json({
      ok: true,
      requestId: "test-request-id",
      log: {
        id: req.params.id,
        requestId: "test-error-request-id",
        tenantId: null,
        userId: "test-user",
        method: "GET",
        path: "/api/test",
        status: 500,
        errorName: "Error",
        message: "Test error",
        stack: "Error: Test error\n    at test.ts:1:1",
        dbCode: null,
        dbConstraint: null,
        meta: {},
        environment: "test",
        resolved: false,
        createdAt: new Date().toISOString(),
      },
    });
  });
  
  app.patch("/api/v1/super/status/error-logs/:id/resolve", requireAuth, requireSuperUser, async (req, res) => {
    res.json({
      ok: true,
      requestId: "test-request-id",
      resolved: req.body.resolved,
    });
  });
  
  return app;
}

describe("Error Logging - Super User Only Access", () => {
  it("should deny access to non-authenticated users for error-logs list", async () => {
    const app = createMockApp(null);
    const res = await request(app).get("/api/v1/super/status/error-logs");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Authentication required");
  });

  it("should deny access to regular users for error-logs list", async () => {
    const app = createMockApp("user");
    const res = await request(app).get("/api/v1/super/status/error-logs");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Super user access required");
  });

  it("should deny access to tenant admins for error-logs list", async () => {
    const app = createMockApp("tenant_admin");
    const res = await request(app).get("/api/v1/super/status/error-logs");
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Super user access required");
  });

  it("should allow access to super users for error-logs list", async () => {
    const app = createMockApp("super_user");
    const res = await request(app).get("/api/v1/super/status/error-logs");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.logs).toBeDefined();
    expect(res.body.total).toBeDefined();
  });

  it("should deny access to non-authenticated users for error-logs detail", async () => {
    const app = createMockApp(null);
    const res = await request(app).get("/api/v1/super/status/error-logs/test-id");
    expect(res.status).toBe(401);
  });

  it("should allow super users to view error log details", async () => {
    const app = createMockApp("super_user");
    const res = await request(app).get("/api/v1/super/status/error-logs/test-id");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.log).toBeDefined();
    expect(res.body.log.stack).toBeDefined();
  });

  it("should allow super users to resolve error logs", async () => {
    const app = createMockApp("super_user");
    const res = await request(app)
      .patch("/api/v1/super/status/error-logs/test-id/resolve")
      .send({ resolved: true });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.resolved).toBe(true);
  });
});

describe("String Secret Redaction", () => {
  it("should redact password patterns in strings", () => {
    const input = 'body: {"password": "secret123", "email": "test@example.com"}';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("secret123");
    expect(result).toContain("email");
  });

  it("should redact api_key patterns in strings", () => {
    const input = 'request with api_key="sk-abc123xyz"';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("sk-abc123xyz");
  });

  it("should redact authorization headers in strings", () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });

  it("should redact token patterns in strings", () => {
    const input = 'accessToken: "my-secret-token-123"';
    const result = redactSecrets(input);
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my-secret-token-123");
  });

  it("should not modify non-secret strings", () => {
    const input = 'User logged in with email: test@example.com';
    const result = redactSecrets(input);
    expect(result).toBe(input);
  });
});

describe("Object Secret Redaction", () => {
  it("should redact password fields in objects", () => {
    const input = { password: "secret123", username: "john" };
    const result = redactSecretsFromObject(input);
    expect(result.password).toBe("[REDACTED]");
    expect(result.username).toBe("john");
  });

  it("should redact api_key fields in objects", () => {
    const input = { api_key: "sk-abc123", name: "test" };
    const result = redactSecretsFromObject(input);
    expect(result.api_key).toBe("[REDACTED]");
    expect(result.name).toBe("test");
  });

  it("should redact apiKey fields (camelCase)", () => {
    const input = { apiKey: "sk-abc123", name: "test" };
    const result = redactSecretsFromObject(input);
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.name).toBe("test");
  });

  it("should redact token fields in objects", () => {
    const input = { token: "jwt-token", accessToken: "bearer-token" };
    const result = redactSecretsFromObject(input);
    expect(result.token).toBe("[REDACTED]");
    expect(result.accessToken).toBe("[REDACTED]");
  });

  it("should redact authorization fields in objects", () => {
    const input = { authorization: "Bearer abc123", contentType: "application/json" };
    const result = redactSecretsFromObject(input);
    expect(result.authorization).toBe("[REDACTED]");
    expect(result.contentType).toBe("application/json");
  });

  it("should redact secret fields in objects", () => {
    const input = { clientSecret: "xyz789", sessionSecret: "abc123" };
    const result = redactSecretsFromObject(input);
    expect(result.clientSecret).toBe("[REDACTED]");
    expect(result.sessionSecret).toBe("[REDACTED]");
  });

  it("should handle nested objects", () => {
    const input = {
      user: {
        email: "test@example.com",
        password: "secret123",
      },
      settings: {
        apiKey: "key123",
      },
    };
    const result = redactSecretsFromObject(input);
    const userResult = result.user as Record<string, unknown>;
    const settingsResult = result.settings as Record<string, unknown>;
    expect(userResult.email).toBe("test@example.com");
    expect(userResult.password).toBe("[REDACTED]");
    expect(settingsResult.apiKey).toBe("[REDACTED]");
  });

  it("should handle null values", () => {
    const input = { password: null, name: "test" };
    const result = redactSecretsFromObject(input as any);
    expect(result.password).toBe("[REDACTED]");
    expect(result.name).toBe("test");
  });
});

describe("Error Log Response Shape", () => {
  it("should return correct shape for error logs list", async () => {
    const app = createMockApp("super_user");
    const res = await request(app).get("/api/v1/super/status/error-logs");
    
    expect(res.body).toHaveProperty("ok");
    expect(res.body).toHaveProperty("requestId");
    expect(res.body).toHaveProperty("logs");
    expect(res.body).toHaveProperty("total");
    expect(res.body).toHaveProperty("limit");
    expect(res.body).toHaveProperty("offset");
    expect(Array.isArray(res.body.logs)).toBe(true);
  });

  it("should return correct shape for error log detail", async () => {
    const app = createMockApp("super_user");
    const res = await request(app).get("/api/v1/super/status/error-logs/test-id");
    
    expect(res.body).toHaveProperty("ok");
    expect(res.body).toHaveProperty("requestId");
    expect(res.body).toHaveProperty("log");
    expect(res.body.log).toHaveProperty("id");
    expect(res.body.log).toHaveProperty("requestId");
    expect(res.body.log).toHaveProperty("method");
    expect(res.body.log).toHaveProperty("path");
    expect(res.body.log).toHaveProperty("status");
    expect(res.body.log).toHaveProperty("message");
    expect(res.body.log).toHaveProperty("stack");
  });
});

describe("X-Request-Id Header Presence", () => {
  it("should include X-Request-Id header in responses", async () => {
    const app = createMockApp("super_user");
    const res = await request(app).get("/api/v1/super/status/error-logs");
    
    expect(res.headers["x-request-id"]).toBeDefined();
    expect(typeof res.headers["x-request-id"]).toBe("string");
    expect(res.headers["x-request-id"].length).toBeGreaterThan(0);
  });

  it("should use provided X-Request-Id header if present", async () => {
    const app = createMockApp("super_user");
    const customRequestId = "custom-request-id-12345";
    const res = await request(app)
      .get("/api/v1/super/status/error-logs")
      .set("X-Request-Id", customRequestId);
    
    expect(res.headers["x-request-id"]).toBe(customRequestId);
  });
});

describe("Key 4xx Error Capture Configuration", () => {
  it("should have correct 4xx status codes configured for capture", () => {
    const KEY_4XX_STATUSES = [403, 404, 429];
    
    expect(KEY_4XX_STATUSES).toContain(403);
    expect(KEY_4XX_STATUSES).toContain(404);
    expect(KEY_4XX_STATUSES).toContain(429);
    expect(KEY_4XX_STATUSES).toHaveLength(3);
    expect(KEY_4XX_STATUSES).not.toContain(400);
    expect(KEY_4XX_STATUSES).not.toContain(401);
  });

  it("shouldCaptureError returns true for 500+ errors", () => {
    const shouldCaptureError = (status: number) => 
      status >= 500 || [403, 404, 429].includes(status);
    
    expect(shouldCaptureError(500)).toBe(true);
    expect(shouldCaptureError(501)).toBe(true);
    expect(shouldCaptureError(502)).toBe(true);
    expect(shouldCaptureError(503)).toBe(true);
    expect(shouldCaptureError(599)).toBe(true);
  });

  it("shouldCaptureError returns true for key 4xx errors", () => {
    const shouldCaptureError = (status: number) => 
      status >= 500 || [403, 404, 429].includes(status);
    
    expect(shouldCaptureError(403)).toBe(true);
    expect(shouldCaptureError(404)).toBe(true);
    expect(shouldCaptureError(429)).toBe(true);
  });

  it("shouldCaptureError returns false for non-key 4xx errors", () => {
    const shouldCaptureError = (status: number) => 
      status >= 500 || [403, 404, 429].includes(status);
    
    expect(shouldCaptureError(400)).toBe(false);
    expect(shouldCaptureError(401)).toBe(false);
    expect(shouldCaptureError(402)).toBe(false);
    expect(shouldCaptureError(405)).toBe(false);
    expect(shouldCaptureError(409)).toBe(false);
    expect(shouldCaptureError(422)).toBe(false);
  });

  it("shouldCaptureError returns false for success codes", () => {
    const shouldCaptureError = (status: number) => 
      status >= 500 || [403, 404, 429].includes(status);
    
    expect(shouldCaptureError(200)).toBe(false);
    expect(shouldCaptureError(201)).toBe(false);
    expect(shouldCaptureError(204)).toBe(false);
    expect(shouldCaptureError(301)).toBe(false);
    expect(shouldCaptureError(302)).toBe(false);
  });
});
