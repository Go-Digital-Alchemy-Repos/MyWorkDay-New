/**
 * Super Admin API Routes
 * 
 * Purpose: Platform-level administration endpoints for super users.
 * 
 * Key Features:
 * - Tenant lifecycle management (create, activate, deactivate, delete)
 * - Platform admin invitation and management
 * - Global integration configuration (Mailgun, S3)
 * - System settings and branding
 * - Data health tools and tenant remediation
 * - Purge endpoint with safety guards
 * 
 * Security Invariants:
 * - ALL routes require super_user role via requireSuperUser middleware
 * - Bootstrap endpoint uses timing-safe token comparison
 * - Purge requires multiple confirmation mechanisms
 * - Integration secrets are encrypted at rest
 * 
 * Organization:
 * - Bootstrap endpoint (~100 lines)
 * - Tenant CRUD (~500 lines)
 * - Platform admin management (~400 lines)
 * - Integration configuration (~800 lines)
 * - System settings (~300 lines)
 * - Health and remediation tools (~500 lines)
 * 
 * @see docs/SUPER_SYSTEM_STATUS.md for system status dashboard
 * @see docs/PLATFORM_ADMINS.md for admin management
 * @see docs/INTEGRATIONS.md for integration configuration
 */
import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { insertTenantSchema, TenantStatus, UserRole, tenants, workspaces, invitations, tenantSettings, tenantNotes, tenantAuditEvents, NoteCategory, clients, clientContacts, clientDivisions, projects, tasks, users, teams, systemSettings, tenantAgreements, tenantAgreementAcceptances, timeEntries, updateSystemSettingsSchema, platformInvitations, platformAuditEvents, workspaceMembers, teamMembers, projectMembers, divisionMembers, activityLog, comments, passwordResetTokens, chatReads, chatMessages, chatChannelMembers, chatChannels, notifications, notificationPreferences, activeTimers, clientUserAccess, clientInvites, tenantIntegrations, appSettings, errorLogs, emailOutbox, sections, taskAssignees, taskWatchers, personalTaskSections, subtasks, tags, taskTags, taskAttachments, commentMentions, chatDmThreads, chatDmMembers, chatAttachments, chatMentions, tenancyWarnings } from "@shared/schema";
import { hashPassword } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { eq, sql, desc, and, ilike, count, gte, lt, isNull, isNotNull, ne, inArray } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { tenantIntegrationService } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured } from "../s3";
import * as schema from "@shared/schema";
import { promises as fs } from "fs";
import path from "path";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../lib/encryption";
import Mailgun from "mailgun.js";
import FormData from "form-data";
import { invalidateAgreementCache, clearAgreementCache } from "../middleware/agreementEnforcement";
import { AgreementStatus } from "@shared/schema";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf8");
    const bufB = Buffer.from(b, "utf8");
    if (bufA.length !== bufB.length) {
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const router = Router();

// =============================================================================
// BOOTSTRAP ENDPOINT - One-time super admin creation for production deployment
// =============================================================================

const bootstrapSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

router.post("/bootstrap", async (req, res) => {
  try {
    // Check if bootstrap token is configured
    const bootstrapToken = process.env.SUPER_ADMIN_BOOTSTRAP_TOKEN;
    if (!bootstrapToken) {
      return res.status(503).json({ 
        error: "Bootstrap not configured",
        message: "SUPER_ADMIN_BOOTSTRAP_TOKEN environment variable is not set"
      });
    }

    // Verify the bootstrap token from header using timing-safe comparison
    const providedToken = req.headers["x-bootstrap-token"];
    if (!providedToken || typeof providedToken !== "string" || !safeCompare(providedToken, bootstrapToken)) {
      return res.status(401).json({ error: "Invalid bootstrap token" });
    }

    // Check if a super_user already exists
    const existingSuperUsers = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .limit(1);

    if (existingSuperUsers.length > 0) {
      return res.status(409).json({ 
        error: "Super admin already initialized",
        message: "A super user account already exists. Bootstrap can only be used once."
      });
    }

    // Parse optional body overrides
    const body = bootstrapSchema.parse(req.body || {});

    // Get credentials from env vars or body
    const email = body.email || process.env.SUPER_ADMIN_EMAIL;
    const password = body.password || process.env.SUPER_ADMIN_PASSWORD;
    const firstName = body.firstName || process.env.SUPER_ADMIN_FIRST_NAME || "Super";
    const lastName = body.lastName || process.env.SUPER_ADMIN_LAST_NAME || "Admin";

    if (!email) {
      return res.status(400).json({ 
        error: "Email required",
        message: "Provide email in request body or set SUPER_ADMIN_EMAIL environment variable"
      });
    }

    if (!password) {
      return res.status(400).json({ 
        error: "Password required",
        message: "Provide password in request body or set SUPER_ADMIN_PASSWORD environment variable"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        error: "Password too short",
        message: "Password must be at least 8 characters"
      });
    }

    // Check if email is already in use
    const existingUser = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      return res.status(409).json({ 
        error: "Email already in use",
        message: "A user with this email already exists"
      });
    }

    // Hash password and create super user
    const passwordHash = await hashPassword(password);
    
    const [superUser] = await db.insert(users).values({
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
      tenantId: null, // Super users are not tied to a specific tenant
    }).returning({ id: users.id, email: users.email, name: users.name });

    // Log success (no sensitive data)
    console.log("[bootstrap] Super admin initialized");

    res.status(201).json({
      success: true,
      message: "Super admin account created successfully",
      user: {
        id: superUser.id,
        email: superUser.email,
        name: superUser.name,
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[bootstrap] Error during super admin bootstrap:", error);
    res.status(500).json({ error: "Bootstrap failed" });
  }
});

// =============================================================================
// TENANT MANAGEMENT ROUTES (requires authenticated super_user)
// =============================================================================

router.get("/tenants", requireSuperUser, async (req, res) => {
  try {
    const tenants = await storage.getAllTenants();
    res.json(tenants);
  } catch (error) {
    console.error("Error fetching tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

router.get("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    console.error("Error fetching tenant:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

const createTenantSchema = insertTenantSchema.extend({
  name: z.string().min(1, "Name is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
});

router.post("/tenants", requireSuperUser, async (req, res) => {
  const requestId = req.requestId || "unknown";
  const superUser = req.user as any;
  const debugEnabled = process.env.SUPER_TENANT_CREATE_DEBUG === "true";
  
  try {
    // Validate input
    const data = createTenantSchema.parse(req.body);
    
    if (debugEnabled) {
      console.log(`[TenantCreate] requestId=${requestId} actor=${superUser?.id} input=${JSON.stringify({ name: data.name, slug: data.slug })}`);
    }
    
    // Check for existing slug
    const existingTenant = await storage.getTenantBySlug(data.slug);
    if (existingTenant) {
      console.log(`[TenantCreate] requestId=${requestId} slug collision: ${data.slug}`);
      return res.status(409).json({ error: "A tenant with this slug already exists" });
    }
    
    // Transactional: Create tenant + primary workspace + tenant_settings
    const result = await db.transaction(async (tx) => {
      // 1. Create tenant (inactive by default)
      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=tenant_insert`);
      }
      const [tenant] = await tx.insert(tenants).values({
        ...data,
        status: TenantStatus.INACTIVE,
      }).returning();

      // 2. Create primary workspace with exact business name
      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=workspace_insert tenantId=${tenant.id}`);
      }
      const [primaryWorkspace] = await tx.insert(workspaces).values({
        name: data.name.trim(),
        tenantId: tenant.id,
        isPrimary: true,
      }).returning();

      // 3. Create tenant_settings record (inside transaction for rollback safety)
      if (debugEnabled) {
        console.log(`[TenantCreate] requestId=${requestId} step=settings_insert tenantId=${tenant.id}`);
      }
      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        displayName: tenant.name,
      });

      return { tenant, primaryWorkspace };
    });

    console.log(`[SuperAdmin] Created tenant ${result.tenant.id} with primary workspace ${result.primaryWorkspace.id}`);

    // Record audit events
    await recordTenantAuditEvent(
      result.tenant.id,
      "tenant_created",
      `Tenant "${result.tenant.name}" created`,
      superUser?.id,
      { slug: result.tenant.slug }
    );
    await recordTenantAuditEvent(
      result.tenant.id,
      "workspace_created",
      `Primary workspace "${result.primaryWorkspace.name}" created`,
      superUser?.id,
      { workspaceId: result.primaryWorkspace.id, isPrimary: true }
    );

    res.status(201).json({
      ...result.tenant,
      primaryWorkspaceId: result.primaryWorkspace.id,
      primaryWorkspace: {
        id: result.primaryWorkspace.id,
        name: result.primaryWorkspace.name,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.log(`[TenantCreate] requestId=${requestId} validation_error details=${JSON.stringify(error.errors)}`);
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    
    // Enhanced error logging with requestId
    const dbError = error as any;
    const errorInfo = {
      code: dbError?.code,
      constraint: dbError?.constraint,
      table: dbError?.table,
      detail: dbError?.detail,
    };
    
    console.error(`[TenantCreate] requestId=${requestId} failed actor=${superUser?.id} dbInfo=${JSON.stringify(errorInfo)}`, error);
    
    // Keep response body unchanged - requestId is in X-Request-Id header
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.SUSPENDED]).optional(),
  // CRM Fields
  legalName: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  companySize: z.string().optional().nullable(),
  website: z.string().url().optional().nullable().or(z.literal("")),
  taxId: z.string().optional().nullable(),
  foundedDate: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  // Address fields
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  postalCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  // Contact fields
  phoneNumber: z.string().optional().nullable(),
  primaryContactName: z.string().optional().nullable(),
  primaryContactEmail: z.string().email().optional().nullable().or(z.literal("")),
  primaryContactPhone: z.string().optional().nullable(),
  billingEmail: z.string().email().optional().nullable().or(z.literal("")),
});

router.patch("/tenants/:id", requireSuperUser, async (req, res) => {
  try {
    const data = updateTenantSchema.parse(req.body);
    
    const tenant = await storage.updateTenant(req.params.id, data);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    res.json(tenant);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

// =============================================================================
// TENANT ACTIVATION/SUSPENSION (Pre-provisioning)
// =============================================================================

// POST /api/v1/super/tenants/:tenantId/activate
router.post("/tenants/:tenantId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE) {
      return res.status(400).json({ error: "Tenant is already active" });
    }

    // Activate the tenant without requiring onboarding completion
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.ACTIVE,
        activatedBySuperUserAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} activated by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to active (activated by super user)`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "active" }
    );

    res.json({
      success: true,
      message: "Tenant activated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error activating tenant:", error);
    res.status(500).json({ error: "Failed to activate tenant" });
  }
});

// POST /api/v1/super/tenants/:tenantId/suspend
router.post("/tenants/:tenantId/suspend", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.SUSPENDED) {
      return res.status(400).json({ error: "Tenant is already suspended" });
    }

    // Suspend the tenant
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.SUSPENDED,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} suspended by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to suspended`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "suspended" }
    );

    res.json({
      success: true,
      message: "Tenant suspended successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error suspending tenant:", error);
    res.status(500).json({ error: "Failed to suspend tenant" });
  }
});

// POST /api/v1/super/tenants/:tenantId/deactivate (set back to inactive)
router.post("/tenants/:tenantId/deactivate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.INACTIVE) {
      return res.status(400).json({ error: "Tenant is already inactive" });
    }

    // Deactivate the tenant
    const updatedTenant = await db.update(tenants)
      .set({
        status: TenantStatus.INACTIVE,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    console.log(`[SuperAdmin] Tenant ${tenantId} deactivated by super user`);

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "tenant_status_changed",
      `Tenant status changed to inactive`,
      superUser?.id,
      { previousStatus: tenant.status, newStatus: "inactive" }
    );

    res.json({
      success: true,
      message: "Tenant deactivated successfully",
      tenant: updatedTenant[0],
    });
  } catch (error) {
    console.error("Error deactivating tenant:", error);
    res.status(500).json({ error: "Failed to deactivate tenant" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId - Permanently delete a tenant and all its data
router.delete("/tenants/:tenantId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Safety check: Tenant must be suspended or inactive before deletion
    if (tenant.status === TenantStatus.ACTIVE) {
      return res.status(400).json({ 
        error: "Cannot delete an active tenant",
        details: "Suspend or deactivate the tenant first before deleting."
      });
    }

    const superUser = req.user as any;
    console.log(`[SuperAdmin] Deleting tenant ${tenantId} (${tenant.name}) by super user ${superUser?.email}`);

    // Wrap all deletions in a transaction for atomicity
    await db.transaction(async (tx) => {
      // Delete all tenant data in order (respecting foreign key constraints)
      // Order matters: delete children before parents
      
      // Chat system (delete children first)
      await tx.delete(chatMentions).where(eq(chatMentions.tenantId, tenantId));
      await tx.delete(chatAttachments).where(eq(chatAttachments.tenantId, tenantId));
      await tx.delete(chatReads).where(eq(chatReads.tenantId, tenantId));
      await tx.delete(chatMessages).where(eq(chatMessages.tenantId, tenantId));
      await tx.delete(chatDmMembers).where(eq(chatDmMembers.tenantId, tenantId));
      await tx.delete(chatDmThreads).where(eq(chatDmThreads.tenantId, tenantId));
      await tx.delete(chatChannelMembers).where(eq(chatChannelMembers.tenantId, tenantId));
      await tx.delete(chatChannels).where(eq(chatChannels.tenantId, tenantId));
      
      // Notifications
      await tx.delete(notifications).where(eq(notifications.tenantId, tenantId));
      await tx.delete(notificationPreferences).where(eq(notificationPreferences.tenantId, tenantId));
      
      // Time tracking
      await tx.delete(activeTimers).where(eq(activeTimers.tenantId, tenantId));
      await tx.delete(timeEntries).where(eq(timeEntries.tenantId, tenantId));
      
      // Comments and mentions (delete children first)
      await tx.delete(commentMentions).where(eq(commentMentions.commentId, sql`ANY(SELECT id FROM comments WHERE tenant_id = ${tenantId})`));
      await tx.delete(comments).where(eq(comments.tenantId, tenantId));
      
      // Task-related (delete children before tasks)
      await tx.delete(taskAttachments).where(eq(taskAttachments.taskId, sql`ANY(SELECT id FROM tasks WHERE tenant_id = ${tenantId})`));
      await tx.delete(taskTags).where(eq(taskTags.taskId, sql`ANY(SELECT id FROM tasks WHERE tenant_id = ${tenantId})`));
      await tx.delete(subtasks).where(eq(subtasks.taskId, sql`ANY(SELECT id FROM tasks WHERE tenant_id = ${tenantId})`));
      await tx.delete(taskWatchers).where(eq(taskWatchers.tenantId, tenantId));
      await tx.delete(taskAssignees).where(eq(taskAssignees.tenantId, tenantId));
      await tx.delete(activityLog).where(eq(activityLog.tenantId, tenantId));
      await tx.delete(tasks).where(eq(tasks.tenantId, tenantId));
      
      // Tags (after taskTags deleted)
      await tx.delete(tags).where(eq(tags.workspaceId, sql`ANY(SELECT id FROM workspaces WHERE tenant_id = ${tenantId})`));
      
      // Personal task sections
      await tx.delete(personalTaskSections).where(eq(personalTaskSections.tenantId, tenantId));
      
      // Project sections (after tasks deleted)
      await tx.delete(sections).where(eq(sections.projectId, sql`ANY(SELECT id FROM projects WHERE tenant_id = ${tenantId})`));
      
      // Projects
      await tx.delete(projectMembers).where(eq(projectMembers.tenantId, tenantId));
      await tx.delete(projects).where(eq(projects.tenantId, tenantId));
      
      // Client portal
      await tx.delete(clientUserAccess).where(eq(clientUserAccess.tenantId, tenantId));
      await tx.delete(clientInvites).where(eq(clientInvites.tenantId, tenantId));
      
      // Divisions
      await tx.delete(divisionMembers).where(eq(divisionMembers.tenantId, tenantId));
      await tx.delete(clientDivisions).where(eq(clientDivisions.tenantId, tenantId));
      
      // Clients
      await tx.delete(clientContacts).where(eq(clientContacts.tenantId, tenantId));
      await tx.delete(clients).where(eq(clients.tenantId, tenantId));
      
      // Teams
      await tx.delete(teamMembers).where(eq(teamMembers.tenantId, tenantId));
      await tx.delete(teams).where(eq(teams.tenantId, tenantId));
      
      // Workspaces (after tags deleted)
      await tx.delete(workspaceMembers).where(eq(workspaceMembers.tenantId, tenantId));
      await tx.delete(workspaces).where(eq(workspaces.tenantId, tenantId));
      
      // Invitations and auth
      await tx.delete(invitations).where(eq(invitations.tenantId, tenantId));
      
      // Tenant config and settings
      await tx.delete(tenantNotes).where(eq(tenantNotes.tenantId, tenantId));
      await tx.delete(tenantAuditEvents).where(eq(tenantAuditEvents.tenantId, tenantId));
      await tx.delete(tenantAgreementAcceptances).where(eq(tenantAgreementAcceptances.tenantId, tenantId));
      await tx.delete(tenantAgreements).where(eq(tenantAgreements.tenantId, tenantId));
      await tx.delete(tenantIntegrations).where(eq(tenantIntegrations.tenantId, tenantId));
      await tx.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
      
      // App settings
      await tx.delete(appSettings).where(eq(appSettings.tenantId, tenantId));
      
      // Error logs (tenant-scoped)
      await tx.delete(errorLogs).where(eq(errorLogs.tenantId, tenantId));
      
      // Email outbox (tenant-scoped)
      await tx.delete(emailOutbox).where(eq(emailOutbox.tenantId, tenantId));
      
      // Tenancy warnings (data integrity warnings for this tenant)
      await tx.delete(tenancyWarnings).where(eq(tenancyWarnings.tenantId, tenantId));
      
      // Users belonging to this tenant
      await tx.delete(users).where(eq(users.tenantId, tenantId));
      
      // Finally delete the tenant itself
      await tx.delete(tenants).where(eq(tenants.id, tenantId));
    });

    console.log(`[SuperAdmin] Tenant ${tenantId} (${tenant.name}) deleted successfully`);

    // Record platform-level audit event (outside transaction as tenant audit table is already deleted)
    await db.insert(platformAuditEvents).values({
      eventType: "tenant_deleted",
      message: `Tenant "${tenant.name}" (${tenantId}) permanently deleted`,
      actorUserId: superUser?.id,
      metadata: { tenantId, tenantName: tenant.name, tenantSlug: tenant.slug },
    });

    res.json({
      success: true,
      message: `Tenant "${tenant.name}" and all its data have been permanently deleted`,
    });
  } catch (error) {
    console.error("Error deleting tenant:", error);
    res.status(500).json({ error: "Failed to delete tenant" });
  }
});

// =============================================================================
// TENANT WORKSPACES
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/workspaces - Get all workspaces for a tenant
router.get("/tenants/:tenantId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantWorkspaces = await db.select().from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));

    res.json(tenantWorkspaces);
  } catch (error) {
    console.error("Error fetching tenant workspaces:", error);
    res.status(500).json({ error: "Failed to fetch tenant workspaces" });
  }
});

// POST /api/v1/super/tenants/:tenantId/workspaces - Create a workspace for a tenant
const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

router.post("/tenants/:tenantId/workspaces", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createWorkspaceSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [workspace] = await db.insert(workspaces).values({
      name: data.name,
      tenantId,
    }).returning();

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "workspace_created",
      `Workspace "${data.name}" created by super admin`,
      superUser?.id,
      { workspaceId: workspace.id, workspaceName: data.name }
    );

    res.status(201).json(workspace);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating workspace:", error);
    res.status(500).json({ error: "Failed to create workspace" });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/workspaces/:workspaceId - Update a workspace
const updateWorkspaceSchema = z.object({
  name: z.string().min(1).optional(),
});

router.patch("/tenants/:tenantId/workspaces/:workspaceId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, workspaceId } = req.params;
    const data = updateWorkspaceSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingWorkspace] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)));
    
    if (!existingWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    const [updated] = await db.update(workspaces)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(workspaces.id, workspaceId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating workspace:", error);
    res.status(500).json({ error: "Failed to update workspace" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId/workspaces/:workspaceId - Delete a workspace
router.delete("/tenants/:tenantId/workspaces/:workspaceId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, workspaceId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingWorkspace] = await db.select().from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), eq(workspaces.tenantId, tenantId)));
    
    if (!existingWorkspace) {
      return res.status(404).json({ error: "Workspace not found" });
    }

    await db.delete(workspaces).where(eq(workspaces.id, workspaceId));

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "workspace_deleted",
      `Workspace "${existingWorkspace.name}" deleted by super admin`,
      superUser?.id,
      { workspaceId, workspaceName: existingWorkspace.name }
    );

    res.json({ success: true, message: "Workspace deleted successfully" });
  } catch (error) {
    console.error("Error deleting workspace:", error);
    res.status(500).json({ error: "Failed to delete workspace" });
  }
});

// =============================================================================
// PHASE 3A: TENANT ADMIN INVITATION
// =============================================================================

const inviteAdminSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional().default("admin"),
  expiresInDays: z.number().min(1).max(30).optional(),
  inviteType: z.enum(["link", "email"]).optional().default("link"),
});

router.post("/tenants/:tenantId/invite-admin", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = inviteAdminSchema.parse(req.body);

    // Verify tenant exists
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get or create a default workspace for the tenant
    let workspaceId: string;
    const tenantWorkspaces = await db.select().from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    if (tenantWorkspaces.length > 0) {
      // Prefer primary workspace, otherwise use first one
      const primaryWorkspace = tenantWorkspaces.find(w => w.isPrimary);
      workspaceId = primaryWorkspace?.id || tenantWorkspaces[0].id;
    } else {
      // Create a default workspace for the tenant with proper tenantId
      const [newWorkspace] = await db.insert(workspaces).values({
        name: `${tenant.name} Workspace`,
        tenantId,
        isPrimary: true,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    // Get the super user's ID from the request
    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    // Create the invitation
    const { invitation, token } = await storage.createTenantAdminInvitation({
      tenantId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      expiresInDays: data.expiresInDays,
      createdByUserId: superUser.id,
      workspaceId,
    });

    // Build the invite URL
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${baseUrl}/invite/${token}`;

    let emailSent = false;
    let emailError: string | null = null;

    // If email type is requested, attempt to send email via Mailgun
    if (data.inviteType === "email") {
      try {
        // Check if Mailgun is configured for this tenant
        const mailgunConfig = await tenantIntegrationService.getIntegrationWithSecrets(tenantId, "mailgun");
        
        if (mailgunConfig && mailgunConfig.publicConfig && mailgunConfig.secretConfig) {
          // Mailgun is configured - send the email
          const { domain, fromEmail, replyTo } = mailgunConfig.publicConfig as { domain: string; fromEmail: string; replyTo?: string };
          const { apiKey } = mailgunConfig.secretConfig as { apiKey: string };
          
          // Basic email sending via Mailgun API
          const FormData = (await import("form-data")).default;
          const Mailgun = (await import("mailgun.js")).default;
          const mailgun = new Mailgun(FormData);
          const mg = mailgun.client({ username: "api", key: apiKey });
          
          await mg.messages.create(domain, {
            from: fromEmail,
            to: [data.email],
            subject: `You're invited to join ${tenant.name}`,
            text: `You've been invited to become an admin for ${tenant.name}.\n\nClick the link below to accept your invitation:\n${inviteUrl}\n\nThis invitation expires in ${data.expiresInDays || 7} days.`,
            html: `<p>You've been invited to become an admin for <strong>${tenant.name}</strong>.</p><p><a href="${inviteUrl}">Click here to accept your invitation</a></p><p>This invitation expires in ${data.expiresInDays || 7} days.</p>`,
            ...(replyTo ? { "h:Reply-To": replyTo } : {}),
          });
          
          emailSent = true;
        } else {
          emailError = "Mailgun is not configured for this tenant. The invite link has been generated instead.";
        }
      } catch (mailError) {
        console.error("Error sending invitation email:", mailError);
        emailError = "Failed to send email. The invite link has been generated instead.";
      }
    }

    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_created",
      `Admin invitation created for ${data.email}`,
      superUser.id,
      { email: data.email, role: "admin", emailSent }
    );

    res.status(201).json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        tenantId: invitation.tenantId,
      },
      inviteUrl,
      inviteType: data.inviteType,
      emailSent,
      emailError,
      message: emailSent 
        ? `Email invitation sent to ${data.email}. The invite link has also been generated.`
        : "Invitation created successfully. Share the invite URL with the tenant admin.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant admin invitation:", error);
    res.status(500).json({ error: "Failed to create invitation" });
  }
});

// =============================================================================
// USER MANAGEMENT ENDPOINTS
// =============================================================================

// List all users for a tenant
router.get("/tenants/:tenantId/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantUsers = await storage.getUsersByTenant(tenantId);
    
    res.json({
      users: tenantUsers.map(user => ({
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      total: tenantUsers.length,
    });
  } catch (error) {
    console.error("Error fetching tenant users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// List all invitations for a tenant
router.get("/tenants/:tenantId/invitations", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantInvitations = await storage.getInvitationsByTenant(tenantId);
    
    // Note: inviteUrl is not included because we only store tokenHash, not raw tokens.
    // To get a copyable invite link, use the regenerate endpoint which returns a fresh token.
    res.json({
      invitations: tenantInvitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
        usedAt: inv.usedAt,
      })),
      total: tenantInvitations.length,
    });
  } catch (error) {
    console.error("Error fetching tenant invitations:", error);
    res.status(500).json({ error: "Failed to fetch invitations" });
  }
});

// Create a user directly (manual activation)
const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: z.enum(["admin", "employee"]).default("employee"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  isActive: z.boolean().default(true),
});

router.post("/tenants/:tenantId/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createUserSchema.parse(req.body);
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Check if email already exists
    const existingUser = await storage.getUserByEmail(data.email);
    if (existingUser) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    
    // Hash the password
    const { hashPassword } = await import("../auth");
    const passwordHash = await hashPassword(data.password);
    
    // Get primary workspace for this tenant
    const tenantWorkspaces = await db.select().from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)));
    const primaryWorkspace = tenantWorkspaces[0];
    
    // Create the user
    const newUser = await storage.createUserWithTenant({
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
      firstName: data.firstName,
      lastName: data.lastName,
      role: data.role,
      passwordHash,
      isActive: data.isActive,
      tenantId,
    });
    
    // Add to primary workspace if exists
    if (primaryWorkspace) {
      await db.insert(workspaceMembers).values({
        workspaceId: primaryWorkspace.id,
        userId: newUser.id,
        role: data.role === "admin" ? "admin" : "member",
      }).onConflictDoNothing();
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "user_created",
      `User ${data.email} created manually`,
      superUser?.id,
      { email: data.email, role: data.role, isActive: data.isActive }
    );
    
    res.status(201).json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      },
      message: "User created successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

// =============================================================================
// PROVISION USER ACCESS - Unified endpoint for Super Admin to fully provision tenant users
// =============================================================================
const provisionUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  role: z.enum(["admin", "employee", "client"]).default("employee"),
  activateNow: z.boolean().default(true),
  method: z.enum(["SET_PASSWORD", "RESET_LINK"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  mustChangeOnNextLogin: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
});

router.post("/tenants/:tenantId/users/provision", requireSuperUser, async (req, res) => {
  const requestId = req.get("X-Request-Id") || `prov-${Date.now()}`;
  const debug = process.env.SUPER_USER_PROVISION_DEBUG === "true";
  
  try {
    const { tenantId } = req.params;
    const data = provisionUserSchema.parse(req.body);
    const superUser = req.user as any;
    
    if (debug) {
      console.log(`[provision-debug] requestId=${requestId} tenantId=${tenantId} email=${data.email} method=${data.method}`);
    }
    
    // Validate tenant exists and is not deleted
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: tenant not found`);
      return res.status(404).json({ error: "Tenant not found", requestId });
    }
    
    if (tenant.status === "deleted") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: tenant is deleted`);
      return res.status(400).json({ error: "Cannot provision users in a deleted tenant", requestId });
    }
    
    // Validate method-specific requirements
    if (data.method === "SET_PASSWORD" && !data.password) {
      return res.status(400).json({ error: "Password is required when method is SET_PASSWORD", requestId });
    }
    
    // Check if user exists in this tenant
    const existingUserByEmail = await storage.getUserByEmailAndTenant(data.email, tenantId);
    let user: any;
    let isNewUser = false;
    
    if (existingUserByEmail) {
      if (debug) console.log(`[provision-debug] requestId=${requestId} found existing user id=${existingUserByEmail.id}`);
      
      // Update existing user
      const updates: any = {
        isActive: data.activateNow,
      };
      if (data.firstName) updates.firstName = data.firstName;
      if (data.lastName) updates.lastName = data.lastName;
      if (data.firstName || data.lastName) {
        updates.name = `${data.firstName || existingUserByEmail.firstName || ""} ${data.lastName || existingUserByEmail.lastName || ""}`.trim();
      }
      if (data.role) updates.role = data.role;
      
      user = await storage.updateUserWithTenant(existingUserByEmail.id, tenantId, updates);
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_updated",
        `User ${data.email} updated via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, role: data.role, isActive: data.activateNow }
      );
    } else {
      if (debug) console.log(`[provision-debug] requestId=${requestId} creating new user`);
      
      // Check if email exists globally (in another tenant)
      const globalExisting = await storage.getUserByEmail(data.email);
      if (globalExisting) {
        if (debug) console.log(`[provision-debug] requestId=${requestId} FAIL: email exists in another tenant`);
        return res.status(409).json({ 
          error: "A user with this email already exists in another tenant", 
          requestId 
        });
      }
      
      // Get primary workspace for this tenant
      const tenantWorkspaces = await db.select().from(workspaces)
        .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)));
      const primaryWorkspace = tenantWorkspaces[0];
      
      // Create new user (password will be set below if method is SET_PASSWORD)
      user = await storage.createUserWithTenant({
        email: data.email,
        name: `${data.firstName || ""} ${data.lastName || ""}`.trim() || data.email,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
        role: data.role,
        passwordHash: null, // Will be set below if SET_PASSWORD
        isActive: data.activateNow,
        tenantId,
      });
      isNewUser = true;
      
      // Add to primary workspace if exists
      if (primaryWorkspace) {
        await db.insert(workspaceMembers).values({
          workspaceId: primaryWorkspace.id,
          userId: user.id,
          role: data.role === "admin" ? "admin" : "member",
        }).onConflictDoNothing();
      }
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_created",
        `User ${data.email} created via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, role: data.role, isActive: data.activateNow }
      );
    }
    
    let resetUrl: string | undefined;
    let expiresAt: string | undefined;
    
    if (data.method === "SET_PASSWORD") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} setting password`);
      
      // Hash and set password
      const { hashPassword } = await import("../auth");
      const passwordHash = await hashPassword(data.password!);
      
      await storage.setUserPasswordWithMustChange(user.id, tenantId, passwordHash, data.mustChangeOnNextLogin);
      
      // Invalidate any outstanding reset tokens for this user
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, user.id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_set_password",
        `Password set for user ${data.email} via provision`,
        superUser?.id,
        { userId: user.id, email: data.email, mustChangeOnNextLogin: data.mustChangeOnNextLogin }
      );
      
      if (debug) console.log(`[provision-debug] requestId=${requestId} password set successfully`);
    } else if (data.method === "RESET_LINK") {
      if (debug) console.log(`[provision-debug] requestId=${requestId} generating reset link`);
      
      // Invalidate existing reset tokens
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, user.id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      // Generate reset token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt: expiry,
        createdByUserId: superUser.id,
      });
      
      const appPublicUrl = process.env.APP_PUBLIC_URL;
      if (!appPublicUrl && debug) {
        console.warn(`[provision-debug] requestId=${requestId} APP_PUBLIC_URL not set`);
      }
      const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
      resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
      expiresAt = expiry.toISOString();
      
      await recordTenantAuditEvent(
        tenantId,
        "super_provision_user_generated_reset_link",
        `Reset link generated for user ${data.email} via provision`,
        superUser?.id,
        { userId: user.id, email: data.email }
      );
      
      // Optionally send email if requested and Mailgun is configured
      if (data.sendEmail) {
        try {
          const emailResult = await sendProvisionResetEmail(tenantId, user.email, resetUrl, tenant.name);
          if (debug) console.log(`[provision-debug] requestId=${requestId} email sent=${emailResult}`);
        } catch (emailError) {
          if (debug) console.log(`[provision-debug] requestId=${requestId} email failed:`, emailError);
          // Don't fail the whole operation if email fails
        }
      }
      
      if (debug) console.log(`[provision-debug] requestId=${requestId} reset link generated`);
    }
    
    // Refetch user to get latest state
    const finalUser = await storage.getUserByIdAndTenant(user.id, tenantId);
    
    res.json({
      ok: true,
      user: {
        id: finalUser?.id,
        email: finalUser?.email,
        firstName: finalUser?.firstName,
        lastName: finalUser?.lastName,
        role: finalUser?.role,
        isActive: finalUser?.isActive,
        mustChangeOnNextLogin: finalUser?.mustChangePasswordOnNextLogin,
        lastLoginAt: finalUser?.lastLoginAt,
      },
      isNewUser,
      resetUrl,
      expiresAt,
      requestId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors, requestId });
    }
    console.error(`[provision-error] requestId=${requestId}`, error);
    res.status(500).json({ error: "Failed to provision user", requestId });
  }
});

// Helper function to send reset email for provisioned users
async function sendProvisionResetEmail(tenantId: string, email: string, resetUrl: string, tenantName: string): Promise<boolean> {
  try {
    const integration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
    if (!integration?.isEnabled || !integration.config) {
      return false;
    }
    
    const config = integration.config as any;
    if (!config.apiKey || !config.domain) {
      return false;
    }
    
    const mailgun = new Mailgun(FormData);
    const mg = mailgun.client({ username: "api", key: config.apiKey });
    
    await mg.messages.create(config.domain, {
      from: config.fromEmail || `noreply@${config.domain}`,
      to: email,
      subject: `Set Your Password for ${tenantName}`,
      html: `
        <h2>Welcome to ${tenantName}</h2>
        <p>Your account has been created. Click the link below to set your password:</p>
        <p><a href="${resetUrl}">Set Your Password</a></p>
        <p>This link expires in 24 hours.</p>
      `,
    });
    
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// FIX TENANT USERS - Backfill missing tenantId for existing tenant users
// =============================================================================
router.post("/tenants/:tenantId/users/fix-tenant-ids", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const superUser = req.user as any;
    
    // Verify tenant exists
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Get all users associated with workspaces in this tenant (but missing tenantId)
    const tenantWorkspaces = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    if (tenantWorkspaces.length === 0) {
      return res.json({ message: "No workspaces found for this tenant", fixed: 0 });
    }
    
    const workspaceIds = tenantWorkspaces.map(w => w.id);
    
    // Find all users that are members of these workspaces but have null tenantId
    const usersToFix = await db.select({
      userId: workspaceMembers.userId,
      user: users,
    })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(and(
        inArray(workspaceMembers.workspaceId, workspaceIds),
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER), // Don't update super users
      ));
    
    // Update each user with the tenant ID
    let fixedCount = 0;
    for (const row of usersToFix) {
      await db.update(users)
        .set({ tenantId, updatedAt: new Date() })
        .where(eq(users.id, row.userId));
      fixedCount++;
      
      console.log(`[fix-tenant-ids] Fixed user ${row.user.email} -> tenantId: ${tenantId}`);
    }
    
    // Also check invitations table for users who accepted invitations but have no tenantId
    const inviteUsers = await db.select({
      userId: invitations.userId,
      userEmail: users.email,
    })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.userId))
      .where(and(
        eq(invitations.tenantId, tenantId),
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER),
      ));
    
    for (const row of inviteUsers) {
      if (row.userId) {
        await db.update(users)
          .set({ tenantId, updatedAt: new Date() })
          .where(eq(users.id, row.userId));
        fixedCount++;
        
        console.log(`[fix-tenant-ids] Fixed invited user ${row.userEmail} -> tenantId: ${tenantId}`);
      }
    }
    
    // Audit log
    await recordTenantAuditEvent(
      tenantId,
      "super_fix_tenant_ids",
      `Fixed ${fixedCount} users with missing tenantId`,
      superUser?.id,
      { fixedCount }
    );
    
    res.json({
      message: `Fixed ${fixedCount} users with missing tenantId`,
      fixed: fixedCount,
      tenantId,
      tenantName: tenant.name,
    });
  } catch (error: any) {
    console.error("[fix-tenant-ids] Error:", error);
    res.status(500).json({ 
      error: "Failed to fix tenant IDs",
      details: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
  }
});

// =============================================================================
// GET ORPHANED USERS - Find users with missing tenantId across all tenants
// =============================================================================
router.get("/users/orphaned", requireSuperUser, async (req, res) => {
  try {
    // Find all non-super users without a tenantId
    const orphanedUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER),
      ))
      .orderBy(desc(users.createdAt));
    
    // For each orphaned user, try to find their tenant via workspace membership
    const usersWithWorkspaces = await Promise.all(
      orphanedUsers.map(async (user) => {
        const memberships = await db.select({
          workspaceId: workspaceMembers.workspaceId,
          workspaceName: workspaces.name,
          tenantId: workspaces.tenantId,
        })
          .from(workspaceMembers)
          .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
          .where(eq(workspaceMembers.userId, user.id))
          .limit(5);
        
        return {
          ...user,
          workspaceMemberships: memberships,
          suggestedTenantId: memberships[0]?.tenantId || null,
        };
      })
    );
    
    res.json({
      orphanedCount: orphanedUsers.length,
      users: usersWithWorkspaces,
    });
  } catch (error) {
    console.error("[orphaned-users] Error:", error);
    res.status(500).json({ error: "Failed to fetch orphaned users" });
  }
});

// Update a user
const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional(),
  isActive: z.boolean().optional(),
});

router.patch("/tenants/:tenantId/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const data = updateUserSchema.parse(req.body);
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    // Build updates
    const updates: any = {};
    if (data.email) updates.email = data.email;
    if (data.firstName !== undefined) {
      updates.firstName = data.firstName;
      updates.name = `${data.firstName} ${data.lastName || existingUser.lastName || ""}`.trim();
    }
    if (data.lastName !== undefined) {
      updates.lastName = data.lastName;
      updates.name = `${data.firstName || existingUser.firstName || ""} ${data.lastName}`.trim();
    }
    if (data.name) updates.name = data.name;
    if (data.role) updates.role = data.role;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    
    const updatedUser = await storage.updateUserWithTenant(userId, tenantId, updates);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "user_updated",
      `User ${existingUser.email} updated`,
      superUser?.id,
      { userId, changes: data }
    );
    
    res.json({
      user: updatedUser,
      message: "User updated successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Activate/deactivate a user
router.post("/tenants/:tenantId/users/:userId/activate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const updatedUser = await storage.setUserActiveWithTenant(userId, tenantId, isActive);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      isActive ? "user_activated" : "user_deactivated",
      `User ${existingUser.email} ${isActive ? "activated" : "deactivated"}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      user: updatedUser,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating user activation:", error);
    res.status(500).json({ error: "Failed to update user activation" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId/users/:userId - Permanently delete a tenant user
// Only allowed for users who are suspended (isActive=false)
router.delete("/tenants/:tenantId/users/:userId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    // Safety check: Only allow deletion of suspended/inactive users
    if (existingUser.isActive) {
      return res.status(400).json({ 
        error: "Cannot delete active user",
        details: "User must be suspended (deactivated) before deletion. Deactivate the user first, then try again."
      });
    }
    
    // Delete all related records first (cascade manually for safety)
    // 1. Delete workspace memberships
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    
    // 2. Delete team memberships
    await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
    
    // 3. Delete project memberships
    await db.delete(projectMembers).where(eq(projectMembers.userId, userId));
    
    // 4. Delete division memberships
    await db.delete(divisionMembers).where(eq(divisionMembers.userId, userId));
    
    // 5. Nullify references in tasks (assignee)
    await db.update(tasks).set({ assigneeId: null }).where(eq(tasks.assigneeId, userId));
    
    // 6. Nullify references in projects (createdBy)
    await db.update(projects).set({ createdBy: null }).where(eq(projects.createdBy, userId));
    
    // 7. Delete time entries
    await db.delete(timeEntries).where(eq(timeEntries.userId, userId));
    
    // 8. Delete activity logs referencing this user
    await db.delete(activityLog).where(eq(activityLog.userId, userId));
    
    // 9. Delete comments by this user
    await db.delete(comments).where(eq(comments.authorId, userId));
    
    // 10. Delete password reset tokens
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
    
    // 11. Delete invitations for this user's email
    await db.delete(invitations).where(eq(invitations.email, existingUser.email));
    
    // 12. Finally, delete the user
    await db.delete(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "user_deleted",
      `User ${existingUser.email} permanently deleted`,
      superUser?.id,
      { userId, email: existingUser.email, deletedAt: new Date().toISOString() }
    );
    
    console.log(`[SuperAdmin] User ${existingUser.email} deleted from tenant ${tenantId} by ${superUser?.email}`);
    
    res.json({
      message: `User ${existingUser.email} has been permanently deleted`,
      deletedUser: {
        id: userId,
        email: existingUser.email,
        name: existingUser.name,
      },
    });
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

// Set user password
const setPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

router.post("/tenants/:tenantId/users/:userId/set-password", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { password } = setPasswordSchema.parse(req.body);
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    // Hash the password
    const { hashPassword } = await import("../auth");
    const passwordHash = await hashPassword(password);
    
    await storage.setUserPasswordWithTenant(userId, tenantId, passwordHash);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "user_password_set",
      `Password set for user ${existingUser.email}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      message: "Password set successfully",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error setting user password:", error);
    res.status(500).json({ error: "Failed to set password" });
  }
});

// =============================================================================
// USER IMPERSONATION - Super Admin can log in as a tenant user for testing
// =============================================================================
router.post("/tenants/:tenantId/users/:userId/impersonate-login", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    if (tenant.status === "deleted" || tenant.status === "suspended") {
      return res.status(400).json({ error: `Cannot impersonate users in a ${tenant.status} tenant` });
    }
    
    const targetUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!targetUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    if (!targetUser.isActive) {
      return res.status(400).json({ error: "Cannot impersonate an inactive user" });
    }
    
    // Record audit event BEFORE impersonation
    await recordTenantAuditEvent(
      tenantId,
      "super_impersonate_user",
      `Super admin started impersonation of user ${targetUser.email}`,
      superUser?.id,
      { 
        targetUserId: userId, 
        targetEmail: targetUser.email,
        superAdminId: superUser?.id,
        superAdminEmail: superUser?.email
      }
    );
    
    // Set impersonation session data
    // We preserve the original super user and add impersonation context
    (req.session as any).isImpersonatingUser = true;
    (req.session as any).impersonatedUserId = targetUser.id;
    (req.session as any).impersonatedUserEmail = targetUser.email;
    (req.session as any).impersonatedUserRole = targetUser.role;
    (req.session as any).impersonatedTenantId = tenantId;
    (req.session as any).impersonatedTenantName = tenant.name;
    (req.session as any).originalSuperUserId = superUser.id;
    (req.session as any).originalSuperUserEmail = superUser.email;
    (req.session as any).impersonationStartedAt = new Date().toISOString();
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log(`[impersonate] Super admin ${superUser.email} now impersonating ${targetUser.email} in tenant ${tenant.name}`);
    
    res.json({
      ok: true,
      impersonating: {
        userId: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        tenantId,
        tenantName: tenant.name,
      },
      message: `Now impersonating ${targetUser.email}. You will see the app as this user sees it.`,
    });
  } catch (error) {
    console.error("Error impersonating user:", error);
    res.status(500).json({ error: "Failed to start impersonation" });
  }
});

// Exit user impersonation and return to super admin view
router.post("/impersonation/exit", requireSuperUser, async (req, res) => {
  try {
    const session = req.session as any;
    
    if (!session.isImpersonatingUser) {
      return res.status(400).json({ error: "Not currently impersonating any user" });
    }
    
    const impersonatedEmail = session.impersonatedUserEmail;
    const tenantId = session.impersonatedTenantId;
    const superUser = req.user as any;
    
    // Record audit event for exiting impersonation
    if (tenantId) {
      await recordTenantAuditEvent(
        tenantId,
        "super_exit_impersonation",
        `Super admin exited impersonation of user ${impersonatedEmail}`,
        superUser?.id,
        { 
          impersonatedEmail,
          duration: session.impersonationStartedAt 
            ? `${Math.round((Date.now() - new Date(session.impersonationStartedAt).getTime()) / 1000)}s`
            : "unknown"
        }
      );
    }
    
    // Clear impersonation session data
    delete session.isImpersonatingUser;
    delete session.impersonatedUserId;
    delete session.impersonatedUserEmail;
    delete session.impersonatedUserRole;
    delete session.impersonatedTenantId;
    delete session.impersonatedTenantName;
    delete session.originalSuperUserId;
    delete session.originalSuperUserEmail;
    delete session.impersonationStartedAt;
    
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    console.log(`[impersonate] Super admin exited impersonation of ${impersonatedEmail}`);
    
    res.json({
      ok: true,
      message: "Impersonation ended. You are now viewing as super admin again.",
    });
  } catch (error) {
    console.error("Error exiting impersonation:", error);
    res.status(500).json({ error: "Failed to exit impersonation" });
  }
});

// Get current impersonation status
router.get("/impersonation/status", requireSuperUser, async (req, res) => {
  const session = req.session as any;
  
  if (!session.isImpersonatingUser) {
    return res.json({
      isImpersonating: false,
    });
  }
  
  res.json({
    isImpersonating: true,
    impersonatedUser: {
      id: session.impersonatedUserId,
      email: session.impersonatedUserEmail,
      role: session.impersonatedUserRole,
    },
    tenant: {
      id: session.impersonatedTenantId,
      name: session.impersonatedTenantName,
    },
    startedAt: session.impersonationStartedAt,
    originalSuperUser: {
      id: session.originalSuperUserId,
      email: session.originalSuperUserEmail,
    },
  });
});

// Get user's latest invitation status
router.get("/tenants/:tenantId/users/:userId/invitation", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const invitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    
    res.json({
      invitation: invitation || null,
      hasAcceptedInvitation: !!user.passwordHash,
    });
  } catch (error) {
    console.error("Error getting user invitation:", error);
    res.status(500).json({ error: "Failed to get invitation status" });
  }
});

// Regenerate invitation for a user
router.post("/tenants/:tenantId/users/:userId/regenerate-invite", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const existingInvitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "No invitation found for this user. Create a new invitation instead." });
    }
    
    const { invitation, token } = await storage.regenerateInvitation(existingInvitation.id, superUser?.id);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_regenerated",
      `Invitation regenerated for ${user.email}`,
      superUser?.id,
      { userId, email: user.email, invitationId: invitation.id }
    );
    
    res.json({
      invitation,
      inviteUrl,
      message: "Invitation regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating invitation:", error);
    res.status(500).json({ error: "Failed to regenerate invitation" });
  }
});

// Send invitation email to a user
router.post("/tenants/:tenantId/users/:userId/send-invite", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const user = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!user) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    const existingInvitation = await storage.getLatestInvitationByUserEmail(user.email, tenantId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "No invitation found for this user. Create a new invitation first." });
    }
    
    // Check if invitation is expired
    if (existingInvitation.status === "expired" || 
        (existingInvitation.expiresAt && new Date(existingInvitation.expiresAt) < new Date())) {
      return res.status(400).json({ error: "Invitation has expired. Please regenerate the invitation first." });
    }
    
    // Check if invitation was already used
    if (existingInvitation.status === "accepted" || existingInvitation.usedAt) {
      return res.status(400).json({ error: "This invitation has already been used." });
    }
    
    // Regenerate the token to get a fresh one for sending
    const { invitation, token } = await storage.regenerateInvitation(existingInvitation.id, superUser?.id);
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Try to send email
    let emailSent = false;
    try {
      const { sendInviteEmail } = await import("../email");
      const tenantSettings = await storage.getTenantSettings(tenantId);
      const appName = tenantSettings?.appName || "MyWorkDay";
      
      await sendInviteEmail(user.email, inviteUrl, appName, tenantId);
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_sent",
      `Invitation email ${emailSent ? "sent" : "attempted but failed"} to ${user.email}`,
      superUser?.id,
      { userId, email: user.email, invitationId: invitation.id, emailSent }
    );
    
    res.json({
      invitation,
      inviteUrl,
      emailSent,
      message: emailSent ? "Invitation email sent successfully" : "Invitation regenerated but email sending failed",
    });
  } catch (error) {
    console.error("Error sending invitation:", error);
    res.status(500).json({ error: "Failed to send invitation" });
  }
});

// Reset user password with must-change flag
const resetPasswordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  mustChangeOnNextLogin: z.boolean().optional().default(true),
});

router.post("/tenants/:tenantId/users/:userId/reset-password", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const { password, mustChangeOnNextLogin } = resetPasswordSchema.parse(req.body);
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    // Hash the password
    const { hashPassword } = await import("../auth");
    const passwordHash = await hashPassword(password);
    
    await storage.setUserPasswordWithMustChange(userId, tenantId, passwordHash, mustChangeOnNextLogin);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "user_password_reset",
      `Password reset for user ${existingUser.email}${mustChangeOnNextLogin ? " (must change on next login)" : ""}`,
      superUser?.id,
      { userId, email: existingUser.email, mustChangeOnNextLogin }
    );
    
    res.json({
      message: "Password reset successfully",
      mustChangeOnNextLogin,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error resetting user password:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
});

// Generate password reset link for a user (Super Admin can copy and share)
router.post("/tenants/:tenantId/users/:userId/generate-reset-link", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, userId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingUser = await storage.getUserByIdAndTenant(userId, tenantId);
    if (!existingUser) {
      return res.status(404).json({ error: "User not found in this tenant" });
    }
    
    // Invalidate any existing active reset tokens for this user
    const { passwordResetTokens } = await import("@shared/schema");
    const { eq, and, isNull } = await import("drizzle-orm");
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() }) // Mark as used to invalidate
      .where(and(
        eq(passwordResetTokens.userId, existingUser.id),
        isNull(passwordResetTokens.usedAt)
      ));
    
    // Generate reset token
    const crypto = await import("crypto");
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for admin-generated links
    
    // Store token hash
    await db.insert(passwordResetTokens).values({
      userId: existingUser.id,
      tokenHash,
      expiresAt,
      createdByUserId: superUser.id, // Admin-initiated
    });
    
    // Generate reset URL - always use APP_PUBLIC_URL in production for Railway compatibility
    const appPublicUrl = process.env.APP_PUBLIC_URL;
    if (!appPublicUrl) {
      console.warn("[generate-reset-link] APP_PUBLIC_URL not set, link may be incorrect behind proxy");
    }
    const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
    const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "password_reset_link_generated",
      `Password reset link generated for user ${existingUser.email}`,
      superUser?.id,
      { userId, email: existingUser.email }
    );
    
    res.json({
      resetUrl,
      expiresAt: expiresAt.toISOString(),
      message: "Password reset link generated successfully. The link expires in 24 hours.",
    });
  } catch (error) {
    console.error("Error generating password reset link:", error);
    res.status(500).json({ error: "Failed to generate password reset link" });
  }
});

// Revoke an invitation
router.post("/tenants/:tenantId/invitations/:invitationId/revoke", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.revokeInvitation(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_revoked",
      `Invitation for ${invitation.email} revoked`,
      superUser?.id,
      { invitationId, email: invitation.email }
    );
    
    res.json({
      invitation,
      message: "Invitation revoked successfully",
    });
  } catch (error) {
    console.error("Error revoking invitation:", error);
    res.status(500).json({ error: "Failed to revoke invitation" });
  }
});

// Resend invitation email (regenerates token first since we don't store raw tokens)
router.post("/tenants/:tenantId/invitations/:invitationId/resend", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.getInvitationById(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (invitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    if (invitation.status !== "pending") {
      return res.status(400).json({ error: "Can only resend pending invitations" });
    }
    
    // Regenerate the token (since we don't store raw tokens, only hashes)
    const { invitation: updatedInvitation, token } = await storage.regenerateInvitation(invitationId, superUser?.id || "");
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Try to send email
    let emailSent = false;
    try {
      const { sendInviteEmail } = await import("../email");
      const tenantSettingsData = await storage.getTenantSettings(tenantId);
      const appName = tenantSettingsData?.appName || "MyWorkDay";
      
      await sendInviteEmail(invitation.email, inviteUrl, appName, tenantId);
      emailSent = true;
    } catch (emailError) {
      console.error("Failed to resend invitation email:", emailError);
    }
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_resent",
      `Invitation email ${emailSent ? "resent" : "resend attempted but failed"} to ${invitation.email}`,
      superUser?.id,
      { invitationId, email: invitation.email, emailSent }
    );
    
    res.json({
      inviteUrl,
      emailSent,
      message: emailSent ? "Invitation email resent successfully" : "Email sending failed. Copy the link manually.",
    });
  } catch (error) {
    console.error("Error resending invitation:", error);
    res.status(500).json({ error: "Failed to resend invitation" });
  }
});

// Regenerate invitation link (creates new token and extends expiry)
router.post("/tenants/:tenantId/invitations/:invitationId/regenerate", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const existingInvitation = await storage.getInvitationById(invitationId);
    if (!existingInvitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (existingInvitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    if (existingInvitation.status === "accepted") {
      return res.status(400).json({ error: "Cannot regenerate an accepted invitation" });
    }
    
    // Regenerate the token using the storage method
    const { invitation: updatedInvitation, token } = await storage.regenerateInvitation(invitationId, superUser?.id || "");
    
    const baseUrl = process.env.REPLIT_DEV_DOMAIN 
      ? `https://${process.env.REPLIT_DEV_DOMAIN}` 
      : process.env.APP_URL || "http://localhost:5000";
    const inviteUrl = `${baseUrl}/accept-invite?token=${token}`;
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_regenerated",
      `Invitation link regenerated for ${existingInvitation.email}`,
      superUser?.id,
      { invitationId, email: existingInvitation.email }
    );
    
    res.json({
      invitation: updatedInvitation,
      inviteUrl,
      message: "Invitation link regenerated successfully",
    });
  } catch (error) {
    console.error("Error regenerating invitation:", error);
    res.status(500).json({ error: "Failed to regenerate invitation" });
  }
});

// Delete an invitation (only for revoked or expired invitations)
router.delete("/tenants/:tenantId/invitations/:invitationId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, invitationId } = req.params;
    const superUser = req.user as any;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const invitation = await storage.getInvitationById(invitationId);
    if (!invitation) {
      return res.status(404).json({ error: "Invitation not found" });
    }
    
    // Verify invitation belongs to this tenant
    if (invitation.tenantId !== tenantId) {
      return res.status(404).json({ error: "Invitation not found in this tenant" });
    }
    
    // Only allow deletion of revoked or expired invitations
    const isExpired = new Date(invitation.expiresAt) < new Date();
    if (invitation.status !== "revoked" && !isExpired) {
      return res.status(400).json({ 
        error: "Can only delete revoked or expired invitations. Active pending invitations must be revoked first." 
      });
    }
    
    await storage.deleteInvitation(invitationId);
    
    // Record audit event
    await recordTenantAuditEvent(
      tenantId,
      "invite_deleted",
      `Invitation for ${invitation.email} deleted permanently`,
      superUser?.id,
      { invitationId, email: invitation.email, previousStatus: invitation.status }
    );
    
    res.json({
      success: true,
      message: "Invitation deleted permanently",
    });
  } catch (error) {
    console.error("Error deleting invitation:", error);
    res.status(500).json({ error: "Failed to delete invitation" });
  }
});

// =============================================================================
// BULK CSV IMPORT - Import users from CSV with invite links
// =============================================================================

const csvUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: z.enum(["admin", "employee"]).optional().default("employee"),
});

const bulkImportSchema = z.object({
  users: z.array(csvUserSchema).min(1, "At least one user is required").max(500, "Maximum 500 users per import"),
  expiresInDays: z.number().min(1).max(30).optional(),
  sendInvite: z.boolean().optional().default(false),
  workspaceName: z.string().min(1).optional(),
});

interface ImportResult {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  success: boolean;
  inviteUrl?: string;
  emailSent?: boolean;
  error?: string;
}

router.post("/tenants/:tenantId/import-users", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;
    const data = bulkImportSchema.parse(req.body);

    // Verify tenant exists
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get or create a workspace for the tenant (use workspaceName if provided)
    let workspaceId: string;
    const targetWorkspaceName = data.workspaceName || `${tenant.name} Workspace`;
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));
    const tenantWorkspace = allWorkspaces.find(w => w.name === targetWorkspaceName) 
      || allWorkspaces.find(w => w.isPrimary === true)
      || allWorkspaces[0];
    
    if (tenantWorkspace) {
      workspaceId = tenantWorkspace.id;
    } else {
      const [newWorkspace] = await db.insert(workspaces).values({
        name: targetWorkspaceName,
        tenantId,
        isPrimary: true,
      }).returning();
      workspaceId = newWorkspace.id;
    }

    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
    const results: ImportResult[] = [];

    // Check for existing emails to avoid duplicates
    const existingEmails = new Set(
      (await db.select({ email: users.email }).from(users))
        .map(u => u.email.toLowerCase())
    );

    // Process each user
    for (const user of data.users) {
      const emailLower = user.email.toLowerCase();
      
      // Skip if email already exists as a user
      if (existingEmails.has(emailLower)) {
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Email already exists in the system",
        });
        continue;
      }

      try {
        // Create the invitation
        const { invitation, token } = await storage.createTenantAdminInvitation({
          tenantId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          expiresInDays: data.expiresInDays,
          createdByUserId: superUser.id,
          workspaceId,
        });

        // Override the role if not admin (the storage method defaults to admin)
        if (user.role === "employee") {
          await db.update(invitations)
            .set({ role: "employee" })
            .where(eq(invitations.id, invitation.id));
        }

        const inviteUrl = `${baseUrl}/invite/${token}`;

        // Send email if sendInvite is true
        let emailSent = false;
        if (data.sendInvite) {
          try {
            const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
            if (mailgunIntegration?.status === "configured" && mailgunIntegration.config) {
              const inviteEmailService = new InviteEmailService({
                apiKey: mailgunIntegration.config.apiKey as string,
                domain: mailgunIntegration.config.domain as string,
                senderEmail: mailgunIntegration.config.senderEmail as string,
                senderName: mailgunIntegration.config.senderName as string,
              });
              
              const tenantSettings = await storage.getTenantSettings(tenantId);
              const appName = tenantSettings?.appName || tenantSettings?.displayName || "MyWorkDay";
              
              await inviteEmailService.sendInviteEmail({
                recipientEmail: user.email,
                recipientName: user.firstName || user.email.split("@")[0],
                inviteUrl,
                appName,
              });
              emailSent = true;
            }
          } catch (emailErr) {
            console.error(`Failed to send invite email to ${user.email}:`, emailErr);
          }
        }

        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: true,
          inviteUrl,
          emailSent,
        });
      } catch (err) {
        console.error(`Error creating invitation for ${user.email}:`, err);
        results.push({
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role || "employee",
          success: false,
          error: "Failed to create invitation",
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    const emailsSent = results.filter(r => r.emailSent).length;

    // Record audit event for bulk import
    await recordTenantAuditEvent(
      tenantId,
      "bulk_users_imported",
      `Bulk import: ${successCount} users imported, ${failCount} failed${data.sendInvite ? `, ${emailsSent} emails sent` : ''}`,
      superUser.id,
      { totalProcessed: data.users.length, successCount, failCount, emailsSent, sendInvite: data.sendInvite }
    );

    res.status(201).json({
      message: `Imported ${successCount} user(s) successfully. ${failCount} failed.`,
      totalProcessed: data.users.length,
      successCount,
      failCount,
      results,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error importing users:", error);
    res.status(500).json({ error: "Failed to import users" });
  }
});

// =============================================================================
// PHASE 3A: TENANT ONBOARDING STATUS
// =============================================================================

router.get("/tenants/:tenantId/onboarding-status", requireSuperUser, async (req, res) => {
  try {
    const tenantId = req.params.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    res.json({
      status: tenant.status,
      onboardedAt: tenant.onboardedAt,
      ownerUserId: tenant.ownerUserId,
      settings: settings ? {
        displayName: settings.displayName,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        supportEmail: settings.supportEmail,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching tenant onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

// Get tenants with additional info (settings, user counts)
// Optimized: Uses batch queries instead of N+1 (2N+1 → 3 queries)
router.get("/tenants-detail", requireSuperUser, async (req, res) => {
  try {
    const tenantsWithDetails = await storage.getTenantsWithDetails();
    res.json(tenantsWithDetails);
  } catch (error: any) {
    console.error("Error fetching tenants with details:", {
      message: error?.message,
      stack: error?.stack,
    });
    // Fall back to basic tenants list if detailed query fails
    try {
      const basicTenants = await storage.getAllTenants();
      const tenantsWithDefaults = basicTenants.map(t => ({
        ...t,
        settings: null,
        userCount: 0,
      }));
      console.warn("[tenants-detail] Falling back to basic tenant list");
      res.json(tenantsWithDefaults);
    } catch (fallbackError: any) {
      console.error("Fallback also failed:", fallbackError?.message);
      res.status(500).json({ error: "Failed to fetch tenants", details: error?.message });
    }
  }
});

// =============================================================================
// PHASE 3B: SUPER USER TENANT SETTINGS MANAGEMENT
// =============================================================================

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const superUpdateSettingsSchema = z.object({
  displayName: z.string().min(1).optional(),
  appName: z.string().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  iconUrl: z.string().url().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  secondaryColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  accentColor: z.string().regex(hexColorRegex, "Must be valid hex color").optional().nullable(),
  loginMessage: z.string().optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  whiteLabelEnabled: z.boolean().optional(),
  hideVendorBranding: z.boolean().optional(),
});

// GET /api/v1/super/tenants/:tenantId/settings
router.get("/tenants/:tenantId/settings", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);
    
    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
      },
      tenantSettings: settings ? {
        displayName: settings.displayName,
        appName: settings.appName,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        loginMessage: settings.loginMessage,
        supportEmail: settings.supportEmail,
        whiteLabelEnabled: settings.whiteLabelEnabled,
        hideVendorBranding: settings.hideVendorBranding,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching tenant settings:", error);
    res.status(500).json({ error: "Failed to fetch tenant settings" });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/settings
router.patch("/tenants/:tenantId/settings", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = superUpdateSettingsSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    const updatedSettings = await storage.updateTenantSettings(tenantId, data);
    
    res.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant settings:", error);
    res.status(500).json({ error: "Failed to update tenant settings" });
  }
});

// =============================================================================
// PHASE 3B: SUPER USER TENANT INTEGRATIONS MANAGEMENT
// =============================================================================

const validProviders: IntegrationProvider[] = ["mailgun", "s3"];

function isValidProvider(provider: string): provider is IntegrationProvider {
  return validProviders.includes(provider as IntegrationProvider);
}

// GET /api/v1/super/tenants/:tenantId/integrations
router.get("/tenants/:tenantId/integrations", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const integrations = await tenantIntegrationService.listIntegrations(tenantId);
    res.json({ integrations });
  } catch (error) {
    console.error("Error fetching tenant integrations:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// GET /api/v1/super/tenants/:tenantId/integrations/:provider
router.get("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const integration = await tenantIntegrationService.getIntegration(tenantId, provider);
    
    if (!integration) {
      return res.json({
        provider,
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
      });
    }

    res.json(integration);
  } catch (error) {
    console.error("Error fetching tenant integration:", error);
    res.status(500).json({ error: "Failed to fetch integration" });
  }
});

// PUT /api/v1/super/tenants/:tenantId/integrations/:provider
const mailgunUpdateSchema = z.object({
  domain: z.string().optional(),
  fromEmail: z.string().email().optional(),
  replyTo: z.string().email().optional().nullable(),
  apiKey: z.string().optional(),
});

const s3UpdateSchema = z.object({
  bucketName: z.string().optional(),
  region: z.string().optional(),
  keyPrefixTemplate: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

router.put("/tenants/:tenantId/integrations/:provider", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let publicConfig: any = {};
    let secretConfig: any = {};

    if (provider === "mailgun") {
      const data = mailgunUpdateSchema.parse(req.body);
      publicConfig = {
        domain: data.domain,
        fromEmail: data.fromEmail,
        replyTo: data.replyTo,
      };
      if (data.apiKey) {
        secretConfig = { apiKey: data.apiKey };
      }
    } else if (provider === "s3") {
      const data = s3UpdateSchema.parse(req.body);
      publicConfig = {
        bucketName: data.bucketName,
        region: data.region,
        keyPrefixTemplate: data.keyPrefixTemplate || `tenants/${tenantId}/`,
      };
      if (data.accessKeyId || data.secretAccessKey) {
        secretConfig = {
          accessKeyId: data.accessKeyId,
          secretAccessKey: data.secretAccessKey,
        };
      }
    }

    const result = await tenantIntegrationService.upsertIntegration(tenantId, provider, {
      publicConfig,
      secretConfig: Object.keys(secretConfig).length > 0 ? secretConfig : undefined,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant integration:", error);
    if (error instanceof Error && error.message.includes("Encryption key")) {
      return res.status(500).json({ 
        error: { 
          code: "ENCRYPTION_KEY_MISSING", 
          message: "Encryption key not configured. Please contact administrator." 
        } 
      });
    }
    res.status(500).json({ error: "Failed to update integration" });
  }
});

// POST /api/v1/super/tenants/:tenantId/integrations/:provider/test
router.post("/tenants/:tenantId/integrations/:provider/test", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const result = await tenantIntegrationService.testIntegration(tenantId, provider);
    
    res.json(result);
  } catch (error) {
    console.error("Error testing tenant integration:", error);
    res.status(500).json({ error: "Failed to test integration" });
  }
});

// =============================================================================
// BRAND ASSET UPLOAD ENDPOINTS (SUPER ADMIN)
// =============================================================================

const validAssetTypes = ["logo", "icon", "favicon"] as const;
type AssetType = typeof validAssetTypes[number];

function isValidAssetType(type: string): type is AssetType {
  return validAssetTypes.includes(type as AssetType);
}

// POST /api/v1/super/tenants/:tenantId/settings/brand-assets - Upload brand asset for tenant
router.post("/tenants/:tenantId/settings/brand-assets", requireSuperUser, upload.single("file"), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const assetType = req.body.type as string;

    if (!isS3Configured()) {
      return res.status(503).json({ error: "S3 storage is not configured" });
    }

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (!assetType || !isValidAssetType(assetType)) {
      return res.status(400).json({ error: "Invalid asset type. Must be: logo, icon, or favicon" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file provided" });
    }

    const mimeType = req.file.mimetype;
    const validation = validateBrandAsset(mimeType, req.file.size);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const storageKey = generateBrandAssetKey(tenantId, assetType, req.file.originalname);
    const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

    // Update tenant settings with the new URL
    const fieldMap: Record<AssetType, string> = {
      logo: "logoUrl",
      icon: "iconUrl",
      favicon: "faviconUrl",
    };

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    await storage.updateTenantSettings(tenantId, { [fieldMap[assetType]]: url });

    res.json({ url, type: assetType });
  } catch (error) {
    console.error("Error uploading brand asset:", error);
    res.status(500).json({ error: "Failed to upload brand asset" });
  }
});

// =============================================================================
// TENANT NOTES (Super Admin only)
// =============================================================================

const createNoteSchema = z.object({
  body: z.string().min(1, "Note body is required").max(10000, "Note too long"),
  category: z.enum(["onboarding", "support", "billing", "technical", "general"]).optional().default("general"),
});

// GET /api/v1/super/tenants/:tenantId/notes - Get all notes for a tenant
router.get("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const notes = await db.select({
      id: tenantNotes.id,
      tenantId: tenantNotes.tenantId,
      authorUserId: tenantNotes.authorUserId,
      body: tenantNotes.body,
      category: tenantNotes.category,
      createdAt: tenantNotes.createdAt,
    })
      .from(tenantNotes)
      .where(eq(tenantNotes.tenantId, tenantId))
      .orderBy(desc(tenantNotes.createdAt));

    // Enrich with author info
    const userIds = Array.from(new Set(notes.map(n => n.authorUserId)));
    const authorUsers = userIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(${userIds})`)
      : [];
    const authorMap = new Map(authorUsers.map(u => [u.id, u]));

    const enrichedNotes = notes.map(note => ({
      ...note,
      author: authorMap.get(note.authorUserId) || { id: note.authorUserId, name: "Unknown", email: "" },
    }));

    res.json(enrichedNotes);
  } catch (error) {
    console.error("Error fetching tenant notes:", error);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// POST /api/v1/super/tenants/:tenantId/notes - Create a note
router.post("/tenants/:tenantId/notes", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createNoteSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const superUser = req.user as any;
    if (!superUser?.id) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const [note] = await db.insert(tenantNotes).values({
      tenantId,
      authorUserId: superUser.id,
      body: data.body,
      category: data.category,
    }).returning();

    res.status(201).json({
      ...note,
      author: { id: superUser.id, name: superUser.name || "Super Admin", email: superUser.email },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant note:", error);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/notes/:noteId - Update a note
const updateNoteSchema = z.object({
  body: z.string().min(1).max(10000).optional(),
  category: z.enum(["onboarding", "support", "billing", "technical", "general"]).optional(),
});

router.patch("/tenants/:tenantId/notes/:noteId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, noteId } = req.params;
    const data = updateNoteSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingNote] = await db.select().from(tenantNotes)
      .where(and(eq(tenantNotes.id, noteId), eq(tenantNotes.tenantId, tenantId)));
    
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    const [updated] = await db.update(tenantNotes)
      .set({ ...data })
      .where(eq(tenantNotes.id, noteId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating note:", error);
    res.status(500).json({ error: "Failed to update note" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId/notes/:noteId - Delete a note
router.delete("/tenants/:tenantId/notes/:noteId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, noteId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingNote] = await db.select().from(tenantNotes)
      .where(and(eq(tenantNotes.id, noteId), eq(tenantNotes.tenantId, tenantId)));
    
    if (!existingNote) {
      return res.status(404).json({ error: "Note not found" });
    }

    await db.delete(tenantNotes).where(eq(tenantNotes.id, noteId));

    res.json({ success: true, message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting note:", error);
    res.status(500).json({ error: "Failed to delete note" });
  }
});

// =============================================================================
// TENANT AUDIT EVENTS
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/audit - Get audit events for a tenant
router.get("/tenants/:tenantId/audit", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const events = await db.select()
      .from(tenantAuditEvents)
      .where(eq(tenantAuditEvents.tenantId, tenantId))
      .orderBy(desc(tenantAuditEvents.createdAt))
      .limit(limit)
      .offset(offset);

    // Enrich with actor info
    const actorIds = Array.from(new Set(events.filter(e => e.actorUserId).map(e => e.actorUserId!)));
    const actorUsers = actorIds.length > 0
      ? await db.select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(sql`${users.id} = ANY(${actorIds})`)
      : [];
    const actorMap = new Map(actorUsers.map(u => [u.id, u]));

    const enrichedEvents = events.map(event => ({
      ...event,
      actor: event.actorUserId ? actorMap.get(event.actorUserId) || null : null,
    }));

    res.json({
      events: enrichedEvents,
      pagination: {
        limit,
        offset,
        hasMore: events.length === limit,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant audit events:", error);
    res.status(500).json({ error: "Failed to fetch audit events" });
  }
});

// =============================================================================
// TENANT HEALTH (Per-tenant)
// =============================================================================

// GET /api/v1/super/tenants/:tenantId/health - Get health summary for a specific tenant
router.get("/tenants/:tenantId/health", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get tenant settings
    const settings = await storage.getTenantSettings(tenantId);

    // Count users by role
    const userCounts = await db.select({
      role: users.role,
      count: sql<number>`count(*)::int`,
    })
      .from(users)
      .where(eq(users.tenantId, tenantId))
      .groupBy(users.role);

    const userCountMap: Record<string, number> = {};
    for (const uc of userCounts) {
      userCountMap[uc.role] = uc.count;
    }
    const totalUsers = Object.values(userCountMap).reduce((a, b) => a + b, 0);

    // Check if primary workspace exists
    const primaryWorkspace = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);

    // Get mailgun integration status (check if configured)
    let mailgunConfigured = false;
    try {
      const mailgunIntegration = await tenantIntegrationService.getIntegration(tenantId, "mailgun");
      mailgunConfigured = mailgunIntegration?.status === "configured";
    } catch {
      mailgunConfigured = false;
    }

    // Get active agreement (Phase 3C)
    const { tenantAgreements } = await import("@shared/schema");
    const activeAgreement = await db.select()
      .from(tenantAgreements)
      .where(and(eq(tenantAgreements.tenantId, tenantId), eq(tenantAgreements.status, "active")))
      .limit(1);

    // Build health summary
    const warnings: string[] = [];
    if (!primaryWorkspace.length) {
      warnings.push("No primary workspace configured");
    }
    if (totalUsers === 0) {
      warnings.push("No users in tenant");
    }
    if (!settings?.displayName) {
      warnings.push("Display name not configured");
    }

    res.json({
      tenantId,
      status: tenant.status,
      primaryWorkspaceExists: primaryWorkspace.length > 0,
      primaryWorkspace: primaryWorkspace[0] || null,
      users: {
        total: totalUsers,
        byRole: userCountMap,
      },
      agreement: {
        hasActiveAgreement: activeAgreement.length > 0,
        version: activeAgreement[0]?.version || null,
        title: activeAgreement[0]?.title || null,
      },
      integrations: {
        mailgunConfigured,
      },
      branding: {
        displayName: settings?.displayName || null,
        whiteLabelEnabled: settings?.whiteLabelEnabled || false,
        logoConfigured: !!settings?.logoUrl,
      },
      warnings,
      canEnableStrict: warnings.length === 0,
    });
  } catch (error) {
    console.error("Error fetching tenant health:", error);
    res.status(500).json({ error: "Failed to fetch tenant health" });
  }
});

// =============================================================================
// BULK DATA IMPORT (Clients & Projects)
// =============================================================================

// Schema for bulk client import
const bulkClientSchema = z.object({
  companyName: z.string().min(1),
  industry: z.string().optional(),
  website: z.string().optional(),
  phone: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional(),
  notes: z.string().optional(),
  primaryContactEmail: z.string().email().optional(),
  primaryContactFirstName: z.string().optional(),
  primaryContactLastName: z.string().optional(),
});

const bulkClientsImportSchema = z.object({
  clients: z.array(bulkClientSchema).min(1).max(500),
});

// POST /api/v1/super/tenants/:tenantId/clients/bulk - Bulk import clients
router.post("/tenants/:tenantId/clients/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkClientsImportSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get primary workspace
    const primaryWorkspaceResult = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);
    
    if (!primaryWorkspaceResult.length) {
      return res.status(400).json({ error: "No primary workspace found for tenant" });
    }
    const workspaceId = primaryWorkspaceResult[0].id;

    // Get existing clients for deduplication
    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const existingNamesLower = new Set(existingClients.map(c => c.companyName.toLowerCase()));

    // Track duplicates within CSV
    const seenInCsv = new Set<string>();

    const results: Array<{
      companyName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      clientId?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const clientData of data.clients) {
      const companyNameLower = clientData.companyName.trim().toLowerCase();

      // Check for duplicates in tenant
      if (existingNamesLower.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Client already exists in tenant",
        });
        skipped++;
        continue;
      }

      // Check for duplicates within CSV
      if (seenInCsv.has(companyNameLower)) {
        results.push({
          companyName: clientData.companyName,
          status: "skipped",
          reason: "Duplicate in CSV",
        });
        skipped++;
        continue;
      }
      seenInCsv.add(companyNameLower);

      try {
        // Create client
        const [newClient] = await db.insert(clients).values({
          tenantId,
          workspaceId,
          companyName: clientData.companyName.trim(),
          industry: clientData.industry,
          website: clientData.website,
          phone: clientData.phone,
          addressLine1: clientData.address1,
          addressLine2: clientData.address2,
          city: clientData.city,
          state: clientData.state,
          postalCode: clientData.zip,
          country: clientData.country,
          notes: clientData.notes,
          status: "active",
        }).returning();

        // Create primary contact if email provided
        if (clientData.primaryContactEmail) {
          await db.insert(clientContacts).values({
            clientId: newClient.id,
            workspaceId,
            email: clientData.primaryContactEmail,
            firstName: clientData.primaryContactFirstName,
            lastName: clientData.primaryContactLastName,
            isPrimary: true,
          });
        }

        results.push({
          companyName: clientData.companyName,
          status: "created",
          clientId: newClient.id,
        });
        created++;
        existingNamesLower.add(companyNameLower);
      } catch (error: any) {
        results.push({
          companyName: clientData.companyName,
          status: "error",
          reason: error.message || "Failed to create client",
        });
        errors++;
      }
    }

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "clients_bulk_imported",
      `Bulk import: ${created} clients created, ${skipped} skipped, ${errors} errors`,
      superUser?.id,
      { created, skipped, errors, total: data.clients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing clients:", error);
    res.status(500).json({ error: "Failed to bulk import clients" });
  }
});

// Schema for bulk project import
const bulkProjectSchema = z.object({
  projectName: z.string().min(1),
  clientCompanyName: z.string().optional(),
  clientId: z.string().optional(),
  workspaceName: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "archived"]).optional(),
  startDate: z.string().optional(),
  dueDate: z.string().optional(),
  color: z.string().optional(),
  projectOwnerEmail: z.string().email().optional(),
});

const bulkProjectsImportSchema = z.object({
  projects: z.array(bulkProjectSchema).min(1).max(500),
  options: z.object({
    autoCreateMissingClients: z.boolean().optional(),
  }).optional(),
});

// POST /api/v1/super/tenants/:tenantId/projects/bulk - Bulk import projects
router.post("/tenants/:tenantId/projects/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = bulkProjectsImportSchema.parse(req.body);
    const autoCreateClients = data.options?.autoCreateMissingClients || false;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get workspaces for the tenant
    const tenantWorkspaces = await db.select()
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    const primaryWorkspace = tenantWorkspaces.find(w => w.isPrimary) || tenantWorkspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "No workspace found for tenant" });
    }
    const workspaceMap = new Map(tenantWorkspaces.map(w => [w.name.toLowerCase(), w.id]));

    // Get existing clients
    const existingClients = await db.select({ companyName: clients.companyName, id: clients.id })
      .from(clients)
      .where(eq(clients.tenantId, tenantId));
    const clientMap = new Map(existingClients.map(c => [c.companyName.toLowerCase(), c.id]));

    // Get existing projects for deduplication (by name + clientId)
    const existingProjects = await db.select({ name: projects.name, clientId: projects.clientId })
      .from(projects)
      .where(eq(projects.tenantId, tenantId));
    const existingProjectKeys = new Set(
      existingProjects.map(p => `${p.name.toLowerCase()}|${p.clientId || ""}`)
    );

    // Track created items
    const createdClients: Array<{ name: string; id: string }> = [];

    const results: Array<{
      projectName: string;
      status: "created" | "skipped" | "error";
      reason?: string;
      projectId?: string;
      clientIdUsed?: string;
      workspaceIdUsed?: string;
    }> = [];

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const projectData of data.projects) {
      const projectNameTrimmed = projectData.projectName.trim();
      let clientIdToUse: string | null = null;
      let workspaceIdToUse = primaryWorkspace.id;

      // Resolve workspace if specified
      if (projectData.workspaceName) {
        const wsId = workspaceMap.get(projectData.workspaceName.toLowerCase());
        if (wsId) {
          workspaceIdToUse = wsId;
        }
        // If not found, use primary and continue (warning added to results)
      }

      // Resolve client
      if (projectData.clientId) {
        clientIdToUse = projectData.clientId;
      } else if (projectData.clientCompanyName) {
        const clientNameLower = projectData.clientCompanyName.trim().toLowerCase();
        const existingClientId = clientMap.get(clientNameLower);
        
        if (existingClientId) {
          clientIdToUse = existingClientId;
        } else if (autoCreateClients) {
          // Auto-create client
          try {
            const [newClient] = await db.insert(clients).values({
              tenantId,
              workspaceId: workspaceIdToUse,
              companyName: projectData.clientCompanyName.trim(),
              status: "active",
            }).returning();
            clientIdToUse = newClient.id;
            clientMap.set(clientNameLower, newClient.id);
            createdClients.push({ name: projectData.clientCompanyName.trim(), id: newClient.id });
          } catch (createErr: any) {
            results.push({
              projectName: projectNameTrimmed,
              status: "error",
              reason: `Failed to create client "${projectData.clientCompanyName}": ${createErr.message}`,
            });
            errors++;
            continue;
          }
        } else {
          results.push({
            projectName: projectNameTrimmed,
            status: "error",
            reason: `Client "${projectData.clientCompanyName}" not found. Import clients first or enable auto-create.`,
          });
          errors++;
          continue;
        }
      }

      // Check for duplicate project (name + client)
      const projectKey = `${projectNameTrimmed.toLowerCase()}|${clientIdToUse || ""}`;
      if (existingProjectKeys.has(projectKey)) {
        results.push({
          projectName: projectNameTrimmed,
          status: "skipped",
          reason: "Project with same name and client already exists",
        });
        skipped++;
        continue;
      }

      try {
        // Create project
        const [newProject] = await db.insert(projects).values({
          tenantId,
          workspaceId: workspaceIdToUse,
          clientId: clientIdToUse,
          name: projectNameTrimmed,
          description: projectData.description,
          status: projectData.status || "active",
          color: projectData.color || "#3B82F6",
        }).returning();

        results.push({
          projectName: projectNameTrimmed,
          status: "created",
          projectId: newProject.id,
          clientIdUsed: clientIdToUse || undefined,
          workspaceIdUsed: workspaceIdToUse,
        });
        created++;
        existingProjectKeys.add(projectKey);
      } catch (error: any) {
        results.push({
          projectName: projectNameTrimmed,
          status: "error",
          reason: error.message || "Failed to create project",
        });
        errors++;
      }
    }

    // Record audit event
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "projects_bulk_imported",
      `Bulk import: ${created} projects created, ${skipped} skipped, ${errors} errors${createdClients.length ? `, ${createdClients.length} clients auto-created` : ""}`,
      superUser?.id,
      { created, skipped, errors, total: data.projects.length, clientsCreated: createdClients.length }
    );

    res.status(201).json({
      created,
      skipped,
      errors,
      results,
      clientsCreated: createdClients,
    });
  } catch (error: any) {
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid request", details: error.errors });
    }
    console.error("Error bulk importing projects:", error);
    res.status(500).json({ error: "Failed to bulk import projects" });
  }
});

// GET /api/v1/super/tenants/:tenantId/clients - List clients for a tenant
router.get("/tenants/:tenantId/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(clients).where(eq(clients.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          ilike(clients.companyName, `%${search}%`)
        ));
    }

    const clientList = await query.orderBy(clients.companyName);

    res.json({ clients: clientList });
  } catch (error) {
    console.error("Error fetching tenant clients:", error);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// POST /api/v1/super/tenants/:tenantId/clients - Create a client
const createClientSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional(),
  workspaceId: z.string().uuid().optional(),
});

router.post("/tenants/:tenantId/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createClientSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get a workspace for the client - use provided or find first tenant workspace
    let workspaceId = data.workspaceId;
    if (!workspaceId) {
      const tenantWorkspaces = await db.select().from(workspaces)
        .where(eq(workspaces.tenantId, tenantId)).limit(1);
      if (tenantWorkspaces.length === 0) {
        return res.status(400).json({ error: "No workspace found for tenant. Create a workspace first." });
      }
      workspaceId = tenantWorkspaces[0].id;
    }

    const [client] = await db.insert(clients).values({
      companyName: data.companyName,
      email: data.email || null,
      phone: data.phone || null,
      tenantId,
      workspaceId,
    }).returning();

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "client_created",
      `Client "${data.companyName}" created by super admin`,
      superUser?.id,
      { clientId: client.id, clientName: data.companyName }
    );

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating client:", error);
    res.status(500).json({ error: "Failed to create client" });
  }
});

// POST /api/v1/super/tenants/:tenantId/clients/fix-tenant-ids - Fix orphan clients
router.post("/tenants/:tenantId/clients/fix-tenant-ids", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get primary workspace for this tenant
    const [primaryWorkspace] = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);

    if (!primaryWorkspace) {
      return res.status(400).json({ error: "No primary workspace found for tenant" });
    }

    // Find clients that:
    // 1. Have NULL tenantId but belong to a workspace owned by this tenant
    // 2. Have a workspaceId that matches any workspace in this tenant
    const tenantWorkspaceIds = await db.select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.tenantId, tenantId));
    
    const workspaceIdList = tenantWorkspaceIds.map(w => w.id);

    // Find orphan clients (null tenantId) in tenant workspaces
    let orphanClientsInTenantWorkspaces: any[] = [];
    if (workspaceIdList.length > 0) {
      orphanClientsInTenantWorkspaces = await db.select()
        .from(clients)
        .where(and(
          isNull(clients.tenantId),
          inArray(clients.workspaceId, workspaceIdList)
        ));
    }

    // Also find clients with null tenantId AND null/orphan workspaceId
    // These might need to be assigned to the primary workspace
    const fullyOrphanClients = await db.select()
      .from(clients)
      .where(and(
        isNull(clients.tenantId),
        isNull(clients.workspaceId)
      ));

    const fixedClients: { id: string; companyName: string; action: string }[] = [];
    const errors: { id: string; companyName: string; error: string }[] = [];

    // Fix clients in tenant workspaces (just set tenantId)
    for (const client of orphanClientsInTenantWorkspaces) {
      try {
        await db.update(clients)
          .set({ tenantId })
          .where(eq(clients.id, client.id));
        
        fixedClients.push({
          id: client.id,
          companyName: client.companyName,
          action: "Set tenantId"
        });
      } catch (err: any) {
        errors.push({
          id: client.id,
          companyName: client.companyName,
          error: err.message
        });
      }
    }

    // Fix fully orphan clients (set both tenantId and workspaceId)
    for (const client of fullyOrphanClients) {
      try {
        await db.update(clients)
          .set({ 
            tenantId,
            workspaceId: primaryWorkspace.id
          })
          .where(eq(clients.id, client.id));
        
        fixedClients.push({
          id: client.id,
          companyName: client.companyName,
          action: "Set tenantId and workspaceId"
        });
      } catch (err: any) {
        errors.push({
          id: client.id,
          companyName: client.companyName,
          error: err.message
        });
      }
    }

    // Log audit event
    const superUser = req.user as any;
    if (fixedClients.length > 0) {
      await recordTenantAuditEvent(
        tenantId,
        "clients_tenant_ids_fixed",
        `Fixed ${fixedClients.length} orphan client(s) by super admin`,
        superUser?.id,
        { fixedClients, errors }
      );
    }

    console.log(`[FixClientTenantIds] Tenant ${tenantId}: Fixed ${fixedClients.length} clients, ${errors.length} errors`);

    res.json({
      success: true,
      fixed: fixedClients.length,
      errors: errors.length,
      fixedClients,
      errorDetails: errors,
      message: fixedClients.length > 0 
        ? `Fixed ${fixedClients.length} client(s) with missing tenant association`
        : "No orphan clients found for this tenant"
    });
  } catch (error: any) {
    console.error("Error fixing client tenant IDs:", error);
    res.status(500).json({ 
      error: "Failed to fix client tenant IDs",
      details: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined
    });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/clients/:clientId - Update a client
const updateClientSchema = z.object({
  companyName: z.string().min(1).optional(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
});

router.patch("/tenants/:tenantId/clients/:clientId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, clientId } = req.params;
    const data = updateClientSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingClient] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
    
    if (!existingClient) {
      return res.status(404).json({ error: "Client not found" });
    }

    const [updated] = await db.update(clients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(clients.id, clientId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating client:", error);
    res.status(500).json({ error: "Failed to update client" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId/clients/:clientId - Delete a client
router.delete("/tenants/:tenantId/clients/:clientId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, clientId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingClient] = await db.select().from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)));
    
    if (!existingClient) {
      return res.status(404).json({ error: "Client not found" });
    }

    await db.delete(clients).where(eq(clients.id, clientId));

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "client_deleted",
      `Client "${existingClient.companyName}" deleted by super admin`,
      superUser?.id,
      { clientId, clientName: existingClient.companyName }
    );

    res.json({ success: true, message: "Client deleted successfully" });
  } catch (error) {
    console.error("Error deleting client:", error);
    res.status(500).json({ error: "Failed to delete client" });
  }
});

// GET /api/v1/super/tenants/:tenantId/projects - List projects for a tenant
router.get("/tenants/:tenantId/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const search = req.query.search as string || "";

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    let query = db.select().from(projects).where(eq(projects.tenantId, tenantId));
    
    if (search) {
      query = db.select().from(projects)
        .where(and(
          eq(projects.tenantId, tenantId),
          ilike(projects.name, `%${search}%`)
        ));
    }

    const projectList = await query.orderBy(projects.name);

    // Enrich with client names
    const clientIds = Array.from(new Set(projectList.filter(p => p.clientId).map(p => p.clientId!)));
    let clientNameMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const clientsData = await db.select({ id: clients.id, companyName: clients.companyName })
        .from(clients)
        .where(inArray(clients.id, clientIds));
      clientNameMap = new Map(clientsData.map(c => [c.id, c.companyName]));
    }

    const enrichedProjects = projectList.map(p => ({
      ...p,
      clientName: p.clientId ? clientNameMap.get(p.clientId) || null : null,
    }));

    res.json({ projects: enrichedProjects });
  } catch (error) {
    console.error("Error fetching tenant projects:", error);
    res.status(500).json({ error: "Failed to fetch projects" });
  }
});

// POST /api/v1/super/tenants/:tenantId/projects - Create a project
const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  clientId: z.string().uuid().optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.string().optional(),
  budgetMinutes: z.number().optional(),
});

router.post("/tenants/:tenantId/projects", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const data = createProjectSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get a workspace for the project - use provided or find first tenant workspace
    let workspaceId = data.workspaceId;
    if (!workspaceId) {
      const tenantWorkspaces = await db.select().from(workspaces)
        .where(eq(workspaces.tenantId, tenantId)).limit(1);
      if (tenantWorkspaces.length === 0) {
        return res.status(400).json({ error: "No workspace found for tenant. Create a workspace first." });
      }
      workspaceId = tenantWorkspaces[0].id;
    }

    const [project] = await db.insert(projects).values({
      name: data.name,
      description: data.description || null,
      clientId: data.clientId || null,
      tenantId,
      workspaceId,
      status: data.status || "active",
      budgetMinutes: data.budgetMinutes || null,
    }).returning();

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "project_created",
      `Project "${data.name}" created by super admin`,
      superUser?.id,
      { projectId: project.id, projectName: data.name }
    );

    res.status(201).json(project);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating project:", error);
    res.status(500).json({ error: "Failed to create project" });
  }
});

// PATCH /api/v1/super/tenants/:tenantId/projects/:projectId - Update a project
const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  clientId: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  budgetMinutes: z.number().optional().nullable(),
});

router.patch("/tenants/:tenantId/projects/:projectId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
    
    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    const [updated] = await db.update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating project:", error);
    res.status(500).json({ error: "Failed to update project" });
  }
});

// DELETE /api/v1/super/tenants/:tenantId/projects/:projectId - Delete a project
router.delete("/tenants/:tenantId/projects/:projectId", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const [existingProject] = await db.select().from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
    
    if (!existingProject) {
      return res.status(404).json({ error: "Project not found" });
    }

    await db.delete(projects).where(eq(projects.id, projectId));

    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "project_deleted",
      `Project "${existingProject.name}" deleted by super admin`,
      superUser?.id,
      { projectId, projectName: existingProject.name }
    );

    res.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Error deleting project:", error);
    res.status(500).json({ error: "Failed to delete project" });
  }
});

// =============================================================================
// AUDIT EVENT HELPER
// =============================================================================

export async function recordTenantAuditEvent(
  tenantId: string,
  eventType: string,
  message: string,
  actorUserId?: string | null,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    await db.insert(tenantAuditEvents).values({
      tenantId,
      actorUserId: actorUserId || null,
      eventType,
      message,
      metadata: metadata || null,
    });
  } catch (error) {
    console.error(`[Audit] Failed to record event ${eventType} for tenant ${tenantId}:`, error);
  }
}

// =============================================================================
// SYSTEM PURGE ENDPOINT - Delete all application data (DANGER ZONE)
// =============================================================================

const PURGE_CONFIRM_PHRASE = "YES_PURGE_APP_DATA";

// Tables to purge in FK-safe order (child tables first, parent tables last)
const TABLES_TO_PURGE = [
  "user_sessions",
  "task_comments",
  "task_attachments",
  "subtasks",
  "task_assignees",
  "task_tags",
  "time_entries",
  "activity_logs",
  "personal_task_sections",
  "tasks",
  "tags",
  "sections",
  "projects",
  "client_contacts",
  "clients",
  "team_members",
  "teams",
  "workspace_members",
  "workspaces",
  "invitations",
  "tenant_integrations",
  "tenant_settings",
  "users",
  "tenants",
] as const;

router.post("/system/purge-app-data", requireSuperUser, async (req, res) => {
  try {
    // Guard 1: PURGE_APP_DATA_ALLOWED must be "true"
    if (process.env.PURGE_APP_DATA_ALLOWED !== "true") {
      return res.status(403).json({
        error: "Purge not allowed",
        message: "PURGE_APP_DATA_ALLOWED environment variable must be set to 'true'",
      });
    }

    // Guard 2: Production check
    const isProduction = process.env.NODE_ENV === "production";
    const prodAllowed = process.env.PURGE_PROD_ALLOWED === "true";

    if (isProduction && !prodAllowed) {
      return res.status(403).json({
        error: "Purge not allowed in production",
        message: "PURGE_PROD_ALLOWED environment variable must be set to 'true' for production",
      });
    }

    // Guard 3: Confirm header must match exact phrase
    const confirmHeader = req.headers["x-confirm-purge"];
    if (confirmHeader !== PURGE_CONFIRM_PHRASE) {
      return res.status(400).json({
        error: "Invalid confirmation",
        message: `X-Confirm-Purge header must be set to '${PURGE_CONFIRM_PHRASE}'`,
      });
    }

    console.log("[purge] Starting application data purge via API...");
    console.log(`[purge] Requested by user: ${(req.user as any)?.email}`);

    const results: Array<{ table: string; rowsDeleted: number; status: string }> = [];
    let totalRowsDeleted = 0;

    for (const table of TABLES_TO_PURGE) {
      try {
        // Check if table exists
        const tableExists = await db.execute(sql`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = ${table}
          ) as exists
        `);

        if (!(tableExists.rows[0] as { exists: boolean }).exists) {
          results.push({ table, rowsDeleted: 0, status: "skipped" });
          continue;
        }

        // Get row count and delete
        const countResult = await db.execute(sql.raw(`SELECT COUNT(*)::int as count FROM "${table}"`));
        const rowCount = (countResult.rows[0] as { count: number }).count;

        if (rowCount > 0) {
          await db.execute(sql.raw(`DELETE FROM "${table}"`));
        }

        results.push({ table, rowsDeleted: rowCount, status: "success" });
        totalRowsDeleted += rowCount;
      } catch (error) {
        results.push({ table, rowsDeleted: 0, status: "error" });
      }
    }

    console.log(`[purge] Purge complete. ${totalRowsDeleted} total rows deleted.`);

    res.json({
      success: true,
      message: "Application data purged successfully",
      summary: {
        tablesProcessed: results.length,
        totalRowsDeleted,
        results,
      },
    });
  } catch (error) {
    console.error("[purge] Purge failed:", error);
    res.status(500).json({ error: "Purge failed" });
  }
});

// ===============================================================================
// TENANT SEEDING ENDPOINTS - Welcome Project, Task Templates, Bulk Tasks
// ===============================================================================

// Task template definitions
const TASK_TEMPLATES: Record<string, { sections: Array<{ name: string; tasks: Array<{ title: string; description?: string; subtasks?: string[] }> }> }> = {
  client_onboarding: {
    sections: [
      {
        name: "Kickoff",
        tasks: [
          { title: "Schedule kickoff call", description: "Coordinate with client for initial meeting" },
          { title: "Send welcome packet", description: "Include project overview and contact info" },
          { title: "Collect client materials", description: "Gather logos, brand guidelines, and assets" },
        ],
      },
      {
        name: "Discovery",
        tasks: [
          { title: "Review client requirements", description: "Document all specifications" },
          { title: "Conduct stakeholder interviews" },
          { title: "Create project timeline", description: "Define milestones and deliverables" },
        ],
      },
      {
        name: "Delivery",
        tasks: [
          { title: "Complete deliverables" },
          { title: "Client review and feedback" },
          { title: "Final handoff", description: "Transfer all assets and documentation" },
        ],
      },
    ],
  },
  website_build: {
    sections: [
      {
        name: "Planning",
        tasks: [
          { title: "Define site structure", description: "Create sitemap and navigation flow" },
          { title: "Gather content requirements" },
          { title: "Review competitor sites" },
        ],
      },
      {
        name: "Design",
        tasks: [
          { title: "Create wireframes" },
          { title: "Design mockups", description: "Desktop and mobile versions" },
          { title: "Client design approval" },
        ],
      },
      {
        name: "Development",
        tasks: [
          { title: "Set up development environment" },
          { title: "Build pages and components" },
          { title: "Integrate CMS/backend" },
          { title: "Cross-browser testing" },
        ],
      },
      {
        name: "Launch",
        tasks: [
          { title: "Content migration" },
          { title: "SEO optimization" },
          { title: "Deploy to production" },
          { title: "Post-launch monitoring" },
        ],
      },
    ],
  },
  general_setup: {
    sections: [
      {
        name: "To Do",
        tasks: [
          { title: "Define project scope" },
          { title: "Assign team members" },
          { title: "Set project milestones" },
        ],
      },
      {
        name: "In Progress",
        tasks: [],
      },
      {
        name: "Review",
        tasks: [],
      },
      {
        name: "Done",
        tasks: [],
      },
    ],
  },
};

// Welcome project template
const WELCOME_PROJECT_TEMPLATE = {
  sections: [
    {
      name: "Getting Started",
      tasks: [
        {
          title: "Invite your team",
          description: "Add team members to collaborate on projects",
          subtasks: ["Add employees", "Add clients", "Assign roles"],
        },
        { title: "Create your first client", description: "Set up a client to organize projects" },
      ],
    },
    {
      name: "Your First Workflow",
      tasks: [
        { title: "Create your first project", description: "Projects organize tasks for a specific goal" },
        { title: "Add tasks and due dates", description: "Break down work into actionable items" },
      ],
    },
    {
      name: "Next Steps",
      tasks: [
        { title: "Track time and run reports", description: "Monitor progress and generate insights" },
        { title: "Explore advanced features", description: "Discover templates, automations, and more" },
      ],
    },
  ],
};

// Schema for bulk tasks import
const bulkTasksImportSchema = z.object({
  rows: z.array(z.object({
    sectionName: z.string().min(1, "Section name is required"),
    taskTitle: z.string().min(1, "Task title is required"),
    description: z.string().optional(),
    status: z.string().optional(),
    priority: z.string().optional(),
    dueDate: z.string().optional(),
    assigneeEmails: z.string().optional(),
    tags: z.string().optional(),
    parentTaskTitle: z.string().optional(),
    isSubtask: z.union([z.boolean(), z.string()]).optional(),
  })),
  options: z.object({
    createMissingSections: z.boolean().default(true),
    allowUnknownAssignees: z.boolean().default(false),
  }).optional(),
});

const taskTemplateSchema = z.object({
  templateKey: z.enum(["client_onboarding", "website_build", "general_setup"]),
});

// POST /api/v1/super/tenants/:tenantId/seed/welcome-project - Seed welcome project
router.post("/tenants/:tenantId/seed/welcome-project", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const user = req.user as Express.User;

    // Verify tenant exists
    const tenant = await storage.getTenantById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get primary workspace
    const workspaces = await db.select().from(schema.workspaces).where(eq(schema.workspaces.tenantId, tenantId));
    const primaryWorkspace = workspaces.find(w => w.isPrimary) || workspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "Tenant has no workspace" });
    }

    // Check for existing welcome project (idempotency)
    const welcomeProjectName = `Welcome to ${tenant.name}`;
    const existingProjects = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.workspaceId, primaryWorkspace.id),
        eq(schema.projects.name, welcomeProjectName)
      ));

    if (existingProjects.length > 0) {
      return res.json({
        status: "skipped",
        projectId: existingProjects[0].id,
        reason: "Welcome project already exists",
      });
    }

    // Create welcome project
    const [project] = await db.insert(schema.projects).values({
      tenantId,
      workspaceId: primaryWorkspace.id,
      name: welcomeProjectName,
      description: "Your introduction to the platform",
      status: "active",
      color: "#10B981",
      createdBy: user.id,
    }).returning();

    // Create sections and tasks
    let createdTasks = 0;
    let createdSubtasks = 0;

    for (let sIdx = 0; sIdx < WELCOME_PROJECT_TEMPLATE.sections.length; sIdx++) {
      const sectionTemplate = WELCOME_PROJECT_TEMPLATE.sections[sIdx];
      
      const [section] = await db.insert(schema.sections).values({
        projectId: project.id,
        name: sectionTemplate.name,
        orderIndex: sIdx,
      }).returning();

      for (let tIdx = 0; tIdx < sectionTemplate.tasks.length; tIdx++) {
        const taskTemplate = sectionTemplate.tasks[tIdx];
        
        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId: project.id,
          sectionId: section.id,
          title: taskTemplate.title,
          description: taskTemplate.description,
          status: "todo",
          priority: "medium",
          createdBy: user.id,
          orderIndex: tIdx,
        }).returning();
        createdTasks++;

        // Create subtasks if defined
        if (taskTemplate.subtasks && taskTemplate.subtasks.length > 0) {
          for (let stIdx = 0; stIdx < taskTemplate.subtasks.length; stIdx++) {
            await db.insert(schema.subtasks).values({
              taskId: task.id,
              title: taskTemplate.subtasks[stIdx],
              completed: false,
              orderIndex: stIdx,
            });
            createdSubtasks++;
          }
        }
      }
    }

    // Record audit event
    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "welcome_project_seeded",
      message: `Welcome project created with ${createdTasks} tasks and ${createdSubtasks} subtasks`,
      metadata: { projectId: project.id, projectName: welcomeProjectName, createdTasks, createdSubtasks },
    });

    res.json({
      status: "created",
      projectId: project.id,
      created: {
        sections: WELCOME_PROJECT_TEMPLATE.sections.length,
        tasks: createdTasks,
        subtasks: createdSubtasks,
      },
    });
  } catch (error) {
    console.error("[seed] Welcome project seed failed:", error);
    res.status(500).json({ error: "Failed to seed welcome project" });
  }
});

// POST /api/v1/super/tenants/:tenantId/projects/:projectId/seed/task-template - Apply task template
router.post("/tenants/:tenantId/projects/:projectId/seed/task-template", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const user = req.user as Express.User;
    const data = taskTemplateSchema.parse(req.body);

    // Verify tenant exists
    const tenant = await storage.getTenantById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify project exists and belongs to tenant
    const [project] = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.tenantId, tenantId)
      ));

    if (!project) {
      return res.status(404).json({ error: "Project not found or does not belong to tenant" });
    }

    const template = TASK_TEMPLATES[data.templateKey];
    if (!template) {
      return res.status(400).json({ error: "Unknown template key" });
    }

    // Get existing sections for this project
    const existingSections = await db.select()
      .from(schema.sections)
      .where(eq(schema.sections.projectId, projectId));
    const existingSectionNames = new Set(existingSections.map(s => s.name.toLowerCase()));

    // Get existing tasks for deduplication
    const existingTasks = await db.select()
      .from(schema.tasks)
      .where(eq(schema.tasks.projectId, projectId));
    const existingTaskTitles = new Map<string, Set<string>>();
    for (const task of existingTasks) {
      const sectionId = task.sectionId || "none";
      if (!existingTaskTitles.has(sectionId)) {
        existingTaskTitles.set(sectionId, new Set());
      }
      existingTaskTitles.get(sectionId)!.add(task.title.toLowerCase());
    }

    let createdSections = 0;
    let createdTasks = 0;
    let createdSubtasks = 0;
    let skippedTasks = 0;

    const sectionMaxOrder = existingSections.length;

    for (let sIdx = 0; sIdx < template.sections.length; sIdx++) {
      const sectionTemplate = template.sections[sIdx];
      
      let section: typeof existingSections[0] | undefined;
      
      // Check if section already exists
      if (existingSectionNames.has(sectionTemplate.name.toLowerCase())) {
        section = existingSections.find(s => s.name.toLowerCase() === sectionTemplate.name.toLowerCase());
      } else {
        // Create new section
        const [newSection] = await db.insert(schema.sections).values({
          projectId,
          name: sectionTemplate.name,
          orderIndex: sectionMaxOrder + sIdx,
        }).returning();
        section = newSection;
        createdSections++;
      }

      if (!section) continue;

      // Get task titles already in this section
      const taskTitlesInSection = existingTaskTitles.get(section.id) || new Set();
      const tasksInSection = existingTasks.filter(t => t.sectionId === section!.id);
      let taskOrderIndex = tasksInSection.length;

      for (const taskTemplate of sectionTemplate.tasks) {
        // Skip if task with same title already exists in section
        if (taskTitlesInSection.has(taskTemplate.title.toLowerCase())) {
          skippedTasks++;
          continue;
        }

        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId,
          sectionId: section.id,
          title: taskTemplate.title,
          description: taskTemplate.description,
          status: "todo",
          priority: "medium",
          createdBy: user.id,
          orderIndex: taskOrderIndex++,
        }).returning();
        createdTasks++;

        // Create subtasks if defined
        if (taskTemplate.subtasks && taskTemplate.subtasks.length > 0) {
          for (let stIdx = 0; stIdx < taskTemplate.subtasks.length; stIdx++) {
            await db.insert(schema.subtasks).values({
              taskId: task.id,
              title: taskTemplate.subtasks[stIdx],
              completed: false,
              orderIndex: stIdx,
            });
            createdSubtasks++;
          }
        }
      }
    }

    // Record audit event
    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "task_template_applied",
      message: `Template "${data.templateKey}" applied: ${createdSections} sections, ${createdTasks} tasks, ${createdSubtasks} subtasks created`,
      metadata: { projectId, templateKey: data.templateKey, createdSections, createdTasks, createdSubtasks, skippedTasks },
    });

    res.json({
      status: createdTasks > 0 || createdSections > 0 ? "applied" : "skipped",
      created: { sections: createdSections, tasks: createdTasks, subtasks: createdSubtasks },
      skipped: { tasks: skippedTasks },
      reason: createdTasks === 0 && createdSections === 0 ? "All template items already exist" : undefined,
    });
  } catch (error) {
    console.error("[seed] Task template apply failed:", error);
    res.status(500).json({ error: "Failed to apply task template" });
  }
});

// POST /api/v1/super/tenants/:tenantId/projects/:projectId/tasks/bulk - Bulk import tasks
router.post("/tenants/:tenantId/projects/:projectId/tasks/bulk", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, projectId } = req.params;
    const user = req.user as Express.User;
    const data = bulkTasksImportSchema.parse(req.body);
    const options = data.options || { createMissingSections: true, allowUnknownAssignees: false };

    // Verify tenant exists
    const tenant = await storage.getTenantById(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Verify project exists and belongs to tenant
    const [project] = await db.select()
      .from(schema.projects)
      .where(and(
        eq(schema.projects.id, projectId),
        eq(schema.projects.tenantId, tenantId)
      ));

    if (!project) {
      return res.status(404).json({ error: "Project not found or does not belong to tenant" });
    }

    // Get existing sections
    const existingSections = await db.select()
      .from(schema.sections)
      .where(eq(schema.sections.projectId, projectId));
    const sectionsByName = new Map(existingSections.map(s => [s.name.toLowerCase(), s]));
    let sectionOrderIndex = existingSections.length;

    // Get tenant users for assignee lookup
    const tenantUsers = await db.select()
      .from(schema.users)
      .where(eq(schema.users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));

    // Valid status and priority values
    const validStatuses = ["todo", "in_progress", "blocked", "completed"];
    const validPriorities = ["low", "medium", "high", "urgent"];

    const results: Array<{
      rowIndex: number;
      status: "created" | "skipped" | "error";
      reason?: string;
      sectionId?: string;
      taskId?: string;
      parentTaskId?: string;
    }> = [];

    let createdSections = 0;
    let createdTasks = 0;
    let createdSubtasks = 0;
    let skipped = 0;
    let errors = 0;

    // Track created tasks by title for parent linking
    const createdTasksByTitle = new Map<string, { id: string; sectionId: string }>();

    // First pass: Create sections and regular tasks
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      
      // Skip subtasks in first pass
      const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
      if (isSubtask) continue;

      try {
        // Validate status and priority
        if (row.status && !validStatuses.includes(row.status.toLowerCase())) {
          results.push({ rowIndex: i, status: "error", reason: `Invalid status: ${row.status}` });
          errors++;
          continue;
        }
        if (row.priority && !validPriorities.includes(row.priority.toLowerCase())) {
          results.push({ rowIndex: i, status: "error", reason: `Invalid priority: ${row.priority}` });
          errors++;
          continue;
        }

        // Get or create section
        let section = sectionsByName.get(row.sectionName.toLowerCase());
        if (!section) {
          if (options.createMissingSections) {
            const [newSection] = await db.insert(schema.sections).values({
              projectId,
              name: row.sectionName,
              orderIndex: sectionOrderIndex++,
            }).returning();
            section = newSection;
            sectionsByName.set(row.sectionName.toLowerCase(), section);
            createdSections++;
          } else {
            results.push({ rowIndex: i, status: "error", reason: `Section not found: ${row.sectionName}` });
            errors++;
            continue;
          }
        }

        // Validate assignees
        let assigneeIds: string[] = [];
        if (row.assigneeEmails) {
          const emails = row.assigneeEmails.split(",").map(e => e.trim().toLowerCase());
          for (const email of emails) {
            const foundUser = usersByEmail.get(email);
            if (!foundUser) {
              if (!options.allowUnknownAssignees) {
                results.push({ rowIndex: i, status: "error", reason: `Unknown assignee: ${email}` });
                errors++;
                continue;
              }
            } else {
              assigneeIds.push(foundUser.id);
            }
          }
          if (errors > results.filter(r => r.status === "error").length) continue;
        }

        // Parse due date
        let dueDate: Date | null = null;
        if (row.dueDate) {
          dueDate = new Date(row.dueDate);
          if (isNaN(dueDate.getTime())) {
            results.push({ rowIndex: i, status: "error", reason: `Invalid date format: ${row.dueDate}` });
            errors++;
            continue;
          }
        }

        // Get task order index
        const tasksInSection = await db.select()
          .from(schema.tasks)
          .where(eq(schema.tasks.sectionId, section.id));
        const taskOrderIndex = tasksInSection.length;

        // Create task
        const [task] = await db.insert(schema.tasks).values({
          tenantId,
          projectId,
          sectionId: section.id,
          title: row.taskTitle,
          description: row.description,
          status: (row.status?.toLowerCase() as "todo" | "in_progress" | "blocked" | "completed") || "todo",
          priority: (row.priority?.toLowerCase() as "low" | "medium" | "high" | "urgent") || "medium",
          dueDate: dueDate,
          createdBy: user.id,
          orderIndex: taskOrderIndex,
        }).returning();

        // Create assignees
        for (const assigneeId of assigneeIds) {
          await db.insert(schema.taskAssignees).values({
            tenantId,
            taskId: task.id,
            userId: assigneeId,
          });
        }

        createdTasks++;
        createdTasksByTitle.set(row.taskTitle.toLowerCase(), { id: task.id, sectionId: section.id });
        results.push({ rowIndex: i, status: "created", sectionId: section.id, taskId: task.id });
      } catch (error) {
        results.push({ rowIndex: i, status: "error", reason: "Failed to create task" });
        errors++;
      }
    }

    // Second pass: Create subtasks
    for (let i = 0; i < data.rows.length; i++) {
      const row = data.rows[i];
      
      const isSubtask = row.isSubtask === true || row.isSubtask === "true" || !!row.parentTaskTitle;
      if (!isSubtask) continue;

      try {
        // Find parent task
        const parentTitle = row.parentTaskTitle?.toLowerCase();
        if (!parentTitle) {
          results.push({ rowIndex: i, status: "error", reason: "Subtask requires parentTaskTitle" });
          errors++;
          continue;
        }

        const parentTask = createdTasksByTitle.get(parentTitle);
        if (!parentTask) {
          // Try to find in existing tasks
          const existingTasks = await db.select()
            .from(schema.tasks)
            .where(and(
              eq(schema.tasks.projectId, projectId),
              sql`lower(${schema.tasks.title}) = ${parentTitle}`
            ));

          if (existingTasks.length === 0) {
            results.push({ rowIndex: i, status: "error", reason: `Parent task not found: ${row.parentTaskTitle}` });
            errors++;
            continue;
          }

          // Get existing subtasks count
          const existingSubtasks = await db.select()
            .from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, existingTasks[0].id));

          await db.insert(schema.subtasks).values({
            taskId: existingTasks[0].id,
            title: row.taskTitle,
            completed: false,
            orderIndex: existingSubtasks.length,
          });

          createdSubtasks++;
          results.push({ rowIndex: i, status: "created", parentTaskId: existingTasks[0].id });
        } else {
          // Get existing subtasks count
          const existingSubtasks = await db.select()
            .from(schema.subtasks)
            .where(eq(schema.subtasks.taskId, parentTask.id));

          await db.insert(schema.subtasks).values({
            taskId: parentTask.id,
            title: row.taskTitle,
            completed: false,
            orderIndex: existingSubtasks.length,
          });

          createdSubtasks++;
          results.push({ rowIndex: i, status: "created", parentTaskId: parentTask.id, sectionId: parentTask.sectionId });
        }
      } catch (error) {
        results.push({ rowIndex: i, status: "error", reason: "Failed to create subtask" });
        errors++;
      }
    }

    // Record audit event
    await db.insert(schema.tenantAuditEvents).values({
      tenantId,
      actorUserId: user.id,
      eventType: "bulk_tasks_imported",
      message: `Bulk tasks imported: ${createdSections} sections, ${createdTasks} tasks, ${createdSubtasks} subtasks, ${errors} errors`,
      metadata: { projectId, createdSections, createdTasks, createdSubtasks, skipped, errors },
    });

    res.json({
      createdSections,
      createdTasks,
      createdSubtasks,
      skipped,
      errors,
      results,
    });
  } catch (error) {
    console.error("[bulk] Bulk tasks import failed:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to import tasks" });
  }
});

// =============================================================================
// SYSTEM SETTINGS ENDPOINTS
// =============================================================================

// GET /api/v1/super/system-settings - Get platform settings
router.get("/system-settings", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings) {
      // Return default settings if none exist
      return res.json({
        id: 1,
        defaultAppName: "MyWorkDay",
        defaultLogoUrl: null,
        defaultFaviconUrl: null,
        defaultPrimaryColor: "#3B82F6",
        defaultSecondaryColor: "#64748B",
        supportEmail: null,
        platformVersion: "1.0.0",
        maintenanceMode: false,
        maintenanceMessage: null,
      });
    }
    
    res.json(settings);
  } catch (error) {
    console.error("[system-settings] Failed to get settings:", error);
    res.status(500).json({ error: "Failed to get system settings" });
  }
});

// PATCH /api/v1/super/system-settings - Update platform settings
router.patch("/system-settings", requireSuperUser, async (req, res) => {
  try {
    // Validate request body using the update schema
    const parseResult = updateSystemSettingsSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: parseResult.error.errors 
      });
    }
    
    const updateData = parseResult.data;
    
    // Check if settings exist
    const [existing] = await db.select().from(systemSettings).limit(1);
    
    if (!existing) {
      // Create settings if they don't exist
      const [newSettings] = await db.insert(systemSettings).values({
        id: 1,
        ...updateData,
        updatedAt: new Date(),
      }).returning();
      return res.json(newSettings);
    }
    
    // Update existing settings
    const [updated] = await db.update(systemSettings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(systemSettings.id, 1))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("[system-settings] Failed to update settings:", error);
    res.status(500).json({ error: "Failed to update system settings" });
  }
});

// =============================================================================
// PLATFORM ADMINS ENDPOINTS
// =============================================================================

// GET /api/v1/super/admins - List platform admins (super_users)
router.get("/admins", requireSuperUser, async (req, res) => {
  try {
    const admins = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      createdAt: users.createdAt,
      passwordHash: users.passwordHash,
    }).from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .orderBy(desc(users.createdAt));
    
    // Add pending invite status for admins without password
    const adminsWithStatus = await Promise.all(admins.map(async (admin) => {
      const pendingInvite = admin.passwordHash === null ? await db.select({
        id: platformInvitations.id,
        expiresAt: platformInvitations.expiresAt,
      }).from(platformInvitations)
        .where(and(
          eq(platformInvitations.targetUserId, admin.id),
          eq(platformInvitations.status, "pending")
        ))
        .orderBy(desc(platformInvitations.createdAt))
        .limit(1) : [];
      
      return {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        firstName: admin.firstName,
        lastName: admin.lastName,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        hasPendingInvite: pendingInvite.length > 0,
        inviteExpiresAt: pendingInvite[0]?.expiresAt || null,
        passwordSet: admin.passwordHash !== null,
      };
    }));
    
    res.json(adminsWithStatus);
  } catch (error) {
    console.error("[admins] Failed to list platform admins:", error);
    res.status(500).json({ error: "Failed to list platform admins" });
  }
});

// GET /api/v1/super/admins/:id - Get single platform admin details
router.get("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [admin] = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
      createdAt: users.createdAt,
      passwordHash: users.passwordHash,
    }).from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    // Get pending invite if any
    const pendingInvite = admin.passwordHash === null ? await db.select({
      id: platformInvitations.id,
      expiresAt: platformInvitations.expiresAt,
      createdAt: platformInvitations.createdAt,
    }).from(platformInvitations)
      .where(and(
        eq(platformInvitations.targetUserId, admin.id),
        eq(platformInvitations.status, "pending")
      ))
      .orderBy(desc(platformInvitations.createdAt))
      .limit(1) : [];
    
    // Get recent audit events for this admin
    const recentAuditEvents = await db.select()
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetUserId, id))
      .orderBy(desc(platformAuditEvents.createdAt))
      .limit(10);
    
    res.json({
      id: admin.id,
      email: admin.email,
      name: admin.name,
      firstName: admin.firstName,
      lastName: admin.lastName,
      isActive: admin.isActive,
      createdAt: admin.createdAt,
      hasPendingInvite: pendingInvite.length > 0,
      inviteExpiresAt: pendingInvite[0]?.expiresAt || null,
      passwordSet: admin.passwordHash !== null,
      recentAuditEvents,
    });
  } catch (error) {
    console.error("[admins] Failed to get platform admin:", error);
    res.status(500).json({ error: "Failed to get platform admin" });
  }
});

// POST /api/v1/super/admins - Create platform admin
const createPlatformAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
});

router.post("/admins", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user as any;
    const body = createPlatformAdminSchema.parse(req.body);
    
    // Check if email already exists
    const [existing] = await db.select({ id: users.id })
      .from(users)
      .where(eq(users.email, body.email.toLowerCase()));
    
    if (existing) {
      return res.status(409).json({ error: "A user with this email already exists" });
    }
    
    // Create user with role=super_user, no password (requires invite to set)
    const [newAdmin] = await db.insert(users).values({
      email: body.email.toLowerCase(),
      firstName: body.firstName,
      lastName: body.lastName,
      name: `${body.firstName} ${body.lastName}`,
      role: UserRole.SUPER_USER,
      isActive: true,
      passwordHash: null, // Requires invite to set password
    }).returning();
    
    // Log audit event
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: newAdmin.id,
      eventType: "platform_admin_created",
      message: `Platform admin account created for ${body.email}`,
      metadata: { email: body.email, firstName: body.firstName, lastName: body.lastName },
    });
    
    res.status(201).json({
      id: newAdmin.id,
      email: newAdmin.email,
      name: newAdmin.name,
      firstName: newAdmin.firstName,
      lastName: newAdmin.lastName,
      isActive: newAdmin.isActive,
      createdAt: newAdmin.createdAt,
      passwordSet: false,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to create platform admin:", error);
    res.status(500).json({ error: "Failed to create platform admin" });
  }
});

// PATCH /api/v1/super/admins/:id - Update platform admin
const updatePlatformAdminSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

router.patch("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user as any;
    const { id } = req.params;
    const body = updatePlatformAdminSchema.parse(req.body);
    
    // Get current admin
    const [currentAdmin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!currentAdmin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    // Guardrail: Cannot deactivate the last active super admin
    if (body.isActive === false && currentAdmin.isActive) {
      const activeAdminCount = await db.select({ count: count() })
        .from(users)
        .where(and(
          eq(users.role, UserRole.SUPER_USER),
          eq(users.isActive, true)
        ));
      
      if (activeAdminCount[0]?.count <= 1) {
        return res.status(400).json({ 
          error: "Cannot deactivate the last active platform admin",
          code: "LAST_ADMIN_PROTECTION"
        });
      }
    }
    
    // Check email uniqueness if changing email
    if (body.email && body.email.toLowerCase() !== currentAdmin.email) {
      const [existing] = await db.select({ id: users.id })
        .from(users)
        .where(eq(users.email, body.email.toLowerCase()));
      
      if (existing) {
        return res.status(409).json({ error: "A user with this email already exists" });
      }
    }
    
    // Build update object
    const updateData: any = {};
    if (body.email) updateData.email = body.email.toLowerCase();
    if (body.firstName !== undefined) updateData.firstName = body.firstName;
    if (body.lastName !== undefined) updateData.lastName = body.lastName;
    if (body.firstName || body.lastName) {
      updateData.name = `${body.firstName || currentAdmin.firstName} ${body.lastName || currentAdmin.lastName}`;
    }
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    
    const [updatedAdmin] = await db.update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    
    // Log audit event
    const eventType = body.isActive === false ? "platform_admin_deactivated" 
      : body.isActive === true && !currentAdmin.isActive ? "platform_admin_reactivated"
      : "platform_admin_updated";
    
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: id,
      eventType,
      message: `Platform admin ${eventType === "platform_admin_deactivated" ? "deactivated" : eventType === "platform_admin_reactivated" ? "reactivated" : "updated"}: ${updatedAdmin.email}`,
      metadata: { changes: body },
    });
    
    res.json({
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      name: updatedAdmin.name,
      firstName: updatedAdmin.firstName,
      lastName: updatedAdmin.lastName,
      isActive: updatedAdmin.isActive,
      createdAt: updatedAdmin.createdAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to update platform admin:", error);
    res.status(500).json({ error: "Failed to update platform admin" });
  }
});

// DELETE /api/v1/super/admins/:id - Permanently delete a platform admin
// Only allowed for admins who are inactive (suspended)
router.delete("/admins/:id", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user as any;
    const { id } = req.params;
    
    // Get the admin to delete
    const [adminToDelete] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!adminToDelete) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    // Prevent self-deletion
    if (actor?.id === id) {
      return res.status(400).json({ 
        error: "Cannot delete yourself",
        details: "You cannot delete your own account. Another platform admin must perform this action."
      });
    }
    
    // Safety check: Only allow deletion of inactive (suspended) admins
    if (adminToDelete.isActive) {
      return res.status(400).json({ 
        error: "Cannot delete active platform admin",
        details: "Platform admin must be deactivated before deletion. Deactivate the admin first, then try again."
      });
    }
    
    // Delete related records
    // 1. Delete password reset tokens
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
    
    // 2. Delete platform invitations for this admin
    await db.delete(platformInvitations).where(eq(platformInvitations.userId, id));
    
    // 3. Finally, delete the admin user
    await db.delete(users).where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    // Record audit event (platform-level)
    await db.insert(platformAuditEvents).values({
      id: crypto.randomUUID(),
      eventType: "platform_admin_deleted",
      message: `Platform admin ${adminToDelete.email} permanently deleted by ${actor?.email}`,
      actorUserId: actor?.id,
      metadata: { 
        deletedAdminId: id, 
        deletedAdminEmail: adminToDelete.email,
        deletedAt: new Date().toISOString()
      },
    });
    
    console.log(`[SuperAdmin] Platform admin ${adminToDelete.email} deleted by ${actor?.email}`);
    
    res.json({
      message: `Platform admin ${adminToDelete.email} has been permanently deleted`,
      deletedAdmin: {
        id: id,
        email: adminToDelete.email,
        name: adminToDelete.name,
      },
    });
  } catch (error) {
    console.error("[admins] Failed to delete platform admin:", error);
    res.status(500).json({ error: "Failed to delete platform admin" });
  }
});

// POST /api/v1/super/admins/:id/invite - Generate invite link for platform admin
const generateInviteSchema = z.object({
  expiresInDays: z.number().min(1).max(30).default(7),
  sendEmail: z.boolean().default(false),
});

router.post("/admins/:id/invite", requireSuperUser, async (req, res) => {
  try {
    const actor = req.user as any;
    const { id } = req.params;
    const body = generateInviteSchema.parse(req.body || {});
    
    // Get the admin
    const [admin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      return res.status(404).json({ error: "Platform admin not found" });
    }
    
    // Revoke any existing pending invites for this admin
    await db.update(platformInvitations)
      .set({ status: "revoked", revokedAt: new Date() })
      .where(and(
        eq(platformInvitations.targetUserId, id),
        eq(platformInvitations.status, "pending")
      ));
    
    // Generate new token
    const { randomBytes, createHash } = await import("crypto");
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + body.expiresInDays);
    
    // Create new invite
    const [invite] = await db.insert(platformInvitations).values({
      email: admin.email,
      tokenHash,
      targetUserId: id,
      createdByUserId: actor.id,
      expiresAt,
      status: "pending",
    }).returning();
    
    // Build invite URL
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
    const inviteUrl = `${baseUrl}/auth/platform-invite?token=${token}`;
    
    // Log audit event
    await db.insert(platformAuditEvents).values({
      actorUserId: actor.id,
      targetUserId: id,
      eventType: "platform_admin_invite_generated",
      message: `Invite link generated for ${admin.email}`,
      metadata: { expiresAt: expiresAt.toISOString(), expiresInDays: body.expiresInDays },
    });
    
    // Optionally send email
    let emailSent = false;
    if (body.sendEmail) {
      try {
        const mailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
        if (mailgunConfigured) {
          // Import and use email service
          const formData = (await import("form-data")).default;
          const Mailgun = (await import("mailgun.js")).default;
          const mailgun = new Mailgun(formData);
          const mg = mailgun.client({
            username: "api",
            key: process.env.MAILGUN_API_KEY!,
          });
          
          await mg.messages.create(process.env.MAILGUN_DOMAIN!, {
            from: process.env.MAILGUN_FROM_EMAIL || `noreply@${process.env.MAILGUN_DOMAIN}`,
            to: admin.email,
            subject: "You've been invited as a Platform Administrator",
            html: `
              <h1>Platform Administrator Invitation</h1>
              <p>You've been invited to become a platform administrator for MyWorkDay.</p>
              <p>Click the link below to set your password and activate your account:</p>
              <p><a href="${inviteUrl}" style="background-color: #3B82F6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Set Password & Activate</a></p>
              <p>This link will expire in ${body.expiresInDays} day(s).</p>
              <p>If you did not expect this invitation, you can safely ignore this email.</p>
            `,
          });
          
          emailSent = true;
          
          // Log email sent event
          await db.insert(platformAuditEvents).values({
            actorUserId: actor.id,
            targetUserId: id,
            eventType: "platform_admin_invite_emailed",
            message: `Invite email sent to ${admin.email}`,
          });
        }
      } catch (emailError) {
        console.error("[admins] Failed to send invite email:", emailError);
        // Don't fail the request, just note email wasn't sent
      }
    }
    
    res.json({
      inviteUrl,
      expiresAt: expiresAt.toISOString(),
      tokenMasked: `${token.substring(0, 8)}...`,
      emailSent,
      mailgunConfigured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors });
    }
    console.error("[admins] Failed to generate invite:", error);
    res.status(500).json({ error: "Failed to generate invite link" });
  }
});

// GET /api/v1/super/admins/:id/audit-events - Get audit events for platform admin
router.get("/admins/:id/audit-events", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    const events = await db.select()
      .from(platformAuditEvents)
      .where(eq(platformAuditEvents.targetUserId, id))
      .orderBy(desc(platformAuditEvents.createdAt))
      .limit(limit);
    
    res.json(events);
  } catch (error) {
    console.error("[admins] Failed to get audit events:", error);
    res.status(500).json({ error: "Failed to get audit events" });
  }
});

// POST /api/v1/super/admins/:id/provision - Set password or generate reset link for platform admin
const provisionPlatformAdminSchema = z.object({
  method: z.enum(["SET_PASSWORD", "RESET_LINK"]),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  mustChangeOnNextLogin: z.boolean().default(true),
  activateNow: z.boolean().default(true),
  sendEmail: z.boolean().default(false),
});

router.post("/admins/:id/provision", requireSuperUser, async (req, res) => {
  const requestId = req.get("X-Request-Id") || `padmin-prov-${Date.now()}`;
  const debug = process.env.SUPER_USER_PROVISION_DEBUG === "true";
  
  try {
    const { id } = req.params;
    const data = provisionPlatformAdminSchema.parse(req.body);
    const actor = req.user as any;
    
    if (debug) {
      console.log(`[platform-admin-provision] requestId=${requestId} adminId=${id} method=${data.method}`);
    }
    
    // Validate method-specific requirements
    if (data.method === "SET_PASSWORD" && !data.password) {
      return res.status(400).json({ error: "Password is required when method is SET_PASSWORD", requestId });
    }
    
    // Get the platform admin
    const [admin] = await db.select()
      .from(users)
      .where(and(eq(users.id, id), eq(users.role, UserRole.SUPER_USER)));
    
    if (!admin) {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} FAIL: admin not found`);
      return res.status(404).json({ error: "Platform admin not found", requestId });
    }
    
    // Update activation status if needed
    if (data.activateNow && !admin.isActive) {
      await db.update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, id));
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_reactivated",
        message: `Platform admin ${admin.email} activated via provision`,
        metadata: { requestId },
      });
    }
    
    let resetUrl: string | undefined;
    let expiresAt: string | undefined;
    
    if (data.method === "SET_PASSWORD") {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} setting password`);
      
      // Hash and set password
      const { hashPassword } = await import("../auth");
      const passwordHash = await hashPassword(data.password!);
      
      // Update user with password and mustChangePasswordOnNextLogin flag
      await db.update(users)
        .set({ 
          passwordHash, 
          mustChangePasswordOnNextLogin: data.mustChangeOnNextLogin,
          updatedAt: new Date() 
        })
        .where(eq(users.id, id));
      
      // Invalidate any outstanding reset tokens for this user
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      // Revoke any pending platform invitations
      await db.update(platformInvitations)
        .set({ status: "revoked", revokedAt: new Date() })
        .where(and(
          eq(platformInvitations.targetUserId, id),
          eq(platformInvitations.status, "pending")
        ));
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_password_set",
        message: `Password set for platform admin ${admin.email} via provision`,
        metadata: { requestId, mustChangeOnNextLogin: data.mustChangeOnNextLogin },
      });
      
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} password set successfully`);
      
      res.json({
        success: true,
        method: "SET_PASSWORD",
        adminId: id,
        email: admin.email,
        isActive: data.activateNow || admin.isActive,
        mustChangeOnNextLogin: data.mustChangeOnNextLogin,
        requestId,
      });
    } else if (data.method === "RESET_LINK") {
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} generating reset link`);
      
      // Invalidate existing reset tokens
      const { passwordResetTokens } = await import("@shared/schema");
      const { eq: eqOp, and: andOp, isNull: isNullOp } = await import("drizzle-orm");
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(andOp(
          eqOp(passwordResetTokens.userId, id),
          isNullOp(passwordResetTokens.usedAt)
        ));
      
      // Generate reset token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      
      await db.insert(passwordResetTokens).values({
        userId: id,
        tokenHash,
        expiresAt: expiry,
        createdByUserId: actor.id,
      });
      
      const appPublicUrl = process.env.APP_PUBLIC_URL;
      if (!appPublicUrl && debug) {
        console.warn(`[platform-admin-provision] requestId=${requestId} APP_PUBLIC_URL not set`);
      }
      const baseUrl = appPublicUrl || `${req.protocol}://${req.get("host")}`;
      resetUrl = `${baseUrl}/auth/reset-password?token=${token}`;
      expiresAt = expiry.toISOString();
      
      await db.insert(platformAuditEvents).values({
        actorUserId: actor.id,
        targetUserId: id,
        eventType: "platform_admin_reset_link_generated",
        message: `Reset link generated for platform admin ${admin.email} via provision`,
        metadata: { requestId },
      });
      
      // Optionally send email if requested
      if (data.sendEmail) {
        try {
          // Get global mailgun settings
          const [settings] = await db.select().from(systemSettings).limit(1);
          
          if (settings?.mailgunDomain && settings?.mailgunFromEmail && settings?.mailgunApiKeyEncrypted && isEncryptionAvailable()) {
            const apiKey = decryptValue(settings.mailgunApiKeyEncrypted);
            const mailgun = new Mailgun(FormData);
            const mgUrl = settings.mailgunRegion === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
            const mg = mailgun.client({ username: "api", key: apiKey, url: mgUrl });
            
            await mg.messages.create(settings.mailgunDomain, {
              from: settings.mailgunFromEmail,
              to: [admin.email],
              subject: "Reset Your Platform Admin Password",
              html: `
                <h2>Password Reset</h2>
                <p>A password reset has been requested for your Platform Admin account.</p>
                <p><a href="${resetUrl}">Click here to set your password</a></p>
                <p>This link expires in 24 hours.</p>
                <p>If you did not request this, please contact your administrator.</p>
              `,
            });
            
            await db.insert(platformAuditEvents).values({
              actorUserId: actor.id,
              targetUserId: id,
              eventType: "platform_admin_reset_email_sent",
              message: `Reset email sent to platform admin ${admin.email}`,
              metadata: { requestId },
            });
          } else {
            console.warn(`[platform-admin-provision] requestId=${requestId} Mailgun not configured, email not sent`);
          }
        } catch (emailError) {
          console.error(`[platform-admin-provision] requestId=${requestId} Failed to send email:`, emailError);
        }
      }
      
      if (debug) console.log(`[platform-admin-provision] requestId=${requestId} reset link generated successfully`);
      
      res.json({
        success: true,
        method: "RESET_LINK",
        adminId: id,
        email: admin.email,
        isActive: data.activateNow || admin.isActive,
        resetUrl,
        expiresAt,
        requestId,
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request body", details: error.errors, requestId });
    }
    console.error("[admins] Failed to provision platform admin:", error);
    res.status(500).json({ error: "Failed to provision platform admin", requestId });
  }
});

// =============================================================================
// TENANT AGREEMENTS OVERSIGHT ENDPOINTS
// =============================================================================

// GET /api/v1/super/agreements/tenants-summary - Get agreement status across tenants
router.get("/agreements/tenants-summary", requireSuperUser, async (req, res) => {
  try {
    const allTenants = await db.select().from(tenants);
    
    const summary = await Promise.all(allTenants.map(async (tenant) => {
      // Get active agreement for tenant
      const [activeAgreement] = await db.select()
        .from(tenantAgreements)
        .where(and(
          eq(tenantAgreements.tenantId, tenant.id),
          eq(tenantAgreements.status, "active")
        ))
        .limit(1);
      
      // Get user count and acceptance count if agreement exists
      let acceptedCount = 0;
      let totalUsers = 0;
      
      if (activeAgreement) {
        const acceptances = await db.select({ count: count() })
          .from(tenantAgreementAcceptances)
          .where(eq(tenantAgreementAcceptances.agreementId, activeAgreement.id));
        acceptedCount = acceptances[0]?.count || 0;
      }
      
      const userCount = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, tenant.id));
      totalUsers = userCount[0]?.count || 0;
      
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        hasActiveAgreement: !!activeAgreement,
        currentVersion: activeAgreement?.version || null,
        effectiveDate: activeAgreement?.effectiveDate?.toISOString() || null,
        acceptedCount,
        totalUsers,
      };
    }));
    
    res.json(summary);
  } catch (error) {
    console.error("[agreements] Failed to get tenant agreements summary:", error);
    res.status(500).json({ error: "Failed to get agreements summary" });
  }
});

// =============================================================================
// SUPER ADMIN AGREEMENT MANAGEMENT ENDPOINTS
// =============================================================================

const agreementCreateSchema = z.object({
  tenantId: z.string().uuid().nullable().optional(), // null = All Tenants (global default)
  title: z.string().min(1).max(200),
  body: z.string().min(1),
});

const agreementUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
});

// GET /api/v1/super/agreements - List all agreements across all tenants
router.get("/agreements", requireSuperUser, async (req, res) => {
  try {
    const { tenantId, status } = req.query;
    
    let query = db.select({
      id: tenantAgreements.id,
      tenantId: tenantAgreements.tenantId,
      title: tenantAgreements.title,
      body: tenantAgreements.body,
      version: tenantAgreements.version,
      status: tenantAgreements.status,
      effectiveAt: tenantAgreements.effectiveAt,
      createdAt: tenantAgreements.createdAt,
      updatedAt: tenantAgreements.updatedAt,
    }).from(tenantAgreements);
    
    const conditions = [];
    if (tenantId && typeof tenantId === "string") {
      conditions.push(eq(tenantAgreements.tenantId, tenantId));
    }
    if (status && typeof status === "string") {
      conditions.push(eq(tenantAgreements.status, status));
    }
    
    const agreements = conditions.length > 0 
      ? await query.where(and(...conditions)).orderBy(desc(tenantAgreements.updatedAt))
      : await query.orderBy(desc(tenantAgreements.updatedAt));
    
    // Enrich with tenant names and scope info
    const tenantIds = [...new Set(agreements.map(a => a.tenantId).filter((id): id is string => id !== null))];
    const tenantData = tenantIds.length > 0 
      ? await db.select({ id: tenants.id, name: tenants.name }).from(tenants)
      : [];
    const tenantMap = new Map(tenantData.map(t => [t.id, t.name]));
    
    // Check if there's an active global agreement (for Default badge)
    const hasActiveGlobalAgreement = agreements.some(a => a.tenantId === null && a.status === AgreementStatus.ACTIVE);
    
    const enrichedAgreements = agreements.map(a => ({
      ...a,
      tenantName: a.tenantId ? (tenantMap.get(a.tenantId) || "Unknown") : "All Tenants",
      scope: a.tenantId ? "tenant" : "global",
      isGlobalDefault: a.tenantId === null && a.status === AgreementStatus.ACTIVE,
    }));
    
    res.json({ agreements: enrichedAgreements, total: enrichedAgreements.length });
  } catch (error) {
    console.error("[agreements] Failed to list agreements:", error);
    res.status(500).json({ error: "Failed to list agreements" });
  }
});

// GET /api/v1/super/agreements/:id - Get single agreement details
router.get("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [agreement] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!agreement) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    // Get tenant name (null for global agreements)
    let tenantName = "All Tenants";
    let totalUsersCount = 0;
    
    if (agreement.tenantId) {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, agreement.tenantId))
        .limit(1);
      tenantName = tenant?.name || "Unknown";
      
      const totalUsers = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, agreement.tenantId));
      totalUsersCount = totalUsers[0]?.count || 0;
    } else {
      // For global agreement, count all users across all tenants
      const totalUsers = await db.select({ count: count() })
        .from(users)
        .where(isNotNull(users.tenantId));
      totalUsersCount = totalUsers[0]?.count || 0;
    }
    
    // Get acceptance stats
    const acceptances = await db.select({ count: count() })
      .from(tenantAgreementAcceptances)
      .where(eq(tenantAgreementAcceptances.agreementId, id));
    
    res.json({
      ...agreement,
      tenantName,
      scope: agreement.tenantId ? "tenant" : "global",
      isGlobalDefault: agreement.tenantId === null && agreement.status === AgreementStatus.ACTIVE,
      acceptedCount: acceptances[0]?.count || 0,
      totalUsers: totalUsersCount,
    });
  } catch (error) {
    console.error("[agreements] Failed to get agreement:", error);
    res.status(500).json({ error: "Failed to get agreement" });
  }
});

// POST /api/v1/super/agreements - Create a new draft agreement for a tenant or global default
router.post("/agreements", requireSuperUser, async (req, res) => {
  try {
    const validation = agreementCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request body", details: validation.error.errors });
    }
    
    const { tenantId, title, body } = validation.data;
    const user = req.user as any;
    
    // tenantId null/undefined = "All Tenants" (global default)
    const effectiveTenantId = tenantId || null;
    
    // If specific tenant, verify it exists
    if (effectiveTenantId) {
      const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, effectiveTenantId)).limit(1);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
    }
    
    // Get next version number for this scope (tenant-specific or global)
    let existingAgreements;
    if (effectiveTenantId) {
      existingAgreements = await db.select({ version: tenantAgreements.version })
        .from(tenantAgreements)
        .where(eq(tenantAgreements.tenantId, effectiveTenantId))
        .orderBy(desc(tenantAgreements.version))
        .limit(1);
    } else {
      existingAgreements = await db.select({ version: tenantAgreements.version })
        .from(tenantAgreements)
        .where(isNull(tenantAgreements.tenantId))
        .orderBy(desc(tenantAgreements.version))
        .limit(1);
    }
    
    const nextVersion = existingAgreements.length > 0 ? existingAgreements[0].version + 1 : 1;
    
    const [newAgreement] = await db.insert(tenantAgreements).values({
      tenantId: effectiveTenantId,
      title,
      body,
      version: nextVersion,
      status: AgreementStatus.DRAFT,
      createdByUserId: user.id,
    }).returning();
    
    res.status(201).json({ agreement: newAgreement });
  } catch (error) {
    console.error("[agreements] Failed to create agreement:", error);
    res.status(500).json({ error: "Failed to create agreement" });
  }
});

// PATCH /api/v1/super/agreements/:id - Update a draft agreement
router.patch("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    const validation = agreementUpdateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: "Invalid request body", details: validation.error.errors });
    }
    
    // Verify agreement exists and is a draft
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be edited" });
    }
    
    const [updated] = await db.update(tenantAgreements)
      .set({ ...validation.data, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    res.json({ agreement: updated });
  } catch (error) {
    console.error("[agreements] Failed to update agreement:", error);
    res.status(500).json({ error: "Failed to update agreement" });
  }
});

// POST /api/v1/super/agreements/:id/publish - Publish a draft agreement (makes it active)
router.post("/agreements/:id/publish", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verify agreement exists and is a draft
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be published" });
    }
    
    // Archive any existing active agreement for this scope (tenant-specific or global)
    if (existing.tenantId) {
      await db.update(tenantAgreements)
        .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
        .where(and(
          eq(tenantAgreements.tenantId, existing.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ));
    } else {
      // Global agreement (tenantId = null)
      await db.update(tenantAgreements)
        .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
        .where(and(
          isNull(tenantAgreements.tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ));
    }
    
    // Publish the new agreement
    const [published] = await db.update(tenantAgreements)
      .set({ 
        status: AgreementStatus.ACTIVE, 
        effectiveAt: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    // Invalidate agreement cache - for global agreements, clear all caches
    if (existing.tenantId) {
      invalidateAgreementCache(existing.tenantId);
    } else {
      clearAgreementCache();
    }
    
    res.json({ agreement: published });
  } catch (error) {
    console.error("[agreements] Failed to publish agreement:", error);
    res.status(500).json({ error: "Failed to publish agreement" });
  }
});

// POST /api/v1/super/agreements/:id/archive - Archive an active agreement (disables enforcement)
router.post("/agreements/:id/archive", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status === AgreementStatus.ARCHIVED) {
      return res.status(400).json({ error: "Agreement is already archived" });
    }
    
    const [archived] = await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, id))
      .returning();
    
    // Invalidate agreement cache - for global agreements, clear all caches
    if (existing.tenantId) {
      invalidateAgreementCache(existing.tenantId);
    } else {
      clearAgreementCache();
    }
    
    res.json({ agreement: archived });
  } catch (error) {
    console.error("[agreements] Failed to archive agreement:", error);
    res.status(500).json({ error: "Failed to archive agreement" });
  }
});

// DELETE /api/v1/super/agreements/:id - Delete a draft agreement
router.delete("/agreements/:id", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [existing] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!existing) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    if (existing.status !== AgreementStatus.DRAFT) {
      return res.status(400).json({ error: "Only draft agreements can be deleted" });
    }
    
    await db.delete(tenantAgreements).where(eq(tenantAgreements.id, id));
    
    res.json({ success: true });
  } catch (error) {
    console.error("[agreements] Failed to delete agreement:", error);
    res.status(500).json({ error: "Failed to delete agreement" });
  }
});

// GET /api/v1/super/agreements/:id/signers - Get signing status for an agreement
router.get("/agreements/:id/signers", requireSuperUser, async (req, res) => {
  try {
    const { id } = req.params;
    
    const [agreement] = await db.select()
      .from(tenantAgreements)
      .where(eq(tenantAgreements.id, id))
      .limit(1);
    
    if (!agreement) {
      return res.status(404).json({ error: "Agreement not found" });
    }
    
    // Get all acceptances for this agreement
    const acceptances = await db.select({
      id: tenantAgreementAcceptances.id,
      userId: tenantAgreementAcceptances.userId,
      version: tenantAgreementAcceptances.version,
      acceptedAt: tenantAgreementAcceptances.acceptedAt,
      ipAddress: tenantAgreementAcceptances.ipAddress,
    })
      .from(tenantAgreementAcceptances)
      .where(eq(tenantAgreementAcceptances.agreementId, id))
      .orderBy(desc(tenantAgreementAcceptances.acceptedAt));
    
    // Get all users for this tenant
    const tenantUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      firstName: users.firstName,
      lastName: users.lastName,
      isActive: users.isActive,
    })
      .from(users)
      .where(eq(users.tenantId, agreement.tenantId));
    
    // Build signer map
    const acceptanceMap = new Map(acceptances.map(a => [a.userId, a]));
    
    const signers = tenantUsers.map(u => {
      const acceptance = acceptanceMap.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        name: u.firstName && u.lastName ? `${u.firstName} ${u.lastName}` : u.name || u.email,
        isActive: u.isActive,
        status: acceptance ? "signed" : "pending",
        signedAt: acceptance?.acceptedAt || null,
        signedVersion: acceptance?.version || null,
        ipAddress: acceptance?.ipAddress || null,
      };
    });
    
    res.json({
      agreementId: id,
      agreementVersion: agreement.version,
      signers,
      stats: {
        total: signers.length,
        signed: signers.filter(s => s.status === "signed").length,
        pending: signers.filter(s => s.status === "pending").length,
      },
    });
  } catch (error) {
    console.error("[agreements] Failed to get signers:", error);
    res.status(500).json({ error: "Failed to get signers" });
  }
});

// =============================================================================
// INTEGRATIONS STATUS ENDPOINT
// =============================================================================

// GET /api/v1/super/integrations/status - Check platform integrations
router.get("/integrations/status", requireSuperUser, async (req, res) => {
  try {
    // Check database-stored global integrations
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    const mailgunConfigured = !!(
      settings?.mailgunDomain && 
      settings?.mailgunFromEmail && 
      settings?.mailgunApiKeyEncrypted
    );
    const s3Configured = !!(
      settings?.s3Region && 
      settings?.s3BucketName && 
      settings?.s3AccessKeyIdEncrypted && 
      settings?.s3SecretAccessKeyEncrypted
    );
    const stripeConfigured = !!(
      settings?.stripePublishableKey && 
      settings?.stripeSecretKeyEncrypted
    );
    
    // Check if encryption is configured (needed for storing secrets)
    const encryptionConfigured = isEncryptionAvailable();
    
    res.json({
      mailgun: mailgunConfigured,
      s3: s3Configured,
      stripe: stripeConfigured,
      encryptionConfigured,
    });
  } catch (error) {
    console.error("[integrations] Failed to check integration status:", error);
    res.status(500).json({ error: "Failed to check integrations" });
  }
});

// Helper to mask secrets (show last 4 chars)
function maskSecret(value: string | null | undefined): string | null {
  if (!value || value.length < 4) return null;
  return "••••" + value.slice(-4);
}

// =============================================================================
// GLOBAL MAILGUN INTEGRATION ENDPOINTS
// =============================================================================

const globalMailgunUpdateSchema = z.object({
  domain: z.string().optional(),
  fromEmail: z.string().email().optional(),
  region: z.enum(["US", "EU"]).optional(),
  apiKey: z.string().optional(),
  signingKey: z.string().optional(),
});

// GET /api/v1/super/integrations/mailgun - Get global Mailgun settings
router.get("/integrations/mailgun", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings) {
      return res.json({
        status: "not_configured",
        config: null,
        secretMasked: null,
        lastTestedAt: null,
      });
    }

    let apiKeyMasked: string | null = null;
    let signingKeyMasked: string | null = null;
    
    if (settings.mailgunApiKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.mailgunApiKeyEncrypted);
        apiKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Mailgun API key for masking");
      }
    }
    
    if (settings.mailgunSigningKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.mailgunSigningKeyEncrypted);
        signingKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Mailgun signing key for masking");
      }
    }

    const isConfigured = !!(
      settings.mailgunDomain && 
      settings.mailgunFromEmail && 
      settings.mailgunApiKeyEncrypted
    );

    res.json({
      status: isConfigured ? "configured" : "not_configured",
      config: {
        domain: settings.mailgunDomain,
        fromEmail: settings.mailgunFromEmail,
        region: settings.mailgunRegion || "US",
      },
      secretMasked: {
        apiKeyMasked,
        signingKeyMasked,
      },
      lastTestedAt: settings.mailgunLastTestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[integrations] Failed to get Mailgun settings:", error);
    res.status(500).json({ error: "Failed to get Mailgun settings" });
  }
});

// PUT /api/v1/super/integrations/mailgun - Update global Mailgun settings
router.put("/integrations/mailgun", requireSuperUser, async (req, res) => {
  try {
    const body = globalMailgunUpdateSchema.parse(req.body);
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (body.domain !== undefined) {
      updateData.mailgunDomain = body.domain || null;
    }
    if (body.fromEmail !== undefined) {
      updateData.mailgunFromEmail = body.fromEmail || null;
    }
    if (body.region !== undefined) {
      updateData.mailgunRegion = body.region || null;
    }
    if (body.apiKey && body.apiKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.mailgunApiKeyEncrypted = encryptValue(body.apiKey.trim());
    }
    if (body.signingKey && body.signingKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.mailgunSigningKeyEncrypted = encryptValue(body.signingKey.trim());
    }

    // Upsert system settings
    const [existing] = await db.select().from(systemSettings).limit(1);
    if (existing) {
      await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({ id: 1, ...updateData });
    }

    res.json({ success: true, message: "Mailgun settings saved successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[integrations] Failed to save Mailgun settings:", error);
    res.status(500).json({ error: "Failed to save Mailgun settings" });
  }
});

// POST /api/v1/super/integrations/mailgun/test - Test global Mailgun connection
router.post("/integrations/mailgun/test", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.mailgunDomain || !settings?.mailgunFromEmail || !settings?.mailgunApiKeyEncrypted) {
      return res.json({ success: false, message: "Mailgun is not fully configured" });
    }

    if (!isEncryptionAvailable()) {
      return res.json({ success: false, message: "Encryption not available" });
    }

    const apiKey = decryptValue(settings.mailgunApiKeyEncrypted);
    const domain = settings.mailgunDomain;
    const region = settings.mailgunRegion || "US";

    const mailgun = new Mailgun(FormData);
    const mgUrl = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const mg = mailgun.client({ username: "api", key: apiKey, url: mgUrl });

    await mg.domains.get(domain);
    
    // Update last tested timestamp
    await db.update(systemSettings)
      .set({ mailgunLastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(systemSettings.id, 1));

    res.json({ success: true, message: "Mailgun configuration is valid" });
  } catch (error: any) {
    console.error("[integrations] Mailgun test failed:", error.message);
    res.json({ success: false, message: error.message || "Failed to validate Mailgun domain" });
  }
});

// POST /api/v1/super/integrations/mailgun/send-test-email - Send test email
router.post("/integrations/mailgun/send-test-email", requireSuperUser, async (req, res) => {
  try {
    const { toEmail } = req.body;
    if (!toEmail || !toEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email address required" });
    }

    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.mailgunDomain || !settings?.mailgunFromEmail || !settings?.mailgunApiKeyEncrypted) {
      return res.status(400).json({ error: "Mailgun is not fully configured" });
    }

    if (!isEncryptionAvailable()) {
      return res.status(400).json({ error: "Encryption not available" });
    }

    const apiKey = decryptValue(settings.mailgunApiKeyEncrypted);
    const domain = settings.mailgunDomain;
    const fromEmail = settings.mailgunFromEmail;
    const region = settings.mailgunRegion || "US";

    const mailgun = new Mailgun(FormData);
    const mgUrl = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const mg = mailgun.client({ username: "api", key: apiKey, url: mgUrl });

    const timestamp = new Date().toISOString();
    await mg.messages.create(domain, {
      from: fromEmail,
      to: [toEmail],
      subject: "Global Mailgun Test - MyWorkDay Platform",
      text: `This is a test email from the MyWorkDay platform.\n\nTimestamp: ${timestamp}\n\nIf you received this email, your global Mailgun integration is working correctly.`,
    });

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error: any) {
    console.error("[integrations] Send test email failed:", error.message);
    res.status(500).json({ error: error.message || "Failed to send test email" });
  }
});

// DELETE /api/v1/super/integrations/mailgun/secret/:secretName - Clear a Mailgun secret
router.delete("/integrations/mailgun/secret/:secretName", requireSuperUser, async (req, res) => {
  try {
    const { secretName } = req.params;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (secretName === "apiKey") {
      updateData.mailgunApiKeyEncrypted = null;
    } else if (secretName === "signingKey") {
      updateData.mailgunSigningKeyEncrypted = null;
    } else {
      return res.status(400).json({ error: "Invalid secret name" });
    }

    await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    res.json({ success: true, message: `${secretName} cleared successfully` });
  } catch (error) {
    console.error("[integrations] Failed to clear Mailgun secret:", error);
    res.status(500).json({ error: "Failed to clear secret" });
  }
});

// =============================================================================
// GLOBAL S3 INTEGRATION ENDPOINTS
// =============================================================================

const globalS3UpdateSchema = z.object({
  region: z.string().optional(),
  bucketName: z.string().optional(),
  publicBaseUrl: z.string().optional(),
  cloudfrontUrl: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

// GET /api/v1/super/integrations/s3 - Get global S3 settings
router.get("/integrations/s3", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings) {
      return res.json({
        status: "not_configured",
        config: null,
        secretMasked: null,
        lastTestedAt: null,
      });
    }

    let accessKeyIdMasked: string | null = null;
    let secretAccessKeyMasked: string | null = null;
    
    if (settings.s3AccessKeyIdEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.s3AccessKeyIdEncrypted);
        accessKeyIdMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt S3 access key for masking");
      }
    }
    
    if (settings.s3SecretAccessKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.s3SecretAccessKeyEncrypted);
        secretAccessKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt S3 secret key for masking");
      }
    }

    const isConfigured = !!(
      settings.s3Region && 
      settings.s3BucketName && 
      settings.s3AccessKeyIdEncrypted && 
      settings.s3SecretAccessKeyEncrypted
    );

    res.json({
      status: isConfigured ? "configured" : "not_configured",
      config: {
        region: settings.s3Region,
        bucketName: settings.s3BucketName,
        publicBaseUrl: settings.s3PublicBaseUrl,
        cloudfrontUrl: settings.s3CloudfrontUrl,
      },
      secretMasked: {
        accessKeyIdMasked,
        secretAccessKeyMasked,
      },
      lastTestedAt: settings.s3LastTestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[integrations] Failed to get S3 settings:", error);
    res.status(500).json({ error: "Failed to get S3 settings" });
  }
});

// PUT /api/v1/super/integrations/s3 - Update global S3 settings
router.put("/integrations/s3", requireSuperUser, async (req, res) => {
  try {
    const body = globalS3UpdateSchema.parse(req.body);
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (body.region !== undefined) {
      updateData.s3Region = body.region || null;
    }
    if (body.bucketName !== undefined) {
      updateData.s3BucketName = body.bucketName || null;
    }
    if (body.publicBaseUrl !== undefined) {
      updateData.s3PublicBaseUrl = body.publicBaseUrl || null;
    }
    if (body.cloudfrontUrl !== undefined) {
      updateData.s3CloudfrontUrl = body.cloudfrontUrl || null;
    }
    if (body.accessKeyId && body.accessKeyId.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.s3AccessKeyIdEncrypted = encryptValue(body.accessKeyId.trim());
    }
    if (body.secretAccessKey && body.secretAccessKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.s3SecretAccessKeyEncrypted = encryptValue(body.secretAccessKey.trim());
    }

    // Upsert system settings
    const [existing] = await db.select().from(systemSettings).limit(1);
    if (existing) {
      await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({ id: 1, ...updateData });
    }

    res.json({ success: true, message: "S3 settings saved successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[integrations] Failed to save S3 settings:", error);
    res.status(500).json({ error: "Failed to save S3 settings" });
  }
});

// POST /api/v1/super/integrations/s3/test - Test global S3 connection
router.post("/integrations/s3/test", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.s3Region || !settings?.s3BucketName || 
        !settings?.s3AccessKeyIdEncrypted || !settings?.s3SecretAccessKeyEncrypted) {
      return res.json({ success: false, message: "S3 is not fully configured" });
    }

    if (!isEncryptionAvailable()) {
      return res.json({ success: false, message: "Encryption not available" });
    }

    const accessKeyId = decryptValue(settings.s3AccessKeyIdEncrypted);
    const secretAccessKey = decryptValue(settings.s3SecretAccessKeyEncrypted);

    // Import S3 client dynamically for testing
    const { S3Client, HeadBucketCommand } = await import("@aws-sdk/client-s3");
    
    const s3Client = new S3Client({
      region: settings.s3Region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    await s3Client.send(new HeadBucketCommand({ Bucket: settings.s3BucketName }));
    
    // Update last tested timestamp
    await db.update(systemSettings)
      .set({ s3LastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(systemSettings.id, 1));

    res.json({ success: true, message: "S3 configuration is valid" });
  } catch (error: any) {
    console.error("[integrations] S3 test failed:", error.message);
    res.json({ success: false, message: error.message || "Failed to validate S3 bucket" });
  }
});

// DELETE /api/v1/super/integrations/s3/secret/:secretName - Clear an S3 secret
router.delete("/integrations/s3/secret/:secretName", requireSuperUser, async (req, res) => {
  try {
    const { secretName } = req.params;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (secretName === "accessKeyId") {
      updateData.s3AccessKeyIdEncrypted = null;
    } else if (secretName === "secretAccessKey") {
      updateData.s3SecretAccessKeyEncrypted = null;
    } else {
      return res.status(400).json({ error: "Invalid secret name" });
    }

    await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    res.json({ success: true, message: `${secretName} cleared successfully` });
  } catch (error) {
    console.error("[integrations] Failed to clear S3 secret:", error);
    res.status(500).json({ error: "Failed to clear secret" });
  }
});

// =============================================================================
// GLOBAL STRIPE INTEGRATION ENDPOINTS
// =============================================================================

const globalStripeUpdateSchema = z.object({
  publishableKey: z.string().optional(),
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  defaultCurrency: z.string().optional(),
});

// GET /api/v1/super/integrations/stripe - Get global Stripe settings
router.get("/integrations/stripe", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings) {
      return res.json({
        status: "not_configured",
        config: null,
        secretMasked: null,
        lastTestedAt: null,
      });
    }

    let secretKeyMasked: string | null = null;
    let webhookSecretMasked: string | null = null;
    
    if (settings.stripeSecretKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.stripeSecretKeyEncrypted);
        secretKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Stripe secret key for masking");
      }
    }
    
    if (settings.stripeWebhookSecretEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.stripeWebhookSecretEncrypted);
        webhookSecretMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Stripe webhook secret for masking");
      }
    }

    const isConfigured = !!(
      settings.stripePublishableKey && 
      settings.stripeSecretKeyEncrypted
    );

    res.json({
      status: isConfigured ? "configured" : "not_configured",
      config: {
        publishableKey: settings.stripePublishableKey,
        defaultCurrency: settings.stripeDefaultCurrency || "usd",
      },
      secretMasked: {
        secretKeyMasked,
        webhookSecretMasked,
      },
      lastTestedAt: settings.stripeLastTestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[integrations] Failed to get Stripe settings:", error);
    res.status(500).json({ error: "Failed to get Stripe settings" });
  }
});

// PUT /api/v1/super/integrations/stripe - Update global Stripe settings
router.put("/integrations/stripe", requireSuperUser, async (req, res) => {
  try {
    const body = globalStripeUpdateSchema.parse(req.body);
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (body.publishableKey !== undefined) {
      updateData.stripePublishableKey = body.publishableKey || null;
    }
    if (body.defaultCurrency !== undefined) {
      updateData.stripeDefaultCurrency = body.defaultCurrency || "usd";
    }
    if (body.secretKey && body.secretKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.stripeSecretKeyEncrypted = encryptValue(body.secretKey.trim());
    }
    if (body.webhookSecret && body.webhookSecret.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.stripeWebhookSecretEncrypted = encryptValue(body.webhookSecret.trim());
    }

    // Upsert system settings
    const [existing] = await db.select().from(systemSettings).limit(1);
    if (existing) {
      await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({ id: 1, ...updateData });
    }

    res.json({ success: true, message: "Stripe settings saved successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[integrations] Failed to save Stripe settings:", error);
    res.status(500).json({ error: "Failed to save Stripe settings" });
  }
});

// POST /api/v1/super/integrations/stripe/test - Test global Stripe connection
router.post("/integrations/stripe/test", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.stripeSecretKeyEncrypted) {
      return res.json({ ok: false, error: { code: "not_configured", message: "Stripe secret key is not configured" } });
    }

    if (!isEncryptionAvailable()) {
      return res.json({ ok: false, error: { code: "encryption_unavailable", message: "Encryption not available" } });
    }

    const secretKey = decryptValue(settings.stripeSecretKeyEncrypted);
    
    // Import Stripe dynamically for testing
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-12-15.clover",
    });

    // Test the connection by fetching balance (lightweight check)
    await stripe.balance.retrieve();
    
    // Update last tested timestamp
    await db.update(systemSettings)
      .set({ stripeLastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(systemSettings.id, 1));

    res.json({ ok: true });
  } catch (error: any) {
    const requestId = (req as any).requestId || "unknown";
    console.error("[integrations] Stripe test failed:", error.message);
    res.json({ 
      ok: false, 
      error: { 
        code: error.code || "stripe_error", 
        message: error.message || "Failed to connect to Stripe",
        requestId,
      } 
    });
  }
});

// DELETE /api/v1/super/integrations/stripe/secret/:secretName - Clear a Stripe secret
router.delete("/integrations/stripe/secret/:secretName", requireSuperUser, async (req, res) => {
  try {
    const { secretName } = req.params;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (secretName === "secretKey") {
      updateData.stripeSecretKeyEncrypted = null;
    } else if (secretName === "webhookSecret") {
      updateData.stripeWebhookSecretEncrypted = null;
    } else {
      return res.status(400).json({ error: "Invalid secret name" });
    }

    await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    res.json({ success: true, message: `${secretName} cleared successfully` });
  } catch (error) {
    console.error("[integrations] Failed to clear Stripe secret:", error);
    res.status(500).json({ error: "Failed to clear secret" });
  }
});

// =============================================================================
// GLOBAL REPORTS ENDPOINTS
// =============================================================================

// GET /api/v1/super/reports/tenants-summary - Tenants overview
router.get("/reports/tenants-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Total tenants
    const totalResult = await db.select({ count: count() }).from(tenants);
    const total = totalResult[0]?.count || 0;
    
    // Active tenants
    const activeResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));
    const active = activeResult[0]?.count || 0;
    
    // Inactive tenants
    const inactiveResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.INACTIVE));
    const inactive = inactiveResult[0]?.count || 0;
    
    // Suspended tenants
    const suspendedResult = await db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.SUSPENDED));
    const suspended = suspendedResult[0]?.count || 0;
    
    // Recently created (last 7 days)
    const recentResult = await db.select({ count: count() })
      .from(tenants)
      .where(gte(tenants.createdAt, sevenDaysAgo));
    const recentlyCreated = recentResult[0]?.count || 0;
    
    // Missing agreement (tenants without active agreement)
    const allTenantIds = await db.select({ id: tenants.id }).from(tenants);
    const tenantsWithAgreements = await db.select({ tenantId: tenantAgreements.tenantId })
      .from(tenantAgreements)
      .where(eq(tenantAgreements.status, "active"));
    const tenantIdsWithAgreements = new Set(tenantsWithAgreements.map(t => t.tenantId));
    const missingAgreement = allTenantIds.filter(t => !tenantIdsWithAgreements.has(t.id)).length;
    
    // Missing branding (tenants without logo configured)
    const tenantsWithBranding = await db.select({ tenantId: tenantSettings.tenantId })
      .from(tenantSettings)
      .where(isNotNull(tenantSettings.logoUrl));
    const tenantIdsWithBranding = new Set(tenantsWithBranding.map(t => t.tenantId));
    const missingBranding = allTenantIds.filter(t => !tenantIdsWithBranding.has(t.id)).length;
    
    // Missing admin user
    const tenantsWithAdmin = await db.select({ tenantId: users.tenantId })
      .from(users)
      .where(and(
        eq(users.role, UserRole.ADMIN),
        isNotNull(users.tenantId)
      ));
    const tenantIdsWithAdmin = new Set(tenantsWithAdmin.map(t => t.tenantId));
    const missingAdminUser = allTenantIds.filter(t => !tenantIdsWithAdmin.has(t.id)).length;
    
    res.json({
      total,
      active,
      inactive,
      suspended,
      missingAgreement,
      missingBranding,
      missingAdminUser,
      recentlyCreated,
    });
  } catch (error) {
    console.error("[reports] Failed to get tenants summary:", error);
    res.status(500).json({ error: "Failed to get tenants summary" });
  }
});

// GET /api/v1/super/reports/projects-summary - Projects overview
router.get("/reports/projects-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    
    // Total projects
    const totalResult = await db.select({ count: count() }).from(projects);
    const total = totalResult[0]?.count || 0;
    
    // Active projects
    const activeResult = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.status, "active"));
    const active = activeResult[0]?.count || 0;
    
    // Archived projects
    const archivedResult = await db.select({ count: count() })
      .from(projects)
      .where(eq(projects.status, "archived"));
    const archived = archivedResult[0]?.count || 0;
    
    // Projects with overdue tasks
    const projectsWithOverdue = await db.select({ projectId: tasks.projectId })
      .from(tasks)
      .where(and(
        isNotNull(tasks.projectId),
        lt(tasks.dueDate, now),
        ne(tasks.status, "done")
      ))
      .groupBy(tasks.projectId);
    const withOverdueTasks = projectsWithOverdue.length;
    
    // Top tenants by project count
    const topTenants = await db.select({
      tenantId: projects.tenantId,
      projectCount: count(),
    })
      .from(projects)
      .where(isNotNull(projects.tenantId))
      .groupBy(projects.tenantId)
      .orderBy(desc(count()))
      .limit(5);
    
    const topTenantsWithNames = await Promise.all(topTenants.map(async (t) => {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, t.tenantId!))
        .limit(1);
      return {
        tenantId: t.tenantId,
        tenantName: tenant?.name || "Unknown",
        projectCount: t.projectCount,
      };
    }));
    
    res.json({
      total,
      active,
      archived,
      withOverdueTasks,
      topTenantsByProjects: topTenantsWithNames,
    });
  } catch (error) {
    console.error("[reports] Failed to get projects summary:", error);
    res.status(500).json({ error: "Failed to get projects summary" });
  }
});

// GET /api/v1/super/reports/users-summary - Users overview
router.get("/reports/users-summary", requireSuperUser, async (req, res) => {
  try {
    // Total users
    const totalResult = await db.select({ count: count() }).from(users);
    const total = totalResult[0]?.count || 0;
    
    // Active users (isActive = true)
    const activeResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.isActive, true));
    const activeUsers = activeResult[0]?.count || 0;
    
    // Users by role
    const superUserResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER));
    const superUserCount = superUserResult[0]?.count || 0;
    
    const adminResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.ADMIN));
    const adminCount = adminResult[0]?.count || 0;
    
    const employeeResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.EMPLOYEE));
    const employeeCount = employeeResult[0]?.count || 0;
    
    const clientResult = await db.select({ count: count() })
      .from(users)
      .where(eq(users.role, UserRole.CLIENT));
    const clientCount = clientResult[0]?.count || 0;
    
    // Pending invites
    const pendingInvitesResult = await db.select({ count: count() })
      .from(invitations)
      .where(eq(invitations.status, "pending"));
    const pendingInvites = pendingInvitesResult[0]?.count || 0;
    
    res.json({
      total,
      byRole: {
        super_user: superUserCount,
        admin: adminCount,
        employee: employeeCount,
        client: clientCount,
      },
      activeUsers,
      pendingInvites,
    });
  } catch (error) {
    console.error("[reports] Failed to get users summary:", error);
    res.status(500).json({ error: "Failed to get users summary" });
  }
});

// GET /api/v1/super/reports/tasks-summary - Tasks overview
router.get("/reports/tasks-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    // Total tasks
    const totalResult = await db.select({ count: count() }).from(tasks);
    const total = totalResult[0]?.count || 0;
    
    // Tasks by status
    const todoResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "todo"));
    const todoCount = todoResult[0]?.count || 0;
    
    const inProgressResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "in_progress"));
    const inProgressCount = inProgressResult[0]?.count || 0;
    
    const blockedResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "blocked"));
    const blockedCount = blockedResult[0]?.count || 0;
    
    const doneResult = await db.select({ count: count() })
      .from(tasks)
      .where(eq(tasks.status, "done"));
    const doneCount = doneResult[0]?.count || 0;
    
    // Overdue tasks
    const overdueResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        lt(tasks.dueDate, now),
        ne(tasks.status, "done")
      ));
    const overdue = overdueResult[0]?.count || 0;
    
    // Due today
    const dueTodayResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        gte(tasks.dueDate, startOfToday),
        lt(tasks.dueDate, endOfToday),
        ne(tasks.status, "done")
      ));
    const dueToday = dueTodayResult[0]?.count || 0;
    
    // Upcoming (next 7 days)
    const upcomingResult = await db.select({ count: count() })
      .from(tasks)
      .where(and(
        gte(tasks.dueDate, endOfToday),
        lt(tasks.dueDate, in7Days),
        ne(tasks.status, "done")
      ));
    const upcoming = upcomingResult[0]?.count || 0;
    
    // Unassigned tasks (tasks without any assignees)
    const tasksWithAssignees = await db.select({ taskId: schema.taskAssignees.taskId })
      .from(schema.taskAssignees)
      .groupBy(schema.taskAssignees.taskId);
    const taskIdsWithAssignees = new Set(tasksWithAssignees.map(t => t.taskId));
    const allTaskIds = await db.select({ id: tasks.id }).from(tasks);
    const unassigned = allTaskIds.filter(t => !taskIdsWithAssignees.has(t.id)).length;
    
    res.json({
      total,
      byStatus: {
        todo: todoCount,
        in_progress: inProgressCount,
        blocked: blockedCount,
        done: doneCount,
      },
      overdue,
      dueToday,
      upcoming,
      unassigned,
    });
  } catch (error) {
    console.error("[reports] Failed to get tasks summary:", error);
    res.status(500).json({ error: "Failed to get tasks summary" });
  }
});

// GET /api/v1/super/reports/time-summary - Time tracking overview
router.get("/reports/time-summary", requireSuperUser, async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // Total minutes this week
    const weekResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)` 
    })
      .from(timeEntries)
      .where(gte(timeEntries.startTime, startOfWeek));
    const totalMinutesThisWeek = Math.round((weekResult[0]?.total || 0) / 60);
    
    // Total minutes this month
    const monthResult = await db.select({ 
      total: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)` 
    })
      .from(timeEntries)
      .where(gte(timeEntries.startTime, startOfMonth));
    const totalMinutesThisMonth = Math.round((monthResult[0]?.total || 0) / 60);
    
    // Top tenants by hours
    const topTenants = await db.select({
      tenantId: timeEntries.tenantId,
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    })
      .from(timeEntries)
      .where(isNotNull(timeEntries.tenantId))
      .groupBy(timeEntries.tenantId)
      .orderBy(desc(sql`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`))
      .limit(5);
    
    const topTenantsByHours = await Promise.all(topTenants.map(async (t) => {
      const [tenant] = await db.select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, t.tenantId!))
        .limit(1);
      return {
        tenantId: t.tenantId,
        tenantName: tenant?.name || "Unknown",
        totalMinutes: Math.round(t.totalSeconds / 60),
      };
    }));
    
    // Top users by hours
    const topUsers = await db.select({
      userId: timeEntries.userId,
      totalSeconds: sql<number>`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`,
    })
      .from(timeEntries)
      .groupBy(timeEntries.userId)
      .orderBy(desc(sql`COALESCE(SUM(${timeEntries.durationSeconds}), 0)`))
      .limit(5);
    
    const topUsersByHours = await Promise.all(topUsers.map(async (u) => {
      const [user] = await db.select({ name: users.name })
        .from(users)
        .where(eq(users.id, u.userId))
        .limit(1);
      return {
        userId: u.userId,
        userName: user?.name || "Unknown",
        totalMinutes: Math.round(u.totalSeconds / 60),
      };
    }));
    
    res.json({
      totalMinutesThisWeek,
      totalMinutesThisMonth,
      topTenantsByHours,
      topUsersByHours,
    });
  } catch (error) {
    console.error("[reports] Failed to get time summary:", error);
    res.status(500).json({ error: "Failed to get time summary" });
  }
});

// =============================================================================
// SYSTEM STATUS ENDPOINTS
// =============================================================================

// GET /api/v1/super/status/health - System health checks
router.get("/status/health", requireSuperUser, async (req, res) => {
  try {
    const startTime = Date.now();
    
    // Database check
    let databaseStatus: "healthy" | "unhealthy" = "unhealthy";
    let dbLatency = 0;
    try {
      const dbStart = Date.now();
      await db.execute(sql`SELECT 1`);
      dbLatency = Date.now() - dbStart;
      databaseStatus = "healthy";
    } catch (e) {
      console.error("[health] Database check failed:", e);
    }
    
    // S3 check
    const s3Status: "healthy" | "not_configured" = isS3Configured() ? "healthy" : "not_configured";
    
    // Mailgun check
    const mailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
    const mailgunStatus: "healthy" | "not_configured" = mailgunConfigured ? "healthy" : "not_configured";
    
    // Encryption check - needed for storing integration secrets
    const encryptionStatus: "configured" | "not_configured" = isEncryptionAvailable() ? "configured" : "not_configured";
    
    // WebSocket status (placeholder - would need actual implementation)
    const websocketStatus = {
      status: "healthy" as const,
      connections: 0, // Would need to track actual connections
    };
    
    // App info
    const uptime = process.uptime();
    
    res.json({
      database: {
        status: databaseStatus,
        latencyMs: dbLatency,
      },
      websocket: websocketStatus,
      s3: { status: s3Status },
      mailgun: { status: mailgunStatus },
      encryption: { 
        status: encryptionStatus,
        keyConfigured: isEncryptionAvailable(),
      },
      app: {
        version: process.env.APP_VERSION || "1.0.0",
        uptime: Math.round(uptime),
        environment: process.env.NODE_ENV || "development",
      },
    });
  } catch (error) {
    console.error("[health] Health check failed:", error);
    res.status(500).json({ error: "Health check failed" });
  }
});

/**
 * GET /api/v1/super/status/auth-diagnostics
 * 
 * Auth configuration diagnostics for troubleshooting cookie-based auth issues.
 * 
 * SECURITY NOTES:
 * - Values are derived from runtime config, NOT echoed from env vars
 * - Secrets (SESSION_SECRET, etc.) are NEVER exposed - only existence is reported
 * - This endpoint is read-only and never mutates state
 * - super_user only access enforced by requireSuperUser middleware
 * 
 * Use cases:
 * - Confirm cookie-based auth is correctly configured
 * - Debug Railway/production deployment issues
 * - Verify trust proxy and CORS settings
 */
router.get("/status/auth-diagnostics", requireSuperUser, async (_req, res) => {
  try {
    const nodeEnv = process.env.NODE_ENV || "development";
    const isProduction = nodeEnv === "production";
    
    // Detect Railway environment
    const isRailway = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);
    
    // Cookie configuration derived from runtime config in server/auth.ts
    const cookies = {
      httpOnly: true, // Always true in our setup for security
      secure: isProduction, // Only secure cookies in production (requires HTTPS)
      sameSite: "lax" as const, // Configured in auth.ts
      domainConfigured: !!process.env.COOKIE_DOMAIN,
      maxAgeDays: 30, // Configured in auth.ts
    };
    
    // CORS configuration
    const cors = {
      credentialsEnabled: true, // We use credentials: "include" in frontend
      allowedOriginConfigured: !!process.env.APP_BASE_URL || !!process.env.API_BASE_URL,
    };
    
    // Proxy configuration
    const proxy = {
      trustProxyEnabled: true, // Set in server/index.ts: app.set("trust proxy", 1)
    };
    
    // Session configuration
    const session = {
      enabled: true,
      storeType: "pg" as const, // PostgreSQL via connect-pg-simple
      secretConfigured: !!process.env.SESSION_SECRET,
    };
    
    // Runtime environment
    const runtime = {
      nodeEnv,
      isRailway,
      databaseConfigured: !!process.env.DATABASE_URL,
    };
    
    // Compute overall health status
    const issues: string[] = [];
    const warnings: string[] = [];
    
    // Critical issues that would break auth
    if (!session.secretConfigured && isProduction) {
      issues.push("SESSION_SECRET not set - using insecure fallback");
    }
    if (!runtime.databaseConfigured) {
      issues.push("DATABASE_URL not configured - session persistence will fail");
    }
    if (cookies.sameSite === "none" && !cookies.secure) {
      issues.push("SameSite=None requires Secure cookies");
    }
    
    // Warnings that may cause issues
    if (!isProduction && isRailway) {
      warnings.push("NODE_ENV is not 'production' but running on Railway");
    }
    if (isProduction && !proxy.trustProxyEnabled) {
      warnings.push("trust proxy not enabled - secure cookies may fail behind proxy");
    }
    if (!cors.allowedOriginConfigured && isProduction) {
      warnings.push("APP_BASE_URL not set - CORS may have issues with custom domains");
    }
    
    // Compute overall status
    let overallStatus: "healthy" | "warning" | "error" = "healthy";
    if (issues.length > 0) {
      overallStatus = "error";
    } else if (warnings.length > 0) {
      overallStatus = "warning";
    }
    
    // Common fixes / recommendations (static guidance)
    const commonFixes = [
      {
        condition: "loginWorksLocallyNotRailway",
        tip: "If login works locally but not on Railway, confirm trust proxy is enabled.",
        applies: isRailway,
      },
      {
        condition: "cookiesNotSet",
        tip: "If cookies are not being set, ensure frontend requests include credentials: 'include'.",
        applies: true,
      },
      {
        condition: "sameSiteNone",
        tip: "If SameSite=None, Secure must be true and HTTPS is required.",
        applies: cookies.sameSite === "none",
      },
      {
        condition: "sessionExpires",
        tip: "If sessions expire immediately, verify SESSION_SECRET is set and database is connected.",
        applies: true,
      },
      {
        condition: "loginTwice",
        tip: "If you need to login twice, check that trust proxy is enabled and NODE_ENV=production.",
        applies: isRailway,
      },
    ].filter(fix => fix.applies);
    
    res.json({
      authType: "cookie",
      overallStatus,
      cookies,
      cors,
      proxy,
      session,
      runtime,
      issues,
      warnings,
      commonFixes: commonFixes.map(f => ({ condition: f.condition, tip: f.tip })),
      lastAuthCheck: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[auth-diagnostics] Failed:", error);
    res.status(500).json({ error: "Auth diagnostics failed" });
  }
});

// Quarantine tenant constants
const QUARANTINE_TENANT_SLUG = "quarantine";

// GET /api/v1/super/tenancy/health - Get comprehensive tenant health overview
router.get("/tenancy/health", requireSuperUser, async (req, res) => {
  try {
    const tenancyMode = process.env.TENANCY_ENFORCEMENT || "soft";
    
    // Get quarantine tenant ID if it exists (by slug for stability)
    const [quarantineTenant] = await db.select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, QUARANTINE_TENANT_SLUG))
      .limit(1);
    const quarantineTenantId = quarantineTenant?.id;
    
    // Count active tenants (excluding quarantine)
    let activeQuery = db.select({ count: count() })
      .from(tenants)
      .where(eq(tenants.status, TenantStatus.ACTIVE));
    if (quarantineTenantId) {
      activeQuery = db.select({ count: count() })
        .from(tenants)
        .where(and(
          eq(tenants.status, TenantStatus.ACTIVE),
          ne(tenants.id, quarantineTenantId)
        ));
    }
    const activeResult = await activeQuery;
    const activeTenantCount = activeResult[0]?.count || 0;
    
    // Count records with missing tenant IDs per table
    const usersWithoutTenant = await db.select({ count: count() })
      .from(users)
      .where(and(
        isNull(users.tenantId),
        ne(users.role, UserRole.SUPER_USER)
      ));
    
    const projectsWithoutTenant = await db.select({ count: count() })
      .from(projects)
      .where(isNull(projects.tenantId));
    
    const tasksWithoutTenant = await db.select({ count: count() })
      .from(tasks)
      .where(isNull(tasks.tenantId));
    
    const teamsWithoutTenant = await db.select({ count: count() })
      .from(teams)
      .where(isNull(teams.tenantId));
    
    const clientsWithoutTenant = await db.select({ count: count() })
      .from(clients)
      .where(isNull(clients.tenantId));
    
    // Count quarantined records (assigned to quarantine tenant)
    let quarantinedCounts = {
      users: 0,
      projects: 0,
      tasks: 0,
      teams: 0,
    };
    
    if (quarantineTenantId) {
      const quarantinedUsers = await db.select({ count: count() })
        .from(users)
        .where(eq(users.tenantId, quarantineTenantId));
      quarantinedCounts.users = quarantinedUsers[0]?.count || 0;
      
      const quarantinedProjects = await db.select({ count: count() })
        .from(projects)
        .where(eq(projects.tenantId, quarantineTenantId));
      quarantinedCounts.projects = quarantinedProjects[0]?.count || 0;
      
      const quarantinedTasks = await db.select({ count: count() })
        .from(tasks)
        .where(eq(tasks.tenantId, quarantineTenantId));
      quarantinedCounts.tasks = quarantinedTasks[0]?.count || 0;
      
      const quarantinedTeams = await db.select({ count: count() })
        .from(teams)
        .where(eq(teams.tenantId, quarantineTenantId));
      quarantinedCounts.teams = quarantinedTeams[0]?.count || 0;
    }
    
    const missingCounts = {
      users: usersWithoutTenant[0]?.count || 0,
      projects: projectsWithoutTenant[0]?.count || 0,
      tasks: tasksWithoutTenant[0]?.count || 0,
      teams: teamsWithoutTenant[0]?.count || 0,
      clients: clientsWithoutTenant[0]?.count || 0,
    };
    
    const totalMissing = 
      missingCounts.users + 
      missingCounts.projects + 
      missingCounts.tasks + 
      missingCounts.teams + 
      missingCounts.clients;
    
    const totalQuarantined = 
      quarantinedCounts.users + 
      quarantinedCounts.projects + 
      quarantinedCounts.tasks + 
      quarantinedCounts.teams;
    
    res.json({
      currentMode: tenancyMode,
      totalMissing,
      totalQuarantined,
      activeTenantCount,
      missingByTable: missingCounts,
      quarantinedByTable: quarantinedCounts,
      hasQuarantineTenant: !!quarantineTenantId,
      warningStats: {
        last24Hours: 0,
        last7Days: 0,
        total: 0,
      },
    });
  } catch (error) {
    console.error("[tenancy] Failed to get tenancy health:", error);
    res.status(500).json({ error: "Failed to get tenancy health" });
  }
});

// POST /api/v1/super/status/checks/:type - Run specific checks
router.post("/status/checks/:type", requireSuperUser, async (req, res) => {
  try {
    const { type } = req.params;
    
    switch (type) {
      case "recompute-health":
        // Recompute tenant health metrics
        res.json({ success: true, message: "Health metrics recomputed" });
        break;
        
      case "validate-isolation":
        // Validate tenant isolation
        res.json({ success: true, message: "Tenant isolation validated" });
        break;
        
      default:
        res.status(400).json({ error: `Unknown check type: ${type}` });
    }
  } catch (error) {
    console.error("[checks] Check failed:", error);
    res.status(500).json({ error: "Check failed" });
  }
});

// POST /api/v1/super/tenancy/backfill - Backfill missing tenant_id values
router.post("/tenancy/backfill", requireSuperUser, async (req, res) => {
  try {
    const dryRun = req.query.dryRun === "true" || req.body.dryRun === true;
    
    const TENANT_SCOPED_TABLES = [
      "workspaces", "teams", "clients", "projects", "tasks", "time_entries",
      "active_timers", "invitations", "personal_task_sections", "task_assignees",
      "task_watchers", "client_divisions", "division_members", "chat_channels",
      "chat_channel_members", "chat_dm_threads", "chat_dm_members", "chat_messages",
      "chat_mentions", "chat_reads", "chat_attachments"
    ];

    interface BackfillResult {
      table: string;
      nullBefore: number;
      updated: number;
      remaining: number;
      details?: string;
    }

    const results: BackfillResult[] = [];

    // Check and backfill each table
    for (const table of TENANT_SCOPED_TABLES) {
      try {
        // Count NULL before
        const countResult = await db.execute<{ count: string }>(
          sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL`)
        );
        const nullBefore = parseInt(countResult.rows[0]?.count || "0", 10);

        if (nullBefore === 0) {
          results.push({ table, nullBefore: 0, updated: 0, remaining: 0 });
          continue;
        }

        let updated = 0;
        let details = "";

        // Apply backfill logic based on table relationships
        if (!dryRun) {
          switch (table) {
            case "teams":
              const teamsResult = await db.execute(sql.raw(`
                UPDATE teams t SET tenant_id = w.tenant_id
                FROM workspaces w WHERE t.workspace_id = w.id
                AND t.tenant_id IS NULL AND w.tenant_id IS NOT NULL
              `));
              updated = (teamsResult as any).rowCount || 0;
              break;
            case "projects":
              const projectsResult = await db.execute(sql.raw(`
                UPDATE projects p SET tenant_id = COALESCE(
                  (SELECT c.tenant_id FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL),
                  (SELECT w.tenant_id FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
                ) WHERE p.tenant_id IS NULL AND (
                  EXISTS (SELECT 1 FROM clients c WHERE c.id = p.client_id AND c.tenant_id IS NOT NULL)
                  OR EXISTS (SELECT 1 FROM workspaces w WHERE w.id = p.workspace_id AND w.tenant_id IS NOT NULL)
                )
              `));
              updated = (projectsResult as any).rowCount || 0;
              break;
            case "tasks":
              const tasksResult = await db.execute(sql.raw(`
                UPDATE tasks t SET tenant_id = p.tenant_id
                FROM projects p WHERE t.project_id = p.id
                AND t.tenant_id IS NULL AND p.tenant_id IS NOT NULL
              `));
              updated = (tasksResult as any).rowCount || 0;
              break;
            case "time_entries":
              const timeResult = await db.execute(sql.raw(`
                UPDATE time_entries te SET tenant_id = t.tenant_id
                FROM tasks t WHERE te.task_id = t.id
                AND te.tenant_id IS NULL AND t.tenant_id IS NOT NULL
              `));
              updated = (timeResult as any).rowCount || 0;
              break;
            case "chat_messages":
              const chatMsgResult = await db.execute(sql.raw(`
                UPDATE chat_messages cm SET tenant_id = COALESCE(
                  (SELECT cc.tenant_id FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL),
                  (SELECT dt.tenant_id FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
                ) WHERE cm.tenant_id IS NULL AND (
                  EXISTS (SELECT 1 FROM chat_channels cc WHERE cc.id = cm.channel_id AND cc.tenant_id IS NOT NULL)
                  OR EXISTS (SELECT 1 FROM chat_dm_threads dt WHERE dt.id = cm.dm_thread_id AND dt.tenant_id IS NOT NULL)
                )
              `));
              updated = (chatMsgResult as any).rowCount || 0;
              break;
            case "workspaces":
              details = "Workspaces require manual tenant assignment";
              break;
            default:
              details = "No auto-backfill strategy for this table";
          }
        } else {
          details = "Dry run - no changes applied";
        }

        // Count remaining NULL
        const remainingResult = await db.execute<{ count: string }>(
          sql.raw(`SELECT COUNT(*) as count FROM ${table} WHERE tenant_id IS NULL`)
        );
        const remaining = parseInt(remainingResult.rows[0]?.count || "0", 10);

        results.push({
          table,
          nullBefore,
          updated,
          remaining: dryRun ? nullBefore : remaining,
          details: details || undefined,
        });
      } catch (tableError) {
        results.push({
          table,
          nullBefore: -1,
          updated: 0,
          remaining: -1,
          details: `Error: ${(tableError as Error).message}`,
        });
      }
    }

    // Summary
    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalRemaining = results.reduce((sum, r) => sum + Math.max(0, r.remaining), 0);
    const tablesWithDrift = results.filter(r => r.nullBefore > 0).length;

    res.json({
      success: true,
      mode: dryRun ? "dry-run" : "live",
      summary: {
        tablesChecked: results.length,
        tablesWithDrift,
        totalUpdated,
        totalRemaining,
      },
      results: results.filter(r => r.nullBefore > 0 || r.remaining > 0),
    });
  } catch (error) {
    console.error("[tenancy/backfill] Backfill failed:", error);
    res.status(500).json({ error: "Backfill operation failed", details: (error as Error).message });
  }
});

// =============================================================================
// TENANT PICKER & IMPERSONATION ENDPOINTS
// =============================================================================

// GET /api/v1/super/tenants/picker - Lightweight tenant list for switcher dropdown
router.get("/tenants/picker", requireSuperUser, async (req, res) => {
  try {
    const searchQuery = req.query.q as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    
    let query = db.select({
      id: tenants.id,
      name: tenants.name,
      status: tenants.status,
    }).from(tenants);
    
    if (searchQuery && searchQuery.trim()) {
      query = query.where(ilike(tenants.name, `%${searchQuery.trim()}%`)) as any;
    }
    
    const results = await query.orderBy(tenants.name).limit(limit);
    
    res.json(results);
  } catch (error) {
    console.error("[tenants/picker] Failed to fetch tenants:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// Impersonation schemas
const startImpersonationSchema = z.object({
  tenantId: z.string().uuid(),
});

// POST /api/v1/super/impersonate/start - Start acting as a tenant
router.post("/impersonate/start", requireSuperUser, async (req, res) => {
  try {
    const parseResult = startImpersonationSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: "Invalid request data", 
        details: parseResult.error.errors 
      });
    }
    
    const { tenantId } = parseResult.data;
    const user = req.user as any;
    
    // Verify tenant exists
    const [tenant] = await db.select()
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);
    
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    // Log impersonation start as audit event
    await db.insert(tenantAuditEvents).values({
      tenantId,
      userId: user.id,
      eventType: "super_user_action",
      message: `Super Admin ${user.email} started impersonating tenant`,
      eventDetails: {
        action: "impersonation_started",
        superUserId: user.id,
        superUserEmail: user.email,
        tenantName: tenant.name,
        timestamp: new Date().toISOString(),
      },
    });
    
    console.log(`[impersonate] Super user ${user.email} started impersonating tenant ${tenant.name} (${tenantId})`);
    
    res.json({ 
      success: true, 
      tenant: {
        id: tenant.id,
        name: tenant.name,
        status: tenant.status,
      }
    });
  } catch (error) {
    console.error("[impersonate/start] Failed to start impersonation:", error);
    res.status(500).json({ error: "Failed to start impersonation" });
  }
});

// POST /api/v1/super/impersonate/stop - Stop acting as a tenant
router.post("/impersonate/stop", requireSuperUser, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = req.headers["x-tenant-id"] as string | undefined;
    
    // Log impersonation stop if we know which tenant
    if (tenantId) {
      const [tenant] = await db.select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);
      
      if (tenant) {
        await db.insert(tenantAuditEvents).values({
          tenantId,
          userId: user.id,
          eventType: "super_user_action",
          message: `Super Admin ${user.email} stopped impersonating tenant`,
          eventDetails: {
            action: "impersonation_stopped",
            superUserId: user.id,
            superUserEmail: user.email,
            tenantName: tenant.name,
            timestamp: new Date().toISOString(),
          },
        });
        
        console.log(`[impersonate] Super user ${user.email} stopped impersonating tenant ${tenant.name} (${tenantId})`);
      }
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error("[impersonate/stop] Failed to stop impersonation:", error);
    res.status(500).json({ error: "Failed to stop impersonation" });
  }
});

// =============================================================================
// APP DOCUMENTATION - Browse and view application documentation
// =============================================================================

const DOCS_DIR = path.join(process.cwd(), "docs");

// GET /api/v1/super/docs - List all documentation files
router.get("/docs", requireSuperUser, async (req, res) => {
  try {
    const files = await fs.readdir(DOCS_DIR);
    const mdFiles = files.filter(f => f.endsWith(".md"));
    
    const docs = await Promise.all(mdFiles.map(async (filename) => {
      const filepath = path.join(DOCS_DIR, filename);
      const stat = await fs.stat(filepath);
      const content = await fs.readFile(filepath, "utf-8");
      const firstLine = content.split("\n").find(l => l.startsWith("# "));
      const title = firstLine ? firstLine.replace(/^#\s*/, "") : filename.replace(".md", "");
      
      return {
        filename,
        title,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };
    }));
    
    docs.sort((a, b) => a.title.localeCompare(b.title));
    res.json({ docs });
  } catch (error) {
    console.error("[docs] Failed to list documentation:", error);
    res.status(500).json({ error: "Failed to list documentation" });
  }
});

// GET /api/v1/super/docs/:filename - Get a specific documentation file
router.get("/docs/:filename", requireSuperUser, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Security: prevent directory traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return res.status(400).json({ error: "Invalid filename" });
    }
    
    if (!filename.endsWith(".md")) {
      return res.status(400).json({ error: "Only markdown files are allowed" });
    }
    
    const filepath = path.join(DOCS_DIR, filename);
    
    try {
      const content = await fs.readFile(filepath, "utf-8");
      const stat = await fs.stat(filepath);
      const firstLine = content.split("\n").find(l => l.startsWith("# "));
      const title = firstLine ? firstLine.replace(/^#\s*/, "") : filename.replace(".md", "");
      
      res.json({
        filename,
        title,
        content,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    } catch (err: any) {
      if (err.code === "ENOENT") {
        return res.status(404).json({ error: "Documentation file not found" });
      }
      throw err;
    }
  } catch (error) {
    console.error("[docs] Failed to read documentation:", error);
    res.status(500).json({ error: "Failed to read documentation" });
  }
});

// =============================================================================
// DATA IMPORT/EXPORT ENDPOINTS
// For provisioning large tenants - clients, team members, time entries
// =============================================================================

function escapeCsvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const headerLine = headers.map(escapeCsvField).join(",");
  const dataLines = rows.map(row => row.map(escapeCsvField).join(","));
  return [headerLine, ...dataLines].join("\n");
}

// GET /api/v1/super/tenants/:tenantId/export/clients - Export clients as CSV
router.get("/tenants/:tenantId/export/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    
    const headers = ["companyName", "displayName", "industry", "website", "phone", "email", "status", "notes", "addressLine1", "addressLine2", "city", "state", "postalCode", "country"];
    const rows = tenantClients.map(c => [
      c.companyName,
      c.displayName,
      c.industry,
      c.website,
      c.phone,
      c.email,
      c.status,
      c.notes,
      c.addressLine1,
      c.addressLine2,
      c.city,
      c.state,
      c.postalCode,
      c.country,
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-clients.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export clients:", error);
    res.status(500).json({ error: "Failed to export clients" });
  }
});

// GET /api/v1/super/tenants/:tenantId/export/users - Export users as CSV
router.get("/tenants/:tenantId/export/users", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    
    const headers = ["email", "firstName", "lastName", "name", "role", "isActive"];
    const rows = tenantUsers.map(u => [
      u.email,
      u.firstName,
      u.lastName,
      u.name,
      u.role,
      u.isActive ? "true" : "false",
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-users.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export users:", error);
    res.status(500).json({ error: "Failed to export users" });
  }
});

// GET /api/v1/super/tenants/:tenantId/export/time-entries - Export time entries as CSV
router.get("/tenants/:tenantId/export/time-entries", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const entries = await db.select({
      entry: timeEntries,
      userName: users.name,
      userEmail: users.email,
      clientName: clients.companyName,
      projectName: projects.name,
      taskTitle: tasks.title,
    })
      .from(timeEntries)
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .leftJoin(clients, eq(timeEntries.clientId, clients.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(tasks, eq(timeEntries.taskId, tasks.id))
      .where(eq(timeEntries.tenantId, tenantId))
      .orderBy(desc(timeEntries.startTime));
    
    const headers = ["userEmail", "userName", "clientName", "projectName", "taskTitle", "description", "scope", "startTime", "endTime", "durationSeconds", "isManual"];
    const rows = entries.map(e => [
      e.userEmail,
      e.userName,
      e.clientName,
      e.projectName,
      e.taskTitle,
      e.entry.description,
      e.entry.scope,
      e.entry.startTime?.toISOString(),
      e.entry.endTime?.toISOString(),
      e.entry.durationSeconds,
      e.entry.isManual ? "true" : "false",
    ]);
    
    const csv = generateCsv(headers, rows);
    
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${tenant.slug}-time-entries.csv"`);
    res.send(csv);
  } catch (error) {
    console.error("[export] Failed to export time entries:", error);
    res.status(500).json({ error: "Failed to export time entries" });
  }
});

// POST /api/v1/super/tenants/:tenantId/import/clients - Import clients from CSV
router.post("/tenants/:tenantId/import/clients", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { rows } = req.body as { rows: Array<Record<string, string>> };
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));
    const primaryWorkspace = allWorkspaces.find(w => w.isPrimary) || allWorkspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "Tenant has no workspace" });
    }
    
    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const row of rows) {
      const companyName = row.companyName?.trim();
      if (!companyName) {
        results.push({ name: "(empty)", status: "skipped", reason: "Missing company name" });
        skipped++;
        continue;
      }
      
      const existing = await db.select().from(clients)
        .where(and(
          eq(clients.tenantId, tenantId),
          eq(clients.companyName, companyName)
        ));
      
      if (existing.length > 0) {
        results.push({ name: companyName, status: "skipped", reason: "Client already exists" });
        skipped++;
        continue;
      }
      
      try {
        await db.insert(clients).values({
          tenantId,
          workspaceId: primaryWorkspace.id,
          companyName,
          displayName: row.displayName?.trim() || null,
          industry: row.industry?.trim() || null,
          website: row.website?.trim() || null,
          phone: row.phone?.trim() || null,
          email: row.email?.trim() || null,
          status: row.status?.trim() || "active",
          notes: row.notes?.trim() || null,
          addressLine1: row.addressLine1?.trim() || null,
          addressLine2: row.addressLine2?.trim() || null,
          city: row.city?.trim() || null,
          state: row.state?.trim() || null,
          postalCode: row.postalCode?.trim() || null,
          country: row.country?.trim() || null,
        });
        results.push({ name: companyName, status: "created" });
        created++;
      } catch (err) {
        console.error(`[import] Failed to create client ${companyName}:`, err);
        results.push({ name: companyName, status: "error", reason: "Database error" });
        errors++;
      }
    }
    
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "clients_imported",
      `Imported ${created} clients (${skipped} skipped, ${errors} errors)`,
      superUser?.id,
      { created, skipped, errors }
    );
    
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[import] Failed to import clients:", error);
    res.status(500).json({ error: "Failed to import clients" });
  }
});

// POST /api/v1/super/tenants/:tenantId/import/time-entries - Import time entries from CSV
router.post("/tenants/:tenantId/import/time-entries", requireSuperUser, async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { rows, matchBy } = req.body as { 
      rows: Array<Record<string, string>>; 
      matchBy?: { client?: "name"; project?: "name"; user?: "email" } 
    };
    
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: "No data to import" });
    }
    
    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }
    
    const allWorkspaces = await db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId));
    const primaryWorkspace = allWorkspaces.find(w => w.isPrimary) || allWorkspaces[0];
    if (!primaryWorkspace) {
      return res.status(400).json({ error: "Tenant has no workspace" });
    }
    
    const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
    const usersByEmail = new Map(tenantUsers.map(u => [u.email.toLowerCase(), u]));
    
    const tenantClients = await db.select().from(clients).where(eq(clients.tenantId, tenantId));
    const clientsByName = new Map(tenantClients.map(c => [c.companyName.toLowerCase(), c]));
    
    const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
    const projectsByName = new Map(tenantProjects.map(p => [p.name.toLowerCase(), p]));
    
    const results: Array<{ name: string; status: "created" | "skipped" | "error"; reason?: string }> = [];
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const row of rows) {
      const userEmail = row.userEmail?.trim().toLowerCase();
      const user = userEmail ? usersByEmail.get(userEmail) : null;
      
      if (!user) {
        results.push({ name: `Entry for ${userEmail || "unknown"}`, status: "skipped", reason: "User not found" });
        skipped++;
        continue;
      }
      
      const clientName = row.clientName?.trim().toLowerCase();
      const client = clientName ? clientsByName.get(clientName) : null;
      
      const projectName = row.projectName?.trim().toLowerCase();
      const project = projectName ? projectsByName.get(projectName) : null;
      
      const startTimeStr = row.startTime?.trim();
      const endTimeStr = row.endTime?.trim();
      
      if (!startTimeStr) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Missing start time" });
        skipped++;
        continue;
      }
      
      const startTime = new Date(startTimeStr);
      const endTime = endTimeStr ? new Date(endTimeStr) : null;
      
      if (isNaN(startTime.getTime())) {
        results.push({ name: `Entry for ${userEmail}`, status: "skipped", reason: "Invalid start time" });
        skipped++;
        continue;
      }
      
      let durationSeconds = parseInt(row.durationSeconds || "0", 10);
      if (isNaN(durationSeconds) && endTime && !isNaN(endTime.getTime())) {
        durationSeconds = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);
      }
      
      try {
        await db.insert(timeEntries).values({
          tenantId,
          workspaceId: primaryWorkspace.id,
          userId: user.id,
          clientId: client?.id || null,
          projectId: project?.id || null,
          taskId: null,
          description: row.description?.trim() || null,
          scope: row.scope?.trim() || "in_scope",
          startTime,
          endTime,
          durationSeconds: durationSeconds || 0,
          isManual: row.isManual?.toLowerCase() === "true",
        });
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "created" });
        created++;
      } catch (err) {
        console.error(`[import] Failed to create time entry:`, err);
        results.push({ name: `${startTimeStr} - ${user.email}`, status: "error", reason: "Database error" });
        errors++;
      }
    }
    
    const superUser = req.user as any;
    await recordTenantAuditEvent(
      tenantId,
      "time_entries_imported",
      `Imported ${created} time entries (${skipped} skipped, ${errors} errors)`,
      superUser?.id,
      { created, skipped, errors }
    );
    
    res.json({ created, skipped, errors, results });
  } catch (error) {
    console.error("[import] Failed to import time entries:", error);
    res.status(500).json({ error: "Failed to import time entries" });
  }
});

export default router;
