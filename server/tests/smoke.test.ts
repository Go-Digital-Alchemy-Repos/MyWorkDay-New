/**
 * @file Smoke Tests for Critical API Endpoints
 * @description Quick verification that core functionality works.
 * 
 * These tests verify that the API endpoints are reachable and return
 * expected response structures. They do NOT test business logic deeply.
 */

import { describe, it, expect, beforeAll } from "vitest";

const API_BASE = "http://localhost:5000";

async function fetchJSON(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, options);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

describe("Smoke Tests - Public Endpoints", () => {
  it("GET /api/health returns 200", async () => {
    const { status, data } = await fetchJSON("/api/health");
    expect(status).toBe(200);
    expect(data).toHaveProperty("status", "ok");
  });
});

describe("Smoke Tests - Auth Endpoints", () => {
  it("GET /api/auth/me returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/auth/me");
    expect(status).toBe(401);
  });

  it("POST /api/auth/login with invalid credentials returns 401", async () => {
    const { status } = await fetchJSON("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid@test.com", password: "wrong" }),
    });
    expect(status).toBe(401);
  });

  it("POST /api/auth/logout returns 200", async () => {
    const { status } = await fetchJSON("/api/auth/logout", {
      method: "POST",
    });
    expect(status).toBe(200);
  });
});

describe("Smoke Tests - Protected Endpoints (require auth)", () => {
  it("GET /api/workspaces returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/workspaces");
    expect(status).toBe(401);
  });

  it("GET /api/projects returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/projects");
    expect(status).toBe(401);
  });

  it("GET /api/tasks/my returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/tasks/my");
    expect(status).toBe(401);
  });

  it("GET /api/clients returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/clients");
    expect(status).toBe(401);
  });

  it("GET /api/teams returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/teams");
    expect(status).toBe(401);
  });
});

describe("Smoke Tests - Admin Endpoints", () => {
  it("GET /api/users returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/users");
    expect(status).toBe(401);
  });

  it("GET /api/invitations returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/invitations");
    expect(status).toBe(401);
  });
});

describe("Smoke Tests - Super Admin Endpoints", () => {
  it("GET /api/v1/super/tenants returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/v1/super/tenants");
    expect(status).toBe(401);
  });

  it("GET /api/super/tenancy-health/dashboard returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/super/tenancy-health/dashboard");
    expect(status).toBe(401);
  });
});

describe("Smoke Tests - Workload Report Endpoints", () => {
  it("GET /api/v1/workload/summary returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/v1/workload/summary");
    expect(status).toBe(401);
  });

  it("GET /api/v1/workload/tasks-by-employee returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/v1/workload/tasks-by-employee");
    expect(status).toBe(401);
  });
});

describe("Smoke Tests - Projects Dashboard Endpoints", () => {
  it("GET /api/v1/projects returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/v1/projects");
    expect(status).toBe(401);
  });

  it("GET /api/v1/projects/analytics/summary returns 401 when not authenticated", async () => {
    const { status } = await fetchJSON("/api/v1/projects/analytics/summary");
    expect(status).toBe(401);
  });
});

describe("Smoke Tests - API Error Responses", () => {
  it("GET /api/nonexistent returns 404", async () => {
    const { status } = await fetchJSON("/api/nonexistent");
    expect(status).toBe(404);
  });

  it("POST /api/projects with invalid body returns 4xx when not authenticated", async () => {
    const { status } = await fetchJSON("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect([400, 401]).toContain(status);
  });
});
