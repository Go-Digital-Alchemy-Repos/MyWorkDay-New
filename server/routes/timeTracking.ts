import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertTimeEntrySchema, insertActiveTimerSchema } from "@shared/schema";
import { getCurrentUserId, getCurrentWorkspaceId } from "../middleware/authContext";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { AppError } from "../lib/errors";
import {
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
} from "../realtime/events";

const router = Router();

const startTimerSchema = z.object({
  clientId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  description: z.string().optional(),
});

const stopTimerSchema = z.object({
  discard: z.boolean().optional(),
  scope: z.enum(["in_scope", "out_of_scope"]).optional(),
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  taskId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
});

router.get(
  "/current",
  asyncHandler(async (req: Request, res: Response) => {
    const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
    res.json(timer);
  })
);

router.post(
  "/start",
  validateBody(startTimerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const tenantId = getEffectiveTenantId(req);

    if (!tenantId) {
      throw AppError.badRequest("Tenant context required");
    }

    const existing = await storage.getActiveTimerByUser(userId);
    if (existing) {
      throw AppError.conflict("A timer is already running. Stop it first.");
    }

    const now = new Date();
    const data = insertActiveTimerSchema.parse({
      tenantId,
      userId,
      workspaceId,
      clientId: req.body.clientId || null,
      projectId: req.body.projectId || null,
      taskId: req.body.taskId || null,
      description: req.body.description || null,
      lastStartedAt: now,
      status: "running",
      elapsedSeconds: 0,
    });

    const timer = await storage.createActiveTimer(data);

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
      workspaceId
    );

    res.status(201).json(timer);
  })
);

router.post(
  "/pause",
  asyncHandler(async (req: Request, res: Response) => {
    const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
    if (!timer) {
      throw AppError.notFound("No active timer found");
    }

    if (timer.status === "paused") {
      throw AppError.badRequest("Timer is already paused");
    }

    const now = new Date();
    const lastStarted = timer.lastStartedAt ? new Date(timer.lastStartedAt) : now;
    const sessionElapsed = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
    const newElapsedSeconds = timer.elapsedSeconds + sessionElapsed;

    const updated = await storage.updateActiveTimer(timer.id, {
      status: "paused",
      elapsedSeconds: newElapsedSeconds,
    });

    emitTimerPaused(timer.id, getCurrentUserId(req), newElapsedSeconds, getCurrentWorkspaceId(req));

    res.json(updated);
  })
);

router.post(
  "/resume",
  asyncHandler(async (req: Request, res: Response) => {
    const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
    if (!timer) {
      throw AppError.notFound("No active timer found");
    }

    if (timer.status === "running") {
      throw AppError.badRequest("Timer is already running");
    }

    const now = new Date();
    const updated = await storage.updateActiveTimer(timer.id, {
      status: "running",
      lastStartedAt: now,
    });

    emitTimerResumed(timer.id, getCurrentUserId(req), now, getCurrentWorkspaceId(req));

    res.json(updated);
  })
);

router.post(
  "/stop",
  validateBody(stopTimerSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const timer = await storage.getActiveTimerByUser(userId);
    if (!timer) {
      throw AppError.notFound("No active timer found");
    }

    const { discard, scope, title, description, taskId, clientId, projectId } = req.body;
    const requestId = req.headers["x-request-id"] as string | undefined;

    let finalElapsedSeconds = timer.elapsedSeconds;
    if (timer.status === "running" && timer.lastStartedAt) {
      const now = new Date();
      const sessionElapsed = Math.floor(
        (now.getTime() - new Date(timer.lastStartedAt).getTime()) / 1000
      );
      finalElapsedSeconds += sessionElapsed;
    }

    // Use submitted values, falling back to timer values
    const finalClientId = clientId !== undefined ? clientId : timer.clientId;
    const finalProjectId = projectId !== undefined ? projectId : timer.projectId;
    const finalTaskId = taskId !== undefined ? taskId : timer.taskId;
    const finalDescription = description !== undefined ? description : timer.description;
    const finalTitle = title || timer.title || null;

    let timeEntryId: string | null = null;

    // EXPLICIT DISCARD: User explicitly chose to discard - delete timer without saving
    if (discard === true) {
      console.log(`[Timer Stop] Explicit discard requested. timerId=${timer.id}, requestId=${requestId}`);
      await storage.deleteActiveTimer(timer.id);
      emitTimerStopped(timer.id, userId, null, workspaceId);
      return res.json({
        success: true,
        timeEntryId: null,
        discarded: true,
        durationSeconds: finalElapsedSeconds,
      });
    }

    // ZERO DURATION: Require explicit discard for zero-duration timers
    if (finalElapsedSeconds === 0) {
      console.warn(`[Timer Stop] Zero duration timer cannot be saved. timerId=${timer.id}, requestId=${requestId}`);
      throw AppError.badRequest("Timer has zero duration. Please discard it explicitly or continue timing.");
    }

    // SAVE TIME ENTRY: Validate and create entry, then delete timer
    if (!finalClientId) {
      console.error(`[Timer Stop] Client required but missing. timerId=${timer.id}, requestId=${requestId}`);
      throw AppError.badRequest("Client is required to save time entry");
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - finalElapsedSeconds * 1000);

    const timeEntry = await storage.createTimeEntry({
      workspaceId,
      userId,
      clientId: finalClientId,
      projectId: finalProjectId,
      taskId: finalTaskId,
      title: finalTitle,
      description: finalDescription,
      startTime,
      endTime,
      durationSeconds: finalElapsedSeconds,
      scope: scope || "in_scope",
      isManual: false,
    });

    timeEntryId = timeEntry.id;

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
      workspaceId
    );

    // Only delete timer AFTER successful time entry creation
    await storage.deleteActiveTimer(timer.id);

    emitTimerStopped(timer.id, userId, timeEntryId, workspaceId);

    res.json({
      success: true,
      timeEntryId,
      discarded: false,
      durationSeconds: finalElapsedSeconds,
    });
  })
);

router.patch(
  "/current",
  asyncHandler(async (req: Request, res: Response) => {
    const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
    if (!timer) {
      throw AppError.notFound("No active timer found");
    }

    const { clientId, projectId, taskId, description } = req.body;

    const updates: Record<string, unknown> = {};
    if (clientId !== undefined) updates.clientId = clientId;
    if (projectId !== undefined) updates.projectId = projectId;
    if (taskId !== undefined) updates.taskId = taskId;
    if (description !== undefined) updates.description = description;

    const updated = await storage.updateActiveTimer(timer.id, updates);

    emitTimerUpdated(timer.id, getCurrentUserId(req), updates as Partial<{ clientId: string | null; projectId: string | null; taskId: string | null; description: string | null }>, getCurrentWorkspaceId(req));

    res.json(updated);
  })
);

router.delete(
  "/current",
  asyncHandler(async (req: Request, res: Response) => {
    const timer = await storage.getActiveTimerByUser(getCurrentUserId(req));
    if (!timer) {
      throw AppError.notFound("No active timer found");
    }

    await storage.deleteActiveTimer(timer.id);

    emitTimerStopped(timer.id, getCurrentUserId(req), null, getCurrentWorkspaceId(req));

    res.status(204).send();
  })
);

export default router;
