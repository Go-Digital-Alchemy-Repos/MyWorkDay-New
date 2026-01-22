/**
 * @module server/tests/project_rejects_division_not_in_client.test.ts
 * @description Tests that project creation rejects divisionId that doesn't belong to the client.
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
let otherTenantId: string;
let workspaceId: string;
let client1Id: string;
let client2Id: string;
let division1Id: string;
let division2Id: string;
let divisionOtherTenantId: string;
let adminUserId: string;

async function createTestData() {
  tenantId = randomUUID();
  otherTenantId = randomUUID();
  workspaceId = randomUUID();
  const otherWorkspaceId = randomUUID();
  client1Id = randomUUID();
  client2Id = randomUUID();
  const clientOtherTenantId = randomUUID();
  division1Id = randomUUID();
  division2Id = randomUUID();
  divisionOtherTenantId = randomUUID();
  adminUserId = randomUUID();

  await db.insert(tenants).values([
    { id: tenantId, name: "Test Tenant", slug: `t-${tenantId.slice(0, 8)}`, status: "active" },
    { id: otherTenantId, name: "Other Tenant", slug: `ot-${otherTenantId.slice(0, 8)}`, status: "active" },
  ]);

  await db.insert(workspaces).values([
    { id: workspaceId, tenantId, name: "Test Workspace", slug: "test-ws" },
    { id: otherWorkspaceId, tenantId: otherTenantId, name: "Other Workspace", slug: "other-ws" },
  ]);

  await db.insert(users).values({
    id: adminUserId,
    tenantId,
    email: `admin-${adminUserId.slice(0, 8)}@test.com`,
    name: "Admin User",
    role: "admin",
  });

  await db.insert(clients).values([
    { id: client1Id, tenantId, workspaceId, companyName: "Client 1", status: "active" },
    { id: client2Id, tenantId, workspaceId, companyName: "Client 2", status: "active" },
    { id: clientOtherTenantId, tenantId: otherTenantId, workspaceId: otherWorkspaceId, companyName: "Other Tenant Client", status: "active" },
  ]);

  await db.insert(clientDivisions).values([
    { id: division1Id, tenantId, clientId: client1Id, name: "Division 1", isActive: true },
    { id: division2Id, tenantId, clientId: client2Id, name: "Division 2", isActive: true },
    { id: divisionOtherTenantId, tenantId: otherTenantId, clientId: clientOtherTenantId, name: "Other Tenant Division", isActive: true },
  ]);
}

async function cleanupTestData() {
  await db.delete(projects).where(eq(projects.tenantId, tenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, otherTenantId));
  await db.delete(clients).where(eq(clients.tenantId, tenantId));
  await db.delete(clients).where(eq(clients.tenantId, otherTenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, otherTenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(tenants).where(eq(tenants.id, otherTenantId));
}

describe("Project rejects division not in client", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should reject division that belongs to a different client", async () => {
    const isValid = await storage.validateDivisionBelongsToClientTenant(
      division1Id,
      client2Id,
      tenantId
    );
    expect(isValid).toBe(false);
  });

  it("should accept division that belongs to the correct client", async () => {
    const isValid = await storage.validateDivisionBelongsToClientTenant(
      division1Id,
      client1Id,
      tenantId
    );
    expect(isValid).toBe(true);
  });

  it("should reject division from a different tenant", async () => {
    const isValid = await storage.validateDivisionBelongsToClientTenant(
      divisionOtherTenantId,
      client1Id,
      tenantId
    );
    expect(isValid).toBe(false);
  });

  it("should reject non-existent division", async () => {
    const fakeId = randomUUID();
    const isValid = await storage.validateDivisionBelongsToClientTenant(
      fakeId,
      client1Id,
      tenantId
    );
    expect(isValid).toBe(false);
  });

  it("should allow project with matching client and division", async () => {
    const project = await storage.createProjectWithTenant(
      {
        workspaceId,
        clientId: client1Id,
        divisionId: division1Id,
        name: "Valid Project",
        createdBy: adminUserId,
      },
      tenantId
    );

    expect(project).toBeDefined();
    expect(project.divisionId).toBe(division1Id);
    expect(project.clientId).toBe(client1Id);
  });
});
