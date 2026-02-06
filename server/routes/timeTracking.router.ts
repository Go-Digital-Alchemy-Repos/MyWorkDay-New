import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { handleRouteError } from "../lib/errors";
import {
  insertTimeEntrySchema,
  insertActiveTimerSchema,
  ActiveTimer,
} from "@shared/schema";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import {
  isStrictMode,
  isSoftMode,
  addTenancyWarningHeader,
  logTenancyWarning,
} from "../middleware/tenancyEnforcement";
import {
  getCurrentUserId,
  getCurrentWorkspaceId,
} from "./helpers";
import {
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
  emitTimeEntryUpdated,
  emitTimeEntryDeleted,
} from "../realtime/events";

const router = Router();

// =============================================================================
// TIME TRACKING - ACTIVE TIMER
// =============================================================================

// Get current user's active timer
router.get("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/current", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    res.json(timer || null);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/timer/current", req);
  }
});

// Start a new timer
router.post("/timer/start", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let existingTimer;
    if (tenantId && isStrictMode()) {
      existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!existingTimer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          existingTimer = legacyTimer;
          logTenancyWarning("timer/start", "Existing legacy timer found without tenantId", userId);
        }
      }
    } else {
      existingTimer = await storage.getActiveTimerByUser(userId);
    }
    
    if (existingTimer) {
      if (isSoftMode() && !existingTimer.tenantId) {
        addTenancyWarningHeader(res, "Existing timer has legacy null tenantId");
      }
      return res.status(409).json({
        error: "TIMER_ALREADY_RUNNING",
        message: "You already have an active timer. Stop it before starting a new one.",
        timer: existingTimer,
      });
    }

    const now = new Date();
    const data = insertActiveTimerSchema.parse({
      workspaceId: getCurrentWorkspaceId(req),
      userId: userId,
      clientId: req.body.clientId || null,
      projectId: req.body.projectId || null,
      taskId: req.body.taskId || null,
      title: req.body.title || null,
      description: req.body.description || null,
      status: "running",
      elapsedSeconds: 0,
      lastStartedAt: now,
    });

    let timer;
    if (tenantId) {
      timer = await storage.createActiveTimerWithTenant(data, tenantId);
    } else {
      timer = await storage.createActiveTimer(data);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Timer created without tenant context");
        logTenancyWarning("timer/start", "Timer created without tenantId", userId);
      }
    }

    const enrichedTimer = await storage.getActiveTimerByUser(userId);

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
      getCurrentWorkspaceId(req),
    );

    res.status(201).json(enrichedTimer);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/start", req);
  }
});

// Pause the timer
router.post("/timer/pause", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/pause", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) {
      return res.status(404).json({ error: "No active timer found" });
    }
    if (timer.status !== "running") {
      return res.status(400).json({ error: "Timer is not running" });
    }

    const now = new Date();
    const lastStarted = timer.lastStartedAt || timer.createdAt;
    const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
    const newElapsedSeconds = timer.elapsedSeconds + additionalSeconds;

    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
        status: "paused",
        elapsedSeconds: newElapsedSeconds,
      });
    } else {
      updated = await storage.updateActiveTimer(timer.id, {
        status: "paused",
        elapsedSeconds: newElapsedSeconds,
      });
      if (isSoftMode()) {
        logTenancyWarning("timer/pause", "Updated legacy timer without tenantId", userId);
      }
    }

    emitTimerPaused(timer.id, userId, newElapsedSeconds, getCurrentWorkspaceId(req));

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/pause", req);
  }
});

// Resume the timer
router.post("/timer/resume", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/resume", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) {
      return res.status(404).json({ error: "No active timer found" });
    }
    if (timer.status !== "paused") {
      return res.status(400).json({ error: "Timer is not paused" });
    }

    const now = new Date();
    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
        status: "running",
        lastStartedAt: now,
      });
    } else {
      updated = await storage.updateActiveTimer(timer.id, {
        status: "running",
        lastStartedAt: now,
      });
      if (isSoftMode()) {
        logTenancyWarning("timer/resume", "Resumed legacy timer without tenantId", userId);
      }
    }

    emitTimerResumed(timer.id, userId, now, getCurrentWorkspaceId(req));

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/resume", req);
  }
});

// Update timer details (client, project, task, description)
router.patch("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/update", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) {
      return res.status(404).json({ error: "No active timer found" });
    }

    const allowedUpdates: Partial<ActiveTimer> = {};
    if ("clientId" in req.body) allowedUpdates.clientId = req.body.clientId;
    if ("projectId" in req.body) allowedUpdates.projectId = req.body.projectId;
    if ("taskId" in req.body) allowedUpdates.taskId = req.body.taskId;
    if ("description" in req.body) allowedUpdates.description = req.body.description;

    let updated;
    if (timer.tenantId) {
      updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, allowedUpdates);
    } else {
      updated = await storage.updateActiveTimer(timer.id, allowedUpdates);
      if (isSoftMode()) {
        logTenancyWarning("timer/update", "Updated legacy timer without tenantId", userId);
      }
    }

    emitTimerUpdated(timer.id, userId, allowedUpdates as any, getCurrentWorkspaceId(req));

    const enrichedTimer = await storage.getActiveTimerByUser(userId);
    res.json(enrichedTimer);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/timer/current", req);
  }
});

// Stop and finalize timer (creates time entry or discards)
router.post("/timer/stop", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/stop", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) {
      return res.status(404).json({ error: "No active timer found" });
    }

    let finalElapsedSeconds = timer.elapsedSeconds;
    if (timer.status === "running") {
      const now = new Date();
      const lastStarted = timer.lastStartedAt || timer.createdAt;
      const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
      finalElapsedSeconds += additionalSeconds;
    }

    const { discard, scope, title, description, clientId, projectId, taskId } = req.body;

    let timeEntryId: string | null = null;

    if (!discard && finalElapsedSeconds > 0) {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - finalElapsedSeconds * 1000);

      const entryData = {
        workspaceId,
        userId,
        clientId: clientId !== undefined ? clientId : timer.clientId,
        projectId: projectId !== undefined ? projectId : timer.projectId,
        taskId: taskId !== undefined ? taskId : timer.taskId,
        title: title !== undefined ? title : null,
        description: description !== undefined ? description : timer.description,
        startTime,
        endTime,
        durationSeconds: finalElapsedSeconds,
        scope: scope || "in_scope",
        isManual: false,
      };

      let timeEntry;
      const effectiveTenantId = timer.tenantId || tenantId;
      if (effectiveTenantId) {
        timeEntry = await storage.createTimeEntryWithTenant(entryData, effectiveTenantId);
      } else {
        timeEntry = await storage.createTimeEntry(entryData);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Time entry created without tenantId");
          logTenancyWarning("timer/stop", "Time entry created without tenantId", userId);
        }
      }

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
        workspaceId,
      );
    }

    if (timer.tenantId) {
      await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
    } else {
      await storage.deleteActiveTimer(timer.id);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
        logTenancyWarning("timer/stop", "Deleted legacy timer without tenantId", userId);
      }
    }

    emitTimerStopped(timer.id, userId, timeEntryId, workspaceId);

    res.json({
      success: true,
      timeEntryId,
      discarded: discard || finalElapsedSeconds === 0,
      durationSeconds: finalElapsedSeconds,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/timer/stop", req);
  }
});

// Discard timer without saving
router.delete("/timer/current", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let timer;
    if (tenantId && isStrictMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
    } else if (tenantId && isSoftMode()) {
      timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      if (!timer) {
        const legacyTimer = await storage.getActiveTimerByUser(userId);
        if (legacyTimer && !legacyTimer.tenantId) {
          timer = legacyTimer;
          addTenancyWarningHeader(res, "Timer has legacy null tenantId");
          logTenancyWarning("timer/delete", "Legacy timer without tenantId", userId);
        }
      }
    } else {
      timer = await storage.getActiveTimerByUser(userId);
    }
    
    if (!timer) {
      return res.status(404).json({ error: "No active timer found" });
    }

    if (timer.tenantId) {
      await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
    } else {
      await storage.deleteActiveTimer(timer.id);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
        logTenancyWarning("timer/delete", "Deleted legacy timer without tenantId", userId);
      }
    }

    emitTimerStopped(timer.id, userId, null, getCurrentWorkspaceId(req));

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/timer/current", req);
  }
});

// =============================================================================
// TIME TRACKING - TIME ENTRIES
// =============================================================================

// Get time entries for workspace (with optional filters)
router.get("/time-entries", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { userId, clientId, projectId, taskId, scope, startDate, endDate } = req.query;

    const filters: any = {};
    if (userId) filters.userId = userId as string;
    if (clientId) filters.clientId = clientId as string;
    if (projectId) filters.projectId = projectId as string;
    if (taskId) filters.taskId = taskId as string;
    if (scope) filters.scope = scope as "in_scope" | "out_of_scope";
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    } else {
      entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
        addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
      }
    }
    res.json(entries);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries", req);
  }
});

// Get current user's time entries
router.get("/time-entries/my", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
    } else {
      entries = await storage.getTimeEntriesByUser(userId, workspaceId);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
        addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
      }
    }
    res.json(entries);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/my", req);
  }
});

// Get personal time statistics for "My Time" dashboard
router.get("/time-entries/my/stats", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
    } else {
      entries = await storage.getTimeEntriesByUser(userId, workspaceId);
    }
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    
    const dayOfWeek = now.getDay();
    const weekStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    
    let todaySeconds = 0, todayBillable = 0, todayUnbillable = 0;
    let weekSeconds = 0, weekBillable = 0, weekUnbillable = 0;
    let monthSeconds = 0, monthBillable = 0, monthUnbillable = 0;
    let totalSeconds = 0, totalBillable = 0, totalUnbillable = 0;
    
    const dailyBreakdown: Record<string, { date: string; total: number; billable: number; unbillable: number }> = {};
    const entriesWithMissingDescriptions: Array<{ id: string; date: string; duration: number; clientName?: string; projectName?: string }> = [];
    const dayTotals: Record<string, number> = {};
    
    for (const entry of entries) {
      const entryDate = new Date(entry.startTime);
      const isBillable = entry.scope === "out_of_scope";
      const seconds = entry.durationSeconds;
      
      totalSeconds += seconds;
      if (isBillable) totalBillable += seconds;
      else totalUnbillable += seconds;
      
      if (entryDate >= todayStart && entryDate < todayEnd) {
        todaySeconds += seconds;
        if (isBillable) todayBillable += seconds;
        else todayUnbillable += seconds;
      }
      
      if (entryDate >= weekStart && entryDate < weekEnd) {
        weekSeconds += seconds;
        if (isBillable) weekBillable += seconds;
        else weekUnbillable += seconds;
        
        const dateKey = entryDate.toISOString().split('T')[0];
        if (!dailyBreakdown[dateKey]) {
          dailyBreakdown[dateKey] = { date: dateKey, total: 0, billable: 0, unbillable: 0 };
        }
        dailyBreakdown[dateKey].total += seconds;
        if (isBillable) dailyBreakdown[dateKey].billable += seconds;
        else dailyBreakdown[dateKey].unbillable += seconds;
      }
      
      if (entryDate >= monthStart && entryDate < monthEnd) {
        monthSeconds += seconds;
        if (isBillable) monthBillable += seconds;
        else monthUnbillable += seconds;
        
        const dateKey = entryDate.toISOString().split('T')[0];
        dayTotals[dateKey] = (dayTotals[dateKey] || 0) + seconds;
      }
      
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (entryDate >= thirtyDaysAgo && (!entry.description || entry.description.trim() === '')) {
        entriesWithMissingDescriptions.push({
          id: entry.id,
          date: entryDate.toISOString(),
          duration: seconds,
          clientName: entry.client?.displayName || entry.client?.legalName,
          projectName: entry.project?.name,
        });
      }
    }
    
    const longRunningDays = Object.entries(dayTotals)
      .filter(([_, seconds]) => seconds > 28800)
      .map(([date, seconds]) => ({ date, hours: Math.round(seconds / 3600 * 10) / 10 }));
    
    const sortedEntries = [...entries].sort((a, b) => 
      new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
    const lastEntry = sortedEntries[0];
    
    res.json({
      today: { total: todaySeconds, billable: todayBillable, unbillable: todayUnbillable },
      thisWeek: { total: weekSeconds, billable: weekBillable, unbillable: weekUnbillable },
      thisMonth: { total: monthSeconds, billable: monthBillable, unbillable: monthUnbillable },
      allTime: { total: totalSeconds, billable: totalBillable, unbillable: totalUnbillable },
      dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date)),
      warnings: {
        missingDescriptions: entriesWithMissingDescriptions.slice(0, 10),
        longRunningDays: longRunningDays.slice(0, 5),
      },
      lastEntryId: lastEntry?.id || null,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/my/stats", req);
  }
});

// Get single time entry
router.get("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/:id", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) {
      return res.status(404).json({ error: "Time entry not found" });
    }
    res.json(entry);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/:id", req);
  }
});

// Create manual time entry
router.post("/time-entries", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    const { startTime, endTime, durationSeconds, ...rest } = req.body;

    let duration = durationSeconds;
    let start = startTime ? new Date(startTime) : new Date();
    let end = endTime ? new Date(endTime) : null;

    if (!duration && start && end) {
      duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    } else if (duration && !end) {
      end = new Date(start.getTime() + duration * 1000);
    }

    const data = insertTimeEntrySchema.parse({
      ...rest,
      workspaceId,
      userId,
      startTime: start,
      endTime: end,
      durationSeconds: duration || 0,
      isManual: true,
      scope: rest.scope || "in_scope",
    });

    let entry;
    if (tenantId) {
      entry = await storage.createTimeEntryWithTenant(data, tenantId);
    } else {
      entry = await storage.createTimeEntry(data);
      if (isSoftMode()) {
        addTenancyWarningHeader(res, "Time entry created without tenant context");
        logTenancyWarning("time-entries/create", "Time entry created without tenantId", userId);
      }
    }

    emitTimeEntryCreated(
      {
        id: entry.id,
        workspaceId: entry.workspaceId,
        userId: entry.userId,
        clientId: entry.clientId,
        projectId: entry.projectId,
        taskId: entry.taskId,
        description: entry.description,
        startTime: entry.startTime,
        endTime: entry.endTime,
        durationSeconds: entry.durationSeconds,
        scope: entry.scope as "in_scope" | "out_of_scope",
        isManual: entry.isManual,
        createdAt: entry.createdAt,
      },
      workspaceId,
    );

    res.status(201).json(entry);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/time-entries", req);
  }
});

// Update time entry
router.patch("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/update", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    const { startTime, endTime, durationSeconds, clientId, projectId, taskId, ...rest } = req.body;

    const finalClientId = clientId !== undefined ? clientId : entry.clientId;
    const finalProjectId = projectId !== undefined ? projectId : entry.projectId;
    const finalTaskId = taskId !== undefined ? taskId : entry.taskId;

    if (finalProjectId) {
      const project = await storage.getProject(finalProjectId);
      if (!project) {
        return res.status(400).json({ error: "Project not found" });
      }
      if (project.workspaceId !== workspaceId) {
        return res.status(403).json({ error: "Project does not belong to current workspace" });
      }
      if (finalClientId && project.clientId !== finalClientId) {
        return res.status(400).json({ error: "Project does not belong to the selected client" });
      }
    }

    if (finalTaskId) {
      const task = await storage.getTask(finalTaskId);
      if (!task) {
        return res.status(400).json({ error: "Task not found" });
      }
      if (task.projectId !== finalProjectId) {
        return res.status(400).json({ error: "Task does not belong to the selected project" });
      }
    }

    if (durationSeconds !== undefined && durationSeconds <= 0) {
      return res.status(400).json({ error: "Duration must be greater than zero" });
    }

    const updates: any = { ...rest };
    if (clientId !== undefined) updates.clientId = clientId;
    if (projectId !== undefined) updates.projectId = projectId;
    if (taskId !== undefined) updates.taskId = taskId;
    if (startTime) updates.startTime = new Date(startTime);
    if (endTime !== undefined) updates.endTime = endTime ? new Date(endTime) : null;
    if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;

    let updated;
    if (entry.tenantId) {
      updated = await storage.updateTimeEntryWithTenant(req.params.id, entry.tenantId, updates);
    } else {
      updated = await storage.updateTimeEntry(req.params.id, updates);
      if (isSoftMode()) {
        logTenancyWarning("time-entries/update", "Updated legacy time entry without tenantId", userId);
      }
    }

    emitTimeEntryUpdated(req.params.id, workspaceId, updates);

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/time-entries/:id", req);
  }
});

// Delete time entry
router.delete("/time-entries/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    
    let entry;
    if (tenantId && isStrictMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
    } else if (tenantId && isSoftMode()) {
      entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      if (!entry) {
        const legacyEntry = await storage.getTimeEntry(req.params.id);
        if (legacyEntry && !legacyEntry.tenantId) {
          entry = legacyEntry;
          addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
          logTenancyWarning("time-entries/delete", "Legacy time entry without tenantId", userId);
        }
      }
    } else {
      entry = await storage.getTimeEntry(req.params.id);
    }
    
    if (!entry) {
      return res.status(404).json({ error: "Time entry not found" });
    }

    if (entry.tenantId) {
      await storage.deleteTimeEntryWithTenant(req.params.id, entry.tenantId);
    } else {
      await storage.deleteTimeEntry(req.params.id);
      if (isSoftMode()) {
        logTenancyWarning("time-entries/delete", "Deleted legacy time entry without tenantId", userId);
      }
    }

    emitTimeEntryDeleted(req.params.id, getCurrentWorkspaceId(req));

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/time-entries/:id", req);
  }
});

// =============================================================================
// CALENDAR - UNIFIED VIEW
// =============================================================================

// Get calendar events (tasks with due dates + time entries) by date range
router.get("/calendar/events", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { start, end } = req.query;

    const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 30));
    const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

    let tasksInRange;
    if (tenantId && isStrictMode()) {
      tasksInRange = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
    } else {
      tasksInRange = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
    }

    const timeFilters = {
      startDate,
      endDate,
    };

    let timeEntries;
    if (tenantId && isStrictMode()) {
      timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, timeFilters);
    } else {
      timeEntries = await storage.getTimeEntriesByWorkspace(workspaceId, timeFilters);
    }

    let clients;
    let projects;
    if (tenantId && isStrictMode()) {
      clients = await storage.getClientsByTenant(tenantId, workspaceId);
      projects = await storage.getProjectsByTenant(tenantId, workspaceId);
    } else {
      clients = await storage.getClientsByWorkspace(workspaceId);
      projects = await storage.getProjectsByWorkspace(workspaceId);
    }

    let users;
    if (tenantId) {
      users = await storage.getUsersByTenant(tenantId);
    } else {
      users = await storage.getUsersByWorkspace(workspaceId);
    }

    res.json({
      tasks: tasksInRange,
      timeEntries,
      clients,
      projects,
      users: users || [],
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/calendar/events", req);
  }
});

// Get personal calendar events (user's own tasks and time entries only)
router.get("/my-calendar/events", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const userId = getCurrentUserId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { start, end } = req.query;

    const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 7));
    const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

    let tasks;
    if (tenantId && isStrictMode()) {
      tasks = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
    } else {
      tasks = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
    }
    
    const userTasks = tasks.filter(task => 
      task.assignees?.some(a => a.userId === userId)
    );

    const allUserTasks = await storage.getTasksByUser(userId);
    const personalTasks = allUserTasks
      .filter(t => t.isPersonal && t.dueDate)
      .filter(t => {
        const dueDate = new Date(t.dueDate!);
        return dueDate >= startDate && dueDate <= endDate;
      })
      .map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        projectId: t.projectId,
        isPersonal: true,
        assignees: [],
      }));

    let timeEntries;
    if (tenantId && isStrictMode()) {
      timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { 
        userId, 
        startDate, 
        endDate 
      });
    } else {
      const allUserEntries = await storage.getTimeEntriesByUser(userId, workspaceId);
      timeEntries = allUserEntries.filter(entry => {
        const entryDate = new Date(entry.startTime);
        return entryDate >= startDate && entryDate <= endDate;
      });
    }

    res.json({
      tasks: userTasks,
      personalTasks,
      timeEntries,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/my-calendar/events", req);
  }
});

// =============================================================================
// TIME TRACKING - REPORTING
// =============================================================================

// Get time tracking summary/report
router.get("/time-entries/report/summary", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const { startDate, endDate, groupBy } = req.query;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);

    let entries;
    if (tenantId && isStrictMode()) {
      entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
    } else {
      entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
      if (isSoftMode() && entries.some(e => !e.tenantId)) {
        addTenancyWarningHeader(res, "Report includes entries with legacy null tenantId");
      }
    }

    let totalSeconds = 0;
    let inScopeSeconds = 0;
    let outOfScopeSeconds = 0;

    const byClient: Record<string, { name: string; seconds: number }> = {};
    const byProject: Record<
      string,
      { name: string; clientName: string | null; seconds: number }
    > = {};
    const byUser: Record<string, { name: string; seconds: number }> = {};

    for (const entry of entries) {
      totalSeconds += entry.durationSeconds;
      if (entry.scope === "in_scope") {
        inScopeSeconds += entry.durationSeconds;
      } else {
        outOfScopeSeconds += entry.durationSeconds;
      }

      if (entry.clientId && entry.client) {
        if (!byClient[entry.clientId]) {
          byClient[entry.clientId] = {
            name: entry.client.displayName || entry.client.companyName,
            seconds: 0,
          };
        }
        byClient[entry.clientId].seconds += entry.durationSeconds;
      }

      if (entry.projectId && entry.project) {
        if (!byProject[entry.projectId]) {
          byProject[entry.projectId] = {
            name: entry.project.name,
            clientName:
              entry.client?.displayName || entry.client?.companyName || null,
            seconds: 0,
          };
        }
        byProject[entry.projectId].seconds += entry.durationSeconds;
      }

      if (entry.userId && entry.user) {
        if (!byUser[entry.userId]) {
          byUser[entry.userId] = {
            name: entry.user.name || entry.user.email,
            seconds: 0,
          };
        }
        byUser[entry.userId].seconds += entry.durationSeconds;
      }
    }

    res.json({
      totalSeconds,
      inScopeSeconds,
      outOfScopeSeconds,
      entryCount: entries.length,
      byClient: Object.entries(byClient).map(([id, data]) => ({
        id,
        ...data,
      })),
      byProject: Object.entries(byProject).map(([id, data]) => ({
        id,
        ...data,
      })),
      byUser: Object.entries(byUser).map(([id, data]) => ({ id, ...data })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/report/summary", req);
  }
});

// Export time entries as CSV
router.get("/time-entries/export/csv", async (req, res) => {
  try {
    const { startDate, endDate, clientId, projectId } = req.query;

    const filters: any = {};
    if (startDate) filters.startDate = new Date(startDate as string);
    if (endDate) filters.endDate = new Date(endDate as string);
    if (clientId) filters.clientId = clientId as string;
    if (projectId) filters.projectId = projectId as string;

    const entries = await storage.getTimeEntriesByWorkspace(
      getCurrentWorkspaceId(req),
      filters,
    );

    const headers = [
      "Date",
      "Start Time",
      "End Time",
      "Duration (hours)",
      "Client",
      "Project",
      "Task",
      "Description",
      "Scope",
      "User",
      "Entry Type",
    ];
    const rows = entries.map((entry) => {
      const duration = (entry.durationSeconds / 3600).toFixed(2);
      return [
        entry.startTime.toISOString().split("T")[0],
        entry.startTime.toISOString().split("T")[1].slice(0, 8),
        entry.endTime?.toISOString().split("T")[1].slice(0, 8) || "",
        duration,
        entry.client?.displayName || entry.client?.companyName || "",
        entry.project?.name || "",
        entry.task?.title || "",
        entry.description || "",
        entry.scope,
        entry.user?.name || entry.user?.email || "",
        entry.isManual ? "Manual" : "Timer",
      ];
    });

    const csv = [headers, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="time-entries-${new Date().toISOString().split("T")[0]}.csv"`,
    );
    res.send(csv);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/time-entries/export/csv", req);
  }
});

export default router;
