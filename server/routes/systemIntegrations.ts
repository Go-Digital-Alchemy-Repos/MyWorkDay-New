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

const router = Router();

function requireSuperUser(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: { code: "AUTH_REQUIRED", message: "Authentication required" } });
  }
  const user = req.user as any;
  if (user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Super admin access required" } });
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
 * SSO GitHub configuration schema  
 */
const ssoGithubUpdateSchema = z.object({
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
    console.error("[system-integrations] Error listing integrations:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to list integrations" } });
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
    console.error("[system-integrations] Error getting S3 integration:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to get S3 integration" } });
  }
});

/**
 * PUT /api/v1/system/integrations/s3
 * Update system-level S3 configuration
 */
router.put("/integrations/s3", requireSuperUser, async (req: Request, res: Response) => {
  try {
    if (process.env.NODE_ENV === "production" && !isEncryptionAvailable()) {
      return res.status(400).json({
        error: { code: "ENCRYPTION_REQUIRED", message: "Encryption key not configured. Cannot save secrets." },
      });
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
    console.error("[system-integrations] Error updating S3 integration:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    }
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update S3 integration" } });
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
    res.status(500).json({ success: false, message: "Failed to test S3 integration" });
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
    console.error("[system-integrations] Error checking storage status:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to check storage status" } });
  }
});

// =============================================================================
// SSO PROVIDERS - SYSTEM-LEVEL CONFIGURATION
// =============================================================================

/**
 * Helper to compute redirect URI based on app base URL
 */
function getDefaultRedirectUri(provider: "google" | "github"): string {
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
    console.error("[system-integrations] Error getting Google SSO config:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to get Google SSO configuration" } });
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
    
    // Check if trying to save secret without encryption
    if (data.clientSecret && !isEncryptionAvailable()) {
      return res.status(400).json({
        error: { 
          code: "ENCRYPTION_NOT_CONFIGURED", 
          message: "Cannot save secrets. APP_ENCRYPTION_KEY environment variable is not configured." 
        },
      });
    }

    // Validate: cannot enable without required fields
    if (data.enabled === true) {
      const existing = await tenantIntegrationService.getIntegration(null, "sso_google");
      const hasClientId = data.clientId || (existing?.publicConfig as any)?.clientId;
      const hasSecret = data.clientSecret || existing?.secretConfigured;
      
      if (!hasClientId || !hasSecret) {
        return res.status(400).json({
          error: { 
            code: "SSO_CONFIG_INCOMPLETE", 
            message: "Cannot enable Google SSO without Client ID and Client Secret" 
          },
        });
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
    console.error("[system-integrations] Error updating Google SSO config:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    }
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update Google SSO configuration" } });
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
    res.status(500).json({ success: false, message: "Failed to test Google SSO configuration" });
  }
});

/**
 * GET /api/v1/system/integrations/sso/github
 * Get system-level GitHub SSO configuration
 * Never returns clientSecret - only indicates if it's configured
 */
router.get("/integrations/sso/github", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const integration = await tenantIntegrationService.getIntegration(null, "sso_github");
    
    if (!integration) {
      return res.json({
        provider: "sso_github",
        status: "not_configured",
        enabled: false,
        clientId: null,
        redirectUri: getDefaultRedirectUri("github"),
        clientSecretPresent: false,
        lastTestedAt: null,
      });
    }
    
    const publicConfig = integration.publicConfig as { enabled?: boolean; clientId?: string; redirectUri?: string } | null;
    
    res.json({
      provider: "sso_github",
      status: integration.status,
      enabled: publicConfig?.enabled ?? false,
      clientId: publicConfig?.clientId ?? null,
      redirectUri: publicConfig?.redirectUri ?? getDefaultRedirectUri("github"),
      clientSecretPresent: integration.secretConfigured,
      clientSecretMasked: integration.secretMasked?.clientSecretMasked ?? null,
      lastTestedAt: integration.lastTestedAt,
    });
  } catch (error) {
    console.error("[system-integrations] Error getting GitHub SSO config:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to get GitHub SSO configuration" } });
  }
});

/**
 * PUT /api/v1/system/integrations/sso/github
 * Update system-level GitHub SSO configuration
 * Encrypts clientSecret before storage
 */
router.put("/integrations/sso/github", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const data = ssoGithubUpdateSchema.parse(req.body);
    
    // Check if trying to save secret without encryption
    if (data.clientSecret && !isEncryptionAvailable()) {
      return res.status(400).json({
        error: { 
          code: "ENCRYPTION_NOT_CONFIGURED", 
          message: "Cannot save secrets. APP_ENCRYPTION_KEY environment variable is not configured." 
        },
      });
    }

    // Validate: cannot enable without required fields
    if (data.enabled === true) {
      const existing = await tenantIntegrationService.getIntegration(null, "sso_github");
      const hasClientId = data.clientId || (existing?.publicConfig as any)?.clientId;
      const hasSecret = data.clientSecret || existing?.secretConfigured;
      
      if (!hasClientId || !hasSecret) {
        return res.status(400).json({
          error: { 
            code: "SSO_CONFIG_INCOMPLETE", 
            message: "Cannot enable GitHub SSO without Client ID and Client Secret" 
          },
        });
      }
    }

    const result = await tenantIntegrationService.upsertIntegration(null, "sso_github", {
      publicConfig: {
        enabled: data.enabled,
        clientId: data.clientId,
        redirectUri: data.redirectUri || getDefaultRedirectUri("github"),
      },
      secretConfig: data.clientSecret ? { clientSecret: data.clientSecret } : undefined,
    });
    
    const publicConfig = result.publicConfig as { enabled?: boolean; clientId?: string; redirectUri?: string } | null;
    
    res.json({
      provider: "sso_github",
      status: result.status,
      enabled: publicConfig?.enabled ?? false,
      clientId: publicConfig?.clientId ?? null,
      redirectUri: publicConfig?.redirectUri ?? getDefaultRedirectUri("github"),
      clientSecretPresent: result.secretConfigured,
      lastTestedAt: result.lastTestedAt,
    });
  } catch (error) {
    console.error("[system-integrations] Error updating GitHub SSO config:", error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request data" } });
    }
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to update GitHub SSO configuration" } });
  }
});

/**
 * POST /api/v1/system/integrations/sso/github/test
 * Test GitHub SSO configuration
 */
router.post("/integrations/sso/github/test", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const result = await tenantIntegrationService.testIntegration(null, "sso_github");
    res.json(result);
  } catch (error) {
    console.error("[system-integrations] Error testing GitHub SSO:", error);
    res.status(500).json({ success: false, message: "Failed to test GitHub SSO configuration" });
  }
});

/**
 * GET /api/v1/system/integrations/sso/status
 * Get overall SSO configuration status for display in UI
 */
router.get("/integrations/sso/status", requireSuperUser, async (req: Request, res: Response) => {
  try {
    const google = await tenantIntegrationService.getIntegration(null, "sso_google");
    const github = await tenantIntegrationService.getIntegration(null, "sso_github");
    
    const googleConfig = google?.publicConfig as { enabled?: boolean } | null;
    const githubConfig = github?.publicConfig as { enabled?: boolean } | null;
    
    res.json({
      google: {
        configured: google?.status === "configured",
        enabled: googleConfig?.enabled ?? false,
      },
      github: {
        configured: github?.status === "configured",
        enabled: githubConfig?.enabled ?? false,
      },
      encryptionConfigured: isEncryptionAvailable(),
    });
  } catch (error) {
    console.error("[system-integrations] Error getting SSO status:", error);
    res.status(500).json({ error: { code: "SERVER_ERROR", message: "Failed to get SSO status" } });
  }
});

export default router;
