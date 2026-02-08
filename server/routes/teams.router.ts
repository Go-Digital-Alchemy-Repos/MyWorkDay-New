import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { getCurrentWorkspaceIdAsync, isSuperUser } from "./helpers";
import {
  insertTeamSchema,
  insertTeamMemberSchema,
  updateTeamSchema,
} from "@shared/schema";

const router = Router();

router.get("/teams", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = await getCurrentWorkspaceIdAsync(req);
    
    if (tenantId) {
      const teams = await storage.getTeamsByTenant(tenantId, workspaceId);
      return res.json(teams);
    }
    
    if (isSuperUser(req)) {
      const teams = await storage.getTeamsByWorkspace(workspaceId);
      return res.json(teams);
    }
    
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/teams", req);
  }
});

router.get("/teams/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const team = await storage.getTeamByIdAndTenant(req.params.id, tenantId);
      if (!team) {
        return sendError(res, AppError.notFound("Team"), req);
      }
      return res.json(team);
    }
    
    if (isSuperUser(req)) {
      const team = await storage.getTeam(req.params.id);
      if (!team) {
        return sendError(res, AppError.notFound("Team"), req);
      }
      return res.json(team);
    }
    
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/teams/:id", req);
  }
});

router.post("/teams", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = await getCurrentWorkspaceIdAsync(req);
    
    const data = insertTeamSchema.parse({
      ...req.body,
      workspaceId,
    });
    
    let team;
    if (tenantId) {
      team = await storage.createTeamWithTenant(data, tenantId);
    } else if (isSuperUser(req)) {
      team = await storage.createTeam(data);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    res.status(201).json(team);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/teams", req);
  }
});

router.get("/teams/:teamId/members", async (req, res) => {
  try {
    const members = await storage.getTeamMembers(req.params.teamId);
    res.json(members);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/teams/:teamId/members", req);
  }
});

router.post("/teams/:teamId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const team = await storage.getTeamByIdAndTenant(req.params.teamId, tenantId);
      if (!team) {
        return sendError(res, AppError.notFound("Team"), req);
      }
      
      const user = await storage.getUserByIdAndTenant(req.body.userId, tenantId);
      if (!user) {
        return sendError(res, AppError.badRequest("User not found or does not belong to tenant"), req);
      }
    }
    
    const data = insertTeamMemberSchema.parse({
      ...req.body,
      teamId: req.params.teamId,
    });
    const member = await storage.addTeamMember(data);
    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/teams/:teamId/members", req);
  }
});

router.patch("/teams/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateTeamSchema, res);
    if (!data) return;
    
    const tenantId = getEffectiveTenantId(req);
    
    let team;
    if (tenantId) {
      team = await storage.updateTeamWithTenant(req.params.id, tenantId, data);
    } else if (isSuperUser(req)) {
      team = await storage.updateTeam(req.params.id, data);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    if (!team) {
      return sendError(res, AppError.notFound("Team"), req);
    }
    res.json(team);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/teams/:id", req);
  }
});

router.delete("/teams/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const deleted = await storage.deleteTeamWithTenant(req.params.id, tenantId);
      if (!deleted) {
        return sendError(res, AppError.notFound("Team"), req);
      }
    } else if (isSuperUser(req)) {
      await storage.deleteTeam(req.params.id);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/teams/:id", req);
  }
});

router.delete("/teams/:teamId/members/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const team = await storage.getTeamByIdAndTenant(req.params.teamId, tenantId);
      if (!team) {
        return sendError(res, AppError.notFound("Team"), req);
      }
    }
    
    await storage.removeTeamMember(req.params.teamId, req.params.userId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/teams/:teamId/members/:userId", req);
  }
});

export default router;
