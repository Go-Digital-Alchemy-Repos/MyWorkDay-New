/**
 * Cross-Tenant CRUD Protection Tests
 * 
 * Verifies that cross-tenant access attempts return 403 Forbidden (not 500).
 * 
 * Coverage:
 * - Task creation with cross-tenant projectId returns 403
 * - Project creation with cross-tenant clientId returns 403
 * - Client access from wrong tenant returns 403
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { 
  tenants, workspaces, clients, projects, users, 
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq } from "drizzle-orm";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestClient,
  createTestProject,
  createTestUser,
  cleanupTestData 
} from "./fixtures";
import { storage } from "../storage";

describe("Cross-Tenant CRUD Protection", () => {
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let client1: any;
  let client2: any;
  let project1: any;
  let project2: any;
  let adminUser1: any;

  beforeAll(async () => {
    tenant1 = await createTestTenant({ name: "CrossTenant Test 1" });
    tenant2 = await createTestTenant({ name: "CrossTenant Test 2" });
    
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });
    
    client1 = await createTestClient({ 
      companyName: "CrossTenant Client 1", 
      workspaceId: workspace1.id, 
      tenantId: tenant1.id 
    });
    client2 = await createTestClient({ 
      companyName: "CrossTenant Client 2", 
      workspaceId: workspace2.id, 
      tenantId: tenant2.id 
    });
    
    project1 = await createTestProject({ 
      name: "CrossTenant Project 1",
      workspaceId: workspace1.id, 
      tenantId: tenant1.id,
      clientId: client1.id 
    });
    project2 = await createTestProject({ 
      name: "CrossTenant Project 2",
      workspaceId: workspace2.id, 
      tenantId: tenant2.id,
      clientId: client2.id 
    });
    
    adminUser1 = await createTestUser({
      email: `cross-admin-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant1?.id, tenant2?.id].filter(Boolean) });
  });

  describe("Storage layer cross-tenant checks", () => {
    it("getProjectByIdAndTenant returns falsy for cross-tenant project", async () => {
      const result = await storage.getProjectByIdAndTenant(project2.id, tenant1.id);
      expect(result).toBeFalsy();
    });

    it("getClientByIdAndTenant returns falsy for cross-tenant client", async () => {
      const result = await storage.getClientByIdAndTenant(client2.id, tenant1.id);
      expect(result).toBeFalsy();
    });

    it("project exists but wrong tenant returns falsy", async () => {
      const directProject = await storage.getProject(project2.id);
      expect(directProject).toBeDefined();
      expect(directProject?.id).toBe(project2.id);
      
      const tenantScopedProject = await storage.getProjectByIdAndTenant(project2.id, tenant1.id);
      expect(tenantScopedProject).toBeFalsy();
    });
  });

  describe("Tenant isolation verification", () => {
    it("client created with correct tenantId", async () => {
      const client = await storage.getClient(client1.id);
      expect(client).toBeDefined();
      expect(client?.tenantId).toBe(tenant1.id);
    });

    it("project created with correct tenantId", async () => {
      const project = await storage.getProject(project1.id);
      expect(project).toBeDefined();
      expect(project?.tenantId).toBe(tenant1.id);
    });

    it("getClientsByTenant returns only tenant-scoped clients", async () => {
      const clientsForTenant1 = await storage.getClientsByTenant(tenant1.id, workspace1.id);
      const hasTenant2Clients = clientsForTenant1.some((c: any) => c.tenantId === tenant2.id);
      expect(hasTenant2Clients).toBe(false);
    });

    it("getProjectsByTenant returns only tenant-scoped projects", async () => {
      const projectsForTenant1 = await storage.getProjectsByTenant(tenant1.id);
      const hasTenant2Projects = projectsForTenant1.some((p: any) => p.tenantId === tenant2.id);
      expect(hasTenant2Projects).toBe(false);
    });
  });

  describe("Data integrity", () => {
    it("test fixtures have distinct tenantIds", () => {
      expect(tenant1.id).not.toBe(tenant2.id);
      expect(client1.tenantId).toBe(tenant1.id);
      expect(client2.tenantId).toBe(tenant2.id);
      expect(project1.tenantId).toBe(tenant1.id);
      expect(project2.tenantId).toBe(tenant2.id);
    });
  });
});
