/**
 * Tenancy Enforcement Middleware
 * 
 * Purpose: Enforces tenant data isolation based on TENANCY_ENFORCEMENT mode.
 * 
 * Modes (via TENANCY_ENFORCEMENT env var):
 * - off: No enforcement (development only)
 * - soft: Log warnings but allow operations (migration period)
 * - strict: Block cross-tenant operations (production)
 * 
 * Key Invariants:
 * - Validates tenant ownership before data access/mutation
 * - Records warnings to tenancyHealthTracker for soft mode
 * - Super users bypass most checks but operations are logged
 * 
 * Sharp Edges:
 * - Do NOT disable in production without explicit migration plan
 * - Soft mode warnings indicate data that needs remediation before strict mode
 */
import { Request, Response, NextFunction } from "express";
import { tenancyHealthTracker } from "./tenancyHealthTracker";

export type TenancyEnforcementMode = "off" | "soft" | "strict";

export function getTenancyEnforcementMode(): TenancyEnforcementMode {
  const mode = process.env.TENANCY_ENFORCEMENT?.toLowerCase();
  if (mode === "strict") return "strict";
  if (mode === "soft") return "soft";
  return "off";
}

export function isStrictMode(): boolean {
  return getTenancyEnforcementMode() === "strict";
}

export function isSoftMode(): boolean {
  return getTenancyEnforcementMode() === "soft";
}

export function isEnforcementEnabled(): boolean {
  const mode = getTenancyEnforcementMode();
  return mode === "soft" || mode === "strict";
}

export function addTenancyWarningHeader(res: Response, message: string): void {
  const existing = res.getHeader("X-Tenancy-Warn") as string | undefined;
  if (existing) {
    res.setHeader("X-Tenancy-Warn", `${existing}; ${message}`);
  } else {
    res.setHeader("X-Tenancy-Warn", message);
  }
}

export function logTenancyWarning(context: string, message: string, userId?: string): void {
  console.warn(`[TENANCY:${getTenancyEnforcementMode().toUpperCase()}] ${context}: ${message}${userId ? ` (user: ${userId})` : ""}`);
}

export interface TenancyWarningContext {
  route: string;
  method: string;
  warnType: "mismatch" | "missing-tenantId";
  actorUserId?: string;
  effectiveTenantId?: string;
  resourceId?: string;
  notes?: string;
}

export async function recordTenancyWarning(ctx: TenancyWarningContext): Promise<void> {
  const mode = getTenancyEnforcementMode();
  if (mode !== "soft") return;

  try {
    await tenancyHealthTracker.recordWarning({
      route: ctx.route,
      method: ctx.method,
      warnType: ctx.warnType,
      actorUserId: ctx.actorUserId,
      effectiveTenantId: ctx.effectiveTenantId,
      resourceId: ctx.resourceId,
      notes: ctx.notes,
    });
  } catch (error) {
    console.error("[TenancyEnforcement] Failed to record warning:", error);
  }
}

export interface TenancyValidationResult {
  valid: boolean;
  warning?: string;
  shouldFallback: boolean;
}

export function validateTenantOwnership(
  resourceTenantId: string | null,
  effectiveTenantId: string | null,
  resourceType: string,
  resourceId: string
): TenancyValidationResult {
  const mode = getTenancyEnforcementMode();
  
  if (mode === "off") {
    return { valid: true, shouldFallback: true };
  }
  
  if (!effectiveTenantId) {
    if (mode === "strict") {
      return { 
        valid: false, 
        warning: `No tenant context for ${resourceType} access`,
        shouldFallback: false 
      };
    }
    return { 
      valid: true, 
      warning: `No tenant context for ${resourceType}:${resourceId}`,
      shouldFallback: true 
    };
  }
  
  if (resourceTenantId === null) {
    if (mode === "strict") {
      return { 
        valid: false, 
        warning: `${resourceType}:${resourceId} has no tenantId (strict mode)`,
        shouldFallback: false 
      };
    }
    return { 
      valid: true, 
      warning: `${resourceType}:${resourceId} has legacy null tenantId`,
      shouldFallback: true 
    };
  }
  
  if (resourceTenantId !== effectiveTenantId) {
    return { 
      valid: false, 
      warning: `Cross-tenant access denied for ${resourceType}:${resourceId}`,
      shouldFallback: false 
    };
  }
  
  return { valid: true, shouldFallback: false };
}

export function handleTenancyViolation(
  res: Response,
  result: TenancyValidationResult,
  context: string
): boolean {
  if (!result.valid) {
    logTenancyWarning(context, result.warning || "Access denied");
    res.status(403).json({ error: "Access denied: tenant isolation violation" });
    return true;
  }
  
  if (result.warning) {
    logTenancyWarning(context, result.warning);
    addTenancyWarningHeader(res, result.warning);
  }
  
  return false;
}

/**
 * Runtime Guards for Write Operations
 * These functions ensure tenant integrity on INSERT and UPDATE operations.
 */

export interface WriteValidationResult {
  valid: boolean;
  blocked: boolean;
  error?: string;
  warning?: string;
}

/**
 * Validates tenant_id for INSERT operations
 * Ensures the tenant_id is set and matches the effective tenant context
 */
export function validateInsertTenantId(
  insertTenantId: string | null | undefined,
  effectiveTenantId: string | null,
  resourceType: string
): WriteValidationResult {
  const mode = getTenancyEnforcementMode();

  if (mode === "off") {
    return { valid: true, blocked: false };
  }

  // Super user creating cross-tenant data is allowed
  // (handled at route level with req.user.role check)

  // Check if effective tenant context exists
  if (!effectiveTenantId) {
    if (mode === "strict") {
      return {
        valid: false,
        blocked: true,
        error: `Cannot create ${resourceType}: no tenant context`,
      };
    }
    return {
      valid: true,
      blocked: false,
      warning: `Creating ${resourceType} without tenant context`,
    };
  }

  // Check if insert tenant_id is set
  if (!insertTenantId) {
    if (mode === "strict") {
      return {
        valid: false,
        blocked: true,
        error: `Cannot create ${resourceType}: tenantId required in strict mode`,
      };
    }
    return {
      valid: true,
      blocked: false,
      warning: `Creating ${resourceType} without tenantId`,
    };
  }

  // Check if insert tenant_id matches effective context
  if (insertTenantId !== effectiveTenantId) {
    return {
      valid: false,
      blocked: true,
      error: `Cannot create ${resourceType} for different tenant`,
    };
  }

  return { valid: true, blocked: false };
}

/**
 * Validates tenant_id for UPDATE operations
 * Ensures the resource belongs to the effective tenant context
 */
export function validateUpdateTenantId(
  existingTenantId: string | null,
  effectiveTenantId: string | null,
  resourceType: string,
  resourceId: string
): WriteValidationResult {
  const mode = getTenancyEnforcementMode();

  if (mode === "off") {
    return { valid: true, blocked: false };
  }

  // Check if effective tenant context exists
  if (!effectiveTenantId) {
    if (mode === "strict") {
      return {
        valid: false,
        blocked: true,
        error: `Cannot update ${resourceType}:${resourceId}: no tenant context`,
      };
    }
    return {
      valid: true,
      blocked: false,
      warning: `Updating ${resourceType}:${resourceId} without tenant context`,
    };
  }

  // Check if resource has a tenant_id
  if (!existingTenantId) {
    if (mode === "strict") {
      return {
        valid: false,
        blocked: true,
        error: `Cannot update ${resourceType}:${resourceId}: resource has no tenantId`,
      };
    }
    return {
      valid: true,
      blocked: false,
      warning: `Updating legacy ${resourceType}:${resourceId} without tenantId`,
    };
  }

  // Check if resource belongs to effective tenant
  if (existingTenantId !== effectiveTenantId) {
    return {
      valid: false,
      blocked: true,
      error: `Cannot update ${resourceType}:${resourceId}: belongs to different tenant`,
    };
  }

  return { valid: true, blocked: false };
}

/**
 * Validates tenant_id for DELETE operations
 * Ensures the resource belongs to the effective tenant context before deletion
 */
export function validateDeleteTenantId(
  existingTenantId: string | null,
  effectiveTenantId: string | null,
  resourceType: string,
  resourceId: string
): WriteValidationResult {
  // DELETE validation is identical to UPDATE validation
  return validateUpdateTenantId(existingTenantId, effectiveTenantId, resourceType, resourceId);
}

/**
 * Handles write validation result by logging and recording warnings
 */
export async function handleWriteValidation(
  result: WriteValidationResult,
  req: Request,
  res: Response,
  resourceType: string,
  resourceId?: string
): Promise<boolean> {
  const user = req.user as any;

  if (result.blocked) {
    logTenancyWarning(
      `${req.method} ${req.path}`,
      result.error || "Write blocked",
      user?.id
    );
    
    if (isSoftMode()) {
      await recordTenancyWarning({
        route: req.path,
        method: req.method,
        warnType: "mismatch",
        actorUserId: user?.id,
        effectiveTenantId: user?.tenantId,
        resourceId,
        notes: result.error,
      });
    }

    res.status(403).json({
      error: {
        code: "TENANT_VIOLATION",
        message: result.error || "Tenant isolation violation",
      },
    });
    return true;
  }

  if (result.warning) {
    logTenancyWarning(
      `${req.method} ${req.path}`,
      result.warning,
      user?.id
    );

    if (isSoftMode()) {
      await recordTenancyWarning({
        route: req.path,
        method: req.method,
        warnType: "missing-tenantId",
        actorUserId: user?.id,
        effectiveTenantId: user?.tenantId,
        resourceId,
        notes: result.warning,
      });
    }

    addTenancyWarningHeader(res, result.warning);
  }

  return false;
}

/**
 * Ensures tenant_id is set for insert data, inheriting from effective context if missing
 * Returns the tenant_id to use, or null if no context available
 */
export function ensureInsertTenantId(
  data: { tenantId?: string | null },
  effectiveTenantId: string | null
): string | null {
  if (data.tenantId) {
    return data.tenantId;
  }
  return effectiveTenantId;
}

/**
 * Middleware generator for enforcing tenant context on routes
 * Use this to wrap routes that require tenant isolation
 */
export function requireTenantContext() {
  return (req: Request, res: Response, next: NextFunction) => {
    const mode = getTenancyEnforcementMode();
    const user = req.user as any;

    if (mode === "off") {
      return next();
    }

    // Super users can bypass tenant context requirement
    if (user?.role === "super_user") {
      return next();
    }

    if (!user?.tenantId) {
      if (mode === "strict") {
        return res.status(403).json({
          error: {
            code: "NO_TENANT_CONTEXT",
            message: "This operation requires tenant context",
          },
        });
      }

      logTenancyWarning(
        `${req.method} ${req.path}`,
        "Operation without tenant context",
        user?.id
      );
      addTenancyWarningHeader(res, "No tenant context");
    }

    next();
  };
}
