/**
 * @file Rate Limit Tests - Verify 429 Response
 * @description Tests that rate limiting correctly blocks excessive requests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import { 
  createRateLimiter, 
  resetRateLimitStores 
} from "../middleware/rateLimit";

describe("Rate Limiting - Triggers 429", () => {
  let app: Express;

  beforeEach(() => {
    resetRateLimitStores();
    app = express();
    app.use(express.json());
  });

  afterEach(() => {
    resetRateLimitStores();
  });

  it("returns 429 after exceeding IP-based limit", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 3,
      maxRequestsPerEmail: 0,
      keyPrefix: "test-ip",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true, message: "Login successful" });
    });

    for (let i = 0; i < 3; i++) {
      const response = await request(app)
        .post("/test-login")
        .send({ email: "test@example.com", password: "password123" });
      expect(response.status).toBe(200);
    }

    const blockedResponse = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password123" });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body).toHaveProperty("ok", false);
    expect(blockedResponse.body.error).toHaveProperty("code", "RATE_LIMITED");
    expect(blockedResponse.body.error).toHaveProperty("requestId");
    expect(blockedResponse.body.error).toHaveProperty("retryAfter");
    expect(blockedResponse.headers).toHaveProperty("retry-after");
  });

  it("returns 429 after exceeding email-based limit", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 100,
      maxRequestsPerEmail: 2,
      keyPrefix: "test-email",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true, message: "Login successful" });
    });

    const testEmail = "ratelimit-test@example.com";
    
    for (let i = 0; i < 2; i++) {
      const response = await request(app)
        .post("/test-login")
        .send({ email: testEmail, password: "password123" });
      expect(response.status).toBe(200);
    }

    const blockedResponse = await request(app)
      .post("/test-login")
      .send({ email: testEmail, password: "password123" });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body).toHaveProperty("ok", false);
    expect(blockedResponse.body.error).toHaveProperty("code", "RATE_LIMITED");
    expect(blockedResponse.body.error.message).toContain("email");
  });

  it("includes proper rate limit headers in response", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 5,
      maxRequestsPerEmail: 0,
      keyPrefix: "test-headers",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    const response = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password123" });

    expect(response.status).toBe(200);
    expect(response.headers).toHaveProperty("x-ratelimit-limit", "5");
    expect(response.headers).toHaveProperty("x-ratelimit-remaining", "4");
    expect(response.headers).toHaveProperty("x-ratelimit-reset");
  });

  it("rate limits different emails independently", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 100,
      maxRequestsPerEmail: 1,
      keyPrefix: "test-independent",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    const response1 = await request(app)
      .post("/test-login")
      .send({ email: "user1@example.com", password: "password123" });
    expect(response1.status).toBe(200);

    const response2 = await request(app)
      .post("/test-login")
      .send({ email: "user2@example.com", password: "password123" });
    expect(response2.status).toBe(200);

    const blocked1 = await request(app)
      .post("/test-login")
      .send({ email: "user1@example.com", password: "password123" });
    expect(blocked1.status).toBe(429);

    const blocked2 = await request(app)
      .post("/test-login")
      .send({ email: "user2@example.com", password: "password123" });
    expect(blocked2.status).toBe(429);
  });

  it("error envelope follows standardized format", async () => {
    const testLimiter = createRateLimiter({
      windowMs: 60000,
      maxRequestsPerIP: 1,
      maxRequestsPerEmail: 0,
      keyPrefix: "test-envelope",
    });

    app.post("/test-login", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password123" });

    const blockedResponse = await request(app)
      .post("/test-login")
      .send({ email: "test@example.com", password: "password123" });

    expect(blockedResponse.status).toBe(429);
    expect(blockedResponse.body).toMatchObject({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: expect.any(String),
        requestId: expect.stringMatching(/^req_\d+_[a-z0-9]+$/),
        retryAfter: expect.any(Number),
      },
    });
  });
});
