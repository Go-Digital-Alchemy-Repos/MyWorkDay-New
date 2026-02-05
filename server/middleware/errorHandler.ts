/**
 * @module server/middleware/errorHandler
 * @description Global Express error handler that produces the standard error envelope.
 * 
 * INVARIANTS:
 * - All errors include requestId for correlation
 * - Standard envelope structure is always used
 * - Legacy fields (message, code) included for backward compatibility
 * - Never leaks stack traces or secrets in production
 * - Never throws from the error handler
 * - Normalizes database and validation errors into consistent format
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

interface StandardErrorResponse {
  ok: false;
  requestId: string;
  error: {
    code: string;
    message: string;
    status: number;
    requestId: string;
    details?: unknown;
  };
  // Legacy compatibility fields
  message?: string;
  code?: string;
  details?: unknown;
}

/**
 * PostgreSQL error codes that indicate constraint violations
 */
const PG_CONSTRAINT_ERROR_CODES: Record<string, { code: string; message: string }> = {
  "23505": { code: "DUPLICATE_KEY", message: "A record with this value already exists" },
  "23503": { code: "FOREIGN_KEY_VIOLATION", message: "Referenced record does not exist" },
  "23502": { code: "NOT_NULL_VIOLATION", message: "Required field is missing" },
  "23514": { code: "CHECK_CONSTRAINT_VIOLATION", message: "Value does not meet requirements" },
  "22P02": { code: "INVALID_INPUT", message: "Invalid input format" },
  "42P01": { code: "TABLE_NOT_FOUND", message: "Database table not found" },
  "42703": { code: "COLUMN_NOT_FOUND", message: "Database column not found" },
};

/**
 * Check if error is a PostgreSQL database error
 */
function isPostgresError(err: any): boolean {
  return err && (typeof err.code === "string" && /^[0-9A-Z]{5}$/.test(err.code));
}

/**
 * Normalize a PostgreSQL error into a user-friendly response
 */
function normalizePostgresError(err: any, isProduction: boolean): { code: string; message: string; status: number } {
  const pgCode = err.code as string;
  const known = PG_CONSTRAINT_ERROR_CODES[pgCode];
  
  if (known) {
    return {
      code: known.code,
      message: known.message,
      status: pgCode.startsWith("23") ? 400 : 500,
    };
  }
  
  // For unknown DB errors, hide details in production
  return {
    code: "DATABASE_ERROR",
    message: isProduction ? "A database error occurred" : (err.message || "Database error"),
    status: 500,
  };
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

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  try {
    const requestId = req.requestId || "unknown";
    const isProduction = process.env.NODE_ENV === "production";
    
    // Determine status code for logging (before full error processing)
    const logStatus = (err as AppError).statusCode || 500;
    
    // Enhanced error log with full context
    const errorLogEntry = {
      requestId,
      method: req.method,
      route: req.route?.path || req.path,
      path: req.path,
      status: logStatus,
      tenantId: getTenantId(req),
      userId: getUserId(req),
      errorCode: (err as AppError).code || err.name || "UNKNOWN",
      message: err.message,
    };
    
    // Always include stack in server logs (not in response)
    console.error("[error]", JSON.stringify({
      ...errorLogEntry,
      stack: err.stack,
    }));

    let response: StandardErrorResponse;
    let statusCode: number;

    if (err instanceof AppError) {
      statusCode = err.statusCode;
      response = {
        ok: false,
        requestId,
        error: {
          code: err.code,
          message: err.message,
          status: statusCode,
          requestId,
          details: err.details,
        },
        // Legacy compatibility
        message: err.message,
        code: err.code,
        details: err.details,
      };
    } else if (err instanceof ZodError) {
      statusCode = 400;
      const details = err.errors.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      }));
      response = {
        ok: false,
        requestId,
        error: {
          code: "VALIDATION_ERROR",
          message: "Validation failed",
          status: statusCode,
          requestId,
          details,
        },
        // Legacy compatibility
        message: "Validation failed",
        code: "VALIDATION_ERROR",
        details,
      };
    } else if (isPostgresError(err)) {
      // Normalize PostgreSQL errors
      const normalized = normalizePostgresError(err, isProduction);
      statusCode = normalized.status;
      response = {
        ok: false,
        requestId,
        error: {
          code: normalized.code,
          message: normalized.message,
          status: statusCode,
          requestId,
        },
        // Legacy compatibility
        message: normalized.message,
        code: normalized.code,
      };
    } else {
      statusCode = 500;
      const message = isProduction
        ? "Internal server error"
        : err.message || "Internal server error";
      response = {
        ok: false,
        requestId,
        error: {
          code: "INTERNAL_ERROR",
          message,
          status: statusCode,
          requestId,
        },
        // Legacy compatibility
        message,
        code: "INTERNAL_ERROR",
      };
    }

    res.status(statusCode).json(response);
  } catch (handlerError) {
    // Error handler must never throw - absolute last resort fallback
    console.error("[errorHandler] CRITICAL: Error handler itself threw:", handlerError);
    const requestId = req?.requestId || "unknown";
    try {
      res.status(500).json({
        ok: false,
        requestId,
        error: {
          code: "INTERNAL_ERROR",
          message: "Internal server error",
          status: 500,
          requestId,
        },
        message: "Internal server error",
        code: "INTERNAL_ERROR",
      });
    } catch {
      // If even sending the response fails, just end it
      res.end();
    }
  }
}
