import { Router, Request, Response } from "express";
import { z } from "zod";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, desc, sql, count, inArray } from "drizzle-orm";
import { AppError, handleRouteError, sendError, validateBody } from "../lib/errors";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { requireAuth } from "../auth";
import {
  insertClientSchema,
  insertClientContactSchema,
  insertClientInviteSchema,
  insertClientDivisionSchema,
  insertProjectSchema,
  updateClientSchema,
  updateClientContactSchema,
  clientNotes,
  clientNoteVersions,
  clientNoteCategories,
  users,
} from "@shared/schema";
import {
  getCurrentUserId,
  getCurrentWorkspaceId,
  isSuperUser,
} from "./helpers";
import {
  emitClientCreated,
  emitClientUpdated,
  emitClientDeleted,
  emitClientContactCreated,
  emitClientContactUpdated,
  emitClientContactDeleted,
  emitClientInviteSent,
  emitClientInviteRevoked,
  emitProjectCreated,
  emitProjectClientAssigned,
} from "../realtime/events";

const router = Router();

// =============================================================================
// PROJECT CLIENT ASSIGNMENT
// =============================================================================

router.patch("/projects/:projectId/client", async (req, res) => {
  try {
    const { projectId } = req.params;
    const { clientId } = req.body;
    const tenantId = getEffectiveTenantId(req);

    const existingProject = tenantId 
      ? await storage.getProjectByIdAndTenant(projectId, tenantId)
      : isSuperUser(req) 
        ? await storage.getProject(projectId) 
        : null;
    
    if (!existingProject) {
      return sendError(res, AppError.notFound("Project"), req);
    }

    const previousClientId = existingProject.clientId;

    if (clientId !== null && clientId !== undefined) {
      const client = tenantId 
        ? await storage.getClientByIdAndTenant(clientId, tenantId)
        : await storage.getClient(clientId);
      if (!client) {
        return sendError(res, AppError.badRequest("Client not found"), req);
      }
    }

    let updatedProject;
    if (tenantId) {
      updatedProject = await storage.updateProjectWithTenant(projectId, tenantId, {
        clientId: clientId === undefined ? null : clientId,
      });
    } else if (isSuperUser(req)) {
      updatedProject = await storage.updateProject(projectId, {
        clientId: clientId === undefined ? null : clientId,
      });
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }

    if (!updatedProject) {
      return sendError(res, AppError.internal("Failed to update project"), req);
    }

    emitProjectClientAssigned(updatedProject as any, previousClientId);

    res.json(updatedProject);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/projects/:projectId/client", req);
  }
});

// =============================================================================
// CLIENT CRUD ROUTES
// =============================================================================

router.get("/clients", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const requestId = req.requestId || "unknown";
    
    console.log(`[GET /api/clients] requestId=${requestId}, tenantId=${tenantId}, workspaceId=${workspaceId}, userId=${req.user?.id}`);
    
    if (tenantId) {
      const clients = await storage.getClientsByTenant(tenantId, workspaceId);
      console.log(`[GET /api/clients] Found ${clients.length} clients for tenantId=${tenantId}, requestId=${requestId}`);
      return res.json(clients);
    }
    
    if (isSuperUser(req)) {
      const clients = await storage.getClientsByWorkspace(workspaceId);
      console.log(`[GET /api/clients] Super user mode: Found ${clients.length} clients for workspaceId=${workspaceId}, requestId=${requestId}`);
      return res.json(clients);
    }
    
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients", req);
  }
});

router.get("/clients/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
      if (!client) throw AppError.notFound("Client");
      const clientWithContacts = await storage.getClientWithContacts(req.params.id);
      return res.json(clientWithContacts);
    }
    
    if (isSuperUser(req)) {
      const client = await storage.getClientWithContacts(req.params.id);
      if (!client) throw AppError.notFound("Client");
      return res.json(client);
    }
    
    return sendError(res, AppError.internal("User tenant not configured"), req);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:id", req);
  }
});

router.post("/clients", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const requestId = req.requestId || "unknown";
    
    console.log(`[POST /api/clients] requestId=${requestId}, tenantId=${tenantId}, workspaceId=${workspaceId}, body:`, JSON.stringify(req.body));
    
    const data = insertClientSchema.parse({
      ...req.body,
      workspaceId,
    });
    
    let client;
    if (tenantId) {
      client = await storage.createClientWithTenant(data, tenantId);
    } else if (isSuperUser(req)) {
      client = await storage.createClient(data);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }

    emitClientCreated(
      {
        id: client.id,
        companyName: client.companyName,
        displayName: client.displayName,
        status: client.status,
        workspaceId: client.workspaceId,
        createdAt: client.createdAt!,
      },
      workspaceId,
    );

    console.log(`[POST /api/clients] Created client ${client.id}, requestId=${requestId}`);
    res.status(201).json(client);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients", req);
  }
});

router.patch("/clients/:id", async (req, res) => {
  try {
    const data = validateBody(req.body, updateClientSchema, res);
    if (!data) return;
    
    const tenantId = getEffectiveTenantId(req);
    
    let client;
    if (tenantId) {
      client = await storage.updateClientWithTenant(req.params.id, tenantId, data);
    } else if (isSuperUser(req)) {
      client = await storage.updateClient(req.params.id, data);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }
    
    if (!client) {
      return sendError(res, AppError.notFound("Client"), req);
    }

    emitClientUpdated(client.id, client.workspaceId, data);

    res.json(client);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/clients/:id", req);
  }
});

router.delete("/clients/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    let workspaceId = "";
    
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
      if (!client) throw AppError.notFound("Client");
      workspaceId = client.workspaceId;
      const deleted = await storage.deleteClientWithTenant(req.params.id, tenantId);
      if (!deleted) throw AppError.notFound("Client");
    } else if (isSuperUser(req)) {
      const client = await storage.getClient(req.params.id);
      if (!client) throw AppError.notFound("Client");
      workspaceId = client.workspaceId;
      await storage.deleteClient(req.params.id);
    } else {
      return sendError(res, AppError.internal("User tenant not configured"), req);
    }

    emitClientDeleted(req.params.id, workspaceId);

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/clients/:id", req);
  }
});

// =============================================================================
// CLIENT CONTACT ROUTES
// =============================================================================

router.get("/clients/:clientId/contacts", async (req, res) => {
  try {
    const contacts = await storage.getContactsByClient(req.params.clientId);
    res.json(contacts);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/contacts", req);
  }
});

router.post("/clients/:clientId/contacts", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");

    const data = insertClientContactSchema.parse({
      ...req.body,
      clientId: req.params.clientId,
      workspaceId: client.workspaceId,
    });
    const contact = await storage.createClientContact(data);

    emitClientContactCreated(
      {
        id: contact.id,
        clientId: contact.clientId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        isPrimary: contact.isPrimary ?? false,
        createdAt: contact.createdAt!,
      },
      contact.clientId,
      client.workspaceId,
    );

    res.status(201).json(contact);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients/:clientId/contacts", req);
  }
});

router.patch("/clients/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");

    const contact = await storage.updateClientContact(
      req.params.contactId,
      req.body,
    );
    if (!contact) throw AppError.notFound("Contact");

    emitClientContactUpdated(
      contact.id,
      contact.clientId,
      client.workspaceId,
      req.body,
    );

    res.json(contact);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/clients/:clientId/contacts/:contactId", req);
  }
});

router.delete("/clients/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");

    await storage.deleteClientContact(req.params.contactId);

    emitClientContactDeleted(
      req.params.contactId,
      req.params.clientId,
      client.workspaceId,
    );

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/clients/:clientId/contacts/:contactId", req);
  }
});

// =============================================================================
// CLIENT INVITE ROUTES
// =============================================================================

router.get("/clients/:clientId/invites", async (req, res) => {
  try {
    const invites = await storage.getInvitesByClient(req.params.clientId);
    res.json(invites);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/invites", req);
  }
});

router.post("/clients/:clientId/invites", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");

    const contact = await storage.getClientContact(req.body.contactId);
    if (!contact || contact.clientId !== req.params.clientId) throw AppError.notFound("Contact");

    const data = insertClientInviteSchema.parse({
      ...req.body,
      clientId: req.params.clientId,
      email: contact.email,
      status: "pending",
    });
    const invite = await storage.createClientInvite(data);

    emitClientInviteSent(
      {
        id: invite.id,
        clientId: invite.clientId,
        contactId: invite.contactId,
        email: invite.email,
        status: invite.status,
        createdAt: invite.createdAt!,
      },
      invite.clientId,
      client.workspaceId,
    );

    res.status(201).json(invite);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients/:clientId/invites", req);
  }
});

router.delete("/clients/:clientId/invites/:inviteId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) throw AppError.notFound("Client");

    await storage.deleteClientInvite(req.params.inviteId);

    emitClientInviteRevoked(
      req.params.inviteId,
      req.params.clientId,
      client.workspaceId,
    );

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/clients/:clientId/invites/:inviteId", req);
  }
});

// =============================================================================
// PROJECTS BY CLIENT
// =============================================================================

router.get("/clients/:clientId/projects", async (req, res) => {
  try {
    const projects = await storage.getProjectsByClient(req.params.clientId);
    res.json(projects);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/projects", req);
  }
});

router.post("/clients/:clientId/projects", async (req, res) => {
  try {
    const { clientId } = req.params;

    const client = await storage.getClient(clientId);
    if (!client) throw AppError.notFound("Client");

    const data = insertProjectSchema.parse({
      ...req.body,
      workspaceId: getCurrentWorkspaceId(req),
      createdBy: getCurrentUserId(req),
      clientId: clientId,
    });

    const project = await storage.createProject(data);

    emitProjectCreated(project as any);
    emitProjectClientAssigned(project as any, null);

    res.status(201).json(project);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients/:clientId/projects", req);
  }
});

// =============================================================================
// CLIENT DIVISIONS
// =============================================================================

router.get("/v1/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canSeeAll = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    let divisions = await storage.getClientDivisionsByClient(clientId, tenantId);
    
    if (!canSeeAll) {
      const userDivisions = await storage.getUserDivisions(userId, tenantId);
      const userDivisionIds = new Set(userDivisions.map(d => d.id));
      divisions = divisions.filter(d => userDivisionIds.has(d.id));
    }
    
    const divisionsWithCounts = await Promise.all(divisions.map(async (division) => {
      const members = await storage.getDivisionMembers(division.id);
      return {
        ...division,
        memberCount: members.length,
        projectCount: 0,
      };
    }));
    
    res.json(divisionsWithCounts);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/clients/:clientId/divisions", req);
  }
});

router.post("/v1/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canCreate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canCreate) throw AppError.forbidden("You do not have permission to create divisions");
    
    const data = insertClientDivisionSchema.parse({
      ...req.body,
      clientId,
      tenantId,
    });
    
    const division = await storage.createClientDivision(data);
    res.status(201).json(division);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/clients/:clientId/divisions", req);
  }
});

router.patch("/v1/divisions/:divisionId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { divisionId } = req.params;
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canUpdate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canUpdate) throw AppError.forbidden("You do not have permission to update divisions");
    
    const updateSchema = insertClientDivisionSchema.partial().omit({ 
      tenantId: true, 
      clientId: true 
    });
    const data = updateSchema.parse(req.body);
    
    const division = await storage.updateClientDivision(divisionId, tenantId, data);
    if (!division) throw AppError.notFound("Division");
    
    res.json(division);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/v1/divisions/:divisionId", req);
  }
});

router.get("/v1/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { divisionId } = req.params;
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) throw AppError.notFound("Division");
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      const isMember = await storage.isDivisionMember(divisionId, userId);
      if (!isMember) throw AppError.forbidden("You do not have access to this division");
    }
    
    const members = await storage.getDivisionMembers(divisionId);
    res.json({ members });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/divisions/:divisionId/members", req);
  }
});

router.post("/v1/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { divisionId } = req.params;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) throw AppError.badRequest("userIds must be an array");
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canManage) throw AppError.forbidden("You do not have permission to manage division members");
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) throw AppError.notFound("Division");
    
    for (const uid of userIds) {
      const userToAdd = await storage.getUser(uid);
      if (!userToAdd || userToAdd.tenantId !== tenantId) throw AppError.badRequest(`User ${uid} does not belong to this tenant`);
    }
    
    await storage.setDivisionMembers(divisionId, tenantId, userIds);
    const members = await storage.getDivisionMembers(divisionId);
    
    res.json({ success: true, members });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/divisions/:divisionId/members", req);
  }
});

router.delete("/v1/divisions/:divisionId/members/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");
    
    const { divisionId, userId: targetUserId } = req.params;
    
    const currentUserId = getCurrentUserId(req);
    const user = await storage.getUser(currentUserId);
    const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
    
    if (!canManage) throw AppError.forbidden("You do not have permission to remove division members");
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) throw AppError.notFound("Division");
    
    await storage.removeDivisionMember(divisionId, targetUserId);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/divisions/:divisionId/members/:userId", req);
  }
});

// =============================================================================
// CLIENT NOTES
// =============================================================================

const createClientNoteSchema = z.object({
  body: z.any(),
  category: z.string().default("general"),
  categoryId: z.string().uuid().optional(),
});

const updateClientNoteSchema = z.object({
  body: z.any().optional(),
  category: z.string().optional(),
  categoryId: z.string().uuid().optional().nullable(),
});

router.get("/clients/:clientId/notes", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const notes = await db.select({
      id: clientNotes.id,
      clientId: clientNotes.clientId,
      authorUserId: clientNotes.authorUserId,
      lastEditedByUserId: clientNotes.lastEditedByUserId,
      body: clientNotes.body,
      category: clientNotes.category,
      categoryId: clientNotes.categoryId,
      createdAt: clientNotes.createdAt,
      updatedAt: clientNotes.updatedAt,
    })
      .from(clientNotes)
      .where(and(eq(clientNotes.clientId, clientId), eq(clientNotes.tenantId, tenantId)))
      .orderBy(desc(clientNotes.createdAt));

    const noteIds = notes.map(n => n.id);
    let versionCounts: Map<string, number> = new Map();
    if (noteIds.length > 0) {
      const versionCountResults = await db.select({
        noteId: clientNoteVersions.noteId,
        count: count(),
      })
        .from(clientNoteVersions)
        .where(inArray(clientNoteVersions.noteId, noteIds))
        .groupBy(clientNoteVersions.noteId);
      
      versionCountResults.forEach(v => versionCounts.set(v.noteId, v.count));
    }

    const userIds = Array.from(new Set(notes.map(n => n.authorUserId)));
    const authorUsers = userIds.length > 0
      ? await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
    const authorMap = new Map(authorUsers.map(u => [u.id, u]));

    const enrichedNotes = notes.map(note => ({
      ...note,
      author: authorMap.get(note.authorUserId) || { firstName: null, lastName: null, email: null },
      versionCount: versionCounts.get(note.id) || 0,
    }));

    res.json({ ok: true, notes: enrichedNotes });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/notes", req);
  }
});

router.post("/clients/:clientId/notes", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId } = req.params;
    const data = createClientNoteSchema.parse(req.body);
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const userId = getCurrentUserId(req);
    
    const [note] = await db.insert(clientNotes).values({
      tenantId,
      clientId,
      authorUserId: userId,
      body: data.body,
      category: data.category,
      categoryId: data.categoryId || null,
    }).returning();

    const author = await storage.getUser(userId);

    res.status(201).json({
      ok: true,
      note: {
        ...note,
        author: {
          firstName: author?.firstName || null,
          lastName: author?.lastName || null,
          email: author?.email || null,
        },
        versionCount: 0,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients/:clientId/notes", req);
  }
});

router.put("/clients/:clientId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId, noteId } = req.params;
    const data = updateClientNoteSchema.parse(req.body);
    const editorUserId = getCurrentUserId(req);

    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const [existingNote] = await db.select().from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));
    
    if (!existingNote) throw AppError.notFound("Note");

    const [latestVersion] = await db.select({ 
      maxVersion: sql<number>`COALESCE(MAX(${clientNoteVersions.versionNumber}), 0)` 
    })
      .from(clientNoteVersions)
      .where(eq(clientNoteVersions.noteId, noteId));
    
    const nextVersionNumber = (latestVersion?.maxVersion || 0) + 1;

    await db.insert(clientNoteVersions).values({
      noteId: noteId,
      tenantId: tenantId,
      editorUserId: existingNote.lastEditedByUserId || existingNote.authorUserId,
      body: existingNote.body,
      category: existingNote.category,
      categoryId: existingNote.categoryId,
      versionNumber: nextVersionNumber,
    });

    const [updated] = await db.update(clientNotes)
      .set({
        body: data.body ?? existingNote.body,
        category: data.category ?? existingNote.category,
        categoryId: data.categoryId ?? existingNote.categoryId,
        lastEditedByUserId: editorUserId,
        updatedAt: new Date(),
      })
      .where(eq(clientNotes.id, noteId))
      .returning();

    res.json({ ok: true, note: updated });
  } catch (error) {
    return handleRouteError(res, error, "PUT /api/clients/:clientId/notes/:noteId", req);
  }
});

router.get("/clients/:clientId/notes/:noteId/versions", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId, noteId } = req.params;

    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const [existingNote] = await db.select().from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));
    
    if (!existingNote) throw AppError.notFound("Note");

    const versions = await db.select({
      id: clientNoteVersions.id,
      noteId: clientNoteVersions.noteId,
      editorUserId: clientNoteVersions.editorUserId,
      body: clientNoteVersions.body,
      category: clientNoteVersions.category,
      versionNumber: clientNoteVersions.versionNumber,
      createdAt: clientNoteVersions.createdAt,
    })
      .from(clientNoteVersions)
      .where(eq(clientNoteVersions.noteId, noteId))
      .orderBy(desc(clientNoteVersions.versionNumber));

    const editorIds = [...new Set(versions.map(v => v.editorUserId))];
    let editorMap: Record<string, { id: string; firstName: string | null; lastName: string | null; email: string }> = {};
    
    if (editorIds.length > 0) {
      const editors = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      })
        .from(users)
        .where(inArray(users.id, editorIds));
      
      editors.forEach(e => {
        editorMap[e.id] = e;
      });
    }

    const enrichedVersions = versions.map(v => ({
      ...v,
      editor: editorMap[v.editorUserId] || { id: v.editorUserId, firstName: null, lastName: null, email: "" },
    }));

    res.json({
      currentNote: existingNote,
      versions: enrichedVersions,
      totalVersions: versions.length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/notes/:noteId/versions", req);
  }
});

router.delete("/clients/:clientId/notes/:noteId", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId, noteId } = req.params;

    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const [existingNote] = await db.select().from(clientNotes)
      .where(and(
        eq(clientNotes.id, noteId),
        eq(clientNotes.clientId, clientId),
        eq(clientNotes.tenantId, tenantId)
      ));
    
    if (!existingNote) throw AppError.notFound("Note");

    await db.delete(clientNotes).where(eq(clientNotes.id, noteId));

    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/clients/:clientId/notes/:noteId", req);
  }
});

// =============================================================================
// CLIENT NOTE CATEGORIES
// =============================================================================

router.get("/clients/:clientId/note-categories", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) throw AppError.notFound("Client");

    const categories = await db.select()
      .from(clientNoteCategories)
      .where(eq(clientNoteCategories.tenantId, tenantId))
      .orderBy(clientNoteCategories.name);

    res.json({ ok: true, categories });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/clients/:clientId/note-categories", req);
  }
});

router.post("/clients/:clientId/note-categories", requireAuth, async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) throw AppError.forbidden("Tenant context required");

    const { name, color } = req.body;
    if (!name || typeof name !== "string") throw AppError.badRequest("Name is required");

    const [category] = await db.insert(clientNoteCategories).values({
      tenantId,
      name,
      color: color || null,
      isSystem: false,
    }).returning();

    res.status(201).json({ ok: true, category });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/clients/:clientId/note-categories", req);
  }
});

export default router;
