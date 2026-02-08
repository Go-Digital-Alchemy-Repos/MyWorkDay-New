/**
 * @module server/lib/errors
 * @description Centralized error handling utilities for the API.
 * Provides consistent error responses and validation helpers.
 * 
 * STANDARD ERROR ENVELOPE:
 * All API errors return a consistent structure:
 * {
 *   error: {
 *     code: "STRING_CODE",      // stable, machine-readable
 *     message: "Human message", // safe to display to users
 *     status: 400,              // HTTP status code
 *     requestId: "uuid",        // correlation ID for logs
 *     details?: any             // optional additional info
 *   }
 * }
 * 
 * STABLE ERROR CODES:
 * - VALIDATION_ERROR: Request data failed validation (400)
 * - UNAUTHORIZED: Authentication required or invalid (401)
 * - FORBIDDEN: Authenticated but not permitted (403)
 * - NOT_FOUND: Resource does not exist (404)
 * - CONFLICT: Resource state conflict (409)
 * - TENANT_REQUIRED: Tenant context missing (400/403)
 * - AGREEMENT_REQUIRED: Agreement acceptance needed (451)
 * - TENANCY_VIOLATION: Cross-tenant access attempt (403)
 * - RATE_LIMITED: Too many requests (429)
 * - INTERNAL_ERROR: Server error (500)
 * 
 * COMPATIBILITY:
 * For backward compatibility, some endpoints may also include legacy
 * fields like { error: "message" } or { message: "..." } alongside
 * the standard envelope.
 */

import { Request, Response } from "express";
import { z, ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "TENANCY_VIOLATION"
  | "TENANT_REQUIRED"
  | "AGREEMENT_REQUIRED"
  | "RATE_LIMITED";

/**
 * Custom application error with HTTP status code and error code.
 * Use static factory methods for common error types.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, "VALIDATION_ERROR", message, details);
  }

  static unauthorized(message = "Authentication required"): AppError {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Access denied"): AppError {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(resource = "Resource"): AppError {
    return new AppError(404, "NOT_FOUND", `${resource} not found`);
  }

  static conflict(message: string): AppError {
    return new AppError(409, "CONFLICT", message);
  }

  static internal(message = "Internal server error"): AppError {
    return new AppError(500, "INTERNAL_ERROR", message);
  }

  static tenancyViolation(message: string): AppError {
    return new AppError(403, "TENANCY_VIOLATION", message);
  }

  static tenantRequired(message = "Tenant context required"): AppError {
    return new AppError(400, "TENANT_REQUIRED", message);
  }

  static agreementRequired(message = "Agreement acceptance required", redirectTo?: string): AppError {
    return new AppError(451, "AGREEMENT_REQUIRED", message, { redirectTo });
  }

  static rateLimited(message = "Too many requests"): AppError {
    return new AppError(429, "RATE_LIMITED", message);
  }
}

/**
 * Formats Zod validation errors into a more readable structure.
 */
export function formatZodErrors(error: ZodError): Record<string, string[]> {
  const formatted: Record<string, string[]> = {};
  
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_root";
    if (!formatted[path]) {
      formatted[path] = [];
    }
    formatted[path].push(issue.message);
  }
  
  return formatted;
}

/**
 * Validates request body against a Zod schema.
 * Returns parsed data on success, or sends validation error response.
 * 
 * @example
 * const data = validateBody(req.body, insertTaskSchema, res);
 * if (!data) return; // Response already sent
 */
export function validateBody<T>(
  body: unknown,
  schema: z.ZodSchema<T>,
  res: Response,
  req?: Request
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    const requestId = req?.requestId || "unknown";
    res.status(400).json({
      ok: false,
      requestId,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        status: 400,
        requestId,
        details,
      },
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details,
    });
    return null;
  }
  return result.data;
}

/**
 * Validates request query parameters against a Zod schema.
 */
export function validateQuery<T>(
  query: unknown,
  schema: z.ZodSchema<T>,
  res: Response,
  req?: Request
): T | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    const details = result.error.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
    const requestId = req?.requestId || "unknown";
    res.status(400).json({
      ok: false,
      requestId,
      error: {
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        status: 400,
        requestId,
        details,
      },
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      details,
    });
    return null;
  }
  return result.data;
}

/**
 * Standard error envelope structure.
 */
export interface StandardErrorEnvelope {
  error: {
    code: ErrorCode | string;
    message: string;
    status: number;
    requestId: string;
    details?: unknown;
  };
  // Legacy compatibility fields (kept for backward compatibility)
  message?: string;
  code?: string;
}

/**
 * Converts an error to the standard envelope format.
 */
export function toErrorResponse(
  err: Error,
  req: Request,
  statusCode: number,
  code: ErrorCode | string,
  details?: unknown
): StandardErrorEnvelope {
  const requestId = req.requestId || "unknown";
  return {
    error: {
      code,
      message: err.message,
      status: statusCode,
      requestId,
      details,
    },
    // Legacy compatibility
    message: err.message,
    code,
  };
}

/**
 * Sends a standardized error response from an AppError.
 */
export function sendError(res: Response, error: AppError, req?: Request): Response {
  const requestId = req?.requestId || "unknown";
  return res.status(error.statusCode).json({
    error: {
      code: error.code,
      message: error.message,
      status: error.statusCode,
      requestId,
      details: error.details,
    },
    // Legacy compatibility fields
    message: error.message,
    code: error.code,
    details: error.details,
  });
}

/**
 * Handles unknown errors in route handlers.
 * Logs the error and sends appropriate response.
 */
export function handleRouteError(res: Response, error: unknown, context?: string, req?: Request): Response {
  if (error instanceof AppError) {
    return sendError(res, error, req);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  const requestId = req?.requestId || "unknown";
  console.error(`[RouteError]${context ? ` ${context}:` : ""} requestId=${requestId}`, error);
  
  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      status: 500,
      requestId,
      details: process.env.NODE_ENV === "development" ? message : undefined,
    },
    // Legacy compatibility
    message: "Internal server error",
    code: "INTERNAL_ERROR",
  });
}

/**
 * Checks if a value is a valid UUID v4.
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validates that an ID parameter is valid, throws AppError if not.
 */
export function requireValidId(id: string, paramName = "id"): void {
  if (!id || (id.length > 10 && !isValidUUID(id))) {
    throw AppError.badRequest(`Invalid ${paramName}: must be a valid identifier`);
  }
}

/**
 * Asserts that a tenant ID is present and valid.
 * Use this in create/update operations to ensure tenant context is set.
 * 
 * @param tenantId - The tenant ID to validate
 * @param context - Optional context for error message (e.g., "creating task")
 * @throws AppError with TENANT_REQUIRED code if tenantId is null/undefined
 * 
 * @example
 * const tenantId = assertTenantId(req.effectiveTenantId, "creating task");
 * await storage.createTask({ ...data, tenantId });
 */
export function assertTenantId(
  tenantId: string | null | undefined,
  context?: string
): string {
  if (!tenantId) {
    const message = context
      ? `Tenant context required for ${context}`
      : "Tenant context required";
    throw AppError.tenantRequired(message);
  }
  return tenantId;
}

/**
 * Asserts that a user ID is present and valid.
 * Use this in operations that require an authenticated user.
 * 
 * @param userId - The user ID to validate
 * @param context - Optional context for error message
 * @throws AppError with UNAUTHORIZED code if userId is null/undefined
 */
export function assertUserId(
  userId: string | null | undefined,
  context?: string
): string {
  if (!userId) {
    const message = context
      ? `Authentication required for ${context}`
      : "Authentication required";
    throw AppError.unauthorized(message);
  }
  return userId;
}

/**
 * Assert that tenantId is present in the data object.
 * Use this in storage layer create methods to prevent NULL tenantId inserts.
 * 
 * @param data - The insert data object to validate
 * @param tableName - The table name for error context
 * @throws AppError with TENANT_REQUIRED code if tenantId is missing
 */
export function assertInsertHasTenantId<T extends { tenantId?: string | null }>(
  data: T,
  tableName: string
): asserts data is T & { tenantId: string } {
  if (!data.tenantId) {
    throw AppError.tenantRequired(`tenantId is required when creating ${tableName}`);
  }
}
