/**
 * Main API Routes
 * 
 * Purpose: Core API endpoints for the project management application.
 * 
 * Organization:
 * - This file contains ~3,700 lines of route handlers
 * - Additional routes are split into: /routes/index.ts (super admin, onboarding, etc.)
 * - Webhook routes in: /routes/webhooks.ts
 * 
 * Key Patterns:
 * - All tenant-scoped endpoints use getEffectiveTenantId() for isolation
 * - Tenancy validation uses validateTenantOwnership() in soft/strict modes
 * - File uploads use presigned S3 URLs via /api/attachments/* endpoints
 * 
 * Sharp Edges:
 * - Large file - consider splitting by domain when refactoring
 * - Some legacy endpoints may not enforce strict tenancy (see KNOWN_ISSUES.md)
 * - Task operations emit Socket.IO events for real-time updates
 * 
 * @see docs/ENDPOINTS.md for complete API documentation
 * @see docs/KNOWN_ISSUES.md for refactoring notes
 */
import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { z } from "zod";
import { captureError } from "./middleware/errorLogging";
import { AppError, handleRouteError, sendError, validateBody } from "./lib/errors";
import subRoutes from "./routes/index";
import webhookRoutes from "./routes/webhooks";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson } from "./utils/mentionUtils";
import {
  insertTaskSchema,
  insertSectionSchema,
  insertSubtaskSchema,
  insertCommentSchema,
  insertTagSchema,
  insertProjectSchema,
  insertWorkspaceSchema,
  insertTeamSchema,
  insertWorkspaceMemberSchema,
  insertTeamMemberSchema,
  insertActivityLogSchema,
  insertTimeEntrySchema,
  insertActiveTimerSchema,
  TimeEntry,
  ActiveTimer,
  workspaces,
  users,
  updateWorkspaceSchema,
  updateTeamSchema,
  updateProjectSchema,
  updateSectionSchema,
  updateTaskSchema,
  updateSubtaskSchema,
  updateTagSchema,
  updateCommentSchema,
  updatePersonalTaskSectionSchema,
  moveTaskSchema,
  moveSubtaskSchema,
  reorderTasksSchema,
  addAssigneeSchema,
  addTagToTaskSchema,
  movePersonalTaskSchema,
  addProjectMemberSchema,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, count, inArray, isNull } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getEffectiveTenantId, requireTenantContext } from "./middleware/tenantContext";
import { 
  getTenancyEnforcementMode, 
  isStrictMode, 
  isSoftMode, 
  addTenancyWarningHeader,
  logTenancyWarning,
  validateTenantOwnership,
  handleTenancyViolation
} from "./middleware/tenancyEnforcement";
import { UserRole } from "@shared/schema";
import { 
  getCurrentUserId, 
  getCurrentWorkspaceId, 
  getCurrentWorkspaceIdAsync, 
  isSuperUser 
} from "./routes/helpers";

// [EXTRACTED] getProjectUpdateDescription helper moved to server/routes/projects.router.ts
import {
  isS3Configured,
  validateFile,
  generateStorageKey,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  checkObjectExists,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "./s3";
import { getStorageStatus } from "./storage/getStorageProvider";
// Import centralized event emitters for real-time updates
import {
  emitProjectCreated,
  emitProjectUpdated,
  emitSectionCreated,
  emitSectionUpdated,
  emitSectionDeleted,
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskMoved,
  emitTaskReordered,
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
  emitAttachmentAdded,
  emitAttachmentDeleted,
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
  emitTimeEntryUpdated,
  emitTimeEntryDeleted,
  emitMyTaskCreated,
  emitMyTaskUpdated,
  emitMyTaskDeleted,
} from "./realtime/events";

import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskStatusChanged,
  notifyCommentAdded,
  notifyCommentMention,
  notifyProjectMemberAdded,
  notifyProjectUpdate,
  startDeadlineChecker,
} from "./features/notifications/notification.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Protect all /api routes except /api/auth/*, /api/v1/auth/*, /api/v1/super/bootstrap, /api/health, and /api/v1/webhooks/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path.startsWith("/v1/auth/") || 
        req.path === "/v1/super/bootstrap" || 
        req.path === "/health" ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireAuth(req, res, next);
  });
  
  // Enforce tenant context for all API routes except /api/auth/*, /api/health, /api/v1/super/*, /api/v1/tenant/*, and /api/v1/webhooks/*
  // SuperUsers can access without tenant context; regular users must have tenantId
  // Tenant onboarding routes (/api/v1/tenant/*) are exempt from strict tenant context enforcement
  // as they need to work during onboarding when tenant context is being set up
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path === "/health" || 
        req.path.startsWith("/v1/super/") ||
        req.path.startsWith("/v1/tenant/") ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireTenantContext(req, res, next);
  });

  const DEMO_USER_ID = "demo-user-id";
  const DEMO_WORKSPACE_ID = "demo-workspace-id";

  // Mount sub-routes (timer, super admin, etc.)
  app.use("/api", subRoutes);
  
  // Mount webhook routes (bypasses auth, uses signature verification)
  app.use("/api/v1/webhooks", webhookRoutes);

  // [EXTRACTED] Search endpoint moved to server/routes/modules/search/search.router.ts

  app.get("/api/workspaces/current", async (req, res) => {
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

  app.get("/api/workspaces/:id", async (req, res) => {
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

  app.post("/api/workspaces", async (req, res) => {
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

  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.workspaceId);
      res.json(members);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/workspaces/:workspaceId/members", req);
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
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

  app.patch("/api/workspaces/:id", async (req, res) => {
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

  app.get("/api/workspaces", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const workspaces = await storage.getWorkspacesByUser(userId);
      res.json(workspaces);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/workspaces", req);
    }
  });

  app.get("/api/workspace-members", async (req, res) => {
    try {
      const workspaceId = getCurrentWorkspaceId(req);
      const members = await storage.getWorkspaceMembers(workspaceId);
      res.json(members);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/workspace-members", req);
    }
  });

  // [EXTRACTED] Project routes moved to server/routes/projects.router.ts
  // [EXTRACTED] PATCH /api/projects/:projectId/client moved to server/routes/clients.router.ts

  app.get("/api/teams", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = await getCurrentWorkspaceIdAsync(req);
      
      if (tenantId) {
        const teams = await storage.getTeamsByTenant(tenantId, workspaceId);
        return res.json(teams);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const teams = await storage.getTeamsByWorkspace(workspaceId);
        return res.json(teams);
      }
      
      return sendError(res, AppError.internal("User tenant not configured"), req);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/teams", req);
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const team = await storage.getTeamByIdAndTenant(req.params.id, tenantId);
        if (!team) {
          return sendError(res, AppError.notFound("Team"), req);
        }
        return res.json(team);
      }
      
      // Only superusers can use legacy non-scoped methods
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

  app.post("/api/teams", async (req, res) => {
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
        // Only superusers can use legacy non-scoped methods
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

  app.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(req.params.teamId);
      res.json(members);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/teams/:teamId/members", req);
    }
  });

  app.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Validate team belongs to tenant
      if (tenantId) {
        const team = await storage.getTeamByIdAndTenant(req.params.teamId, tenantId);
        if (!team) {
          return sendError(res, AppError.notFound("Team"), req);
        }
        
        // Validate user belongs to same tenant
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

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const data = validateBody(req.body, updateTeamSchema, res);
      if (!data) return;
      
      const tenantId = getEffectiveTenantId(req);
      
      let team;
      if (tenantId) {
        team = await storage.updateTeamWithTenant(req.params.id, tenantId, data);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
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

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const deleted = await storage.deleteTeamWithTenant(req.params.id, tenantId);
        if (!deleted) {
          return sendError(res, AppError.notFound("Team"), req);
        }
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        await storage.deleteTeam(req.params.id);
      } else {
        return sendError(res, AppError.internal("User tenant not configured"), req);
      }
      
      res.json({ success: true });
    } catch (error) {
      return handleRouteError(res, error, "DELETE /api/teams/:id", req);
    }
  });

  app.delete("/api/teams/:teamId/members/:userId", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Validate team belongs to tenant
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

  // [EXTRACTED] Section and project section routes moved to server/routes/projects.router.ts

  // [EXTRACTED] Task routes moved to server/routes/tasks.router.ts

  app.get("/api/workspaces/:workspaceId/tags", async (req, res) => {
    try {
      const tags = await storage.getTagsByWorkspace(req.params.workspaceId);
      res.json(tags);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/workspaces/:workspaceId/tags", req);
    }
  });

  app.post("/api/workspaces/:workspaceId/tags", async (req, res) => {
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

  app.patch("/api/tags/:id", async (req, res) => {
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

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.status(204).send();
    } catch (error) {
      return handleRouteError(res, error, "DELETE /api/tags/:id", req);
    }
  });

  app.post("/api/tasks/:taskId/tags", async (req, res) => {
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

  app.delete("/api/tasks/:taskId/tags/:tagId", async (req, res) => {
    try {
      await storage.removeTaskTag(req.params.taskId, req.params.tagId);
      res.status(204).send();
    } catch (error) {
      return handleRouteError(res, error, "DELETE /api/tasks/:taskId/tags/:tagId", req);
    }
  });

  app.get("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByTask(req.params.taskId);
      res.json(comments);
    } catch (error) {
      return handleRouteError(res, error, "GET /api/tasks/:taskId/comments", req);
    }
  });

  app.post("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const data = insertCommentSchema.parse({
        ...req.body,
        taskId: req.params.taskId,
        userId: currentUserId,
      });
      const comment = await storage.createComment(data);

      // Parse @mentions from TipTap JSON content and create notifications
      const mentionedUserIds = extractMentionsFromTipTapJson(data.body);
      const plainTextBody = getPlainTextFromTipTapJson(data.body);

      // Get task and project info for the notification
      const task = await storage.getTask(req.params.taskId);
      const commenter = await storage.getUser(currentUserId);
      const tenantId = task?.tenantId || null;

      for (const mentionedUserId of mentionedUserIds) {
        // Validate mentioned user exists and is in the same tenant
        const mentionedUser = await storage.getUser(mentionedUserId);
        if (!mentionedUser || (tenantId && mentionedUser.tenantId !== tenantId)) {
          continue; // Skip if user doesn't exist or is in different tenant
        }

        // Create mention record
        await storage.createCommentMention({
          commentId: comment.id,
          mentionedUserId: mentionedUserId,
        });

        // Send in-app notification for mention (fire and forget)
        notifyCommentMention(
          mentionedUserId,
          req.params.taskId,
          task?.title || "a task",
          commenter?.name || commenter?.email || "Someone",
          plainTextBody,
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});

        // Send notification email if user has email
        if (mentionedUser.email && tenantId) {
          try {
            const { emailOutboxService } = await import("./services/emailOutbox");
            await emailOutboxService.sendEmail({
              tenantId,
              messageType: "mention_notification",
              toEmail: mentionedUser.email,
              subject: `${commenter?.name || 'Someone'} mentioned you in a comment`,
              textBody: `${commenter?.name || 'Someone'} mentioned you in a comment on task "${task?.title || 'a task'}":\n\n"${plainTextBody}"`,
              metadata: {
                taskId: task?.id,
                taskTitle: task?.title,
                commentId: comment.id,
                mentionedByUserId: currentUserId,
                mentionedByName: commenter?.name,
              },
            });
          } catch (emailError) {
            console.error("Error sending mention notification:", emailError);
          }
        }
      }

      // Also notify task assignees about the new comment (except the commenter and mentioned users)
      if (task) {
        const taskWithRelations = await storage.getTaskWithRelations(req.params.taskId);
        const assignees = (taskWithRelations as any)?.assignees || [];
        const mentionedUserIdSet = new Set(mentionedUserIds);
        
        for (const assignee of assignees) {
          if (assignee.id !== currentUserId && !mentionedUserIdSet.has(assignee.id)) {
            notifyCommentAdded(
              assignee.id,
              req.params.taskId,
              task.title,
              commenter?.name || commenter?.email || "Someone",
              plainTextBody,
              { tenantId, excludeUserId: currentUserId }
            ).catch(() => {});
          }
        }
      }

      // Return comment with user relation for immediate UI display
      const commentWithUser = {
        ...comment,
        user: commenter ? {
          id: commenter.id,
          name: commenter.name,
          email: commenter.email,
          avatarUrl: commenter.avatarUrl,
        } : undefined,
      };

      res.status(201).json(commentWithUser);
    } catch (error) {
      return handleRouteError(res, error, "POST /api/tasks/:taskId/comments", req);
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      const data = validateBody(req.body, updateCommentSchema, res);
      if (!data) return;
      
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return sendError(res, AppError.notFound("Comment"), req);
      }
      
      // Permission check: only the comment owner can edit
      if (existingComment.userId !== currentUserId) {
        return sendError(res, AppError.forbidden("You can only edit your own comments"), req);
      }

      // Only allow updating the body
      const comment = await storage.updateComment(req.params.id, { body: data.content });
      res.json(comment);
    } catch (error) {
      return handleRouteError(res, error, "PATCH /api/comments/:id", req);
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      // Permission check: only the comment owner can delete
      if (existingComment.userId !== currentUserId) {
        return res.status(403).json({ error: "You can only delete your own comments" });
      }

      await storage.deleteComment(req.params.id);
      res.status(204).send();
    } catch (error) {
      return handleRouteError(res, error, "DELETE /api/comments/:id", req);
    }
  });

  // Resolve/unresolve comment endpoints
  app.post("/api/comments/:id/resolve", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const comment = await storage.resolveComment(req.params.id, currentUserId);
      res.json(comment);
    } catch (error) {
      return handleRouteError(res, error, "POST /api/comments/:id/resolve", req);
    }
  });

  app.post("/api/comments/:id/unresolve", async (req, res) => {
    try {
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const comment = await storage.unresolveComment(req.params.id);
      res.json(comment);
    } catch (error) {
      return handleRouteError(res, error, "POST /api/comments/:id/unresolve", req);
    }
  });

  app.post("/api/activity-log", async (req, res) => {
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

  app.get("/api/activity-log/:entityType/:entityId", async (req, res) => {
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

  // =====================
  // Task Attachments API
  // =====================

  const presignRequestSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().positive().max(MAX_FILE_SIZE_BYTES),
  });

  app.get("/api/attachments/config", async (req, res) => {
    try {
      // Use hierarchical storage resolution: tenant R2 > tenant S3 > system R2 > system S3 > env vars
      // Note: This endpoint requires authentication via global /api middleware since it needs
      // tenant context for proper hierarchical resolution. This is intentional because the
      // AttachmentUploader component only appears in authenticated contexts (task-detail-drawer).
      const user = req.user as any;
      const tenantId = user?.tenantId || req.tenant?.effectiveTenantId || null;
      
      const storageStatus = await getStorageStatus(tenantId);
      
      res.json({
        configured: storageStatus.configured,
        source: storageStatus.source,
        provider: storageStatus.provider,
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });
    } catch (error) {
      return handleRouteError(res, error, "GET /api/attachments/config", req);
    }
  });

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const attachments = await storage.getTaskAttachmentsByTask(taskId);
        res.json(attachments);
      } catch (error) {
        return handleRouteError(res, error, "GET /api/projects/:projectId/tasks/:taskId/attachments", req);
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/presign",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        if (!isS3Configured()) {
          return res.status(503).json({
            error:
              "File storage is not configured. Please set AWS environment variables.",
          });
        }

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const data = presignRequestSchema.parse(req.body);

        const validation = validateFile(data.mimeType, data.fileSizeBytes);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        const tempId = crypto.randomUUID();
        const storageKey = generateStorageKey(
          projectId,
          taskId,
          tempId,
          data.fileName,
        );

        const attachment = await storage.createTaskAttachment({
          taskId,
          projectId,
          uploadedByUserId: getCurrentUserId(req),
          originalFileName: data.fileName,
          mimeType: data.mimeType,
          fileSizeBytes: data.fileSizeBytes,
          storageKey,
          uploadStatus: "pending",
        });

        const upload = await createPresignedUploadUrl(
          storageKey,
          data.mimeType,
        );

        res.status(201).json({
          attachment: {
            id: attachment.id,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSizeBytes,
            uploadStatus: attachment.uploadStatus,
            createdAt: attachment.createdAt,
          },
          upload,
        });
      } catch (error) {
        return handleRouteError(res, error, "POST /api/projects/:projectId/tasks/:taskId/attachments/presign", req);
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus === "complete") {
          return res.json(attachment);
        }

        const exists = await checkObjectExists(attachment.storageKey);
        if (!exists) {
          await storage.deleteTaskAttachment(attachmentId);
          return res
            .status(400)
            .json({ error: "Upload was not completed. Please try again." });
        }

        const updated = await storage.updateTaskAttachment(attachmentId, {
          uploadStatus: "complete",
        });

        // Emit real-time event after successful upload completion
        emitAttachmentAdded(
          {
            id: updated!.id,
            fileName: updated!.originalFileName,
            fileType: updated!.mimeType,
            fileSize: updated!.fileSizeBytes,
            storageKey: updated!.storageKey,
            taskId: updated!.taskId,
            subtaskId: null,
            uploadedBy: updated!.uploadedByUserId,
            createdAt: updated!.createdAt!,
          },
          taskId,
          null,
          projectId,
        );

        res.json(updated);
      } catch (error) {
        return handleRouteError(res, error, "POST /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete", req);
      }
    },
  );

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus !== "complete") {
          return res
            .status(400)
            .json({ error: "Attachment upload is not complete" });
        }

        const url = await createPresignedDownloadUrl(attachment.storageKey);
        res.json({ url });
      } catch (error) {
        return handleRouteError(res, error, "GET /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download", req);
      }
    },
  );

  app.delete(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        try {
          await deleteS3Object(attachment.storageKey);
        } catch (s3Error) {
          console.warn("Failed to delete S3 object:", s3Error);
        }

        await storage.deleteTaskAttachment(attachmentId);

        // Emit real-time event after successful deletion
        emitAttachmentDeleted(attachmentId, taskId, null, projectId);

        res.status(204).send();
      } catch (error) {
        return handleRouteError(res, error, "DELETE /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId", req);
      }
    },
  );

  // [EXTRACTED] Client routes moved to server/routes/clients.router.ts
  // Includes: GET/POST /api/clients, GET/PATCH/DELETE /api/clients/:id
  // GET/POST /api/clients/:clientId/contacts, PATCH/DELETE /api/clients/:clientId/contacts/:contactId
  // GET/POST /api/clients/:clientId/invites, DELETE /api/clients/:clientId/invites/:inviteId
  // GET/POST /api/clients/:clientId/projects
  // GET/POST /api/v1/clients/:clientId/divisions, PATCH /api/v1/divisions/:divisionId
  // GET/POST /api/v1/divisions/:divisionId/members, DELETE /api/v1/divisions/:divisionId/members/:userId
  // GET/POST /api/clients/:clientId/notes, PUT/DELETE /api/clients/:clientId/notes/:noteId
  // GET /api/clients/:clientId/notes/:noteId/versions
  // GET/POST /api/clients/:clientId/note-categories

  // NOTE: The following section has been removed and placed in the clients router.
  // If you need to modify client routes, see server/routes/clients.router.ts



  // [EXTRACTED] Timer/time-tracking routes moved to server/routes/timeTracking.router.ts
  // Includes: GET/PATCH/DELETE /api/timer/current, POST /api/timer/start|pause|resume|stop
  // GET/POST /api/time-entries, GET /api/time-entries/my, GET /api/time-entries/my/stats
  // GET/PATCH/DELETE /api/time-entries/:id, GET /api/calendar/events, GET /api/my-calendar/events
  // GET /api/time-entries/report/summary

  // [EXTRACTED] User management routes moved to server/routes/users.router.ts
  // Includes: GET/POST /api/users, GET /api/tenant/users, PATCH /api/users/me,
  // POST /api/users/me/change-password, GET/PATCH /api/users/me/ui-preferences,
  // PATCH /api/users/:id, POST /api/users/:id/reset-password|activate|deactivate,
  // GET/POST /api/invitations, DELETE /api/invitations/:id, POST /api/invitations/for-user,
  // GET/PUT /api/settings/mailgun, POST /api/settings/mailgun/test,
  // POST/DELETE /api/v1/me/avatar, GET /api/v1/me/agreement/status, POST /api/v1/me/agreement/accept



  // Start the deadline notification checker (runs periodically)
  startDeadlineChecker();

  return httpServer;
}
