/**
 * Super Admin Chat Monitoring Routes
 * 
 * Purpose: Read-only access to any tenant's chat history for super admins.
 * 
 * Security:
 * - ALL routes require super_user role via requireSuperUser middleware
 * - Read-only access only - no editing, deleting, or sending messages
 * 
 * Endpoints:
 * - GET /api/v1/super/chat/tenants/:tenantId/threads - List channels and DM threads
 * - GET /api/v1/super/chat/tenants/:tenantId/channels/:channelId/messages - Channel messages
 * - GET /api/v1/super/chat/tenants/:tenantId/dms/:dmId/messages - DM thread messages
 * - GET /api/v1/super/chat/search - Search messages with filters
 */
import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { db } from "../db";
import { 
  chatChannels, chatDmThreads, chatDmMembers, chatMessages, chatAttachments, users,
  tenants
} from "@shared/schema";
import { eq, and, ilike, gte, lte, desc, sql, inArray, or } from "drizzle-orm";
import { z } from "zod";

const router = Router();

router.use(requireSuperUser);

/**
 * GET /api/v1/super/chat/tenants/:tenantId/threads
 * Returns all channels and DM threads for a tenant
 */
router.get("/tenants/:tenantId/threads", async (req, res, next) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const channels = await db.select({
      id: chatChannels.id,
      name: chatChannels.name,
      isPrivate: chatChannels.isPrivate,
      createdAt: chatChannels.createdAt,
      createdBy: chatChannels.createdBy,
    })
    .from(chatChannels)
    .where(eq(chatChannels.tenantId, tenantId))
    .orderBy(desc(chatChannels.createdAt));

    const dmThreads = await db.select({
      id: chatDmThreads.id,
      createdAt: chatDmThreads.createdAt,
    })
    .from(chatDmThreads)
    .where(eq(chatDmThreads.tenantId, tenantId))
    .orderBy(desc(chatDmThreads.createdAt));

    const dmThreadsWithMembers = await Promise.all(
      dmThreads.map(async (thread) => {
        const members = await db.select({
          id: chatDmMembers.id,
          userId: chatDmMembers.userId,
          userName: users.name,
          userEmail: users.email,
        })
        .from(chatDmMembers)
        .innerJoin(users, eq(chatDmMembers.userId, users.id))
        .where(eq(chatDmMembers.dmThreadId, thread.id));
        
        return {
          ...thread,
          members,
          displayName: members.map(m => m.userName || m.userEmail).join(", "),
        };
      })
    );

    res.json({
      channels,
      dmThreads: dmThreadsWithMembers,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/super/chat/tenants/:tenantId/channels/:channelId/messages
 * Returns messages for a specific channel
 */
router.get("/tenants/:tenantId/channels/:channelId/messages", async (req, res, next) => {
  try {
    const { tenantId, channelId } = req.params;
    const { limit = "100", before } = req.query;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [channel] = await db.select()
      .from(chatChannels)
      .where(and(
        eq(chatChannels.id, channelId),
        eq(chatChannels.tenantId, tenantId)
      ));

    if (!channel) {
      return res.status(404).json({ error: "Channel not found in this tenant" });
    }

    let query = db.select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      authorUserId: chatMessages.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.authorUserId, users.id))
    .where(and(
      eq(chatMessages.channelId, channelId),
      before ? lte(chatMessages.createdAt, new Date(before as string)) : sql`true`
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(parseInt(limit as string, 10));

    const messages = await query;

    const messagesWithAttachments = await Promise.all(
      messages.map(async (msg) => {
        const attachments = await db.select()
          .from(chatAttachments)
          .where(eq(chatAttachments.messageId, msg.id));
        return {
          ...msg,
          attachments,
        };
      })
    );

    res.json({
      channel: {
        id: channel.id,
        name: channel.name,
        isPrivate: channel.isPrivate,
      },
      messages: messagesWithAttachments.reverse(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/super/chat/tenants/:tenantId/dms/:dmId/messages
 * Returns messages for a specific DM thread
 */
router.get("/tenants/:tenantId/dms/:dmId/messages", async (req, res, next) => {
  try {
    const { tenantId, dmId } = req.params;
    const { limit = "100", before } = req.query;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [dmThread] = await db.select()
      .from(chatDmThreads)
      .where(and(
        eq(chatDmThreads.id, dmId),
        eq(chatDmThreads.tenantId, tenantId)
      ));

    if (!dmThread) {
      return res.status(404).json({ error: "DM thread not found in this tenant" });
    }

    const members = await db.select({
      userId: chatDmMembers.userId,
      userName: users.name,
      userEmail: users.email,
    })
    .from(chatDmMembers)
    .innerJoin(users, eq(chatDmMembers.userId, users.id))
    .where(eq(chatDmMembers.dmThreadId, dmId));

    let query = db.select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      authorUserId: chatMessages.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.authorUserId, users.id))
    .where(and(
      eq(chatMessages.dmThreadId, dmId),
      before ? lte(chatMessages.createdAt, new Date(before as string)) : sql`true`
    ))
    .orderBy(desc(chatMessages.createdAt))
    .limit(parseInt(limit as string, 10));

    const messages = await query;

    const messagesWithAttachments = await Promise.all(
      messages.map(async (msg) => {
        const attachments = await db.select()
          .from(chatAttachments)
          .where(eq(chatAttachments.messageId, msg.id));
        return {
          ...msg,
          attachments,
        };
      })
    );

    res.json({
      dmThread: {
        id: dmThread.id,
        members,
        displayName: members.map(m => m.userName || m.userEmail).join(", "),
      },
      messages: messagesWithAttachments.reverse(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/super/chat/search
 * Search messages across a tenant with filters
 * Query params: tenantId (required), q (keyword), from (date), to (date), userId
 */
const searchQuerySchema = z.object({
  tenantId: z.string().uuid(),
  q: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  userId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
});

router.get("/search", async (req, res, next) => {
  try {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query parameters", details: parsed.error.issues });
    }

    const { tenantId, q, from, to, userId, limit } = parsed.data;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantChannelIds = await db.select({ id: chatChannels.id })
      .from(chatChannels)
      .where(eq(chatChannels.tenantId, tenantId));

    const tenantDmIds = await db.select({ id: chatDmThreads.id })
      .from(chatDmThreads)
      .where(eq(chatDmThreads.tenantId, tenantId));

    const channelIds = tenantChannelIds.map(c => c.id);
    const dmIds = tenantDmIds.map(d => d.id);

    if (channelIds.length === 0 && dmIds.length === 0) {
      return res.json({ messages: [], total: 0 });
    }

    const conditions: any[] = [];

    if (channelIds.length > 0 && dmIds.length > 0) {
      conditions.push(or(
        inArray(chatMessages.channelId, channelIds),
        inArray(chatMessages.dmThreadId, dmIds)
      ));
    } else if (channelIds.length > 0) {
      conditions.push(inArray(chatMessages.channelId, channelIds));
    } else {
      conditions.push(inArray(chatMessages.dmThreadId, dmIds));
    }

    if (q) {
      conditions.push(ilike(chatMessages.body, `%${q}%`));
    }
    if (from) {
      conditions.push(gte(chatMessages.createdAt, new Date(from)));
    }
    if (to) {
      conditions.push(lte(chatMessages.createdAt, new Date(to)));
    }
    if (userId) {
      conditions.push(eq(chatMessages.authorUserId, userId));
    }

    const messages = await db.select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      deletedAt: chatMessages.deletedAt,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
      authorUserId: chatMessages.authorUserId,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.authorUserId, users.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit);

    const countResult = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(...conditions));

    res.json({
      messages,
      total: countResult[0]?.count || 0,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
