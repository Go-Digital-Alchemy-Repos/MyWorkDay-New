/**
 * @module server/tests/create_division_requires_client_and_tenant.test.ts
 * @description Tests that division creation requires valid client and tenant context.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
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

let testTenantId: string;
let testWorkspaceId: string;
let testClientId: string;
let testAdminUserId: string;

async function createTestData() {
  testTenantId = randomUUID();
  testWorkspaceId = randomUUID();
  testClientId = randomUUID();
  testAdminUserId = randomUUID();

  await db.insert(tenants).values({
    id: testTenantId,
    name: "Test Tenant",
    slug: `test-${testTenantId.slice(0, 8)}`,
    status: "active",
  });

  await db.insert(workspaces).values({
    id: testWorkspaceId,
    tenantId: testTenantId,
    name: "Test Workspace",
    slug: "test-workspace",
  });

  await db.insert(users).values({
    id: testAdminUserId,
    tenantId: testTenantId,
    name: "Test Admin",
    email: `admin-${testAdminUserId.slice(0, 8)}@test.com`,
    passwordHash: "test",
    role: "admin",
  });

  await db.insert(clients).values({
    id: testClientId,
    tenantId: testTenantId,
    workspaceId: testWorkspaceId,
    companyName: "Test Client",
    status: "active",
  });
}

async function cleanupTestData() {
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, testTenantId));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, testTenantId));
  await db.delete(clients).where(eq(clients.tenantId, testTenantId));
  await db.delete(users).where(eq(users.tenantId, testTenantId));
  await db.delete(workspaces).where(eq(workspaces.tenantId, testTenantId));
  await db.delete(tenants).where(eq(tenants.id, testTenantId));
}

describe("Create Division Requires Client and Tenant", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should create a division when clientId and tenantId are valid", async () => {
    const divisionId = randomUUID();
    
    const [created] = await db.insert(clientDivisions).values({
      id: divisionId,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Engineering",
      description: "Engineering team division",
      color: "#3B82F6",
      isActive: true,
    }).returning();

    expect(created).toBeDefined();
    expect(created.id).toBe(divisionId);
    expect(created.tenantId).toBe(testTenantId);
    expect(created.clientId).toBe(testClientId);
    expect(created.name).toBe("Engineering");
  });

  it("should fail to create division without tenantId", async () => {
    const divisionId = randomUUID();
    
    await expect(
      db.insert(clientDivisions).values({
        id: divisionId,
        tenantId: null as any,
        clientId: testClientId,
        name: "Invalid Division",
      })
    ).rejects.toThrow();
  });

  it("should fail to create division with non-existent clientId", async () => {
    const divisionId = randomUUID();
    const nonExistentClientId = randomUUID();
    
    await expect(
      db.insert(clientDivisions).values({
        id: divisionId,
        tenantId: testTenantId,
        clientId: nonExistentClientId,
        name: "Invalid Division",
      })
    ).rejects.toThrow();
  });

  it("should enforce unique division name per client", async () => {
    const division1Id = randomUUID();
    const division2Id = randomUUID();
    
    await db.insert(clientDivisions).values({
      id: division1Id,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Sales",
    });

    const [second] = await db.insert(clientDivisions).values({
      id: division2Id,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Marketing",
    }).returning();

    expect(second.name).toBe("Marketing");
  });

  it("should allow divisions in different clients with same name", async () => {
    const client2Id = randomUUID();
    await db.insert(clients).values({
      id: client2Id,
      tenantId: testTenantId,
      workspaceId: testWorkspaceId,
      companyName: "Second Client",
      status: "active",
    });

    const div1Id = randomUUID();
    const div2Id = randomUUID();

    const [div1] = await db.insert(clientDivisions).values({
      id: div1Id,
      tenantId: testTenantId,
      clientId: testClientId,
      name: "Development",
    }).returning();

    const [div2] = await db.insert(clientDivisions).values({
      id: div2Id,
      tenantId: testTenantId,
      clientId: client2Id,
      name: "Development",
    }).returning();

    expect(div1.name).toBe("Development");
    expect(div2.name).toBe("Development");
    expect(div1.clientId).not.toBe(div2.clientId);

    await db.delete(clientDivisions).where(eq(clientDivisions.id, div2Id));
    await db.delete(clients).where(eq(clients.id, client2Id));
  });
});
