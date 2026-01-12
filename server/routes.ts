import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertTaskSchema, insertSectionSchema, insertSubtaskSchema, insertCommentSchema, insertTagSchema, insertProjectSchema, insertWorkspaceSchema, insertTeamSchema, insertWorkspaceMemberSchema, insertTeamMemberSchema, insertActivityLogSchema, insertClientSchema, insertClientContactSchema, insertClientInviteSchema } from "@shared/schema";
import { 
  isS3Configured, 
  validateFile, 
  generateStorageKey, 
  createPresignedUploadUrl, 
  createPresignedDownloadUrl, 
  deleteS3Object, 
  checkObjectExists,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES 
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
} from "./realtime/events";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  const DEMO_USER_ID = "demo-user-id";
  const DEMO_WORKSPACE_ID = "demo-workspace-id";

  app.get("/api/workspaces/current", async (req, res) => {
    try {
      const workspace = await storage.getWorkspace(DEMO_WORKSPACE_ID);
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
      const data = insertWorkspaceSchema.parse({
        ...req.body,
        createdBy: DEMO_USER_ID,
      });
      const workspace = await storage.createWorkspace(data);
      await storage.addWorkspaceMember({
        workspaceId: workspace.id,
        userId: DEMO_USER_ID,
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

  app.get("/api/projects", async (req, res) => {
    try {
      const projects = await storage.getProjectsByWorkspace(DEMO_WORKSPACE_ID);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/unassigned", async (req, res) => {
    try {
      const searchQuery = typeof req.query.q === 'string' ? req.query.q : undefined;
      const projects = await storage.getUnassignedProjects(DEMO_WORKSPACE_ID, searchQuery);
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
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: DEMO_USER_ID,
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
        clientId: clientId === undefined ? null : clientId 
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
      const teams = await storage.getTeamsByWorkspace(DEMO_WORKSPACE_ID);
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
        workspaceId: DEMO_WORKSPACE_ID,
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
          await storage.moveTask(taskId, toSectionId, toIndex);
        } else if (itemType === "childTask") {
          if (!parentTaskId) {
            return res.status(400).json({ error: "parentTaskId required for child task reordering" });
          }
          await storage.reorderChildTasks(parentTaskId, taskId, toIndex);
        } else if (itemType === "subtask") {
          if (!parentTaskId) {
            return res.status(400).json({ error: "parentTaskId required for subtask moves" });
          }
          const subtask = await storage.getSubtask(taskId);
          if (!subtask || subtask.taskId !== parentTaskId) {
            return res.status(400).json({ error: "Subtask does not belong to specified parent" });
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
        projectId: string;
        assignees: any[];
        tags: any[];
        isSubtask: boolean;
      }
      
      const events: CalendarEvent[] = [];
      
      for (const task of tasks) {
        if (task.dueDate) {
          const taskDate = new Date(task.dueDate);
          const inRange = (!startDate || taskDate >= startDate) && (!endDate || taskDate <= endDate);
          
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
              const inRange = (!startDate || childDate >= startDate) && (!endDate || childDate <= endDate);
              
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
      const tasks = await storage.getTasksByUser(DEMO_USER_ID);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching my tasks:", error);
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
        createdBy: DEMO_USER_ID,
      });
      const task = await storage.createTask(data);
      
      await storage.addTaskAssignee({ taskId: task.id, userId: DEMO_USER_ID });
      
      const taskWithRelations = await storage.getTaskWithRelations(task.id);
      
      // Emit real-time event after successful DB operation
      if (taskWithRelations) {
        emitTaskCreated(task.projectId, taskWithRelations as any);
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
        return res.status(400).json({ error: "Cannot create subtask of a subtask (max depth is 2 levels)" });
      }
      
      const body = { ...req.body };
      const data = insertTaskSchema.parse({
        ...body,
        projectId: parentTask.projectId,
        sectionId: parentTask.sectionId,
        createdBy: DEMO_USER_ID,
      });
      
      const task = await storage.createChildTask(parentTaskId, data);
      
      if (body.assigneeId) {
        await storage.addTaskAssignee({ taskId: task.id, userId: body.assigneeId });
      }
      
      const taskWithRelations = await storage.getTaskWithRelations(task.id);
      
      // Emit real-time event after successful DB operation
      if (taskWithRelations) {
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
      const task = await storage.updateTask(req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      const taskWithRelations = await storage.getTaskWithRelations(task.id);
      
      // Emit real-time event after successful DB operation
      emitTaskUpdated(task.id, task.projectId, task.parentTaskId, req.body);
      
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
      emitTaskDeleted(task.id, task.projectId, task.sectionId, task.parentTaskId);
      
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
      
      // Emit real-time event after successful DB operation
      emitTaskMoved(req.params.id, taskBefore.projectId, fromSectionId, sectionId, targetIndex);
      
      res.json(task);
    } catch (error) {
      console.error("Error moving task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/assignees", async (req, res) => {
    try {
      const { userId } = req.body;
      const assignee = await storage.addTaskAssignee({ taskId: req.params.taskId, userId });
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
      
      // Emit real-time event after successful DB operation
      if (parentTask) {
        emitSubtaskCreated(subtask as any, req.params.taskId, parentTask.projectId);
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
      
      // Emit real-time event after successful DB operation
      if (parentTask) {
        emitSubtaskUpdated(subtask.id, subtask.taskId, parentTask.projectId, req.body);
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
      
      // Emit real-time event after successful DB operation
      if (parentTask) {
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
      const taskTag = await storage.addTaskTag({ taskId: req.params.taskId, tagId });
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
        userId: DEMO_USER_ID,
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
        userId: DEMO_USER_ID,
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
      const logs = await storage.getActivityLogByEntity(req.params.entityType, req.params.entityId);
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

  app.get("/api/projects/:projectId/tasks/:taskId/attachments", async (req, res) => {
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
  });

  app.post("/api/projects/:projectId/tasks/:taskId/attachments/presign", async (req, res) => {
    try {
      const { projectId, taskId } = req.params;
      
      if (!isS3Configured()) {
        return res.status(503).json({ 
          error: "File storage is not configured. Please set AWS environment variables." 
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
      const storageKey = generateStorageKey(projectId, taskId, tempId, data.fileName);
      
      const attachment = await storage.createTaskAttachment({
        taskId,
        projectId,
        uploadedByUserId: DEMO_USER_ID,
        originalFileName: data.fileName,
        mimeType: data.mimeType,
        fileSizeBytes: data.fileSizeBytes,
        storageKey,
        uploadStatus: "pending",
      });
      
      const upload = await createPresignedUploadUrl(storageKey, data.mimeType);
      
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
  });

  app.post("/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete", async (req, res) => {
    try {
      const { projectId, taskId, attachmentId } = req.params;
      
      const attachment = await storage.getTaskAttachment(attachmentId);
      if (!attachment || attachment.taskId !== taskId || attachment.projectId !== projectId) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      
      if (attachment.uploadStatus === "complete") {
        return res.json(attachment);
      }
      
      const exists = await checkObjectExists(attachment.storageKey);
      if (!exists) {
        await storage.deleteTaskAttachment(attachmentId);
        return res.status(400).json({ error: "Upload was not completed. Please try again." });
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
        projectId
      );
      
      res.json(updated);
    } catch (error) {
      console.error("Error completing upload:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download", async (req, res) => {
    try {
      const { projectId, taskId, attachmentId } = req.params;
      
      const attachment = await storage.getTaskAttachment(attachmentId);
      if (!attachment || attachment.taskId !== taskId || attachment.projectId !== projectId) {
        return res.status(404).json({ error: "Attachment not found" });
      }
      
      if (attachment.uploadStatus !== "complete") {
        return res.status(400).json({ error: "Attachment upload is not complete" });
      }
      
      const url = await createPresignedDownloadUrl(attachment.storageKey);
      res.json({ url });
    } catch (error) {
      console.error("Error creating download URL:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId", async (req, res) => {
    try {
      const { projectId, taskId, attachmentId } = req.params;
      
      const attachment = await storage.getTaskAttachment(attachmentId);
      if (!attachment || attachment.taskId !== taskId || attachment.projectId !== projectId) {
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
  });

  // =============================================================================
  // CLIENT (CRM) ROUTES
  // =============================================================================

  app.get("/api/clients", async (req, res) => {
    try {
      const clients = await storage.getClientsByWorkspace(DEMO_WORKSPACE_ID);
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
        workspaceId: DEMO_WORKSPACE_ID,
      });
      const client = await storage.createClient(data);
      
      // Emit real-time event
      emitClientCreated({
        id: client.id,
        companyName: client.companyName,
        displayName: client.displayName,
        status: client.status,
        workspaceId: client.workspaceId,
        createdAt: client.createdAt!,
      }, DEMO_WORKSPACE_ID);
      
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
      emitClientContactCreated({
        id: contact.id,
        clientId: contact.clientId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        isPrimary: contact.isPrimary ?? false,
        createdAt: contact.createdAt!,
      }, contact.clientId, client.workspaceId);
      
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
      
      const contact = await storage.updateClientContact(req.params.contactId, req.body);
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }
      
      // Emit real-time event
      emitClientContactUpdated(contact.id, contact.clientId, client.workspaceId, req.body);
      
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
      emitClientContactDeleted(req.params.contactId, req.params.clientId, client.workspaceId);
      
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
      emitClientInviteSent({
        id: invite.id,
        clientId: invite.clientId,
        contactId: invite.contactId,
        email: invite.email,
        status: invite.status,
        createdAt: invite.createdAt!,
      }, invite.clientId, client.workspaceId);
      
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
      emitClientInviteRevoked(req.params.inviteId, req.params.clientId, client.workspaceId);
      
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
        workspaceId: DEMO_WORKSPACE_ID,
        createdBy: DEMO_USER_ID,
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

  return httpServer;
}
