/**
 * Agreement Enforcement Middleware
 * 
 * Blocks authenticated users from accessing most routes if they haven't
 * accepted the active tenant agreement. Exempt routes allow users to:
 * - Check their agreement status
 * - Accept the agreement
 * - Log in/out
 * - Complete onboarding
 */

import { Request, Response, NextFunction } from "express";
import { db } from "../db";
import { tenantAgreements, tenantAgreementAcceptances, AgreementStatus, UserRole } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const EXEMPT_ROUTE_PATTERNS = [
  /^\/api\/auth\//,
  /^\/api\/v1\/me\/agreement\//,
  /^\/api\/v1\/tenant\/onboarding/,
  /^\/api\/v1\/invitations\//,
  /^\/api\/v1\/super\//,
  /^\/$/,
  /^\/assets\//,
  /^\/src\//,
  /^\/@/,
  /^\/node_modules\//,
  /\.js$/,
  /\.css$/,
  /\.ico$/,
  /\.png$/,
  /\.jpg$/,
  /\.svg$/,
  /\.woff/,
  /\.ttf$/,
  /\.html$/,
  /\.map$/,
];

const EXEMPT_EXACT_ROUTES = [
  "/api/user",
  "/api/v1/me/avatar",
  "/api/auth/me",
  "/api/auth/logout",
];

function isExemptRoute(path: string): boolean {
  if (EXEMPT_EXACT_ROUTES.includes(path)) {
    return true;
  }
  return EXEMPT_ROUTE_PATTERNS.some(pattern => pattern.test(path));
}

interface AgreementCache {
  tenantId: string;
  agreement: {
    id: string;
    version: number;
  } | null;
  fetchedAt: number;
}

const agreementCache = new Map<string, AgreementCache>();
const CACHE_TTL_MS = 60 * 1000;

async function getActiveAgreement(tenantId: string): Promise<{ id: string; version: number } | null> {
  const now = Date.now();
  const cached = agreementCache.get(tenantId);
  
  if (cached && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.agreement;
  }

  const activeAgreements = await db.select({
    id: tenantAgreements.id,
    version: tenantAgreements.version,
  })
    .from(tenantAgreements)
    .where(and(
      eq(tenantAgreements.tenantId, tenantId),
      eq(tenantAgreements.status, AgreementStatus.ACTIVE)
    ))
    .limit(1);

  const agreement = activeAgreements.length > 0 ? activeAgreements[0] : null;

  agreementCache.set(tenantId, {
    tenantId,
    agreement,
    fetchedAt: now,
  });

  return agreement;
}

export function invalidateAgreementCache(tenantId: string): void {
  agreementCache.delete(tenantId);
}

export async function agreementEnforcementGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (isExemptRoute(req.path)) {
    return next();
  }

  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    return next();
  }

  const user = req.user as any;
  
  if (user.role === UserRole.SUPER_USER) {
    return next();
  }

  const tenantId = user.tenantId;
  if (!tenantId) {
    return next();
  }

  try {
    const activeAgreement = await getActiveAgreement(tenantId);

    if (!activeAgreement) {
      return next();
    }

    const acceptances = await db.select({ id: tenantAgreementAcceptances.id })
      .from(tenantAgreementAcceptances)
      .where(and(
        eq(tenantAgreementAcceptances.tenantId, tenantId),
        eq(tenantAgreementAcceptances.userId, user.id),
        eq(tenantAgreementAcceptances.agreementId, activeAgreement.id),
        eq(tenantAgreementAcceptances.version, activeAgreement.version)
      ))
      .limit(1);

    if (acceptances.length > 0) {
      return next();
    }

    res.status(451).json({
      error: "Agreement acceptance required",
      code: "AGREEMENT_REQUIRED",
      message: "You must accept the terms of service before continuing.",
      redirectTo: "/accept-terms",
    });
  } catch (error) {
    console.error("Agreement enforcement error:", error);
    next();
  }
}
