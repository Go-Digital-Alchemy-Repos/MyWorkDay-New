/**
 * SSO Configuration Service
 * 
 * Provides SSO configuration for authentication layer with a 3-tier resolution:
 * 1. Database configuration (tenant_integrations with tenantId=NULL)
 * 2. Environment variables fallback (GOOGLE_CLIENT_ID, etc.)
 * 3. Returns null if neither is configured
 * 
 * This service is used by the auth layer to dynamically load SSO credentials
 * from system settings without requiring a redeploy.
 */

import { tenantIntegrationService, SsoGooglePublicConfig, SsoGoogleSecretConfig } from "./tenantIntegrations";

export interface SsoGoogleConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  source: "database" | "environment";
}

export type SsoProvider = "google";

/**
 * Get default redirect URI based on provider
 */
function getDefaultRedirectUri(): string {
  const baseUrl = process.env.APP_PUBLIC_URL || process.env.APP_BASE_URL || "http://localhost:5000";
  return `${baseUrl}/api/v1/auth/google/callback`;
}

/**
 * Load Google SSO configuration with DB-first, env-fallback strategy
 * Returns null if neither DB nor env config is available
 */
export async function getSsoGoogleConfig(): Promise<SsoGoogleConfig | null> {
  try {
    const integration = await tenantIntegrationService.getIntegrationWithSecrets(null, "sso_google");
    
    if (integration?.publicConfig && integration?.secretConfig) {
      const publicConfig = integration.publicConfig as SsoGooglePublicConfig;
      const secretConfig = integration.secretConfig as SsoGoogleSecretConfig;
      
      if (publicConfig.enabled && publicConfig.clientId && secretConfig.clientSecret) {
        console.log("[sso-config] Using Google SSO config from database");
        return {
          enabled: true,
          clientId: publicConfig.clientId,
          clientSecret: secretConfig.clientSecret,
          redirectUri: publicConfig.redirectUri || getDefaultRedirectUri(),
          source: "database",
        };
      }
      
      if (!publicConfig.enabled) {
        console.log("[sso-config] Google SSO is disabled in database config");
        return null;
      }
    }
  } catch (error) {
    console.error("[sso-config] Error loading Google SSO from database:", error);
  }
  
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (clientId && clientSecret) {
    console.log("[sso-config] Using Google SSO config from environment variables");
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URL || getDefaultRedirectUri();
    return {
      enabled: true,
      clientId,
      clientSecret,
      redirectUri,
      source: "environment",
    };
  }
  
  console.log("[sso-config] No Google SSO configuration found");
  return null;
}

/**
 * Check if Google SSO provider is enabled
 * Quick check without loading full config (useful for UI status)
 */
export async function isSsoProviderEnabled(provider: SsoProvider): Promise<boolean> {
  if (provider === "google") {
    const config = await getSsoGoogleConfig();
    return config?.enabled ?? false;
  }
  
  return false;
}

/**
 * Get SSO status for all providers (for display in login page)
 */
export async function getSsoProvidersStatus(): Promise<{
  google: { enabled: boolean; source?: "database" | "environment" };
}> {
  const googleConfig = await getSsoGoogleConfig();
  
  return {
    google: {
      enabled: googleConfig?.enabled ?? false,
      source: googleConfig?.source,
    },
  };
}
