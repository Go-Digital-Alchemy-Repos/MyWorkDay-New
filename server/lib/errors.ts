/**
 * @module server/lib/errors
 * @description Centralized error handling utilities for the API.
 * Provides consistent error responses and validation helpers.
 */

import { Response } from "express";
import { z, ZodError } from "zod";

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL_ERROR"
  | "TENANCY_VIOLATION";

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
  res: Response
): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(422).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: formatZodErrors(result.error),
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
  res: Response
): T | null {
  const result = schema.safeParse(query);
  if (!result.success) {
    res.status(422).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: formatZodErrors(result.error),
    });
    return null;
  }
  return result.data;
}

/**
 * Sends a standardized error response from an AppError.
 */
export function sendError(res: Response, error: AppError): Response {
  return res.status(error.statusCode).json({
    error: error.message,
    code: error.code,
    details: error.details,
  });
}

/**
 * Handles unknown errors in route handlers.
 * Logs the error and sends appropriate response.
 */
export function handleRouteError(res: Response, error: unknown, context?: string): Response {
  if (error instanceof AppError) {
    return sendError(res, error);
  }

  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`[RouteError]${context ? ` ${context}:` : ""}`, error);
  
  return res.status(500).json({
    error: "Internal server error",
    code: "INTERNAL_ERROR",
    details: process.env.NODE_ENV === "development" ? message : undefined,
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
