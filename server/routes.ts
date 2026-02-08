/**
 * Main API Routes — Thin Aggregator
 * 
 * Purpose: Mounts global middleware and sub-routers for the project management application.
 * 
 * All route handlers have been extracted into domain-specific modules:
 *   - server/routes/workspaces.router.ts   (workspace CRUD, members)
 *   - server/routes/teams.router.ts        (team CRUD, members)
 *   - server/routes/tags.router.ts         (tag CRUD, task-tag associations)
 *   - server/routes/comments.router.ts     (comment CRUD, resolve/unresolve, mentions)
 *   - server/routes/activity.router.ts     (activity log)
 *   - server/routes/attachments.router.ts  (attachment presign/upload/download, CRM flags)
 *   - server/routes/tasks.router.ts        (task CRUD, subtasks, assignees)
 *   - server/routes/projects.router.ts     (project CRUD, sections, members)
 *   - server/routes/clients.router.ts      (client CRUD, contacts, notes, divisions)
 *   - server/routes/users.router.ts        (user CRUD, invitations, profile, settings)
 *   - server/routes/timeTracking.router.ts (timer, time entries, calendar)
 *   - server/routes/crm.router.ts          (CRM pipeline, approvals, messaging, portal)
 *
 * This file handles:
 *   1. Global /api auth middleware (requireAuth)
 *   2. Global /api tenant context middleware (requireTenantContext)
 *   3. Mounting sub-routes and webhooks
 *   4. Starting background notification checkers
 *
 * @see docs/ENDPOINTS.md for complete API documentation
 * @see docs/KNOWN_ISSUES.md for refactoring notes
 */
import type { Express } from "express";
import type { Server } from "http";
import { requireAuth } from "./auth";
import { requireTenantContext } from "./middleware/tenantContext";
import subRoutes from "./routes/index";
import webhookRoutes from "./routes/webhooks";
import {
  startDeadlineChecker,
  startFollowUpChecker,
} from "./features/notifications/notification.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Protect all /api routes except /api/auth/*, /api/v1/auth/*, /api/v1/super/bootstrap, /api/health, and /api/v1/webhooks/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path.startsWith("/v1/auth/") || 
        req.path === "/v1/super/bootstrap" || 
        req.path === "/health" ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireAuth(req, res, next);
  });
  
  // Enforce tenant context for all API routes except /api/auth/*, /api/health, /api/v1/super/*, /api/v1/tenant/*, and /api/v1/webhooks/*
  // SuperUsers can access without tenant context; regular users must have tenantId
  // Tenant onboarding routes (/api/v1/tenant/*) are exempt from strict tenant context enforcement
  // as they need to work during onboarding when tenant context is being set up
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || 
        req.path === "/health" || 
        req.path.startsWith("/v1/super/") ||
        req.path.startsWith("/v1/tenant/") ||
        req.path.startsWith("/v1/webhooks/")) {
      return next();
    }
    return requireTenantContext(req, res, next);
  });

  // Mount sub-routes (all domain routers aggregated in routes/index.ts)
  app.use("/api", subRoutes);
  
  // Mount webhook routes (bypasses auth, uses signature verification)
  app.use("/api/v1/webhooks", webhookRoutes);

  // Start the deadline notification checker (runs periodically)
  startDeadlineChecker();
  startFollowUpChecker();

  return httpServer;
}
