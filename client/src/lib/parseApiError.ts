/**
 * @module client/src/lib/parseApiError
 * @description Unified API error parsing utility for the frontend.
 * 
 * Handles both the new standard error envelope and legacy error formats
 * for backward compatibility.
 * 
 * STANDARD ERROR ENVELOPE:
 * {
 *   error: {
 *     code: "STRING_CODE",
 *     message: "Human readable message",
 *     status: 400,
 *     requestId: "uuid",
 *     details?: any
 *   }
 * }
 * 
 * LEGACY FORMATS SUPPORTED:
 * - { message: "..." }
 * - { error: "..." }
 * - Plain string responses
 */

export interface ParsedApiError {
  code: string;
  message: string;
  status: number;
  requestId?: string;
  details?: unknown;
}

/**
 * Parses an API error from various sources (fetch response, axios error, unknown).
 * Returns a normalized error object that can be used for display and handling.
 */
export function parseApiError(error: unknown): ParsedApiError {
  // Handle Error objects with embedded response data
  if (error instanceof Error) {
    // Check if it's a fetch error with status prefix like "401: {...}"
    const statusMatch = error.message.match(/^(\d{3}):\s*([\s\S]+)$/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      const body = statusMatch[2];
      
      // Try to parse the body as JSON
      try {
        const parsed = JSON.parse(body);
        return parseErrorBody(parsed, status);
      } catch {
        // Not JSON, use the message as-is
        return {
          code: getCodeFromStatus(status),
          message: body.trim() || error.message,
          status,
        };
      }
    }
    
    // Generic Error object
    return {
      code: "UNKNOWN_ERROR",
      message: error.message || "An unexpected error occurred",
      status: 500,
    };
  }
  
  // Handle plain objects (already parsed response)
  if (typeof error === "object" && error !== null) {
    return parseErrorBody(error as Record<string, unknown>, 500);
  }
  
  // Handle string errors
  if (typeof error === "string") {
    return {
      code: "UNKNOWN_ERROR",
      message: error || "An unexpected error occurred",
      status: 500,
    };
  }
  
  // Fallback for unknown error types
  return {
    code: "UNKNOWN_ERROR",
    message: "An unexpected error occurred",
    status: 500,
  };
}

/**
 * Parses an error body object into a normalized error.
 */
function parseErrorBody(body: Record<string, unknown>, defaultStatus: number): ParsedApiError {
  // New standard envelope format: { error: { code, message, status, requestId, details } }
  if (body.error && typeof body.error === "object") {
    const envelope = body.error as Record<string, unknown>;
    return {
      code: (envelope.code as string) || "UNKNOWN_ERROR",
      message: (envelope.message as string) || "An error occurred",
      status: (envelope.status as number) || defaultStatus,
      requestId: envelope.requestId as string | undefined,
      details: envelope.details,
    };
  }
  
  // Legacy format with top-level code
  if (body.code && body.message) {
    return {
      code: body.code as string,
      message: body.message as string,
      status: defaultStatus,
      details: body.details,
    };
  }
  
  // Legacy format: { message: "..." }
  if (body.message && typeof body.message === "string") {
    return {
      code: (body.code as string) || getCodeFromStatus(defaultStatus),
      message: body.message,
      status: defaultStatus,
    };
  }
  
  // Legacy format: { error: "string message" }
  if (body.error && typeof body.error === "string") {
    return {
      code: (body.code as string) || getCodeFromStatus(defaultStatus),
      message: body.error,
      status: defaultStatus,
    };
  }
  
  // Unknown format
  return {
    code: "UNKNOWN_ERROR",
    message: JSON.stringify(body) || "An error occurred",
    status: defaultStatus,
  };
}

/**
 * Maps HTTP status codes to standard error codes.
 */
function getCodeFromStatus(status: number): string {
  switch (status) {
    case 400:
      return "VALIDATION_ERROR";
    case 401:
      return "UNAUTHORIZED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    case 451:
      return "AGREEMENT_REQUIRED";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "UNKNOWN_ERROR";
  }
}

/**
 * Returns a user-friendly message for common error codes.
 */
export function getErrorMessage(error: ParsedApiError): string {
  switch (error.code) {
    case "UNAUTHORIZED":
      return "Please log in to continue.";
    case "FORBIDDEN":
      return "You don't have permission to perform this action.";
    case "NOT_FOUND":
      return error.message || "The requested resource was not found.";
    case "VALIDATION_ERROR":
      return error.message || "Please check your input and try again.";
    case "AGREEMENT_REQUIRED":
      return "Please accept the terms of service to continue.";
    case "TENANT_REQUIRED":
      return "Please select an organization to continue.";
    case "RATE_LIMITED":
      return "Too many requests. Please wait a moment and try again.";
    case "INTERNAL_ERROR":
      return "Something went wrong. Please try again later.";
    default:
      return error.message || "An unexpected error occurred.";
  }
}

/**
 * Checks if an error requires authentication.
 */
export function isAuthError(error: ParsedApiError): boolean {
  return error.code === "UNAUTHORIZED" || error.status === 401;
}

/**
 * Checks if an error requires agreement acceptance.
 */
export function isAgreementError(error: ParsedApiError): boolean {
  return error.code === "AGREEMENT_REQUIRED" || error.status === 451;
}

/**
 * Checks if an error requires tenant selection.
 */
export function isTenantError(error: ParsedApiError): boolean {
  return error.code === "TENANT_REQUIRED";
}

/**
 * Formats an error for display in a toast notification.
 * For 500+ errors, includes the requestId so users can report issues.
 * Stack traces are never shown to tenant users.
 */
export function formatErrorForToast(error: unknown): {
  title: string;
  description: string;
} {
  const parsed = parseApiError(error);
  const message = getErrorMessage(parsed);
  
  // For server errors (500+), include requestId for correlation
  if (parsed.status >= 500 && parsed.requestId) {
    return {
      title: "Something went wrong",
      description: `${message} (Ref: ${parsed.requestId.slice(0, 8)})`,
    };
  }
  
  return {
    title: getToastTitleForCode(parsed.code),
    description: message,
  };
}

/**
 * Gets an appropriate toast title for an error code.
 */
function getToastTitleForCode(code: string): string {
  switch (code) {
    case "VALIDATION_ERROR":
      return "Validation Error";
    case "UNAUTHORIZED":
      return "Authentication Required";
    case "FORBIDDEN":
      return "Access Denied";
    case "NOT_FOUND":
      return "Not Found";
    case "RATE_LIMITED":
      return "Too Many Requests";
    case "CONFLICT":
      return "Conflict";
    case "INTERNAL_ERROR":
      return "Server Error";
    default:
      return "Error";
  }
}

/**
 * Extracts requestId from an ApiError if present.
 * Useful for logging or displaying in error details.
 */
export function getRequestIdFromError(error: unknown): string | null {
  // Check if it's an ApiError with requestId property
  if (error && typeof error === "object" && "requestId" in error) {
    return (error as { requestId: string | null }).requestId;
  }
  
  // Try parsing to extract from message
  const parsed = parseApiError(error);
  return parsed.requestId || null;
}
