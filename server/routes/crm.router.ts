import { Router, Request, Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { eq, and, desc, sql, count, ilike, lte, gte, inArray, isNotNull } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { requireAuth, requireAdmin } from "../auth";
import {
  clients,
  clientContacts,
  clientCrm,
  clientNotes,
  clientNoteVersions,
  clientFiles,
  userClientAccess,
  users,
  projects,
  tasks,
  timeEntries,
  activityLog,
  comments,
  updateClientCrmSchema,
  updateClientContactSchema,
  updateClientFileSchema,
  UserRole,
  CrmClientStatus,
  ClientFileVisibility,
} from "@shared/schema";
import { getCurrentUserId } from "./helpers";

const router = Router();

function isAdminOrSuper(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.SUPER_USER;
}

async function verifyClientTenancy(clientId: string, tenantId: string): Promise<typeof clients.$inferSelect | null> {
  const [client] = await db.select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return client || null;
}

const crmContactCreateSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  title: z.string().optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const crmNoteCreateSchema = z.object({
  body: z.unknown(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.get("/crm/clients/:clientId/summary", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const [crmRow] = await db.select()
      .from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    const [projectCount] = await db.select({ value: count() })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const [openTaskCount] = await db.select({ value: count() })
      .from(tasks)
      .where(
        and(
          eq(tasks.tenantId, tenantId),
          sql`${tasks.projectId} IN (SELECT id FROM projects WHERE client_id = ${clientId} AND tenant_id = ${tenantId})`,
          sql`${tasks.status} NOT IN ('completed', 'archived')`
        )
      );

    const [hoursSums] = await db.select({
      totalHours: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}) / 3600.0, 0)`,
      billableHours: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntries.scope} = 'in_scope' THEN ${timeEntries.durationSeconds} ELSE 0 END) / 3600.0, 0)`,
    })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.tenantId, tenantId),
          sql`${timeEntries.projectId} IN (SELECT id FROM projects WHERE client_id = ${clientId} AND tenant_id = ${tenantId})`
        )
      );

    res.json({
      client: {
        id: client.id,
        companyName: client.companyName,
        displayName: client.displayName,
        email: client.email,
        phone: client.phone,
        status: client.status,
        industry: client.industry,
      },
      crm: crmRow || null,
      counts: {
        projects: projectCount?.value ?? 0,
        openTasks: openTaskCount?.value ?? 0,
        totalHours: Number(hoursSums?.totalHours ?? 0),
        billableHours: Number(hoursSums?.billableHours ?? 0),
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/summary", req);
  }
});

router.get("/crm/clients/:clientId/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const contacts = await db.select()
      .from(clientContacts)
      .where(and(eq(clientContacts.clientId, clientId), eq(clientContacts.workspaceId, client.workspaceId)))
      .orderBy(desc(clientContacts.isPrimary), clientContacts.createdAt);

    res.json(contacts);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/contacts", req);
  }
});

router.post("/crm/clients/:clientId/contacts", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, crmContactCreateSchema, res);
    if (!data) return;

    const [contact] = await db.insert(clientContacts).values({
      clientId,
      tenantId,
      workspaceId: client.workspaceId,
      firstName: data.firstName,
      lastName: data.lastName,
      title: data.title,
      email: data.email ?? null,
      phone: data.phone ?? null,
      isPrimary: data.isPrimary ?? false,
      notes: data.notes ?? null,
    }).returning();

    res.status(201).json(contact);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/contacts", req);
  }
});

router.patch("/crm/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientContacts)
      .where(eq(clientContacts.id, id))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    const client = await verifyClientTenancy(existing.clientId, tenantId);
    if (!client) return sendError(res, AppError.forbidden("Access denied"), req);

    const data = validateBody(req.body, updateClientContactSchema, res);
    if (!data) return;

    const [updated] = await db.update(clientContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clientContacts.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/contacts/:id", req);
  }
});

router.delete("/crm/contacts/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientContacts)
      .where(eq(clientContacts.id, id))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Contact"), req);

    const client = await verifyClientTenancy(existing.clientId, tenantId);
    if (!client) return sendError(res, AppError.forbidden("Access denied"), req);

    await db.delete(clientContacts).where(eq(clientContacts.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/contacts/:id", req);
  }
});

router.patch("/crm/clients/:clientId/crm", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, updateClientCrmSchema, res);
    if (!data) return;

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.status !== undefined) updateValues.status = data.status;
    if (data.ownerUserId !== undefined) updateValues.ownerUserId = data.ownerUserId;
    if (data.tags !== undefined) updateValues.tags = data.tags;
    if (data.followUpNotes !== undefined) updateValues.followUpNotes = data.followUpNotes;
    if (data.lastContactAt !== undefined) {
      updateValues.lastContactAt = data.lastContactAt ? new Date(data.lastContactAt) : null;
    }
    if (data.nextFollowUpAt !== undefined) {
      updateValues.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    const [existingCrm] = await db.select()
      .from(clientCrm)
      .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
      .limit(1);

    let result;
    if (existingCrm) {
      [result] = await db.update(clientCrm)
        .set(updateValues)
        .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
        .returning();
    } else {
      [result] = await db.insert(clientCrm).values({
        clientId,
        tenantId,
        ...updateValues,
      }).returning();
    }

    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/clients/:clientId/crm", req);
  }
});

router.get("/crm/clients/:clientId/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const notes = await db.select({
      id: clientNotes.id,
      tenantId: clientNotes.tenantId,
      clientId: clientNotes.clientId,
      authorUserId: clientNotes.authorUserId,
      body: clientNotes.body,
      category: clientNotes.category,
      categoryId: clientNotes.categoryId,
      createdAt: clientNotes.createdAt,
      updatedAt: clientNotes.updatedAt,
      authorName: users.name,
      authorEmail: users.email,
    })
      .from(clientNotes)
      .leftJoin(users, eq(clientNotes.authorUserId, users.id))
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.tenantId, tenantId)))
      .orderBy(desc(clientNotes.createdAt));

    res.json(notes);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/notes", req);
  }
});

router.post("/crm/clients/:clientId/notes", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const data = validateBody(req.body, crmNoteCreateSchema, res);
    if (!data) return;

    const userId = getCurrentUserId(req);

    const [note] = await db.insert(clientNotes).values({
      clientId,
      tenantId,
      authorUserId: userId,
      body: data.body,
      category: data.category ?? "general",
      categoryId: data.categoryId ?? null,
    }).returning();

    res.status(201).json(note);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/notes", req);
  }
});

router.delete("/crm/notes/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientNotes)
      .where(and(eq(clientNotes.id, id), eq(clientNotes.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Note"), req);

    const userId = getCurrentUserId(req);
    if (existing.authorUserId !== userId && !isAdminOrSuper(req)) {
      return sendError(res, AppError.forbidden("Only the author or an admin can delete this note"), req);
    }

    await db.delete(clientNoteVersions).where(eq(clientNoteVersions.noteId, id));
    await db.delete(clientNotes).where(eq(clientNotes.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/notes/:id", req);
  }
});

router.get("/crm/pipeline", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { owner, tag, search, followUpBefore, followUpAfter } = req.query;

    const conditions: any[] = [eq(clients.tenantId, tenantId)];

    if (owner && typeof owner === "string") {
      conditions.push(eq(clientCrm.ownerUserId, owner));
    }
    if (tag && typeof tag === "string") {
      conditions.push(sql`${tag} = ANY(${clientCrm.tags})`);
    }
    if (search && typeof search === "string") {
      conditions.push(
        sql`(${ilike(clients.companyName, `%${search}%`)} OR ${ilike(clients.displayName, `%${search}%`)})`
      );
    }
    if (followUpBefore && typeof followUpBefore === "string") {
      conditions.push(lte(clientCrm.nextFollowUpAt, new Date(followUpBefore)));
    }
    if (followUpAfter && typeof followUpAfter === "string") {
      conditions.push(gte(clientCrm.nextFollowUpAt, new Date(followUpAfter)));
    }

    const rows = await db
      .select({
        clientId: clients.id,
        companyName: clients.companyName,
        displayName: clients.displayName,
        email: clients.email,
        industry: clients.industry,
        crmStatus: clientCrm.status,
        ownerUserId: clientCrm.ownerUserId,
        ownerName: users.name,
        tags: clientCrm.tags,
        lastContactAt: clientCrm.lastContactAt,
        nextFollowUpAt: clientCrm.nextFollowUpAt,
        followUpNotes: clientCrm.followUpNotes,
        crmUpdatedAt: clientCrm.updatedAt,
      })
      .from(clients)
      .leftJoin(clientCrm, and(eq(clientCrm.clientId, clients.id), eq(clientCrm.tenantId, tenantId)))
      .leftJoin(users, eq(users.id, clientCrm.ownerUserId))
      .where(and(...conditions))
      .orderBy(clients.companyName);

    res.json(rows);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/pipeline", req);
  }
});

router.get("/crm/followups", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000 - 1);
    const next7Days = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        clientId: clients.id,
        companyName: clients.companyName,
        displayName: clients.displayName,
        email: clients.email,
        crmStatus: clientCrm.status,
        ownerUserId: clientCrm.ownerUserId,
        ownerName: users.name,
        tags: clientCrm.tags,
        nextFollowUpAt: clientCrm.nextFollowUpAt,
        followUpNotes: clientCrm.followUpNotes,
        lastContactAt: clientCrm.lastContactAt,
      })
      .from(clients)
      .innerJoin(clientCrm, and(eq(clientCrm.clientId, clients.id), eq(clientCrm.tenantId, tenantId)))
      .leftJoin(users, eq(users.id, clientCrm.ownerUserId))
      .where(
        and(
          eq(clients.tenantId, tenantId),
          isNotNull(clientCrm.nextFollowUpAt),
          lte(clientCrm.nextFollowUpAt, next7Days)
        )
      )
      .orderBy(clientCrm.nextFollowUpAt);

    const overdue: typeof rows = [];
    const dueToday: typeof rows = [];
    const next7: typeof rows = [];

    for (const row of rows) {
      if (!row.nextFollowUpAt) continue;
      const followUp = new Date(row.nextFollowUpAt);
      if (followUp < startOfToday) {
        overdue.push(row);
      } else if (followUp <= endOfToday) {
        dueToday.push(row);
      } else {
        next7.push(row);
      }
    }

    res.json({ overdue, dueToday, next7Days: next7 });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/followups", req);
  }
});

const bulkUpdateSchema = z.object({
  clientIds: z.array(z.string().uuid()).min(1),
  ownerUserId: z.string().uuid().nullable().optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

router.post("/crm/bulk-update", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const data = validateBody(req.body, bulkUpdateSchema, res);
    if (!data) return;

    const tenantClients = await db.select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, data.clientIds)));

    const validClientIds = tenantClients.map(c => c.id);
    if (validClientIds.length === 0) {
      return sendError(res, AppError.notFound("No valid clients found"), req);
    }

    const updateValues: Record<string, unknown> = { updatedAt: new Date() };
    if (data.ownerUserId !== undefined) updateValues.ownerUserId = data.ownerUserId;
    if (data.nextFollowUpAt !== undefined) {
      updateValues.nextFollowUpAt = data.nextFollowUpAt ? new Date(data.nextFollowUpAt) : null;
    }

    let updatedCount = 0;
    for (const clientId of validClientIds) {
      const [existingCrm] = await db.select()
        .from(clientCrm)
        .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)))
        .limit(1);

      if (existingCrm) {
        await db.update(clientCrm)
          .set(updateValues)
          .where(and(eq(clientCrm.clientId, clientId), eq(clientCrm.tenantId, tenantId)));
      } else {
        await db.insert(clientCrm).values({
          clientId,
          tenantId,
          ...updateValues,
        });
      }
      updatedCount++;
    }

    res.json({ success: true, updatedCount });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/bulk-update", req);
  }
});

// =============================================================================
// ACTIVITY TIMELINE
// =============================================================================

router.get("/crm/clients/:clientId/activity", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const typeFilter = req.query.type as string | undefined;

    const clientProjectIds = db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)));

    const events: Array<{
      id: string;
      type: string;
      entityId: string;
      summary: string;
      actorUserId: string | null;
      actorName: string | null;
      createdAt: Date;
      metadata: unknown;
    }> = [];

    if (!typeFilter || typeFilter === "project") {
      const projectEvents = await db
        .select({
          id: projects.id,
          name: projects.name,
          status: projects.status,
          createdAt: projects.createdAt,
        })
        .from(projects)
        .where(and(eq(projects.clientId, clientId), eq(projects.tenantId, tenantId)))
        .orderBy(desc(projects.createdAt))
        .limit(limit);

      for (const p of projectEvents) {
        events.push({
          id: `project-${p.id}`,
          type: "project",
          entityId: p.id,
          summary: `Project "${p.name}" created (${p.status})`,
          actorUserId: null,
          actorName: null,
          createdAt: p.createdAt,
          metadata: { projectName: p.name, status: p.status },
        });
      }
    }

    if (!typeFilter || typeFilter === "task") {
      const taskEvents = await db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          createdAt: tasks.createdAt,
          projectId: tasks.projectId,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.tenantId, tenantId),
            sql`${tasks.projectId} IN (${clientProjectIds})`
          )
        )
        .orderBy(desc(tasks.createdAt))
        .limit(limit);

      for (const t of taskEvents) {
        events.push({
          id: `task-${t.id}`,
          type: "task",
          entityId: t.id,
          summary: `Task "${t.title}" ${t.status === "completed" ? "completed" : "created"}`,
          actorUserId: null,
          actorName: null,
          createdAt: t.createdAt,
          metadata: { taskTitle: t.title, status: t.status, projectId: t.projectId },
        });
      }
    }

    if (!typeFilter || typeFilter === "time_entry") {
      const timeEvents = await db
        .select({
          id: timeEntries.id,
          description: timeEntries.description,
          durationSeconds: timeEntries.durationSeconds,
          userId: timeEntries.userId,
          userName: users.name,
          createdAt: timeEntries.createdAt,
          projectId: timeEntries.projectId,
        })
        .from(timeEntries)
        .leftJoin(users, eq(users.id, timeEntries.userId))
        .where(
          and(
            eq(timeEntries.tenantId, tenantId),
            sql`${timeEntries.projectId} IN (${clientProjectIds})`
          )
        )
        .orderBy(desc(timeEntries.createdAt))
        .limit(limit);

      for (const te of timeEvents) {
        const hours = ((te.durationSeconds || 0) / 3600).toFixed(1);
        events.push({
          id: `time-${te.id}`,
          type: "time_entry",
          entityId: te.id,
          summary: `${te.userName || "Someone"} logged ${hours}h${te.description ? `: ${te.description}` : ""}`,
          actorUserId: te.userId,
          actorName: te.userName,
          createdAt: te.createdAt,
          metadata: { hours, projectId: te.projectId },
        });
      }
    }

    if (!typeFilter || typeFilter === "comment") {
      const commentEvents = await db
        .select({
          id: comments.id,
          body: comments.body,
          userId: comments.userId,
          userName: users.name,
          createdAt: comments.createdAt,
          taskId: comments.taskId,
        })
        .from(comments)
        .leftJoin(users, eq(users.id, comments.userId))
        .where(
          and(
            eq(comments.tenantId, tenantId),
            sql`${comments.taskId} IN (SELECT id FROM tasks WHERE tenant_id = ${tenantId} AND project_id IN (${clientProjectIds}))`
          )
        )
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      for (const c of commentEvents) {
        const preview = typeof c.body === "string"
          ? c.body.slice(0, 80) + (c.body.length > 80 ? "..." : "")
          : "commented";
        events.push({
          id: `comment-${c.id}`,
          type: "comment",
          entityId: c.id,
          summary: `${c.userName || "Someone"} ${preview}`,
          actorUserId: c.userId,
          actorName: c.userName,
          createdAt: c.createdAt,
          metadata: { taskId: c.taskId },
        });
      }
    }

    if (!typeFilter || typeFilter === "file") {
      const fileEvents = await db
        .select({
          id: clientFiles.id,
          filename: clientFiles.filename,
          uploadedByUserId: clientFiles.uploadedByUserId,
          uploaderName: users.name,
          createdAt: clientFiles.createdAt,
        })
        .from(clientFiles)
        .leftJoin(users, eq(users.id, clientFiles.uploadedByUserId))
        .where(and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId)))
        .orderBy(desc(clientFiles.createdAt))
        .limit(limit);

      for (const f of fileEvents) {
        events.push({
          id: `file-${f.id}`,
          type: "file",
          entityId: f.id,
          summary: `${f.uploaderName || "Someone"} uploaded "${f.filename}"`,
          actorUserId: f.uploadedByUserId,
          actorName: f.uploaderName,
          createdAt: f.createdAt,
          metadata: { filename: f.filename },
        });
      }
    }

    events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json(events.slice(0, limit));
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/activity", req);
  }
});

// =============================================================================
// CLIENT FILES
// =============================================================================

router.get("/crm/clients/:clientId/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const isClient = req.user?.role === UserRole.CLIENT;
    const visibilityConditions = isClient
      ? and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId), eq(clientFiles.visibility, ClientFileVisibility.CLIENT))
      : and(eq(clientFiles.clientId, clientId), eq(clientFiles.tenantId, tenantId));

    const typeFilter = req.query.type as string | undefined;
    const visibilityFilter = req.query.visibility as string | undefined;

    let conditions = visibilityConditions;
    if (typeFilter) {
      conditions = and(conditions, eq(clientFiles.mimeType, typeFilter))!;
    }
    if (visibilityFilter && !isClient) {
      conditions = and(conditions, eq(clientFiles.visibility, visibilityFilter))!;
    }

    const files = await db
      .select({
        id: clientFiles.id,
        filename: clientFiles.filename,
        mimeType: clientFiles.mimeType,
        size: clientFiles.size,
        url: clientFiles.url,
        visibility: clientFiles.visibility,
        linkedEntityType: clientFiles.linkedEntityType,
        linkedEntityId: clientFiles.linkedEntityId,
        uploadedByUserId: clientFiles.uploadedByUserId,
        uploaderName: users.name,
        createdAt: clientFiles.createdAt,
      })
      .from(clientFiles)
      .leftJoin(users, eq(users.id, clientFiles.uploadedByUserId))
      .where(conditions)
      .orderBy(desc(clientFiles.createdAt));

    res.json(files);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/files", req);
  }
});

router.post("/crm/clients/:clientId/files", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot upload files"), req);
    }

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const userId = getCurrentUserId(req);

    const fileSchema = z.object({
      filename: z.string().min(1),
      mimeType: z.string().optional(),
      size: z.number().optional(),
      storageKey: z.string().min(1),
      url: z.string().optional(),
      visibility: z.enum(["internal", "client"]).optional(),
      linkedEntityType: z.string().optional(),
      linkedEntityId: z.string().optional(),
    });

    const data = validateBody(req.body, fileSchema, res);
    if (!data) return;

    const [file] = await db.insert(clientFiles).values({
      tenantId,
      clientId,
      uploadedByUserId: userId,
      filename: data.filename,
      mimeType: data.mimeType ?? null,
      size: data.size ?? null,
      storageKey: data.storageKey,
      url: data.url ?? null,
      visibility: data.visibility ?? ClientFileVisibility.INTERNAL,
      linkedEntityType: data.linkedEntityType ?? null,
      linkedEntityId: data.linkedEntityId ?? null,
    }).returning();

    res.status(201).json(file);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/files", req);
  }
});

router.patch("/crm/files/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot modify files"), req);
    }

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientFiles)
      .where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("File"), req);

    const data = validateBody(req.body, updateClientFileSchema, res);
    if (!data) return;

    const [updated] = await db.update(clientFiles)
      .set(data)
      .where(eq(clientFiles.id, id))
      .returning();

    res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/crm/files/:id", req);
  }
});

router.delete("/crm/files/:id", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    if (req.user?.role === UserRole.CLIENT) {
      return sendError(res, AppError.forbidden("Client users cannot delete files"), req);
    }

    const { id } = req.params;

    const [existing] = await db.select()
      .from(clientFiles)
      .where(and(eq(clientFiles.id, id), eq(clientFiles.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("File"), req);

    await db.delete(clientFiles).where(eq(clientFiles.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/files/:id", req);
  }
});

// =============================================================================
// CLIENT PORTAL / USER CLIENT ACCESS
// =============================================================================

router.get("/crm/clients/:clientId/access", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const accessList = await db
      .select({
        id: userClientAccess.id,
        userId: userClientAccess.userId,
        userName: users.name,
        userEmail: users.email,
        permissions: userClientAccess.permissions,
        createdAt: userClientAccess.createdAt,
      })
      .from(userClientAccess)
      .leftJoin(users, eq(users.id, userClientAccess.userId))
      .where(and(eq(userClientAccess.clientId, clientId), eq(userClientAccess.tenantId, tenantId)));

    res.json(accessList);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/clients/:clientId/access", req);
  }
});

router.post("/crm/clients/:clientId/access", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { clientId } = req.params;
    const client = await verifyClientTenancy(clientId, tenantId);
    if (!client) return sendError(res, AppError.notFound("Client"), req);

    const accessSchema = z.object({
      userId: z.string().uuid(),
      permissions: z.record(z.unknown()).optional(),
    });

    const data = validateBody(req.body, accessSchema, res);
    if (!data) return;

    const [existingAccess] = await db.select()
      .from(userClientAccess)
      .where(and(
        eq(userClientAccess.userId, data.userId),
        eq(userClientAccess.clientId, clientId),
        eq(userClientAccess.tenantId, tenantId)
      ))
      .limit(1);

    if (existingAccess) {
      return sendError(res, AppError.conflict("User already has access to this client"), req);
    }

    const [access] = await db.insert(userClientAccess).values({
      tenantId,
      userId: data.userId,
      clientId,
      permissions: data.permissions ?? null,
    }).returning();

    res.status(201).json(access);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/crm/clients/:clientId/access", req);
  }
});

router.delete("/crm/access/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const { id } = req.params;

    const [existing] = await db.select()
      .from(userClientAccess)
      .where(and(eq(userClientAccess.id, id), eq(userClientAccess.tenantId, tenantId)))
      .limit(1);
    if (!existing) return sendError(res, AppError.notFound("Access record"), req);

    await db.delete(userClientAccess).where(eq(userClientAccess.id, id));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/crm/access/:id", req);
  }
});

router.get("/crm/portal/dashboard", requireAuth, async (req: Request, res: Response) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) return sendError(res, AppError.tenantRequired(), req);

    const userId = getCurrentUserId(req);

    const accessRecords = await db.select({ clientId: userClientAccess.clientId })
      .from(userClientAccess)
      .where(and(eq(userClientAccess.userId, userId), eq(userClientAccess.tenantId, tenantId)));

    const clientIds = accessRecords.map(a => a.clientId);

    if (clientIds.length === 0) {
      return res.json({ clients: [], projects: [], files: [], activity: [] });
    }

    const myClients = await db.select({
      id: clients.id,
      companyName: clients.companyName,
      displayName: clients.displayName,
    })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, clientIds)));

    const myProjects = await db.select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      clientId: projects.clientId,
    })
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), inArray(projects.clientId, clientIds)))
      .orderBy(desc(projects.createdAt))
      .limit(20);

    const sharedFiles = await db.select({
      id: clientFiles.id,
      filename: clientFiles.filename,
      mimeType: clientFiles.mimeType,
      size: clientFiles.size,
      url: clientFiles.url,
      clientId: clientFiles.clientId,
      createdAt: clientFiles.createdAt,
    })
      .from(clientFiles)
      .where(
        and(
          eq(clientFiles.tenantId, tenantId),
          inArray(clientFiles.clientId, clientIds),
          eq(clientFiles.visibility, ClientFileVisibility.CLIENT)
        )
      )
      .orderBy(desc(clientFiles.createdAt))
      .limit(20);

    res.json({
      clients: myClients,
      projects: myProjects,
      files: sharedFiles,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/crm/portal/dashboard", req);
  }
});

export default router;
