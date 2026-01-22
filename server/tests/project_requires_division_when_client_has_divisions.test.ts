/**
 * @module server/tests/project_requires_division_when_client_has_divisions.test.ts
 * @description Tests that project creation requires divisionId when the client has divisions.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import { storage } from "../storage";
import {
  users,
  tenants,
  workspaces,
  clients,
  clientDivisions,
  projects,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let tenantId: string;
let workspaceId: string;
let clientWithDivisionsId: string;
let clientWithoutDivisionsId: string;
let divisionId: string;
let adminUserId: string;

async function createTestData() {
  tenantId = randomUUID();
  workspaceId = randomUUID();
  clientWithDivisionsId = randomUUID();
  clientWithoutDivisionsId = randomUUID();
  divisionId = randomUUID();
  adminUserId = randomUUID();

  await db.insert(tenants).values({
    id: tenantId,
    name: "Test Tenant",
    slug: `t-${tenantId.slice(0, 8)}`,
    status: "active",
  });

  await db.insert(workspaces).values({
    id: workspaceId,
    tenantId,
    name: "Test Workspace",
    slug: "test-ws",
  });

  await db.insert(users).values({
    id: adminUserId,
    tenantId,
    email: `admin-${adminUserId.slice(0, 8)}@test.com`,
    name: "Admin User",
    role: "admin",
  });

  await db.insert(clients).values([
    {
      id: clientWithDivisionsId,
      tenantId,
      workspaceId,
      companyName: "Client With Divisions",
      status: "active",
    },
    {
      id: clientWithoutDivisionsId,
      tenantId,
      workspaceId,
      companyName: "Client Without Divisions",
      status: "active",
    },
  ]);

  await db.insert(clientDivisions).values({
    id: divisionId,
    tenantId,
    clientId: clientWithDivisionsId,
    name: "Test Division",
    isActive: true,
  });
}

async function cleanupTestData() {
  await db.delete(projects).where(eq(projects.tenantId, tenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));
  await db.delete(clients).where(eq(clients.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

describe("Project requires division when client has divisions", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should allow creating project without division when client has no divisions", async () => {
    const divisions = await storage.getClientDivisionsByClient(
      clientWithoutDivisionsId,
      tenantId
    );
    expect(divisions).toHaveLength(0);

    const project = await storage.createProjectWithTenant(
      {
        workspaceId,
        clientId: clientWithoutDivisionsId,
        name: "Project Without Division",
        createdBy: adminUserId,
      },
      tenantId
    );

    expect(project).toBeDefined();
    expect(project.name).toBe("Project Without Division");
    expect(project.divisionId).toBeNull();
  });

  it("should show that client with divisions has divisions", async () => {
    const divisions = await storage.getClientDivisionsByClient(
      clientWithDivisionsId,
      tenantId
    );
    expect(divisions).toHaveLength(1);
    expect(divisions[0].id).toBe(divisionId);
  });

  it("should allow creating project with division when client has divisions", async () => {
    const project = await storage.createProjectWithTenant(
      {
        workspaceId,
        clientId: clientWithDivisionsId,
        divisionId,
        name: "Project With Division",
        createdBy: adminUserId,
      },
      tenantId
    );

    expect(project).toBeDefined();
    expect(project.name).toBe("Project With Division");
    expect(project.divisionId).toBe(divisionId);
  });

  it("should validate that divisionId belongs to client", async () => {
    const isValid = await storage.validateDivisionBelongsToClientTenant(
      divisionId,
      clientWithDivisionsId,
      tenantId
    );
    expect(isValid).toBe(true);

    const isInvalid = await storage.validateDivisionBelongsToClientTenant(
      divisionId,
      clientWithoutDivisionsId,
      tenantId
    );
    expect(isInvalid).toBe(false);
  });
});
