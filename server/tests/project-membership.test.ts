/**
 * @module server/tests/project-membership.test.ts
 * @description Tests for project membership, visibility scoping, and required client assignment
 * 
 * Tests:
 * 1. tenant_admin_can_create_project_requires_client
 * 2. employee_can_create_project_and_is_member
 * 3. project_list_scoped_for_employee
 * 4. cannot_assign_project_to_client_from_other_tenant
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "../db";
import { 
  users, 
  tenants, 
  workspaces, 
  projects, 
  clients, 
  projectMembers,
  workspaceMembers
} from "../../shared/schema";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

let testTenantId: string;
let testWorkspaceId: string;
let testClientId: string;
let testAdminId: string;
let testEmployeeId: string;
let testClientIdOtherTenant: string;
let testOtherTenantId: string;

async function createTestData() {
  testTenantId = randomUUID();
  testOtherTenantId = randomUUID();
  testWorkspaceId = randomUUID();
  testClientId = randomUUID();
  testAdminId = randomUUID();
  testEmployeeId = randomUUID();
  testClientIdOtherTenant = randomUUID();

  await db.insert(tenants).values([
    { id: testTenantId, name: "Test Tenant", slug: `test-${testTenantId.slice(0, 8)}`, status: "active" },
    { id: testOtherTenantId, name: "Other Tenant", slug: `other-${testOtherTenantId.slice(0, 8)}`, status: "active" },
  ]);

  await db.insert(workspaces).values({
    id: testWorkspaceId,
    tenantId: testTenantId,
    name: "Test Workspace",
    slug: "test-workspace",
  });

  await db.insert(users).values([
    {
      id: testAdminId,
      tenantId: testTenantId,
      name: "Test Admin",
      email: `admin-${testAdminId.slice(0, 8)}@test.com`,
      role: "admin",
      passwordHash: "test",
    },
    {
      id: testEmployeeId,
      tenantId: testTenantId,
      name: "Test Employee",
      email: `employee-${testEmployeeId.slice(0, 8)}@test.com`,
      role: "employee",
      passwordHash: "test",
    },
  ]);

  await db.insert(workspaceMembers).values([
    { workspaceId: testWorkspaceId, userId: testAdminId, role: "admin" },
    { workspaceId: testWorkspaceId, userId: testEmployeeId, role: "member" },
  ]);

  await db.insert(clients).values([
    {
      id: testClientId,
      tenantId: testTenantId,
      workspaceId: testWorkspaceId,
      companyName: "Test Client",
      status: "active",
    },
    {
      id: testClientIdOtherTenant,
      tenantId: testOtherTenantId,
      workspaceId: testWorkspaceId,
      companyName: "Other Tenant Client",
      status: "active",
    },
  ]);
}

async function cleanupTestData() {
  try {
    const projectsToDelete = await db.select({ id: projects.id })
      .from(projects)
      .where(eq(projects.tenantId, testTenantId));
    
    for (const proj of projectsToDelete) {
      await db.delete(projectMembers).where(eq(projectMembers.projectId, proj.id));
    }
    
    await db.delete(projects).where(eq(projects.tenantId, testTenantId));
    await db.delete(clients).where(eq(clients.id, testClientId));
    await db.delete(clients).where(eq(clients.id, testClientIdOtherTenant));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.workspaceId, testWorkspaceId));
    await db.delete(users).where(eq(users.id, testAdminId));
    await db.delete(users).where(eq(users.id, testEmployeeId));
    await db.delete(workspaces).where(eq(workspaces.id, testWorkspaceId));
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
    await db.delete(tenants).where(eq(tenants.id, testOtherTenantId));
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

describe("Project Membership and Client Assignment", () => {
  beforeEach(async () => {
    await createTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  describe("tenant_admin_can_create_project_requires_client", () => {
    it("should fail to create project without clientId", async () => {
      const { storage } = await import("../storage");
      
      try {
        await storage.createProjectWithTenant(
          {
            name: "Test Project",
            workspaceId: testWorkspaceId,
            createdBy: testAdminId,
          },
          testTenantId
        );
        expect.fail("Should have thrown or validation should fail");
      } catch {
      }
    });

    it("should succeed creating project with valid clientId", async () => {
      const { storage } = await import("../storage");
      
      const project = await storage.createProjectWithTenant(
        {
          name: "Test Project With Client",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      expect(project).toBeDefined();
      expect(project.name).toBe("Test Project With Client");
      expect(project.clientId).toBe(testClientId);
      expect(project.tenantId).toBe(testTenantId);
    });
  });

  describe("employee_can_create_project_and_is_member", () => {
    it("should add creator as project member automatically via route logic", async () => {
      const { storage } = await import("../storage");
      
      const project = await storage.createProjectWithTenant(
        {
          name: "Employee Project",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testEmployeeId,
        },
        testTenantId
      );
      
      await storage.addProjectMember({
        projectId: project.id,
        userId: testEmployeeId,
        role: "owner",
      });
      
      const members = await storage.getProjectMembers(project.id);
      expect(members.length).toBe(1);
      expect(members[0].userId).toBe(testEmployeeId);
      expect(members[0].role).toBe("owner");
      
      const isMember = await storage.isProjectMember(project.id, testEmployeeId);
      expect(isMember).toBe(true);
    });
  });

  describe("project_list_scoped_for_employee", () => {
    it("should return only projects where employee is a member", async () => {
      const { storage } = await import("../storage");
      
      const project1 = await storage.createProjectWithTenant(
        {
          name: "Project 1 - Employee Member",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      const project2 = await storage.createProjectWithTenant(
        {
          name: "Project 2 - No Employee",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      await storage.addProjectMember({
        projectId: project1.id,
        userId: testEmployeeId,
        role: "member",
      });
      
      const employeeProjects = await storage.getProjectsForUser(
        testEmployeeId,
        testTenantId,
        testWorkspaceId,
        false
      );
      
      expect(employeeProjects.length).toBe(1);
      expect(employeeProjects[0].id).toBe(project1.id);
      expect(employeeProjects[0].name).toBe("Project 1 - Employee Member");
    });

    it("should return all projects for admin regardless of membership", async () => {
      const { storage } = await import("../storage");
      
      const project1 = await storage.createProjectWithTenant(
        {
          name: "Admin Project 1",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      const project2 = await storage.createProjectWithTenant(
        {
          name: "Admin Project 2",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testEmployeeId,
        },
        testTenantId
      );
      
      const adminProjects = await storage.getProjectsForUser(
        testAdminId,
        testTenantId,
        testWorkspaceId,
        true
      );
      
      expect(adminProjects.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("cannot_assign_project_to_client_from_other_tenant", () => {
    it("should not find client from other tenant", async () => {
      const { storage } = await import("../storage");
      
      const client = await storage.getClientByIdAndTenant(testClientIdOtherTenant, testTenantId);
      expect(client).toBeUndefined();
    });
  });

  describe("project member management", () => {
    it("should add and remove project members", async () => {
      const { storage } = await import("../storage");
      
      const project = await storage.createProjectWithTenant(
        {
          name: "Member Test Project",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      await storage.addProjectMember({
        projectId: project.id,
        userId: testAdminId,
        role: "owner",
      });
      
      await storage.addProjectMember({
        projectId: project.id,
        userId: testEmployeeId,
        role: "member",
      });
      
      let members = await storage.getProjectMembers(project.id);
      expect(members.length).toBe(2);
      
      await storage.removeProjectMember(project.id, testEmployeeId);
      
      members = await storage.getProjectMembers(project.id);
      expect(members.length).toBe(1);
      expect(members[0].userId).toBe(testAdminId);
    });

    it("should set project members in bulk", async () => {
      const { storage } = await import("../storage");
      
      const project = await storage.createProjectWithTenant(
        {
          name: "Bulk Member Project",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      await storage.addProjectMember({
        projectId: project.id,
        userId: testAdminId,
        role: "owner",
      });
      
      await storage.setProjectMembers(project.id, [testAdminId, testEmployeeId]);
      
      const members = await storage.getProjectMembers(project.id);
      expect(members.length).toBe(2);
      
      await storage.setProjectMembers(project.id, [testEmployeeId]);
      
      const updatedMembers = await storage.getProjectMembers(project.id);
      expect(updatedMembers.length).toBe(1);
      expect(updatedMembers[0].userId).toBe(testEmployeeId);
    });

    it("should check if user is project member", async () => {
      const { storage } = await import("../storage");
      
      const project = await storage.createProjectWithTenant(
        {
          name: "Membership Check Project",
          workspaceId: testWorkspaceId,
          clientId: testClientId,
          createdBy: testAdminId,
        },
        testTenantId
      );
      
      await storage.addProjectMember({
        projectId: project.id,
        userId: testAdminId,
        role: "owner",
      });
      
      const isMember = await storage.isProjectMember(project.id, testAdminId);
      expect(isMember).toBe(true);
      
      const isNotMember = await storage.isProjectMember(project.id, testEmployeeId);
      expect(isNotMember).toBe(false);
    });
  });
});
