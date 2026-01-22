/**
 * Tenant Onboarding Routes + Tenant Settings & Integrations
 * 
 * These routes are accessible by tenant admins even when the tenant is inactive.
 * They allow the tenant admin to complete onboarding, configure settings, and manage integrations.
 * 
 * Routes:
 * - GET  /api/v1/tenant/me - Get current tenant info
 * - GET  /api/v1/tenant/settings - Get tenant settings (branding)
 * - PATCH /api/v1/tenant/settings - Update tenant settings
 * - GET  /api/v1/tenant/onboarding/status - Get onboarding status
 * - POST /api/v1/tenant/onboarding/complete - Complete onboarding
 * - GET  /api/v1/tenant/integrations - List all integrations
 * - GET  /api/v1/tenant/integrations/:provider - Get specific integration
 * - PUT  /api/v1/tenant/integrations/:provider - Update integration
 * - POST /api/v1/tenant/integrations/:provider/test - Test integration
 */

import { Router } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { tenants, TenantStatus, UserRole } from "@shared/schema";
import { eq } from "drizzle-orm";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured, getMimeType } from "../s3";
import { getStorageStatus } from "../storage/getStorageProvider";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const router = Router();

// Middleware to ensure user is authenticated
function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Helper to get effective tenant ID - uses central tenant context from middleware
// The tenantContextMiddleware in server/middleware/tenantContext.ts validates X-Tenant-Id
// for super users, ensuring tenant existence before setting req.tenant.effectiveTenantId
function getEffectiveTenantId(req: any): string | null {
  // Use the validated tenant context from middleware (set by tenantContextMiddleware)
  return req.tenant?.effectiveTenantId || null;
}

// Middleware to ensure user is tenant admin (supports super_user with X-Tenant-Id)
function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user as any;
  const effectiveTenantId = getEffectiveTenantId(req);
  
  if (!effectiveTenantId) {
    return res.status(403).json({ error: "No tenant context" });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Admin access required" });
  }
  
  // Attach effective tenant ID to request for use in route handlers
  req.effectiveTenantId = effectiveTenantId;
  next();
}

// =============================================================================
// Middleware to require tenant context (works for all tenant users)
// =============================================================================
function requireTenantContext(req: any, res: any, next: any) {
  const user = req.user as any;
  const effectiveTenantId = getEffectiveTenantId(req);
  
  if (!effectiveTenantId) {
    // Always log tenant context issues to help diagnose Railway deployment problems
    console.error("[requireTenantContext] No tenant context:", {
      userId: user?.id,
      email: user?.email,
      role: user?.role,
      userTenantId: user?.tenantId,
      headerTenantId: req.headers["x-tenant-id"],
      reqTenant: req.tenant,
      path: req.path,
    });
    return res.status(403).json({ error: "No tenant context" });
  }
  
  // Attach effective tenant ID to request for use in route handlers
  req.effectiveTenantId = effectiveTenantId;
  next();
}

// =============================================================================
// GET /api/v1/tenant/context - Get basic tenant context for any tenant user
// This endpoint is used by the frontend to validate tenant access
// Works for all users including employees, not just admins
// =============================================================================

router.get("/context", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    
    // Use the central tenant context from middleware (already validated)
    // req.tenant is set by tenantContextMiddleware in server/index.ts
    const effectiveTenantId = req.tenant?.effectiveTenantId;
    
    // Debug logging for tenant context issues
    if (process.env.DEBUG_TENANT_CONTEXT === "true") {
      console.log("[tenant/context] Checking context:", {
        userId: user?.id,
        email: user?.email,
        role: user?.role,
        userTenantId: user?.tenantId,
        effectiveTenantId,
        tenantContextFromMiddleware: req.tenant,
      });
    }
    
    if (!effectiveTenantId) {
      return res.status(403).json({ error: "No tenant context" });
    }

    const tenant = await storage.getTenant(effectiveTenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Gracefully handle tenant settings - if table doesn't exist or query fails, use tenant name
    let displayName = tenant.name;
    try {
      const tenantSettings = await storage.getTenantSettings(effectiveTenantId);
      if (tenantSettings?.displayName) {
        displayName = tenantSettings.displayName;
      }
    } catch (settingsError: any) {
      console.warn("[tenant/context] Could not fetch tenant settings, using tenant name as fallback:", settingsError?.message);
    }

    res.json({
      tenantId: tenant.id,
      displayName,
      status: tenant.status,
    });
  } catch (error: any) {
    console.error("Error fetching tenant context:", {
      message: error?.message,
      stack: error?.stack,
      userId: (req.user as any)?.id,
      tenantId: req.tenant?.effectiveTenantId,
    });
    res.status(500).json({ error: "Failed to fetch tenant context", details: error?.message });
  }
});

// =============================================================================
// GET /api/v1/tenant/me - Get current tenant info with settings
// =============================================================================

router.get("/me", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = req.effectiveTenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantSettings = await storage.getTenantSettings(tenantId);

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        onboardedAt: tenant.onboardedAt,
        ownerUserId: tenant.ownerUserId,
      },
      tenantSettings: tenantSettings || null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant info:", error);
    res.status(500).json({ error: "Failed to fetch tenant info" });
  }
});

// =============================================================================
// PATCH /api/v1/tenant/settings - Update tenant settings
// =============================================================================

const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

const updateSettingsSchema = z.object({
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

router.patch("/settings", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const data = updateSettingsSchema.parse(req.body);

    // Ensure settings record exists
    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
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
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// =============================================================================
// GET /api/v1/tenant/onboarding/status - Get onboarding progress
// =============================================================================

router.get("/onboarding/status", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    // Determine onboarding steps completion
    const steps = {
      profile: !!(settings?.displayName),
      branding: !!(settings?.logoUrl || settings?.primaryColor),
      mailgun: false, // Will check appSettings for mailgun config
      completed: tenant.status === TenantStatus.ACTIVE && tenant.onboardedAt !== null,
    };

    res.json({
      status: tenant.status,
      onboardedAt: tenant.onboardedAt,
      ownerUserId: tenant.ownerUserId,
      steps,
      settings: settings ? {
        displayName: settings.displayName,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        supportEmail: settings.supportEmail,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

// =============================================================================
// POST /api/v1/tenant/onboarding/complete - Complete onboarding
// =============================================================================

router.post("/onboarding/complete", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = req.effectiveTenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE && tenant.onboardedAt) {
      return res.json({
        success: true,
        message: "Tenant is already onboarded",
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          onboardedAt: tenant.onboardedAt,
        },
      });
    }

    // Update tenant: set status to active, onboardedAt to now, ownerUserId to current user
    const [updatedTenant] = await db.update(tenants)
      .set({
        status: TenantStatus.ACTIVE,
        onboardedAt: new Date(),
        ownerUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({
      success: true,
      message: "Onboarding completed successfully",
      tenant: {
        id: updatedTenant.id,
        name: updatedTenant.name,
        status: updatedTenant.status,
        onboardedAt: updatedTenant.onboardedAt,
        ownerUserId: updatedTenant.ownerUserId,
      },
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

// =============================================================================
// GET /api/v1/tenant/branding - Get tenant branding (accessible by all tenant users)
// This endpoint is used by the theme loader and should be accessible by employees
// =============================================================================

router.get("/branding", requireAuth, requireTenantContext, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const settings = await storage.getTenantSettings(tenantId);
    
    if (!settings) {
      return res.json({ tenantSettings: null });
    }

    // Return only branding-related settings (no sensitive info)
    res.json({
      tenantSettings: {
        displayName: settings.displayName,
        appName: settings.appName,
        logoUrl: settings.logoUrl,
        faviconUrl: settings.faviconUrl,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        accentColor: settings.accentColor,
        whiteLabelEnabled: settings.whiteLabelEnabled,
        hideVendorBranding: settings.hideVendorBranding,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant branding:", error);
    res.status(500).json({ error: "Failed to fetch branding" });
  }
});

// =============================================================================
// GET /api/v1/tenant/settings - Get tenant settings (admin only)
// =============================================================================

router.get("/settings", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const settings = await storage.getTenantSettings(tenantId);
    
    if (!settings) {
      return res.json({ tenantSettings: null });
    }

    res.json({
      tenantSettings: {
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
      },
    });
  } catch (error) {
    console.error("Error fetching tenant settings:", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// =============================================================================
// INTEGRATION ENDPOINTS
// =============================================================================

const validProviders: IntegrationProvider[] = ["mailgun", "s3"];

function isValidProvider(provider: string): provider is IntegrationProvider {
  return validProviders.includes(provider as IntegrationProvider);
}

// GET /api/v1/tenant/integrations - List all integrations
router.get("/integrations", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const integrations = await tenantIntegrationService.listIntegrations(tenantId);
    res.json({ integrations });
  } catch (error) {
    console.error("Error fetching integrations:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// GET /api/v1/tenant/integrations/:provider - Get specific integration
router.get("/integrations/:provider", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
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
    console.error("Error fetching integration:", error);
    res.status(500).json({ error: "Failed to fetch integration" });
  }
});

// PUT /api/v1/tenant/integrations/:provider - Update integration
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

router.put("/integrations/:provider", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
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
    console.error("Error updating integration:", error);
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

// POST /api/v1/tenant/integrations/:provider/test - Test integration
router.post("/integrations/:provider/test", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      return res.status(400).json({ error: `Invalid provider: ${provider}` });
    }

    const result = await tenantIntegrationService.testIntegration(tenantId, provider);
    
    res.json(result);
  } catch (error) {
    console.error("Error testing integration:", error);
    res.status(500).json({ error: "Failed to test integration" });
  }
});

// POST /api/v1/tenant/integrations/mailgun/send-test-email - Send a test email
router.post("/integrations/mailgun/send-test-email", requireAuth, requireTenantAdmin, async (req, res) => {
  const requestId = crypto.randomUUID();
  res.setHeader("X-Request-Id", requestId);
  
  try {
    const tenantId = req.effectiveTenantId;
    const { toEmail } = req.body;

    if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "A valid recipient email address is required",
          requestId,
        },
      });
    }

    const tenant = await storage.getTenant(tenantId);
    const tenantName = tenant?.name || "Unknown Tenant";

    const result = await tenantIntegrationService.sendTestEmail(tenantId, toEmail, tenantName, requestId);

    if (!result.ok) {
      return res.status(400).json({
        error: {
          code: result.error?.code || "MAILGUN_SEND_FAILED",
          message: result.error?.message || "Failed to send test email",
          requestId,
        },
      });
    }

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error) {
    console.error("Error sending test email:", error);
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to send test email",
        requestId,
      },
    });
  }
});

// =============================================================================
// STORAGE STATUS ENDPOINT
// =============================================================================

// GET /api/v1/tenant/storage/status - Get storage configuration status
router.get("/storage/status", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const status = await getStorageStatus(tenantId);
    res.json(status);
  } catch (error) {
    console.error("Error fetching storage status:", error);
    res.status(500).json({ error: "Failed to fetch storage status" });
  }
});

// =============================================================================
// BRAND ASSET UPLOAD ENDPOINTS
// =============================================================================

const validAssetTypes = ["logo", "icon", "favicon"] as const;
type AssetType = typeof validAssetTypes[number];

function isValidAssetType(type: string): type is AssetType {
  return validAssetTypes.includes(type as AssetType);
}

// POST /api/v1/tenant/settings/brand-assets - Upload brand asset
router.post("/settings/brand-assets", requireAuth, requireTenantAdmin, upload.single("file"), async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const assetType = req.body.type as string;

    if (!isS3Configured()) {
      return res.status(503).json({ error: "S3 storage is not configured" });
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
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
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
// AGREEMENT ROUTES
// Management endpoints now require super_user role (tenant admins get 403)
// Read-only endpoints still available to tenant admins
// =============================================================================

import { tenantAgreements, tenantAgreementAcceptances, AgreementStatus, users } from "@shared/schema";
import { and, desc } from "drizzle-orm";

const agreementDraftSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
});

const agreementPatchSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
});

// Helper to check if user is super_user (for allowing management via impersonation)
function isSuperUser(req: any): boolean {
  const user = req.user as any;
  return user?.role === UserRole.SUPER_USER;
}

// GET /api/v1/tenant/agreement - Get current agreement state
router.get("/agreement", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    // Get active agreement
    const activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    // Get draft agreement
    const draftAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    const active = activeAgreements[0] || null;
    const draft = draftAgreements[0] || null;

    // Check if tenant has any agreements
    const allAgreements = await db.select({ id: tenantAgreements.id })
      .from(tenantAgreements)
      .where(eq(tenantAgreements.tenantId, tenantId))
      .limit(1);

    res.json({
      active: active ? {
        id: active.id,
        title: active.title,
        body: active.body,
        version: active.version,
        effectiveAt: active.effectiveAt,
      } : null,
      draft: draft ? {
        id: draft.id,
        title: draft.title,
        body: draft.body,
        version: draft.version,
      } : null,
      hasAnyAgreement: allAgreements.length > 0,
    });
  } catch (error) {
    console.error("Error fetching agreement:", error);
    res.status(500).json({ error: "Failed to fetch agreement" });
  }
});

// POST /api/v1/tenant/agreement/draft - Create or update draft (Super Admin only)
router.post("/agreement/draft", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    // Agreement management has been moved to Super Admin System Settings
    if (!isSuperUser(req)) {
      return res.status(403).json({ 
        error: "Agreement management is now handled by platform administrators. Please contact your platform admin to request changes." 
      });
    }

    const user = req.user as any;
    const tenantId = req.effectiveTenantId;

    const validation = agreementDraftSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { title, body } = validation.data;

    // Check for existing draft
    const existingDrafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (existingDrafts.length > 0) {
      // Update existing draft
      const updated = await db.update(tenantAgreements)
        .set({ title, body, updatedAt: new Date() })
        .where(eq(tenantAgreements.id, existingDrafts[0].id))
        .returning();

      return res.json(updated[0]);
    }

    // Get current active version to determine next version number
    const activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    const nextVersion = activeAgreements.length > 0 ? activeAgreements[0].version + 1 : 1;

    // Create new draft
    const created = await db.insert(tenantAgreements)
      .values({
        tenantId,
        title,
        body,
        version: nextVersion,
        status: AgreementStatus.DRAFT,
        createdByUserId: user.id,
      })
      .returning();

    res.status(201).json(created[0]);
  } catch (error) {
    console.error("Error creating/updating draft:", error);
    res.status(500).json({ error: "Failed to save draft" });
  }
});

// PATCH /api/v1/tenant/agreement/draft - Update current draft (Super Admin only)
router.patch("/agreement/draft", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    // Agreement management has been moved to Super Admin System Settings
    if (!isSuperUser(req)) {
      return res.status(403).json({ 
        error: "Agreement management is now handled by platform administrators. Please contact your platform admin to request changes." 
      });
    }

    const tenantId = req.effectiveTenantId;

    const validation = agreementPatchSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const updates = validation.data;
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No fields to update" });
    }

    // Find existing draft
    const existingDrafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (existingDrafts.length === 0) {
      return res.status(404).json({ error: "No draft found" });
    }

    const updated = await db.update(tenantAgreements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, existingDrafts[0].id))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    console.error("Error updating draft:", error);
    res.status(500).json({ error: "Failed to update draft" });
  }
});

// POST /api/v1/tenant/agreement/publish - Publish draft as active (Super Admin only)
router.post("/agreement/publish", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    // Agreement management has been moved to Super Admin System Settings
    if (!isSuperUser(req)) {
      return res.status(403).json({ 
        error: "Agreement management is now handled by platform administrators. Please contact your platform admin to request changes." 
      });
    }

    const tenantId = req.effectiveTenantId;

    // Find the draft
    const drafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (drafts.length === 0) {
      return res.status(404).json({ error: "No draft to publish" });
    }

    const draft = drafts[0];

    // Archive current active agreement (if any)
    await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ));

    // Publish the draft
    const published = await db.update(tenantAgreements)
      .set({
        status: AgreementStatus.ACTIVE,
        effectiveAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantAgreements.id, draft.id))
      .returning();

    res.json({
      agreement: published[0],
      message: "Agreement published. All users will need to accept the new version.",
    });
  } catch (error) {
    console.error("Error publishing agreement:", error);
    res.status(500).json({ error: "Failed to publish agreement" });
  }
});

// POST /api/v1/tenant/agreement/unpublish - Archive active agreement (Super Admin only)
router.post("/agreement/unpublish", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    // Agreement management has been moved to Super Admin System Settings
    if (!isSuperUser(req)) {
      return res.status(403).json({ 
        error: "Agreement management is now handled by platform administrators. Please contact your platform admin to request changes." 
      });
    }

    const tenantId = req.effectiveTenantId;

    // Archive current active agreement
    const result = await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .returning();

    if (result.length === 0) {
      return res.status(404).json({ error: "No active agreement to unpublish" });
    }

    res.json({
      agreement: result[0],
      message: "Agreement unpublished. Users are no longer required to accept terms.",
    });
  } catch (error) {
    console.error("Error unpublishing agreement:", error);
    res.status(500).json({ error: "Failed to unpublish agreement" });
  }
});

// GET /api/v1/tenant/agreement/stats - Get acceptance statistics
router.get("/agreement/stats", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    // Get active agreement
    const activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    if (activeAgreements.length === 0) {
      return res.json({
        hasActiveAgreement: false,
        totalUsers: 0,
        acceptedCount: 0,
        pendingCount: 0,
        pendingUsers: [],
      });
    }

    const activeAgreement = activeAgreements[0];

    // Get total tenant users (excluding super users)
    const allUsers = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
    })
      .from(users)
      .where(and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true)
      ));

    const tenantUsers = allUsers.filter(u => u.role !== UserRole.SUPER_USER);

    // Get acceptances for current version
    const acceptances = await db.select()
      .from(tenantAgreementAcceptances)
      .where(and(
        eq(tenantAgreementAcceptances.tenantId, tenantId),
        eq(tenantAgreementAcceptances.agreementId, activeAgreement.id),
        eq(tenantAgreementAcceptances.version, activeAgreement.version)
      ));

    const acceptedUserIds = new Set(acceptances.map(a => a.userId));

    const pendingUsers = tenantUsers.filter(u => !acceptedUserIds.has(u.id));

    res.json({
      hasActiveAgreement: true,
      agreementVersion: activeAgreement.version,
      totalUsers: tenantUsers.length,
      acceptedCount: acceptances.length,
      pendingCount: pendingUsers.length,
      pendingUsers: pendingUsers.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
      })),
    });
  } catch (error) {
    console.error("Error fetching agreement stats:", error);
    res.status(500).json({ error: "Failed to fetch statistics" });
  }
});

export default router;
