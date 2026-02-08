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

import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { tenants, TenantStatus, UserRole } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "../auth";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { tenantIntegrationService, IntegrationProvider } from "../services/tenantIntegrations";
import multer from "multer";
import { validateBrandAsset, generateBrandAssetKey, uploadToS3, isS3Configured, getMimeType } from "../s3";
import { getStorageStatus } from "../storage/getStorageProvider";
import { AppError, handleRouteError } from "../lib/errors";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

const router = Router();

function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user as any;
  const effectiveTenantId = getEffectiveTenantId(req);
  
  if (!effectiveTenantId) {
    throw AppError.forbidden("No tenant context");
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    throw AppError.forbidden("Admin access required");
  }
  
  req.effectiveTenantId = effectiveTenantId;
  next();
}

function requireTenantContext(req: any, res: any, next: any) {
  const user = req.user as any;
  const effectiveTenantId = getEffectiveTenantId(req);
  
  if (!effectiveTenantId) {
    console.error(`[requireTenantContext] No tenant context:`, {
      userId: user?.id,
      email: user?.email,
      role: user?.role,
      userTenantId: user?.tenantId,
      headerTenantId: req.headers["x-tenant-id"],
      reqTenant: req.tenant,
      path: req.path,
    });
    throw AppError.forbidden("No tenant context");
  }
  
  req.effectiveTenantId = effectiveTenantId;
  next();
}

// =============================================================================
// GET /api/v1/tenant/context - Get basic tenant context for any tenant user
// =============================================================================

router.get("/context", requireAuth, async (req, res) => {
  try {
    const user = req.user as any;
    
    const effectiveTenantId = req.tenant?.effectiveTenantId;
    
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
      console.log(`[tenant/context] No tenant context for user ${user?.id}`);
      throw AppError.forbidden("No tenant context");
    }

    const tenant = await storage.getTenant(effectiveTenantId);
    if (!tenant) {
      console.log(`[tenant/context] Tenant not found: ${effectiveTenantId}`);
      throw AppError.notFound("Tenant");
    }

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
    handleRouteError(res, error, "tenantOnboarding.getContext", req);
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
      throw AppError.notFound("Tenant");
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
    handleRouteError(res, error, "tenantOnboarding.getMe", req);
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
  defaultThemeAccent: z.enum(["blue", "indigo", "teal", "green", "orange", "slate"]).optional().nullable(),
  loginMessage: z.string().optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
  whiteLabelEnabled: z.boolean().optional(),
  hideVendorBranding: z.boolean().optional(),
});

router.patch("/settings", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const data = updateSettingsSchema.parse(req.body);

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        throw AppError.notFound("Tenant");
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
      return handleRouteError(res, AppError.badRequest("Validation error"), "tenantOnboarding.updateSettings", req);
    }
    handleRouteError(res, error, "tenantOnboarding.updateSettings", req);
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
      throw AppError.notFound("Tenant");
    }

    const settings = await storage.getTenantSettings(tenantId);

    const steps = {
      profile: !!(settings?.displayName),
      branding: !!(settings?.logoUrl || settings?.primaryColor),
      mailgun: false,
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
    handleRouteError(res, error, "tenantOnboarding.getStatus", req);
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
      throw AppError.notFound("Tenant");
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
    handleRouteError(res, error, "tenantOnboarding.complete", req);
  }
});

// =============================================================================
// GET /api/v1/tenant/branding - Get tenant branding (accessible by all tenant users)
// =============================================================================

router.get("/branding", requireAuth, requireTenantContext, async (req, res) => {
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
        defaultThemeAccent: settings.defaultThemeAccent,
        whiteLabelEnabled: settings.whiteLabelEnabled,
        hideVendorBranding: settings.hideVendorBranding,
      },
    });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.getBranding", req);
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
        defaultThemeAccent: settings.defaultThemeAccent,
        loginMessage: settings.loginMessage,
        supportEmail: settings.supportEmail,
        whiteLabelEnabled: settings.whiteLabelEnabled,
        hideVendorBranding: settings.hideVendorBranding,
      },
    });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.getSettings", req);
  }
});

// =============================================================================
// INTEGRATION ENDPOINTS
// =============================================================================

const validProviders: IntegrationProvider[] = ["mailgun", "s3", "r2", "openai"];

function isValidProvider(provider: string): provider is IntegrationProvider {
  return validProviders.includes(provider as IntegrationProvider);
}

router.get("/integrations", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const integrations = await tenantIntegrationService.listIntegrations(tenantId);
    res.json({ integrations });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.listIntegrations", req);
  }
});

router.get("/integrations/:provider", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      throw AppError.badRequest(`Invalid provider: ${provider}`);
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
    handleRouteError(res, error, "tenantOnboarding.getIntegration", req);
  }
});

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

const r2UpdateSchema = z.object({
  bucketName: z.string().optional(),
  accountId: z.string().optional(),
  keyPrefixTemplate: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

const openaiUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.string().optional(),
  apiKey: z.string().optional(),
});

router.put("/integrations/:provider", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      throw AppError.badRequest(`Invalid provider: ${provider}`);
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
    } else if (provider === "r2") {
      const data = r2UpdateSchema.parse(req.body);
      const endpoint = data.accountId 
        ? `https://${data.accountId}.r2.cloudflarestorage.com`
        : undefined;
      publicConfig = {
        bucketName: data.bucketName,
        region: "auto",
        accountId: data.accountId,
        endpoint,
        keyPrefixTemplate: data.keyPrefixTemplate || `tenants/${tenantId}/`,
      };
      if (data.accessKeyId || data.secretAccessKey) {
        secretConfig = {
          accessKeyId: data.accessKeyId,
          secretAccessKey: data.secretAccessKey,
        };
      }
    } else if (provider === "openai") {
      const data = openaiUpdateSchema.parse(req.body);
      publicConfig = {
        enabled: data.enabled ?? true,
        model: data.model ?? "gpt-4o-mini",
        maxTokens: data.maxTokens ?? 2000,
        temperature: data.temperature ?? "0.7",
      };
      if (data.apiKey) {
        secretConfig = { apiKey: data.apiKey };
      }
    }

    const result = await tenantIntegrationService.upsertIntegration(tenantId, provider, {
      publicConfig,
      secretConfig: Object.keys(secretConfig).length > 0 ? secretConfig : undefined,
    });

    res.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Validation error"), "tenantOnboarding.updateIntegration", req);
    }
    if (error instanceof Error && error.message.includes("Encryption key")) {
      return handleRouteError(res, AppError.internal("Encryption key not configured. Please contact administrator."), "tenantOnboarding.updateIntegration", req);
    }
    handleRouteError(res, error, "tenantOnboarding.updateIntegration", req);
  }
});

router.post("/integrations/:provider/test", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const { provider } = req.params;

    if (!isValidProvider(provider)) {
      throw AppError.badRequest(`Invalid provider: ${provider}`);
    }

    const result = await tenantIntegrationService.testIntegration(tenantId, provider);
    
    res.json(result);
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.testIntegration", req);
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
      throw AppError.badRequest("A valid recipient email address is required");
    }

    const tenant = await storage.getTenant(tenantId);
    const tenantName = tenant?.name || "Unknown Tenant";

    const result = await tenantIntegrationService.sendTestEmail(tenantId, toEmail, tenantName, requestId);

    if (!result.ok) {
      throw AppError.badRequest(result.error?.message || "Failed to send test email");
    }

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.sendTestEmail", req);
  }
});

// =============================================================================
// STORAGE STATUS ENDPOINT
// =============================================================================

router.get("/storage/status", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const status = await getStorageStatus(tenantId);
    res.json(status);
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.storageStatus", req);
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

router.post("/settings/brand-assets", requireAuth, requireTenantAdmin, upload.single("file"), async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;
    const assetType = req.body.type as string;

    if (!isS3Configured()) {
      throw new AppError(503, "INTERNAL_ERROR", "S3 storage is not configured");
    }

    if (!assetType || !isValidAssetType(assetType)) {
      throw AppError.badRequest("Invalid asset type. Must be: logo, icon, or favicon");
    }

    if (!req.file) {
      throw AppError.badRequest("No file provided");
    }

    const mimeType = req.file.mimetype;
    const validation = validateBrandAsset(mimeType, req.file.size);
    if (!validation.valid) {
      throw AppError.badRequest(validation.error);
    }

    const storageKey = generateBrandAssetKey(tenantId, assetType, req.file.originalname);
    const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

    const fieldMap: Record<AssetType, string> = {
      logo: "logoUrl",
      icon: "iconUrl",
      favicon: "faviconUrl",
    };

    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        throw AppError.notFound("Tenant");
      }
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    await storage.updateTenantSettings(tenantId, { [fieldMap[assetType]]: url });

    res.json({ url, type: assetType });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.uploadBrandAsset", req);
  }
});

// =============================================================================
// AGREEMENT ROUTES
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

function isSuperUser(req: any): boolean {
  const user = req.user as any;
  return user?.role === UserRole.SUPER_USER;
}

router.get("/agreement", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

    const activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    const draftAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    const active = activeAgreements[0] || null;
    const draft = draftAgreements[0] || null;

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
    handleRouteError(res, error, "tenantOnboarding.getAgreement", req);
  }
});

router.post("/agreement/draft", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      throw AppError.forbidden("Agreement management is now handled by platform administrators. Please contact your platform admin to request changes.");
    }

    const user = req.user as any;
    const tenantId = req.effectiveTenantId;

    const validation = agreementDraftSchema.safeParse(req.body);
    if (!validation.success) {
      throw AppError.badRequest(validation.error.errors[0].message);
    }

    const { title, body } = validation.data;

    const existingDrafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (existingDrafts.length > 0) {
      const updated = await db.update(tenantAgreements)
        .set({ title, body, updatedAt: new Date() })
        .where(eq(tenantAgreements.id, existingDrafts[0].id))
        .returning();

      return res.json(updated[0]);
    }

    const activeAgreements = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    const nextVersion = activeAgreements.length > 0 ? activeAgreements[0].version + 1 : 1;

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
    handleRouteError(res, error, "tenantOnboarding.createDraft", req);
  }
});

router.patch("/agreement/draft", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      throw AppError.forbidden("Agreement management is now handled by platform administrators. Please contact your platform admin to request changes.");
    }

    const tenantId = req.effectiveTenantId;

    const validation = agreementPatchSchema.safeParse(req.body);
    if (!validation.success) {
      throw AppError.badRequest(validation.error.errors[0].message);
    }

    const updates = validation.data;
    if (Object.keys(updates).length === 0) {
      throw AppError.badRequest("No fields to update");
    }

    const existingDrafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (existingDrafts.length === 0) {
      throw AppError.notFound("No draft found");
    }

    const updated = await db.update(tenantAgreements)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tenantAgreements.id, existingDrafts[0].id))
      .returning();

    res.json(updated[0]);
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.updateDraft", req);
  }
});

router.post("/agreement/publish", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      throw AppError.forbidden("Agreement management is now handled by platform administrators. Please contact your platform admin to request changes.");
    }

    const tenantId = req.effectiveTenantId;

    const drafts = await db.select()
      .from(tenantAgreements)
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.DRAFT)
      ))
      .limit(1);

    if (drafts.length === 0) {
      throw AppError.notFound("No draft to publish");
    }

    const draft = drafts[0];

    await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ));

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
    handleRouteError(res, error, "tenantOnboarding.publishAgreement", req);
  }
});

router.post("/agreement/unpublish", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    if (!isSuperUser(req)) {
      throw AppError.forbidden("Agreement management is now handled by platform administrators. Please contact your platform admin to request changes.");
    }

    const tenantId = req.effectiveTenantId;

    const result = await db.update(tenantAgreements)
      .set({ status: AgreementStatus.ARCHIVED, updatedAt: new Date() })
      .where(and(
        eq(tenantAgreements.tenantId, tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .returning();

    if (result.length === 0) {
      throw AppError.notFound("No active agreement to unpublish");
    }

    res.json({
      agreement: result[0],
      message: "Agreement unpublished. Users are no longer required to accept terms.",
    });
  } catch (error) {
    handleRouteError(res, error, "tenantOnboarding.unpublishAgreement", req);
  }
});

router.get("/agreement/stats", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const tenantId = req.effectiveTenantId;

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
    handleRouteError(res, error, "tenantOnboarding.agreementStats", req);
  }
});

export default router;
