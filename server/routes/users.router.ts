import { Router, Request, Response, RequestHandler } from "express";
import crypto from "crypto";
import { z } from "zod";
import multer from "multer";
import { storage } from "../storage";
import { db } from "../db";
import { eq, and, isNull, sql } from "drizzle-orm";
import { handleRouteError } from "../lib/errors";
import { requireAuth } from "../auth";
import { userCreateRateLimiter, inviteCreateRateLimiter } from "../middleware/rateLimit";
import { getCurrentUserId, getCurrentWorkspaceId } from "./helpers";
import { deleteFromStorageByUrl } from "../services/uploads/s3UploadService";
import {
  isS3Configured,
  validateAvatar,
  generateAvatarKey,
  uploadToS3,
} from "../s3";
import {
  tenantAgreements,
  tenantAgreementAcceptances,
  AgreementStatus,
} from "@shared/schema";

const router = Router();

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

const requireAdmin: RequestHandler = (req, res, next) => {
  const user = req.user as Express.User | undefined;
  if (!user || (user.role !== "admin" && user.role !== "super_user")) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

// ============================================
// USER MANAGEMENT ENDPOINTS (Admin Only)
// ============================================

router.get("/users", async (req, res) => {
  try {
    const users = await storage.getUsersByWorkspace(
      getCurrentWorkspaceId(req),
    );
    res.json(users);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/users", req);
  }
});

router.get("/tenant/users", async (req, res) => {
  try {
    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const tenantUsers = await storage.getUsersByTenant(tenantId);
    const activeUsers = tenantUsers.filter(u =>
      u.isActive !== false &&
      u.role !== "client_viewer" &&
      u.role !== "client_collaborator"
    );
    res.json(activeUsers);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/tenant/users", req);
  }
});

router.post("/users", userCreateRateLimiter, requireAdmin, async (req, res) => {
  try {
    const { firstName, lastName, email, role, teamIds, clientIds } = req.body;

    if (!firstName || !lastName || !email) {
      return res
        .status(400)
        .json({ error: "First name, last name, and email are required" });
    }

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res
        .status(400)
        .json({ error: "User with this email already exists" });
    }

    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      console.error("[routes] User creation failed - no tenant context", {
        userId: currentUser?.id,
        email: currentUser?.email,
        role: currentUser?.role,
      });
      return res.status(400).json({ error: "Tenant context required to create users" });
    }

    const user = await storage.createUserWithTenant({
      email,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      role: role || "employee",
      isActive: true,
      passwordHash: null,
      tenantId,
    });

    await storage.addWorkspaceMember({
      workspaceId: getCurrentWorkspaceId(req),
      userId: user.id,
      role: role === "admin" ? "admin" : "member",
      status: "active",
    });

    if (teamIds && Array.isArray(teamIds)) {
      for (const teamId of teamIds) {
        await storage.addTeamMember({ teamId, userId: user.id });
      }
    }

    if (role === "client" && clientIds && Array.isArray(clientIds)) {
      for (const clientId of clientIds) {
        await storage.addClientUserAccess({
          workspaceId: getCurrentWorkspaceId(req),
          clientId,
          userId: user.id,
          accessLevel: "viewer",
        });
      }
    }

    res.status(201).json(user);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/users", req);
  }
});

// =============================================================================
// USER PROFILE ENDPOINTS
// =============================================================================

const updateProfileSchema = z.object({
  firstName: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  name: z.string().max(200).optional(),
  avatarUrl: z.string().url().nullable().optional(),
}).strict();

router.patch("/users/me", requireAuth, async (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    const user = req.user as any;

    const parseResult = updateProfileSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Invalid input", details: parseResult.error.issues });
    }

    const { firstName, lastName, name, avatarUrl } = parseResult.data;

    const updates: Record<string, any> = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;

    if (firstName && lastName && !name) {
      updates.name = `${firstName} ${lastName}`;
    } else if (name !== undefined) {
      updates.name = name;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update" });
    }

    if (avatarUrl !== undefined && user.avatarUrl && user.avatarUrl !== avatarUrl) {
      const tenantId = req.tenant?.effectiveTenantId || user?.tenantId || null;
      console.log("[profile-update] Deleting old avatar:", user.avatarUrl);
      deleteFromStorageByUrl(user.avatarUrl, tenantId).catch(err => {
        console.error("[profile-update] Failed to delete old avatar:", err);
      });
    }

    const updatedUser = await storage.updateUser(user.id, updates);

    if (updates.avatarUrl !== undefined) {
      console.log("[profile-update] User ID:", user.id);
      console.log("[profile-update] New avatarUrl:", updates.avatarUrl);
      console.log("[profile-update] Updated user avatarUrl:", updatedUser?.avatarUrl);
      console.log("[profile-update] Session ID:", req.sessionID);
    }

    if (req.user) {
      Object.assign(req.user, updatedUser);
      if (updates.avatarUrl !== undefined) {
        console.log("[profile-update] req.user.avatarUrl after Object.assign:", (req.user as any).avatarUrl);
      }
    }

    res.json({ user: updatedUser });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/users/me", req);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

router.post("/users/me/change-password", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || user?.tenantId;

    const parseResult = changePasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation error", details: parseResult.error.issues });
    }

    const { currentPassword, newPassword } = parseResult.data;

    let fullUser;
    if (tenantId) {
      fullUser = await storage.getUserByIdAndTenant(user.id, tenantId);
    } else {
      fullUser = await storage.getUser(user.id);
    }

    if (!fullUser || !fullUser.passwordHash) {
      return res.status(400).json({ error: "Cannot verify current password" });
    }

    const { comparePasswords, hashPassword } = await import("../auth");
    const isValid = await comparePasswords(currentPassword, fullUser.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const passwordHash = await hashPassword(newPassword);

    await storage.updateUser(user.id, { passwordHash });

    console.log(`[routes] User ${user.email} changed their own password`);

    await storage.invalidateUserSessions(user.id, req.sessionID);

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/users/me/change-password", req);
  }
});

router.get("/users/me/ui-preferences", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const prefs = await storage.getUserUiPreferences(user.id);
    res.json({
      themeMode: prefs?.themeMode ?? null,
      themeAccent: prefs?.themeAccent ?? null,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/users/me/ui-preferences", req);
  }
});

const uiPreferencesSchema = z.object({
  themeMode: z.enum(["light", "dark", "system"]).nullable().optional(),
  themeAccent: z.enum(["blue", "indigo", "teal", "green", "orange", "slate"]).nullable().optional(),
});

router.patch("/users/me/ui-preferences", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || user?.tenantId || null;

    const parseResult = uiPreferencesSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation error", details: parseResult.error.issues });
    }

    const prefs = await storage.upsertUserUiPreferences(user.id, tenantId, parseResult.data);
    res.json({
      themeMode: prefs.themeMode,
      themeAccent: prefs.themeAccent,
    });
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/users/me/ui-preferences", req);
  }
});

router.patch("/users/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required to update users" });
    }

    const targetUser = await storage.getUserByIdAndTenant(id, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const user = await storage.updateUser(id, updates);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    return handleRouteError(res, error, "PATCH /api/users/:id", req);
  }
});

// ============================================
// TENANT ADMIN USER MANAGEMENT ENDPOINTS
// ============================================

const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  mustChangeOnNextLogin: z.boolean().optional().default(true),
});

router.post("/users/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const parseResult = resetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: "Validation error", details: parseResult.error.issues });
    }

    const { password, mustChangeOnNextLogin } = parseResult.data;

    const targetUser = await storage.getUserByIdAndTenant(id, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const { hashPassword } = await import("../auth");
    const passwordHash = await hashPassword(password);

    const updatedUser = await storage.setUserPasswordWithMustChange(id, tenantId, passwordHash, mustChangeOnNextLogin);

    if (!updatedUser) {
      return res.status(500).json({ error: "Failed to update password" });
    }

    await storage.invalidateUserSessions(id);

    console.log(`[routes] Tenant admin ${currentUser.email} reset password for user ${targetUser.email}`);

    res.json({
      message: "Password reset successfully. User will need to log in again.",
      mustChangeOnNextLogin,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/users/:id/reset-password", req);
  }
});

router.post("/users/:id/activate", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const targetUser = await storage.getUserByIdAndTenant(id, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const updatedUser = await storage.updateUser(id, { isActive: true });

    console.log(`[routes] Tenant admin ${currentUser.email} activated user ${targetUser.email}`);

    res.json({ message: "User activated successfully", user: updatedUser });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/users/:id/activate", req);
  }
});

router.post("/users/:id/deactivate", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const currentUser = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    if (id === currentUser.id) {
      return res.status(400).json({ error: "You cannot deactivate your own account" });
    }

    const targetUser = await storage.getUserByIdAndTenant(id, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in your organization" });
    }

    const updatedUser = await storage.updateUser(id, { isActive: false });

    try {
      await db.execute(
        sql`DELETE FROM user_sessions WHERE sess::text LIKE ${'%"passport":{"user":"' + id + '"%'}`
      );
    } catch (sessionError) {
      console.warn("Could not invalidate user sessions:", sessionError);
    }

    console.log(`[routes] Tenant admin ${currentUser.email} deactivated user ${targetUser.email}`);

    res.json({ message: "User deactivated successfully", user: updatedUser });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/users/:id/deactivate", req);
  }
});

// ============================================
// INVITATION ENDPOINTS
// ============================================

router.get("/invitations", requireAdmin, async (req, res) => {
  try {
    const invitations = await storage.getInvitationsByWorkspace(
      getCurrentWorkspaceId(req),
    );
    res.json(invitations);
  } catch (error) {
    return handleRouteError(res, error, "GET /api/invitations", req);
  }
});

router.post("/invitations", inviteCreateRateLimiter, requireAdmin, async (req, res) => {
  try {
    const { email, role, expiresInDays } = req.body;
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

    const invitation = await storage.createInvitation({
      email,
      role: (role || "employee") as "admin" | "employee" | "client",
      tokenHash: token,
      expiresAt,
      workspaceId: getCurrentWorkspaceId(req),
      createdByUserId: getCurrentUserId(req),
      status: "pending",
    });

    res.status(201).json(invitation);
  } catch (error) {
    return handleRouteError(res, error, "POST /api/invitations", req);
  }
});

router.delete("/invitations/:id", requireAdmin, async (req, res) => {
  try {
    await storage.deleteInvitation(req.params.id);
    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/invitations/:id", req);
  }
});

router.post("/invitations/for-user", requireAdmin, async (req, res) => {
  try {
    const { userId, expiresInDays, sendEmail } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

    const invitation = await storage.createInvitation({
      email: user.email,
      role: (user.role || "employee") as "admin" | "employee" | "client",
      tokenHash: token,
      expiresAt,
      workspaceId: getCurrentWorkspaceId(req),
      createdByUserId: getCurrentUserId(req),
      status: "pending",
    });

    const inviteLink = `${req.protocol}://${req.get("host")}/accept-invite/${token}`;

    res.status(201).json({
      ...invitation,
      inviteLink,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/invitations/for-user", req);
  }
});

// ============================================
// MAILGUN SETTINGS ENDPOINTS
// ============================================

router.get("/settings/mailgun", requireAdmin, async (req, res) => {
  const workspaceId = getCurrentWorkspaceId(req);
  const userId = getCurrentUserId(req);
  console.log(`[mailgun] GET route hit - userId=${userId} workspaceId=${workspaceId}`);

  try {
    const settings = await storage.getAppSettings(workspaceId, "mailgun");

    if (!settings) {
      console.log(`[mailgun] GET - no settings found for workspaceId=${workspaceId}`);
      return res.json({
        configured: false,
        domain: "",
        fromEmail: "",
        replyTo: "",
        apiKeyConfigured: false,
      });
    }

    const hasApiKey = !!settings.apiKey;
    console.log(`[mailgun] GET - found settings, apiKeyConfigured=${hasApiKey}`);

    res.json({
      configured: hasApiKey,
      domain: settings.domain || "",
      fromEmail: settings.fromEmail || "",
      replyTo: settings.replyTo || "",
      apiKeyConfigured: hasApiKey,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Encryption key")) {
      return res.status(500).json({
        error: {
          code: "ENCRYPTION_KEY_MISSING",
          message: "Encryption key not configured. Please contact administrator."
        }
      });
    }
    return handleRouteError(res, error, "GET /api/settings/mailgun", req);
  }
});

router.put("/settings/mailgun", requireAdmin, async (req, res) => {
  const workspaceId = getCurrentWorkspaceId(req);
  const userId = getCurrentUserId(req);
  console.log(`[mailgun] PUT route hit - userId=${userId} workspaceId=${workspaceId}`);

  try {
    const { domain, apiKey, fromEmail, replyTo } = req.body;

    console.log(`[mailgun] PUT - domain=${!!domain} apiKey=${!!apiKey} fromEmail=${!!fromEmail} replyTo=${!!replyTo}`);

    const existing = await storage.getAppSettings(workspaceId, "mailgun");

    const settingsData: any = {
      domain: domain || existing?.domain || "",
      fromEmail: fromEmail || existing?.fromEmail || "",
      replyTo: replyTo || existing?.replyTo || "",
    };

    if (apiKey) {
      settingsData.apiKey = apiKey;
      console.log(`[mailgun] PUT - new API key provided`);
    } else if (existing?.apiKey) {
      settingsData.apiKey = existing.apiKey;
      console.log(`[mailgun] PUT - preserving existing API key`);
    }

    await storage.setAppSettings(workspaceId, "mailgun", settingsData, userId);

    const hasApiKey = !!settingsData.apiKey;
    console.log(`[mailgun] PUT - save complete, configured=${hasApiKey}`);

    res.json({
      success: true,
      configured: hasApiKey,
      domain: settingsData.domain,
      fromEmail: settingsData.fromEmail,
      replyTo: settingsData.replyTo,
      apiKeyConfigured: hasApiKey,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Encryption key")) {
      return res.status(500).json({
        error: {
          code: "ENCRYPTION_KEY_MISSING",
          message: "Encryption key not configured. Please contact administrator."
        }
      });
    }
    return handleRouteError(res, error, "PUT /api/settings/mailgun", req);
  }
});

router.post("/settings/mailgun/test", requireAdmin, async (req, res) => {
  const workspaceId = getCurrentWorkspaceId(req);
  console.log(`[mailgun] TEST route hit - workspaceId=${workspaceId}`);

  try {
    const settings = await storage.getAppSettings(workspaceId, "mailgun");

    if (!settings?.apiKey) {
      console.log(`[mailgun] TEST - no API key configured`);
      return res.status(400).json({ error: "Mailgun not configured" });
    }

    console.log(`[mailgun] TEST - sending test email to domain=${settings.domain}`);
    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/settings/mailgun/test", req);
  }
});

// =============================================================================
// USER AVATAR ENDPOINTS
// =============================================================================

router.post("/v1/me/avatar", requireAuth, avatarUpload.single("file"), async (req, res) => {
  try {
    const user = req.user as any;

    if (!isS3Configured()) {
      return res.status(503).json({ error: "S3 storage is not configured" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const mimeType = req.file.mimetype;
    const validation = validateAvatar(mimeType, req.file.size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const storageKey = generateAvatarKey(user.tenantId || null, user.id, req.file.originalname);
    const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

    await storage.updateUser(user.id, { avatarUrl: url });

    res.json({ url });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/me/avatar", req);
  }
});

router.delete("/v1/me/avatar", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;

    await storage.updateUser(user.id, { avatarUrl: null });

    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /api/v1/me/avatar", req);
  }
});

// =============================================================================
// AGREEMENT ACCEPTANCE ENDPOINTS
// =============================================================================

router.get("/v1/me/agreement/status", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    if (!tenantId) {
      return res.json({
        tenantId: null,
        requiresAcceptance: false,
        activeAgreement: null,
        accepted: true,
        acceptedAt: null,
      });
    }

    let activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    if (activeAgreements.length === 0) {
      activeAgreements = await db.select()
        .from(tenantAgreements)
        .where(and(
          isNull(tenantAgreements.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ))
        .limit(1);
    }

    if (activeAgreements.length === 0) {
      return res.json({
        tenantId,
        requiresAcceptance: false,
        activeAgreement: null,
        accepted: true,
        acceptedAt: null,
      });
    }

    const activeAgreement = activeAgreements[0];

    const acceptances = await db.select()
      .from(tenantAgreementAcceptances)
      .where(and(
        eq(tenantAgreementAcceptances.tenantId, tenantId),
        eq(tenantAgreementAcceptances.userId, user.id),
        eq(tenantAgreementAcceptances.agreementId, activeAgreement.id),
        eq(tenantAgreementAcceptances.version, activeAgreement.version)
      ))
      .limit(1);

    const hasAccepted = acceptances.length > 0;

    res.json({
      tenantId,
      requiresAcceptance: !hasAccepted,
      activeAgreement: {
        id: activeAgreement.id,
        title: activeAgreement.title,
        body: activeAgreement.body,
        version: activeAgreement.version,
        effectiveAt: activeAgreement.effectiveAt,
      },
      accepted: hasAccepted,
      acceptedAt: hasAccepted ? acceptances[0].acceptedAt : null,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /api/v1/me/agreement/status", req);
  }
});

router.post("/v1/me/agreement/accept", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    if (!tenantId) {
      return res.status(400).json({ error: "No tenant context" });
    }

    const { agreementId, version } = req.body;

    if (!agreementId || typeof version !== "number") {
      return res.status(400).json({ error: "agreementId and version are required" });
    }

    let activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.id, agreementId),
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    if (activeAgreements.length === 0) {
      activeAgreements = await db.select()
        .from(tenantAgreements)
        .where(and(
          eq(tenantAgreements.id, agreementId),
          isNull(tenantAgreements.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ))
        .limit(1);
    }

    if (activeAgreements.length === 0) {
      return res.status(404).json({
        error: "Agreement not found or not active",
        code: "AGREEMENT_NOT_FOUND"
      });
    }

    const activeAgreement = activeAgreements[0];

    if (activeAgreement.version !== version) {
      return res.status(409).json({
        error: "Agreement version mismatch. Please refresh and review the latest version.",
        code: "VERSION_MISMATCH",
        currentVersion: activeAgreement.version,
      });
    }

    const existingAcceptances = await db.select()
      .from(tenantAgreementAcceptances)
      .where(and(
        eq(tenantAgreementAcceptances.tenantId, tenantId),
        eq(tenantAgreementAcceptances.userId, user.id),
        eq(tenantAgreementAcceptances.agreementId, agreementId),
        eq(tenantAgreementAcceptances.version, version)
      ))
      .limit(1);

    if (existingAcceptances.length > 0) {
      return res.json({ ok: true, message: "Already accepted" });
    }

    const ipAddress = req.headers["x-forwarded-for"]?.toString().split(",")[0]
      || req.socket.remoteAddress
      || null;
    const userAgent = req.headers["user-agent"] || null;

    await db.insert(tenantAgreementAcceptances).values({
      tenantId,
      agreementId,
      userId: user.id,
      version,
      ipAddress,
      userAgent,
    });

    res.json({ ok: true });
  } catch (error) {
    return handleRouteError(res, error, "POST /api/v1/me/agreement/accept", req);
  }
});

export default router;
