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
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { tenants, TenantStatus, UserRole } from "@shared/schema";
import { eq } from "drizzle-orm";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured, getMimeType } from "../s3";

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

// Middleware to ensure user is tenant admin
function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user as any;
  if (!user.tenantId) {
    return res.status(403).json({ error: "No tenant context" });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// =============================================================================
// GET /api/v1/tenant/me - Get current tenant info with settings
// =============================================================================

router.get("/me", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

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
    const user = req.user as any;
    const tenantId = user.tenantId;

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
    const user = req.user as any;
    const tenantId = user.tenantId;

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
    const tenantId = user.tenantId;

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
// GET /api/v1/tenant/settings - Get tenant settings (branding)
// =============================================================================

router.get("/settings", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

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
    const user = req.user as any;
    const tenantId = user.tenantId;

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
    const user = req.user as any;
    const tenantId = user.tenantId;
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
    const user = req.user as any;
    const tenantId = user.tenantId;
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
    const user = req.user as any;
    const tenantId = user.tenantId;
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
    const user = req.user as any;
    const tenantId = user.tenantId;
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

export default router;
