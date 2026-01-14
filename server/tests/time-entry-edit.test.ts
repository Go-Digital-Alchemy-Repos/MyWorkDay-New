/**
 * Time Entry Edit Tests
 * 
 * Tests for time entry edit validation patterns:
 * - Duration validation (must be > 0)
 * - Entry ownership check
 * - Relationship validation (project/task must exist)
 * - Field updates
 */

import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { Express, Response, NextFunction } from "express";
import session from "express-session";

interface MockTimeEntry {
  id: string;
  userId: string;
  description: string;
  durationSeconds: number;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  scope: string;
  startTime: string;
  endTime: string | null;
}

interface MockProject {
  id: string;
  name: string;
}

interface MockTask {
  id: string;
  title: string;
  projectId: string;
  parentTaskId: string | null;
  status: string;
}

describe("Time Entry Edit Pattern Tests", () => {
  let app: Express;

  const mockUser = { id: "user-1", tenantId: "tenant-1" };
  const otherUser = { id: "user-2", tenantId: "tenant-1" };
  
  const mockProjects: MockProject[] = [
    { id: "project-1", name: "Test Project" },
    { id: "project-2", name: "Other Project" },
  ];
  
  const mockTasks: MockTask[] = [
    { id: "task-1", title: "Parent Task", projectId: "project-1", parentTaskId: null, status: "todo" },
    { id: "task-2", title: "Subtask", projectId: "project-1", parentTaskId: "task-1", status: "todo" },
    { id: "task-3", title: "Other Task", projectId: "project-2", parentTaskId: null, status: "todo" },
  ];
  
  const mockTimeEntries: MockTimeEntry[] = [
    {
      id: "entry-1",
      userId: "user-1",
      description: "Test entry",
      durationSeconds: 3600,
      clientId: "client-1",
      projectId: "project-1",
      taskId: "task-1",
      scope: "in_scope",
      startTime: new Date().toISOString(),
      endTime: null,
    },
    {
      id: "entry-2",
      userId: "user-2",
      description: "Other user entry",
      durationSeconds: 1800,
      clientId: null,
      projectId: null,
      taskId: null,
      scope: "in_scope",
      startTime: new Date().toISOString(),
      endTime: null,
    },
  ];

  function createAppWithUser(user: any | null) {
    const testApp = express();
    testApp.use(express.json());
    testApp.use(session({
      secret: "test-secret",
      resave: false,
      saveUninitialized: false,
    }));

    testApp.use((req: any, _res: Response, next: NextFunction) => {
      req.user = user;
      next();
    });

    const requireAuth = (req: any, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      next();
    };

    testApp.patch("/api/time-entries/:id", requireAuth, (req: any, res) => {
      const { id } = req.params;
      const entry = mockTimeEntries.find(e => e.id === id);
      
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }

      if (entry.userId !== req.user.id) {
        return res.status(403).json({ error: "Not authorized to edit this entry" });
      }

      const { durationSeconds, projectId, taskId, description, scope, startTime, endTime } = req.body;

      if (durationSeconds !== undefined) {
        if (typeof durationSeconds !== "number" || durationSeconds <= 0) {
          return res.status(400).json({ error: "Duration must be greater than zero" });
        }
        entry.durationSeconds = durationSeconds;
      }

      if (projectId !== undefined) {
        if (projectId !== null) {
          const project = mockProjects.find(p => p.id === projectId);
          if (!project) {
            return res.status(400).json({ error: "Project not found or not accessible" });
          }
        }
        entry.projectId = projectId;
      }

      if (taskId !== undefined) {
        if (taskId !== null) {
          const task = mockTasks.find(t => t.id === taskId);
          if (!task) {
            return res.status(400).json({ error: "Task not found or not in project" });
          }
          if (entry.projectId && task.projectId !== entry.projectId) {
            return res.status(400).json({ error: "Task does not belong to selected project" });
          }
        }
        entry.taskId = taskId;
      }

      if (description !== undefined) {
        entry.description = description;
      }

      if (scope !== undefined) {
        entry.scope = scope;
      }

      if (startTime !== undefined) {
        entry.startTime = startTime;
      }

      if (endTime !== undefined) {
        entry.endTime = endTime;
      }

      return res.json(entry);
    });

    testApp.get("/api/projects/:id/tasks", requireAuth, (req: any, res) => {
      const { id } = req.params;
      const tasks = mockTasks.filter(t => t.projectId === id);
      return res.json(tasks);
    });

    return testApp;
  }

  beforeAll(() => {
    app = createAppWithUser(mockUser);
  });

  describe("Duration Validation", () => {
    it("should reject time entry update with zero duration", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ durationSeconds: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Duration must be greater than zero");
    });

    it("should reject time entry update with negative duration", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ durationSeconds: -100 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Duration must be greater than zero");
    });

    it("should accept valid duration update", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ durationSeconds: 7200 });

      expect(response.status).toBe(200);
      expect(response.body.durationSeconds).toBe(7200);
    });
  });

  describe("Authorization", () => {
    it("should return 401 when not authenticated", async () => {
      const unauthApp = createAppWithUser(null);
      const response = await request(unauthApp)
        .patch("/api/time-entries/entry-1")
        .send({ description: "Updated" });

      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent entry", async () => {
      const response = await request(app)
        .patch("/api/time-entries/non-existent-id")
        .send({ description: "Updated" });

      expect(response.status).toBe(404);
    });

    it("should return 403 when editing another user's entry", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-2")
        .send({ description: "Updated" });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain("Not authorized");
    });

    it("should allow user to update their own entry", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ description: "Updated by owner" });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe("Updated by owner");
    });
  });

  describe("Relationship Validation", () => {
    it("should reject update with non-existent project", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ projectId: "non-existent-project-id" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Project not found");
    });

    it("should reject update with non-existent task", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ taskId: "non-existent-task-id" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Task not found");
    });

    it("should reject task that doesn't belong to selected project", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ taskId: "task-3" });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain("Task does not belong to selected project");
    });

    it("should accept update with valid task from project", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ taskId: "task-2" });

      expect(response.status).toBe(200);
      expect(response.body.taskId).toBe("task-2");
    });

    it("should accept clearing task (null)", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ taskId: null });

      expect(response.status).toBe(200);
      expect(response.body.taskId).toBe(null);
    });
  });

  describe("Task/Subtask Scoping", () => {
    it("should return tasks for project including parent and subtasks", async () => {
      const response = await request(app)
        .get("/api/projects/project-1/tasks");

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      
      const taskIds = response.body.map((t: any) => t.id);
      expect(taskIds).toContain("task-1");
      expect(taskIds).toContain("task-2");
    });

    it("should include parentTaskId for subtasks", async () => {
      const response = await request(app)
        .get("/api/projects/project-1/tasks");

      expect(response.status).toBe(200);
      
      const subTaskResult = response.body.find((t: any) => t.id === "task-2");
      expect(subTaskResult).toBeDefined();
      expect(subTaskResult.parentTaskId).toBe("task-1");
    });

    it("should only return tasks for requested project", async () => {
      const response = await request(app)
        .get("/api/projects/project-2/tasks");

      expect(response.status).toBe(200);
      expect(response.body.length).toBe(1);
      expect(response.body[0].id).toBe("task-3");
    });
  });

  describe("Field Updates", () => {
    it("should update description", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ description: "New description" });

      expect(response.status).toBe(200);
      expect(response.body.description).toBe("New description");
    });

    it("should update scope", async () => {
      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({ scope: "out_of_scope" });

      expect(response.status).toBe(200);
      expect(response.body.scope).toBe("out_of_scope");
    });

    it("should update start/end time", async () => {
      const startTime = new Date("2024-01-15T09:00:00Z").toISOString();
      const endTime = new Date("2024-01-15T11:00:00Z").toISOString();

      const response = await request(app)
        .patch("/api/time-entries/entry-1")
        .send({
          startTime,
          endTime,
        });

      expect(response.status).toBe(200);
      expect(response.body.startTime).toBe(startTime);
      expect(response.body.endTime).toBe(endTime);
    });
  });
});
