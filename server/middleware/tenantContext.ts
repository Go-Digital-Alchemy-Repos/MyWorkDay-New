/**
 * Tenant Context Middleware
 * 
 * Purpose: Injects tenant context into every request for multi-tenancy support.
 * 
 * Key Invariants:
 * - Regular users: tenantId and effectiveTenantId are always their own tenant
 * - Super users: effectiveTenantId can be overridden via X-Tenant-Id header
 * - Super users can access inactive tenants (for pre-provisioning)
 * 
 * Sharp Edges:
 * - X-Tenant-Id header is ONLY processed for verified super users
 * - Never expose X-Tenant-Id processing to non-super users (security risk)
 */
import { Request, Response, NextFunction } from "express";
import { UserRole } from "@shared/schema";
import { db } from "../db";
import { tenants } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface TenantContext {
  tenantId: string | null;
  effectiveTenantId: string | null;
  isSuperUser: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
    }
  }
}

export async function tenantContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  const session = req.session as any;

  if (!user) {
    req.tenant = {
      tenantId: null,
      effectiveTenantId: null,
      isSuperUser: false,
    };
    return next();
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;

  if (isSuperUser) {
    // Priority order for effective tenant:
    // 1. X-Tenant-Id header (explicit override)
    // 2. User impersonation session (impersonatedTenantId)
    // 3. Tenant impersonation session (actingAsTenantId)
    const headerTenantId = req.headers["x-tenant-id"] as string | undefined;
    const impersonatedTenantId = session?.impersonatedTenantId as string | undefined;
    const actingAsTenantId = session?.actingAsTenantId as string | undefined;
    
    const effectiveTenantId = headerTenantId || impersonatedTenantId || actingAsTenantId || null;
    
    if (effectiveTenantId) {
      // Super users can access any tenant (active or inactive) for pre-provisioning
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, effectiveTenantId));
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      // Note: Super users are NOT blocked by tenant status - they can pre-provision inactive tenants
    }
    
    req.tenant = {
      tenantId: user.tenantId || null,
      effectiveTenantId: effectiveTenantId,
      isSuperUser: true,
    };
  } else {
    req.tenant = {
      tenantId: user.tenantId || null,
      effectiveTenantId: user.tenantId || null,
      isSuperUser: false,
    };
  }

  next();
}

export function requireSuperUser(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Super user access required" });
  }

  next();
}

export function getEffectiveTenantId(req: Request): string | null {
  return req.tenant?.effectiveTenantId || null;
}

export function requireEffectiveTenantId(req: Request): string {
  const tenantId = getEffectiveTenantId(req);
  if (!tenantId) {
    throw new Error("Tenant context required but not available");
  }
  return tenantId;
}

export function requireTenantContext(req: Request, res: Response, next: NextFunction) {
  const user = req.user as any;
  
  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const isSuperUser = user.role === UserRole.SUPER_USER;
  
  if (isSuperUser) {
    return next();
  }

  if (!req.tenant?.effectiveTenantId) {
    console.error(`[tenantContext] User ${user.id} has no tenantId configured`);
    return res.status(500).json({ error: "User tenant not configured" });
  }

  next();
}

/**
 * Validation utility to ensure tenantId is always set when creating tenant-scoped entities.
 * This provides a guardrail to prevent future rows from being created without tenantId.
 * 
 * Returns the effective tenant ID or throws an error with detailed context.
 * 
 * @param req - The Express request object
 * @param entityType - The type of entity being created (for error logging)
 * @returns The effective tenant ID
 * @throws Error if no tenant context is available and user is not a super user
 */
export function requireTenantIdForCreate(req: Request, entityType: string): string {
  const user = req.user as any;
  const effectiveTenantId = req.tenant?.effectiveTenantId;
  const isSuperUser = user?.role === UserRole.SUPER_USER;
  
  if (effectiveTenantId) {
    return effectiveTenantId;
  }
  
  // Log a warning/error for audit purposes
  console.error(`[tenantGuardrail] Attempted to create ${entityType} without tenantId`, {
    userId: user?.id,
    userRole: user?.role,
    userTenantId: user?.tenantId,
    headerTenantId: req.headers["x-tenant-id"],
    endpoint: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString(),
  });
  
  // Super users operating without tenant context should get a clear error
  if (isSuperUser) {
    throw new TenantContextError(
      `Cannot create ${entityType} without tenant context. ` +
      `Super users must use X-Tenant-Id header when creating tenant-scoped data.`
    );
  }
  
  // Regular users without tenant context - this is a data integrity issue
  throw new TenantContextError(
    `User ${user?.id} has no tenant configured. Cannot create ${entityType}.`
  );
}

/**
 * Custom error class for tenant context issues
 */
export class TenantContextError extends Error {
  public readonly code = "TENANT_CONTEXT_REQUIRED";
  
  constructor(message: string) {
    super(message);
    this.name = "TenantContextError";
  }
}

/**
 * Middleware version of requireTenantIdForCreate for use in route handlers
 * Requires tenant context for all users including super users unless they provide X-Tenant-Id header
 */
export function requireTenantIdForCreateMiddleware(entityType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      requireTenantIdForCreate(req, entityType);
      next();
    } catch (error) {
      if (error instanceof TenantContextError) {
        return res.status(400).json({ 
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  };
}
