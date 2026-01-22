/**
 * @module server/tests/list_divisions_scoped_to_tenant.test.ts
 * @description Tests that division listing is properly scoped to tenant.
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
  divisionMembers,
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

let tenant1Id: string;
let tenant2Id: string;
let workspace1Id: string;
let workspace2Id: string;
let client1Id: string;
let client2Id: string;
let division1Id: string;
let division2Id: string;
let user1Id: string;
let user2Id: string;

async function createTestData() {
  tenant1Id = randomUUID();
  tenant2Id = randomUUID();
  workspace1Id = randomUUID();
  workspace2Id = randomUUID();
  client1Id = randomUUID();
  client2Id = randomUUID();
  division1Id = randomUUID();
  division2Id = randomUUID();
  user1Id = randomUUID();
  user2Id = randomUUID();

  await db.insert(tenants).values([
    { id: tenant1Id, name: "Tenant 1", slug: `t1-${tenant1Id.slice(0, 8)}`, status: "active" },
    { id: tenant2Id, name: "Tenant 2", slug: `t2-${tenant2Id.slice(0, 8)}`, status: "active" },
  ]);

  await db.insert(workspaces).values([
    { id: workspace1Id, tenantId: tenant1Id, name: "Workspace 1", slug: "ws1" },
    { id: workspace2Id, tenantId: tenant2Id, name: "Workspace 2", slug: "ws2" },
  ]);

  await db.insert(users).values([
    { id: user1Id, tenantId: tenant1Id, name: "User 1", email: `u1-${user1Id.slice(0, 8)}@test.com`, passwordHash: "test", role: "admin" },
    { id: user2Id, tenantId: tenant2Id, name: "User 2", email: `u2-${user2Id.slice(0, 8)}@test.com`, passwordHash: "test", role: "admin" },
  ]);

  await db.insert(clients).values([
    { id: client1Id, tenantId: tenant1Id, workspaceId: workspace1Id, companyName: "Client 1", status: "active" },
    { id: client2Id, tenantId: tenant2Id, workspaceId: workspace2Id, companyName: "Client 2", status: "active" },
  ]);

  await db.insert(clientDivisions).values([
    { id: division1Id, tenantId: tenant1Id, clientId: client1Id, name: "Division T1", isActive: true },
    { id: division2Id, tenantId: tenant2Id, clientId: client2Id, name: "Division T2", isActive: true },
  ]);
}

async function cleanupTestData() {
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenant1Id));
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenant2Id));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenant1Id));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenant2Id));
  await db.delete(clients).where(eq(clients.tenantId, tenant1Id));
  await db.delete(clients).where(eq(clients.tenantId, tenant2Id));
  await db.delete(users).where(eq(users.tenantId, tenant1Id));
  await db.delete(users).where(eq(users.tenantId, tenant2Id));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenant1Id));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenant2Id));
  await db.delete(tenants).where(eq(tenants.id, tenant1Id));
  await db.delete(tenants).where(eq(tenants.id, tenant2Id));
}

describe("List Divisions Scoped to Tenant", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should only return divisions for the specified tenant", async () => {
    const divisions1 = await storage.getClientDivisionsByTenant(tenant1Id);
    const divisions2 = await storage.getClientDivisionsByTenant(tenant2Id);

    expect(divisions1).toHaveLength(1);
    expect(divisions1[0].name).toBe("Division T1");
    expect(divisions1[0].tenantId).toBe(tenant1Id);

    expect(divisions2).toHaveLength(1);
    expect(divisions2[0].name).toBe("Division T2");
    expect(divisions2[0].tenantId).toBe(tenant2Id);
  });

  it("should only return divisions for a specific client within tenant", async () => {
    const divisions = await storage.getClientDivisionsByClient(client1Id, tenant1Id);

    expect(divisions).toHaveLength(1);
    expect(divisions[0].clientId).toBe(client1Id);
    expect(divisions[0].tenantId).toBe(tenant1Id);
  });

  it("should return empty array when client has no divisions", async () => {
    const newClientId = randomUUID();
    await db.insert(clients).values({
      id: newClientId,
      tenantId: tenant1Id,
      workspaceId: workspace1Id,
      companyName: "New Client",
      status: "active",
    });

    const divisions = await storage.getClientDivisionsByClient(newClientId, tenant1Id);
    expect(divisions).toHaveLength(0);

    await db.delete(clients).where(eq(clients.id, newClientId));
  });

  it("should not leak divisions across tenants even with wrong tenant ID", async () => {
    const divisions = await storage.getClientDivisionsByClient(client1Id, tenant2Id);
    expect(divisions).toHaveLength(0);
  });

  it("should return empty for non-existent tenant", async () => {
    const divisions = await storage.getClientDivisionsByTenant(randomUUID());
    expect(divisions).toHaveLength(0);
  });
});
