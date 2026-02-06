import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { captureError } from "../middleware/errorLogging";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { getCurrentUserId, getCurrentWorkspaceId, isSuperUser } from "./helpers";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson } from "../utils/mentionUtils";
import {
  insertTaskSchema,
  insertSubtaskSchema,
  insertCommentSchema,
  updateTaskSchema,
  updateSubtaskSchema,
  addAssigneeSchema,
} from "@shared/schema";
import {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskMoved,
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
  emitMyTaskCreated,
  emitMyTaskUpdated,
  emitMyTaskDeleted,
} from "../realtime/events";
import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskStatusChanged,
  notifyCommentAdded,
  notifyCommentMention,
} from "../features/notifications/notification.service";

const router = Router();

router.get("/projects/:projectId/tasks", async (req, res) => {
  try {
    const tasks = await storage.getTasksByProject(req.params.projectId);
    res.json(tasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/tasks", req);
  }
});

router.get("/projects/:projectId/calendar-events", async (req, res) => {
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
    return handleRouteError(res, error, "GET /api/projects/:projectId/calendar", req);
  }
});

router.get("/projects/:projectId/activity", async (req, res) => {
  try {
    const { projectId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;
    const tenantId = getEffectiveTenantId(req);

    const project = tenantId 
      ? await storage.getProjectByIdAndTenant(projectId, tenantId)
      : isSuperUser(req) 
        ? await storage.getProject(projectId) 
        : null;
    
    if (!project) {
      return sendError(res, AppError.notFound("Project"), req);
    }

    const activity = await storage.getProjectActivity(projectId, tenantId, limit);
    res.json(activity);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/activity", req);
  }
});

router.get("/tasks/my", async (req, res) => {
  try {
    const tasks = await storage.getTasksByUser(getCurrentUserId(req));
    res.json(tasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/my", req);
  }
});

router.post("/tasks/personal", async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { personalSectionId, assigneeIds, ...restBody } = req.body;
    
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

    const assigneesToAdd = Array.isArray(assigneeIds) && assigneeIds.length > 0 
      ? assigneeIds 
      : [userId];
    
    for (const assigneeId of assigneesToAdd) {
      try {
        await storage.addTaskAssignee({
          taskId: task.id,
          userId: assigneeId,
          tenantId: tenantId || undefined,
        });
      } catch (assigneeError) {
        console.warn(`[Personal Task Create] Failed to assign task ${task.id} to user ${assigneeId}:`, assigneeError);
      }
    }

    const taskWithRelations = await storage.getTaskWithRelations(task.id);

    if (taskWithRelations) {
      for (const assigneeId of assigneesToAdd) {
        emitMyTaskCreated(assigneeId, taskWithRelations as any, workspaceId);
      }
    }

    res.status(201).json(taskWithRelations);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    const err = error instanceof Error ? error : new Error(String(error));
    captureError(req as any, err, 500, { route: "POST /api/tasks/personal", body: req.body }).catch(() => {});
    return handleRouteError(res, error, "POST /api/tasks/personal", req);
  }
});

// =============================================================================
// PERSONAL TASK SECTIONS (My Tasks organization)
// =============================================================================

router.get("/v1/my-tasks/sections", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const sections = await storage.getPersonalTaskSections(userId);
    res.json(sections);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/my-tasks/sections", req);
  }
});

router.post("/v1/my-tasks/sections", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { name } = req.body;
    
    if (!name || typeof name !== "string" || name.trim() === "") {
      return sendError(res, AppError.badRequest("Section name is required"), req);
    }

    const existingSections = await storage.getPersonalTaskSections(userId);
    const maxSortOrder = existingSections.reduce((max, s) => Math.max(max, s.sortOrder), -1);

    const section = await storage.createPersonalTaskSection({
      tenantId,
      userId,
      name: name.trim(),
      sortOrder: maxSortOrder + 1,
    });
    
    res.status(201).json(section);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/my-tasks/sections", req);
  }
});

router.patch("/v1/my-tasks/sections/:id", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const sectionId = req.params.id;
    const { name, sortOrder } = req.body;

    const section = await storage.getPersonalTaskSection(sectionId);
    if (!section) {
      return sendError(res, AppError.notFound("Section"), req);
    }
    if (section.userId !== userId) {
      return sendError(res, AppError.forbidden("Cannot modify another user's section"), req);
    }

    const updates: { name?: string; sortOrder?: number } = {};
    if (name !== undefined) updates.name = name.trim();
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const updatedSection = await storage.updatePersonalTaskSection(sectionId, updates);
    res.json(updatedSection);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/v1/my-tasks/sections/:id", req);
  }
});

router.delete("/v1/my-tasks/sections/:id", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const sectionId = req.params.id;

    const section = await storage.getPersonalTaskSection(sectionId);
    if (!section) {
      return sendError(res, AppError.notFound("Section"), req);
    }
    if (section.userId !== userId) {
      return sendError(res, AppError.forbidden("Cannot delete another user's section"), req);
    }

    await storage.clearPersonalSectionFromTasks(sectionId);
    
    await storage.deletePersonalTaskSection(sectionId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/my-tasks/sections/:id", req);
  }
});

router.post("/v1/my-tasks/tasks/:taskId/move", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const { taskId } = req.params;
    const { personalSectionId, newIndex } = req.body;

    const task = await storage.getTask(taskId);
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    const taskWithRelations = await storage.getTaskWithRelations(taskId);
    const isAssigned = taskWithRelations?.assignees?.some(a => a.userId === userId);
    const isCreator = task.createdBy === userId;
    if (!isAssigned && !isCreator) {
      return sendError(res, AppError.forbidden("Cannot move a task you don't own"), req);
    }

    if (task.projectId || !task.isPersonal) {
      return sendError(res, AppError.badRequest("Can only organize personal tasks into sections"), req);
    }

    if (personalSectionId) {
      const section = await storage.getPersonalTaskSection(personalSectionId);
      if (!section) {
        return sendError(res, AppError.notFound("Section"), req);
      }
      if (section.userId !== userId) {
        return sendError(res, AppError.forbidden("Cannot move task to another user's section"), req);
      }
    }

    const updatedTask = await storage.updateTask(taskId, {
      personalSectionId: personalSectionId || null,
      personalSortOrder: newIndex ?? 0,
    });

    const updatedWithRelations = await storage.getTaskWithRelations(taskId);
    res.json(updatedWithRelations);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/my-tasks/tasks/:taskId/move", req);
  }
});

router.get("/tasks/:id", async (req, res) => {
  try {
    const task = await storage.getTaskWithRelations(req.params.id);
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    res.json(task);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:id", req);
  }
});

router.get("/tasks/:id/childtasks", async (req, res) => {
  try {
    const childTasks = await storage.getChildTasks(req.params.id);
    res.json(childTasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:id/childtasks", req);
  }
});

router.post("/tasks", async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    const body = { ...req.body };
    if (body.sectionId === "" || body.sectionId === undefined) {
      body.sectionId = null;
    }
    const data = insertTaskSchema.parse({
      ...body,
      createdBy: userId,
    });
    
    if (data.projectId && !data.isPersonal) {
      if (!tenantId) {
        const project = await storage.getProject(data.projectId);
        if (!project) {
          return res.status(404).json({ error: "Project not found", requestId });
        }
      } else {
        const project = await storage.getProjectByIdAndTenant(data.projectId, tenantId);
        if (!project) {
          const projectExists = await storage.getProject(data.projectId);
          if (projectExists) {
            return res.status(403).json({ 
              error: "Access denied: project belongs to a different tenant",
              requestId 
            });
          }
          return res.status(404).json({ error: "Project not found", requestId });
        }
      }
    }
    
    if (data.sectionId && data.projectId) {
      const section = await storage.getSection(data.sectionId);
      if (!section || section.projectId !== data.projectId) {
        return res.status(400).json({ 
          error: "Invalid section: section not found or does not belong to this project",
          requestId 
        });
      }
    }
    
    const task = tenantId 
      ? await storage.createTaskWithTenant(data, tenantId)
      : await storage.createTask(data);

    const rawAssigneeIds = req.body.assigneeIds;
    const assigneeIds: string[] = Array.isArray(rawAssigneeIds) 
      ? rawAssigneeIds.filter((id: unknown) => typeof id === 'string' && id.length > 0)
      : [];
    
    if (assigneeIds.length > 0) {
      let validatedAssigneeIds: string[] = [];
      if (tenantId) {
        const tenantUsers = await storage.getUsersByTenant(tenantId);
        const tenantUserIds = new Set(tenantUsers.map(u => u.id));
        validatedAssigneeIds = assigneeIds.filter(id => tenantUserIds.has(id));
        
        const invalidIds = assigneeIds.filter(id => !tenantUserIds.has(id));
        if (invalidIds.length > 0) {
          console.warn(`[Task Create] Rejected invalid assignee IDs for tenant ${tenantId}: ${invalidIds.join(', ')}`);
        }
      } else {
        validatedAssigneeIds = assigneeIds;
      }
      
      for (const assigneeId of validatedAssigneeIds) {
        try {
          await storage.addTaskAssignee({
            taskId: task.id,
            userId: assigneeId,
            tenantId: tenantId || undefined,
          });
        } catch (assigneeError) {
          console.warn(`[Task Create] Failed to add assignee ${assigneeId} to task ${task.id}:`, assigneeError);
        }
      }
      
      if (validatedAssigneeIds.length === 0) {
        try {
          await storage.addTaskAssignee({
            taskId: task.id,
            userId: userId,
            tenantId: tenantId || undefined,
          });
        } catch (assigneeError) {
          console.warn(`[Task Create] Failed to auto-assign task ${task.id} to user ${userId}:`, assigneeError);
        }
      }
    } else {
      try {
        await storage.addTaskAssignee({
          taskId: task.id,
          userId: userId,
          tenantId: tenantId || undefined,
        });
      } catch (assigneeError) {
        console.warn(`[Task Create] Failed to auto-assign task ${task.id} to user ${userId}:`, assigneeError);
      }
    }

    const taskWithRelations = await storage.getTaskWithRelations(task.id);

    if (taskWithRelations) {
      if (task.isPersonal && task.createdBy) {
        emitMyTaskCreated(task.createdBy, taskWithRelations as any, getCurrentWorkspaceId(req));
      } else if (task.projectId) {
        emitTaskCreated(task.projectId, taskWithRelations as any);
      }
    }

    res.status(201).json(taskWithRelations);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    captureError(req as any, err, 500, { route: "POST /api/tasks", body: req.body }).catch(() => {});
    return handleRouteError(res, error, "POST /api/tasks", req);
  }
});

router.post("/tasks/:taskId/childtasks", async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    const parentTaskId = req.params.taskId;
    const tenantId = getEffectiveTenantId(req);
    const parentTask = await storage.getTask(parentTaskId);
    if (!parentTask) {
      return res.status(404).json({ error: "Parent task not found", requestId });
    }
    if (parentTask.parentTaskId) {
      return res.status(400).json({
        error: "Cannot create subtask of a subtask (max depth is 2 levels)",
        requestId,
      });
    }

    const body = { ...req.body };
    const data = insertTaskSchema.parse({
      ...body,
      projectId: parentTask.projectId,
      sectionId: parentTask.sectionId,
      createdBy: getCurrentUserId(req),
    });

    const effectiveTenantId = parentTask.tenantId || tenantId;
    const task = effectiveTenantId
      ? await storage.createTaskWithTenant({ ...data, parentTaskId }, effectiveTenantId)
      : await storage.createChildTask(parentTaskId, data);

    if (body.assigneeId) {
      try {
        await storage.addTaskAssignee({
          taskId: task.id,
          userId: body.assigneeId,
          tenantId: effectiveTenantId || undefined,
        });
      } catch (assigneeError) {
        console.warn(`[Child Task Create] Failed to assign task ${task.id} to user ${body.assigneeId}:`, assigneeError);
      }
    }

    const taskWithRelations = await storage.getTaskWithRelations(task.id);

    if (taskWithRelations && parentTask.projectId) {
      emitTaskCreated(parentTask.projectId, taskWithRelations as any);
    }

    res.status(201).json(taskWithRelations);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    captureError(req as any, err, 500, { route: "POST /api/tasks/:taskId/childtasks", body: req.body }).catch(() => {});
    return handleRouteError(res, error, "POST /api/tasks/:taskId/childtasks", req);
  }
});

router.patch("/tasks/:id", async (req, res) => {
  const requestId = req.requestId || 'unknown';
  try {
    const data = validateBody(req.body, updateTaskSchema, res);
    if (!data) return;
    
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const taskBefore = await storage.getTaskWithRelations(req.params.id);
    
    const updateData: any = { ...data };
    if (updateData.isPersonal === true) {
      updateData.projectId = null;
      updateData.sectionId = null;
      updateData.parentTaskId = null;
    }
    
    if (updateData.dueDate !== undefined) {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }
    if (updateData.startDate !== undefined) {
      updateData.startDate = updateData.startDate ? new Date(updateData.startDate) : null;
    }
    
    let task;
    if (tenantId) {
      task = await storage.updateTaskWithTenant(req.params.id, tenantId, updateData);
    } else if (isSuperUser(req)) {
      task = await storage.updateTask(req.params.id, updateData);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    const taskWithRelations = await storage.getTaskWithRelations(task.id);

    if (task.isPersonal && task.createdBy) {
      emitMyTaskUpdated(task.createdBy, task.id, data, getCurrentWorkspaceId(req));
    } else if (task.projectId) {
      emitTaskUpdated(task.id, task.projectId, task.parentTaskId, data);
    }

    if (taskBefore && !task.isPersonal) {
      const currentUser = await storage.getUser(userId);
      const currentUserName = currentUser?.name || currentUser?.email || "Someone";
      const project = task.projectId ? await storage.getProject(task.projectId) : null;
      const projectName = project?.name || "Unknown project";
      const notificationContext = { tenantId, excludeUserId: userId };

      if (updateData.status === "completed" && taskBefore.status !== "completed") {
        const assignees = (taskWithRelations as any)?.assignees || [];
        for (const assignee of assignees) {
          if (assignee.id !== userId) {
            notifyTaskCompleted(
              assignee.id,
              task.id,
              task.title,
              currentUserName,
              notificationContext
            ).catch(() => {});
          }
        }
      }

      if (updateData.status && updateData.status !== taskBefore.status && updateData.status !== "completed") {
        const assignees = (taskWithRelations as any)?.assignees || [];
        for (const assignee of assignees) {
          if (assignee.id !== userId) {
            notifyTaskStatusChanged(
              assignee.id,
              task.id,
              task.title,
              updateData.status,
              currentUserName,
              notificationContext
            ).catch(() => {});
          }
        }
      }
    }

    res.json(taskWithRelations);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/tasks/:id", req);
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const task = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.id, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.id) 
        : null;
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    if (tenantId) {
      await storage.deleteTaskWithTenant(req.params.id, tenantId);
    } else if (isSuperUser(req)) {
      await storage.deleteTask(req.params.id);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }

    if (task.isPersonal && task.createdBy) {
      emitMyTaskDeleted(task.createdBy, task.id, getCurrentWorkspaceId(req));
    } else if (task.projectId) {
      emitTaskDeleted(
        task.id,
        task.projectId,
        task.sectionId,
        task.parentTaskId,
      );
    }

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tasks/:id", req);
  }
});

router.post("/tasks/:id/move", async (req, res) => {
  try {
    const { sectionId, targetIndex } = req.body;
    const tenantId = getEffectiveTenantId(req);

    const taskBefore = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.id, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.id) 
        : null;
    
    if (!taskBefore) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    const fromSectionId = taskBefore.sectionId;

    await storage.moveTask(req.params.id, sectionId, targetIndex);
    const task = await storage.getTaskWithRelations(req.params.id);

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
    return handleRouteError(res, error, "POST /api/tasks/:id/move", req);
  }
});

router.post("/tasks/:taskId/assignees", async (req, res) => {
  try {
    const data = validateBody(req.body, addAssigneeSchema, res);
    if (!data) return;
    
    const assigneeUserId = data.userId;
    const currentUserId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const task = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    if (tenantId) {
      const assigneeUser = await storage.getUser(assigneeUserId);
      if (!assigneeUser || assigneeUser.tenantId !== tenantId) {
        return sendError(res, AppError.forbidden("User is not in the same organization"), req);
      }
    }
    
    const assignee = await storage.addTaskAssignee({
      taskId: req.params.taskId,
      userId: assigneeUserId,
      tenantId: tenantId || undefined,
    });
    
    if (assigneeUserId !== currentUserId && !task.isPersonal) {
      const currentUser = await storage.getUser(currentUserId);
      const project = task.projectId 
        ? (tenantId 
          ? await storage.getProjectByIdAndTenant(task.projectId, tenantId)
          : await storage.getProject(task.projectId)) 
        : null;
      notifyTaskAssigned(
        assigneeUserId,
        task.id,
        task.title,
        currentUser?.name || currentUser?.email || "Someone",
        project?.name || "a project",
        { tenantId, excludeUserId: currentUserId }
      ).catch(() => {});
    }
    
    res.status(201).json(assignee);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/assignees", req);
  }
});

router.delete("/tasks/:taskId/assignees/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const task = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    await storage.removeTaskAssignee(req.params.taskId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tasks/:taskId/assignees/:userId", req);
  }
});

// Task Watchers endpoints
router.get("/tasks/:taskId/watchers", async (req, res) => {
  try {
    const watchers = await storage.getTaskWatchers(req.params.taskId);
    res.json(watchers);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:taskId/watchers", req);
  }
});

router.post("/tasks/:taskId/watchers", async (req, res) => {
  try {
    const data = validateBody(req.body, addAssigneeSchema, res);
    if (!data) return;
    
    const watcher = await storage.addTaskWatcher({
      taskId: req.params.taskId,
      userId: data.userId,
    });
    res.status(201).json(watcher);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/watchers", req);
  }
});

router.delete("/tasks/:taskId/watchers/:userId", async (req, res) => {
  try {
    await storage.removeTaskWatcher(req.params.taskId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tasks/:taskId/watchers/:userId", req);
  }
});

router.get("/tasks/:taskId/subtasks", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const task = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;
    
    if (!task) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const subtasks = await storage.getSubtasksByTask(req.params.taskId);
    res.json(subtasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:taskId/subtasks", req);
  }
});

router.post("/tasks/:taskId/subtasks", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const data = insertSubtaskSchema.parse({
      ...req.body,
      taskId: req.params.taskId,
    });

    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(req.params.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(req.params.taskId) 
        : null;

    const subtask = await storage.createSubtask(data);

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
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/tasks/:taskId/subtasks", req);
  }
});

router.patch("/subtasks/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateSubtaskSchema, res);
    if (!data) return;
    
    const tenantId = getEffectiveTenantId(req);
    
    const existingSubtask = await storage.getSubtask(req.params.id);
    if (!existingSubtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(existingSubtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(existingSubtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const updateData: any = { ...data };
    if (updateData.dueDate !== undefined && typeof updateData.dueDate === 'string') {
      updateData.dueDate = updateData.dueDate ? new Date(updateData.dueDate) : null;
    }
    
    const subtask = await storage.updateSubtask(req.params.id, updateData);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }

    if (parentTask && parentTask.projectId) {
      emitSubtaskUpdated(
        subtask.id,
        subtask.taskId,
        parentTask.projectId,
        data,
      );
    }

    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/subtasks/:id", req);
  }
});

router.delete("/subtasks/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.id);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }

    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }

    await storage.deleteSubtask(req.params.id);

    if (parentTask && parentTask.projectId) {
      emitSubtaskDeleted(subtask.id, subtask.taskId, parentTask.projectId);
    }

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:id", req);
  }
});

router.post("/subtasks/:id/move", async (req, res) => {
  try {
    const { targetIndex } = req.body;
    await storage.moveSubtask(req.params.id, targetIndex);
    const subtask = await storage.getSubtask(req.params.id);
    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/subtasks/:id/move", req);
  }
});

// Get subtask with all relations (assignees, tags)
router.get("/subtasks/:id/full", async (req, res) => {
  try {
    const subtask = await storage.getSubtaskWithRelations(req.params.id);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    res.json(subtask);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/full", req);
  }
});

// Subtask Assignees endpoints
router.get("/subtasks/:id/assignees", async (req, res) => {
  try {
    const assignees = await storage.getSubtaskAssignees(req.params.id);
    res.json(assignees);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/assignees", req);
  }
});

router.post("/subtasks/:id/assignees", async (req, res) => {
  try {
    const { userId, tenantId } = req.body;
    if (!userId) {
      return sendError(res, AppError.badRequest("userId is required"), req);
    }
    const assignee = await storage.addSubtaskAssignee({
      subtaskId: req.params.id,
      userId,
      tenantId: tenantId || null,
    });
    res.status(201).json(assignee);
  } catch (error: any) {
    if (error?.code === '23505') {
      return res.status(409).json({ error: "User already assigned to subtask" });
    }
    return handleRouteError(res, error, "POST /api/subtasks/:subtaskId/assignees", req);
  }
});

router.delete("/subtasks/:subtaskId/assignees/:userId", async (req, res) => {
  try {
    await storage.removeSubtaskAssignee(req.params.subtaskId, req.params.userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:subtaskId/assignees/:userId", req);
  }
});

// Subtask Tags endpoints
router.get("/subtasks/:id/tags", async (req, res) => {
  try {
    const tags = await storage.getSubtaskTags(req.params.id);
    res.json(tags);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:id/tags", req);
  }
});

router.post("/subtasks/:id/tags", async (req, res) => {
  try {
    const { tagId } = req.body;
    if (!tagId) {
      return sendError(res, AppError.badRequest("tagId is required"), req);
    }
    const subtaskTag = await storage.addSubtaskTag({
      subtaskId: req.params.id,
      tagId,
    });
    res.status(201).json(subtaskTag);
  } catch (error: any) {
    if (error?.code === '23505') {
      return sendError(res, AppError.conflict("Tag already added to subtask"), req);
    }
    return handleRouteError(res, error, "POST /api/subtasks/:id/tags", req);
  }
});

router.delete("/subtasks/:subtaskId/tags/:tagId", async (req, res) => {
  try {
    await storage.removeSubtaskTag(req.params.subtaskId, req.params.tagId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/subtasks/:subtaskId/tags/:tagId", req);
  }
});

// Subtask comments
router.get("/subtasks/:subtaskId/comments", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.subtaskId);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const comments = await storage.getCommentsBySubtask(req.params.subtaskId);
    res.json(comments);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/subtasks/:subtaskId/comments", req);
  }
});

router.post("/subtasks/:subtaskId/comments", async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const subtask = await storage.getSubtask(req.params.subtaskId);
    if (!subtask) {
      return sendError(res, AppError.notFound("Subtask"), req);
    }
    
    const parentTask = tenantId 
      ? await storage.getTaskByIdAndTenant(subtask.taskId, tenantId)
      : isSuperUser(req) 
        ? await storage.getTask(subtask.taskId) 
        : null;
    
    if (!parentTask) {
      return sendError(res, AppError.notFound("Task"), req);
    }
    
    const data = insertCommentSchema.parse({
      ...req.body,
      subtaskId: req.params.subtaskId,
      userId: currentUserId,
    });
    const comment = await storage.createComment(data);
    const commenter = await storage.getUser(currentUserId);

    const mentionedUserIds = extractMentionsFromTipTapJson(data.body);
    const plainTextBody = getPlainTextFromTipTapJson(data.body);
    const notifiedUserIds = new Set<string>();

    for (const mentionedUserId of mentionedUserIds) {
      const mentionedUser = await storage.getUser(mentionedUserId);
      if (!mentionedUser || (tenantId && mentionedUser.tenantId !== tenantId)) {
        continue;
      }

      await storage.createCommentMention({
        commentId: comment.id,
        mentionedUserId: mentionedUserId,
      });
      notifiedUserIds.add(mentionedUserId);

      notifyCommentMention(
        mentionedUserId,
        subtask.taskId,
        subtask.title || "a subtask",
        commenter?.name || commenter?.email || "Someone",
        plainTextBody,
        { tenantId, excludeUserId: currentUserId }
      ).catch(() => {});

      if (mentionedUser.email && tenantId) {
        try {
          const { emailOutboxService } = await import("../services/emailOutbox");
          await emailOutboxService.sendEmail({
            tenantId,
            messageType: "mention_notification",
            toEmail: mentionedUser.email,
            subject: `${commenter?.name || 'Someone'} mentioned you in a comment`,
            textBody: `${commenter?.name || 'Someone'} mentioned you in a comment on subtask "${subtask.title || 'a subtask'}":\n\n"${plainTextBody}"`,
            metadata: {
              subtaskId: subtask.id,
              subtaskTitle: subtask.title,
              commentId: comment.id,
              mentionedByUserId: currentUserId,
              mentionedByName: commenter?.name,
            },
          });
        } catch (emailError) {
          console.error("Error sending mention notification:", emailError);
        }
      }
    }

    const subtaskWithRelations = await storage.getSubtaskWithRelations(req.params.subtaskId);
    const assignees = (subtaskWithRelations as any)?.assignees || [];
    for (const assignee of assignees) {
      const assigneeUserId = assignee.userId;
      if (assigneeUserId !== currentUserId && !notifiedUserIds.has(assigneeUserId)) {
        notifyCommentAdded(
          assigneeUserId,
          subtask.taskId,
          subtask.title || "a subtask",
          commenter?.name || commenter?.email || "Someone",
          plainTextBody,
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});
      }
    }

    const commentWithUser = {
      ...comment,
      user: commenter ? {
        id: commenter.id,
        name: commenter.name,
        email: commenter.email,
        avatarUrl: commenter.avatarUrl,
      } : undefined,
    };

    res.status(201).json(commentWithUser);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/subtasks/:subtaskId/comments", req);
  }
});

export default router;
