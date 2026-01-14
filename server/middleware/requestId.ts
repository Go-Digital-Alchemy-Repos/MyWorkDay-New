/**
 * @module server/middleware/requestId
 * @description Attaches a unique request ID to each request for error correlation and logging.
 * 
 * INVARIANTS:
 * - Every request gets a requestId (either from X-Request-Id header or generated)
 * - Response always includes X-Request-Id header
 * - requestId is available via req.requestId for use in error responses
 */

import { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const inboundId = req.headers["x-request-id"];
  const requestId = typeof inboundId === "string" && inboundId.length > 0 
    ? inboundId 
    : randomUUID();
  
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  
  next();
}
