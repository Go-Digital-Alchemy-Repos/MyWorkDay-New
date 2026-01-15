import { Request, Response, NextFunction } from "express";

interface RateLimitConfig {
  windowMs: number;
  maxRequestsPerIP: number;
  maxRequestsPerEmail: number;
  keyPrefix: string;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const ipStore = new Map<string, RateLimitEntry>();
const emailStore = new Map<string, RateLimitEntry>();

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

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function getClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0].trim();
  }
  if (Array.isArray(forwarded)) {
    return forwarded[0];
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cleanupExpiredEntries(): void {
  const now = Date.now();
  ipStore.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      ipStore.delete(key);
    }
  });
  emailStore.forEach((entry, key) => {
    if (entry.resetAt <= now) {
      emailStore.delete(key);
    }
  });
}

setInterval(cleanupExpiredEntries, 60000);

function checkRateLimit(
  store: Map<string, RateLimitEntry>,
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: maxRequests - 1, resetAt };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
}

function logRateLimitEvent(
  requestId: string,
  endpoint: string,
  ip: string,
  email: string | undefined,
  limitType: "ip" | "email",
  remaining: number,
  blocked: boolean
): void {
  const logData = {
    timestamp: new Date().toISOString(),
    requestId,
    event: blocked ? "rate_limit_blocked" : "rate_limit_check",
    endpoint,
    ip,
    email: email ? `${email.substring(0, 3)}***` : undefined,
    limitType,
    remaining,
    blocked,
  };
  
  if (blocked) {
    console.warn("[RateLimit]", JSON.stringify(logData));
  } else if (process.env.RATE_LIMIT_DEBUG === "true") {
    console.log("[RateLimit]", JSON.stringify(logData));
  }
}

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const {
    windowMs = RATE_LIMIT_LOGIN_WINDOW_MS,
    maxRequestsPerIP = RATE_LIMIT_LOGIN_MAX_IP,
    maxRequestsPerEmail = RATE_LIMIT_LOGIN_MAX_EMAIL,
    keyPrefix = "auth",
  } = config;

  return (req: Request, res: Response, next: NextFunction) => {
    const requestId = generateRequestId();
    const ip = getClientIP(req);
    const email = req.body?.email?.toLowerCase?.();
    const ipKey = `${keyPrefix}:ip:${ip}`;

    const ipCheck = checkRateLimit(ipStore, ipKey, maxRequestsPerIP, windowMs);
    
    if (!ipCheck.allowed) {
      logRateLimitEvent(requestId, req.path, ip, email, "ip", ipCheck.remaining, true);
      
      res.setHeader("Retry-After", Math.ceil((ipCheck.resetAt - Date.now()) / 1000));
      res.setHeader("X-RateLimit-Limit", maxRequestsPerIP.toString());
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader("X-RateLimit-Reset", Math.ceil(ipCheck.resetAt / 1000).toString());
      
      return res.status(429).json({
        ok: false,
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          requestId,
          retryAfter: Math.ceil((ipCheck.resetAt - Date.now()) / 1000),
        },
      });
    }

    logRateLimitEvent(requestId, req.path, ip, email, "ip", ipCheck.remaining, false);

    if (email && maxRequestsPerEmail > 0) {
      const emailKey = `${keyPrefix}:email:${email}`;
      const emailCheck = checkRateLimit(emailStore, emailKey, maxRequestsPerEmail, windowMs);

      if (!emailCheck.allowed) {
        logRateLimitEvent(requestId, req.path, ip, email, "email", emailCheck.remaining, true);
        
        res.setHeader("Retry-After", Math.ceil((emailCheck.resetAt - Date.now()) / 1000));
        res.setHeader("X-RateLimit-Limit", maxRequestsPerEmail.toString());
        res.setHeader("X-RateLimit-Remaining", "0");
        res.setHeader("X-RateLimit-Reset", Math.ceil(emailCheck.resetAt / 1000).toString());
        
        return res.status(429).json({
          ok: false,
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests for this email. Please try again later.",
            requestId,
            retryAfter: Math.ceil((emailCheck.resetAt - Date.now()) / 1000),
          },
        });
      }

      logRateLimitEvent(requestId, req.path, ip, email, "email", emailCheck.remaining, false);
    }

    res.setHeader("X-RateLimit-Limit", maxRequestsPerIP.toString());
    res.setHeader("X-RateLimit-Remaining", ipCheck.remaining.toString());
    res.setHeader("X-RateLimit-Reset", Math.ceil(ipCheck.resetAt / 1000).toString());

    next();
  };
}

export const loginRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_LOGIN_WINDOW_MS,
  maxRequestsPerIP: RATE_LIMIT_LOGIN_MAX_IP,
  maxRequestsPerEmail: RATE_LIMIT_LOGIN_MAX_EMAIL,
  keyPrefix: "login",
});

export const bootstrapRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_BOOTSTRAP_WINDOW_MS,
  maxRequestsPerIP: RATE_LIMIT_BOOTSTRAP_MAX_IP,
  maxRequestsPerEmail: 0,
  keyPrefix: "bootstrap",
});

export const inviteAcceptRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_INVITE_WINDOW_MS,
  maxRequestsPerIP: RATE_LIMIT_INVITE_MAX_IP,
  maxRequestsPerEmail: 0,
  keyPrefix: "invite",
});

export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: RATE_LIMIT_FORGOT_PASSWORD_WINDOW_MS,
  maxRequestsPerIP: RATE_LIMIT_FORGOT_PASSWORD_MAX_IP,
  maxRequestsPerEmail: RATE_LIMIT_FORGOT_PASSWORD_MAX_EMAIL,
  keyPrefix: "forgot",
});

export function resetRateLimitStores(): void {
  ipStore.clear();
  emailStore.clear();
}

export { ipStore, emailStore };
