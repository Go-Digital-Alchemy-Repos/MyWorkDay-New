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
 */

import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors";
import { ZodError } from "zod";

interface StandardErrorResponse {
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

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = req.requestId || "unknown";
  
  if (process.env.NODE_ENV !== "production") {
    console.error(`[Error] requestId=${requestId}`, err);
  } else {
    console.error(`[Error] requestId=${requestId} ${err.message}`);
  }

  let response: StandardErrorResponse;
  let statusCode: number;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    response = {
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
  } else {
    statusCode = 500;
    const message = process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error";
    response = {
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
}
