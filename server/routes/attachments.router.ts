import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { storage } from "../storage";
import { handleRouteError } from "../lib/errors";
import { config } from "../config";
import { getCurrentUserId } from "./helpers";
import {
  isS3Configured,
  validateFile,
  generateStorageKey,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  checkObjectExists,
  MAX_FILE_SIZE_BYTES,
  ALLOWED_MIME_TYPES,
} from "../s3";
import { getStorageStatus } from "../storage/getStorageProvider";
import {
  emitAttachmentAdded,
  emitAttachmentDeleted,
} from "../realtime/events";

const router = Router();

const presignRequestSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSizeBytes: z.number().positive().max(MAX_FILE_SIZE_BYTES),
});

router.get("/attachments/config", async (req, res) => {
  try {
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

router.get("/crm/flags", async (_req, res) => {
  try {
    res.json({
      client360: config.crm.client360Enabled,
      contacts: config.crm.contactsEnabled,
      timeline: config.crm.timelineEnabled,
      portal: config.crm.portalEnabled,
      files: config.crm.filesEnabled,
      approvals: config.crm.approvalsEnabled,
      clientMessaging: config.crm.clientMessagingEnabled,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/flags", _req);
  }
});

router.get(
  "/projects/:projectId/tasks/:taskId/attachments",
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

router.post(
  "/projects/:projectId/tasks/:taskId/attachments/presign",
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

router.post(
  "/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete",
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

router.get(
  "/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download",
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

router.delete(
  "/projects/:projectId/tasks/:taskId/attachments/:attachmentId",
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

      emitAttachmentDeleted(attachmentId, taskId, null, projectId);

      res.status(204).send();
    } catch (error) {
      return handleRouteError(res, error, "DELETE /api/projects/:projectId/tasks/:taskId/attachments/:attachmentId", req);
    }
  },
);

export default router;
