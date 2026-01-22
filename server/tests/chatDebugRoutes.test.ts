/**
 * Integration Tests for Chat Debug Routes
 * 
 * Tests verify:
 * - All debug endpoints require super_user role
 * - Endpoints return 404 when CHAT_DEBUG is disabled
 * - Response shapes match documented API
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import session from "express-session";
import passport from "passport";
import chatDebugRoutes from "../routes/chatDebug";
import { UserRole } from "@shared/schema";
import { chatDebugStore } from "../realtime/chatDebug";

function createTestApp(mockUser: any | null = null) {
  const app = express();
  app.use(express.json());
  
  app.use(session({
    secret: "test-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.use(passport.initialize());
  app.use(passport.session());
  
  app.use((req, _res, next) => {
    if (mockUser) {
      (req as any).user = mockUser;
      (req as any).isAuthenticated = () => true;
    } else {
      (req as any).isAuthenticated = () => false;
    }
    next();
  });
  
  app.use((req, _res, next) => {
    const user = (req as any).user;
    if (user) {
      (req as any).tenant = {
        tenantId: user.tenantId,
        effectiveTenantId: user.tenantId,
        isSuperUser: user.role === UserRole.SUPER_USER,
      };
    }
    next();
  });
  
  app.use("/api/v1/super/debug/chat", chatDebugRoutes);
  
  return app;
}

const superUser = {
  id: "super-1",
  email: "super@test.com",
  role: UserRole.SUPER_USER,
  tenantId: null,
};

const regularUser = {
  id: "user-1",
  email: "user@test.com",
  role: "employee",
  tenantId: "tenant-1",
};

const tenantAdmin = {
  id: "admin-1",
  email: "admin@test.com",
  role: UserRole.TENANT_ADMIN,
  tenantId: "tenant-1",
};

describe("Chat Debug Routes - Access Control", () => {
  const originalEnv = process.env.CHAT_DEBUG;
  
  beforeEach(() => {
    process.env.CHAT_DEBUG = "true";
    chatDebugStore.reset();
  });
  
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHAT_DEBUG;
    } else {
      process.env.CHAT_DEBUG = originalEnv;
    }
  });

  describe("Authentication requirements", () => {
    it("should reject unauthenticated requests to /metrics", async () => {
      const app = createTestApp(null);
      const response = await request(app).get("/api/v1/super/debug/chat/metrics");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to /events", async () => {
      const app = createTestApp(null);
      const response = await request(app).get("/api/v1/super/debug/chat/events");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to /sockets", async () => {
      const app = createTestApp(null);
      const response = await request(app).get("/api/v1/super/debug/chat/sockets");
      expect(response.status).toBe(401);
    });

    it("should reject unauthenticated requests to /status", async () => {
      const app = createTestApp(null);
      const response = await request(app).get("/api/v1/super/debug/chat/status");
      expect(response.status).toBe(401);
    });
  });

  describe("Role-based access control", () => {
    it("should reject non-super user requests to /metrics", async () => {
      const app = createTestApp(regularUser);
      const response = await request(app).get("/api/v1/super/debug/chat/metrics");
      expect(response.status).toBe(403);
    });

    it("should reject tenant admin requests to /metrics", async () => {
      const app = createTestApp(tenantAdmin);
      const response = await request(app).get("/api/v1/super/debug/chat/metrics");
      expect(response.status).toBe(403);
    });

    it("should allow super user access to /metrics", async () => {
      const app = createTestApp(superUser);
      const response = await request(app).get("/api/v1/super/debug/chat/metrics");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should allow super user access to /events", async () => {
      const app = createTestApp(superUser);
      const response = await request(app).get("/api/v1/super/debug/chat/events");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should allow super user access to /sockets", async () => {
      const app = createTestApp(superUser);
      const response = await request(app).get("/api/v1/super/debug/chat/sockets");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should allow super user access to /status", async () => {
      const app = createTestApp(superUser);
      const response = await request(app).get("/api/v1/super/debug/chat/status");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

describe("Chat Debug Routes - CHAT_DEBUG disabled", () => {
  const originalEnv = process.env.CHAT_DEBUG;
  
  beforeEach(() => {
    delete process.env.CHAT_DEBUG;
    chatDebugStore.reset();
  });
  
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHAT_DEBUG;
    } else {
      process.env.CHAT_DEBUG = originalEnv;
    }
  });

  it("should return 404 for /metrics when disabled", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/metrics");
    expect(response.status).toBe(404);
  });

  it("should return 404 for /events when disabled", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/events");
    expect(response.status).toBe(404);
  });

  it("should return 404 for /sockets when disabled", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/sockets");
    expect(response.status).toBe(404);
  });

  it("should still allow /status endpoint to work (shows disabled)", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/status");
    expect(response.status).toBe(200);
    expect(response.body.data.enabled).toBe(false);
  });

  it("should not reveal debug capabilities in 404 response", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/metrics");
    expect(response.body.error).toBe("Not found");
    expect(JSON.stringify(response.body)).not.toContain("CHAT_DEBUG");
  });
});

describe("Chat Debug Routes - Response shapes", () => {
  const originalEnv = process.env.CHAT_DEBUG;
  
  beforeEach(() => {
    process.env.CHAT_DEBUG = "true";
    chatDebugStore.reset();
  });
  
  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHAT_DEBUG;
    } else {
      process.env.CHAT_DEBUG = originalEnv;
    }
  });

  it("should return metrics with correct shape", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/metrics");
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("activeSockets");
    expect(response.body.data).toHaveProperty("roomsJoined");
    expect(response.body.data).toHaveProperty("messagesLast5Min");
    expect(response.body.data).toHaveProperty("disconnectsLast5Min");
    expect(response.body.data).toHaveProperty("lastErrors");
    expect(response.body).toHaveProperty("timestamp");
  });

  it("should return events with correct shape", async () => {
    chatDebugStore.logEvent({ eventType: "socket_connected", socketId: "test-1" });
    
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/events");
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty("count");
    expect(response.body).toHaveProperty("timestamp");
    
    if (response.body.data.length > 0) {
      expect(response.body.data[0]).toHaveProperty("id");
      expect(response.body.data[0]).toHaveProperty("timestamp");
      expect(response.body.data[0]).toHaveProperty("eventType");
    }
  });

  it("should respect limit parameter for events", async () => {
    for (let i = 0; i < 10; i++) {
      chatDebugStore.logEvent({ eventType: "socket_connected", socketId: `test-${i}` });
    }
    
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/events?limit=5");
    
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBe(5);
  });

  it("should return sockets with correct shape", async () => {
    chatDebugStore.logEvent({ 
      eventType: "socket_connected", 
      socketId: "sock-1",
      userId: "user-1",
      tenantId: "tenant-1",
    });
    
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/sockets");
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
    expect(response.body).toHaveProperty("count");
    expect(response.body).toHaveProperty("timestamp");
    
    if (response.body.data.length > 0) {
      expect(response.body.data[0]).toHaveProperty("socketId");
      expect(response.body.data[0]).toHaveProperty("connectedAt");
      expect(response.body.data[0]).toHaveProperty("roomsCount");
    }
  });

  it("should return status with correct shape", async () => {
    const app = createTestApp(superUser);
    const response = await request(app).get("/api/v1/super/debug/chat/status");
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data).toHaveProperty("enabled");
    expect(response.body.data).toHaveProperty("envVar");
    expect(response.body.data.envVar).toBe("CHAT_DEBUG");
  });
});
