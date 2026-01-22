import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import crypto from "crypto";
import { storage } from "../storage";
import { insertChatChannelSchema, insertChatMessageSchema } from "@shared/schema";
import { getCurrentUserId } from "../middleware/authContext";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { AppError } from "../lib/errors";
import { emitToTenant, emitToChatChannel, emitToChatDm } from "../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";
import { getStorageProvider, createS3ClientFromConfig, StorageNotConfiguredError } from "../storage/getStorageProvider";
import { PutObjectCommand } from "@aws-sdk/client-s3";

function getCurrentTenantId(req: Request): string | null {
  return getEffectiveTenantId(req);
}

const router = Router();

const createChannelSchema = z.object({
  name: z.string().min(1).max(80),
  isPrivate: z.boolean().default(false),
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(10000),
  attachmentIds: z.array(z.string()).max(10).optional(),
});

const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(10),
});

// File upload configuration
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed`));
    }
  },
});

router.get(
  "/channels",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const allChannels = await storage.getChatChannelsByTenant(tenantId);
    const myMemberships = await storage.getUserChatChannels(tenantId, userId);
    const myChannelIds = new Set(myMemberships.map(m => m.channelId));
    
    // Return public channels + private channels user is a member of
    const visibleChannels = allChannels.filter(
      ch => !ch.isPrivate || myChannelIds.has(ch.id)
    );
    res.json(visibleChannels);
  })
);

router.get(
  "/channels/my",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const memberships = await storage.getUserChatChannels(tenantId, userId);
    res.json(memberships.map(m => m.channel));
  })
);

router.post(
  "/channels",
  validateBody(createChannelSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const data = insertChatChannelSchema.parse({
      tenantId,
      name: req.body.name,
      isPrivate: req.body.isPrivate,
      createdBy: userId,
    });

    const channel = await storage.createChatChannel(data);

    await storage.addChatChannelMember({
      tenantId,
      channelId: channel.id,
      userId,
      role: "owner",
    });

    emitToTenant(tenantId, CHAT_EVENTS.CHANNEL_CREATED, {
      channel: {
        id: channel.id,
        tenantId: channel.tenantId,
        name: channel.name,
        isPrivate: channel.isPrivate,
        createdBy: channel.createdBy,
        createdAt: channel.createdAt,
      },
    });

    res.status(201).json(channel);
  })
);

router.get(
  "/channels/:channelId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    res.json(channel);
  })
);

router.get(
  "/channels/:channelId/members",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const members = await storage.getChatChannelMembers(req.params.channelId);
    res.json(members);
  })
);

router.post(
  "/channels/:channelId/join",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    if (channel.isPrivate) {
      throw AppError.forbidden("Cannot join private channel without invitation");
    }

    const existingMember = await storage.getChatChannelMember(req.params.channelId, userId);
    if (existingMember) {
      return res.json({ message: "Already a member" });
    }

    await storage.addChatChannelMember({
      tenantId,
      channelId: channel.id,
      userId,
      role: "member",
    });

    const user = await storage.getUser(userId);
    emitToTenant(tenantId, CHAT_EVENTS.MEMBER_JOINED, {
      targetType: "channel",
      targetId: channel.id,
      userId,
      userName: user?.name || user?.email || "Unknown",
    });

    res.status(201).json({ message: "Joined channel" });
  })
);

router.delete(
  "/channels/:channelId/leave",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    await storage.removeChatChannelMember(req.params.channelId, userId);
    res.json({ message: "Left channel" });
  })
);

router.get(
  "/channels/:channelId/messages",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const messages = await storage.getChatMessages("channel", req.params.channelId, limit, before);
    res.json(messages);
  })
);

router.post(
  "/channels/:channelId/messages",
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const channel = await storage.getChatChannel(req.params.channelId);
    if (!channel || channel.tenantId !== tenantId) {
      throw AppError.notFound("Channel not found");
    }

    const member = await storage.getChatChannelMember(req.params.channelId, userId);
    if (!member && channel.isPrivate) {
      throw AppError.forbidden("Not a member of this private channel");
    }

    // Validate attachments belong to this tenant and are not yet linked
    const attachmentIds: string[] = req.body.attachmentIds || [];
    let attachments: any[] = [];
    if (attachmentIds.length > 0) {
      attachments = await storage.getChatAttachmentsByTenantAndIds(tenantId, attachmentIds);
      if (attachments.length !== attachmentIds.length) {
        throw AppError.badRequest("One or more attachments are invalid or belong to another tenant");
      }
      // Check none are already linked
      const alreadyLinked = attachments.filter(a => a.messageId !== null);
      if (alreadyLinked.length > 0) {
        throw AppError.badRequest("One or more attachments are already linked to a message");
      }
    }

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: channel.id,
      dmThreadId: null,
      authorUserId: userId,
      body: req.body.body,
    });

    const message = await storage.createChatMessage(data);

    // Link attachments to the message
    if (attachments.length > 0) {
      await storage.linkChatAttachmentsToMessage(message.id, attachmentIds);
      // Refresh attachments with updated messageId
      attachments = await storage.getChatAttachmentsByMessageId(message.id);
    }

    const author = await storage.getUser(userId);

    const payload = {
      targetType: "channel" as const,
      targetId: channel.id,
      message: {
        id: message.id,
        tenantId: message.tenantId,
        channelId: message.channelId,
        dmThreadId: message.dmThreadId,
        authorUserId: message.authorUserId,
        body: message.body,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        attachments: attachments.map(a => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: a.url,
        })),
        author: author ? {
          id: author.id,
          name: author.name,
          email: author.email,
          avatarUrl: author.avatarUrl,
        } : undefined,
      },
    };

    // Emit to the specific channel room for privacy
    emitToChatChannel(channel.id, CHAT_EVENTS.NEW_MESSAGE, payload);

    res.status(201).json({ ...message, author });
  })
);

router.get(
  "/dm",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    res.json(threads);
  })
);

router.post(
  "/dm",
  validateBody(createDmSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const memberUserIds = Array.from(new Set([userId, ...req.body.userIds]));

    const existingThread = await storage.getChatDmThreadByMembers(tenantId, memberUserIds);
    if (existingThread) {
      return res.json(existingThread);
    }

    const thread = await storage.createChatDmThread({ tenantId }, memberUserIds);
    res.status(201).json(thread);
  })
);

router.get(
  "/dm/:dmId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    res.json(thread);
  })
);

router.get(
  "/dm/:dmId/messages",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const before = req.query.before ? new Date(req.query.before as string) : undefined;

    const messages = await storage.getChatMessages("dm", req.params.dmId, limit, before);
    res.json(messages);
  })
);

router.post(
  "/dm/:dmId/messages",
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const thread = await storage.getChatDmThread(req.params.dmId);
    if (!thread || thread.tenantId !== tenantId) {
      throw AppError.notFound("DM thread not found");
    }

    const threads = await storage.getUserChatDmThreads(tenantId, userId);
    const isMember = threads.some(t => t.id === thread.id);
    if (!isMember) {
      throw AppError.forbidden("Not a member of this DM thread");
    }

    // Validate attachments belong to this tenant and are not yet linked
    const attachmentIds: string[] = req.body.attachmentIds || [];
    let attachments: any[] = [];
    if (attachmentIds.length > 0) {
      attachments = await storage.getChatAttachmentsByTenantAndIds(tenantId, attachmentIds);
      if (attachments.length !== attachmentIds.length) {
        throw AppError.badRequest("One or more attachments are invalid or belong to another tenant");
      }
      const alreadyLinked = attachments.filter(a => a.messageId !== null);
      if (alreadyLinked.length > 0) {
        throw AppError.badRequest("One or more attachments are already linked to a message");
      }
    }

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: null,
      dmThreadId: thread.id,
      authorUserId: userId,
      body: req.body.body,
    });

    const message = await storage.createChatMessage(data);

    // Link attachments to the message
    if (attachments.length > 0) {
      await storage.linkChatAttachmentsToMessage(message.id, attachmentIds);
      attachments = await storage.getChatAttachmentsByMessageId(message.id);
    }

    const author = await storage.getUser(userId);

    const payload = {
      targetType: "dm" as const,
      targetId: thread.id,
      message: {
        id: message.id,
        tenantId: message.tenantId,
        channelId: message.channelId,
        dmThreadId: message.dmThreadId,
        authorUserId: message.authorUserId,
        body: message.body,
        createdAt: message.createdAt,
        editedAt: message.editedAt,
        attachments: attachments.map(a => ({
          id: a.id,
          fileName: a.fileName,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
          url: a.url,
        })),
        author: author ? {
          id: author.id,
          name: author.name,
          email: author.email,
          avatarUrl: author.avatarUrl,
        } : undefined,
      },
    };

    // Emit to the specific DM room for privacy
    emitToChatDm(thread.id, CHAT_EVENTS.NEW_MESSAGE, payload);

    res.status(201).json({ ...message, author });
  })
);

router.patch(
  "/messages/:messageId",
  validateBody(sendMessageSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only edit your own messages");
    }

    const updated = await storage.updateChatMessage(req.params.messageId, {
      body: req.body.body,
    });

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const updatePayload = {
      targetType,
      targetId,
      messageId: message.id,
      updates: { body: req.body.body, editedAt: updated?.editedAt },
    };
    
    // Emit to the specific room for privacy
    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_UPDATED, updatePayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_UPDATED, updatePayload);
    }

    res.json(updated);
  })
);

router.delete(
  "/messages/:messageId",
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const message = await storage.getChatMessage(req.params.messageId);
    if (!message || message.tenantId !== tenantId) {
      throw AppError.notFound("Message not found");
    }

    if (message.authorUserId !== userId) {
      throw AppError.forbidden("Can only delete your own messages");
    }

    await storage.deleteChatMessage(req.params.messageId);

    const targetType = message.channelId ? "channel" : "dm";
    const targetId = message.channelId || message.dmThreadId!;

    const deletePayload = {
      targetType,
      targetId,
      messageId: message.id,
    };
    
    // Emit to the specific room for privacy
    if (message.channelId) {
      emitToChatChannel(message.channelId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    } else if (message.dmThreadId) {
      emitToChatDm(message.dmThreadId, CHAT_EVENTS.MESSAGE_DELETED, deletePayload);
    }

    res.json({ message: "Message deleted" });
  })
);

// File Upload Endpoint
router.post(
  "/uploads",
  upload.single("file"),
  asyncHandler(async (req: Request, res: Response) => {
    const tenantId = getCurrentTenantId(req);
    const userId = getCurrentUserId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    if (!req.file) throw AppError.badRequest("No file provided");

    // Get storage provider with tenant fallback
    let storageProvider;
    try {
      storageProvider = await getStorageProvider(tenantId);
    } catch (err) {
      if (err instanceof StorageNotConfiguredError) {
        throw AppError.badRequest("File storage is not configured for this tenant");
      }
      throw err;
    }

    const { config, source } = storageProvider;
    const s3Client = createS3ClientFromConfig(config);

    // Generate unique S3 key with tenant isolation
    const fileId = crypto.randomUUID();
    const ext = req.file.originalname.split(".").pop() || "";
    const safeFileName = `${fileId}${ext ? `.${ext}` : ""}`;
    
    // Build S3 key with tenant prefix for isolation
    let keyPrefix = config.keyPrefixTemplate || "chat-attachments";
    keyPrefix = keyPrefix.replace("{{tenantId}}", tenantId);
    const s3Key = `${keyPrefix}/${tenantId}/${safeFileName}`;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucketName,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        "tenant-id": tenantId,
        "uploaded-by": userId,
        "original-name": encodeURIComponent(req.file.originalname),
      },
    }));

    // Construct URL (for public buckets or presigned URLs)
    const url = `https://${config.bucketName}.s3.${config.region}.amazonaws.com/${s3Key}`;

    // Save attachment metadata to DB (not linked to a message yet)
    const attachment = await storage.createChatAttachment({
      tenantId,
      messageId: null, // Will be linked when message is sent
      s3Key,
      url,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });

    res.status(201).json({
      id: attachment.id,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      url: attachment.url,
      storageSource: source,
    });
  })
);

export default router;
