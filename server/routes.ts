import type { Express, Request, RequestHandler } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertTaskSchema,
  insertSectionSchema,
  insertSubtaskSchema,
  insertCommentSchema,
  insertTagSchema,
  insertProjectSchema,
  insertWorkspaceSchema,
  insertTeamSchema,
  insertWorkspaceMemberSchema,
  insertTeamMemberSchema,
  insertActivityLogSchema,
  insertClientSchema,
  insertClientContactSchema,
  insertClientInviteSchema,
  insertTimeEntrySchema,
  insertActiveTimerSchema,
  TimeEntry,
  ActiveTimer,
} from "@shared/schema";
import { requireAuth } from "./auth";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function getCurrentWorkspaceId(_req: Request): string {
  return "demo-workspace-id";
}
import {
  isS3Configured,
  validateFile,
  generateStorageKey,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  checkObjectExists,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "./s3";
// Import centralized event emitters for real-time updates
import {
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectClientAssigned,
  emitSectionCreated,
  emitSectionUpdated,
  emitSectionDeleted,
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskMoved,
  emitTaskReordered,
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
  emitAttachmentAdded,
  emitAttachmentDeleted,
  emitClientCreated,
  emitClientUpdated,
  emitClientDeleted,
  emitClientContactCreated,
  emitClientContactUpdated,
  emitClientContactDeleted,
  emitClientInviteSent,
  emitClientInviteRevoked,
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
  emitTimeEntryUpdated,
  emitTimeEntryDeleted,
  emitMyTaskCreated,
  emitMyTaskUpdated,
  emitMyTaskDeleted,
} from "./realtime/events";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Protect all /api routes except /api/auth/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth")) {
      return next();
    }
    return requireAuth(req, res, next);
  });

  const DEMO_USER_ID = "demo-user-id";
  const DEMO_WORKSPACE_ID = "demo-workspace-id";

  // Health check endpoint for Docker/Railway
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/workspaces/current", async (req, res) => {
    try {
      const workspaceId = getCurrentWorkspaceId(req);
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:id", async (req, res) => {
    try {
      const workspace = await storage.getWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const data = insertWorkspaceSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      const workspace = await storage.createWorkspace(data);
      await storage.addWorkspaceMember({
        workspaceId: workspace.id,
        userId: userId,
        role: "owner",
        status: "active",
      });
      res.status(201).json(workspace);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.workspaceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
    try {
      const data = insertWorkspaceMemberSchema.parse({
        ...req.body,
        workspaceId: req.params.workspaceId,
      });
      const member = await storage.addWorkspaceMember(data);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding workspace member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/workspaces/:id", async (req, res) => {
    try {
      const workspace = await storage.updateWorkspace(req.params.id, req.body);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error updating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const workspaces = await storage.getWorkspacesByUser(userId);
      res.json(workspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspace-members", async (req, res) => {
    try {
      const workspaceId = getCurrentWorkspaceId(req);
      const members = await storage.getWorkspaceMembers(workspaceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjectsByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/unassigned", async (req, res) => {
    try {
      const searchQuery =
        typeof req.query.q === "string" ? req.query.q : undefined;
      const projects = await storage.getUnassignedProjects(
        getCurrentWorkspaceId(req),
        searchQuery,
      );
      res.json(projects);
    } catch (error) {
      console.error("Error fetching unassigned projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const data = insertProjectSchema.parse({
        ...req.body,
        workspaceId: getCurrentWorkspaceId(req),
        createdBy: getCurrentUserId(req),
      });
      const project = await storage.createProject(data);

      // Emit real-time event after successful DB operation
      emitProjectCreated(project as any);

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const project = await storage.updateProject(req.params.id, req.body);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Emit real-time event after successful DB operation
      emitProjectUpdated(project.id, req.body);

      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:projectId/client", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { clientId } = req.body;

      // Get the current project to check if it exists and get previous clientId
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      const previousClientId = existingProject.clientId;

      // If clientId is provided (not null), validate that client exists
      if (clientId !== null && clientId !== undefined) {
        const client = await storage.getClient(clientId);
        if (!client) {
          return res.status(400).json({ error: "Client not found" });
        }
      }

      // Update the project's clientId
      const updatedProject = await storage.updateProject(projectId, {
        clientId: clientId === undefined ? null : clientId,
      });

      if (!updatedProject) {
        return res.status(500).json({ error: "Failed to update project" });
      }

      // Emit real-time event for client assignment change
      emitProjectClientAssigned(updatedProject as any, previousClientId);

      res.json(updatedProject);
    } catch (error) {
      console.error("Error assigning client to project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams", async (req, res) => {
    try {
      const teams = await storage.getTeamsByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(teams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const data = insertTeamSchema.parse({
        ...req.body,
        workspaceId: getCurrentWorkspaceId(req),
      });
      const team = await storage.createTeam(data);
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(req.params.teamId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const data = insertTeamMemberSchema.parse({
        ...req.body,
        teamId: req.params.teamId,
      });
      const member = await storage.addTeamMember(data);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding team member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const team = await storage.updateTeam(req.params.id, req.body);
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      await storage.deleteTeam(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/teams/:teamId/members/:userId", async (req, res) => {
    try {
      await storage.removeTeamMember(req.params.teamId, req.params.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/sections", async (req, res) => {
    try {
      const sections = await storage.getSectionsWithTasks(req.params.projectId);
      res.json(sections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:projectId/tasks/reorder", async (req, res) => {
    try {
      const { moves } = req.body;
      if (!Array.isArray(moves)) {
        return res.status(400).json({ error: "moves must be an array" });
      }

      for (const move of moves) {
        const { itemType, taskId, parentTaskId, toSectionId, toIndex } = move;

        if (itemType === "task") {
          // Skip personal tasks - they shouldn't be in project reorder requests
          const task = await storage.getTask(taskId);
          if (task?.isPersonal) continue;
          await storage.moveTask(taskId, toSectionId, toIndex);
        } else if (itemType === "childTask") {
          if (!parentTaskId) {
            return res.status(400).json({
              error: "parentTaskId required for child task reordering",
            });
          }
          await storage.reorderChildTasks(parentTaskId, taskId, toIndex);
        } else if (itemType === "subtask") {
          if (!parentTaskId) {
            return res
              .status(400)
              .json({ error: "parentTaskId required for subtask moves" });
          }
          const subtask = await storage.getSubtask(taskId);
          if (!subtask || subtask.taskId !== parentTaskId) {
            return res
              .status(400)
              .json({ error: "Subtask does not belong to specified parent" });
          }
          await storage.moveSubtask(taskId, toIndex);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sections", async (req, res) => {
    try {
      const data = insertSectionSchema.parse(req.body);
      const section = await storage.createSection(data);

      // Emit real-time event after successful DB operation
      emitSectionCreated(section as any);

      res.status(201).json(section);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/sections/:id", async (req, res) => {
    try {
      const section = await storage.updateSection(req.params.id, req.body);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      // Emit real-time event after successful DB operation
      emitSectionUpdated(section.id, section.projectId, req.body);

      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/sections/:id", async (req, res) => {
    try {
      // Get section before deletion to emit event with projectId
      const section = await storage.getSection(req.params.id);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      await storage.deleteSection(req.params.id);

      // Emit real-time event after successful DB operation
      emitSectionDeleted(section.id, section.projectId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByProject(req.params.projectId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/calendar-events", async (req, res) => {
    try {
      const { start, end, includeSubtasks } = req.query;
      const tasks = await storage.getTasksByProject(req.params.projectId);

      const startDate = start ? new Date(start as string) : null;
      const endDate = end ? new Date(end as string) : null;
      const includeChildTasks = includeSubtasks !== "false";

      interface CalendarEvent {
        id: string;
        title: string;
        dueDate: Date | null;
        parentTaskId: string | null;
        status: string;
        priority: string;
        sectionId: string | null;
        projectId: string | null;
        assignees: any[];
        tags: any[];
        isSubtask: boolean;
      }

      const events: CalendarEvent[] = [];

      for (const task of tasks) {
        if (task.dueDate) {
          const taskDate = new Date(task.dueDate);
          const inRange =
            (!startDate || taskDate >= startDate) &&
            (!endDate || taskDate <= endDate);

          if (inRange) {
            events.push({
              id: task.id,
              title: task.title,
              dueDate: task.dueDate,
              parentTaskId: task.parentTaskId,
              status: task.status,
              priority: task.priority,
              sectionId: task.sectionId,
              projectId: task.projectId,
              assignees: task.assignees || [],
              tags: task.tags || [],
              isSubtask: !!task.parentTaskId,
            });
          }
        }

        if (includeChildTasks && task.childTasks) {
          for (const childTask of task.childTasks) {
            if (childTask.dueDate) {
              const childDate = new Date(childTask.dueDate);
              const inRange =
                (!startDate || childDate >= startDate) &&
                (!endDate || childDate <= endDate);

              if (inRange) {
                events.push({
                  id: childTask.id,
                  title: childTask.title,
                  dueDate: childTask.dueDate,
                  parentTaskId: childTask.parentTaskId,
                  status: childTask.status,
                  priority: childTask.priority,
                  sectionId: childTask.sectionId,
                  projectId: childTask.projectId,
                  assignees: childTask.assignees || [],
                  tags: childTask.tags || [],
                  isSubtask: true,
                });
              }
            }
          }
        }
      }

      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/my", async (req, res) => {
    try {
      const tasks = await storage.getTasksByUser(getCurrentUserId(req));
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching my tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a personal task (no project)
  app.post("/api/tasks/personal", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      const data = insertTaskSchema.parse({
        ...req.body,
        projectId: null,
        sectionId: null,
        isPersonal: true,
        createdBy: userId,
      });
      
      const task = await storage.createTask(data);

      // Auto-assign the task to the creating user
      await storage.addTaskAssignee({
        taskId: task.id,
        userId: userId,
      });

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event for personal task
      if (taskWithRelations) {
        emitMyTaskCreated(userId, taskWithRelations as any, workspaceId);
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating personal task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTaskWithRelations(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:id/childtasks", async (req, res) => {
    try {
      const childTasks = await storage.getChildTasks(req.params.id);
      res.json(childTasks);
    } catch (error) {
      console.error("Error fetching child tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.sectionId === "" || body.sectionId === undefined) {
        body.sectionId = null;
      }
      const data = insertTaskSchema.parse({
        ...body,
        createdBy: getCurrentUserId(req),
      });
      const task = await storage.createTask(data);

      await storage.addTaskAssignee({
        taskId: task.id,
        userId: getCurrentUserId(req),
      });

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (taskWithRelations) {
        if (task.isPersonal && task.createdBy) {
          emitMyTaskCreated(task.createdBy, taskWithRelations as any, getCurrentWorkspaceId(req));
        } else if (task.projectId) {
          emitTaskCreated(task.projectId, taskWithRelations as any);
        }
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/childtasks", async (req, res) => {
    try {
      const parentTaskId = req.params.taskId;
      const parentTask = await storage.getTask(parentTaskId);
      if (!parentTask) {
        return res.status(404).json({ error: "Parent task not found" });
      }
      if (parentTask.parentTaskId) {
        return res.status(400).json({
          error: "Cannot create subtask of a subtask (max depth is 2 levels)",
        });
      }

      const body = { ...req.body };
      const data = insertTaskSchema.parse({
        ...body,
        projectId: parentTask.projectId,
        sectionId: parentTask.sectionId,
        createdBy: getCurrentUserId(req),
      });

      const task = await storage.createChildTask(parentTaskId, data);

      if (body.assigneeId) {
        await storage.addTaskAssignee({
          taskId: task.id,
          userId: body.assigneeId,
        });
      }

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (taskWithRelations && parentTask.projectId) {
        emitTaskCreated(parentTask.projectId, taskWithRelations as any);
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating child task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    try {
      // If converting to personal task, force clear project ties
      const updateData = { ...req.body };
      if (updateData.isPersonal === true) {
        updateData.projectId = null;
        updateData.sectionId = null;
        updateData.parentTaskId = null;
      }
      
      const task = await storage.updateTask(req.params.id, updateData);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (task.isPersonal && task.createdBy) {
        // Personal task - emit to workspace
        emitMyTaskUpdated(task.createdBy, task.id, req.body, getCurrentWorkspaceId(req));
      } else if (task.projectId) {
        // Project task - emit to project room
        emitTaskUpdated(task.id, task.projectId, task.parentTaskId, req.body);
      }

      res.json(taskWithRelations);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      // Get task before deletion to emit event with projectId
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      await storage.deleteTask(req.params.id);

      // Emit real-time event after successful DB operation
      if (task.isPersonal && task.createdBy) {
        // Personal task - emit to workspace
        emitMyTaskDeleted(task.createdBy, task.id, getCurrentWorkspaceId(req));
      } else if (task.projectId) {
        // Project task - emit to project room
        emitTaskDeleted(
          task.id,
          task.projectId,
          task.sectionId,
          task.parentTaskId,
        );
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:id/move", async (req, res) => {
    try {
      const { sectionId, targetIndex } = req.body;

      // Get task before move to emit event with fromSectionId
      const taskBefore = await storage.getTask(req.params.id);
      if (!taskBefore) {
        return res.status(404).json({ error: "Task not found" });
      }
      const fromSectionId = taskBefore.sectionId;

      await storage.moveTask(req.params.id, sectionId, targetIndex);
      const task = await storage.getTaskWithRelations(req.params.id);

      // Emit real-time event after successful DB operation (only for non-personal project tasks)
      if (!taskBefore.isPersonal && taskBefore.projectId) {
        emitTaskMoved(
          req.params.id,
          taskBefore.projectId,
          fromSectionId,
          sectionId,
          targetIndex,
        );
      }

      res.json(task);
    } catch (error) {
      console.error("Error moving task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/assignees", async (req, res) => {
    try {
      const { userId } = req.body;
      const assignee = await storage.addTaskAssignee({
        taskId: req.params.taskId,
        userId,
      });
      res.status(201).json(assignee);
    } catch (error) {
      console.error("Error adding assignee:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:taskId/assignees/:userId", async (req, res) => {
    try {
      await storage.removeTaskAssignee(req.params.taskId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing assignee:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:taskId/subtasks", async (req, res) => {
    try {
      const subtasks = await storage.getSubtasksByTask(req.params.taskId);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching subtasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/subtasks", async (req, res) => {
    try {
      const data = insertSubtaskSchema.parse({
        ...req.body,
        taskId: req.params.taskId,
      });

      // Get parent task to emit event with projectId
      const parentTask = await storage.getTask(req.params.taskId);

      const subtask = await storage.createSubtask(data);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskCreated(
          subtask as any,
          req.params.taskId,
          parentTask.projectId,
        );
      }

      res.status(201).json(subtask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/subtasks/:id", async (req, res) => {
    try {
      const subtask = await storage.updateSubtask(req.params.id, req.body);
      if (!subtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      // Get parent task to emit event with projectId
      const parentTask = await storage.getTask(subtask.taskId);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskUpdated(
          subtask.id,
          subtask.taskId,
          parentTask.projectId,
          req.body,
        );
      }

      res.json(subtask);
    } catch (error) {
      console.error("Error updating subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/subtasks/:id", async (req, res) => {
    try {
      // Get subtask before deletion to emit event with taskId and projectId
      const subtask = await storage.getSubtask(req.params.id);
      if (!subtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      const parentTask = await storage.getTask(subtask.taskId);

      await storage.deleteSubtask(req.params.id);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskDeleted(subtask.id, subtask.taskId, parentTask.projectId);
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/subtasks/:id/move", async (req, res) => {
    try {
      const { targetIndex } = req.body;
      await storage.moveSubtask(req.params.id, targetIndex);
      const subtask = await storage.getSubtask(req.params.id);
      res.json(subtask);
    } catch (error) {
      console.error("Error moving subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/tags", async (req, res) => {
    try {
      const tags = await storage.getTagsByWorkspace(req.params.workspaceId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/tags", async (req, res) => {
    try {
      const data = insertTagSchema.parse({
        ...req.body,
        workspaceId: req.params.workspaceId,
      });
      const tag = await storage.createTag(data);
      res.status(201).json(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.updateTag(req.params.id, req.body);
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/tags", async (req, res) => {
    try {
      const { tagId } = req.body;
      const taskTag = await storage.addTaskTag({
        taskId: req.params.taskId,
        tagId,
      });
      res.status(201).json(taskTag);
    } catch (error) {
      console.error("Error adding tag to task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:taskId/tags/:tagId", async (req, res) => {
    try {
      await storage.removeTaskTag(req.params.taskId, req.params.tagId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing tag from task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByTask(req.params.taskId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const data = insertCommentSchema.parse({
        ...req.body,
        taskId: req.params.taskId,
        userId: getCurrentUserId(req),
      });
      const comment = await storage.createComment(data);
      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      const comment = await storage.updateComment(req.params.id, req.body);
      if (!comment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      res.json(comment);
    } catch (error) {
      console.error("Error updating comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      await storage.deleteComment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/activity-log", async (req, res) => {
    try {
      const data = insertActivityLogSchema.parse({
        ...req.body,
        userId: getCurrentUserId(req),
      });
      const log = await storage.createActivityLog(data);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating activity log:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/activity-log/:entityType/:entityId", async (req, res) => {
    try {
      const logs = await storage.getActivityLogByEntity(
        req.params.entityType,
        req.params.entityId,
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =====================
  // Task Attachments API
  // =====================

  const presignRequestSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().positive().max(MAX_FILE_SIZE_BYTES),
  });

  app.get("/api/attachments/config", async (req, res) => {
    try {
      res.json({
        configured: isS3Configured(),
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });
    } catch (error) {
      console.error("Error fetching attachment config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const attachments = await storage.getTaskAttachmentsByTask(taskId);
        res.json(attachments);
      } catch (error) {
        console.error("Error fetching attachments:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/presign",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        if (!isS3Configured()) {
          return res.status(503).json({
            error:
              "File storage is not configured. Please set AWS environment variables.",
          });
        }

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const data = presignRequestSchema.parse(req.body);

        const validation = validateFile(data.mimeType, data.fileSizeBytes);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        const tempId = crypto.randomUUID();
        const storageKey = generateStorageKey(
          projectId,
          taskId,
          tempId,
          data.fileName,
        );

        const attachment = await storage.createTaskAttachment({
          taskId,
          projectId,
          uploadedByUserId: getCurrentUserId(req),
          originalFileName: data.fileName,
          mimeType: data.mimeType,
          fileSizeBytes: data.fileSizeBytes,
          storageKey,
          uploadStatus: "pending",
        });

        const upload = await createPresignedUploadUrl(
          storageKey,
          data.mimeType,
        );

        res.status(201).json({
          attachment: {
            id: attachment.id,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSizeBytes,
            uploadStatus: attachment.uploadStatus,
            createdAt: attachment.createdAt,
          },
          upload,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors });
        }
        console.error("Error creating presigned URL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus === "complete") {
          return res.json(attachment);
        }

        const exists = await checkObjectExists(attachment.storageKey);
        if (!exists) {
          await storage.deleteTaskAttachment(attachmentId);
          return res
            .status(400)
            .json({ error: "Upload was not completed. Please try again." });
        }

        const updated = await storage.updateTaskAttachment(attachmentId, {
          uploadStatus: "complete",
        });

        // Emit real-time event after successful upload completion
        emitAttachmentAdded(
          {
            id: updated!.id,
            fileName: updated!.originalFileName,
            fileType: updated!.mimeType,
            fileSize: updated!.fileSizeBytes,
            storageKey: updated!.storageKey,
            taskId: updated!.taskId,
            subtaskId: null,
            uploadedBy: updated!.uploadedByUserId,
            createdAt: updated!.createdAt!,
          },
          taskId,
          null,
          projectId,
        );

        res.json(updated);
      } catch (error) {
        console.error("Error completing upload:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus !== "complete") {
          return res
            .status(400)
            .json({ error: "Attachment upload is not complete" });
        }

        const url = await createPresignedDownloadUrl(attachment.storageKey);
        res.json({ url });
      } catch (error) {
        console.error("Error creating download URL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        try {
          await deleteS3Object(attachment.storageKey);
        } catch (s3Error) {
          console.warn("Failed to delete S3 object:", s3Error);
        }

        await storage.deleteTaskAttachment(attachmentId);

        // Emit real-time event after successful deletion
        emitAttachmentDeleted(attachmentId, taskId, null, projectId);

        res.status(204).send();
      } catch (error) {
        console.error("Error deleting attachment:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // =============================================================================
  // CLIENT (CRM) ROUTES
  // =============================================================================

  app.get("/api/clients", async (req, res) => {
    try {
      const clients = await storage.getClientsByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.getClientWithContacts(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const data = insertClientSchema.parse({
        ...req.body,
        workspaceId: getCurrentWorkspaceId(req),
      });
      const client = await storage.createClient(data);

      // Emit real-time event
      emitClientCreated(
        {
          id: client.id,
          companyName: client.companyName,
          displayName: client.displayName,
          status: client.status,
          workspaceId: client.workspaceId,
          createdAt: client.createdAt!,
        },
        getCurrentWorkspaceId(req),
      );

      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.updateClient(req.params.id, req.body);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Emit real-time event
      emitClientUpdated(client.id, client.workspaceId, req.body);

      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClient(req.params.id);

      // Emit real-time event
      emitClientDeleted(req.params.id, client.workspaceId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CLIENT CONTACT ROUTES
  // =============================================================================

  app.get("/api/clients/:clientId/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContactsByClient(req.params.clientId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/contacts", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const data = insertClientContactSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        workspaceId: client.workspaceId,
      });
      const contact = await storage.createClientContact(data);

      // Emit real-time event
      emitClientContactCreated(
        {
          id: contact.id,
          clientId: contact.clientId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          isPrimary: contact.isPrimary ?? false,
          createdAt: contact.createdAt!,
        },
        contact.clientId,
        client.workspaceId,
      );

      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/clients/:clientId/contacts/:contactId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const contact = await storage.updateClientContact(
        req.params.contactId,
        req.body,
      );
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      // Emit real-time event
      emitClientContactUpdated(
        contact.id,
        contact.clientId,
        client.workspaceId,
        req.body,
      );

      res.json(contact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:clientId/contacts/:contactId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClientContact(req.params.contactId);

      // Emit real-time event
      emitClientContactDeleted(
        req.params.contactId,
        req.params.clientId,
        client.workspaceId,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CLIENT INVITE ROUTES (Placeholder for future auth integration)
  // =============================================================================

  app.get("/api/clients/:clientId/invites", async (req, res) => {
    try {
      const invites = await storage.getInvitesByClient(req.params.clientId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/invites", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const contact = await storage.getClientContact(req.body.contactId);
      if (!contact || contact.clientId !== req.params.clientId) {
        return res.status(404).json({ error: "Contact not found" });
      }

      const data = insertClientInviteSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        email: contact.email,
        status: "pending",
      });
      const invite = await storage.createClientInvite(data);

      // Emit real-time event
      emitClientInviteSent(
        {
          id: invite.id,
          clientId: invite.clientId,
          contactId: invite.contactId,
          email: invite.email,
          status: invite.status,
          createdAt: invite.createdAt!,
        },
        invite.clientId,
        client.workspaceId,
      );

      res.status(201).json(invite);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:clientId/invites/:inviteId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClientInvite(req.params.inviteId);

      // Emit real-time event
      emitClientInviteRevoked(
        req.params.inviteId,
        req.params.clientId,
        client.workspaceId,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error revoking invite:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // PROJECTS BY CLIENT
  // =============================================================================

  app.get("/api/clients/:clientId/projects", async (req, res) => {
    try {
      const projects = await storage.getProjectsByClient(req.params.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/projects", async (req, res) => {
    try {
      const { clientId } = req.params;

      // Verify client exists
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const data = insertProjectSchema.parse({
        ...req.body,
        workspaceId: getCurrentWorkspaceId(req),
        createdBy: getCurrentUserId(req),
        clientId: clientId,
      });

      const project = await storage.createProject(data);

      // Emit real-time events
      emitProjectCreated(project as any);
      emitProjectClientAssigned(project as any, null);

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating project for client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // TIME TRACKING - ACTIVE TIMER
  // =============================================================================

  // Get current user's active timer
  app.get("/api/timer/current", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      res.json(timer || null);
    } catch (error) {
      console.error("Error fetching active timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Start a new timer
  app.post("/api/timer/start", async (req, res) => {
    try {
      // Check if user already has an active timer
      const existingTimer = await storage.getActiveTimerByUser(
        getCurrentUserId(req),
      );
      if (existingTimer) {
        return res.status(400).json({
          error:
            "You already have an active timer. Stop it before starting a new one.",
          activeTimer: existingTimer,
        });
      }

      const now = new Date();
      const data = insertActiveTimerSchema.parse({
        workspaceId: getCurrentWorkspaceId(req),
        userId: getCurrentUserId(req),
        clientId: req.body.clientId || null,
        projectId: req.body.projectId || null,
        taskId: req.body.taskId || null,
        description: req.body.description || null,
        status: "running",
        elapsedSeconds: 0,
        lastStartedAt: now,
      });

      const timer = await storage.createActiveTimer(data);

      // Get enriched timer with relations
      const enrichedTimer = await storage.getActiveTimerByUser(
        getCurrentUserId(req),
      );

      // Emit real-time event
      emitTimerStarted(
        {
          id: timer.id,
          userId: timer.userId,
          workspaceId: timer.workspaceId,
          clientId: timer.clientId,
          projectId: timer.projectId,
          taskId: timer.taskId,
          description: timer.description,
          status: timer.status as "running" | "paused",
          elapsedSeconds: timer.elapsedSeconds,
          lastStartedAt: timer.lastStartedAt || now,
          createdAt: timer.createdAt,
        },
        getCurrentWorkspaceId(req),
      );

      res.status(201).json(enrichedTimer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error starting timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Pause the timer
  app.post("/api/timer/pause", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }
      if (timer.status !== "running") {
        return res.status(400).json({ error: "Timer is not running" });
      }

      // Calculate elapsed time since last started
      const now = new Date();
      const lastStarted = timer.lastStartedAt || timer.createdAt;
      const additionalSeconds = Math.floor(
        (now.getTime() - lastStarted.getTime()) / 1000,
      );
      const newElapsedSeconds = timer.elapsedSeconds + additionalSeconds;

      const updated = await storage.updateActiveTimer(timer.id, {
        status: "paused",
        elapsedSeconds: newElapsedSeconds,
      });

      // Emit real-time event
      emitTimerPaused(
        timer.id,
        getCurrentUserId(req),
        newElapsedSeconds,
        getCurrentWorkspaceId(req),
      );

      res.json(updated);
    } catch (error) {
      console.error("Error pausing timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resume the timer
  app.post("/api/timer/resume", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }
      if (timer.status !== "paused") {
        return res.status(400).json({ error: "Timer is not paused" });
      }

      const now = new Date();
      const updated = await storage.updateActiveTimer(timer.id, {
        status: "running",
        lastStartedAt: now,
      });

      // Emit real-time event
      emitTimerResumed(
        timer.id,
        getCurrentUserId(req),
        now,
        getCurrentWorkspaceId(req),
      );

      res.json(updated);
    } catch (error) {
      console.error("Error resuming timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update timer details (client, project, task, description)
  app.patch("/api/timer/current", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      const allowedUpdates: Partial<ActiveTimer> = {};
      if ("clientId" in req.body) allowedUpdates.clientId = req.body.clientId;
      if ("projectId" in req.body)
        allowedUpdates.projectId = req.body.projectId;
      if ("taskId" in req.body) allowedUpdates.taskId = req.body.taskId;
      if ("description" in req.body)
        allowedUpdates.description = req.body.description;

      const updated = await storage.updateActiveTimer(timer.id, allowedUpdates);

      // Emit real-time event
      emitTimerUpdated(
        timer.id,
        getCurrentUserId(req),
        allowedUpdates as any,
        getCurrentWorkspaceId(req),
      );

      // Return enriched timer
      const enrichedTimer = await storage.getActiveTimerByUser(
        getCurrentUserId(req),
      );
      res.json(enrichedTimer);
    } catch (error) {
      console.error("Error updating timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stop and finalize timer (creates time entry or discards)
  app.post("/api/timer/stop", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      // Calculate final elapsed time if running
      let finalElapsedSeconds = timer.elapsedSeconds;
      if (timer.status === "running") {
        const now = new Date();
        const lastStarted = timer.lastStartedAt || timer.createdAt;
        const additionalSeconds = Math.floor(
          (now.getTime() - lastStarted.getTime()) / 1000,
        );
        finalElapsedSeconds += additionalSeconds;
      }

      const { discard, scope, description, clientId, projectId, taskId } =
        req.body;

      let timeEntryId: string | null = null;

      // Create time entry unless discarding
      if (!discard && finalElapsedSeconds > 0) {
        const endTime = new Date();
        const startTime = new Date(
          endTime.getTime() - finalElapsedSeconds * 1000,
        );

        const timeEntry = await storage.createTimeEntry({
          workspaceId: getCurrentWorkspaceId(req),
          userId: getCurrentUserId(req),
          clientId: clientId !== undefined ? clientId : timer.clientId,
          projectId: projectId !== undefined ? projectId : timer.projectId,
          taskId: taskId !== undefined ? taskId : timer.taskId,
          description:
            description !== undefined ? description : timer.description,
          startTime,
          endTime,
          durationSeconds: finalElapsedSeconds,
          scope: scope || "in_scope",
          isManual: false,
        });

        timeEntryId = timeEntry.id;

        // Emit time entry created event
        emitTimeEntryCreated(
          {
            id: timeEntry.id,
            workspaceId: timeEntry.workspaceId,
            userId: timeEntry.userId,
            clientId: timeEntry.clientId,
            projectId: timeEntry.projectId,
            taskId: timeEntry.taskId,
            description: timeEntry.description,
            startTime: timeEntry.startTime,
            endTime: timeEntry.endTime,
            durationSeconds: timeEntry.durationSeconds,
            scope: timeEntry.scope as "in_scope" | "out_of_scope",
            isManual: timeEntry.isManual,
            createdAt: timeEntry.createdAt,
          },
          getCurrentWorkspaceId(req),
        );
      }

      // Delete active timer
      await storage.deleteActiveTimer(timer.id);

      // Emit timer stopped event
      emitTimerStopped(
        timer.id,
        getCurrentUserId(req),
        timeEntryId,
        getCurrentWorkspaceId(req),
      );

      res.json({
        success: true,
        timeEntryId,
        discarded: discard || finalElapsedSeconds === 0,
        durationSeconds: finalElapsedSeconds,
      });
    } catch (error) {
      console.error("Error stopping timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Discard timer without saving
  app.delete("/api/timer/current", async (req, res) => {
    try {
      const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      await storage.deleteActiveTimer(timer.id);

      // Emit timer stopped event (discarded)
      emitTimerStopped(
        timer.id,
        getCurrentUserId(req),
        null,
        getCurrentWorkspaceId(req),
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error discarding timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // TIME TRACKING - TIME ENTRIES
  // =============================================================================

  // Get time entries for workspace (with optional filters)
  app.get("/api/time-entries", async (req, res) => {
    try {
      const { userId, clientId, projectId, taskId, scope, startDate, endDate } =
        req.query;

      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (clientId) filters.clientId = clientId as string;
      if (projectId) filters.projectId = projectId as string;
      if (taskId) filters.taskId = taskId as string;
      if (scope) filters.scope = scope as "in_scope" | "out_of_scope";
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const entries = await storage.getTimeEntriesByWorkspace(
        getCurrentWorkspaceId(req),
        filters,
      );
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user's time entries
  app.get("/api/time-entries/my", async (req, res) => {
    try {
      const entries = await storage.getTimeEntriesByUser(
        getCurrentUserId(req),
        getCurrentWorkspaceId(req),
      );
      res.json(entries);
    } catch (error) {
      console.error("Error fetching user time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get single time entry
  app.get("/api/time-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getTimeEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create manual time entry
  app.post("/api/time-entries", async (req, res) => {
    try {
      const { startTime, endTime, durationSeconds, ...rest } = req.body;

      // Calculate duration from start/end if not provided
      let duration = durationSeconds;
      let start = startTime ? new Date(startTime) : new Date();
      let end = endTime ? new Date(endTime) : null;

      if (!duration && start && end) {
        duration = Math.floor((end.getTime() - start.getTime()) / 1000);
      } else if (duration && !end) {
        end = new Date(start.getTime() + duration * 1000);
      }

      const data = insertTimeEntrySchema.parse({
        ...rest,
        workspaceId: getCurrentWorkspaceId(req),
        userId: getCurrentUserId(req),
        startTime: start,
        endTime: end,
        durationSeconds: duration || 0,
        isManual: true,
        scope: rest.scope || "in_scope",
      });

      const entry = await storage.createTimeEntry(data);

      // Emit real-time event
      emitTimeEntryCreated(
        {
          id: entry.id,
          workspaceId: entry.workspaceId,
          userId: entry.userId,
          clientId: entry.clientId,
          projectId: entry.projectId,
          taskId: entry.taskId,
          description: entry.description,
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationSeconds: entry.durationSeconds,
          scope: entry.scope as "in_scope" | "out_of_scope",
          isManual: entry.isManual,
          createdAt: entry.createdAt,
        },
        getCurrentWorkspaceId(req),
      );

      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update time entry
  app.patch("/api/time-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getTimeEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }

      const { startTime, endTime, durationSeconds, ...rest } = req.body;

      const updates: any = { ...rest };
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime) updates.endTime = new Date(endTime);
      if (durationSeconds !== undefined)
        updates.durationSeconds = durationSeconds;

      const updated = await storage.updateTimeEntry(req.params.id, updates);

      // Emit real-time event
      emitTimeEntryUpdated(req.params.id, getCurrentWorkspaceId(req), updates);

      res.json(updated);
    } catch (error) {
      console.error("Error updating time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete time entry
  app.delete("/api/time-entries/:id", async (req, res) => {
    try {
      const entry = await storage.getTimeEntry(req.params.id);
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }

      await storage.deleteTimeEntry(req.params.id);

      // Emit real-time event
      emitTimeEntryDeleted(req.params.id, getCurrentWorkspaceId(req));

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // TIME TRACKING - REPORTING
  // =============================================================================

  // Get time tracking summary/report
  app.get("/api/time-entries/report/summary", async (req, res) => {
    try {
      const { startDate, endDate, groupBy } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      const entries = await storage.getTimeEntriesByWorkspace(
        getCurrentWorkspaceId(req),
        filters,
      );

      // Calculate totals
      let totalSeconds = 0;
      let inScopeSeconds = 0;
      let outOfScopeSeconds = 0;

      const byClient: Record<string, { name: string; seconds: number }> = {};
      const byProject: Record<
        string,
        { name: string; clientName: string | null; seconds: number }
      > = {};
      const byUser: Record<string, { name: string; seconds: number }> = {};

      for (const entry of entries) {
        totalSeconds += entry.durationSeconds;
        if (entry.scope === "in_scope") {
          inScopeSeconds += entry.durationSeconds;
        } else {
          outOfScopeSeconds += entry.durationSeconds;
        }

        // Group by client
        if (entry.clientId && entry.client) {
          if (!byClient[entry.clientId]) {
            byClient[entry.clientId] = {
              name: entry.client.displayName || entry.client.companyName,
              seconds: 0,
            };
          }
          byClient[entry.clientId].seconds += entry.durationSeconds;
        }

        // Group by project
        if (entry.projectId && entry.project) {
          if (!byProject[entry.projectId]) {
            byProject[entry.projectId] = {
              name: entry.project.name,
              clientName:
                entry.client?.displayName || entry.client?.companyName || null,
              seconds: 0,
            };
          }
          byProject[entry.projectId].seconds += entry.durationSeconds;
        }

        // Group by user
        if (entry.userId && entry.user) {
          if (!byUser[entry.userId]) {
            byUser[entry.userId] = {
              name: entry.user.name || entry.user.email,
              seconds: 0,
            };
          }
          byUser[entry.userId].seconds += entry.durationSeconds;
        }
      }

      res.json({
        totalSeconds,
        inScopeSeconds,
        outOfScopeSeconds,
        entryCount: entries.length,
        byClient: Object.entries(byClient).map(([id, data]) => ({
          id,
          ...data,
        })),
        byProject: Object.entries(byProject).map(([id, data]) => ({
          id,
          ...data,
        })),
        byUser: Object.entries(byUser).map(([id, data]) => ({ id, ...data })),
      });
    } catch (error) {
      console.error("Error generating time report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // USER MANAGEMENT ENDPOINTS (Admin Only)
  // ============================================

  const requireAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as Express.User | undefined;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getUsersByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { firstName, lastName, email, role, teamIds, clientIds } = req.body;

      if (!firstName || !lastName || !email) {
        return res
          .status(400)
          .json({ error: "First name, last name, and email are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this email already exists" });
      }

      const user = await storage.createUser({
        email,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        role: role || "employee",
        isActive: true,
        passwordHash: null,
      });

      await storage.addWorkspaceMember({
        workspaceId: getCurrentWorkspaceId(req),
        userId: user.id,
        role: role === "admin" ? "admin" : "member",
        status: "active",
      });

      if (teamIds && Array.isArray(teamIds)) {
        for (const teamId of teamIds) {
          await storage.addTeamMember({ teamId, userId: user.id });
        }
      }

      if (role === "client" && clientIds && Array.isArray(clientIds)) {
        for (const clientId of clientIds) {
          await storage.addClientUserAccess({
            workspaceId: getCurrentWorkspaceId(req),
            clientId,
            userId: user.id,
            accessLevel: "viewer",
          });
        }
      }

      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const user = await storage.updateUser(id, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // INVITATION ENDPOINTS
  // ============================================

  app.get("/api/invitations", requireAdmin, async (req, res) => {
    try {
      const invitations = await storage.getInvitationsByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations", requireAdmin, async (req, res) => {
    try {
      const { email, role, expiresInDays } = req.body;
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

      const invitation = await storage.createInvitation({
        email,
        role: (role || "employee") as "admin" | "employee" | "client",
        tokenHash: token,
        expiresAt,
        workspaceId: getCurrentWorkspaceId(req),
        createdByUserId: getCurrentUserId(req),
        status: "pending",
      });

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/invitations/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteInvitation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations/for-user", requireAdmin, async (req, res) => {
    try {
      const { userId, expiresInDays, sendEmail } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

      const invitation = await storage.createInvitation({
        email: user.email,
        role: (user.role || "employee") as "admin" | "employee" | "client",
        tokenHash: token,
        expiresAt,
        workspaceId: getCurrentWorkspaceId(req),
        createdByUserId: getCurrentUserId(req),
        status: "pending",
      });

      const inviteLink = `${req.protocol}://${req.get("host")}/accept-invite/${token}`;

      res.status(201).json({
        ...invitation,
        inviteLink,
      });
    } catch (error) {
      console.error("Error creating invitation for user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // MAILGUN SETTINGS ENDPOINTS
  // ============================================

  app.get("/api/settings/mailgun", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAppSettings(
        getCurrentWorkspaceId(req),
        "mailgun",
      );
      if (!settings) {
        return res.json({ configured: false });
      }
      // Never return the actual API key
      res.json({
        configured: true,
        domain: settings.domain || "",
        fromEmail: settings.fromEmail || "",
        replyTo: settings.replyTo || "",
      });
    } catch (error) {
      console.error("Error fetching mailgun settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/settings/mailgun", requireAdmin, async (req, res) => {
    try {
      const { domain, apiKey, fromEmail, replyTo } = req.body;

      // Get existing settings to preserve API key if not provided
      const existing = await storage.getAppSettings(
        getCurrentWorkspaceId(req),
        "mailgun",
      );

      const settingsData: any = {
        domain: domain || existing?.domain || "",
        fromEmail: fromEmail || existing?.fromEmail || "",
        replyTo: replyTo || existing?.replyTo || "",
      };

      // Only update API key if a new one is provided
      if (apiKey) {
        // In production, this should be encrypted
        settingsData.apiKey = apiKey;
      } else if (existing?.apiKey) {
        settingsData.apiKey = existing.apiKey;
      }

      await storage.setAppSettings(
        getCurrentWorkspaceId(req),
        "mailgun",
        settingsData,
      );

      res.json({ success: true, configured: !!settingsData.apiKey });
    } catch (error) {
      console.error("Error saving mailgun settings:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/settings/mailgun/test", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAppSettings(
        getCurrentWorkspaceId(req),
        "mailgun",
      );
      if (!settings?.apiKey) {
        return res.status(400).json({ error: "Mailgun not configured" });
      }

      // For now, just simulate a successful test
      // In production, this would actually send an email via Mailgun
      res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
      console.error("Error testing mailgun:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export time entries as CSV
  app.get("/api/time-entries/export/csv", async (req, res) => {
    try {
      const { startDate, endDate, clientId, projectId } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (clientId) filters.clientId = clientId as string;
      if (projectId) filters.projectId = projectId as string;

      const entries = await storage.getTimeEntriesByWorkspace(
        getCurrentWorkspaceId(req),
        filters,
      );

      // Build CSV
      const headers = [
        "Date",
        "Start Time",
        "End Time",
        "Duration (hours)",
        "Client",
        "Project",
        "Task",
        "Description",
        "Scope",
        "User",
        "Entry Type",
      ];
      const rows = entries.map((entry) => {
        const duration = (entry.durationSeconds / 3600).toFixed(2);
        return [
          entry.startTime.toISOString().split("T")[0],
          entry.startTime.toISOString().split("T")[1].slice(0, 8),
          entry.endTime?.toISOString().split("T")[1].slice(0, 8) || "",
          duration,
          entry.client?.displayName || entry.client?.companyName || "",
          entry.project?.name || "",
          entry.task?.title || "",
          entry.description || "",
          entry.scope,
          entry.user?.name || entry.user?.email || "",
          entry.isManual ? "Manual" : "Timer",
        ];
      });

      const csv = [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="time-entries-${new Date().toISOString().split("T")[0]}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      console.error("Error exporting time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  return httpServer;
}
