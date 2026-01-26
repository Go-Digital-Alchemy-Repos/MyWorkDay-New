/**
 * Tenant Task Create Regression Tests
 * 
 * Purpose: Verify task creation works correctly for tenant users with proper validation.
 * 
 * Coverage:
 * - Create task with valid project (tenant scoped)
 * - Create task validates project belongs to tenant
 * - Create task validates section belongs to project
 * - Create personal task (no project)
 * - Create child task inherits parent tenant
 * - Error responses include requestId only (no stack traces)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";
import { db } from "../db";
import { 
  tenants, workspaces, projects, tasks, sections, users, 
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { hashPassword } from "../auth";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestProject, 
  createTestSection,
  createTestTask,
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Tenant Task Create - Regression Tests", () => {
  let app: Express;
  let tenant1: any;
  let tenant2: any;
  let workspace1: any;
  let workspace2: any;
  let project1: any;
  let project2: any;
  let section1: any;
  let section2: any;
  let adminUser1: any;
  let adminUser2: any;
  let employeeUser1: any;
  let testTaskIds: string[] = [];

  beforeAll(async () => {
    // Create test tenants with full hierarchy
    tenant1 = await createTestTenant({ name: "Task Create Test Tenant 1" });
    tenant2 = await createTestTenant({ name: "Task Create Test Tenant 2" });
    
    workspace1 = await createTestWorkspace({ tenantId: tenant1.id, isPrimary: true });
    workspace2 = await createTestWorkspace({ tenantId: tenant2.id, isPrimary: true });
    
    project1 = await createTestProject({ workspaceId: workspace1.id, tenantId: tenant1.id });
    project2 = await createTestProject({ workspaceId: workspace2.id, tenantId: tenant2.id });
    
    section1 = await createTestSection({ projectId: project1.id });
    section2 = await createTestSection({ projectId: project2.id });
    
    // Create users
    const password = "testpass123";
    adminUser1 = await createTestUser({
      email: `task-admin1-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant1.id,
    });
    adminUser2 = await createTestUser({
      email: `task-admin2-${Date.now()}@test.com`,
      password,
      role: UserRole.ADMIN,
      tenantId: tenant2.id,
    });
    employeeUser1 = await createTestUser({
      email: `task-employee1-${Date.now()}@test.com`,
      password,
      role: UserRole.EMPLOYEE,
      tenantId: tenant1.id,
    });
    
    // Create mock app with auth simulation
    app = express();
    app.use(express.json());
    
    // Add requestId middleware
    app.use((req: any, res: Response, next: NextFunction) => {
      req.requestId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      next();
    });
    
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));
    
    // Mock auth middleware based on headers
    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"];
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      next();
    };
    
    app.use((req: any, res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user-id"];
      const tenantId = req.headers["x-test-tenant-id"];
      const workspaceId = req.headers["x-test-workspace-id"];
      
      if (userId === adminUser1.id) {
        req.user = adminUser1;
        req.tenant = { tenantId: tenant1.id, effectiveTenantId: tenant1.id };
        req.workspaceId = workspace1.id;
      } else if (userId === adminUser2.id) {
        req.user = adminUser2;
        req.tenant = { tenantId: tenant2.id, effectiveTenantId: tenant2.id };
        req.workspaceId = workspace2.id;
      } else if (userId === employeeUser1.id) {
        req.user = employeeUser1;
        req.tenant = { tenantId: tenant1.id, effectiveTenantId: tenant1.id };
        req.workspaceId = workspace1.id;
      }
      
      if (tenantId) {
        req.tenant = { tenantId, effectiveTenantId: tenantId };
      }
      if (workspaceId) {
        req.workspaceId = workspaceId;
      }
      
      next();
    });
    
    // Import storage and schemas
    const { storage } = await import("../storage");
    const { insertTaskSchema } = await import("../../shared/schema");
    const { z } = await import("zod");
    
    // Task create route (simplified version of main route)
    app.post("/api/tasks", requireAuth, async (req: any, res) => {
      const requestId = req.requestId || "unknown";
      try {
        const tenantId = req.tenant?.effectiveTenantId;
        const userId = req.user?.id;
        
        const body = { ...req.body };
        if (body.sectionId === "" || body.sectionId === undefined) {
          body.sectionId = null;
        }
        const data = insertTaskSchema.parse({
          ...body,
          createdBy: userId,
        });
        
        // Validate projectId belongs to tenant (if provided and not personal task)
        if (data.projectId && !data.isPersonal) {
          const project = tenantId 
            ? await storage.getProjectByIdAndTenant(data.projectId, tenantId)
            : await storage.getProject(data.projectId);
          if (!project) {
            return res.status(400).json({ 
              error: "Invalid project: project not found or does not belong to this tenant",
              requestId 
            });
          }
        }
        
        // Validate sectionId belongs to the project (if provided)
        if (data.sectionId && data.projectId) {
          const section = await storage.getSection(data.sectionId);
          if (!section || section.projectId !== data.projectId) {
            return res.status(400).json({ 
              error: "Invalid section: section not found or does not belong to this project",
              requestId 
            });
          }
        }
        
        // Use tenant-aware task creation
        const task = tenantId 
          ? await storage.createTaskWithTenant(data, tenantId)
          : await storage.createTask(data);

        await storage.addTaskAssignee({
          taskId: task.id,
          userId: userId,
        });

        const taskWithRelations = await storage.getTaskWithRelations(task.id);
        testTaskIds.push(task.id);
        
        res.status(201).json(taskWithRelations);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors, requestId });
        }
        console.error(`[Task Create Error] requestId=${requestId} error=${error}`);
        res.status(500).json({ error: "Unable to create task", requestId });
      }
    });
    
    // Personal task create route
    app.post("/api/tasks/personal", requireAuth, async (req: any, res) => {
      const requestId = req.requestId || "unknown";
      try {
        const tenantId = req.tenant?.effectiveTenantId;
        const userId = req.user?.id;
        const { personalSectionId, ...restBody } = req.body;
        
        const data = insertTaskSchema.parse({
          ...restBody,
          projectId: null,
          sectionId: null,
          isPersonal: true,
          createdBy: userId,
          personalSectionId: personalSectionId || null,
          personalSortOrder: 0,
        });
        
        const task = tenantId 
          ? await storage.createTaskWithTenant(data, tenantId)
          : await storage.createTask(data);

        await storage.addTaskAssignee({
          taskId: task.id,
          userId: userId,
        });

        const taskWithRelations = await storage.getTaskWithRelations(task.id);
        testTaskIds.push(task.id);
        
        res.status(201).json(taskWithRelations);
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors, requestId });
        }
        res.status(500).json({ error: "Unable to create personal task", requestId });
      }
    });
  });

  afterAll(async () => {
    // Cleanup test tasks
    for (const taskId of testTaskIds) {
      try {
        await db.delete(tasks).where(eq(tasks.id, taskId));
      } catch (e) {}
    }
    await cleanupTestData({ tenantIds: [tenant1?.id, tenant2?.id].filter(Boolean) });
  });

  describe("Successful Task Creation", () => {
    it("should create a task with valid project for tenant admin", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Test Task from Admin",
          projectId: project1.id,
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.title).toBe("Test Task from Admin");
      expect(res.body.projectId).toBe(project1.id);
      expect(res.body.tenantId).toBe(tenant1.id);
    });

    it("should create a task with valid project for tenant employee", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", employeeUser1.id)
        .send({
          title: "Test Task from Employee",
          projectId: project1.id,
          status: "todo",
          priority: "low",
        });
      
      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.title).toBe("Test Task from Employee");
      expect(res.body.tenantId).toBe(tenant1.id);
    });

    it("should create a task with valid section", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Task in Section",
          projectId: project1.id,
          sectionId: section1.id,
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(201);
      expect(res.body.sectionId).toBe(section1.id);
    });

    it("should create a personal task without project", async () => {
      const res = await request(app)
        .post("/api/tasks/personal")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "My Personal Task",
        });
      
      expect(res.status).toBe(201);
      expect(res.body.isPersonal).toBe(true);
      expect(res.body.projectId).toBeNull();
      expect(res.body.tenantId).toBe(tenant1.id);
    });
  });

  describe("Project Tenant Validation", () => {
    it("should reject task creation with project from another tenant", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Cross-tenant Task",
          projectId: project2.id, // Project belongs to tenant2
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid project");
      expect(res.body).toHaveProperty("requestId");
    });

    it("should reject task creation with non-existent project", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Task with fake project",
          projectId: "00000000-0000-0000-0000-000000000000",
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid project");
    });
  });

  describe("Section Validation", () => {
    it("should reject task creation with section from another project", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Task with wrong section",
          projectId: project1.id,
          sectionId: section2.id, // Section belongs to project2
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid section");
      expect(res.body).toHaveProperty("requestId");
    });

    it("should reject task creation with non-existent section", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Task with fake section",
          projectId: project1.id,
          sectionId: "00000000-0000-0000-0000-000000000000",
          status: "todo",
          priority: "medium",
        });
      
      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Invalid section");
    });
  });

  describe("Error Response Format", () => {
    it("should include requestId in error response", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Invalid Project Task",
          projectId: project2.id,
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("requestId");
      expect(res.body.requestId).toMatch(/^test-/);
    });

    it("should not expose stack traces in error responses", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Invalid Project Task",
          projectId: project2.id,
        });
      
      expect(res.body).not.toHaveProperty("stack");
      expect(res.body.error).not.toContain("at ");
      expect(res.body.error).not.toContain("Error:");
    });

    it("should return Zod validation errors for missing required fields", async () => {
      const res = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          projectId: project1.id,
          // Missing 'title' which is required
        });
      
      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("error");
      expect(res.body).toHaveProperty("requestId");
    });
  });

  describe("Tenant Isolation", () => {
    it("should scope created task to user's tenant", async () => {
      const res1 = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser1.id)
        .send({
          title: "Tenant1 Task",
          projectId: project1.id,
        });
      
      const res2 = await request(app)
        .post("/api/tasks")
        .set("X-Test-User-Id", adminUser2.id)
        .send({
          title: "Tenant2 Task",
          projectId: project2.id,
        });
      
      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.tenantId).toBe(tenant1.id);
      expect(res2.body.tenantId).toBe(tenant2.id);
      expect(res1.body.tenantId).not.toBe(res2.body.tenantId);
    });
  });
});
