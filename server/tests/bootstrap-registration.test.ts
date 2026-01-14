import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express from "express";
import { db } from "../db";
import { users, UserRole } from "../../shared/schema";
import { sql } from "drizzle-orm";

// Mock the auth module
vi.mock("../storage", async () => {
  const actual = await vi.importActual("../storage");
  return actual;
});

// Create a test app with just the registration endpoint
async function createTestApp() {
  const app = express();
  app.use(express.json());
  
  // Import setupAuth dynamically to use mocked storage
  const { setupAuth } = await import("../auth");
  setupAuth(app);
  
  return app;
}

describe("First User Bootstrap - Auto Super Admin", () => {
  let app: express.Application;

  beforeEach(async () => {
    // Clean users table before each test
    await db.execute(sql`DELETE FROM users`);
    app = await createTestApp();
  });

  afterEach(async () => {
    // Clean up after tests
    await db.execute(sql`DELETE FROM users`);
  });

  it("should make first registered user a super_user", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "first@example.com",
        password: "password123",
        firstName: "First",
        lastName: "User",
      });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe(UserRole.SUPER_USER);
    expect(response.body.message).toContain("Super Admin");
  });

  it("should not make second user a super_user", async () => {
    // Register first user
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "first@example.com",
        password: "password123",
        firstName: "First",
        lastName: "User",
      });

    // Register second user
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "second@example.com",
        password: "password456",
        firstName: "Second",
        lastName: "User",
      });

    expect(response.status).toBe(201);
    expect(response.body.user.role).toBe(UserRole.EMPLOYEE);
    expect(response.body.message).not.toContain("Super Admin");
  });

  it("should ignore role field from client payload", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "hacker@example.com",
        password: "password123",
        firstName: "Hacker",
        lastName: "Attempt",
        role: "super_user", // This should be ignored when users exist
      });

    // If this is first user, they get super_user anyway
    // If not first, they get employee despite the role field
    expect(response.status).toBe(201);
    // Role is determined by first-user logic, not by client input
    expect(["super_user", "employee"]).toContain(response.body.user.role);
  });

  it("should reject registration with short password", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "test@example.com",
        password: "short",
        firstName: "Test",
        lastName: "User",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("8 characters");
  });

  it("should reject registration with duplicate email", async () => {
    // Register first user
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "duplicate@example.com",
        password: "password123",
        firstName: "First",
        lastName: "User",
      });

    // Try to register with same email
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "duplicate@example.com",
        password: "password456",
        firstName: "Second",
        lastName: "User",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toContain("already registered");
  });

  it("should reject registration without required fields", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        firstName: "No",
        lastName: "Credentials",
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain("required");
  });
});

describe("Super Admin Role Protection", () => {
  let app: express.Application;

  beforeEach(async () => {
    await db.execute(sql`DELETE FROM users`);
    app = await createTestApp();
    
    // Create an existing user first
    await request(app)
      .post("/api/auth/register")
      .send({
        email: "existing@example.com",
        password: "password123",
        firstName: "Existing",
        lastName: "User",
      });
  });

  afterEach(async () => {
    await db.execute(sql`DELETE FROM users`);
  });

  it("should not allow registration with role=super_user when users exist", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: "newuser@example.com",
        password: "password123",
        firstName: "New",
        lastName: "User",
        role: "super_user", // Attempting to escalate privileges
      });

    expect(response.status).toBe(201);
    // The role field should be ignored - user gets employee role
    expect(response.body.user.role).toBe(UserRole.EMPLOYEE);
  });
});
