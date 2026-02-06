import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole, ClientAccessLevel } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import { hashPassword } from "../../auth";
import { handleRouteError } from "../../lib/errors";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function isClientUser(req: Request): boolean {
  return req.user?.role === UserRole.CLIENT;
}

function isTenantAdmin(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN;
}

const router = Router();

// Generate secure invite token
function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

// Hash token for storage (for security, don't store raw token)
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// =============================================================================
// CLIENT USER MANAGEMENT ROUTES (for tenant admins/employees)
// =============================================================================

// Get all client users for a specific client
router.get("/:clientId/users", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    
    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
    }
    
    const clientUsers = await storage.getClientUsers(clientId);
    res.json(clientUsers);
  } catch (error) {
    return handleRouteError(res, error, "GET /:clientId/users", req);
  }
});

// Invite a contact to become a client portal user
router.post("/:clientId/users/invite", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId } = req.params;
    const { contactId, accessLevel = ClientAccessLevel.VIEWER } = req.body;
    
    // Validate request
    if (!contactId) {
      return res.status(400).json({ error: "Contact ID is required" });
    }
    
    // Verify client belongs to tenant
    const client = tenantId 
      ? await storage.getClientByIdAndTenant(clientId, tenantId)
      : await storage.getClient(clientId);
    
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    // Get the contact
    const contact = await storage.getClientContact(contactId);
    if (!contact || contact.clientId !== clientId) {
      return res.status(404).json({ error: "Contact not found" });
    }
    
    if (!contact.email) {
      return res.status(400).json({ error: "Contact must have an email address" });
    }
    
    // Check if user already exists with this email
    let existingUser = await storage.getUserByEmail(contact.email);
    
    if (existingUser) {
      // Check if already has access to this client
      const existingAccess = await storage.getClientUserAccessByUserAndClient(
        existingUser.id, 
        clientId
      );
      
      if (existingAccess) {
        return res.status(409).json({ error: "User already has access to this client" });
      }
      
      // Grant access to existing user
      const access = await storage.addClientUserAccess({
        workspaceId: client.workspaceId,
        clientId,
        userId: existingUser.id,
        accessLevel,
      });
      
      return res.status(201).json({
        message: "Access granted to existing user",
        access,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          name: existingUser.name,
        },
      });
    }
    
    // Generate invite token for new user
    const token = generateInviteToken();
    const tokenHash = hashToken(token);
    
    // Update or create client invite with real token
    const invite = await storage.createClientInvite({
      clientId,
      contactId,
      email: contact.email,
      status: "pending",
      tokenPlaceholder: tokenHash,
    });
    
    // Store additional invite metadata for user creation
    await storage.updateClientInvite(invite.id, {
      roleHint: accessLevel,
    });
    
    // Return the invite with token (only time raw token is exposed)
    res.status(201).json({
      message: "Invitation created",
      invite: {
        id: invite.id,
        email: invite.email,
        status: invite.status,
        createdAt: invite.createdAt,
      },
      registrationUrl: `/client-portal/register?token=${token}&invite=${invite.id}`,
      token, // Include token for sending via email
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /:clientId/users/invite", req);
  }
});

// Update client user access level
router.patch("/:clientId/users/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;
    const { accessLevel } = req.body;
    
    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
    }
    
    const access = await storage.updateClientUserAccess(clientId, userId, { accessLevel });
    if (!access) {
      return res.status(404).json({ error: "Client user access not found" });
    }
    
    res.json(access);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /:clientId/users/:userId", req);
  }
});

// Remove client user access
router.delete("/:clientId/users/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const { clientId, userId } = req.params;
    
    // Verify client belongs to tenant
    if (tenantId) {
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
    }
    
    await storage.deleteClientUserAccess(clientId, userId);
    res.status(204).send();
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:clientId/users/:userId", req);
  }
});

// =============================================================================
// CLIENT PORTAL REGISTRATION (public endpoints for invited clients)
// =============================================================================

// Validate invite token (public)
router.get("/register/validate", async (req, res) => {
  try {
    const { token, invite: inviteId } = req.query;
    
    if (!token || !inviteId) {
      return res.status(400).json({ error: "Token and invite ID are required" });
    }
    
    const tokenHash = hashToken(token as string);
    const invite = await storage.getClientInvite(inviteId as string);
    
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    if (invite.tokenPlaceholder !== tokenHash) {
      return res.status(403).json({ error: "Invalid token" });
    }
    
    if (invite.status !== "pending") {
      return res.status(410).json({ error: "Invitation is no longer valid" });
    }
    
    // Get contact info for registration form
    const contact = await storage.getClientContact(invite.contactId);
    const client = await storage.getClient(invite.clientId);
    
    res.json({
      valid: true,
      email: invite.email,
      firstName: contact?.firstName || "",
      lastName: contact?.lastName || "",
      clientName: client?.companyName || "",
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /register/validate", req);
  }
});

// Complete registration (public)
router.post("/register/complete", async (req, res) => {
  try {
    const { token, inviteId, password, firstName, lastName } = req.body;
    
    if (!token || !inviteId || !password) {
      return res.status(400).json({ error: "Token, invite ID, and password are required" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }
    
    const tokenHash = hashToken(token);
    const invite = await storage.getClientInvite(inviteId);
    
    if (!invite) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    if (invite.tokenPlaceholder !== tokenHash) {
      return res.status(403).json({ error: "Invalid token" });
    }
    
    if (invite.status !== "pending") {
      return res.status(410).json({ error: "Invitation is no longer valid" });
    }
    
    // Get client for tenant context
    const client = await storage.getClient(invite.clientId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create the client user
    const user = await storage.createUser({
      tenantId: client.tenantId,
      email: invite.email,
      name: `${firstName || ""} ${lastName || ""}`.trim() || invite.email.split("@")[0],
      firstName: firstName || null,
      lastName: lastName || null,
      passwordHash,
      role: UserRole.CLIENT,
      isActive: true,
    });
    
    // Create client user access
    const accessLevel = (invite.roleHint === "collaborator" 
      ? ClientAccessLevel.COLLABORATOR 
      : ClientAccessLevel.VIEWER) as "viewer" | "collaborator";
    
    await storage.addClientUserAccess({
      workspaceId: client.workspaceId,
      clientId: invite.clientId,
      userId: user.id,
      accessLevel,
    });
    
    // Update invite status
    await storage.updateClientInvite(invite.id, {
      status: "accepted",
    });
    
    // Update contact with linked userId (optional enhancement)
    const contact = await storage.getClientContact(invite.contactId);
    if (contact) {
      await storage.updateClientContact(contact.id, {
        notes: `Linked to user: ${user.id}`,
      });
    }
    
    res.status(201).json({
      message: "Registration complete",
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    if (error?.message?.includes("unique") || error?.code === "23505") {
      return res.status(409).json({ error: "User with this email already exists" });
    }
    return handleRouteError(res, error, "POST /register/complete", req);
  }
});

export default router;
