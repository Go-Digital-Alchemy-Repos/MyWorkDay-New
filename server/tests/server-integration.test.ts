/**
 * Server Integration Tests
 * 
 * Purpose: Verify core server functionality including:
 * - Health and ready endpoints (real app endpoints)
 * - Authentication protection on API endpoints (real requireAuth middleware)
 * - Input validation and error shape consistency (real validateBody + errorHandler)
 * 
 * These tests use supertest against real app endpoints where possible,
 * and test harness for isolated unit tests of middleware behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import { z } from "zod";
import { isDatabaseAvailable, resetTestApp } from "./server-harness";
import { requestIdMiddleware } from "../middleware/requestId";
import { validateBody } from "../middleware/validate";
import { errorHandler } from "../middleware/errorHandler";

describe("Server Integration Tests", () => {
  let dbAvailable: boolean;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
  });

  afterAll(() => {
    resetTestApp();
  });

  describe("Health Endpoints (Real App)", () => {
    it("GET /health returns 200 with ok:true", async () => {
      // Test against real running server
      const res = await request("http://localhost:5000").get("/health");
      
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("ok", true);
      expect(res.body).toHaveProperty("timestamp");
    });

    it("GET /healthz returns 200 with 'ok' text", async () => {
      const res = await request("http://localhost:5000").get("/healthz");
      
      expect(res.status).toBe(200);
      expect(res.text).toBe("ok");
    });

    it("GET /ready returns status with database and schema checks", async () => {
      const res = await request("http://localhost:5000").get("/ready");
      
      // Response includes checks object with all three checks
      expect(res.body).toHaveProperty("status");
      expect(res.body).toHaveProperty("checks");
      expect(res.body.checks).toHaveProperty("startup");
      expect(res.body.checks).toHaveProperty("database");
      expect(res.body.checks).toHaveProperty("schema");
      
      if (dbAvailable) {
        expect(res.status).toBe(200);
        expect(res.body.status).toBe("ready");
        expect(res.body.checks.database).toBe(true);
        expect(res.body.checks.schema).toBe(true);
      }
    });
  });
});

describe("Authentication Protection (Real App)", () => {
  it("unauthenticated access returns 401 for protected /api endpoints", async () => {
    // Test real API endpoint without auth cookie
    const res = await request("http://localhost:5000")
      .get("/api/projects")
      .set("Accept", "application/json");
    
    // Real app should return 401 for unauthenticated requests
    expect(res.status).toBe(401);
    
    // Verify error response (requireAuth uses simple error format)
    expect(res.body).toHaveProperty("error", "Authentication required");
  });

  it("unauthenticated POST returns 401 with error message", async () => {
    const res = await request("http://localhost:5000")
      .post("/api/tasks/personal")
      .send({ title: "Test Task" })
      .set("Content-Type", "application/json");
    
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty("error", "Authentication required");
  });
});

describe("Input Validation and Error Shape (Real Middleware)", () => {
  let app: Express;

  beforeAll(async () => {
    // Create minimal app with REAL middleware stack
    app = express();
    app.use(express.json());
    app.use(requestIdMiddleware);
    
    // Mock auth for this test
    app.use((req: any, res: Response, next: NextFunction) => {
      req.user = { id: "test-user", tenantId: "test-tenant" };
      req.isAuthenticated = () => true;
      next();
    });
    
    // Define schema matching time entry validation
    const timeEntrySchema = z.object({
      startTime: z.string().datetime({ message: "startTime must be a valid ISO datetime" }),
      endTime: z.string().datetime({ message: "endTime must be a valid ISO datetime" }),
      description: z.string().min(1, "description is required").max(500),
      clientId: z.string().uuid().optional(),
      projectId: z.string().uuid().optional(),
    });
    
    // Endpoint using REAL validateBody middleware
    app.post(
      "/api/v1/test-time-entries",
      validateBody(timeEntrySchema),
      (req: any, res) => {
        res.status(201).json({ id: "created", ...req.body });
      }
    );
    
    // REAL error handler
    app.use(errorHandler);
  });

  it("validation error returns standard error envelope", async () => {
    const res = await request(app)
      .post("/api/v1/test-time-entries")
      .send({
        startTime: "not-a-date",
        description: "",
      });
    
    expect(res.status).toBe(400);
    
    // Verify REAL error handler envelope structure
    expect(res.body).toHaveProperty("ok", false);
    expect(res.body).toHaveProperty("requestId");
    expect(res.body).toHaveProperty("error");
    expect(res.body.error).toHaveProperty("code", "VALIDATION_ERROR");
    expect(res.body.error).toHaveProperty("message", "Validation failed");
    expect(res.body.error).toHaveProperty("status", 400);
    expect(res.body.error).toHaveProperty("requestId");
    expect(res.body.error).toHaveProperty("details");
    
    // Legacy compatibility fields
    expect(res.body).toHaveProperty("message", "Validation failed");
    expect(res.body).toHaveProperty("code", "VALIDATION_ERROR");
    expect(res.body).toHaveProperty("details");
    
    // Details should contain field-level errors
    const details = res.body.error.details as Array<{ path: string; message: string }>;
    expect(Array.isArray(details)).toBe(true);
    const paths = details.map(d => d.path);
    expect(paths).toContain("startTime");
    expect(paths).toContain("endTime");
    expect(paths).toContain("description");
  });

  it("requestId is included in all error responses", async () => {
    const res = await request(app)
      .post("/api/v1/test-time-entries")
      .send({});
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("requestId");
    expect(typeof res.body.requestId).toBe("string");
    expect(res.body.requestId.length).toBeGreaterThan(0);
    
    // requestId also in nested error object
    expect(res.body.error.requestId).toBe(res.body.requestId);
  });

  it("valid input returns 201 success", async () => {
    const validEntry = {
      startTime: new Date().toISOString(),
      endTime: new Date(Date.now() + 3600000).toISOString(),
      description: "Test time entry",
    };
    
    const res = await request(app)
      .post("/api/v1/test-time-entries")
      .send(validEntry);
    
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id", "created");
    expect(res.body).toHaveProperty("description", "Test time entry");
  });
});
