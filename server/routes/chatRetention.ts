import { Router, Request, Response, NextFunction } from "express";
import { db } from "../db";
import { 
  systemSettings, 
  tenantSettings, 
  chatMessages, 
  chatChannels, 
  chatDmThreads,
  users,
  tenants
} from "@shared/schema";
import { eq, and, lt, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../auth";
import { requireSuperUser, requireTenantContext } from "../middleware/tenantContext";
import { getStorageProvider, createS3ClientFromConfig, StorageNotConfiguredError } from "../storage/getStorageProvider";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AppError, handleRouteError } from "../lib/errors";

const router = Router();

const requireTenantAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  if ((req.user as any).role !== "admin" && (req.user as any).role !== "super_user") {
    throw AppError.forbidden("Admin access required");
  }
  next();
};

// =============================================================================
// SUPER ADMIN ROUTES - System-level retention settings
// =============================================================================

router.get("/super/chat/retention", requireSuperUser, async (req, res) => {
  try {
    const settings = await db.select({
      chatRetentionDays: systemSettings.chatRetentionDays,
    }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);

    const retentionDays = settings[0]?.chatRetentionDays ?? 365;

    res.json({ retentionDays });
  } catch (error) {
    handleRouteError(res, error, "chatRetention.getSystemRetention", req);
  }
});

router.patch("/super/chat/retention", requireSuperUser, async (req, res) => {
  try {
    const { retentionDays } = req.body;

    if (typeof retentionDays !== "number" || retentionDays < 1) {
      throw AppError.badRequest("retentionDays must be a positive integer");
    }

    await db.update(systemSettings)
      .set({ 
        chatRetentionDays: retentionDays,
        updatedAt: new Date()
      })
      .where(eq(systemSettings.id, 1));

    res.json({ success: true, retentionDays });
  } catch (error) {
    handleRouteError(res, error, "chatRetention.updateSystemRetention", req);
  }
});

router.post("/super/chat/archive/run", requireSuperUser, async (req, res) => {
  try {
    const result = await runArchiveJob();
    res.json(result);
  } catch (error) {
    handleRouteError(res, error, "chatRetention.runArchive", req);
  }
});

router.get("/super/chat/archive/stats", requireSuperUser, async (req, res) => {
  try {
    const stats = await db.select({
      totalMessages: sql<number>`COUNT(*)::int`,
      archivedMessages: sql<number>`COUNT(*) FILTER (WHERE ${chatMessages.archivedAt} IS NOT NULL)::int`,
      activeMessages: sql<number>`COUNT(*) FILTER (WHERE ${chatMessages.archivedAt} IS NULL AND ${chatMessages.deletedAt} IS NULL)::int`,
      deletedMessages: sql<number>`COUNT(*) FILTER (WHERE ${chatMessages.deletedAt} IS NOT NULL)::int`,
    }).from(chatMessages);

    res.json(stats[0] || { totalMessages: 0, archivedMessages: 0, activeMessages: 0, deletedMessages: 0 });
  } catch (error) {
    handleRouteError(res, error, "chatRetention.archiveStats", req);
  }
});

// =============================================================================
// TENANT ADMIN ROUTES - Tenant-level retention settings
// =============================================================================

router.get("/tenant/chat/retention", requireAuth, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.tenant?.effectiveTenantId;
    if (!tenantId) {
      throw AppError.forbidden("No tenant context");
    }

    const tenantSettingsResult = await db.select({
      chatRetentionDays: tenantSettings.chatRetentionDays,
    }).from(tenantSettings).where(eq(tenantSettings.tenantId, tenantId)).limit(1);

    const systemSettingsResult = await db.select({
      chatRetentionDays: systemSettings.chatRetentionDays,
    }).from(systemSettings).where(eq(systemSettings.id, 1)).limit(1);

    const tenantRetention = tenantSettingsResult[0]?.chatRetentionDays;
    const systemDefault = systemSettingsResult[0]?.chatRetentionDays ?? 365;

    res.json({
      retentionDays: tenantRetention ?? systemDefault,
      customRetentionDays: tenantRetention,
      systemDefault,
      isCustom: tenantRetention !== null && tenantRetention !== undefined,
    });
  } catch (error) {
    handleRouteError(res, error, "chatRetention.getTenantRetention", req);
  }
});

router.patch("/tenant/chat/retention", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenant?.effectiveTenantId;
    if (!tenantId) {
      throw AppError.forbidden("No tenant context");
    }

    const { retentionDays, useSystemDefault } = req.body;

    if (useSystemDefault) {
      await db.update(tenantSettings)
        .set({ 
          chatRetentionDays: null,
          updatedAt: new Date()
        })
        .where(eq(tenantSettings.tenantId, tenantId));

      return res.json({ success: true, useSystemDefault: true });
    }

    if (typeof retentionDays !== "number" || retentionDays < 1) {
      throw AppError.badRequest("retentionDays must be a positive integer");
    }

    await db.update(tenantSettings)
      .set({ 
        chatRetentionDays: retentionDays,
        updatedAt: new Date()
      })
      .where(eq(tenantSettings.tenantId, tenantId));

    res.json({ success: true, retentionDays });
  } catch (error) {
    handleRouteError(res, error, "chatRetention.updateTenantRetention", req);
  }
});

// =============================================================================
// TRANSCRIPT EXPORT ROUTES
// =============================================================================

router.post("/tenant/chat/export/:threadType/:threadId", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.tenant?.effectiveTenantId;
    if (!tenantId) {
      throw AppError.forbidden("No tenant context");
    }

    const { threadType, threadId } = req.params;

    if (!["channel", "dm"].includes(threadType)) {
      throw AppError.badRequest("Invalid thread type. Must be 'channel' or 'dm'");
    }

    if (threadType === "channel") {
      const channel = await db.select().from(chatChannels)
        .where(and(eq(chatChannels.id, threadId), eq(chatChannels.tenantId, tenantId)))
        .limit(1);
      if (!channel.length) {
        throw AppError.notFound("Channel");
      }
    } else {
      const dm = await db.select().from(chatDmThreads)
        .where(and(eq(chatDmThreads.id, threadId), eq(chatDmThreads.tenantId, tenantId)))
        .limit(1);
      if (!dm.length) {
        throw AppError.notFound("DM thread");
      }
    }

    const messagesQuery = threadType === "channel"
      ? db.select({
          id: chatMessages.id,
          body: chatMessages.body,
          createdAt: chatMessages.createdAt,
          editedAt: chatMessages.editedAt,
          deletedAt: chatMessages.deletedAt,
          archivedAt: chatMessages.archivedAt,
          authorId: chatMessages.authorUserId,
          authorEmail: users.email,
          authorFirstName: users.firstName,
          authorLastName: users.lastName,
        })
        .from(chatMessages)
        .leftJoin(users, eq(chatMessages.authorUserId, users.id))
        .where(and(
          eq(chatMessages.channelId, threadId),
          eq(chatMessages.tenantId, tenantId)
        ))
        .orderBy(chatMessages.createdAt)
      : db.select({
          id: chatMessages.id,
          body: chatMessages.body,
          createdAt: chatMessages.createdAt,
          editedAt: chatMessages.editedAt,
          deletedAt: chatMessages.deletedAt,
          archivedAt: chatMessages.archivedAt,
          authorId: chatMessages.authorUserId,
          authorEmail: users.email,
          authorFirstName: users.firstName,
          authorLastName: users.lastName,
        })
        .from(chatMessages)
        .leftJoin(users, eq(chatMessages.authorUserId, users.id))
        .where(and(
          eq(chatMessages.dmThreadId, threadId),
          eq(chatMessages.tenantId, tenantId)
        ))
        .orderBy(chatMessages.createdAt);

    const messages = await messagesQuery;

    let threadInfo: Record<string, unknown> = {};
    if (threadType === "channel") {
      const [channel] = await db.select({
        name: chatChannels.name,
        isPrivate: chatChannels.isPrivate,
        createdAt: chatChannels.createdAt,
      }).from(chatChannels).where(eq(chatChannels.id, threadId));
      threadInfo = { type: "channel", ...channel };
    } else {
      const [dm] = await db.select({
        createdAt: chatDmThreads.createdAt,
      }).from(chatDmThreads).where(eq(chatDmThreads.id, threadId));
      threadInfo = { type: "dm", ...dm };
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: (req.user as any)?.email,
      tenantId,
      thread: threadInfo,
      messageCount: messages.length,
      messages: messages.map(m => ({
        id: m.id,
        author: {
          id: m.authorId,
          email: m.authorEmail,
          name: `${m.authorFirstName || ""} ${m.authorLastName || ""}`.trim() || m.authorEmail,
        },
        body: m.deletedAt ? "[Message deleted]" : m.body,
        createdAt: m.createdAt?.toISOString(),
        editedAt: m.editedAt?.toISOString() || null,
        deletedAt: m.deletedAt?.toISOString() || null,
        archivedAt: m.archivedAt?.toISOString() || null,
      })),
    };

    try {
      const storageResult = await getStorageProvider(tenantId);
      const s3Client = createS3ClientFromConfig(storageResult.config);
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const s3Key = `exports/chat/${tenantId}/${threadType}-${threadId}-${timestamp}.json`;
      
      const jsonContent = JSON.stringify(exportData, null, 2);
      
      await s3Client.send(new PutObjectCommand({
        Bucket: storageResult.config.bucketName,
        Key: s3Key,
        Body: jsonContent,
        ContentType: "application/json",
      }));
      
      const downloadUrl = await getSignedUrl(s3Client, new GetObjectCommand({
        Bucket: storageResult.config.bucketName,
        Key: s3Key,
      }), { expiresIn: 3600 });

      return res.json({
        success: true,
        s3Key,
        downloadUrl,
        messageCount: messages.length,
      });
    } catch (storageError) {
      if (storageError instanceof StorageNotConfiguredError) {
        return res.json({
          success: true,
          downloadUrl: null,
          messageCount: messages.length,
          data: exportData,
        });
      }
      throw storageError;
    }
  } catch (error) {
    handleRouteError(res, error, "chatRetention.exportThread", req);
  }
});

// =============================================================================
// ARCHIVE JOB FUNCTION
// =============================================================================

export async function runArchiveJob(): Promise<{
  archived: number;
  tenantsProcessed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let totalArchived = 0;
  let tenantsProcessed = 0;

  try {
    const [systemConfig] = await db.select({
      chatRetentionDays: systemSettings.chatRetentionDays,
    }).from(systemSettings).where(eq(systemSettings.id, 1));
    
    const systemRetention = systemConfig?.chatRetentionDays ?? 365;

    const tenantsWithSettings = await db.select({
      tenantId: tenants.id,
      tenantName: tenants.name,
      customRetention: tenantSettings.chatRetentionDays,
    })
    .from(tenants)
    .leftJoin(tenantSettings, eq(tenants.id, tenantSettings.tenantId));

    for (const tenant of tenantsWithSettings) {
      try {
        const retentionDays = tenant.customRetention ?? systemRetention;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

        const result = await db.update(chatMessages)
          .set({ archivedAt: new Date() })
          .where(and(
            eq(chatMessages.tenantId, tenant.tenantId),
            lt(chatMessages.createdAt, cutoffDate),
            isNull(chatMessages.archivedAt),
            isNull(chatMessages.deletedAt)
          ))
          .returning({ id: chatMessages.id });

        totalArchived += result.length;
        tenantsProcessed++;

        if (result.length > 0) {
          console.log(`[chatRetention] Archived ${result.length} messages for tenant ${tenant.tenantName} (retention: ${retentionDays} days)`);
        }
      } catch (tenantError) {
        const errorMsg = `Failed to process tenant ${tenant.tenantId}: ${tenantError}`;
        console.error(`[chatRetention] ${errorMsg}`);
        errors.push(errorMsg);
      }
    }

    console.log(`[chatRetention] Archive job complete. Archived ${totalArchived} messages across ${tenantsProcessed} tenants.`);
  } catch (error) {
    const errorMsg = `Archive job failed: ${error}`;
    console.error(`[chatRetention] ${errorMsg}`);
    errors.push(errorMsg);
  }

  return {
    archived: totalArchived,
    tenantsProcessed,
    errors,
  };
}

export default router;
