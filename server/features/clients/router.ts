import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import {
  insertClientSchema,
  insertClientContactSchema,
  insertClientInviteSchema,
  insertClientDivisionSchema,
} from "@shared/schema";
import {
  emitClientCreated,
  emitClientUpdated,
  emitClientDeleted,
  emitClientContactCreated,
  emitClientContactUpdated,
  emitClientContactDeleted,
  emitClientInviteSent,
  emitClientInviteRevoked,
} from "../../realtime/events";
import { UserRole } from "@shared/schema";
import type { Request } from "express";
import { handleRouteError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function getCurrentWorkspaceId(req: Request): string {
  return (req as any).workspaceId || "demo-workspace-id";
}

function isSuperUser(req: Request): boolean {
  return req.user?.role === UserRole.SUPER_USER;
}

const router = Router();

// =============================================================================
// CLIENT (CRM) ROUTES - Tenant Scoped
// =============================================================================

router.get("/", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
    if (tenantId) {
      const clients = await storage.getClientsByTenant(tenantId, workspaceId);
      return res.json(clients);
    }
    
    if (isSuperUser(req)) {
      const clients = await storage.getClientsByWorkspace(workspaceId);
      return res.json(clients);
    }
    
    return res.status(400).json({ error: "Tenant context required - user not associated with a tenant" });
  } catch (error) {
    return handleRouteError(res, error, "GET /", req);
  }
});

// Get clients with hierarchy information (depth and parent name)
router.get("/hierarchy/list", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const requestId = (req as any).requestId || "unknown";
    
    console.log(`[GET /api/v1/clients/hierarchy/list] requestId=${requestId}, tenantId=${tenantId}, userId=${req.user?.id}`);
    
    if (!tenantId) {
      console.error(`[GET /api/v1/clients/hierarchy/list] No tenant context, requestId=${requestId}, userId=${req.user?.id}`);
      return res.status(400).json({ error: "Tenant context required" });
    }
    
    const clients = await storage.getClientsByTenantWithHierarchy(tenantId);
    console.log(`[GET /api/v1/clients/hierarchy/list] Found ${clients.length} clients for tenantId=${tenantId}, requestId=${requestId}`);
    return res.json(clients);
  } catch (error) {
    return handleRouteError(res, error, "GET /hierarchy/list", req);
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      const clientWithContacts = await storage.getClientWithContacts(req.params.id);
      return res.json(clientWithContacts);
    }
    
    if (isSuperUser(req)) {
      const client = await storage.getClientWithContacts(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      return res.json(client);
    }
    
    return res.status(400).json({ error: "Tenant context required - user not associated with a tenant" });
  } catch (error) {
    return handleRouteError(res, error, "GET /:id", req);
  }
});

router.post("/", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    
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
      return res.status(400).json({ error: "Tenant context required - user not associated with a tenant" });
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

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return handleRouteError(res, error, "POST /", req);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    let client;
    if (tenantId) {
      client = await storage.updateClientWithTenant(req.params.id, tenantId, req.body);
    } else if (isSuperUser(req)) {
      client = await storage.updateClient(req.params.id, req.body);
    } else {
      return res.status(400).json({ error: "Tenant context required - user not associated with a tenant" });
    }
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    emitClientUpdated(client.id, client.workspaceId, req.body);

    res.json(client);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /:id", req);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    let workspaceId = "";
    
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      workspaceId = client.workspaceId;
      const deleted = await storage.deleteClientWithTenant(req.params.id, tenantId);
      if (!deleted) {
        return res.status(404).json({ error: "Client not found" });
      }
    } else if (isSuperUser(req)) {
      const client = await storage.getClient(req.params.id);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      workspaceId = client.workspaceId;
      await storage.deleteClient(req.params.id);
    } else {
      return res.status(400).json({ error: "Tenant context required - user not associated with a tenant" });
    }

    emitClientDeleted(req.params.id, workspaceId);

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:id", req);
  }
});

// =============================================================================
// CLIENT CONTACT ROUTES
// =============================================================================

router.get("/:clientId/contacts", async (req, res) => {
  try {
    const contacts = await storage.getContactsByClient(req.params.clientId);
    res.json(contacts);
  } catch (error) {
    return handleRouteError(res, error, "GET /:clientId/contacts", req);
  }
});

router.post("/:clientId/contacts", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return handleRouteError(res, error, "POST /:clientId/contacts", req);
  }
});

router.patch("/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const contact = await storage.updateClientContact(
      req.params.contactId,
      req.body,
    );
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    emitClientContactUpdated(
      contact.id,
      contact.clientId,
      client.workspaceId,
      req.body,
    );

    res.json(contact);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /:clientId/contacts/:contactId", req);
  }
});

router.delete("/:clientId/contacts/:contactId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    await storage.deleteClientContact(req.params.contactId);

    emitClientContactDeleted(
      req.params.contactId,
      req.params.clientId,
      client.workspaceId,
    );

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:clientId/contacts/:contactId", req);
  }
});

// =============================================================================
// CLIENT INVITE ROUTES
// =============================================================================

router.get("/:clientId/invites", async (req, res) => {
  try {
    const invites = await storage.getInvitesByClient(req.params.clientId);
    res.json(invites);
  } catch (error) {
    return handleRouteError(res, error, "GET /:clientId/invites", req);
  }
});

router.post("/:clientId/invites", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    const contact = await storage.getClientContact(req.body.contactId);
    if (!contact || contact.clientId !== req.params.clientId) {
      return res.status(404).json({ error: "Contact not found" });
    }

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
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    return handleRouteError(res, error, "POST /:clientId/invites", req);
  }
});

router.delete("/:clientId/invites/:inviteId", async (req, res) => {
  try {
    const client = await storage.getClient(req.params.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }

    await storage.deleteClientInvite(req.params.inviteId);

    emitClientInviteRevoked(
      req.params.inviteId,
      req.params.clientId,
      client.workspaceId,
    );

    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:clientId/invites/:inviteId", req);
  }
});

export default router;
