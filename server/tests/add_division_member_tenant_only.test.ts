/**
 * @module server/tests/add_division_member_tenant_only.test.ts
 * @description Tests that division membership is properly tenant-scoped.
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
let division1Id: string;
let user1Id: string;
let user2Id: string;
let userOtherTenantId: string;

async function createTestData() {
  tenant1Id = randomUUID();
  tenant2Id = randomUUID();
  workspace1Id = randomUUID();
  workspace2Id = randomUUID();
  client1Id = randomUUID();
  division1Id = randomUUID();
  user1Id = randomUUID();
  user2Id = randomUUID();
  userOtherTenantId = randomUUID();

  await db.insert(tenants).values([
    { id: tenant1Id, name: "Tenant 1", slug: `t1-${tenant1Id.slice(0, 8)}`, status: "active" },
    { id: tenant2Id, name: "Tenant 2", slug: `t2-${tenant2Id.slice(0, 8)}`, status: "active" },
  ]);

  await db.insert(workspaces).values([
    { id: workspace1Id, tenantId: tenant1Id, name: "Workspace 1", slug: "ws1" },
    { id: workspace2Id, tenantId: tenant2Id, name: "Workspace 2", slug: "ws2" },
  ]);

  await db.insert(users).values([
    { id: user1Id, tenantId: tenant1Id, name: "User 1", email: `u1-${user1Id.slice(0, 8)}@test.com`, passwordHash: "test", role: "employee" },
    { id: user2Id, tenantId: tenant1Id, name: "User 2", email: `u2-${user2Id.slice(0, 8)}@test.com`, passwordHash: "test", role: "employee" },
    { id: userOtherTenantId, tenantId: tenant2Id, name: "Other Tenant User", email: `other-${userOtherTenantId.slice(0, 8)}@test.com`, passwordHash: "test", role: "employee" },
  ]);

  await db.insert(clients).values({
    id: client1Id,
    tenantId: tenant1Id,
    workspaceId: workspace1Id,
    companyName: "Client 1",
    status: "active",
  });

  await db.insert(clientDivisions).values({
    id: division1Id,
    tenantId: tenant1Id,
    clientId: client1Id,
    name: "Engineering",
    isActive: true,
  });
}

async function cleanupTestData() {
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenant1Id));
  await db.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenant2Id));
  await db.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenant1Id));
  await db.delete(clients).where(eq(clients.tenantId, tenant1Id));
  await db.delete(users).where(eq(users.tenantId, tenant1Id));
  await db.delete(users).where(eq(users.tenantId, tenant2Id));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenant1Id));
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenant2Id));
  await db.delete(tenants).where(eq(tenants.id, tenant1Id));
  await db.delete(tenants).where(eq(tenants.id, tenant2Id));
}

describe("Add Division Member Tenant Only", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  it("should allow adding a user from the same tenant", async () => {
    const member = await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    expect(member).toBeDefined();
    expect(member.userId).toBe(user1Id);
    expect(member.divisionId).toBe(division1Id);
    expect(member.tenantId).toBe(tenant1Id);
  });

  it("should enforce unique membership per division-user pair", async () => {
    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    await expect(
      storage.addDivisionMember({
        tenantId: tenant1Id,
        divisionId: division1Id,
        userId: user1Id,
        role: "member",
      })
    ).rejects.toThrow();
  });

  it("should allow multiple users in the same division", async () => {
    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user2Id,
      role: "member",
    });

    const members = await storage.getDivisionMembers(division1Id);
    expect(members).toHaveLength(2);
  });

  it("should return user details with division members", async () => {
    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    const members = await storage.getDivisionMembers(division1Id);
    expect(members[0].user).toBeDefined();
    expect(members[0].user?.name).toBe("User 1");
  });

  it("should remove division member successfully", async () => {
    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    await storage.removeDivisionMember(division1Id, user1Id);

    const members = await storage.getDivisionMembers(division1Id);
    expect(members).toHaveLength(0);
  });

  it("should check membership correctly", async () => {
    expect(await storage.isDivisionMember(division1Id, user1Id)).toBe(false);

    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    expect(await storage.isDivisionMember(division1Id, user1Id)).toBe(true);
  });

  it("should get all divisions for a user", async () => {
    const division2Id = randomUUID();
    await db.insert(clientDivisions).values({
      id: division2Id,
      tenantId: tenant1Id,
      clientId: client1Id,
      name: "Marketing",
      isActive: true,
    });

    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division1Id,
      userId: user1Id,
      role: "member",
    });

    await storage.addDivisionMember({
      tenantId: tenant1Id,
      divisionId: division2Id,
      userId: user1Id,
      role: "member",
    });

    const userDivisions = await storage.getUserDivisions(user1Id, tenant1Id);
    expect(userDivisions).toHaveLength(2);

    await db.delete(divisionMembers).where(eq(divisionMembers.divisionId, division2Id));
    await db.delete(clientDivisions).where(eq(clientDivisions.id, division2Id));
  });

  it("should set division members in bulk", async () => {
    await storage.setDivisionMembers(division1Id, tenant1Id, [user1Id, user2Id]);

    const members = await storage.getDivisionMembers(division1Id);
    expect(members).toHaveLength(2);

    await storage.setDivisionMembers(division1Id, tenant1Id, [user1Id]);

    const membersAfter = await storage.getDivisionMembers(division1Id);
    expect(membersAfter).toHaveLength(1);
    expect(membersAfter[0].userId).toBe(user1Id);
  });
});
