import { Router } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getCurrentUserId, getCurrentWorkspaceIdAsync, getCurrentWorkspaceId } from "./helpers";
import {
  insertWorkspaceSchema,
  insertWorkspaceMemberSchema,
  updateWorkspaceSchema,
} from "@shared/schema";

const router = Router();

router.get("/workspaces/current", async (req, res) => {
  try {
    const workspaceId = await getCurrentWorkspaceIdAsync(req);
    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      return sendError(res, AppError.notFound("Workspace"), req);
    }
    res.json(workspace);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspaces/current", req);
  }
});

router.get("/workspaces/:id", async (req, res) => {
  try {
    const workspace = await storage.getWorkspace(req.params.id);
    if (!workspace) {
      return sendError(res, AppError.notFound("Workspace"), req);
    }
    res.json(workspace);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspaces/:id", req);
  }
});

router.post("/workspaces", async (req, res) => {
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
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/workspaces", req);
  }
});

router.get("/workspaces/:workspaceId/members", async (req, res) => {
  try {
    const members = await storage.getWorkspaceMembers(req.params.workspaceId);
    res.json(members);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspaces/:workspaceId/members", req);
  }
});

router.post("/workspaces/:workspaceId/members", async (req, res) => {
  try {
    const data = insertWorkspaceMemberSchema.parse({
      ...req.body,
      workspaceId: req.params.workspaceId,
    });
    const member = await storage.addWorkspaceMember(data);
    res.status(201).json(member);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return sendError(res, AppError.badRequest("Validation failed", error.errors), req);
    }
    return handleRouteError(res, error, "POST /api/workspaces/:workspaceId/members", req);
  }
});

router.patch("/workspaces/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateWorkspaceSchema, res);
    if (!data) return;
    
    const workspace = await storage.updateWorkspace(req.params.id, data);
    if (!workspace) {
      return sendError(res, AppError.notFound("Workspace"), req);
    }
    res.json(workspace);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/workspaces/:id", req);
  }
});

router.get("/workspaces", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const workspaces = await storage.getWorkspacesByUser(userId);
    res.json(workspaces);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspaces", req);
  }
});

router.get("/workspace-members", async (req, res) => {
  try {
    const workspaceId = getCurrentWorkspaceId(req);
    const members = await storage.getWorkspaceMembers(workspaceId);
    res.json(members);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspace-members", req);
  }
});

export default router;
