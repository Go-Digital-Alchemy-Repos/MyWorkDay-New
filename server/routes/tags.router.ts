import { Router } from "express";
import { storage } from "../storage";
import { handleRouteError, AppError, sendError, validateBody } from "../lib/errors";
import {
  insertTagSchema,
  updateTagSchema,
  addTagToTaskSchema,
} from "@shared/schema";

const router = Router();

router.get("/workspaces/:workspaceId/tags", async (req, res) => {
  try {
    const tags = await storage.getTagsByWorkspace(req.params.workspaceId);
    res.json(tags);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/workspaces/:workspaceId/tags", req);
  }
});

router.post("/workspaces/:workspaceId/tags", async (req, res) => {
  try {
    const data = insertTagSchema.parse({
      ...req.body,
      workspaceId: req.params.workspaceId,
    });
    const tag = await storage.createTag(data);
    res.status(201).json(tag);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/workspaces/:workspaceId/tags", req);
  }
});

router.patch("/tags/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateTagSchema, res);
    if (!data) return;
    
    const tag = await storage.updateTag(req.params.id, data);
    if (!tag) {
      return sendError(res, AppError.notFound("Tag"), req);
    }
    res.json(tag);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/tags/:id", req);
  }
});

router.delete("/tags/:id", async (req, res) => {
  try {
    await storage.deleteTag(req.params.id);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tags/:id", req);
  }
});

router.post("/tasks/:taskId/tags", async (req, res) => {
  try {
    const data = validateBody(req.body, addTagToTaskSchema, res);
    if (!data) return;
    
    const taskTag = await storage.addTaskTag({
      taskId: req.params.taskId,
      tagId: data.tagId,
    });
    res.status(201).json(taskTag);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/tasks/:taskId/tags", req);
  }
});

router.delete("/tasks/:taskId/tags/:tagId", async (req, res) => {
  try {
    await storage.removeTaskTag(req.params.taskId, req.params.tagId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/tasks/:taskId/tags/:tagId", req);
  }
});

export default router;
