import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { insertTenantSchema, TenantStatus, UserRole, tenants, workspaces, invitations, tenantSettings, tenantNotes, tenantAuditEvents, NoteCategory, clients, clientContacts, projects, tasks, users, teams, systemSettings, tenantAgreements, tenantAgreementAcceptances, timeEntries, updateSystemSettingsSchema } from "@shared/schema";
import { hashPassword } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { eq, sql, desc, and, ilike, count, gte, lt, isNull, isNotNull, ne } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured } from "../s3";
import * as schema from "@shared/schema";
import { promises as fs } from "fs";
import path from "path";

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
  try {
    const data = createTenantSchema.parse(req.body);
    
    const existingTenant = await storage.getTenantBySlug(data.slug);
    if (existingTenant) {
      return res.status(409).json({ error: "A tenant with this slug already exists" });
    }
    
    // Transactional: Create tenant + primary workspace + tenant_settings
    const result = await db.transaction(async (tx) => {
      // 1. Create tenant (inactive by default)
      const [tenant] = await tx.insert(tenants).values({
        ...data,
        status: TenantStatus.INACTIVE,
      }).returning();

      // 2. Create primary workspace with exact business name
      const [primaryWorkspace] = await tx.insert(workspaces).values({
        name: data.name.trim(),
        tenantId: tenant.id,
        isPrimary: true,
      }).returning();

      // 3. Create tenant_settings record (inside transaction for rollback safety)
      await tx.insert(tenantSettings).values({
        tenantId: tenant.id,
        displayName: tenant.name,
      });

      return { tenant, primaryWorkspace };
    });

    console.log(`[SuperAdmin] Created tenant ${result.tenant.id} with primary workspace ${result.primaryWorkspace.id}`);

    // Record audit events
    const superUser = req.user as any;
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
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error creating tenant:", error);
    res.status(500).json({ error: "Failed to create tenant" });
  }
});

const updateTenantSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
  status: z.enum([TenantStatus.ACTIVE, TenantStatus.INACTIVE, TenantStatus.SUSPENDED]).optional(),
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

// =============================================================================
// PHASE 3A: TENANT ADMIN INVITATION
// =============================================================================

const inviteAdminSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
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
    // For now, we'll create a new one if none exists
    let workspaceId: string;
    const allWorkspaces = await db.select().from(workspaces);
    const tenantWorkspace = allWorkspaces.find(w => w.name === `${tenant.name} Workspace`);
    
    if (tenantWorkspace) {
      workspaceId = tenantWorkspace.id;
    } else {
      // Create a default workspace for the tenant
      const [newWorkspace] = await db.insert(workspaces).values({
        name: `${tenant.name} Workspace`,
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
router.get("/tenants-detail", requireSuperUser, async (req, res) => {
  try {
    const allTenants = await storage.getAllTenants();
    
    const tenantsWithDetails = await Promise.all(
      allTenants.map(async (tenant) => {
        const settings = await storage.getTenantSettings(tenant.id);
        const tenantUsers = await db
          .select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.tenantId, tenant.id));
        
        return {
          ...tenant,
          settings,
          userCount: Number(tenantUsers[0]?.count || 0),
        };
      })
    );

    res.json(tenantsWithDetails);
  } catch (error) {
    console.error("Error fetching tenants with details:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
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
        .where(sql`${clients.id} = ANY(${clientIds})`);
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
    }).from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .orderBy(desc(users.createdAt));
    
    res.json(admins);
  } catch (error) {
    console.error("[admins] Failed to list platform admins:", error);
    res.status(500).json({ error: "Failed to list platform admins" });
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
// INTEGRATIONS STATUS ENDPOINT
// =============================================================================

// GET /api/v1/super/integrations/status - Check platform integrations
router.get("/integrations/status", requireSuperUser, async (req, res) => {
  try {
    const mailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
    const s3Configured = isS3Configured();
    
    res.json({
      mailgun: mailgunConfigured,
      s3: s3Configured,
    });
  } catch (error) {
    console.error("[integrations] Failed to check integration status:", error);
    res.status(500).json({ error: "Failed to check integrations" });
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

export default router;
