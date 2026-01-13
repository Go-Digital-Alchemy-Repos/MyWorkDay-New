import { Router } from "express";
import { storage } from "../storage";
import { requireSuperUser } from "../middleware/tenantContext";
import { insertTenantSchema, TenantStatus, UserRole, tenants, workspaces } from "@shared/schema";
import { hashPassword } from "../auth";
import { z } from "zod";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "crypto";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";

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
    
    // Phase 3A: New tenants start as inactive
    const tenant = await storage.createTenant({
      ...data,
      status: TenantStatus.INACTIVE,
    });

    // Phase 3A: Create tenant_settings record
    await storage.createTenantSettings({
      tenantId: tenant.id,
      displayName: tenant.name,
    });

    res.status(201).json(tenant);
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
// PHASE 3A: TENANT ADMIN INVITATION
// =============================================================================

const inviteAdminSchema = z.object({
  email: z.string().email("Valid email is required"),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  expiresInDays: z.number().min(1).max(30).optional(),
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
      message: "Invitation created successfully. Share the invite URL with the tenant admin.",
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

export default router;
