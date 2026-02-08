import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { insertClientDivisionSchema } from "@shared/schema";
import type { Request } from "express";
import { handleRouteError, AppError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

const router = Router();

// =============================================================================
// CLIENT DIVISIONS
// =============================================================================

router.get("/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) {
      throw AppError.notFound("Client");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    // Allow super users, tenant admins, and tenant employees to see all divisions
    const canSeeAll = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    let divisions = await storage.getClientDivisionsByClient(clientId, tenantId);
    
    if (!canSeeAll) {
      const userDivisions = await storage.getUserDivisions(userId, tenantId);
      const userDivisionIds = new Set(userDivisions.map(d => d.id));
      divisions = divisions.filter(d => userDivisionIds.has(d.id));
    }
    
    const divisionsWithCounts = await Promise.all(divisions.map(async (division) => {
      const members = await storage.getDivisionMembers(division.id);
      return {
        ...division,
        memberCount: members.length,
        projectCount: 0,
      };
    }));
    
    res.json(divisionsWithCounts);
  } catch (error) {
    return handleRouteError(res, error, "GET /clients/:clientId/divisions", req);
  }
});

router.post("/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) {
      throw AppError.notFound("Client");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    // Allow super users, tenant admins, and tenant employees to create divisions
    const canCreate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canCreate) {
      throw AppError.forbidden("You do not have permission to create divisions");
    }
    
    const data = insertClientDivisionSchema.parse({
      ...req.body,
      clientId,
      tenantId,
    });
    
    const division = await storage.createClientDivision(data);
    res.status(201).json(division);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw AppError.badRequest("Validation failed", error.errors);
    }
    return handleRouteError(res, error, "POST /clients/:clientId/divisions", req);
  }
});

router.patch("/divisions/:divisionId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId } = req.params;
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    // Allow super users, tenant admins, and tenant employees to update divisions
    const canUpdate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canUpdate) {
      throw AppError.forbidden("You do not have permission to update divisions");
    }
    
    const updateSchema = insertClientDivisionSchema.partial().omit({ 
      tenantId: true, 
      clientId: true 
    });
    const data = updateSchema.parse(req.body);
    
    const division = await storage.updateClientDivision(divisionId, tenantId, data);
    if (!division) {
      throw AppError.notFound("Division");
    }
    
    res.json(division);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw AppError.badRequest("Validation failed", error.errors);
    }
    return handleRouteError(res, error, "PATCH /divisions/:divisionId", req);
  }
});

router.get("/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId } = req.params;
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      throw AppError.notFound("Division");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    // Allow super users, tenant admins, and tenant employees to view division members
    const isPrivileged = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!isPrivileged) {
      const isMember = await storage.isDivisionMember(divisionId, userId);
      if (!isMember) {
        throw AppError.forbidden("You do not have access to this division");
      }
    }
    
    const members = await storage.getDivisionMembers(divisionId);
    res.json({ members });
  } catch (error) {
    return handleRouteError(res, error, "GET /divisions/:divisionId/members", req);
  }
});

router.post("/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId } = req.params;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) {
      throw AppError.badRequest("userIds must be an array");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    // Allow super users, tenant admins, and tenant employees to manage division members
    const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canManage) {
      throw AppError.forbidden("You do not have permission to manage division members");
    }
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      throw AppError.notFound("Division");
    }
    
    for (const uid of userIds) {
      const userToAdd = await storage.getUser(uid);
      if (!userToAdd || userToAdd.tenantId !== tenantId) {
        throw AppError.badRequest(`User ${uid} does not belong to this tenant`);
      }
    }
    
    await storage.setDivisionMembers(divisionId, tenantId, userIds);
    const members = await storage.getDivisionMembers(divisionId);
    
    res.json({ success: true, members });
  } catch (error) {
    return handleRouteError(res, error, "POST /divisions/:divisionId/members", req);
  }
});

router.delete("/divisions/:divisionId/members/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId, userId: targetUserId } = req.params;
    
    const currentUserId = getCurrentUserId(req);
    const user = await storage.getUser(currentUserId);
    // Allow super users, tenant admins, and tenant employees to remove division members
    const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canManage) {
      throw AppError.forbidden("You do not have permission to remove division members");
    }
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      throw AppError.notFound("Division");
    }
    
    await storage.removeDivisionMember(divisionId, targetUserId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /divisions/:divisionId/members/:userId", req);
  }
});

// Get projects for a division
router.get("/divisions/:divisionId/projects", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId } = req.params;
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      throw AppError.notFound("Division");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canView = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canView) {
      const isMember = await storage.isDivisionMember(divisionId, userId);
      if (!isMember) {
        throw AppError.forbidden("You do not have access to this division");
      }
    }
    
    // Get all projects in tenant and filter by divisionId
    const allProjects = await storage.getProjectsByTenant(tenantId);
    const divisionProjects = allProjects.filter((p: any) => p.divisionId === divisionId);
    
    res.json(divisionProjects);
  } catch (error) {
    return handleRouteError(res, error, "GET /divisions/:divisionId/projects", req);
  }
});

// Get tasks for a division (from all projects in this division)
router.get("/divisions/:divisionId/tasks", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      throw AppError.forbidden("Tenant context required");
    }
    
    const { divisionId } = req.params;
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      throw AppError.notFound("Division");
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canView = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canView) {
      const isMember = await storage.isDivisionMember(divisionId, userId);
      if (!isMember) {
        throw AppError.forbidden("You do not have access to this division");
      }
    }
    
    // Get all projects in this division
    const allProjects = await storage.getProjectsByTenant(tenantId);
    const divisionProjects = allProjects.filter((p: any) => p.divisionId === divisionId);
    const projectIds = divisionProjects.map((p: any) => p.id);
    
    if (projectIds.length === 0) {
      return res.json([]);
    }
    
    // Use batch query to get tasks for all projects at once
    const tasksByProject = await storage.getTasksByProjectIds(projectIds);
    const allTasks: any[] = [];
    tasksByProject.forEach((tasks) => {
      allTasks.push(...tasks);
    });
    
    res.json(allTasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /divisions/:divisionId/tasks", req);
  }
});

export default router;
