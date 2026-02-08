/**
 * System-Level Integration Routes
 * 
 * Manages system-wide (default) integrations using the tenant_integrations table
 * with NULL tenantId to represent system-level configurations.
 * 
 * These integrations serve as fallbacks for tenants that don't have their own configurations.
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import { UserRole } from "@shared/schema";
import { tenantIntegrationService } from "../services/tenantIntegrations";
import { getStorageStatus } from "../storage/getStorageProvider";
import { isEncryptionAvailable } from "../lib/encryption";
import { AppError, handleRouteError } from "../lib/errors";

const router = Router();

function requireSuperUser(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    throw AppError.unauthorized("Authentication required");
  }
  const user = req.user as any;
  if (user.role !== UserRole.SUPER_USER) {
    throw AppError.forbidden("Super admin access required");
  }
  next();
}

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
  publicUrl: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
});

/**
 * SSO Google configuration schema
 */
const ssoGoogleUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
});

/**
 * GET /api/v1/system/integrations
 * List all system-level integrations
 */
router.get("/integrations", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integrations = await tenantIntegrationService.listIntegrations(null);
    res.json({ integrations });
  } catch (error) {
    res.json({ integrations: [] });
  }
});

/**
 * GET /api/v1/system/integrations/s3
 * Get system-level S3 configuration
 */
router.get("/integrations/s3", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "s3");
    
    if (!integration) {
      return res.json({
        provider: "s3",
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
        isSystemDefault: true,
      });
    }
    
    res.json({
      ...integration,
      isSystemDefault: true,
    });
  } catch (error) {
    res.json({
      provider: "s3",
      status: "not_configured",
      publicConfig: null,
      secretConfigured: false,
      lastTestedAt: null,
      isSystemDefault: true,
    });
  }
});

/**
 * PUT /api/v1/system/integrations/s3
 * Update system-level S3 configuration
 */
router.put("/integrations/s3", requireSuperUser, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      throw AppError.badRequest("Encryption key not configured. Cannot save secrets.");
    }

    const data = s3UpdateSchema.parse(req.body);
    
    const result = await tenantIntegrationService.upsertIntegration(null, "s3", {
      publicConfig: {
        bucketName: data.bucketName,
        region: data.region,
        keyPrefixTemplate: data.keyPrefixTemplate,
      },
      secretConfig: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
    });
    
    res.json({
      ...result,
      isSystemDefault: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid request data"), "systemIntegrations.updateS3", req);
    }
    handleRouteError(res, error, "systemIntegrations.updateS3", req);
  }
});

/**
 * POST /api/v1/system/integrations/s3/test
 * Test system-level S3 connection
 */
router.post("/integrations/s3/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "s3");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing S3 integration:", error);
    res.json({ success: false, message: "Failed to test S3 integration" });
  }
});

/**
 * DELETE /api/v1/system/integrations/s3/secret/:secretName
 * Clear a specific S3 secret
 */
router.delete("/integrations/s3/secret/:secretName", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const { secretName } = req.params;
    const validSecrets = ["accessKeyId", "secretAccessKey"];
    
    if (!validSecrets.includes(secretName)) {
      throw AppError.badRequest("Invalid secret name");
    }
    
    await tenantIntegrationService.clearSecret(null, "s3", secretName);
    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, "systemIntegrations.clearS3Secret", req);
  }
});

// =============================================================================
// CLOUDFLARE R2 STORAGE - SYSTEM-LEVEL CONFIGURATION (PREFERRED DEFAULT)
// =============================================================================

/**
 * GET /api/v1/system/integrations/r2
 * Get system-level Cloudflare R2 configuration
 */
router.get("/integrations/r2", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "r2");
    
    if (!integration) {
      return res.json({
        provider: "r2",
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
        isSystemDefault: true,
      });
    }
    
    res.json({
      ...integration,
      isSystemDefault: true,
    });
  } catch (error) {
    res.json({
      provider: "r2",
      status: "not_configured",
      publicConfig: null,
      secretConfigured: false,
      lastTestedAt: null,
      isSystemDefault: true,
    });
  }
});

/**
 * PUT /api/v1/system/integrations/r2
 * Update system-level Cloudflare R2 configuration
 */
router.put("/integrations/r2", requireSuperUser, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      throw AppError.badRequest("Encryption key not configured. Cannot save secrets.");
    }

    const data = r2UpdateSchema.parse(req.body);
    
    const endpoint = data.accountId 
      ? `https://${data.accountId}.r2.cloudflarestorage.com`
      : undefined;
    
    const result = await tenantIntegrationService.upsertIntegration(null, "r2", {
      publicConfig: {
        bucketName: data.bucketName,
        region: "auto",
        accountId: data.accountId,
        endpoint,
        keyPrefixTemplate: data.keyPrefixTemplate,
        publicUrl: data.publicUrl,
      },
      secretConfig: {
        accessKeyId: data.accessKeyId,
        secretAccessKey: data.secretAccessKey,
      },
    });
    
    res.json({
      ...result,
      isSystemDefault: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid request data"), "systemIntegrations.updateR2", req);
    }
    handleRouteError(res, error, "systemIntegrations.updateR2", req);
  }
});

/**
 * POST /api/v1/system/integrations/r2/test
 * Test system-level Cloudflare R2 connection
 */
router.post("/integrations/r2/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "r2");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing R2 integration:", error);
    res.json({ success: false, message: "Failed to test R2 integration" });
  }
});

/**
 * GET /api/v1/system/storage/status
 * Get storage status for the system (including environment variables fallback)
 */
router.get("/storage/status", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const status = await getStorageStatus(null);
    res.json({
      ...status,
      encryptionConfigured: isEncryptionAvailable(),
    });
  } catch (error) {
    res.json({
      configured: false,
      provider: null,
      source: null,
      encryptionConfigured: isEncryptionAvailable(),
    });
  }
});

// =============================================================================
// SSO PROVIDERS - SYSTEM-LEVEL CONFIGURATION
// =============================================================================

/**
 * Helper to compute redirect URI based on app base URL
 */
function getDefaultRedirectUri(provider: "google"): string {
  const baseUrl = process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || "http://localhost:5000";
  return `${baseUrl}/api/v1/auth/${provider}/callback`;
}

/**
 * GET /api/v1/system/integrations/sso/google
 * Get system-level Google SSO configuration
 * Never returns clientSecret - only indicates if it's configured
 */
router.get("/integrations/sso/google", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "sso_google");
    
    if (!integration) {
      return res.json({
        provider: "sso_google",
        status: "not_configured",
        enabled: false,
        clientId: null,
        redirectUri: getDefaultRedirectUri("google"),
        clientSecretPresent: false,
        lastTestedAt: null,
      });
    }
    
    const publicConfig = integration.publicConfig as { enabled?: boolean; clientId?: string; redirectUri?: string } | null;
    
    res.json({
      provider: "sso_google",
      status: integration.status,
      enabled: publicConfig?.enabled ?? false,
      clientId: publicConfig?.clientId ?? null,
      redirectUri: publicConfig?.redirectUri ?? getDefaultRedirectUri("google"),
      clientSecretPresent: integration.secretConfigured,
      clientSecretMasked: integration.secretMasked?.clientSecretMasked ?? null,
      lastTestedAt: integration.lastTestedAt,
    });
  } catch (error) {
    res.json({
      provider: "sso_google",
      status: "not_configured",
      enabled: false,
      clientId: null,
      redirectUri: getDefaultRedirectUri("google"),
      clientSecretPresent: false,
      lastTestedAt: null,
    });
  }
});

/**
 * PUT /api/v1/system/integrations/sso/google
 * Update system-level Google SSO configuration
 * Encrypts clientSecret before storage
 */
router.put("/integrations/sso/google", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const data = ssoGoogleUpdateSchema.parse(req.body);
    
    if (data.clientSecret && !isEncryptionAvailable()) {
      throw AppError.badRequest("Cannot save secrets. APP_ENCRYPTION_KEY environment variable is not configured.");
    }

    if (data.enabled === true) {
      const existing = await tenantIntegrationService.getIntegration(null, "sso_google");
      const hasClientId = data.clientId || (existing?.publicConfig as any)?.clientId;
      const hasSecret = data.clientSecret || existing?.secretConfigured;
      
      if (!hasClientId || !hasSecret) {
        throw AppError.badRequest("Cannot enable Google SSO without Client ID and Client Secret");
      }
    }

    const result = await tenantIntegrationService.upsertIntegration(null, "sso_google", {
      publicConfig: {
        enabled: data.enabled,
        clientId: data.clientId,
        redirectUri: data.redirectUri || getDefaultRedirectUri("google"),
      },
      secretConfig: data.clientSecret ? { clientSecret: data.clientSecret } : undefined,
    });
    
    const publicConfig = result.publicConfig as { enabled?: boolean; clientId?: string; redirectUri?: string } | null;
    
    res.json({
      provider: "sso_google",
      status: result.status,
      enabled: publicConfig?.enabled ?? false,
      clientId: publicConfig?.clientId ?? null,
      redirectUri: publicConfig?.redirectUri ?? getDefaultRedirectUri("google"),
      clientSecretPresent: result.secretConfigured,
      lastTestedAt: result.lastTestedAt,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid request data"), "systemIntegrations.updateSSOGoogle", req);
    }
    handleRouteError(res, error, "systemIntegrations.updateSSOGoogle", req);
  }
});

/**
 * POST /api/v1/system/integrations/sso/google/test
 * Test Google SSO configuration
 */
router.post("/integrations/sso/google/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "sso_google");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing Google SSO:", error);
    res.json({ success: false, message: "Failed to test Google SSO configuration" });
  }
});

/**
 * GET /api/v1/system/integrations/sso/status
 * Get overall SSO configuration status for display in UI
 */
router.get("/integrations/sso/status", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const google = await tenantIntegrationService.getIntegration(null, "sso_google");
    
    const googleConfig = google?.publicConfig as { enabled?: boolean } | null;
    
    res.json({
      google: {
        configured: google?.status === "configured",
        enabled: googleConfig?.enabled ?? false,
      },
      encryptionConfigured: isEncryptionAvailable(),
    });
  } catch (error) {
    res.json({
      google: { configured: false, enabled: false },
      encryptionConfigured: isEncryptionAvailable(),
    });
  }
});

// =============================================================================
// OPENAI AI INTEGRATION - SYSTEM-LEVEL CONFIGURATION
// =============================================================================

/**
 * OpenAI configuration schema
 */
const openaiUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  model: z.string().optional(),
  maxTokens: z.number().optional(),
  temperature: z.string().optional(),
  apiKey: z.string().optional(),
});

/**
 * GET /api/v1/system/integrations/openai
 * Get system-level OpenAI configuration
 */
router.get("/integrations/openai", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "openai");
    
    if (!integration) {
      return res.json({
        provider: "openai",
        status: "not_configured",
        publicConfig: null,
        secretConfigured: false,
        lastTestedAt: null,
        isSystemDefault: true,
      });
    }
    
    res.json({
      ...integration,
      isSystemDefault: true,
    });
  } catch (error) {
    res.json({
      provider: "openai",
      status: "not_configured",
      publicConfig: null,
      secretConfigured: false,
      lastTestedAt: null,
      isSystemDefault: true,
    });
  }
});

/**
 * PUT /api/v1/system/integrations/openai
 * Update system-level OpenAI configuration
 */
router.put("/integrations/openai", requireSuperUser, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      throw AppError.badRequest("Encryption key not configured. Cannot save secrets.");
    }

    const data = openaiUpdateSchema.parse(req.body);
    
    const result = await tenantIntegrationService.upsertIntegration(null, "openai", {
      publicConfig: {
        enabled: data.enabled ?? true,
        model: data.model ?? "gpt-4o-mini",
        maxTokens: data.maxTokens ?? 2000,
        temperature: data.temperature ?? "0.7",
      },
      secretConfig: data.apiKey ? {
        apiKey: data.apiKey,
      } : undefined,
    });
    
    res.json({
      ...result,
      isSystemDefault: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleRouteError(res, AppError.badRequest("Invalid request data"), "systemIntegrations.updateOpenAI", req);
    }
    handleRouteError(res, error, "systemIntegrations.updateOpenAI", req);
  }
});

/**
 * POST /api/v1/system/integrations/openai/test
 * Test system-level OpenAI connection
 */
router.post("/integrations/openai/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "openai");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing OpenAI integration:", error);
    res.json({ success: false, message: "Failed to test OpenAI integration" });
  }
});

export default router;
