/**
 * Agreement Enforcement Middleware
 * 
 * Blocks authenticated users from accessing most routes if they haven't
 * accepted the active tenant agreement. Exempt routes allow users to:
 * - Check their agreement status
 * - Accept the agreement
 * - Log in/out
 * - Complete onboarding
 * 
 * ============================================================================
 * SECURITY INVARIANTS
 * ============================================================================
 * 
 * 1. FAIL-CLOSED BEHAVIOR:
 *    If any error occurs during enforcement checks (database errors, unexpected
 *    exceptions), the middleware BLOCKS access by default. This prevents
 *    accidental bypasses due to system failures.
 * 
 * 2. SUPER USER BYPASS:
 *    Users with role=super_user are ALWAYS allowed through without checking
 *    agreement status. Super users manage the platform and aren't bound by
 *    tenant agreements. This includes super users impersonating tenants.
 * 
 * 3. NO ACTIVE AGREEMENT BEHAVIOR:
 *    If a tenant has NO active agreement (only drafts, or no agreements at all),
 *    users are ALLOWED through. Rationale: Tenant admins configure agreements;
 *    until one is activated, enforcement cannot apply. This is explicit policy.
 * 
 * 4. EXEMPT ROUTES:
 *    Certain routes must remain accessible regardless of agreement status:
 *    - /api/auth/* - Login, logout, session management
 *    - /api/v1/me/agreement/* - Check status, accept agreement
 *    - /api/v1/tenant/onboarding/* - Tenant setup flow
 *    - /api/v1/invitations/* - Accept invitations
 *    - /api/v1/super/* - Super admin routes (additional layer)
 *    - Static assets (JS, CSS, images, fonts, etc.)
 * 
 * 5. UNAUTHENTICATED USERS:
 *    Users who are not authenticated are ALLOWED through. Authentication
 *    enforcement happens via separate middleware (requireAuth).
 * 
 * 6. NON-SUPER USERS WITHOUT TENANT:
 *    Non-super users with no tenantId are BLOCKED with 451.
 *    This catches orphaned users (tenant deleted/misconfigured) and prevents
 *    them from bypassing agreement enforcement. Only super_user role bypasses.
 *    This is fail-closed behavior for account integrity.
 * 
 * ============================================================================
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { tenantAgreements, tenantAgreementAcceptances, AgreementStatus, UserRole } from "@shared/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

/**
 * EXEMPT ROUTE PATTERNS
 * Routes matching these patterns bypass agreement enforcement.
 * Pattern order doesn't matter - any match exempts the route.
 */
const EXEMPT_ROUTE_PATTERNS = [
  /^\/api\/auth\//,                // Auth routes (login, logout, register)
  /^\/api\/v1\/me\/agreement\//,   // Agreement status and acceptance
  /^\/api\/v1\/tenant\/onboarding/,// Tenant onboarding flow
  /^\/api\/v1\/invitations\//,     // Invitation acceptance
  /^\/api\/v1\/super\//,           // Super admin routes
  /^\/api\/v1\/tenant\/branding/,  // Branding needed for app shell
  /^\/api\/notifications/,         // Notifications for app shell
  /^\/$/,                          // Root path
  /^\/accept-terms/,               // Accept terms page
  /^\/login/,                      // Login page
  /^\/register/,                   // Register page
  /^\/assets\//,                   // Static assets
  /^\/src\//,                      // Dev server source
  /^\/@/,                          // Vite internals
  /^\/node_modules\//,             // Node modules
  /\.js$/,                         // JavaScript files
  /\.css$/,                        // CSS files
  /\.ico$/,                        // Icons
  /\.png$/,                        // Images
  /\.jpg$/,                        // Images
  /\.svg$/,                        // SVG files
  /\.woff/,                        // Fonts
  /\.ttf$/,                        // Fonts
  /\.html$/,                       // HTML files
  /\.map$/,                        // Source maps
];

/**
 * EXEMPT EXACT ROUTES
 * Routes that must match exactly to bypass enforcement.
 */
const EXEMPT_EXACT_ROUTES = [
  "/api/user",
  "/api/v1/me/avatar",
  "/api/auth/me",
  "/api/auth/logout",
];

function isExemptRoute(path: string): boolean {
  // All non-API routes are exempt (frontend routes handled by React)
  if (!path.startsWith("/api/")) {
    return true;
  }
  if (EXEMPT_EXACT_ROUTES.includes(path)) {
    return true;
  }
  return EXEMPT_ROUTE_PATTERNS.some(pattern => pattern.test(path));
}

interface AgreementCache {
  tenantId: string;
  agreement: {
    id: string;
    version: number;
  } | null;
  fetchedAt: number;
}

const agreementCache = new Map<string, AgreementCache>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

/**
 * Fetch active agreement for a tenant with caching.
 * 
 * RESOLUTION LOGIC:
 * 1. First check for tenant-specific active agreement (tenantId = given ID)
 * 2. If none, fall back to global default (tenantId = NULL, "All Tenants")
 * 3. If still none, return null (no active agreement)
 * 
 * Returns null if no active agreement exists.
 * Throws on database errors (caller must handle).
 */
async function getActiveAgreement(tenantId: string): Promise<{ id: string; version: number } | null> {
  const now = Date.now();
  const cached = agreementCache.get(tenantId);
  
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.agreement;
  }

  // First: Check for tenant-specific active agreement
  const tenantSpecificAgreements = await db.select({
    id: tenantAgreements.id,
    version: tenantAgreements.version,
  })
    .from(tenantAgreements)
    .where(and(
      eq(tenantAgreements.tenantId, tenantId),
      eq(tenantAgreements.status, AgreementStatus.ACTIVE)
    ))
    .limit(1);

  let agreement = tenantSpecificAgreements.length > 0 ? tenantSpecificAgreements[0] : null;

  // Second: If no tenant-specific, check for global default (tenantId = NULL)
  if (!agreement) {
    const globalAgreements = await db.select({
      id: tenantAgreements.id,
      version: tenantAgreements.version,
    })
      .from(tenantAgreements)
      .where(and(
        isNull(tenantAgreements.tenantId),
        eq(tenantAgreements.status, AgreementStatus.ACTIVE)
      ))
      .limit(1);

    agreement = globalAgreements.length > 0 ? globalAgreements[0] : null;
  }

  agreementCache.set(tenantId, {
    tenantId,
    agreement,
    fetchedAt: now,
  });

  return agreement;
}

/**
 * Invalidate cached agreement for a tenant.
 * Call this when an agreement is activated, deactivated, or updated.
 */
export function invalidateAgreementCache(tenantId: string): void {
  agreementCache.delete(tenantId);
}

/**
 * Clear all cached agreements.
 * Useful for testing or cache reset scenarios.
 */
export function clearAgreementCache(): void {
  agreementCache.clear();
}

/**
 * Log structured warning for agreement enforcement issues.
 * Includes context for debugging without exposing secrets.
 */
function logEnforcementWarning(
  message: string,
  context: {
    requestId?: string;
    tenantId?: string;
    userId?: string;
    path?: string;
    error?: Error;
  }
): void {
  console.warn(JSON.stringify({
    level: "warn",
    component: "agreementEnforcement",
    message,
    requestId: context.requestId || "unknown",
    tenantId: context.tenantId || "unknown",
    userId: context.userId || "unknown",
    path: context.path || "unknown",
    errorMessage: context.error?.message,
    errorStack: context.error?.stack,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Agreement Enforcement Guard Middleware
 * 
 * Enforces that authenticated tenant users have accepted the active agreement.
 * See SECURITY INVARIANTS at the top of this file for behavior documentation.
 * 
 * Response on enforcement: HTTP 451 (Unavailable For Legal Reasons)
 * {
 *   error: "Agreement acceptance required",
 *   code: "AGREEMENT_REQUIRED",
 *   message: "You must accept the terms of service before continuing.",
 *   redirectTo: "/accept-terms"
 * }
 */
export async function agreementEnforcementGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // INVARIANT 4: Exempt routes bypass enforcement
  if (isExemptRoute(req.path)) {
    return next();
  }

  // INVARIANT 5: Unauthenticated users bypass enforcement
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return next();
  }

  const user = req.user as any;
  const requestId = (req as any).requestId || req.headers["x-request-id"] || "unknown";
  
  // INVARIANT 2: Super users always bypass
  if (user.role === UserRole.SUPER_USER) {
    return next();
  }

  const tenantId = user.tenantId;
  
  // INVARIANT 6: Non-super users without tenant are BLOCKED
  // This catches orphaned users (tenant deleted/misconfigured) and prevents
  // them from accessing tenant-scoped APIs without proper agreement gating.
  // Only super_user role (checked above) can proceed without a tenantId.
  if (!tenantId) {
    logEnforcementWarning("Non-super user without tenantId blocked (orphaned user)", {
      requestId,
      tenantId: "null",
      userId: user.id,
      path: req.path,
    });
    
    // Uses standard error envelope for consistency
    res.status(451).json({
      error: {
        code: "TENANT_REQUIRED",
        message: "Your account is not properly configured. Please contact your administrator.",
        status: 451,
        requestId,
        details: { redirectTo: "/accept-terms" },
      },
      // Legacy compatibility fields
      code: "TENANT_REQUIRED",
      message: "Your account is not properly configured. Please contact your administrator.",
      redirectTo: "/accept-terms",
    });
    return;
  }

  try {
    const activeAgreement = await getActiveAgreement(tenantId);

    // INVARIANT 3: No active agreement => allow access
    // Rationale: Until tenant admin activates an agreement, enforcement cannot apply.
    if (!activeAgreement) {
      return next();
    }

    // Check if user has accepted the current active agreement version
    const acceptances = await db.select({ id: tenantAgreementAcceptances.id })
      .from(tenantAgreementAcceptances)
      .where(and(
        eq(tenantAgreementAcceptances.tenantId, tenantId),
        eq(tenantAgreementAcceptances.userId, user.id),
        eq(tenantAgreementAcceptances.agreementId, activeAgreement.id),
        eq(tenantAgreementAcceptances.version, activeAgreement.version)
      ))
      .limit(1);

    // User has accepted current version
    if (acceptances.length > 0) {
      return next();
    }

    // User has NOT accepted - block with 451
    // Uses standard error envelope for consistency
    res.status(451).json({
      error: {
        code: "AGREEMENT_REQUIRED",
        message: "You must accept the terms of service before continuing.",
        status: 451,
        requestId,
        details: { redirectTo: "/accept-terms" },
      },
      // Legacy compatibility fields
      code: "AGREEMENT_REQUIRED",
      message: "You must accept the terms of service before continuing.",
      redirectTo: "/accept-terms",
    });
  } catch (error) {
    // INVARIANT 1: FAIL-CLOSED on any error
    // Log structured warning with context for debugging
    logEnforcementWarning("Agreement enforcement check failed - blocking access (fail-closed)", {
      requestId,
      tenantId,
      userId: user.id,
      path: req.path,
      error: error instanceof Error ? error : new Error(String(error)),
    });

    // Block access on error - fail-closed for security
    // Uses standard error envelope for consistency
    res.status(451).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to verify agreement status. Please try again or contact support.",
        status: 451,
        requestId,
        details: { redirectTo: "/accept-terms" },
      },
      // Legacy compatibility fields
      code: "AGREEMENT_CHECK_ERROR",
      message: "Unable to verify agreement status. Please try again or contact support.",
      redirectTo: "/accept-terms",
    });
  }
}
