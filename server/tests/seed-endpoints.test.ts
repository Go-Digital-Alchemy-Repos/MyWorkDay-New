import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import session from "express-session";
import { db } from "../db";
import { 
  tenants, 
  workspaces, 
  projects, 
  sections, 
  tasks, 
  tenantSettings,
  UserRole 
} from "../../shared/schema";
import { eq, like } from "drizzle-orm";
import superAdminRouter from "../routes/superAdmin";

describe("Seed Endpoints", () => {
  let app: Express;
  let testTenantId: string;
  let testWorkspaceId: string;
  let createdProjectIds: string[] = [];

  async function cleanupProjects() {
    for (const projectId of createdProjectIds) {
      await db.delete(tasks).where(eq(tasks.projectId, projectId)).catch(() => {});
      await db.delete(sections).where(eq(sections.projectId, projectId)).catch(() => {});
      await db.delete(projects).where(eq(projects.id, projectId)).catch(() => {});
    }
    createdProjectIds = [];
  }

  async function createTestFixtures() {
    const [newTenant] = await db.insert(tenants).values({
      name: `Test Tenant ${Date.now()}`,
      slug: `test-tenant-${Date.now()}`,
      status: "active",
    }).returning();
    testTenantId = newTenant.id;

    await db.insert(tenantSettings).values({
      tenantId: testTenantId,
      displayName: "Test Tenant Display",
    });

    const [newWorkspace] = await db.insert(workspaces).values({
      name: "Test Workspace",
      tenantId: testTenantId,
      isPrimary: true,
      createdBy: "test-user-id",
    }).returning();
    testWorkspaceId = newWorkspace.id;
  }

  async function cleanupTestFixtures() {
    if (testTenantId) {
      const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, testTenantId));
      for (const project of tenantProjects) {
        await db.delete(tasks).where(eq(tasks.projectId, project.id)).catch(() => {});
        await db.delete(sections).where(eq(sections.projectId, project.id)).catch(() => {});
      }
      await db.delete(projects).where(eq(projects.tenantId, testTenantId)).catch(() => {});
      await db.delete(workspaces).where(eq(workspaces.tenantId, testTenantId)).catch(() => {});
      await db.delete(tenantSettings).where(eq(tenantSettings.tenantId, testTenantId)).catch(() => {});
      await db.delete(tenants).where(eq(tenants.id, testTenantId)).catch(() => {});
    }
  }

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    app.use((req, res, next) => {
      const isSuperUser = req.headers["x-test-super-user"] === "true";
      (req as any).user = {
        id: "test-user-id",
        email: isSuperUser ? "super@test.com" : "tenant@test.com",
        role: isSuperUser ? UserRole.SUPER_USER : UserRole.ADMIN,
        tenantId: isSuperUser ? null : testTenantId,
      };
      (req as any).isAuthenticated = () => true;
      next();
    });

    app.use(superAdminRouter);

    await createTestFixtures();
  });

  afterEach(async () => {
    await cleanupProjects();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe("Welcome Project Seeding", () => {
    it("returns 403 for non-super users", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/seed/welcome-project`)
        .set("X-Test-Super-User", "false")
        .send({});

      expect(response.status).toBe(403);
    });

    it("returns 404 for non-existent tenant", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/00000000-0000-0000-0000-000000000000/seed/welcome-project`)
        .set("X-Test-Super-User", "true")
        .send({});

      expect(response.status).toBe(404);
    });

    it("creates welcome project with sections and tasks", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/seed/welcome-project`)
        .set("X-Test-Super-User", "true")
        .send({});

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("created");
      expect(response.body.projectId).toBeDefined();
      expect(response.body.created.sections).toBeGreaterThan(0);
      expect(response.body.created.tasks).toBeGreaterThan(0);

      createdProjectIds.push(response.body.projectId);
    });

    it("is idempotent - returns skipped on second call", async () => {
      const first = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/seed/welcome-project`)
        .set("X-Test-Super-User", "true")
        .send({});

      expect(first.status).toBe(201);
      createdProjectIds.push(first.body.projectId);

      const second = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/seed/welcome-project`)
        .set("X-Test-Super-User", "true")
        .send({});

      expect(second.status).toBe(200);
      expect(second.body.status).toBe("skipped");
      expect(second.body.reason).toBeDefined();
    });
  });

  describe("Task Template Seeding", () => {
    let testProjectId: string;

    beforeEach(async () => {
      const [newProject] = await db.insert(projects).values({
        name: `Template Test ${Date.now()}`,
        tenantId: testTenantId,
        workspaceId: testWorkspaceId,
        status: "active",
        visibility: "workspace",
        createdBy: "test-user-id",
      }).returning();

      testProjectId = newProject.id;
      createdProjectIds.push(testProjectId);
    });

    it("returns 400 for unknown template key", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "unknown_template" });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("returns 404 for non-existent project", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/00000000-0000-0000-0000-000000000000/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "general_setup" });

      expect(response.status).toBe(404);
    });

    it("applies general_setup template successfully", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "general_setup" });

      expect(response.status).toBe(201);
      expect(response.body.status).toBe("applied");
      expect(response.body.created.sections).toBeGreaterThan(0);
      expect(response.body.created.tasks).toBeGreaterThan(0);
    });

    it("deduplicates on re-application - returns zero created", async () => {
      const first = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "general_setup" });

      expect(first.status).toBe(201);

      const second = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "general_setup" });

      expect(second.status).toBe(200);
      expect(second.body.created.sections).toBe(0);
      expect(second.body.created.tasks).toBe(0);
    });
  });

  describe("Bulk Task Import", () => {
    let testProjectId: string;

    beforeEach(async () => {
      const [newProject] = await db.insert(projects).values({
        name: `Bulk Import Test ${Date.now()}`,
        tenantId: testTenantId,
        workspaceId: testWorkspaceId,
        status: "active",
        visibility: "workspace",
        createdBy: "test-user-id",
      }).returning();

      testProjectId = newProject.id;
      createdProjectIds.push(testProjectId);
    });

    it("returns 400 for missing required fields", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/tasks/bulk`)
        .set("X-Test-Super-User", "true")
        .send({
          rows: [{ sectionName: "Work" }],
          options: { createMissingSections: true, allowUnknownAssignees: false },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeGreaterThan(0);
      expect(response.body.createdTasks).toBe(0);
    });

    it("creates tasks and sections successfully", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/tasks/bulk`)
        .set("X-Test-Super-User", "true")
        .send({
          rows: [
            { sectionName: "To Do", taskTitle: "Task 1" },
            { sectionName: "To Do", taskTitle: "Task 2" },
            { sectionName: "In Progress", taskTitle: "Task 3" },
          ],
          options: { createMissingSections: true, allowUnknownAssignees: false },
        });

      expect(response.status).toBe(201);
      expect(response.body.createdTasks).toBe(3);
      expect(response.body.createdSections).toBe(2);
      expect(response.body.errors).toBe(0);
    });

    it("creates subtasks linked to parent tasks", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/tasks/bulk`)
        .set("X-Test-Super-User", "true")
        .send({
          rows: [
            { sectionName: "Work", taskTitle: "Parent Task" },
            { sectionName: "Work", taskTitle: "Child Task 1", parentTaskTitle: "Parent Task" },
            { sectionName: "Work", taskTitle: "Child Task 2", parentTaskTitle: "Parent Task" },
          ],
          options: { createMissingSections: true, allowUnknownAssignees: false },
        });

      expect(response.status).toBe(201);
      expect(response.body.createdTasks).toBe(1);
      expect(response.body.createdSubtasks).toBe(2);

      const createdTasks = await db.select().from(tasks).where(eq(tasks.projectId, testProjectId));
      const parentTask = createdTasks.find(t => t.title === "Parent Task");
      const childTasks = createdTasks.filter(t => t.parentTaskId === parentTask?.id);
      expect(childTasks.length).toBe(2);
    });

    it("fails section creation when createMissingSections is false", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/${testTenantId}/projects/${testProjectId}/tasks/bulk`)
        .set("X-Test-Super-User", "true")
        .send({
          rows: [{ sectionName: "NonExistent", taskTitle: "Task 1" }],
          options: { createMissingSections: false, allowUnknownAssignees: false },
        });

      expect(response.status).toBe(200);
      expect(response.body.errors).toBeGreaterThan(0);
      expect(response.body.createdTasks).toBe(0);
    });
  });

  describe("Tenant Isolation", () => {
    it("returns 404 for non-existent tenant on template", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/00000000-0000-0000-0000-000000000000/projects/00000000-0000-0000-0000-000000000001/seed/task-template`)
        .set("X-Test-Super-User", "true")
        .send({ templateKey: "general_setup" });

      expect(response.status).toBe(404);
    });

    it("returns 404 for non-existent tenant on bulk import", async () => {
      const response = await request(app)
        .post(`/api/v1/super/tenants/00000000-0000-0000-0000-000000000000/projects/00000000-0000-0000-0000-000000000001/tasks/bulk`)
        .set("X-Test-Super-User", "true")
        .send({
          rows: [{ sectionName: "Test", taskTitle: "Task" }],
          options: { createMissingSections: true, allowUnknownAssignees: false },
        });

      expect(response.status).toBe(404);
    });
  });
});
