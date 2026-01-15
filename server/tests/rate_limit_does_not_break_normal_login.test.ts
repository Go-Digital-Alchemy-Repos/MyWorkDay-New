/**
 * @file Rate Limit Tests - Normal Login Not Broken
 * @description Tests that rate limiting does not interfere with legitimate login attempts.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import { 
  createRateLimiter, 
  resetRateLimitStores 
} from "../middleware/rateLimit";

describe("Rate Limiting - Does Not Break Normal Login", () => {
  let app: Express;

  beforeEach(() => {
    resetRateLimitStores();
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    resetRateLimitStores();
  });

  it("allows login requests below the rate limit", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 10,
      maxRequestsPerEmail: 5,
      keyPrefix: "test-normal",
    });

    app.post("/test-login", testLimiter, (req, res) => {
      const { email, password } = req.body;
      if (email === "valid@example.com" && password === "correctpassword") {
        return res.json({ ok: true, user: { email } });
      }
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    });

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/test-login")
        .send({ email: "valid@example.com", password: "correctpassword" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
      expect(response.body).toHaveProperty("user");
    }
  });

  it("allows different users to login without affecting each other (email isolation)", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 100,
      maxRequestsPerEmail: 2,
      keyPrefix: "test-isolation",
    });

    app.post("/test-login", testLimiter, (req, res) => {
      res.json({ ok: true, user: { email: req.body.email } });
    });

    const response1 = await request(app)
      .post("/test-login")
      .send({ email: "user1@example.com", password: "password" });
    expect(response1.status).toBe(200);

    const response2 = await request(app)
      .post("/test-login")
      .send({ email: "user2@example.com", password: "password" });
    expect(response2.status).toBe(200);

    const response3 = await request(app)
      .post("/test-login")
      .send({ email: "user3@example.com", password: "password" });
    expect(response3.status).toBe(200);

    const response1Again = await request(app)
      .post("/test-login")
      .send({ email: "user1@example.com", password: "password" });
    expect(response1Again.status).toBe(200);
  });

  it("passes through login success payload unchanged", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 10,
      maxRequestsPerEmail: 5,
      keyPrefix: "test-passthrough",
    });

    const expectedPayload = {
      ok: true,
      user: {
        id: "123",
        email: "test@example.com",
        role: "admin",
        tenantId: "tenant-456",
      },
      workspaceId: "ws-789",
    };

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json(expectedPayload);
    });

    const response = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expectedPayload);
  });

  it("does not leak rate limit internals on successful requests", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 10,
      maxRequestsPerEmail: 5,
      keyPrefix: "test-no-leak",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true, message: "Success" });
    });

    const response = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });

    expect(response.status).toBe(200);
    expect(response.body).not.toHaveProperty("rateLimit");
    expect(response.body).not.toHaveProperty("remaining");
    expect(response.body).not.toHaveProperty("resetAt");
  });

  it("works correctly without email in request body", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 5,
      maxRequestsPerEmail: 3,
      keyPrefix: "test-no-email",
    });

    app.post("/test-bootstrap", testLimiter, (_req, res) => {
      res.json({ ok: true, bootstrapped: true });
    });

    for (let i = 0; i < 5; i++) {
      const response = await request(app)
        .post("/test-bootstrap")
        .send({ password: "newpassword" });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("ok", true);
    }

    const blockedResponse = await request(app)
      .post("/test-bootstrap")
      .send({ password: "newpassword" });

    expect(blockedResponse.status).toBe(429);
  });

  it("email rate limiting is case-insensitive", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 100,
      maxRequestsPerEmail: 2,
      keyPrefix: "test-case",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    const response1 = await request(app)
      .post("/test-login")
      .send({ email: "Test@Example.COM", password: "password" });
    expect(response1.status).toBe(200);

    const response2 = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });
    expect(response2.status).toBe(200);

    const blocked = await request(app)
      .post("/test-login")
      .send({ email: "TEST@EXAMPLE.COM", password: "password" });
    expect(blocked.status).toBe(429);
  });

  it("allows requests after rate limit window expires", async () => {
    const shortWindowMs = 100;
    const testLimiter = createRateLimiter({
      windowMs: shortWindowMs,
      maxRequestsPerIP: 1,
      maxRequestsPerEmail: 0,
      keyPrefix: "test-expiry",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    const response1 = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });
    expect(response1.status).toBe(200);

    const blocked = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });
    expect(blocked.status).toBe(429);

    await new Promise(resolve => setTimeout(resolve, shortWindowMs + 50));

    const response2 = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password" });
    expect(response2.status).toBe(200);
  });
});
