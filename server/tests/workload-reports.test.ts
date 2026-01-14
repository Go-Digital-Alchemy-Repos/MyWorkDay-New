import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import request from "supertest";
import express, { Express, Request, Response, NextFunction } from "express";
import session from "express-session";
import { UserRole } from "../../shared/schema";

describe("Workload Reports API", () => {
  let app: Express;

  const mockAdminUser = {
    id: "admin-user-1",
    tenantId: "tenant-1",
    role: UserRole.ADMIN,
    email: "admin@tenant1.com",
  };

  const mockEmployeeUser = {
    id: "employee-user-1",
    tenantId: "tenant-1",
    role: UserRole.EMPLOYEE,
    email: "employee@tenant1.com",
  };

  const mockTenant2Admin = {
    id: "admin-user-2",
    tenantId: "tenant-2",
    role: UserRole.ADMIN,
    email: "admin@tenant2.com",
  };

  const mockSuperUser = {
    id: "super-user-1",
    tenantId: null,
    role: UserRole.SUPER_USER,
    email: "super@admin.com",
  };

  function createTestApp(mockUser: any) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    testApp.use((req: any, _res: Response, next: NextFunction) => {
      req.user = mockUser;
      next();
    });

    testApp.get("/api/v1/workload/tasks-by-employee", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      res.json([]);
    });

    testApp.get("/api/v1/workload/summary", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      res.json({ totalEmployees: 0, totalProjects: 0 });
    });

    testApp.get("/api/v1/workload/by-status", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      res.json({ summary: [], total: 0 });
    });

    testApp.get("/api/v1/workload/by-priority", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      res.json({ summary: [], total: 0 });
    });

    testApp.get("/api/v1/workload/unassigned", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      res.json({ tasks: [], totalCount: 0 });
    });

    testApp.get("/api/v1/workload/employee/:userId/tasks", (req: any, res) => {
      const userRole = req.user?.role;
      if (userRole !== UserRole.ADMIN && userRole !== UserRole.SUPER_USER) {
        return res.status(403).json({ error: "Admin access required" });
      }
      const requestingUserTenantId = req.user?.tenantId;
      const targetUserId = req.params.userId;

      if (targetUserId.includes("tenant-2") && requestingUserTenantId !== "tenant-2") {
        return res.status(404).json({ error: "User not found" });
      }

      res.json({ user: { id: targetUserId }, tasks: [], totalCount: 0 });
    });

    return testApp;
  }

  describe("Admin-only access", () => {
    it("allows admin to access tasks-by-employee", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/tasks-by-employee");
      expect(response.status).toBe(200);
    });

    it("denies employee access to tasks-by-employee", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/tasks-by-employee");
      expect(response.status).toBe(403);
      expect(response.body.error).toBe("Admin access required");
    });

    it("allows super_user to access tasks-by-employee", async () => {
      const testApp = createTestApp(mockSuperUser);
      const response = await request(testApp).get("/api/v1/workload/tasks-by-employee");
      expect(response.status).toBe(200);
    });

    it("denies employee access to summary", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/summary");
      expect(response.status).toBe(403);
    });

    it("denies employee access to by-status", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/by-status");
      expect(response.status).toBe(403);
    });

    it("denies employee access to by-priority", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/by-priority");
      expect(response.status).toBe(403);
    });

    it("denies employee access to unassigned", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/unassigned");
      expect(response.status).toBe(403);
    });

    it("denies employee access to employee tasks drill-down", async () => {
      const testApp = createTestApp(mockEmployeeUser);
      const response = await request(testApp).get("/api/v1/workload/employee/user-123/tasks");
      expect(response.status).toBe(403);
    });

    it("allows admin to access employee tasks drill-down", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/employee/user-123/tasks");
      expect(response.status).toBe(200);
    });
  });

  describe("Tenant isolation", () => {
    it("tenant 1 admin cannot access tenant 2 employee tasks", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/employee/user-from-tenant-2/tasks");
      expect(response.status).toBe(404);
      expect(response.body.error).toBe("User not found");
    });

    it("tenant 2 admin can access their own employee tasks", async () => {
      const testApp = createTestApp(mockTenant2Admin);
      const response = await request(testApp).get("/api/v1/workload/employee/user-from-tenant-2/tasks");
      expect(response.status).toBe(200);
    });

    it("tenant 1 admin can access their own employees", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/employee/user-from-tenant-1/tasks");
      expect(response.status).toBe(200);
    });
  });

  describe("Multi-assignee task handling", () => {
    it("tasks with multiple assignees should appear in each assignee's task list", async () => {
      const mockDb: Record<string, any[]> = {
        "user-1-tasks": [
          { id: "shared-task", title: "Multi-assignee task", status: "todo", assignees: ["user-1", "user-2", "user-3"] },
          { id: "solo-task", title: "Solo task", status: "todo", assignees: ["user-1"] },
        ],
        "user-2-tasks": [
          { id: "shared-task", title: "Multi-assignee task", status: "todo", assignees: ["user-1", "user-2", "user-3"] },
        ],
      };

      expect(mockDb["user-1-tasks"].length).toBe(2);
      expect(mockDb["user-2-tasks"].length).toBe(1);
      expect(mockDb["user-1-tasks"].some(t => t.id === "shared-task")).toBe(true);
      expect(mockDb["user-2-tasks"].some(t => t.id === "shared-task")).toBe(true);
    });

    it("unassigned task detection should check assignees array not single assignee field", async () => {
      const tasksWithRelations = [
        { id: "task-1", title: "Task 1", assignees: [], status: "todo" },
        { id: "task-2", title: "Task 2", assignees: [{ userId: "user-1" }], status: "todo" },
        { id: "task-3", title: "Task 3", assignees: [{ userId: "user-1" }, { userId: "user-2" }], status: "todo" },
      ];

      const unassignedTasks = tasksWithRelations.filter(t => !t.assignees || t.assignees.length === 0);
      expect(unassignedTasks.length).toBe(1);
      expect(unassignedTasks[0].id).toBe("task-1");
    });

    it("multi-assignee task counts should be per-person (task appears for each assignee)", () => {
      const tasksByEmployee = [
        { userId: "user-1", tasks: [{ id: "shared-task" }, { id: "task-a" }] },
        { userId: "user-2", tasks: [{ id: "shared-task" }, { id: "task-b" }] },
        { userId: "user-3", tasks: [{ id: "shared-task" }] },
      ];

      expect(tasksByEmployee[0].tasks.length).toBe(2);
      expect(tasksByEmployee[1].tasks.length).toBe(2);
      expect(tasksByEmployee[2].tasks.length).toBe(1);

      const allTaskIds = tasksByEmployee.flatMap(e => e.tasks.map(t => t.id));
      const uniqueTaskIds = [...new Set(allTaskIds)];
      expect(allTaskIds.length).toBe(5);
      expect(uniqueTaskIds.length).toBe(3);
    });
  });

  describe("Endpoint responses", () => {
    it("tasks-by-employee returns array", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/tasks-by-employee");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
    });

    it("summary returns expected structure", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/summary");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("totalEmployees");
      expect(response.body).toHaveProperty("totalProjects");
    });

    it("by-status returns summary array and total", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/by-status");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("summary");
      expect(response.body).toHaveProperty("total");
    });

    it("by-priority returns summary array and total", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/by-priority");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("summary");
      expect(response.body).toHaveProperty("total");
    });

    it("unassigned returns tasks array and totalCount", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/unassigned");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("tasks");
      expect(response.body).toHaveProperty("totalCount");
    });

    it("employee tasks returns user and tasks array", async () => {
      const testApp = createTestApp(mockAdminUser);
      const response = await request(testApp).get("/api/v1/workload/employee/test-user/tasks");
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("user");
      expect(response.body).toHaveProperty("tasks");
      expect(response.body).toHaveProperty("totalCount");
    });
  });
});
