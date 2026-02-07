/**
 * Rate Limiting Middleware using express-rate-limit
 * 
 * Purpose: Protect auth endpoints and file uploads from brute force/abuse
 * 
 * Key Invariants:
 * - Rate limiting is enabled by default in production
 * - Rate limiting is disabled by default in development for convenience
 * - All limits are configurable via environment variables
 * 
 * Sharp Edges:
 * - Uses in-memory store; limits reset on server restart
 * - Set RATE_LIMIT_DEV_ENABLED=true to test rate limiting in development
 */

import rateLimit from "express-rate-limit";
import { Request, Response, NextFunction } from "express";

const RATE_LIMIT_LOGIN_WINDOW_MS = parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || "60000", 10);
const RATE_LIMIT_LOGIN_MAX_IP = parseInt(process.env.RATE_LIMIT_LOGIN_MAX_IP || "10", 10);
const RATE_LIMIT_LOGIN_MAX_EMAIL = parseInt(process.env.RATE_LIMIT_LOGIN_MAX_EMAIL || "5", 10);

const RATE_LIMIT_BOOTSTRAP_WINDOW_MS = parseInt(process.env.RATE_LIMIT_BOOTSTRAP_WINDOW_MS || "60000", 10);
const RATE_LIMIT_BOOTSTRAP_MAX_IP = parseInt(process.env.RATE_LIMIT_BOOTSTRAP_MAX_IP || "5", 10);

const RATE_LIMIT_INVITE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_INVITE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_INVITE_MAX_IP = parseInt(process.env.RATE_LIMIT_INVITE_MAX_IP || "10", 10);

const RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS || "60000", 10);
const RATE_LIMIT_FORGOT_PASSWORD_MAX_IP = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX_IP || "5", 10);
const RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL = parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL || "3", 10);

const RATE_LIMIT_UPLOAD_WINDOW_MS = parseInt(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS || "60000", 10);
const RATE_LIMIT_UPLOAD_MAX_IP = parseInt(process.env.RATE_LIMIT_UPLOAD_MAX_IP || "30", 10);

const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";
const DEV_ENABLED = process.env.RATE_LIMIT_DEV_ENABLED === "true";

function shouldSkipRateLimit(): boolean {
  if (!RATE_LIMIT_ENABLED) return true;
  if (IS_DEVELOPMENT && !DEV_ENABLED) return true;
  return false;
}

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const emailStore = new Map<string, RateLimitEntry>();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  emailStore.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      emailStore.delete(key);
    }
  });
}

setInterval(cleanupExpiredEntries, 60000);

function checkEmailRateLimit(
  email: string,
  maxRequests: number,
  windowMs: number,
  keyPrefix: string
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const key = `${keyPrefix}:${email}`;
  const entry = emailStore.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    emailStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

function createEmailRateLimiter(
  maxRequestsPerEmail: number,
  windowMs: number,
  keyPrefix: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (shouldSkipRateLimit()) return next();
    if (maxRequestsPerEmail <= 0) return next();
    
    const email = req.body?.email?.toLowerCase?.();
    if (!email) return next();

    const emailCheck = checkEmailRateLimit(email, maxRequestsPerEmail, windowMs, keyPrefix);
    
    if (!emailCheck.allowed) {
      const requestId = generateRequestId();
      const retryAfter = Math.ceil((emailCheck.resetAt - Date.now()) / 1000);
      
      if (process.env.RATE_LIMIT_DEBUG === "true") {
        console.warn(`[RateLimit] Email rate limit hit: ${email.substring(0, 3)}*** on ${keyPrefix}`);
      }
      
      res.setHeader("Retry-After", retryAfter.toString());
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests for this email. Please try again later.",
          requestId,
          retryAfter,
        },
      });
    }

    next();
  };
}

function createCombinedRateLimiter(
  windowMs: number,
  maxRequestsPerIP: number,
  maxRequestsPerEmail: number,
  keyPrefix: string
) {
  const ipLimiter = rateLimit({
    windowMs,
    max: maxRequestsPerIP,
    standardHeaders: true,
    legacyHeaders: false,
    skip: shouldSkipRateLimit,
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => {
      const requestId = generateRequestId();
      res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          requestId,
        },
      });
    },
  });

  const emailLimiter = createEmailRateLimiter(maxRequestsPerEmail, windowMs, keyPrefix);

  return (req: Request, res: Response, next: NextFunction) => {
    ipLimiter(req, res, (err?: any) => {
      if (err || res.headersSent) return;
      emailLimiter(req, res, next);
    });
  };
}

export const loginRateLimiter = createCombinedRateLimiter(
  RATE_LIMIT_LOGIN_WINDOW_MS,
  RATE_LIMIT_LOGIN_MAX_IP,
  RATE_LIMIT_LOGIN_MAX_EMAIL,
  "login"
);

export const bootstrapRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_BOOTSTRAP_WINDOW_MS,
  max: RATE_LIMIT_BOOTSTRAP_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many registration attempts. Please try again later.",
        requestId,
      },
    });
  },
});

export const inviteAcceptRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_INVITE_WINDOW_MS,
  max: RATE_LIMIT_INVITE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many invite acceptance attempts. Please try again later.",
        requestId,
      },
    });
  },
});

export const forgotPasswordRateLimiter = createCombinedRateLimiter(
  RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS,
  RATE_LIMIT_FORGOT_PASSWORD_MAX_IP,
  RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL,
  "forgot"
);

export const uploadRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_UPLOAD_WINDOW_MS,
  max: RATE_LIMIT_UPLOAD_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many upload requests. Please try again later.",
        requestId,
      },
    });
  },
});

const RATE_LIMIT_INVITE_CREATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_INVITE_CREATE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_INVITE_CREATE_MAX_IP = parseInt(process.env.RATE_LIMIT_INVITE_CREATE_MAX_IP || "20", 10);

export const inviteCreateRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_INVITE_CREATE_WINDOW_MS,
  max: RATE_LIMIT_INVITE_CREATE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many invite requests. Please try again later.",
        requestId,
      },
    });
  },
});

const RATE_LIMIT_USER_CREATE_WINDOW_MS = parseInt(process.env.RATE_LIMIT_USER_CREATE_WINDOW_MS || "60000", 10);
const RATE_LIMIT_USER_CREATE_MAX_IP = parseInt(process.env.RATE_LIMIT_USER_CREATE_MAX_IP || "10", 10);

export const userCreateRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_USER_CREATE_WINDOW_MS,
  max: RATE_LIMIT_USER_CREATE_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many user creation requests. Please try again later.",
        requestId,
      },
    });
  },
});

const RATE_LIMIT_CHAT_SEND_WINDOW_MS = parseInt(process.env.RATE_LIMIT_CHAT_SEND_WINDOW_MS || "10000", 10);
const RATE_LIMIT_CHAT_SEND_MAX_IP = parseInt(process.env.RATE_LIMIT_CHAT_SEND_MAX_IP || "30", 10);

export const chatSendRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CHAT_SEND_WINDOW_MS,
  max: RATE_LIMIT_CHAT_SEND_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many messages. Please slow down.",
        requestId,
      },
    });
  },
});

const RATE_LIMIT_CLIENT_MSG_WINDOW_MS = parseInt(process.env.RATE_LIMIT_CLIENT_MSG_WINDOW_MS || "10000", 10);
const RATE_LIMIT_CLIENT_MSG_MAX_IP = parseInt(process.env.RATE_LIMIT_CLIENT_MSG_MAX_IP || "20", 10);

export const clientMessageRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_CLIENT_MSG_WINDOW_MS,
  max: RATE_LIMIT_CLIENT_MSG_MAX_IP,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkipRateLimit,
  handler: (_req, res) => {
    const requestId = generateRequestId();
    res.status(429).json({
      ok: false,
      error: {
        code: "RATE_LIMITED",
        message: "Too many messages. Please slow down.",
        requestId,
      },
    });
  },
});

export function resetRateLimitStores(): void {
  emailStore.clear();
}

export { emailStore };
