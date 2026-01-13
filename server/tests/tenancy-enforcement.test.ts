import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { UserRole } from "../../shared/schema";
import { 
  tenantContextMiddleware, 
  getEffectiveTenantId,
  requireTenantContext 
} from "../middleware/tenantContext";
import {
  validateTenantOwnership,
  getTenancyEnforcementMode,
  isStrictMode,
  isSoftMode,
} from "../middleware/tenancyEnforcement";

describe("Tenancy Enforcement", () => {
  let app: Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));
  });

  describe("getTenancyEnforcementMode", () => {
    const originalEnv = process.env.TENANCY_ENFORCEMENT;

    afterAll(() => {
      process.env.TENANCY_ENFORCEMENT = originalEnv;
    });

    it("returns 'off' when not set", () => {
      delete process.env.TENANCY_ENFORCEMENT;
      expect(getTenancyEnforcementMode()).toBe("off");
    });

    it("returns 'soft' when set to soft", () => {
      process.env.TENANCY_ENFORCEMENT = "soft";
      expect(getTenancyEnforcementMode()).toBe("soft");
    });

    it("returns 'strict' when set to strict", () => {
      process.env.TENANCY_ENFORCEMENT = "strict";
      expect(getTenancyEnforcementMode()).toBe("strict");
    });

    it("returns 'off' for invalid value", () => {
      process.env.TENANCY_ENFORCEMENT = "invalid";
      expect(getTenancyEnforcementMode()).toBe("off");
    });
  });

  describe("validateTenantOwnership", () => {
    const originalEnv = process.env.TENANCY_ENFORCEMENT;

    afterAll(() => {
      process.env.TENANCY_ENFORCEMENT = originalEnv;
    });

    describe("with enforcement off", () => {
      beforeAll(() => {
        process.env.TENANCY_ENFORCEMENT = "off";
      });

      it("always returns valid", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          "tenant-2",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(true);
        expect(result.shouldFallback).toBe(true);
      });
    });

    describe("with enforcement soft", () => {
      beforeAll(() => {
        process.env.TENANCY_ENFORCEMENT = "soft";
      });

      it("returns valid with warning for null resource tenant", () => {
        const result = validateTenantOwnership(
          null,
          "tenant-1",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(true);
        expect(result.warning).toContain("legacy null tenantId");
        expect(result.shouldFallback).toBe(true);
      });

      it("returns valid with warning for missing effective tenant", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          null,
          "task",
          "task-123"
        );
        expect(result.valid).toBe(true);
        expect(result.warning).toContain("No tenant context");
        expect(result.shouldFallback).toBe(true);
      });

      it("returns invalid for cross-tenant access", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          "tenant-2",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(false);
        expect(result.warning).toContain("Cross-tenant access denied");
      });

      it("returns valid for same tenant", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          "tenant-1",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(true);
        expect(result.warning).toBeUndefined();
        expect(result.shouldFallback).toBe(false);
      });
    });

    describe("with enforcement strict", () => {
      beforeAll(() => {
        process.env.TENANCY_ENFORCEMENT = "strict";
      });

      it("returns invalid for null resource tenant", () => {
        const result = validateTenantOwnership(
          null,
          "tenant-1",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(false);
        expect(result.warning).toContain("has no tenantId");
      });

      it("returns invalid for missing effective tenant", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          null,
          "task",
          "task-123"
        );
        expect(result.valid).toBe(false);
        expect(result.warning).toContain("No tenant context");
      });

      it("returns invalid for cross-tenant access", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          "tenant-2",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(false);
        expect(result.warning).toContain("Cross-tenant access denied");
      });

      it("returns valid for same tenant", () => {
        const result = validateTenantOwnership(
          "tenant-1",
          "tenant-1",
          "task",
          "task-123"
        );
        expect(result.valid).toBe(true);
        expect(result.shouldFallback).toBe(false);
      });
    });
  });

  describe("requireTenantContext middleware", () => {
    let testApp: Express;

    beforeAll(() => {
      testApp = express();
      testApp.use(express.json());
      testApp.use(session({
        secret: "test-secret",
        resave: false,
        saveUninitialized: false,
      }));
    });

    it("blocks unauthenticated requests with 401", async () => {
      testApp.get("/test-no-user", (req, res, next) => {
        // Simulate no user
        next();
      }, requireTenantContext, (req, res) => {
        res.json({ ok: true });
      });

      const response = await request(testApp).get("/test-no-user");
      expect(response.status).toBe(401);
    });

    it("allows super users without tenant context", async () => {
      testApp.get("/test-super", (req, res, next) => {
        (req as any).user = { id: "super", role: UserRole.SUPER_USER };
        (req as any).tenant = { 
          tenantId: null, 
          effectiveTenantId: null, 
          isSuperUser: true 
        };
        next();
      }, requireTenantContext, (req, res) => {
        res.json({ ok: true });
      });

      const response = await request(testApp).get("/test-super");
      expect(response.status).toBe(200);
    });

    it("blocks regular users without tenant context", async () => {
      testApp.get("/test-no-tenant", (req, res, next) => {
        (req as any).user = { id: "user", role: UserRole.EMPLOYEE };
        (req as any).tenant = { 
          tenantId: null, 
          effectiveTenantId: null, 
          isSuperUser: false 
        };
        next();
      }, requireTenantContext, (req, res) => {
        res.json({ ok: true });
      });

      const response = await request(testApp).get("/test-no-tenant");
      expect(response.status).toBe(500);
      expect(response.body.error).toContain("tenant not configured");
    });

    it("allows regular users with tenant context", async () => {
      testApp.get("/test-with-tenant", (req, res, next) => {
        (req as any).user = { id: "user", role: UserRole.EMPLOYEE, tenantId: "tenant-1" };
        (req as any).tenant = { 
          tenantId: "tenant-1", 
          effectiveTenantId: "tenant-1", 
          isSuperUser: false 
        };
        next();
      }, requireTenantContext, (req, res) => {
        res.json({ ok: true });
      });

      const response = await request(testApp).get("/test-with-tenant");
      expect(response.status).toBe(200);
    });
  });
});
