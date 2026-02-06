import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import type { Request } from "express";
import { handleRouteError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

const router = Router();

// Get notifications for current user
router.get("/notifications", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { unreadOnly, limit, offset } = req.query;
    
    const notifications = await storage.getNotificationsByUser(userId, tenantId, {
      unreadOnly: unreadOnly === "true",
      limit: limit ? parseInt(limit as string) : 50,
      offset: offset ? parseInt(offset as string) : 0,
    });
    
    res.json(notifications);
  } catch (error) {
    return handleRouteError(res, error, "GET /notifications", req);
  }
});

// Get unread notification count
router.get("/notifications/unread-count", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const count = await storage.getUnreadNotificationCount(userId, tenantId);
    res.json({ count });
  } catch (error) {
    return handleRouteError(res, error, "GET /notifications/unread-count", req);
  }
});

// Mark a notification as read
router.patch("/notifications/:id/read", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    
    const notification = await storage.markNotificationRead(id, userId, tenantId);
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }
    
    res.json(notification);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /notifications/:id/read", req);
  }
});

// Mark all notifications as read
router.post("/notifications/mark-all-read", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    await storage.markAllNotificationsRead(userId, tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /notifications/mark-all-read", req);
  }
});

// Delete a notification
router.delete("/notifications/:id", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    const { id } = req.params;
    
    await storage.deleteNotification(id, userId, tenantId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /notifications/:id", req);
  }
});

// Default notification preferences for when table doesn't exist or user has no preferences
function getDefaultPreferences(userId: string, tenantId: string | null) {
  return {
    id: "default",
    tenantId,
    userId,
    taskDeadline: true,
    taskAssigned: true,
    taskCompleted: true,
    commentAdded: true,
    commentMention: true,
    projectUpdate: true,
    projectMemberAdded: true,
    taskStatusChanged: true,
    emailEnabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// Get notification preferences
router.get("/notifications/preferences", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let prefs = await storage.getNotificationPreferences(userId);
    
    if (!prefs) {
      // Try to create preferences, fall back to defaults if table doesn't exist
      try {
        prefs = await storage.upsertNotificationPreferences(userId, {
          tenantId: tenantId || undefined,
        });
      } catch (error) {
        console.warn("[notifications] Could not create preferences, using defaults:", error);
        prefs = getDefaultPreferences(userId, tenantId);
      }
    }
    
    res.json(prefs);
  } catch (error) {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    res.json(getDefaultPreferences(userId, tenantId));
  }
});

// Update notification preferences
const updatePreferencesSchema = z.object({
  taskDeadline: z.boolean().optional(),
  taskAssigned: z.boolean().optional(),
  taskCompleted: z.boolean().optional(),
  commentAdded: z.boolean().optional(),
  commentMention: z.boolean().optional(),
  projectUpdate: z.boolean().optional(),
  projectMemberAdded: z.boolean().optional(),
  taskStatusChanged: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
});

router.patch("/notifications/preferences", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    const parsed = updatePreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid preferences", details: parsed.error.errors });
    }
    
    const prefs = await storage.upsertNotificationPreferences(userId, {
      ...parsed.data,
      tenantId: tenantId || undefined,
    });
    
    res.json(prefs);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /notifications/preferences", req);
  }
});

export default router;
