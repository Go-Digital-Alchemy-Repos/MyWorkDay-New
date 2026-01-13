/**
 * Tenant Status Guard Middleware
 * 
 * Blocks access to most API routes for users of inactive tenants.
 * Only allows:
 * - Authentication routes (/api/v1/auth/*, /api/auth/*)
 * - Tenant onboarding routes (/api/v1/tenant/*)
 * - Mailgun settings for onboarding (/api/v1/settings/mailgun*)
 * - Health check (/api/health)
 * - Super user bootstrap (/api/v1/super/bootstrap)
 * 
 * Super users are never blocked by tenant status.
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { tenants, TenantStatus, UserRole } from "@shared/schema";
import { eq } from "drizzle-orm";

// Routes that are always allowed regardless of tenant status
const ALLOWED_ROUTE_PATTERNS = [
  /^\/api\/v1\/auth\//,
  /^\/api\/auth\//,
  /^\/api\/v1\/tenant\//,
  /^\/api\/v1\/settings\/mailgun/,
  /^\/api\/health$/,
  /^\/api\/v1\/super\/bootstrap$/,
];

export interface TenantStatusGuardOptions {
  // If true, only log warnings but don't block (for gradual rollout)
  softMode?: boolean;
}

export function tenantStatusGuard(options: TenantStatusGuardOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get user from session
      const user = req.user as any;

      // Skip if not authenticated (auth routes will handle this)
      if (!user) {
        return next();
      }

      // Super users are never blocked
      if (user.role === UserRole.SUPER_USER) {
        return next();
      }

      // Check if route is in allowed list
      const isAllowedRoute = ALLOWED_ROUTE_PATTERNS.some(pattern => 
        pattern.test(req.path)
      );

      if (isAllowedRoute) {
        return next();
      }

      // Get effective tenant ID (from header for super users, or from user's tenantId)
      const tenantId = req.headers["x-tenant-id"] as string || user.tenantId;

      // If no tenant context, skip guard (other middleware will handle this)
      if (!tenantId) {
        return next();
      }

      // Look up tenant
      const tenant = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1);

      if (!tenant.length) {
        // Tenant not found - let other middleware handle
        return next();
      }

      const tenantRecord = tenant[0];

      // Check if tenant is suspended (blocked even for admins)
      if (tenantRecord.status === TenantStatus.SUSPENDED) {
        return res.status(403).json({
          error: {
            code: "TENANT_SUSPENDED",
            message: "Your organization's account has been suspended. Please contact support.",
          }
        });
      }

      // Check if tenant is active (not inactive)
      if (tenantRecord.status !== TenantStatus.ACTIVE) {
        const errorResponse = {
          error: {
            code: "TENANT_INACTIVE",
            message: "Tenant onboarding incomplete.",
          }
        };

        if (options.softMode) {
          // In soft mode, log but don't block
          console.warn(`[TenantStatusGuard] SOFT MODE: Would block request to ${req.path} for inactive tenant ${tenantId}`);
          res.setHeader("X-Tenant-Status-Warning", "Tenant is inactive - would be blocked in strict mode");
          return next();
        }

        return res.status(403).json(errorResponse);
      }

      // Tenant is active, proceed
      next();
    } catch (error) {
      console.error("[TenantStatusGuard] Error checking tenant status:", error);
      // Don't block on errors - fail open but log
      next();
    }
  };
}

/**
 * Helper function to check if a tenant is active
 */
export async function isTenantActive(tenantId: string): Promise<boolean> {
  const tenant = await db
    .select({ status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return tenant.length > 0 && tenant[0].status === TenantStatus.ACTIVE;
}

/**
 * Helper function to check if a tenant is onboarded
 */
export async function isTenantOnboarded(tenantId: string): Promise<boolean> {
  const tenant = await db
    .select({ 
      status: tenants.status, 
      onboardedAt: tenants.onboardedAt 
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  return tenant.length > 0 && 
         tenant[0].status === TenantStatus.ACTIVE && 
         tenant[0].onboardedAt !== null;
}
