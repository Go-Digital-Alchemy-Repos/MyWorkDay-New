/**
 * @module server/middleware/requestLogger
 * @description HTTP request logging middleware for observability.
 * 
 * Logs every request with:
 * - requestId: Unique identifier for request correlation
 * - method: HTTP method (GET, POST, etc.)
 * - path: Request path
 * - status: HTTP response status code
 * - durationMs: Request duration in milliseconds
 * - tenantId: Tenant ID if present (from tenant context)
 * - userId: User ID if authenticated
 * 
 * INVARIANTS:
 * - All requests are logged on completion (response finish event)
 * - Health check endpoints are excluded to reduce noise
 * - Sensitive paths are not logged with query params
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Paths to exclude from logging (health checks, static assets)
 */
const EXCLUDED_PATHS = [
  "/health",
  "/healthz",
  "/ready",
  "/api/health",
  "/favicon.ico",
];

/**
 * Check if a path should be excluded from logging
 */
function shouldExclude(path: string): boolean {
  return EXCLUDED_PATHS.some(excluded => path === excluded || path.startsWith("/assets/"));
}

/**
 * Get tenant ID from request context
 */
function getTenantId(req: Request): string | undefined {
  return req.tenant?.effectiveTenantId 
    || req.tenant?.tenantId 
    || req.user?.tenantId 
    || undefined;
}

/**
 * Get user ID from request context
 */
function getUserId(req: Request): string | undefined {
  return req.user?.id || undefined;
}

/**
 * Request logging middleware
 * 
 * Must be registered early in the middleware chain (after requestId and auth).
 * Logs on response finish to capture accurate status and duration.
 */
export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip excluded paths
  if (shouldExclude(req.path)) {
    return next();
  }

  const startTime = process.hrtime.bigint();

  // Log when response finishes
  res.on("finish", () => {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000;

    const logEntry = {
      requestId: req.requestId || "unknown",
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      tenantId: getTenantId(req),
      userId: getUserId(req),
    };

    // Use appropriate log level based on status
    if (res.statusCode >= 500) {
      console.error("[request]", JSON.stringify(logEntry));
    } else if (res.statusCode >= 400) {
      console.warn("[request]", JSON.stringify(logEntry));
    } else {
      console.log("[request]", JSON.stringify(logEntry));
    }
  });

  next();
}
