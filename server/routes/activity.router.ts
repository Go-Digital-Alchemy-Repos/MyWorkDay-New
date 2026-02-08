import { Router } from "express";
import { storage } from "../storage";
import { handleRouteError } from "../lib/errors";
import { getCurrentUserId } from "./helpers";
import { insertActivityLogSchema } from "@shared/schema";

const router = Router();

router.post("/activity-log", async (req, res) => {
  try {
    const data = insertActivityLogSchema.parse({
      ...req.body,
      userId: getCurrentUserId(req),
    });
    const log = await storage.createActivityLog(data);
    res.status(201).json(log);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/activity-log", req);
  }
});

router.get("/activity-log/:entityType/:entityId", async (req, res) => {
  try {
    const logs = await storage.getActivityLogByEntity(
      req.params.entityType,
      req.params.entityId,
    );
    res.json(logs);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/activity-log/:entityType/:entityId", req);
  }
});

export default router;
