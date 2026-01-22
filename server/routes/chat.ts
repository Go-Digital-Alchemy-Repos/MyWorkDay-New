import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { insertChatChannelSchema, insertChatMessageSchema } from "@shared/schema";
import { getCurrentUserId } from "../middleware/authContext";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { asyncHandler } from "../middleware/asyncHandler";
import { validateBody } from "../middleware/validate";
import { AppError } from "../lib/errors";
import { emitToTenant, emitToChatChannel, emitToChatDm } from "../realtime/socket";
import { CHAT_EVENTS } from "@shared/events";

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
});

const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(10),
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

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: channel.id,
      dmThreadId: null,
      authorUserId: userId,
      body: req.body.body,
    });

    const message = await storage.createChatMessage(data);
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

    const data = insertChatMessageSchema.parse({
      tenantId,
      channelId: null,
      dmThreadId: thread.id,
      authorUserId: userId,
      body: req.body.body,
    });

    const message = await storage.createChatMessage(data);
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

export default router;
