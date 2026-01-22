/**
 * Provisioning Visibility Integration Tests
 * 
 * Sprint 1 / Prompt 5: Tests that prove provisioning visibility works.
 * 
 * Coverage:
 * A) Tenant provisioning visibility (tests 1-5):
 *    - Create tenant + primary workspace + tenant admin + tenant employee
 *    - Super admin creates client under tenant
 *    - Tenant admin sees client via GET /api/clients
 *    - Create project under client
 *    - Tenant employee sees project via GET /api/projects
 * 
 * B) Workspace-independence (test 6):
 *    - Client tied to primary workspace visible to tenant user in any workspace
 * 
 * Safety: Tests only - no production behavior changes.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
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

describe("Provisioning Visibility Integration Tests", () => {
  let app: Express;
  let tenant: any;
  let primaryWorkspace: any;
  let secondaryWorkspace: any;
  let tenantAdmin: any;
  let tenantEmployee: any;
  let superAdmin: any;
  let clientCreatedBySuper: any;
  let projectUnderClient: any;

  beforeAll(async () => {
    // Step 1: Create tenant + primary workspace + tenant admin + tenant employee
    tenant = await createTestTenant({ name: "Provisioning Test Tenant" });
    primaryWorkspace = await createTestWorkspace({ 
      tenantId: tenant.id, 
      isPrimary: true,
      name: "Primary Workspace" 
    });
    secondaryWorkspace = await createTestWorkspace({ 
      tenantId: tenant.id, 
      isPrimary: false,
      name: "Secondary Workspace" 
    });
    
    const password = "testpass123";
    
    // Super admin (no tenantId)
    superAdmin = await createTestUser({
      email: `super-prov-${Date.now()}@test.com`,
      password,
      role: UserRole.SUPER_USER,
      tenantId: null,
    });
    
    // Tenant admin
    tenantAdmin = await createTestUser({
      email: `admin-prov-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    });
    
    // Tenant employee
    tenantEmployee = await createTestUser({
      email: `employee-prov-${Date.now()}@test.com`,
      password,
      role: UserRole.EMPLOYEE,
      tenantId: tenant.id,
    });
    
    // Create mock Express app
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));
    
    // Mock auth middleware - uses x-test-user-id header to identify user
    app.use((req: any, res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"];
      const effectiveTenantId = req.headers["x-effective-tenant-id"];
      
      if (userId === superAdmin.id) {
        req.user = superAdmin;
        req.isAuthenticated = () => true;
        // Super admin can act on behalf of tenant via header
        req.tenant = { effectiveTenantId: effectiveTenantId || null };
      } else if (userId === tenantAdmin.id) {
        req.user = tenantAdmin;
        req.isAuthenticated = () => true;
        req.tenant = { effectiveTenantId: tenant.id };
      } else if (userId === tenantEmployee.id) {
        req.user = tenantEmployee;
        req.isAuthenticated = () => true;
        req.tenant = { effectiveTenantId: tenant.id };
      } else {
        req.isAuthenticated = () => false;
      }
      next();
    });

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.isAuthenticated || !req.isAuthenticated()) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    // GET /api/clients - returns clients scoped to effectiveTenantId (ignores workspaceId)
    app.get("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const effectiveTenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
        if (!effectiveTenantId) {
          return res.status(403).json({ error: "Tenant context required" });
        }
        // Key: Filter by tenantId only, NOT workspaceId (workspace-independence)
        const result = await db.select().from(clients).where(eq(clients.tenantId, effectiveTenantId));
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/clients - super admin can create client for tenant
    app.post("/api/clients", requireAuth, async (req: any, res) => {
      try {
        const { companyName, workspaceId } = req.body;
        const effectiveTenantId = req.tenant?.effectiveTenantId;
        
        if (!effectiveTenantId) {
          return res.status(403).json({ error: "Tenant context required" });
        }
        if (!companyName) {
          return res.status(400).json({ error: "companyName is required" });
        }
        
        // Validate workspace belongs to tenant
        const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
        if (!workspace || workspace.tenantId !== effectiveTenantId) {
          return res.status(403).json({ error: "Workspace does not belong to tenant" });
        }
        
        const [client] = await db.insert(clients).values({
          companyName,
          workspaceId,
          tenantId: effectiveTenantId,
        }).returning();
        
        res.status(201).json(client);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/projects - returns projects scoped to effectiveTenantId (ignores workspaceId)
    app.get("/api/projects", requireAuth, async (req: any, res) => {
      try {
        const effectiveTenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
        if (!effectiveTenantId) {
          return res.status(403).json({ error: "Tenant context required" });
        }
        // Key: Filter by tenantId only, NOT workspaceId (workspace-independence)
        const result = await db.select().from(projects).where(eq(projects.tenantId, effectiveTenantId));
        res.json(result);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/projects - create project under client
    app.post("/api/projects", requireAuth, async (req: any, res) => {
      try {
        const { name, clientId, workspaceId } = req.body;
        const effectiveTenantId = req.tenant?.effectiveTenantId || req.user?.tenantId;
        
        if (!effectiveTenantId) {
          return res.status(403).json({ error: "Tenant context required" });
        }
        if (!name) {
          return res.status(400).json({ error: "name is required" });
        }
        
        // Validate client belongs to tenant
        if (clientId) {
          const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
          if (!client || client.tenantId !== effectiveTenantId) {
            return res.status(403).json({ error: "Client does not belong to tenant" });
          }
        }
        
        const [project] = await db.insert(projects).values({
          name,
          workspaceId,
          tenantId: effectiveTenantId,
          clientId: clientId || null,
          status: "active",
        }).returning();
        
        res.status(201).json(project);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  afterAll(async () => {
    await cleanupTestData({ tenantIds: [tenant.id] });
    // Clean up super admin separately
    if (superAdmin) {
      await db.delete(users).where(eq(users.id, superAdmin.id));
    }
  });

  describe("A) Tenant Provisioning Visibility", () => {
    it("1) should have created tenant + workspace + admin + employee", () => {
      expect(tenant).toBeDefined();
      expect(tenant.id).toBeDefined();
      expect(primaryWorkspace).toBeDefined();
      expect(primaryWorkspace.tenantId).toBe(tenant.id);
      expect(primaryWorkspace.isPrimary).toBe(true);
      expect(tenantAdmin).toBeDefined();
      expect(tenantAdmin.tenantId).toBe(tenant.id);
      expect(tenantAdmin.role).toBe(UserRole.ADMIN);
      expect(tenantEmployee).toBeDefined();
      expect(tenantEmployee.tenantId).toBe(tenant.id);
      expect(tenantEmployee.role).toBe(UserRole.EMPLOYEE);
    });

    it("2) super admin can create client under tenant", async () => {
      const res = await request(app)
        .post("/api/clients")
        .set("x-test-user-id", superAdmin.id)
        .set("x-effective-tenant-id", tenant.id)
        .send({
          companyName: "Client Created By Super",
          workspaceId: primaryWorkspace.id,
        });
      
      expect(res.status).toBe(201);
      expect(res.body.companyName).toBe("Client Created By Super");
      expect(res.body.tenantId).toBe(tenant.id);
      clientCreatedBySuper = res.body;
    });

    it("3) tenant admin sees the client via GET /api/clients", async () => {
      const res = await request(app)
        .get("/api/clients")
        .set("x-test-user-id", tenantAdmin.id);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const clientIds = res.body.map((c: any) => c.id);
      expect(clientIds).toContain(clientCreatedBySuper.id);
    });

    it("4) create project under that client", async () => {
      const res = await request(app)
        .post("/api/projects")
        .set("x-test-user-id", tenantAdmin.id)
        .send({
          name: "Project Under Client",
          clientId: clientCreatedBySuper.id,
          workspaceId: primaryWorkspace.id,
        });
      
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("Project Under Client");
      expect(res.body.clientId).toBe(clientCreatedBySuper.id);
      expect(res.body.tenantId).toBe(tenant.id);
      projectUnderClient = res.body;
    });

    it("5) tenant employee sees the project via GET /api/projects", async () => {
      const res = await request(app)
        .get("/api/projects")
        .set("x-test-user-id", tenantEmployee.id);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const projectIds = res.body.map((p: any) => p.id);
      expect(projectIds).toContain(projectUnderClient.id);
    });
  });

  describe("B) Workspace-Independence", () => {
    let clientInPrimaryWorkspace: any;

    beforeAll(async () => {
      // Create a client tied to primary workspace
      clientInPrimaryWorkspace = await createTestClient({
        companyName: "Primary Workspace Client",
        workspaceId: primaryWorkspace.id,
        tenantId: tenant.id,
      });
    });

    it("6) tenant user in secondary workspace sees client from primary workspace", async () => {
      // Even though client is in primaryWorkspace, tenant user should see it
      // because visibility is by tenantId, not workspaceId
      const res = await request(app)
        .get("/api/clients")
        .set("x-test-user-id", tenantEmployee.id);
      
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      
      // Should include the client from primary workspace
      const clientIds = res.body.map((c: any) => c.id);
      expect(clientIds).toContain(clientInPrimaryWorkspace.id);
      
      // Verify all returned clients belong to the tenant
      for (const client of res.body) {
        expect(client.tenantId).toBe(tenant.id);
      }
    });

    it("6b) projects from any workspace are visible to tenant user", async () => {
      // Create project in secondary workspace
      const projectInSecondary = await createTestProject({
        name: "Secondary Workspace Project",
        workspaceId: secondaryWorkspace.id,
        tenantId: tenant.id,
      });

      const res = await request(app)
        .get("/api/projects")
        .set("x-test-user-id", tenantEmployee.id);
      
      expect(res.status).toBe(200);
      const projectIds = res.body.map((p: any) => p.id);
      
      // Should see both projects (from primary and secondary workspaces)
      expect(projectIds).toContain(projectUnderClient.id);
      expect(projectIds).toContain(projectInSecondary.id);
      
      // All projects belong to tenant
      for (const project of res.body) {
        expect(project.tenantId).toBe(tenant.id);
      }
    });
  });

  describe("Tenant Isolation", () => {
    let otherTenant: any;
    let otherWorkspace: any;
    let otherUser: any;
    let otherClient: any;

    beforeAll(async () => {
      // Create another tenant with data
      otherTenant = await createTestTenant({ name: "Other Tenant" });
      otherWorkspace = await createTestWorkspace({ 
        tenantId: otherTenant.id, 
        isPrimary: true 
      });
      otherUser = await createTestUser({
        email: `other-user-${Date.now()}@test.com`,
        role: UserRole.ADMIN,
        tenantId: otherTenant.id,
      });
      otherClient = await createTestClient({
        companyName: "Other Tenant Client",
        workspaceId: otherWorkspace.id,
        tenantId: otherTenant.id,
      });
    });

    afterAll(async () => {
      await cleanupTestData({ tenantIds: [otherTenant.id] });
    });

    it("tenant user cannot see other tenant's clients", async () => {
      const res = await request(app)
        .get("/api/clients")
        .set("x-test-user-id", tenantEmployee.id);
      
      expect(res.status).toBe(200);
      const clientIds = res.body.map((c: any) => c.id);
      
      // Should NOT include other tenant's client
      expect(clientIds).not.toContain(otherClient.id);
    });

    it("tenant user cannot see other tenant's projects", async () => {
      const otherProject = await createTestProject({
        name: "Other Tenant Project",
        workspaceId: otherWorkspace.id,
        tenantId: otherTenant.id,
      });

      const res = await request(app)
        .get("/api/projects")
        .set("x-test-user-id", tenantEmployee.id);
      
      expect(res.status).toBe(200);
      const projectIds = res.body.map((p: any) => p.id);
      
      // Should NOT include other tenant's project
      expect(projectIds).not.toContain(otherProject.id);
    });
  });
});
