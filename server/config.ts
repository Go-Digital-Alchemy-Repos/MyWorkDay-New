/**
 * Centralized Configuration Module
 * 
 * Purpose: Read and validate all environment variables at startup.
 * 
 * Behavior:
 * - In production (NODE_ENV=production): Fails fast if critical vars are missing
 * - In development: Uses safe defaults for optional vars, warns about missing ones
 * 
 * Sharp Edges:
 * - Import this module early in server startup to catch config issues immediately
 * - Never log actual secret values - only log whether they are configured
 */

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = !isProduction;

// ============================================================================
// Configuration Value Helpers
// ============================================================================

function requireEnv(key: string, reason: string): string {
  const value = process.env[key];
  if (!value) {
    if (isProduction) {
      throw new Error(
        `FATAL: ${key} environment variable is required in production. ${reason}`
      );
    }
    console.warn(`[config] WARNING: ${key} is not set - ${reason}`);
    return "";
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function optionalEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function optionalEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// Core Configuration (Required in Production)
// ============================================================================

export const config = {
  // Environment
  nodeEnv: optionalEnv("NODE_ENV", "development"),
  isProduction,
  isDevelopment,
  
  // Server
  port: optionalEnvInt("PORT", 5000),
  host: "0.0.0.0",
  
  // Database (CRITICAL - required in production)
  databaseUrl: (() => {
    const url = process.env.DATABASE_URL;
    if (!url && isProduction) {
      throw new Error(
        "FATAL: DATABASE_URL environment variable is required in production. " +
        "The application cannot function without a database connection."
      );
    }
    if (!url) {
      console.warn("[config] WARNING: DATABASE_URL is not set - database operations will fail");
    }
    return url || "";
  })(),
  
  // Session (CRITICAL - required in production)
  sessionSecret: (() => {
    const secret = process.env.SESSION_SECRET;
    if (!secret && isProduction) {
      throw new Error(
        "FATAL: SESSION_SECRET environment variable is required in production. " +
        "Sessions cannot be securely encrypted without it. " +
        "Set SESSION_SECRET to a strong random string (minimum 32 characters)."
      );
    }
    if (!secret) {
      console.warn("[config] WARNING: SESSION_SECRET not set - using insecure dev fallback");
    }
    return secret || "dasana-dev-secret-key";
  })(),
  
  // Startup behavior
  autoMigrate: optionalEnvBool("AUTO_MIGRATE", false),
  fastStartup: optionalEnvBool("FAST_STARTUP", false),
  skipParityCheck: optionalEnvBool("SKIP_PARITY_CHECK", false),
  failOnSchemaIssues: optionalEnvBool("FAIL_ON_SCHEMA_ISSUES", true),
  
  // Rate Limiting
  rateLimiting: {
    enabled: optionalEnvBool("RATE_LIMIT_ENABLED", true),
    devEnabled: optionalEnvBool("RATE_LIMIT_DEV_ENABLED", false),
    debug: optionalEnvBool("RATE_LIMIT_DEBUG", false),
    loginWindowMs: optionalEnvInt("RATE_LIMIT_LOGIN_WINDOW_MS", 60000),
    loginMaxIp: optionalEnvInt("RATE_LIMIT_LOGIN_MAX_IP", 10),
    loginMaxEmail: optionalEnvInt("RATE_LIMIT_LOGIN_MAX_EMAIL", 5),
    bootstrapWindowMs: optionalEnvInt("RATE_LIMIT_BOOTSTRAP_WINDOW_MS", 60000),
    bootstrapMaxIp: optionalEnvInt("RATE_LIMIT_BOOTSTRAP_MAX_IP", 5),
    inviteWindowMs: optionalEnvInt("RATE_LIMIT_INVITE_WINDOW_MS", 60000),
    inviteMaxIp: optionalEnvInt("RATE_LIMIT_INVITE_MAX_IP", 10),
    forgotPasswordWindowMs: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS", 60000),
    forgotPasswordMaxIp: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_MAX_IP", 5),
    forgotPasswordMaxEmail: optionalEnvInt("RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL", 3),
    uploadWindowMs: optionalEnvInt("RATE_LIMIT_UPLOAD_WINDOW_MS", 60000),
    uploadMaxIp: optionalEnvInt("RATE_LIMIT_UPLOAD_MAX_IP", 30),
  },
  
  // Cloudflare R2 Storage (optional - system can use tenant-level config)
  r2: {
    accountId: process.env.CF_R2_ACCOUNT_ID || "",
    accessKeyId: process.env.CF_R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY || "",
    bucketName: process.env.CF_R2_BUCKET_NAME || "",
    publicUrl: process.env.CF_R2_PUBLIC_URL || "",
    isConfigured: !!(
      process.env.CF_R2_ACCOUNT_ID &&
      process.env.CF_R2_ACCESS_KEY_ID &&
      process.env.CF_R2_SECRET_ACCESS_KEY &&
      process.env.CF_R2_BUCKET_NAME
    ),
  },
  
  // Mailgun (optional - email features disabled if not set)
  mailgun: {
    apiKey: process.env.MAILGUN_API_KEY || "",
    domain: process.env.MAILGUN_DOMAIN || "",
    fromEmail: process.env.MAILGUN_FROM_EMAIL || "",
    isConfigured: !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN),
    debug: optionalEnvBool("MAILGUN_DEBUG", false),
  },
  
  // Google OAuth (optional - SSO disabled if not set)
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    isConfigured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  },
  
  // Stripe (optional - billing features disabled if not set)
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    isConfigured: !!process.env.STRIPE_SECRET_KEY,
  },
  
  // OpenAI (optional - AI features disabled if not set)
  openai: {
    apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "",
    isConfigured: !!(process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY),
  },
  
  // CRM & Client Portal Feature Flags (all default OFF)
  crm: {
    client360Enabled: optionalEnvBool("CRM_CLIENT_360_ENABLED", false),
    contactsEnabled: optionalEnvBool("CRM_CONTACTS_ENABLED", false),
    timelineEnabled: optionalEnvBool("CRM_TIMELINE_ENABLED", false),
    portalEnabled: optionalEnvBool("CRM_PORTAL_ENABLED", false),
    filesEnabled: optionalEnvBool("CRM_FILES_ENABLED", false),
    approvalsEnabled: optionalEnvBool("CRM_APPROVALS_ENABLED", false),
    clientMessagingEnabled: optionalEnvBool("CRM_CLIENT_MESSAGING_ENABLED", false),
  },

  // Git info for versioning
  git: {
    commitSha: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA || "unknown",
    branch: process.env.RAILWAY_GIT_BRANCH || process.env.GIT_BRANCH || "unknown",
  },
} as const;

// ============================================================================
// Validation Results (for health checks and diagnostics)
// ============================================================================

export interface ConfigValidationResult {
  isValid: boolean;
  criticalMissing: string[];
  optionalMissing: string[];
  warnings: string[];
}

export function validateConfig(): ConfigValidationResult {
  const criticalMissing: string[] = [];
  const optionalMissing: string[] = [];
  const warnings: string[] = [];
  
  // Critical vars
  if (!config.databaseUrl) criticalMissing.push("DATABASE_URL");
  if (!config.sessionSecret || config.sessionSecret === "dasana-dev-secret-key") {
    if (isProduction) {
      criticalMissing.push("SESSION_SECRET");
    } else {
      warnings.push("SESSION_SECRET not set - using insecure dev fallback");
    }
  }
  
  // Optional but recommended
  if (!config.r2.isConfigured) {
    optionalMissing.push("Cloudflare R2 (CF_R2_*)");
    warnings.push("File uploads will use fallback or tenant-level R2 config");
  }
  
  if (!config.mailgun.isConfigured) {
    optionalMissing.push("Mailgun (MAILGUN_API_KEY, MAILGUN_DOMAIN)");
    warnings.push("Email sending is disabled");
  }
  
  if (!config.google.isConfigured) {
    optionalMissing.push("Google OAuth (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)");
    warnings.push("Google SSO is disabled");
  }
  
  if (!config.stripe.isConfigured) {
    optionalMissing.push("Stripe (STRIPE_SECRET_KEY)");
    warnings.push("Billing features are disabled");
  }
  
  return {
    isValid: criticalMissing.length === 0,
    criticalMissing,
    optionalMissing,
    warnings,
  };
}

// ============================================================================
// Startup Logging
// ============================================================================

export function logConfigStatus(): void {
  console.log(`[config] Environment: ${config.nodeEnv}`);
  console.log(`[config] Database: ${config.databaseUrl ? "configured" : "NOT CONFIGURED"}`);
  console.log(`[config] Session Secret: ${config.sessionSecret !== "dasana-dev-secret-key" ? "configured" : "using dev fallback"}`);
  console.log(`[config] Auto Migrate: ${config.autoMigrate}`);
  console.log(`[config] Fast Startup: ${config.fastStartup}`);
  console.log(`[config] R2 Storage: ${config.r2.isConfigured ? "configured" : "not configured"}`);
  console.log(`[config] Mailgun: ${config.mailgun.isConfigured ? "configured" : "disabled"}`);
  console.log(`[config] Google OAuth: ${config.google.isConfigured ? "configured" : "disabled"}`);
  console.log(`[config] Stripe: ${config.stripe.isConfigured ? "configured" : "disabled"}`);
  console.log(`[config] Rate Limiting: ${config.rateLimiting.enabled ? "enabled" : "disabled"}`);
}

// Run validation on import to fail fast in production
if (isProduction) {
  const validation = validateConfig();
  if (!validation.isValid) {
    console.error("[config] FATAL: Missing critical environment variables:");
    validation.criticalMissing.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }
}
