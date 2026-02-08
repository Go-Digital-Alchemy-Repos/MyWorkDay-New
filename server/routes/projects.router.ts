import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import {
  insertProjectSchema,
  insertSectionSchema,
  updateProjectSchema,
  updateSectionSchema,
} from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import {
  getCurrentUserId,
  getCurrentWorkspaceId,
  isSuperUser,
} from "./helpers";
import {
  emitProjectCreated,
  emitProjectUpdated,
  emitSectionCreated,
  emitSectionUpdated,
  emitSectionDeleted,
  emitTaskReordered,
} from "../realtime/events";
import {
  notifyProjectMemberAdded,
  notifyProjectUpdate,
} from "../features/notifications/notification.service";

const router = Router();

function getProjectUpdateDescription(updates: Record<string, unknown>): string | null {
  const descriptions: string[] = [];
  
  if ('name' in updates) descriptions.push('updated the project name');
  if ('description' in updates) descriptions.push('updated the project description');
  if ('status' in updates) descriptions.push(`changed the status to "${updates.status}"`);
  if ('startDate' in updates || 'endDate' in updates) descriptions.push('updated the project timeline');
  if ('budget' in updates || 'budgetHours' in updates) descriptions.push('updated the budget');
  if ('clientId' in updates) descriptions.push('changed the client');
  if ('divisionId' in updates) descriptions.push('changed the division');
  if ('teamId' in updates) descriptions.push('changed the team assignment');
  
  if (descriptions.length === 0) return null;
  if (descriptions.length === 1) return descriptions[0];
  return descriptions.slice(0, -1).join(', ') + ' and ' + descriptions.slice(-1);
}

router.get("/projects", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (tenantId) {
      const projects = await storage.getProjectsForUser(userId, tenantId, workspaceId, isAdmin);
      return res.json(projects);
    }
    
    if (isSuperUser(req)) {
      const projects = await storage.getProjectsByWorkspace(workspaceId);
      return res.json(projects);
    }
    
    console.error(`[projects] User ${getCurrentUserId(req)} has no tenantId`);
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects", req);
  }
});

router.get("/projects/unassigned", async (req: Request, res: Response) => {
  try {
    const searchQuery =
      typeof req.query.q === "string" ? req.query.q : undefined;
    const projects = await storage.getUnassignedProjects(
      getCurrentWorkspaceId(req),
      searchQuery,
    );
    res.json(projects);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/unassigned", req);
  }
});

router.get("/projects/hidden", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, AppError.unauthorized(), req);
    }
    
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    const hiddenProjects = await storage.getHiddenProjectsForUser(req.user.id, tenantId);
    res.json(hiddenProjects);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/hidden", req);
  }
});

router.get("/projects/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const project = await storage.getProjectByIdAndTenant(req.params.id, tenantId);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
      return res.json(project);
    }
    
    if (isSuperUser(req)) {
      const project = await storage.getProject(req.params.id);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
      return res.json(project);
    }
    
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:id", req);
  }
});

router.post("/projects", async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const creatorId = getCurrentUserId(req);
    
    const body = { ...req.body };
    if (body.teamId === "") {
      body.teamId = null;
    }
    if (body.divisionId === "") {
      body.divisionId = null;
    }
    
    const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : [];
    delete body.memberIds;
    
    if (tenantId && !body.clientId) {
      return sendError(res, AppError.badRequest("Client assignment is required for projects"), req);
    }
    
    if (body.clientId && tenantId) {
      const client = await storage.getClientByIdAndTenant(body.clientId, tenantId);
      if (!client) {
        const clientExists = await storage.getClient(body.clientId);
        if (clientExists) {
          return sendError(res, AppError.forbidden("Access denied: client belongs to a different tenant"), req);
        }
        return sendError(res, AppError.notFound("Client not found"), req);
      }
      
      const clientDivisions = await storage.getClientDivisionsByClient(body.clientId, tenantId);
      if (clientDivisions.length > 0) {
        if (!body.divisionId) {
          return sendError(res, AppError.badRequest("Division is required when client has divisions"), req);
        }
        const divisionValid = await storage.validateDivisionBelongsToClientTenant(
          body.divisionId, body.clientId, tenantId
        );
        if (!divisionValid) {
          return sendError(res, AppError.badRequest("Division does not belong to the selected client"), req);
        }
      } else if (body.divisionId) {
        return sendError(res, AppError.badRequest("Cannot assign division to a client without divisions"), req);
      }
    }
    
    if (memberIds.length > 0 && tenantId) {
      for (const memberId of memberIds) {
        const member = await storage.getUserByIdAndTenant(memberId, tenantId);
        if (!member) {
          return sendError(res, AppError.badRequest(`User ${memberId} not found or does not belong to tenant`), req);
        }
      }
    }
    
    const data = insertProjectSchema.parse({
      ...body,
      workspaceId,
      createdBy: creatorId,
    });
    
    let project;
    if (tenantId) {
      project = await storage.createProjectWithTenant(data, tenantId);
    } else if (isSuperUser(req)) {
      project = await storage.createProject(data);
    } else {
      return sendError(res, AppError.badRequest("Tenant context required - user not associated with a tenant"), req);
    }

    await storage.addProjectMember({ projectId: project.id, userId: creatorId, role: "owner" });
    
    for (const memberId of memberIds) {
      if (memberId !== creatorId) {
        await storage.addProjectMember({ projectId: project.id, userId: memberId, role: "member" });
      }
    }

    emitProjectCreated(project as any);

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/projects", req);
  }
});

router.patch("/projects/:id", async (req: Request, res: Response) => {
  try {
    const data = validateBody(req.body, updateProjectSchema, res);
    if (!data) return;
    
    const tenantId = getEffectiveTenantId(req);
    
    let existingProject;
    if (tenantId) {
      existingProject = await storage.getProjectByIdAndTenant(req.params.id, tenantId);
    } else {
      existingProject = await storage.getProject(req.params.id);
    }
    if (!existingProject) {
      return sendError(res, AppError.notFound("Project"), req);
    }
    
    const effectiveClientId = data.clientId !== undefined ? data.clientId : existingProject.clientId;
    const effectiveDivisionId = data.divisionId !== undefined ? data.divisionId : existingProject.divisionId;
    
    if (effectiveClientId && tenantId) {
      const client = await storage.getClientByIdAndTenant(effectiveClientId, tenantId);
      if (!client) {
        return sendError(res, AppError.badRequest("Client not found or does not belong to tenant"), req);
      }
      
      const clientDivisions = await storage.getClientDivisionsByClient(effectiveClientId, tenantId);
      if (clientDivisions.length > 0) {
        if (!effectiveDivisionId) {
          return sendError(res, AppError.badRequest("Division is required when client has divisions"), req);
        }
        const divisionValid = await storage.validateDivisionBelongsToClientTenant(
          effectiveDivisionId, effectiveClientId, tenantId
        );
        if (!divisionValid) {
          return sendError(res, AppError.badRequest("Division does not belong to the selected client"), req);
        }
      } else if (effectiveDivisionId) {
        (data as any).divisionId = null;
      }
    }
    
    let project;
    if (tenantId) {
      project = await storage.updateProjectWithTenant(req.params.id, tenantId, data);
    } else if (isSuperUser(req)) {
      project = await storage.updateProject(req.params.id, data);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    emitProjectUpdated(project!.id, data);

    const currentUserId = getCurrentUserId(req);
    const members = await storage.getProjectMembers(project!.id);
    const updateDescription = getProjectUpdateDescription(data);
    const currentUser = await storage.getUser(currentUserId);
    
    if (updateDescription) {
      for (const member of members) {
        if (member.userId !== currentUserId) {
          notifyProjectUpdate(
            member.userId,
            project!.id,
            project!.name,
            `${currentUser?.name || "Someone"} ${updateDescription}`,
            { tenantId, excludeUserId: currentUserId }
          ).catch(() => {});
        }
      }
    }

    res.json(project);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/projects/:id", req);
  }
});

router.get("/projects/:projectId/members", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
    }
    
    const members = await storage.getProjectMembers(projectId);
    res.json(members);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/members", req);
  }
});

router.post("/projects/:projectId/members", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { userId } = req.body;
    const tenantId = getEffectiveTenantId(req);
    
    if (!userId) {
      return sendError(res, AppError.badRequest("userId is required"), req);
    }
    
    if (tenantId) {
      const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
      
      const user = await storage.getUserByIdAndTenant(userId, tenantId);
      if (!user) {
        return sendError(res, AppError.badRequest("User not found or does not belong to tenant"), req);
      }
    }
    
    const isMember = await storage.isProjectMember(projectId, userId);
    if (isMember) {
      return sendError(res, AppError.conflict("User is already a project member"), req);
    }
    
    const member = await storage.addProjectMember({ projectId, userId, role: "member" });
    
    emitProjectUpdated(projectId, { membershipChanged: true } as any);
    
    const currentUserId = getCurrentUserId(req);
    if (userId !== currentUserId) {
      const project = await storage.getProject(projectId);
      const currentUser = await storage.getUser(currentUserId);
      if (project) {
        notifyProjectMemberAdded(
          userId,
          projectId,
          project.name,
          currentUser?.name || currentUser?.email || "Someone",
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});
      }
    }
    
    res.status(201).json(member);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:projectId/members", req);
  }
});

router.delete("/projects/:projectId/members/:userId", async (req: Request, res: Response) => {
  try {
    const { projectId, userId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
    }
    
    await storage.removeProjectMember(projectId, userId);
    
    emitProjectUpdated(projectId, { membershipChanged: true } as any);
    
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/projects/:projectId/members/:userId", req);
  }
});

router.put("/projects/:projectId/members", async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const { memberIds } = req.body;
    const tenantId = getEffectiveTenantId(req);
    
    if (!Array.isArray(memberIds)) {
      return sendError(res, AppError.badRequest("memberIds must be an array"), req);
    }
    
    if (tenantId) {
      const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
      if (!project) {
        return sendError(res, AppError.notFound("Project"), req);
      }
      
      for (const memberId of memberIds) {
        const user = await storage.getUserByIdAndTenant(memberId, tenantId);
        if (!user) {
          return sendError(res, AppError.badRequest(`User ${memberId} not found or does not belong to tenant`), req);
        }
      }
    }
    
    await storage.setProjectMembers(projectId, memberIds);
    
    emitProjectUpdated(projectId, { membershipChanged: true } as any);
    
    const members = await storage.getProjectMembers(projectId);
    res.json(members);
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/projects/:projectId/members", req);
  }
});

router.post("/projects/:projectId/hide", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, AppError.unauthorized(), req);
    }
    
    const { projectId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return sendError(res, AppError.notFound("Project"), req);
    }
    if (tenantId && project.tenantId !== tenantId) {
      return sendError(res, AppError.forbidden("Access denied to this project"), req);
    }
    
    await storage.hideProject(projectId, req.user.id);
    res.json({ success: true, message: "Project hidden from your view" });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/projects/:projectId/hide", req);
  }
});

router.delete("/projects/:projectId/hide", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, AppError.unauthorized(), req);
    }
    
    const { projectId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    
    const project = await storage.getProject(projectId);
    if (!project) {
      return sendError(res, AppError.notFound("Project"), req);
    }
    if (tenantId && project.tenantId !== tenantId) {
      return sendError(res, AppError.forbidden("Access denied to this project"), req);
    }
    
    await storage.unhideProject(projectId, req.user.id);
    res.json({ success: true, message: "Project is now visible in your view" });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/projects/:projectId/hide", req);
  }
});

router.get("/projects/:projectId/hidden", async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return sendError(res, AppError.unauthorized(), req);
    }
    
    const { projectId } = req.params;
    const isHidden = await storage.isProjectHidden(projectId, req.user.id);
    res.json({ isHidden });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/hidden", req);
  }
});

router.get("/projects/:projectId/sections", async (req: Request, res: Response) => {
  try {
    const sections = await storage.getSectionsWithTasks(req.params.projectId);
    res.json(sections);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/projects/:projectId/sections", req);
  }
});

router.patch("/projects/:projectId/tasks/reorder", async (req: Request, res: Response) => {
  try {
    const { moves } = req.body;
    if (!Array.isArray(moves)) {
      throw AppError.badRequest("moves must be an array");
    }

    for (const move of moves) {
      const { itemType, taskId, parentTaskId, toSectionId, toIndex } = move;

      if (itemType === "task") {
        const task = await storage.getTask(taskId);
        if (task?.isPersonal) continue;
        await storage.moveTask(taskId, toSectionId, toIndex);
      } else if (itemType === "childTask") {
        if (!parentTaskId) {
          throw AppError.badRequest("parentTaskId required for child task reordering");
        }
        await storage.reorderChildTasks(parentTaskId, taskId, toIndex);
      } else if (itemType === "subtask") {
        if (!parentTaskId) {
          throw AppError.badRequest("parentTaskId required for subtask moves");
        }
        const subtask = await storage.getSubtask(taskId);
        if (!subtask || subtask.taskId !== parentTaskId) {
          throw AppError.badRequest("Subtask does not belong to specified parent");
        }
        await storage.moveSubtask(taskId, toIndex);
      }
    }

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/tasks/reorder", req);
  }
});

router.post("/sections", async (req: Request, res: Response) => {
  try {
    const data = insertSectionSchema.parse(req.body);
    const section = await storage.createSection(data);

    emitSectionCreated(section as any);

    res.status(201).json(section);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/sections", req);
  }
});

router.patch("/sections/:id", async (req: Request, res: Response) => {
  try {
    const data = validateBody(req.body, updateSectionSchema, res);
    if (!data) return;
    
    const section = await storage.updateSection(req.params.id, data);
    if (!section) {
      return sendError(res, AppError.notFound("Section"), req);
    }

    emitSectionUpdated(section.id, section.projectId, data);

    res.json(section);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/sections/:id", req);
  }
});

router.delete("/sections/:id", async (req: Request, res: Response) => {
  try {
    const section = await storage.getSection(req.params.id);
    if (!section) {
      return sendError(res, AppError.notFound("Section"), req);
    }

    await storage.deleteSection(req.params.id);

    emitSectionDeleted(section.id, section.projectId);

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/sections/:id", req);
  }
});

export default router;
