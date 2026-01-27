import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import type { Request } from "express";

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
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error fetching unread count:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error marking notification read:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error marking all notifications read:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error deleting notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get notification preferences
router.get("/notifications/preferences", async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const tenantId = getEffectiveTenantId(req);
    
    let prefs = await storage.getNotificationPreferences(userId);
    
    if (!prefs) {
      prefs = await storage.upsertNotificationPreferences(userId, {
        tenantId: tenantId || undefined,
      });
    }
    
    res.json(prefs);
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    res.status(500).json({ error: "Internal server error" });
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
    console.error("Error updating notification preferences:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
