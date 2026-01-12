import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { insertTaskSchema, insertSectionSchema, insertSubtaskSchema, insertCommentSchema, insertTagSchema, insertProjectSchema, insertWorkspaceSchema, insertTeamSchema, insertWorkspaceMemberSchema, insertTeamMemberSchema, insertActivityLogSchema } from "@shared/schema";

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
      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
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
      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/sections/:id", async (req, res) => {
    try {
      await storage.deleteSection(req.params.id);
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
      res.json(taskWithRelations);
    } catch (error) {
      console.error("Error updating task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    try {
      await storage.deleteTask(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:id/move", async (req, res) => {
    try {
      const { sectionId, targetIndex } = req.body;
      await storage.moveTask(req.params.id, sectionId, targetIndex);
      const task = await storage.getTaskWithRelations(req.params.id);
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
      const subtask = await storage.createSubtask(data);
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
      res.json(subtask);
    } catch (error) {
      console.error("Error updating subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/subtasks/:id", async (req, res) => {
    try {
      await storage.deleteSubtask(req.params.id);
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

  return httpServer;
}
