import { Router } from "express";
import { storage } from "../storage";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getCurrentUserId } from "./helpers";
import { extractMentionsFromTipTapJson, getPlainTextFromTipTapJson } from "../utils/mentionUtils";
import { insertCommentSchema, updateCommentSchema } from "@shared/schema";
import {
  notifyCommentAdded,
  notifyCommentMention,
} from "../features/notifications/notification.service";

const router = Router();

router.get("/tasks/:taskId/comments", async (req, res) => {
  try {
    const comments = await storage.getCommentsByTask(req.params.taskId);
    res.json(comments);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tasks/:taskId/comments", req);
  }
});

router.post("/tasks/:taskId/comments", async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const data = insertCommentSchema.parse({
      ...req.body,
      taskId: req.params.taskId,
      userId: currentUserId,
    });
    const comment = await storage.createComment(data);

    const mentionedUserIds = extractMentionsFromTipTapJson(data.body);
    const plainTextBody = getPlainTextFromTipTapJson(data.body);

    const task = await storage.getTask(req.params.taskId);
    const commenter = await storage.getUser(currentUserId);
    const tenantId = task?.tenantId || null;

    for (const mentionedUserId of mentionedUserIds) {
      const mentionedUser = await storage.getUser(mentionedUserId);
      if (!mentionedUser || (tenantId && mentionedUser.tenantId !== tenantId)) {
        continue;
      }

      await storage.createCommentMention({
        commentId: comment.id,
        mentionedUserId: mentionedUserId,
      });

      notifyCommentMention(
        mentionedUserId,
        req.params.taskId,
        task?.title || "a task",
        commenter?.name || commenter?.email || "Someone",
        plainTextBody,
        { tenantId, excludeUserId: currentUserId }
      ).catch(() => {});

      if (mentionedUser.email && tenantId) {
        try {
          const { emailOutboxService } = await import("../services/emailOutbox");
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

router.patch("/comments/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateCommentSchema, res);
    if (!data) return;
    
    const currentUserId = getCurrentUserId(req);
    const existingComment = await storage.getComment(req.params.id);
    if (!existingComment) {
      return sendError(res, AppError.notFound("Comment"), req);
    }
    
    if (existingComment.userId !== currentUserId) {
      return sendError(res, AppError.forbidden("You can only edit your own comments"), req);
    }

    const comment = await storage.updateComment(req.params.id, { body: data.content });
    res.json(comment);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/comments/:id", req);
  }
});

router.delete("/comments/:id", async (req, res) => {
  try {
    const currentUserId = getCurrentUserId(req);
    const existingComment = await storage.getComment(req.params.id);
    if (!existingComment) {
      return res.status(404).json({ error: "Comment not found" });
    }
    
    if (existingComment.userId !== currentUserId) {
      return res.status(403).json({ error: "You can only delete your own comments" });
    }

    await storage.deleteComment(req.params.id);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/comments/:id", req);
  }
});

router.post("/comments/:id/resolve", async (req, res) => {
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

router.post("/comments/:id/unresolve", async (req, res) => {
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

export default router;
