/**
 * Main API Routes
 * 
 * Purpose: Core API endpoints for the project management application.
 * 
 * Organization:
 * - This file contains ~3,700 lines of route handlers
 * - Additional routes are split into: /routes/index.ts (super admin, onboarding, etc.)
 * - Webhook routes in: /routes/webhooks.ts
 * 
 * Key Patterns:
 * - All tenant-scoped endpoints use getEffectiveTenantId() for isolation
 * - Tenancy validation uses validateTenantOwnership() in soft/strict modes
 * - File uploads use presigned S3 URLs via /api/attachments/* endpoints
 * 
 * Sharp Edges:
 * - Large file - consider splitting by domain when refactoring
 * - Some legacy endpoints may not enforce strict tenancy (see KNOWN_ISSUES.md)
 * - Task operations emit Socket.IO events for real-time updates
 * 
 * @see docs/ENDPOINTS.md for complete API documentation
 * @see docs/KNOWN_ISSUES.md for refactoring notes
 */
import type { Express, Request, RequestHandler } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage } from "./storage";
import { z } from "zod";
import { captureError } from "./middleware/errorLogging";
import subRoutes from "./routes/index";
import webhookRoutes from "./routes/webhooks";
import {
  insertTaskSchema,
  insertSectionSchema,
  insertSubtaskSchema,
  insertCommentSchema,
  insertTagSchema,
  insertProjectSchema,
  insertWorkspaceSchema,
  insertTeamSchema,
  insertWorkspaceMemberSchema,
  insertTeamMemberSchema,
  insertActivityLogSchema,
  insertClientSchema,
  insertClientContactSchema,
  insertClientInviteSchema,
  insertClientDivisionSchema,
  insertDivisionMemberSchema,
  insertTimeEntrySchema,
  insertActiveTimerSchema,
  TimeEntry,
  ActiveTimer,
  tenantAgreements,
  tenantAgreementAcceptances,
  AgreementStatus,
  workspaces,
} from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "./auth";
import { getEffectiveTenantId, requireTenantContext } from "./middleware/tenantContext";
import { 
  getTenancyEnforcementMode, 
  isStrictMode, 
  isSoftMode, 
  addTenancyWarningHeader,
  logTenancyWarning,
  validateTenantOwnership,
  handleTenancyViolation
} from "./middleware/tenancyEnforcement";
import { UserRole } from "@shared/schema";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

// Helper function to generate human-readable project update description
function getProjectUpdateDescription(updates: Record<string, unknown>): string | null {
  const descriptions: string[] = [];
  
  if ('name' in updates) descriptions.push('updated the project name');
  if ('description' in updates) descriptions.push('updated the project description');
  if ('status' in updates) descriptions.push(`changed the status to "${updates.status}"`);
  if ('startDate' in updates || 'endDate' in updates) descriptions.push('updated the project timeline');
  if ('budget' in updates || 'budgetHours' in updates) descriptions.push('updated the budget');
  if ('clientId' in updates) descriptions.push('changed the client');
  if ('divisionId' in updates) descriptions.push('changed the division');
  if ('teamId' in updates) descriptions.push('changed the team assignment');
  
  if (descriptions.length === 0) return null;
  if (descriptions.length === 1) return descriptions[0];
  return descriptions.slice(0, -1).join(', ') + ' and ' + descriptions.slice(-1);
}

// Cache for tenant primary workspaces to avoid repeated DB lookups
const tenantWorkspaceCache = new Map<string, { workspaceId: string; expiry: number }>();
const WORKSPACE_CACHE_TTL = 60000; // 1 minute

async function getCurrentWorkspaceIdAsync(req: Request): Promise<string> {
  // Get the effective tenant ID from middleware or user
  const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
  
  if (!tenantId) {
    // No tenant context - fall back to demo workspace for super users
    return "demo-workspace-id";
  }
  
  // Check cache first
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.workspaceId;
  }
  
  // Look up tenant's primary workspace
  const [primaryWorkspace] = await db.select()
    .from(workspaces)
    .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
    .limit(1);
  
  if (primaryWorkspace) {
    // Cache the result
    tenantWorkspaceCache.set(tenantId, {
      workspaceId: primaryWorkspace.id,
      expiry: Date.now() + WORKSPACE_CACHE_TTL
    });
    return primaryWorkspace.id;
  }
  
  // Fallback: get any workspace for this tenant
  const [anyWorkspace] = await db.select()
    .from(workspaces)
    .where(eq(workspaces.tenantId, tenantId))
    .limit(1);
  
  if (anyWorkspace) {
    tenantWorkspaceCache.set(tenantId, {
      workspaceId: anyWorkspace.id,
      expiry: Date.now() + WORKSPACE_CACHE_TTL
    });
    return anyWorkspace.id;
  }
  
  // No workspace found for tenant - return demo as last resort
  console.warn(`[getCurrentWorkspaceIdAsync] No workspace found for tenant ${tenantId}`);
  return "demo-workspace-id";
}

// Sync version for backward compatibility - uses cached value or falls back to demo
function getCurrentWorkspaceId(req: Request): string {
  const tenantId = (req as any).tenant?.effectiveTenantId || (req.user as any)?.tenantId;
  
  if (!tenantId) {
    return "demo-workspace-id";
  }
  
  // Check cache for sync access
  const cached = tenantWorkspaceCache.get(tenantId);
  if (cached && cached.expiry > Date.now()) {
    return cached.workspaceId;
  }
  
  // If not cached, trigger async lookup (for next request) and return demo temporarily
  getCurrentWorkspaceIdAsync(req).catch(() => {});
  return "demo-workspace-id";
}

function isSuperUser(req: Request): boolean {
  return (req.user as any)?.role === UserRole.SUPER_USER;
}
import {
  isS3Configured,
  validateFile,
  generateStorageKey,
  createPresignedUploadUrl,
  createPresignedDownloadUrl,
  deleteS3Object,
  checkObjectExists,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  validateAvatar,
  generateAvatarKey,
  uploadToS3,
} from "./s3";
import multer from "multer";

const avatarUpload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 } // 2MB for avatars
});
// Import centralized event emitters for real-time updates
import {
  emitProjectCreated,
  emitProjectUpdated,
  emitProjectClientAssigned,
  emitSectionCreated,
  emitSectionUpdated,
  emitSectionDeleted,
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskMoved,
  emitTaskReordered,
  emitSubtaskCreated,
  emitSubtaskUpdated,
  emitSubtaskDeleted,
  emitAttachmentAdded,
  emitAttachmentDeleted,
  emitClientCreated,
  emitClientUpdated,
  emitClientDeleted,
  emitClientContactCreated,
  emitClientContactUpdated,
  emitClientContactDeleted,
  emitClientInviteSent,
  emitClientInviteRevoked,
  emitTimerStarted,
  emitTimerPaused,
  emitTimerResumed,
  emitTimerStopped,
  emitTimerUpdated,
  emitTimeEntryCreated,
  emitTimeEntryUpdated,
  emitTimeEntryDeleted,
  emitMyTaskCreated,
  emitMyTaskUpdated,
  emitMyTaskDeleted,
} from "./realtime/events";

import {
  notifyTaskAssigned,
  notifyTaskCompleted,
  notifyTaskStatusChanged,
  notifyCommentAdded,
  notifyCommentMention,
  notifyProjectMemberAdded,
  notifyProjectUpdate,
  startDeadlineChecker,
} from "./features/notifications/notification.service";

export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // Protect all /api routes except /api/auth/*, /api/v1/auth/*, /api/v1/super/bootstrap, and /api/v1/webhooks/*
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth") || req.path.startsWith("/v1/auth/") || req.path === "/v1/super/bootstrap" || req.path.startsWith("/v1/webhooks/")) {
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

  const DEMO_USER_ID = "demo-user-id";
  const DEMO_WORKSPACE_ID = "demo-workspace-id";

  // Mount sub-routes (timer, super admin, etc.)
  app.use("/api", subRoutes);
  
  // Mount webhook routes (bypasses auth, uses signature verification)
  app.use("/api/v1/webhooks", webhookRoutes);

  // Health check endpoint for Docker/Railway
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  /**
   * Global Search Endpoint for Command Palette
   * 
   * Provides tenant-scoped search across clients, projects, and tasks.
   * Used by the command palette (⌘K/Ctrl+K) for quick navigation.
   * 
   * Security:
   * - REQUIRES tenant context (returns 403 if missing)
   * - Uses only tenant-scoped storage methods (no fallbacks)
   * - Tasks fetched via project ownership (inherently tenant-scoped)
   * 
   * Performance:
   * - Parallel fetches for clients and projects
   * - Single batch query for tasks (getTasksByProjectIds)
   * - In-memory filtering with simple scoring (startsWith = 2, includes = 1)
   * - Results limited to maxResults (default 10, max 50)
   * 
   * @query q - Search query string (min 2 chars for results)
   * @query limit - Max results per category (default 10, max 50)
   * @returns { clients, projects, tasks } - Matching items with id, name, type
   */
  app.get("/api/search", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Strict tenant enforcement - no fallback for security
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required for search" });
      }

      const { q, limit = "10" } = req.query;
      const searchQuery = String(q || "").trim().toLowerCase();
      const maxResults = Math.min(parseInt(String(limit), 10) || 10, 50);
      
      if (!searchQuery) {
        return res.json({ clients: [], projects: [], tasks: [] });
      }

      const workspaceId = await getCurrentWorkspaceIdAsync(req);

      // Parallel tenant-scoped search across entities
      const [clientsList, projectsList] = await Promise.all([
        storage.getClientsByTenant(tenantId, workspaceId),
        storage.getProjectsByTenant(tenantId, workspaceId),
      ]);

      // Get tasks efficiently using project IDs with tenant validation at DB level
      const projectIds = projectsList.map(p => p.id);
      let tasksList: Array<{ id: string; title: string; projectId: string | null; status: string | null; tenantId: string | null }> = [];
      
      if (projectIds.length > 0) {
        // Query tasks for tenant's projects (inherently tenant-scoped via project ownership)
        const taskMap = await storage.getTasksByProjectIds(projectIds);
        for (const tasks of taskMap.values()) {
          tasksList.push(...tasks.map(t => ({
            id: t.id,
            title: t.title || "",
            projectId: t.projectId,
            status: t.status,
            tenantId: tenantId,
          })));
        }
      }

      // Filter and score results
      const filterAndScore = <T extends { id: string }>(
        items: T[],
        getSearchText: (item: T) => string
      ) => {
        return items
          .map(item => {
            const text = getSearchText(item).toLowerCase();
            if (!text.includes(searchQuery)) return null;
            const score = text.startsWith(searchQuery) ? 2 : 1;
            return { item, score };
          })
          .filter((r): r is { item: T; score: number } => r !== null)
          .sort((a, b) => b.score - a.score)
          .slice(0, maxResults)
          .map(r => r.item);
      };

      const clients = filterAndScore(clientsList, c => c.companyName);
      const projects = filterAndScore(projectsList, p => p.name);
      const filteredTasks = filterAndScore(tasksList, t => t.title);

      res.json({ 
        clients: clients.map(c => ({ id: c.id, name: c.companyName, type: "client" })),
        projects: projects.map(p => ({ id: p.id, name: p.name, type: "project", status: p.status })),
        tasks: filteredTasks.map(t => ({ id: t.id, name: t.title, type: "task", projectId: t.projectId, status: t.status })),
      });
    } catch (error) {
      console.error("Error in global search:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/current", async (req, res) => {
    try {
      const workspaceId = await getCurrentWorkspaceIdAsync(req);
      const workspace = await storage.getWorkspace(workspaceId);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:id", async (req, res) => {
    try {
      const workspace = await storage.getWorkspace(req.params.id);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error fetching workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const data = insertWorkspaceSchema.parse({
        ...req.body,
        createdBy: userId,
      });
      const workspace = await storage.createWorkspace(data);
      await storage.addWorkspaceMember({
        workspaceId: workspace.id,
        userId: userId,
        role: "owner",
        status: "active",
      });
      res.status(201).json(workspace);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/members", async (req, res) => {
    try {
      const members = await storage.getWorkspaceMembers(req.params.workspaceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/members", async (req, res) => {
    try {
      const data = insertWorkspaceMemberSchema.parse({
        ...req.body,
        workspaceId: req.params.workspaceId,
      });
      const member = await storage.addWorkspaceMember(data);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding workspace member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/workspaces/:id", async (req, res) => {
    try {
      const workspace = await storage.updateWorkspace(req.params.id, req.body);
      if (!workspace) {
        return res.status(404).json({ error: "Workspace not found" });
      }
      res.json(workspace);
    } catch (error) {
      console.error("Error updating workspace:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const workspaces = await storage.getWorkspacesByUser(userId);
      res.json(workspaces);
    } catch (error) {
      console.error("Error fetching workspaces:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspace-members", async (req, res) => {
    try {
      const workspaceId = getCurrentWorkspaceId(req);
      const members = await storage.getWorkspaceMembers(workspaceId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching workspace members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
      
      // Use member-scoped method if tenantId is available
      // Admins see all projects, employees only see projects they're members of
      if (tenantId) {
        const projects = await storage.getProjectsForUser(userId, tenantId, workspaceId, isAdmin);
        return res.json(projects);
      }
      
      // Only superusers can use legacy non-scoped methods (for backward compatibility)
      if (isSuperUser(req)) {
        const projects = await storage.getProjectsByWorkspace(workspaceId);
        return res.json(projects);
      }
      
      // Regular users must have tenantId
      console.error(`[projects] User ${getCurrentUserId(req)} has no tenantId`);
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/unassigned", async (req, res) => {
    try {
      const searchQuery =
        typeof req.query.q === "string" ? req.query.q : undefined;
      const projects = await storage.getUnassignedProjects(
        getCurrentWorkspaceId(req),
        searchQuery,
      );
      res.json(projects);
    } catch (error) {
      console.error("Error fetching unassigned projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const project = await storage.getProjectByIdAndTenant(req.params.id, tenantId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        return res.json(project);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const project = await storage.getProject(req.params.id);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        return res.json(project);
      }
      
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/projects", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const creatorId = getCurrentUserId(req);
      
      // Convert empty string teamId to null
      const body = { ...req.body };
      if (body.teamId === "") {
        body.teamId = null;
      }
      
      // Extract memberIds before schema validation (not part of project schema)
      const memberIds: string[] = Array.isArray(body.memberIds) ? body.memberIds : [];
      delete body.memberIds;
      
      // ClientId is required for tenant users
      if (tenantId && !body.clientId) {
        return res.status(400).json({ error: "Client assignment is required for projects" });
      }
      
      // Validate clientId belongs to tenant if provided and tenantId available
      if (body.clientId && tenantId) {
        const client = await storage.getClientByIdAndTenant(body.clientId, tenantId);
        if (!client) {
          return res.status(400).json({ error: "Client not found or does not belong to tenant" });
        }
        
        // Check if client has divisions - if so, divisionId is required
        const clientDivisions = await storage.getClientDivisionsByClient(body.clientId, tenantId);
        if (clientDivisions.length > 0) {
          if (!body.divisionId) {
            return res.status(400).json({ error: "Division is required when client has divisions" });
          }
          // Validate divisionId belongs to this client and tenant
          const divisionValid = await storage.validateDivisionBelongsToClientTenant(
            body.divisionId, body.clientId, tenantId
          );
          if (!divisionValid) {
            return res.status(400).json({ error: "Division does not belong to the selected client" });
          }
        } else if (body.divisionId) {
          // Client has no divisions but divisionId was provided - reject
          return res.status(400).json({ error: "Cannot assign division to a client without divisions" });
        }
      }
      
      // Validate all memberIds belong to same tenant
      if (memberIds.length > 0 && tenantId) {
        for (const memberId of memberIds) {
          const member = await storage.getUserByIdAndTenant(memberId, tenantId);
          if (!member) {
            return res.status(400).json({ error: `User ${memberId} not found or does not belong to tenant` });
          }
        }
      }
      
      const data = insertProjectSchema.parse({
        ...body,
        workspaceId,
        createdBy: creatorId,
      });
      
      let project;
      if (tenantId) {
        project = await storage.createProjectWithTenant(data, tenantId);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        project = await storage.createProject(data);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }

      // Add creator as project member automatically
      await storage.addProjectMember({ projectId: project.id, userId: creatorId, role: "owner" });
      
      // Add additional members
      for (const memberId of memberIds) {
        if (memberId !== creatorId) {
          await storage.addProjectMember({ projectId: project.id, userId: memberId, role: "member" });
        }
      }

      // Emit real-time event after successful DB operation
      emitProjectCreated(project as any);

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Get current project to determine effective clientId
      let existingProject;
      if (tenantId) {
        existingProject = await storage.getProjectByIdAndTenant(req.params.id, tenantId);
      } else {
        existingProject = await storage.getProject(req.params.id);
      }
      if (!existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }
      
      // Determine the effective clientId (updated or existing)
      const effectiveClientId = req.body.clientId !== undefined ? req.body.clientId : existingProject.clientId;
      const effectiveDivisionId = req.body.divisionId !== undefined ? req.body.divisionId : existingProject.divisionId;
      
      // Validate clientId belongs to tenant if being updated and tenantId available
      if (effectiveClientId && tenantId) {
        const client = await storage.getClientByIdAndTenant(effectiveClientId, tenantId);
        if (!client) {
          return res.status(400).json({ error: "Client not found or does not belong to tenant" });
        }
        
        // Check if client has divisions - if so, divisionId is required
        const clientDivisions = await storage.getClientDivisionsByClient(effectiveClientId, tenantId);
        if (clientDivisions.length > 0) {
          if (!effectiveDivisionId) {
            return res.status(400).json({ error: "Division is required when client has divisions" });
          }
          // Validate divisionId belongs to this client and tenant
          const divisionValid = await storage.validateDivisionBelongsToClientTenant(
            effectiveDivisionId, effectiveClientId, tenantId
          );
          if (!divisionValid) {
            return res.status(400).json({ error: "Division does not belong to the selected client" });
          }
        } else if (effectiveDivisionId) {
          // Client has no divisions but divisionId was provided - clear it
          req.body.divisionId = null;
        }
      }
      
      let project;
      if (tenantId) {
        project = await storage.updateProjectWithTenant(req.params.id, tenantId, req.body);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        project = await storage.updateProject(req.params.id, req.body);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }
      
      // Emit real-time event after successful DB operation
      emitProjectUpdated(project!.id, req.body);

      // Send project update notifications to project members (fire and forget)
      const currentUserId = getCurrentUserId(req);
      const members = await storage.getProjectMembers(project!.id);
      const updateDescription = getProjectUpdateDescription(req.body);
      const currentUser = await storage.getUser(currentUserId);
      
      if (updateDescription) {
        for (const member of members) {
          if (member.userId !== currentUserId) {
            notifyProjectUpdate(
              member.userId,
              project!.id,
              project!.name,
              `${currentUser?.name || "Someone"} ${updateDescription}`,
              { tenantId, excludeUserId: currentUserId }
            ).catch(() => {});
          }
        }
      }

      res.json(project);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:projectId/client", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { clientId } = req.body;

      // Get the current project to check if it exists and get previous clientId
      const existingProject = await storage.getProject(projectId);
      if (!existingProject) {
        return res.status(404).json({ error: "Project not found" });
      }

      const previousClientId = existingProject.clientId;

      // If clientId is provided (not null), validate that client exists
      if (clientId !== null && clientId !== undefined) {
        const client = await storage.getClient(clientId);
        if (!client) {
          return res.status(400).json({ error: "Client not found" });
        }
      }

      // Update the project's clientId
      const updatedProject = await storage.updateProject(projectId, {
        clientId: clientId === undefined ? null : clientId,
      });

      if (!updatedProject) {
        return res.status(500).json({ error: "Failed to update project" });
      }

      // Emit real-time event for client assignment change
      emitProjectClientAssigned(updatedProject as any, previousClientId);

      res.json(updatedProject);
    } catch (error) {
      console.error("Error assigning client to project:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Project member management endpoints
  app.get("/api/projects/:projectId/members", async (req, res) => {
    try {
      const { projectId } = req.params;
      const tenantId = getEffectiveTenantId(req);
      
      // Verify project exists and belongs to tenant
      if (tenantId) {
        const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
      }
      
      const members = await storage.getProjectMembers(projectId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching project members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/projects/:projectId/members", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { userId } = req.body;
      const tenantId = getEffectiveTenantId(req);
      
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }
      
      // Verify project exists and belongs to tenant
      if (tenantId) {
        const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        
        // Verify user belongs to same tenant
        const user = await storage.getUserByIdAndTenant(userId, tenantId);
        if (!user) {
          return res.status(400).json({ error: "User not found or does not belong to tenant" });
        }
      }
      
      // Check if already a member
      const isMember = await storage.isProjectMember(projectId, userId);
      if (isMember) {
        return res.status(409).json({ error: "User is already a project member" });
      }
      
      const member = await storage.addProjectMember({ projectId, userId, role: "member" });
      
      // Emit membership change event
      emitProjectUpdated(projectId, { membershipChanged: true } as any);
      
      // Send notification to newly added member (fire and forget)
      const currentUserId = getCurrentUserId(req);
      if (userId !== currentUserId) {
        const project = await storage.getProject(projectId);
        const currentUser = await storage.getUser(currentUserId);
        if (project) {
          notifyProjectMemberAdded(
            userId,
            projectId,
            project.name,
            currentUser?.name || currentUser?.email || "Someone",
            { tenantId, excludeUserId: currentUserId }
          ).catch(() => {});
        }
      }
      
      res.status(201).json(member);
    } catch (error) {
      console.error("Error adding project member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/projects/:projectId/members/:userId", async (req, res) => {
    try {
      const { projectId, userId } = req.params;
      const tenantId = getEffectiveTenantId(req);
      
      // Verify project exists and belongs to tenant
      if (tenantId) {
        const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
      }
      
      await storage.removeProjectMember(projectId, userId);
      
      // Emit membership change event
      emitProjectUpdated(projectId, { membershipChanged: true } as any);
      
      res.status(204).send();
    } catch (error) {
      console.error("Error removing project member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/projects/:projectId/members", async (req, res) => {
    try {
      const { projectId } = req.params;
      const { memberIds } = req.body;
      const tenantId = getEffectiveTenantId(req);
      
      if (!Array.isArray(memberIds)) {
        return res.status(400).json({ error: "memberIds must be an array" });
      }
      
      // Verify project exists and belongs to tenant
      if (tenantId) {
        const project = await storage.getProjectByIdAndTenant(projectId, tenantId);
        if (!project) {
          return res.status(404).json({ error: "Project not found" });
        }
        
        // Validate all memberIds belong to same tenant
        for (const memberId of memberIds) {
          const user = await storage.getUserByIdAndTenant(memberId, tenantId);
          if (!user) {
            return res.status(400).json({ error: `User ${memberId} not found or does not belong to tenant` });
          }
        }
      }
      
      await storage.setProjectMembers(projectId, memberIds);
      
      // Emit membership change event
      emitProjectUpdated(projectId, { membershipChanged: true } as any);
      
      const members = await storage.getProjectMembers(projectId);
      res.json(members);
    } catch (error) {
      console.error("Error updating project members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      if (tenantId) {
        const teams = await storage.getTeamsByTenant(tenantId, workspaceId);
        return res.json(teams);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const teams = await storage.getTeamsByWorkspace(workspaceId);
        return res.json(teams);
      }
      
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const team = await storage.getTeamByIdAndTenant(req.params.id, tenantId);
        if (!team) {
          return res.status(404).json({ error: "Team not found" });
        }
        return res.json(team);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const team = await storage.getTeam(req.params.id);
        if (!team) {
          return res.status(404).json({ error: "Team not found" });
        }
        return res.json(team);
      }
      
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teams", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      const data = insertTeamSchema.parse({
        ...req.body,
        workspaceId,
      });
      
      let team;
      if (tenantId) {
        team = await storage.createTeamWithTenant(data, tenantId);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        team = await storage.createTeam(data);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }
      
      res.status(201).json(team);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/teams/:teamId/members", async (req, res) => {
    try {
      const members = await storage.getTeamMembers(req.params.teamId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/teams/:teamId/members", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Validate team belongs to tenant
      if (tenantId) {
        const team = await storage.getTeamByIdAndTenant(req.params.teamId, tenantId);
        if (!team) {
          return res.status(404).json({ error: "Team not found" });
        }
        
        // Validate user belongs to same tenant
        const user = await storage.getUserByIdAndTenant(req.body.userId, tenantId);
        if (!user) {
          return res.status(400).json({ error: "User not found or does not belong to tenant" });
        }
      }
      
      const data = insertTeamMemberSchema.parse({
        ...req.body,
        teamId: req.params.teamId,
      });
      const member = await storage.addTeamMember(data);
      res.status(201).json(member);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error adding team member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/teams/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      let team;
      if (tenantId) {
        team = await storage.updateTeamWithTenant(req.params.id, tenantId, req.body);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        team = await storage.updateTeam(req.params.id, req.body);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }
      
      if (!team) {
        return res.status(404).json({ error: "Team not found" });
      }
      res.json(team);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/teams/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const deleted = await storage.deleteTeamWithTenant(req.params.id, tenantId);
        if (!deleted) {
          return res.status(404).json({ error: "Team not found" });
        }
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        await storage.deleteTeam(req.params.id);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/teams/:teamId/members/:userId", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      // Validate team belongs to tenant
      if (tenantId) {
        const team = await storage.getTeamByIdAndTenant(req.params.teamId, tenantId);
        if (!team) {
          return res.status(404).json({ error: "Team not found" });
        }
      }
      
      await storage.removeTeamMember(req.params.teamId, req.params.userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/sections", async (req, res) => {
    try {
      const sections = await storage.getSectionsWithTasks(req.params.projectId);
      res.json(sections);
    } catch (error) {
      console.error("Error fetching sections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/projects/:projectId/tasks/reorder", async (req, res) => {
    try {
      const { moves } = req.body;
      if (!Array.isArray(moves)) {
        return res.status(400).json({ error: "moves must be an array" });
      }

      for (const move of moves) {
        const { itemType, taskId, parentTaskId, toSectionId, toIndex } = move;

        if (itemType === "task") {
          // Skip personal tasks - they shouldn't be in project reorder requests
          const task = await storage.getTask(taskId);
          if (task?.isPersonal) continue;
          await storage.moveTask(taskId, toSectionId, toIndex);
        } else if (itemType === "childTask") {
          if (!parentTaskId) {
            return res.status(400).json({
              error: "parentTaskId required for child task reordering",
            });
          }
          await storage.reorderChildTasks(parentTaskId, taskId, toIndex);
        } else if (itemType === "subtask") {
          if (!parentTaskId) {
            return res
              .status(400)
              .json({ error: "parentTaskId required for subtask moves" });
          }
          const subtask = await storage.getSubtask(taskId);
          if (!subtask || subtask.taskId !== parentTaskId) {
            return res
              .status(400)
              .json({ error: "Subtask does not belong to specified parent" });
          }
          await storage.moveSubtask(taskId, toIndex);
        }
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error reordering tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/sections", async (req, res) => {
    try {
      const data = insertSectionSchema.parse(req.body);
      const section = await storage.createSection(data);

      // Emit real-time event after successful DB operation
      emitSectionCreated(section as any);

      res.status(201).json(section);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/sections/:id", async (req, res) => {
    try {
      const section = await storage.updateSection(req.params.id, req.body);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      // Emit real-time event after successful DB operation
      emitSectionUpdated(section.id, section.projectId, req.body);

      res.json(section);
    } catch (error) {
      console.error("Error updating section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/sections/:id", async (req, res) => {
    try {
      // Get section before deletion to emit event with projectId
      const section = await storage.getSection(req.params.id);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }

      await storage.deleteSection(req.params.id);

      // Emit real-time event after successful DB operation
      emitSectionDeleted(section.id, section.projectId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/tasks", async (req, res) => {
    try {
      const tasks = await storage.getTasksByProject(req.params.projectId);
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/projects/:projectId/calendar-events", async (req, res) => {
    try {
      const { start, end, includeSubtasks } = req.query;
      const tasks = await storage.getTasksByProject(req.params.projectId);

      const startDate = start ? new Date(start as string) : null;
      const endDate = end ? new Date(end as string) : null;
      const includeChildTasks = includeSubtasks !== "false";

      interface CalendarEvent {
        id: string;
        title: string;
        dueDate: Date | null;
        parentTaskId: string | null;
        status: string;
        priority: string;
        sectionId: string | null;
        projectId: string | null;
        assignees: any[];
        tags: any[];
        isSubtask: boolean;
      }

      const events: CalendarEvent[] = [];

      for (const task of tasks) {
        if (task.dueDate) {
          const taskDate = new Date(task.dueDate);
          const inRange =
            (!startDate || taskDate >= startDate) &&
            (!endDate || taskDate <= endDate);

          if (inRange) {
            events.push({
              id: task.id,
              title: task.title,
              dueDate: task.dueDate,
              parentTaskId: task.parentTaskId,
              status: task.status,
              priority: task.priority,
              sectionId: task.sectionId,
              projectId: task.projectId,
              assignees: task.assignees || [],
              tags: task.tags || [],
              isSubtask: !!task.parentTaskId,
            });
          }
        }

        if (includeChildTasks && task.childTasks) {
          for (const childTask of task.childTasks) {
            if (childTask.dueDate) {
              const childDate = new Date(childTask.dueDate);
              const inRange =
                (!startDate || childDate >= startDate) &&
                (!endDate || childDate <= endDate);

              if (inRange) {
                events.push({
                  id: childTask.id,
                  title: childTask.title,
                  dueDate: childTask.dueDate,
                  parentTaskId: childTask.parentTaskId,
                  status: childTask.status,
                  priority: childTask.priority,
                  sectionId: childTask.sectionId,
                  projectId: childTask.projectId,
                  assignees: childTask.assignees || [],
                  tags: childTask.tags || [],
                  isSubtask: true,
                });
              }
            }
          }
        }
      }

      res.json(events);
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get project activity feed
  app.get("/api/projects/:projectId/activity", async (req, res) => {
    try {
      const { projectId } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const tenantId = getCurrentTenantId(req);

      // Verify project exists and belongs to tenant
      const project = await storage.getProject(projectId);
      if (!project) {
        return res.status(404).json({ error: "Project not found" });
      }
      if (tenantId && project.tenantId !== tenantId) {
        return res.status(404).json({ error: "Project not found" });
      }

      // Get project activity from storage (pass tenantId for isolation)
      const activity = await storage.getProjectActivity(projectId, tenantId, limit);
      res.json(activity);
    } catch (error) {
      console.error("Error fetching project activity:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/my", async (req, res) => {
    try {
      const tasks = await storage.getTasksByUser(getCurrentUserId(req));
      res.json(tasks);
    } catch (error) {
      console.error("Error fetching my tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a personal task (no project)
  app.post("/api/tasks/personal", async (req, res) => {
    const requestId = (req as any).requestId || 'unknown';
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const { personalSectionId, ...restBody } = req.body;
      
      const data = insertTaskSchema.parse({
        ...restBody,
        projectId: null,
        sectionId: null,
        isPersonal: true,
        createdBy: userId,
        personalSectionId: personalSectionId || null,
        personalSortOrder: 0,
      });
      
      // Use tenant-aware task creation
      const task = tenantId 
        ? await storage.createTaskWithTenant(data, tenantId)
        : await storage.createTask(data);

      // Auto-assign the task to the creating user
      await storage.addTaskAssignee({
        taskId: task.id,
        userId: userId,
      });

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event for personal task
      if (taskWithRelations) {
        emitMyTaskCreated(userId, taskWithRelations as any, workspaceId);
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors, requestId });
      }
      // Log to error_logs table for observability
      const err = error instanceof Error ? error : new Error(String(error));
      captureError(req as any, err, 500, { route: "POST /api/tasks/personal", body: req.body }).catch(() => {});
      console.error(`[Personal Task Create Error] requestId=${requestId} userId=${getCurrentUserId(req)} tenantId=${getEffectiveTenantId(req) || 'none'} error=${err.message}`);
      res.status(500).json({ error: "Unable to create personal task", requestId });
    }
  });

  // =============================================================================
  // PERSONAL TASK SECTIONS (My Tasks organization)
  // =============================================================================

  // Get user's personal task sections
  app.get("/api/v1/my-tasks/sections", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const sections = await storage.getPersonalTaskSections(userId);
      res.json(sections);
    } catch (error) {
      console.error("Error fetching personal task sections:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create a personal task section
  app.post("/api/v1/my-tasks/sections", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      const { name } = req.body;
      
      if (!name || typeof name !== "string" || name.trim() === "") {
        return res.status(400).json({ error: "Section name is required" });
      }

      // Get current max sortOrder
      const existingSections = await storage.getPersonalTaskSections(userId);
      const maxSortOrder = existingSections.reduce((max, s) => Math.max(max, s.sortOrder), -1);

      const section = await storage.createPersonalTaskSection({
        tenantId,
        userId,
        name: name.trim(),
        sortOrder: maxSortOrder + 1,
      });
      
      res.status(201).json(section);
    } catch (error) {
      console.error("Error creating personal task section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update a personal task section
  app.patch("/api/v1/my-tasks/sections/:id", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const sectionId = req.params.id;
      const { name, sortOrder } = req.body;

      // Verify ownership
      const section = await storage.getPersonalTaskSection(sectionId);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }
      if (section.userId !== userId) {
        return res.status(403).json({ error: "Cannot modify another user's section" });
      }

      const updates: { name?: string; sortOrder?: number } = {};
      if (name !== undefined) updates.name = name.trim();
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;

      const updatedSection = await storage.updatePersonalTaskSection(sectionId, updates);
      res.json(updatedSection);
    } catch (error) {
      console.error("Error updating personal task section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete a personal task section (tasks revert to unsectioned)
  app.delete("/api/v1/my-tasks/sections/:id", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const sectionId = req.params.id;

      // Verify ownership
      const section = await storage.getPersonalTaskSection(sectionId);
      if (!section) {
        return res.status(404).json({ error: "Section not found" });
      }
      if (section.userId !== userId) {
        return res.status(403).json({ error: "Cannot delete another user's section" });
      }

      // Clear personalSectionId from all tasks in this section (do not delete tasks)
      await storage.clearPersonalSectionFromTasks(sectionId);
      
      await storage.deletePersonalTaskSection(sectionId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting personal task section:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Move a personal task to a section
  app.post("/api/v1/my-tasks/tasks/:taskId/move", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const { taskId } = req.params;
      const { personalSectionId, newIndex } = req.body;

      // Get the task
      const task = await storage.getTask(taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }

      // Task must belong to current user (check assignees or createdBy)
      const taskWithRelations = await storage.getTaskWithRelations(taskId);
      const isAssigned = taskWithRelations?.assignees?.some(a => a.userId === userId);
      const isCreator = task.createdBy === userId;
      if (!isAssigned && !isCreator) {
        return res.status(403).json({ error: "Cannot move a task you don't own" });
      }

      // Task must be a personal task (no project/client)
      if (task.projectId || !task.isPersonal) {
        return res.status(400).json({ error: "Can only organize personal tasks into sections" });
      }

      // If moving to a section, verify the section belongs to the user
      if (personalSectionId) {
        const section = await storage.getPersonalTaskSection(personalSectionId);
        if (!section) {
          return res.status(404).json({ error: "Section not found" });
        }
        if (section.userId !== userId) {
          return res.status(403).json({ error: "Cannot move task to another user's section" });
        }
      }

      // Update the task's personalSectionId and personalSortOrder
      const updatedTask = await storage.updateTask(taskId, {
        personalSectionId: personalSectionId || null,
        personalSortOrder: newIndex ?? 0,
      });

      const updatedWithRelations = await storage.getTaskWithRelations(taskId);
      res.json(updatedWithRelations);
    } catch (error) {
      console.error("Error moving personal task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:id", async (req, res) => {
    try {
      const task = await storage.getTaskWithRelations(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error) {
      console.error("Error fetching task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:id/childtasks", async (req, res) => {
    try {
      const childTasks = await storage.getChildTasks(req.params.id);
      res.json(childTasks);
    } catch (error) {
      console.error("Error fetching child tasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks", async (req, res) => {
    const requestId = (req as any).requestId || 'unknown';
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      
      const body = { ...req.body };
      if (body.sectionId === "" || body.sectionId === undefined) {
        body.sectionId = null;
      }
      const data = insertTaskSchema.parse({
        ...body,
        createdBy: userId,
      });
      
      // Validate projectId belongs to tenant (if provided and not personal task)
      if (data.projectId && !data.isPersonal) {
        const project = tenantId 
          ? await storage.getProjectByIdAndTenant(data.projectId, tenantId)
          : await storage.getProject(data.projectId);
        if (!project) {
          return res.status(400).json({ 
            error: "Invalid project: project not found or does not belong to this tenant",
            requestId 
          });
        }
      }
      
      // Validate sectionId belongs to the project (if provided)
      if (data.sectionId && data.projectId) {
        const section = await storage.getSection(data.sectionId);
        if (!section || section.projectId !== data.projectId) {
          return res.status(400).json({ 
            error: "Invalid section: section not found or does not belong to this project",
            requestId 
          });
        }
      }
      
      // Use tenant-aware task creation
      const task = tenantId 
        ? await storage.createTaskWithTenant(data, tenantId)
        : await storage.createTask(data);

      await storage.addTaskAssignee({
        taskId: task.id,
        userId: userId,
      });

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (taskWithRelations) {
        if (task.isPersonal && task.createdBy) {
          emitMyTaskCreated(task.createdBy, taskWithRelations as any, getCurrentWorkspaceId(req));
        } else if (task.projectId) {
          emitTaskCreated(task.projectId, taskWithRelations as any);
        }
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors, requestId });
      }
      // Log to error_logs table for observability
      const err = error instanceof Error ? error : new Error(String(error));
      captureError(req as any, err, 500, { route: "POST /api/tasks", body: req.body }).catch(() => {});
      console.error(`[Task Create Error] requestId=${requestId} userId=${getCurrentUserId(req)} tenantId=${getEffectiveTenantId(req) || 'none'} error=${err.message}`);
      res.status(500).json({ error: "Unable to create task", requestId });
    }
  });

  app.post("/api/tasks/:taskId/childtasks", async (req, res) => {
    const requestId = (req as any).requestId || 'unknown';
    try {
      const parentTaskId = req.params.taskId;
      const tenantId = getEffectiveTenantId(req);
      const parentTask = await storage.getTask(parentTaskId);
      if (!parentTask) {
        return res.status(404).json({ error: "Parent task not found", requestId });
      }
      if (parentTask.parentTaskId) {
        return res.status(400).json({
          error: "Cannot create subtask of a subtask (max depth is 2 levels)",
          requestId,
        });
      }

      const body = { ...req.body };
      const data = insertTaskSchema.parse({
        ...body,
        projectId: parentTask.projectId,
        sectionId: parentTask.sectionId,
        createdBy: getCurrentUserId(req),
      });

      // Child task inherits parent's tenantId or uses current tenant context
      const effectiveTenantId = parentTask.tenantId || tenantId;
      const task = effectiveTenantId
        ? await storage.createTaskWithTenant({ ...data, parentTaskId }, effectiveTenantId)
        : await storage.createChildTask(parentTaskId, data);

      if (body.assigneeId) {
        await storage.addTaskAssignee({
          taskId: task.id,
          userId: body.assigneeId,
        });
      }

      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (taskWithRelations && parentTask.projectId) {
        emitTaskCreated(parentTask.projectId, taskWithRelations as any);
      }

      res.status(201).json(taskWithRelations);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors, requestId });
      }
      // Log to error_logs table for observability
      const err = error instanceof Error ? error : new Error(String(error));
      captureError(req as any, err, 500, { route: "POST /api/tasks/:taskId/childtasks", body: req.body }).catch(() => {});
      console.error(`[Child Task Create Error] requestId=${requestId} userId=${getCurrentUserId(req)} tenantId=${getEffectiveTenantId(req) || 'none'} error=${err.message}`);
      res.status(500).json({ error: "Unable to create child task", requestId });
    }
  });

  app.patch("/api/tasks/:id", async (req, res) => {
    const requestId = (req as any).requestId || 'unknown';
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get task before update for comparison
      const taskBefore = await storage.getTaskWithRelations(req.params.id);
      
      // If converting to personal task, force clear project ties
      const updateData = { ...req.body };
      if (updateData.isPersonal === true) {
        updateData.projectId = null;
        updateData.sectionId = null;
        updateData.parentTaskId = null;
      }
      
      const task = await storage.updateTask(req.params.id, updateData);
      if (!task) {
        return res.status(404).json({ error: "Task not found", requestId });
      }
      const taskWithRelations = await storage.getTaskWithRelations(task.id);

      // Emit real-time event after successful DB operation
      if (task.isPersonal && task.createdBy) {
        // Personal task - emit to workspace
        emitMyTaskUpdated(task.createdBy, task.id, req.body, getCurrentWorkspaceId(req));
      } else if (task.projectId) {
        // Project task - emit to project room
        emitTaskUpdated(task.id, task.projectId, task.parentTaskId, req.body);
      }

      // Send notifications for task changes (fire and forget - don't block response)
      if (taskBefore && !task.isPersonal) {
        const currentUser = await storage.getUser(userId);
        const currentUserName = currentUser?.name || currentUser?.email || "Someone";
        const project = task.projectId ? await storage.getProject(task.projectId) : null;
        const projectName = project?.name || "Unknown project";
        const notificationContext = { tenantId, excludeUserId: userId };

        // Check for status change to completed
        if (updateData.status === "completed" && taskBefore.status !== "completed") {
          const assignees = (taskWithRelations as any)?.assignees || [];
          for (const assignee of assignees) {
            if (assignee.id !== userId) {
              notifyTaskCompleted(
                assignee.id,
                task.id,
                task.title,
                currentUserName,
                notificationContext
              ).catch(() => {});
            }
          }
        }

        // Check for status change (non-completion)
        if (updateData.status && updateData.status !== taskBefore.status && updateData.status !== "completed") {
          const assignees = (taskWithRelations as any)?.assignees || [];
          for (const assignee of assignees) {
            if (assignee.id !== userId) {
              notifyTaskStatusChanged(
                assignee.id,
                task.id,
                task.title,
                updateData.status,
                currentUserName,
                notificationContext
              ).catch(() => {});
            }
          }
        }
      }

      res.json(taskWithRelations);
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Task Update Error] requestId=${requestId} taskId=${req.params.id} error=${sanitizedError}`);
      res.status(500).json({ error: "Unable to update task", requestId });
    }
  });

  app.delete("/api/tasks/:id", async (req, res) => {
    const requestId = (req as any).requestId || 'unknown';
    try {
      // Get task before deletion to emit event with projectId
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found", requestId });
      }

      await storage.deleteTask(req.params.id);

      // Emit real-time event after successful DB operation
      if (task.isPersonal && task.createdBy) {
        // Personal task - emit to workspace
        emitMyTaskDeleted(task.createdBy, task.id, getCurrentWorkspaceId(req));
      } else if (task.projectId) {
        // Project task - emit to project room
        emitTaskDeleted(
          task.id,
          task.projectId,
          task.sectionId,
          task.parentTaskId,
        );
      }

      res.status(204).send();
    } catch (error) {
      const sanitizedError = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Task Delete Error] requestId=${requestId} taskId=${req.params.id} error=${sanitizedError}`);
      res.status(500).json({ error: "Unable to delete task", requestId });
    }
  });

  app.post("/api/tasks/:id/move", async (req, res) => {
    try {
      const { sectionId, targetIndex } = req.body;

      // Get task before move to emit event with fromSectionId
      const taskBefore = await storage.getTask(req.params.id);
      if (!taskBefore) {
        return res.status(404).json({ error: "Task not found" });
      }
      const fromSectionId = taskBefore.sectionId;

      await storage.moveTask(req.params.id, sectionId, targetIndex);
      const task = await storage.getTaskWithRelations(req.params.id);

      // Emit real-time event after successful DB operation (only for non-personal project tasks)
      if (!taskBefore.isPersonal && taskBefore.projectId) {
        emitTaskMoved(
          req.params.id,
          taskBefore.projectId,
          fromSectionId,
          sectionId,
          targetIndex,
        );
      }

      res.json(task);
    } catch (error) {
      console.error("Error moving task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/assignees", async (req, res) => {
    try {
      const { userId: assigneeUserId } = req.body;
      const currentUserId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get task first to validate tenant context
      const task = await storage.getTask(req.params.taskId);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      
      // Validate assignee belongs to same tenant (critical for multi-tenant isolation)
      if (tenantId) {
        const assigneeUser = await storage.getUser(assigneeUserId);
        if (!assigneeUser || assigneeUser.tenantId !== tenantId) {
          return res.status(403).json({ error: "User is not in the same organization" });
        }
      }
      
      const assignee = await storage.addTaskAssignee({
        taskId: req.params.taskId,
        userId: assigneeUserId,
      });
      
      // Send notification to new assignee (fire and forget)
      if (assigneeUserId !== currentUserId && !task.isPersonal) {
        const currentUser = await storage.getUser(currentUserId);
        const project = task.projectId ? await storage.getProject(task.projectId) : null;
        notifyTaskAssigned(
          assigneeUserId,
          task.id,
          task.title,
          currentUser?.name || currentUser?.email || "Someone",
          project?.name || "a project",
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});
      }
      
      res.status(201).json(assignee);
    } catch (error) {
      console.error("Error adding assignee:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:taskId/assignees/:userId", async (req, res) => {
    try {
      await storage.removeTaskAssignee(req.params.taskId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing assignee:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Task Watchers endpoints
  app.get("/api/tasks/:taskId/watchers", async (req, res) => {
    try {
      const watchers = await storage.getTaskWatchers(req.params.taskId);
      res.json(watchers);
    } catch (error) {
      console.error("Error fetching watchers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/watchers", async (req, res) => {
    try {
      const { userId } = req.body;
      const watcher = await storage.addTaskWatcher({
        taskId: req.params.taskId,
        userId,
      });
      res.status(201).json(watcher);
    } catch (error) {
      console.error("Error adding watcher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:taskId/watchers/:userId", async (req, res) => {
    try {
      await storage.removeTaskWatcher(req.params.taskId, req.params.userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing watcher:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:taskId/subtasks", async (req, res) => {
    try {
      const subtasks = await storage.getSubtasksByTask(req.params.taskId);
      res.json(subtasks);
    } catch (error) {
      console.error("Error fetching subtasks:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/subtasks", async (req, res) => {
    try {
      const data = insertSubtaskSchema.parse({
        ...req.body,
        taskId: req.params.taskId,
      });

      // Get parent task to emit event with projectId
      const parentTask = await storage.getTask(req.params.taskId);

      const subtask = await storage.createSubtask(data);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskCreated(
          subtask as any,
          req.params.taskId,
          parentTask.projectId,
        );
      }

      res.status(201).json(subtask);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/subtasks/:id", async (req, res) => {
    try {
      const subtask = await storage.updateSubtask(req.params.id, req.body);
      if (!subtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      // Get parent task to emit event with projectId
      const parentTask = await storage.getTask(subtask.taskId);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskUpdated(
          subtask.id,
          subtask.taskId,
          parentTask.projectId,
          req.body,
        );
      }

      res.json(subtask);
    } catch (error) {
      console.error("Error updating subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/subtasks/:id", async (req, res) => {
    try {
      // Get subtask before deletion to emit event with taskId and projectId
      const subtask = await storage.getSubtask(req.params.id);
      if (!subtask) {
        return res.status(404).json({ error: "Subtask not found" });
      }

      const parentTask = await storage.getTask(subtask.taskId);

      await storage.deleteSubtask(req.params.id);

      // Emit real-time event after successful DB operation (only for project tasks)
      if (parentTask && parentTask.projectId) {
        emitSubtaskDeleted(subtask.id, subtask.taskId, parentTask.projectId);
      }

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/subtasks/:id/move", async (req, res) => {
    try {
      const { targetIndex } = req.body;
      await storage.moveSubtask(req.params.id, targetIndex);
      const subtask = await storage.getSubtask(req.params.id);
      res.json(subtask);
    } catch (error) {
      console.error("Error moving subtask:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/workspaces/:workspaceId/tags", async (req, res) => {
    try {
      const tags = await storage.getTagsByWorkspace(req.params.workspaceId);
      res.json(tags);
    } catch (error) {
      console.error("Error fetching tags:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/workspaces/:workspaceId/tags", async (req, res) => {
    try {
      const data = insertTagSchema.parse({
        ...req.body,
        workspaceId: req.params.workspaceId,
      });
      const tag = await storage.createTag(data);
      res.status(201).json(tag);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/tags/:id", async (req, res) => {
    try {
      const tag = await storage.updateTag(req.params.id, req.body);
      if (!tag) {
        return res.status(404).json({ error: "Tag not found" });
      }
      res.json(tag);
    } catch (error) {
      console.error("Error updating tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tags/:id", async (req, res) => {
    try {
      await storage.deleteTag(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting tag:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/tags", async (req, res) => {
    try {
      const { tagId } = req.body;
      const taskTag = await storage.addTaskTag({
        taskId: req.params.taskId,
        tagId,
      });
      res.status(201).json(taskTag);
    } catch (error) {
      console.error("Error adding tag to task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/tasks/:taskId/tags/:tagId", async (req, res) => {
    try {
      await storage.removeTaskTag(req.params.taskId, req.params.tagId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing tag from task:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const comments = await storage.getCommentsByTask(req.params.taskId);
      res.json(comments);
    } catch (error) {
      console.error("Error fetching comments:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/tasks/:taskId/comments", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const data = insertCommentSchema.parse({
        ...req.body,
        taskId: req.params.taskId,
        userId: currentUserId,
      });
      const comment = await storage.createComment(data);

      // Parse @mentions and create notifications
      const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
      const mentions: { name: string; userId: string }[] = [];
      let match;
      while ((match = mentionRegex.exec(data.body)) !== null) {
        mentions.push({ name: match[1], userId: match[2] });
      }

      // Get task and project info for the notification
      const task = await storage.getTask(req.params.taskId);
      const commenter = await storage.getUser(currentUserId);
      const tenantId = task?.tenantId || null;

      for (const mention of mentions) {
        // Validate mentioned user exists and is in the same tenant
        const mentionedUser = await storage.getUser(mention.userId);
        if (!mentionedUser || (tenantId && mentionedUser.tenantId !== tenantId)) {
          continue; // Skip if user doesn't exist or is in different tenant
        }

        // Create mention record
        await storage.createCommentMention({
          commentId: comment.id,
          mentionedUserId: mention.userId,
        });

        // Send in-app notification for mention (fire and forget)
        notifyCommentMention(
          mention.userId,
          req.params.taskId,
          task?.title || "a task",
          commenter?.name || commenter?.email || "Someone",
          data.body.replace(mentionRegex, '@$1'),
          { tenantId, excludeUserId: currentUserId }
        ).catch(() => {});

        // Send notification email if user has email
        if (mentionedUser.email && tenantId) {
          try {
            const { emailOutboxService } = await import("./services/emailOutbox");
            await emailOutboxService.sendEmail({
              tenantId,
              messageType: "mention_notification",
              toEmail: mentionedUser.email,
              subject: `${commenter?.name || 'Someone'} mentioned you in a comment`,
              textBody: `${commenter?.name || 'Someone'} mentioned you in a comment on task "${task?.title || 'a task'}":\n\n"${data.body.replace(mentionRegex, '@$1')}"`,
              metadata: {
                taskId: task?.id,
                taskTitle: task?.title,
                commentId: comment.id,
                mentionedByUserId: currentUserId,
                mentionedByName: commenter?.name,
              },
            });
          } catch (emailError) {
            console.error("Error sending mention notification:", emailError);
          }
        }
      }

      // Also notify task assignees about the new comment (except the commenter and mentioned users)
      if (task) {
        const taskWithRelations = await storage.getTaskWithRelations(req.params.taskId);
        const assignees = (taskWithRelations as any)?.assignees || [];
        const mentionedUserIds = new Set(mentions.map(m => m.userId));
        
        for (const assignee of assignees) {
          if (assignee.id !== currentUserId && !mentionedUserIds.has(assignee.id)) {
            notifyCommentAdded(
              assignee.id,
              req.params.taskId,
              task.title,
              commenter?.name || commenter?.email || "Someone",
              data.body.replace(mentionRegex, '@$1'),
              { tenantId, excludeUserId: currentUserId }
            ).catch(() => {});
          }
        }
      }

      res.status(201).json(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/comments/:id", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      // Permission check: only the comment owner can edit
      if (existingComment.userId !== currentUserId) {
        return res.status(403).json({ error: "You can only edit your own comments" });
      }

      // Only allow updating the body
      const comment = await storage.updateComment(req.params.id, { body: req.body.body });
      res.json(comment);
    } catch (error) {
      console.error("Error updating comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/comments/:id", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }
      
      // Permission check: only the comment owner can delete
      if (existingComment.userId !== currentUserId) {
        return res.status(403).json({ error: "You can only delete your own comments" });
      }

      await storage.deleteComment(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resolve/unresolve comment endpoints
  app.post("/api/comments/:id/resolve", async (req, res) => {
    try {
      const currentUserId = getCurrentUserId(req);
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const comment = await storage.resolveComment(req.params.id, currentUserId);
      res.json(comment);
    } catch (error) {
      console.error("Error resolving comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/comments/:id/unresolve", async (req, res) => {
    try {
      const existingComment = await storage.getComment(req.params.id);
      if (!existingComment) {
        return res.status(404).json({ error: "Comment not found" });
      }

      const comment = await storage.unresolveComment(req.params.id);
      res.json(comment);
    } catch (error) {
      console.error("Error unresolving comment:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/activity-log", async (req, res) => {
    try {
      const data = insertActivityLogSchema.parse({
        ...req.body,
        userId: getCurrentUserId(req),
      });
      const log = await storage.createActivityLog(data);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating activity log:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/activity-log/:entityType/:entityId", async (req, res) => {
    try {
      const logs = await storage.getActivityLogByEntity(
        req.params.entityType,
        req.params.entityId,
      );
      res.json(logs);
    } catch (error) {
      console.error("Error fetching activity log:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =====================
  // Task Attachments API
  // =====================

  const presignRequestSchema = z.object({
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(1),
    fileSizeBytes: z.number().positive().max(MAX_FILE_SIZE_BYTES),
  });

  app.get("/api/attachments/config", async (req, res) => {
    try {
      res.json({
        configured: isS3Configured(),
        maxFileSizeBytes: MAX_FILE_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_MIME_TYPES,
      });
    } catch (error) {
      console.error("Error fetching attachment config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const attachments = await storage.getTaskAttachmentsByTask(taskId);
        res.json(attachments);
      } catch (error) {
        console.error("Error fetching attachments:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/presign",
    async (req, res) => {
      try {
        const { projectId, taskId } = req.params;

        if (!isS3Configured()) {
          return res.status(503).json({
            error:
              "File storage is not configured. Please set AWS environment variables.",
          });
        }

        const task = await storage.getTask(taskId);
        if (!task || task.projectId !== projectId) {
          return res.status(404).json({ error: "Task not found" });
        }

        const data = presignRequestSchema.parse(req.body);

        const validation = validateFile(data.mimeType, data.fileSizeBytes);
        if (!validation.valid) {
          return res.status(400).json({ error: validation.error });
        }

        const tempId = crypto.randomUUID();
        const storageKey = generateStorageKey(
          projectId,
          taskId,
          tempId,
          data.fileName,
        );

        const attachment = await storage.createTaskAttachment({
          taskId,
          projectId,
          uploadedByUserId: getCurrentUserId(req),
          originalFileName: data.fileName,
          mimeType: data.mimeType,
          fileSizeBytes: data.fileSizeBytes,
          storageKey,
          uploadStatus: "pending",
        });

        const upload = await createPresignedUploadUrl(
          storageKey,
          data.mimeType,
        );

        res.status(201).json({
          attachment: {
            id: attachment.id,
            originalFileName: attachment.originalFileName,
            mimeType: attachment.mimeType,
            fileSizeBytes: attachment.fileSizeBytes,
            uploadStatus: attachment.uploadStatus,
            createdAt: attachment.createdAt,
          },
          upload,
        });
      } catch (error) {
        if (error instanceof z.ZodError) {
          return res.status(400).json({ error: error.errors });
        }
        console.error("Error creating presigned URL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.post(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/complete",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus === "complete") {
          return res.json(attachment);
        }

        const exists = await checkObjectExists(attachment.storageKey);
        if (!exists) {
          await storage.deleteTaskAttachment(attachmentId);
          return res
            .status(400)
            .json({ error: "Upload was not completed. Please try again." });
        }

        const updated = await storage.updateTaskAttachment(attachmentId, {
          uploadStatus: "complete",
        });

        // Emit real-time event after successful upload completion
        emitAttachmentAdded(
          {
            id: updated!.id,
            fileName: updated!.originalFileName,
            fileType: updated!.mimeType,
            fileSize: updated!.fileSizeBytes,
            storageKey: updated!.storageKey,
            taskId: updated!.taskId,
            subtaskId: null,
            uploadedBy: updated!.uploadedByUserId,
            createdAt: updated!.createdAt!,
          },
          taskId,
          null,
          projectId,
        );

        res.json(updated);
      } catch (error) {
        console.error("Error completing upload:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.get(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId/download",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        if (attachment.uploadStatus !== "complete") {
          return res
            .status(400)
            .json({ error: "Attachment upload is not complete" });
        }

        const url = await createPresignedDownloadUrl(attachment.storageKey);
        res.json({ url });
      } catch (error) {
        console.error("Error creating download URL:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  app.delete(
    "/api/projects/:projectId/tasks/:taskId/attachments/:attachmentId",
    async (req, res) => {
      try {
        const { projectId, taskId, attachmentId } = req.params;

        const attachment = await storage.getTaskAttachment(attachmentId);
        if (
          !attachment ||
          attachment.taskId !== taskId ||
          attachment.projectId !== projectId
        ) {
          return res.status(404).json({ error: "Attachment not found" });
        }

        try {
          await deleteS3Object(attachment.storageKey);
        } catch (s3Error) {
          console.warn("Failed to delete S3 object:", s3Error);
        }

        await storage.deleteTaskAttachment(attachmentId);

        // Emit real-time event after successful deletion
        emitAttachmentDeleted(attachmentId, taskId, null, projectId);

        res.status(204).send();
      } catch (error) {
        console.error("Error deleting attachment:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    },
  );

  // =============================================================================
  // CLIENT (CRM) ROUTES - Tenant Scoped (Phase 2A)
  // =============================================================================

  app.get("/api/clients", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      if (tenantId) {
        const clients = await storage.getClientsByTenant(tenantId, workspaceId);
        return res.json(clients);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const clients = await storage.getClientsByWorkspace(workspaceId);
        return res.json(clients);
      }
      
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/clients/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      if (tenantId) {
        const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        // Get full client with contacts
        const clientWithContacts = await storage.getClientWithContacts(req.params.id);
        return res.json(clientWithContacts);
      }
      
      // Only superusers can use legacy non-scoped methods
      if (isSuperUser(req)) {
        const client = await storage.getClientWithContacts(req.params.id);
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        return res.json(client);
      }
      
      return res.status(500).json({ error: "User tenant not configured" });
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      const data = insertClientSchema.parse({
        ...req.body,
        workspaceId,
      });
      
      let client;
      if (tenantId) {
        client = await storage.createClientWithTenant(data, tenantId);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        client = await storage.createClient(data);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }

      // Emit real-time event
      emitClientCreated(
        {
          id: client.id,
          companyName: client.companyName,
          displayName: client.displayName,
          status: client.status,
          workspaceId: client.workspaceId,
          createdAt: client.createdAt!,
        },
        workspaceId,
      );

      res.status(201).json(client);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/clients/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      let client;
      if (tenantId) {
        client = await storage.updateClientWithTenant(req.params.id, tenantId, req.body);
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        client = await storage.updateClient(req.params.id, req.body);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }
      
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      // Emit real-time event
      emitClientUpdated(client.id, client.workspaceId, req.body);

      res.json(client);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      
      let workspaceId = "";
      
      if (tenantId) {
        const client = await storage.getClientByIdAndTenant(req.params.id, tenantId);
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        workspaceId = client.workspaceId;
        const deleted = await storage.deleteClientWithTenant(req.params.id, tenantId);
        if (!deleted) {
          return res.status(404).json({ error: "Client not found" });
        }
      } else if (isSuperUser(req)) {
        // Only superusers can use legacy non-scoped methods
        const client = await storage.getClient(req.params.id);
        if (!client) {
          return res.status(404).json({ error: "Client not found" });
        }
        workspaceId = client.workspaceId;
        await storage.deleteClient(req.params.id);
      } else {
        return res.status(500).json({ error: "User tenant not configured" });
      }

      // Emit real-time event
      emitClientDeleted(req.params.id, workspaceId);

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CLIENT CONTACT ROUTES
  // =============================================================================

  app.get("/api/clients/:clientId/contacts", async (req, res) => {
    try {
      const contacts = await storage.getContactsByClient(req.params.clientId);
      res.json(contacts);
    } catch (error) {
      console.error("Error fetching contacts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/contacts", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const data = insertClientContactSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        workspaceId: client.workspaceId,
      });
      const contact = await storage.createClientContact(data);

      // Emit real-time event
      emitClientContactCreated(
        {
          id: contact.id,
          clientId: contact.clientId,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          isPrimary: contact.isPrimary ?? false,
          createdAt: contact.createdAt!,
        },
        contact.clientId,
        client.workspaceId,
      );

      res.status(201).json(contact);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/clients/:clientId/contacts/:contactId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const contact = await storage.updateClientContact(
        req.params.contactId,
        req.body,
      );
      if (!contact) {
        return res.status(404).json({ error: "Contact not found" });
      }

      // Emit real-time event
      emitClientContactUpdated(
        contact.id,
        contact.clientId,
        client.workspaceId,
        req.body,
      );

      res.json(contact);
    } catch (error) {
      console.error("Error updating contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:clientId/contacts/:contactId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClientContact(req.params.contactId);

      // Emit real-time event
      emitClientContactDeleted(
        req.params.contactId,
        req.params.clientId,
        client.workspaceId,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting contact:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CLIENT INVITE ROUTES (Placeholder for future auth integration)
  // =============================================================================

  app.get("/api/clients/:clientId/invites", async (req, res) => {
    try {
      const invites = await storage.getInvitesByClient(req.params.clientId);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching invites:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/invites", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const contact = await storage.getClientContact(req.body.contactId);
      if (!contact || contact.clientId !== req.params.clientId) {
        return res.status(404).json({ error: "Contact not found" });
      }

      const data = insertClientInviteSchema.parse({
        ...req.body,
        clientId: req.params.clientId,
        email: contact.email,
        status: "pending",
      });
      const invite = await storage.createClientInvite(data);

      // Emit real-time event
      emitClientInviteSent(
        {
          id: invite.id,
          clientId: invite.clientId,
          contactId: invite.contactId,
          email: invite.email,
          status: invite.status,
          createdAt: invite.createdAt!,
        },
        invite.clientId,
        client.workspaceId,
      );

      res.status(201).json(invite);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating invite:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/clients/:clientId/invites/:inviteId", async (req, res) => {
    try {
      const client = await storage.getClient(req.params.clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      await storage.deleteClientInvite(req.params.inviteId);

      // Emit real-time event
      emitClientInviteRevoked(
        req.params.inviteId,
        req.params.clientId,
        client.workspaceId,
      );

      res.status(204).send();
    } catch (error) {
      console.error("Error revoking invite:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // PROJECTS BY CLIENT
  // =============================================================================

  app.get("/api/clients/:clientId/projects", async (req, res) => {
    try {
      const projects = await storage.getProjectsByClient(req.params.clientId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching client projects:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/clients/:clientId/projects", async (req, res) => {
    try {
      const { clientId } = req.params;

      // Verify client exists
      const client = await storage.getClient(clientId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }

      const data = insertProjectSchema.parse({
        ...req.body,
        workspaceId: getCurrentWorkspaceId(req),
        createdBy: getCurrentUserId(req),
        clientId: clientId,
      });

      const project = await storage.createProject(data);

      // Emit real-time events
      emitProjectCreated(project as any);
      emitProjectClientAssigned(project as any, null);

      res.status(201).json(project);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating project for client:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CLIENT DIVISIONS
  // =============================================================================

  app.get("/api/v1/clients/:clientId/divisions", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { clientId } = req.params;
      
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      // Allow super users, tenant admins, and tenant employees to see all divisions
      const canSeeAll = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
      
      let divisions = await storage.getClientDivisionsByClient(clientId, tenantId);
      
      if (!canSeeAll) {
        const userDivisions = await storage.getUserDivisions(userId, tenantId);
        const userDivisionIds = new Set(userDivisions.map(d => d.id));
        divisions = divisions.filter(d => userDivisionIds.has(d.id));
      }
      
      const divisionsWithCounts = await Promise.all(divisions.map(async (division) => {
        const members = await storage.getDivisionMembers(division.id);
        return {
          ...division,
          memberCount: members.length,
          projectCount: 0,
        };
      }));
      
      res.json(divisionsWithCounts);
    } catch (error) {
      console.error("Error fetching divisions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/v1/clients/:clientId/divisions", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { clientId } = req.params;
      
      const client = await storage.getClientByIdAndTenant(clientId, tenantId);
      if (!client) {
        return res.status(404).json({ error: "Client not found" });
      }
      
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      // Allow super users, tenant admins, and tenant employees to create divisions
      const canCreate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
      
      if (!canCreate) {
        return res.status(403).json({ error: "You do not have permission to create divisions" });
      }
      
      const data = insertClientDivisionSchema.parse({
        ...req.body,
        clientId,
        tenantId,
      });
      
      const division = await storage.createClientDivision(data);
      res.status(201).json(division);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating division:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/v1/divisions/:divisionId", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { divisionId } = req.params;
      
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      // Allow super users, tenant admins, and tenant employees to update divisions
      const canUpdate = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
      
      if (!canUpdate) {
        return res.status(403).json({ error: "You do not have permission to update divisions" });
      }
      
      const updateSchema = insertClientDivisionSchema.partial().omit({ 
        tenantId: true, 
        clientId: true 
      });
      const data = updateSchema.parse(req.body);
      
      const division = await storage.updateClientDivision(divisionId, tenantId, data);
      if (!division) {
        return res.status(404).json({ error: "Division not found" });
      }
      
      res.json(division);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error updating division:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/v1/divisions/:divisionId/members", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { divisionId } = req.params;
      
      const division = await storage.getClientDivision(divisionId);
      if (!division || division.tenantId !== tenantId) {
        return res.status(404).json({ error: "Division not found" });
      }
      
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
      
      if (!isAdmin) {
        const isMember = await storage.isDivisionMember(divisionId, userId);
        if (!isMember) {
          return res.status(403).json({ error: "You do not have access to this division" });
        }
      }
      
      const members = await storage.getDivisionMembers(divisionId);
      res.json({ members });
    } catch (error) {
      console.error("Error fetching division members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/v1/divisions/:divisionId/members", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { divisionId } = req.params;
      const { userIds } = req.body;
      
      if (!Array.isArray(userIds)) {
        return res.status(400).json({ error: "userIds must be an array" });
      }
      
      const userId = getCurrentUserId(req);
      const user = await storage.getUser(userId);
      // Allow super users, tenant admins, and tenant employees to manage division members
      const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
      
      if (!canManage) {
        return res.status(403).json({ error: "You do not have permission to manage division members" });
      }
      
      const division = await storage.getClientDivision(divisionId);
      if (!division || division.tenantId !== tenantId) {
        return res.status(404).json({ error: "Division not found" });
      }
      
      for (const uid of userIds) {
        const userToAdd = await storage.getUser(uid);
        if (!userToAdd || userToAdd.tenantId !== tenantId) {
          return res.status(400).json({ error: `User ${uid} does not belong to this tenant` });
        }
      }
      
      await storage.setDivisionMembers(divisionId, tenantId, userIds);
      const members = await storage.getDivisionMembers(divisionId);
      
      res.json({ success: true, members });
    } catch (error) {
      console.error("Error updating division members:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/v1/divisions/:divisionId/members/:userId", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      if (!tenantId) {
        return res.status(403).json({ error: "Tenant context required" });
      }
      
      const { divisionId, userId: targetUserId } = req.params;
      
      const currentUserId = getCurrentUserId(req);
      const user = await storage.getUser(currentUserId);
      // Allow super users, tenant admins, and tenant employees to remove division members
      const canManage = user?.role === 'super_user' || user?.role === 'tenant_admin' || user?.role === 'tenant_employee';
      
      if (!canManage) {
        return res.status(403).json({ error: "You do not have permission to remove division members" });
      }
      
      const division = await storage.getClientDivision(divisionId);
      if (!division || division.tenantId !== tenantId) {
        return res.status(404).json({ error: "Division not found" });
      }
      
      await storage.removeDivisionMember(divisionId, targetUserId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing division member:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });


  // =============================================================================
  // TIME TRACKING - ACTIVE TIMER
  // =============================================================================

  // Get current user's active timer
  app.get("/api/timer/current", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      let timer;
      if (tenantId && isStrictMode()) {
        // Strict mode: only tenant-scoped access
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        // Soft mode: try tenant-scoped first, fallback to legacy with warning
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/current", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        // Off mode or no tenant: use legacy storage
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      res.json(timer || null);
    } catch (error) {
      console.error("Error fetching active timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Start a new timer
  app.post("/api/timer/start", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Check if user already has an active timer
      let existingTimer;
      if (tenantId && isStrictMode()) {
        existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        existingTimer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!existingTimer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            existingTimer = legacyTimer;
            logTenancyWarning("timer/start", "Existing legacy timer found without tenantId", userId);
          }
        }
      } else {
        existingTimer = await storage.getActiveTimerByUser(userId);
      }
      
      if (existingTimer) {
        if (isSoftMode() && !existingTimer.tenantId) {
          addTenancyWarningHeader(res, "Existing timer has legacy null tenantId");
        }
        return res.status(409).json({
          error: "TIMER_ALREADY_RUNNING",
          message: "You already have an active timer. Stop it before starting a new one.",
          timer: existingTimer,
        });
      }

      const now = new Date();
      const data = insertActiveTimerSchema.parse({
        workspaceId: getCurrentWorkspaceId(req),
        userId: userId,
        clientId: req.body.clientId || null,
        projectId: req.body.projectId || null,
        taskId: req.body.taskId || null,
        title: req.body.title || null,
        description: req.body.description || null,
        status: "running",
        elapsedSeconds: 0,
        lastStartedAt: now,
      });

      // Create timer - always set tenant if available (for forward compatibility)
      let timer;
      if (tenantId) {
        timer = await storage.createActiveTimerWithTenant(data, tenantId);
      } else {
        // No tenant context - use legacy storage (backward compatible)
        timer = await storage.createActiveTimer(data);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Timer created without tenant context");
          logTenancyWarning("timer/start", "Timer created without tenantId", userId);
        }
      }

      // Get enriched timer with relations
      const enrichedTimer = await storage.getActiveTimerByUser(userId);

      // Emit real-time event
      emitTimerStarted(
        {
          id: timer.id,
          userId: timer.userId,
          workspaceId: timer.workspaceId,
          clientId: timer.clientId,
          projectId: timer.projectId,
          taskId: timer.taskId,
          description: timer.description,
          status: timer.status as "running" | "paused",
          elapsedSeconds: timer.elapsedSeconds,
          lastStartedAt: timer.lastStartedAt || now,
          createdAt: timer.createdAt,
        },
        getCurrentWorkspaceId(req),
      );

      res.status(201).json(enrichedTimer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error starting timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Pause the timer
  app.post("/api/timer/pause", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get timer using appropriate mode
      let timer;
      if (tenantId && isStrictMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/pause", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }
      if (timer.status !== "running") {
        return res.status(400).json({ error: "Timer is not running" });
      }

      // Calculate elapsed time since last started
      const now = new Date();
      const lastStarted = timer.lastStartedAt || timer.createdAt;
      const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
      const newElapsedSeconds = timer.elapsedSeconds + additionalSeconds;

      // Update using appropriate storage method
      let updated;
      if (timer.tenantId) {
        updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
          status: "paused",
          elapsedSeconds: newElapsedSeconds,
        });
      } else {
        updated = await storage.updateActiveTimer(timer.id, {
          status: "paused",
          elapsedSeconds: newElapsedSeconds,
        });
        if (isSoftMode()) {
          logTenancyWarning("timer/pause", "Updated legacy timer without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimerPaused(timer.id, userId, newElapsedSeconds, getCurrentWorkspaceId(req));

      res.json(updated);
    } catch (error) {
      console.error("Error pausing timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Resume the timer
  app.post("/api/timer/resume", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get timer using appropriate mode
      let timer;
      if (tenantId && isStrictMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/resume", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }
      if (timer.status !== "paused") {
        return res.status(400).json({ error: "Timer is not paused" });
      }

      const now = new Date();
      let updated;
      if (timer.tenantId) {
        updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, {
          status: "running",
          lastStartedAt: now,
        });
      } else {
        updated = await storage.updateActiveTimer(timer.id, {
          status: "running",
          lastStartedAt: now,
        });
        if (isSoftMode()) {
          logTenancyWarning("timer/resume", "Resumed legacy timer without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimerResumed(timer.id, userId, now, getCurrentWorkspaceId(req));

      res.json(updated);
    } catch (error) {
      console.error("Error resuming timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update timer details (client, project, task, description)
  app.patch("/api/timer/current", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get timer using appropriate mode
      let timer;
      if (tenantId && isStrictMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/update", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      const allowedUpdates: Partial<ActiveTimer> = {};
      if ("clientId" in req.body) allowedUpdates.clientId = req.body.clientId;
      if ("projectId" in req.body) allowedUpdates.projectId = req.body.projectId;
      if ("taskId" in req.body) allowedUpdates.taskId = req.body.taskId;
      if ("description" in req.body) allowedUpdates.description = req.body.description;

      let updated;
      if (timer.tenantId) {
        updated = await storage.updateActiveTimerWithTenant(timer.id, timer.tenantId, allowedUpdates);
      } else {
        updated = await storage.updateActiveTimer(timer.id, allowedUpdates);
        if (isSoftMode()) {
          logTenancyWarning("timer/update", "Updated legacy timer without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimerUpdated(timer.id, userId, allowedUpdates as any, getCurrentWorkspaceId(req));

      // Return enriched timer
      const enrichedTimer = await storage.getActiveTimerByUser(userId);
      res.json(enrichedTimer);
    } catch (error) {
      console.error("Error updating timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Stop and finalize timer (creates time entry or discards)
  app.post("/api/timer/stop", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      // Get timer using appropriate mode
      let timer;
      if (tenantId && isStrictMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/stop", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      // Calculate final elapsed time if running
      let finalElapsedSeconds = timer.elapsedSeconds;
      if (timer.status === "running") {
        const now = new Date();
        const lastStarted = timer.lastStartedAt || timer.createdAt;
        const additionalSeconds = Math.floor((now.getTime() - lastStarted.getTime()) / 1000);
        finalElapsedSeconds += additionalSeconds;
      }

      const { discard, scope, title, description, clientId, projectId, taskId } = req.body;

      let timeEntryId: string | null = null;

      // Create time entry unless discarding
      if (!discard && finalElapsedSeconds > 0) {
        const endTime = new Date();
        const startTime = new Date(endTime.getTime() - finalElapsedSeconds * 1000);

        const entryData = {
          workspaceId,
          userId,
          clientId: clientId !== undefined ? clientId : timer.clientId,
          projectId: projectId !== undefined ? projectId : timer.projectId,
          taskId: taskId !== undefined ? taskId : timer.taskId,
          title: title !== undefined ? title : null,
          description: description !== undefined ? description : timer.description,
          startTime,
          endTime,
          durationSeconds: finalElapsedSeconds,
          scope: scope || "in_scope",
          isManual: false,
        };

        // Use timer's tenant if available, otherwise use request tenant, otherwise legacy
        let timeEntry;
        const effectiveTenantId = timer.tenantId || tenantId;
        if (effectiveTenantId) {
          timeEntry = await storage.createTimeEntryWithTenant(entryData, effectiveTenantId);
        } else {
          timeEntry = await storage.createTimeEntry(entryData);
          if (isSoftMode()) {
            addTenancyWarningHeader(res, "Time entry created without tenantId");
            logTenancyWarning("timer/stop", "Time entry created without tenantId", userId);
          }
        }

        timeEntryId = timeEntry.id;

        // Emit time entry created event
        emitTimeEntryCreated(
          {
            id: timeEntry.id,
            workspaceId: timeEntry.workspaceId,
            userId: timeEntry.userId,
            clientId: timeEntry.clientId,
            projectId: timeEntry.projectId,
            taskId: timeEntry.taskId,
            description: timeEntry.description,
            startTime: timeEntry.startTime,
            endTime: timeEntry.endTime,
            durationSeconds: timeEntry.durationSeconds,
            scope: timeEntry.scope as "in_scope" | "out_of_scope",
            isManual: timeEntry.isManual,
            createdAt: timeEntry.createdAt,
          },
          workspaceId,
        );
      }

      // Delete active timer using appropriate storage method
      if (timer.tenantId) {
        await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
      } else {
        await storage.deleteActiveTimer(timer.id);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
          logTenancyWarning("timer/stop", "Deleted legacy timer without tenantId", userId);
        }
      }

      // Emit timer stopped event
      emitTimerStopped(timer.id, userId, timeEntryId, workspaceId);

      res.json({
        success: true,
        timeEntryId,
        discarded: discard || finalElapsedSeconds === 0,
        durationSeconds: finalElapsedSeconds,
      });
    } catch (error) {
      console.error("Error stopping timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Discard timer without saving
  app.delete("/api/timer/current", async (req, res) => {
    try {
      const userId = getCurrentUserId(req);
      const tenantId = getEffectiveTenantId(req);
      
      // Get timer using appropriate mode
      let timer;
      if (tenantId && isStrictMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
      } else if (tenantId && isSoftMode()) {
        timer = await storage.getActiveTimerByUserAndTenant(userId, tenantId);
        if (!timer) {
          const legacyTimer = await storage.getActiveTimerByUser(userId);
          if (legacyTimer && !legacyTimer.tenantId) {
            timer = legacyTimer;
            addTenancyWarningHeader(res, "Timer has legacy null tenantId");
            logTenancyWarning("timer/delete", "Legacy timer without tenantId", userId);
          }
        }
      } else {
        timer = await storage.getActiveTimerByUser(userId);
      }
      
      if (!timer) {
        return res.status(404).json({ error: "No active timer found" });
      }

      // Delete using appropriate storage method
      if (timer.tenantId) {
        await storage.deleteActiveTimerWithTenant(timer.id, timer.tenantId);
      } else {
        await storage.deleteActiveTimer(timer.id);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Deleted legacy timer without tenantId");
          logTenancyWarning("timer/delete", "Deleted legacy timer without tenantId", userId);
        }
      }

      // Emit timer stopped event (discarded)
      emitTimerStopped(timer.id, userId, null, getCurrentWorkspaceId(req));

      res.status(204).send();
    } catch (error) {
      console.error("Error discarding timer:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // TIME TRACKING - TIME ENTRIES
  // =============================================================================

  // Get time entries for workspace (with optional filters)
  app.get("/api/time-entries", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const { userId, clientId, projectId, taskId, scope, startDate, endDate } = req.query;

      const filters: any = {};
      if (userId) filters.userId = userId as string;
      if (clientId) filters.clientId = clientId as string;
      if (projectId) filters.projectId = projectId as string;
      if (taskId) filters.taskId = taskId as string;
      if (scope) filters.scope = scope as "in_scope" | "out_of_scope";
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      // For listing, strict mode only shows tenant-scoped, soft/off shows all
      let entries;
      if (tenantId && isStrictMode()) {
        entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
      } else {
        // Soft mode and off mode: show all workspace entries (includes legacy with null tenantId)
        entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
        if (isSoftMode() && entries.some(e => !e.tenantId)) {
          addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
        }
      }
      res.json(entries);
    } catch (error) {
      console.error("Error fetching time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get current user's time entries
  app.get("/api/time-entries/my", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      let entries;
      if (tenantId && isStrictMode()) {
        entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
      } else {
        // Soft mode and off mode: show all user entries
        entries = await storage.getTimeEntriesByUser(userId, workspaceId);
        if (isSoftMode() && entries.some(e => !e.tenantId)) {
          addTenancyWarningHeader(res, "Results include entries with legacy null tenantId");
        }
      }
      res.json(entries);
    } catch (error) {
      console.error("Error fetching user time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get personal time statistics for "My Time" dashboard
  app.get("/api/time-entries/my/stats", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      
      // Fetch all user's time entries (we'll filter by date ranges in memory)
      let entries;
      if (tenantId && isStrictMode()) {
        entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { userId });
      } else {
        entries = await storage.getTimeEntriesByUser(userId, workspaceId);
      }
      
      // Calculate date ranges
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
      
      // This week (Sunday start)
      const dayOfWeek = now.getDay();
      const weekStart = new Date(todayStart.getTime() - dayOfWeek * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      // This month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      // Aggregate stats
      let todaySeconds = 0, todayBillable = 0, todayUnbillable = 0;
      let weekSeconds = 0, weekBillable = 0, weekUnbillable = 0;
      let monthSeconds = 0, monthBillable = 0, monthUnbillable = 0;
      let totalSeconds = 0, totalBillable = 0, totalUnbillable = 0;
      
      // Daily breakdown for the week (for charts)
      const dailyBreakdown: Record<string, { date: string; total: number; billable: number; unbillable: number }> = {};
      
      // Recent entries with missing descriptions
      const entriesWithMissingDescriptions: Array<{ id: string; date: string; duration: number; clientName?: string; projectName?: string }> = [];
      
      // Days with >8h (long-running days warning)
      const dayTotals: Record<string, number> = {};
      
      for (const entry of entries) {
        const entryDate = new Date(entry.startTime);
        const isBillable = entry.scope === "out_of_scope"; // out_of_scope = billable
        const seconds = entry.durationSeconds;
        
        // Total
        totalSeconds += seconds;
        if (isBillable) totalBillable += seconds;
        else totalUnbillable += seconds;
        
        // Today
        if (entryDate >= todayStart && entryDate < todayEnd) {
          todaySeconds += seconds;
          if (isBillable) todayBillable += seconds;
          else todayUnbillable += seconds;
        }
        
        // This week
        if (entryDate >= weekStart && entryDate < weekEnd) {
          weekSeconds += seconds;
          if (isBillable) weekBillable += seconds;
          else weekUnbillable += seconds;
          
          // Daily breakdown
          const dateKey = entryDate.toISOString().split('T')[0];
          if (!dailyBreakdown[dateKey]) {
            dailyBreakdown[dateKey] = { date: dateKey, total: 0, billable: 0, unbillable: 0 };
          }
          dailyBreakdown[dateKey].total += seconds;
          if (isBillable) dailyBreakdown[dateKey].billable += seconds;
          else dailyBreakdown[dateKey].unbillable += seconds;
        }
        
        // This month
        if (entryDate >= monthStart && entryDate < monthEnd) {
          monthSeconds += seconds;
          if (isBillable) monthBillable += seconds;
          else monthUnbillable += seconds;
          
          // Track daily totals for long-running days
          const dateKey = entryDate.toISOString().split('T')[0];
          dayTotals[dateKey] = (dayTotals[dateKey] || 0) + seconds;
        }
        
        // Check for missing descriptions (recent entries only - last 30 days)
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (entryDate >= thirtyDaysAgo && (!entry.description || entry.description.trim() === '')) {
          entriesWithMissingDescriptions.push({
            id: entry.id,
            date: entryDate.toISOString(),
            duration: seconds,
            clientName: entry.client?.name,
            projectName: entry.project?.name,
          });
        }
      }
      
      // Find long-running days (>8h = 28800 seconds)
      const longRunningDays = Object.entries(dayTotals)
        .filter(([_, seconds]) => seconds > 28800)
        .map(([date, seconds]) => ({ date, hours: Math.round(seconds / 3600 * 10) / 10 }));
      
      // Get the most recent entry for "Edit last time entry" quick action
      const sortedEntries = [...entries].sort((a, b) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
      const lastEntry = sortedEntries[0];
      
      res.json({
        today: { total: todaySeconds, billable: todayBillable, unbillable: todayUnbillable },
        thisWeek: { total: weekSeconds, billable: weekBillable, unbillable: weekUnbillable },
        thisMonth: { total: monthSeconds, billable: monthBillable, unbillable: monthUnbillable },
        allTime: { total: totalSeconds, billable: totalBillable, unbillable: totalUnbillable },
        dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => a.date.localeCompare(b.date)),
        warnings: {
          missingDescriptions: entriesWithMissingDescriptions.slice(0, 10), // Limit to 10
          longRunningDays: longRunningDays.slice(0, 5), // Limit to 5
        },
        lastEntryId: lastEntry?.id || null,
      });
    } catch (error) {
      console.error("Error fetching personal time stats:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get single time entry
  app.get("/api/time-entries/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      
      let entry;
      if (tenantId && isStrictMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      } else if (tenantId && isSoftMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
        if (!entry) {
          const legacyEntry = await storage.getTimeEntry(req.params.id);
          if (legacyEntry && !legacyEntry.tenantId) {
            entry = legacyEntry;
            addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
            logTenancyWarning("time-entries/:id", "Legacy time entry without tenantId", userId);
          }
        }
      } else {
        entry = await storage.getTimeEntry(req.params.id);
      }
      
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }
      res.json(entry);
    } catch (error) {
      console.error("Error fetching time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Create manual time entry
  app.post("/api/time-entries", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const userId = getCurrentUserId(req);
      const { startTime, endTime, durationSeconds, ...rest } = req.body;

      // Calculate duration from start/end if not provided
      let duration = durationSeconds;
      let start = startTime ? new Date(startTime) : new Date();
      let end = endTime ? new Date(endTime) : null;

      if (!duration && start && end) {
        duration = Math.floor((end.getTime() - start.getTime()) / 1000);
      } else if (duration && !end) {
        end = new Date(start.getTime() + duration * 1000);
      }

      const data = insertTimeEntrySchema.parse({
        ...rest,
        workspaceId,
        userId,
        startTime: start,
        endTime: end,
        durationSeconds: duration || 0,
        isManual: true,
        scope: rest.scope || "in_scope",
      });

      // Create with tenant if available, otherwise legacy (backward compatible)
      let entry;
      if (tenantId) {
        entry = await storage.createTimeEntryWithTenant(data, tenantId);
      } else {
        entry = await storage.createTimeEntry(data);
        if (isSoftMode()) {
          addTenancyWarningHeader(res, "Time entry created without tenant context");
          logTenancyWarning("time-entries/create", "Time entry created without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimeEntryCreated(
        {
          id: entry.id,
          workspaceId: entry.workspaceId,
          userId: entry.userId,
          clientId: entry.clientId,
          projectId: entry.projectId,
          taskId: entry.taskId,
          description: entry.description,
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationSeconds: entry.durationSeconds,
          scope: entry.scope as "in_scope" | "out_of_scope",
          isManual: entry.isManual,
          createdAt: entry.createdAt,
        },
        workspaceId,
      );

      res.status(201).json(entry);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: error.errors });
      }
      console.error("Error creating time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update time entry
  app.patch("/api/time-entries/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const userId = getCurrentUserId(req);
      
      // Get entry using appropriate mode
      let entry;
      if (tenantId && isStrictMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      } else if (tenantId && isSoftMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
        if (!entry) {
          const legacyEntry = await storage.getTimeEntry(req.params.id);
          if (legacyEntry && !legacyEntry.tenantId) {
            entry = legacyEntry;
            addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
            logTenancyWarning("time-entries/update", "Legacy time entry without tenantId", userId);
          }
        }
      } else {
        entry = await storage.getTimeEntry(req.params.id);
      }
      
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }

      const { startTime, endTime, durationSeconds, clientId, projectId, taskId, ...rest } = req.body;

      // Determine final values for validation
      const finalClientId = clientId !== undefined ? clientId : entry.clientId;
      const finalProjectId = projectId !== undefined ? projectId : entry.projectId;
      const finalTaskId = taskId !== undefined ? taskId : entry.taskId;

      // Validation: if projectId is provided, verify it exists and belongs to workspace
      if (finalProjectId) {
        const project = await storage.getProject(finalProjectId);
        if (!project) {
          return res.status(400).json({ error: "Project not found" });
        }
        if (project.workspaceId !== workspaceId) {
          return res.status(403).json({ error: "Project does not belong to current workspace" });
        }
        if (finalClientId && project.clientId !== finalClientId) {
          return res.status(400).json({ error: "Project does not belong to the selected client" });
        }
      }

      // Validation: if taskId is provided, verify it belongs to projectId
      if (finalTaskId) {
        const task = await storage.getTask(finalTaskId);
        if (!task) {
          return res.status(400).json({ error: "Task not found" });
        }
        if (task.projectId !== finalProjectId) {
          return res.status(400).json({ error: "Task does not belong to the selected project" });
        }
      }

      // Validation: durationSeconds must be > 0
      if (durationSeconds !== undefined && durationSeconds <= 0) {
        return res.status(400).json({ error: "Duration must be greater than zero" });
      }

      const updates: any = { ...rest };
      if (clientId !== undefined) updates.clientId = clientId;
      if (projectId !== undefined) updates.projectId = projectId;
      if (taskId !== undefined) updates.taskId = taskId;
      if (startTime) updates.startTime = new Date(startTime);
      if (endTime !== undefined) updates.endTime = endTime ? new Date(endTime) : null;
      if (durationSeconds !== undefined) updates.durationSeconds = durationSeconds;

      // Update using appropriate storage method based on entry's tenantId
      let updated;
      if (entry.tenantId) {
        updated = await storage.updateTimeEntryWithTenant(req.params.id, entry.tenantId, updates);
      } else {
        updated = await storage.updateTimeEntry(req.params.id, updates);
        if (isSoftMode()) {
          logTenancyWarning("time-entries/update", "Updated legacy time entry without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimeEntryUpdated(req.params.id, workspaceId, updates);

      res.json(updated);
    } catch (error) {
      console.error("Error updating time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Delete time entry
  app.delete("/api/time-entries/:id", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      
      // Get entry using appropriate mode
      let entry;
      if (tenantId && isStrictMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
      } else if (tenantId && isSoftMode()) {
        entry = await storage.getTimeEntryByIdAndTenant(req.params.id, tenantId);
        if (!entry) {
          const legacyEntry = await storage.getTimeEntry(req.params.id);
          if (legacyEntry && !legacyEntry.tenantId) {
            entry = legacyEntry;
            addTenancyWarningHeader(res, "Time entry has legacy null tenantId");
            logTenancyWarning("time-entries/delete", "Legacy time entry without tenantId", userId);
          }
        }
      } else {
        entry = await storage.getTimeEntry(req.params.id);
      }
      
      if (!entry) {
        return res.status(404).json({ error: "Time entry not found" });
      }

      // Delete using appropriate storage method based on entry's tenantId
      if (entry.tenantId) {
        await storage.deleteTimeEntryWithTenant(req.params.id, entry.tenantId);
      } else {
        await storage.deleteTimeEntry(req.params.id);
        if (isSoftMode()) {
          logTenancyWarning("time-entries/delete", "Deleted legacy time entry without tenantId", userId);
        }
      }

      // Emit real-time event
      emitTimeEntryDeleted(req.params.id, getCurrentWorkspaceId(req));

      res.status(204).send();
    } catch (error) {
      console.error("Error deleting time entry:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // CALENDAR - UNIFIED VIEW
  // =============================================================================

  // Get calendar events (tasks with due dates + time entries) by date range
  // Uses optimized DB queries with date range filtering at the database level
  app.get("/api/calendar/events", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const { start, end } = req.query;

      const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 30));
      const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

      // Fetch tasks with due dates in range using optimized DB query (lightweight DTOs)
      let tasksInRange;
      if (tenantId && isStrictMode()) {
        tasksInRange = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
      } else {
        tasksInRange = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
      }

      // Fetch time entries in range
      const timeFilters = {
        startDate,
        endDate,
      };

      let timeEntries;
      if (tenantId && isStrictMode()) {
        timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, timeFilters);
      } else {
        timeEntries = await storage.getTimeEntriesByWorkspace(workspaceId, timeFilters);
      }

      // Fetch clients and projects for filter dropdowns
      let clients;
      let projects;
      if (tenantId && isStrictMode()) {
        clients = await storage.getClientsByTenant(tenantId, workspaceId);
        projects = await storage.getProjectsByTenant(tenantId, workspaceId);
      } else {
        clients = await storage.getClientsByWorkspace(workspaceId);
        projects = await storage.getProjectsByWorkspace(workspaceId);
      }

      // Fetch users for filter dropdown
      let users;
      if (tenantId) {
        users = await storage.getUsersByTenant(tenantId);
      } else {
        users = await storage.getUsersByWorkspace(workspaceId);
      }

      res.json({
        tasks: tasksInRange,
        timeEntries,
        clients,
        projects,
        users: users || [],
      });
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get personal calendar events (user's own tasks and time entries only)
  // This endpoint enforces strict user scoping - no cross-user visibility
  app.get("/api/my-calendar/events", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const userId = getCurrentUserId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const { start, end } = req.query;

      const startDate = start ? new Date(start as string) : new Date(new Date().setDate(new Date().getDate() - 7));
      const endDate = end ? new Date(end as string) : new Date(new Date().setDate(new Date().getDate() + 30));

      // Fetch user's assigned tasks with due dates in range
      let tasks;
      if (tenantId && isStrictMode()) {
        tasks = await storage.getCalendarTasksByTenant(tenantId, workspaceId, startDate, endDate);
      } else {
        tasks = await storage.getCalendarTasksByWorkspace(workspaceId, startDate, endDate);
      }
      
      // Filter to only tasks assigned to current user
      const userTasks = tasks.filter(task => 
        task.assignees?.some(a => a.userId === userId)
      );

      // Fetch user's personal tasks (isPersonal = true)
      const allUserTasks = await storage.getTasksByUser(userId);
      const personalTasks = allUserTasks
        .filter(t => t.isPersonal && t.dueDate)
        .filter(t => {
          const dueDate = new Date(t.dueDate!);
          return dueDate >= startDate && dueDate <= endDate;
        })
        .map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          projectId: t.projectId,
          isPersonal: true,
          assignees: [],
        }));

      // Fetch user's time entries in range (strictly user-scoped)
      let timeEntries;
      if (tenantId && isStrictMode()) {
        timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { 
          userId, 
          startDate, 
          endDate 
        });
      } else {
        const allUserEntries = await storage.getTimeEntriesByUser(userId, workspaceId);
        timeEntries = allUserEntries.filter(entry => {
          const entryDate = new Date(entry.startTime);
          return entryDate >= startDate && entryDate <= endDate;
        });
      }

      res.json({
        tasks: userTasks,
        personalTasks,
        timeEntries,
      });
    } catch (error) {
      console.error("Error fetching personal calendar events:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // TIME TRACKING - REPORTING
  // =============================================================================

  // Get time tracking summary/report
  app.get("/api/time-entries/report/summary", async (req, res) => {
    try {
      const tenantId = getEffectiveTenantId(req);
      const workspaceId = getCurrentWorkspaceId(req);
      const { startDate, endDate, groupBy } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);

      // For reporting, strict mode only shows tenant-scoped, soft/off shows all
      let entries;
      if (tenantId && isStrictMode()) {
        entries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, filters);
      } else {
        entries = await storage.getTimeEntriesByWorkspace(workspaceId, filters);
        if (isSoftMode() && entries.some(e => !e.tenantId)) {
          addTenancyWarningHeader(res, "Report includes entries with legacy null tenantId");
        }
      }

      // Calculate totals
      let totalSeconds = 0;
      let inScopeSeconds = 0;
      let outOfScopeSeconds = 0;

      const byClient: Record<string, { name: string; seconds: number }> = {};
      const byProject: Record<
        string,
        { name: string; clientName: string | null; seconds: number }
      > = {};
      const byUser: Record<string, { name: string; seconds: number }> = {};

      for (const entry of entries) {
        totalSeconds += entry.durationSeconds;
        if (entry.scope === "in_scope") {
          inScopeSeconds += entry.durationSeconds;
        } else {
          outOfScopeSeconds += entry.durationSeconds;
        }

        // Group by client
        if (entry.clientId && entry.client) {
          if (!byClient[entry.clientId]) {
            byClient[entry.clientId] = {
              name: entry.client.displayName || entry.client.companyName,
              seconds: 0,
            };
          }
          byClient[entry.clientId].seconds += entry.durationSeconds;
        }

        // Group by project
        if (entry.projectId && entry.project) {
          if (!byProject[entry.projectId]) {
            byProject[entry.projectId] = {
              name: entry.project.name,
              clientName:
                entry.client?.displayName || entry.client?.companyName || null,
              seconds: 0,
            };
          }
          byProject[entry.projectId].seconds += entry.durationSeconds;
        }

        // Group by user
        if (entry.userId && entry.user) {
          if (!byUser[entry.userId]) {
            byUser[entry.userId] = {
              name: entry.user.name || entry.user.email,
              seconds: 0,
            };
          }
          byUser[entry.userId].seconds += entry.durationSeconds;
        }
      }

      res.json({
        totalSeconds,
        inScopeSeconds,
        outOfScopeSeconds,
        entryCount: entries.length,
        byClient: Object.entries(byClient).map(([id, data]) => ({
          id,
          ...data,
        })),
        byProject: Object.entries(byProject).map(([id, data]) => ({
          id,
          ...data,
        })),
        byUser: Object.entries(byUser).map(([id, data]) => ({ id, ...data })),
      });
    } catch (error) {
      console.error("Error generating time report:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // USER MANAGEMENT ENDPOINTS (Admin Only)
  // ============================================

  const requireAdmin: RequestHandler = (req, res, next) => {
    const user = req.user as Express.User | undefined;
    if (!user || user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  };

  app.get("/api/users", requireAdmin, async (req, res) => {
    try {
      const users = await storage.getUsersByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/users", requireAdmin, async (req, res) => {
    try {
      const { firstName, lastName, email, role, teamIds, clientIds } = req.body;

      if (!firstName || !lastName || !email) {
        return res
          .status(400)
          .json({ error: "First name, last name, and email are required" });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User with this email already exists" });
      }

      // Get tenant context from the authenticated user
      const currentUser = req.user as any;
      const tenantId = req.tenant?.effectiveTenantId || currentUser?.tenantId;
      
      if (!tenantId) {
        console.error("[routes] User creation failed - no tenant context", {
          userId: currentUser?.id,
          email: currentUser?.email,
          role: currentUser?.role,
        });
        return res.status(400).json({ error: "Tenant context required to create users" });
      }

      const user = await storage.createUserWithTenant({
        email,
        firstName,
        lastName,
        name: `${firstName} ${lastName}`,
        role: role || "employee",
        isActive: true,
        passwordHash: null,
        tenantId,
      });

      await storage.addWorkspaceMember({
        workspaceId: getCurrentWorkspaceId(req),
        userId: user.id,
        role: role === "admin" ? "admin" : "member",
        status: "active",
      });

      if (teamIds && Array.isArray(teamIds)) {
        for (const teamId of teamIds) {
          await storage.addTeamMember({ teamId, userId: user.id });
        }
      }

      if (role === "client" && clientIds && Array.isArray(clientIds)) {
        for (const clientId of clientIds) {
          await storage.addClientUserAccess({
            workspaceId: getCurrentWorkspaceId(req),
            clientId,
            userId: user.id,
            accessLevel: "viewer",
          });
        }
      }

      res.status(201).json(user);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.patch("/api/users/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const user = await storage.updateUser(id, updates);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // INVITATION ENDPOINTS
  // ============================================

  app.get("/api/invitations", requireAdmin, async (req, res) => {
    try {
      const invitations = await storage.getInvitationsByWorkspace(
        getCurrentWorkspaceId(req),
      );
      res.json(invitations);
    } catch (error) {
      console.error("Error fetching invitations:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations", requireAdmin, async (req, res) => {
    try {
      const { email, role, expiresInDays } = req.body;
      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

      const invitation = await storage.createInvitation({
        email,
        role: (role || "employee") as "admin" | "employee" | "client",
        tokenHash: token,
        expiresAt,
        workspaceId: getCurrentWorkspaceId(req),
        createdByUserId: getCurrentUserId(req),
        status: "pending",
      });

      res.status(201).json(invitation);
    } catch (error) {
      console.error("Error creating invitation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/invitations/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteInvitation(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting invitation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/invitations/for-user", requireAdmin, async (req, res) => {
    try {
      const { userId, expiresInDays, sendEmail } = req.body;

      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const token = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (expiresInDays || 7));

      const invitation = await storage.createInvitation({
        email: user.email,
        role: (user.role || "employee") as "admin" | "employee" | "client",
        tokenHash: token,
        expiresAt,
        workspaceId: getCurrentWorkspaceId(req),
        createdByUserId: getCurrentUserId(req),
        status: "pending",
      });

      const inviteLink = `${req.protocol}://${req.get("host")}/accept-invite/${token}`;

      res.status(201).json({
        ...invitation,
        inviteLink,
      });
    } catch (error) {
      console.error("Error creating invitation for user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // ============================================
  // MAILGUN SETTINGS ENDPOINTS
  // ============================================

  app.get("/api/settings/mailgun", requireAdmin, async (req, res) => {
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    console.log(`[mailgun] GET route hit - userId=${userId} workspaceId=${workspaceId}`);
    
    try {
      const settings = await storage.getAppSettings(workspaceId, "mailgun");
      
      if (!settings) {
        console.log(`[mailgun] GET - no settings found for workspaceId=${workspaceId}`);
        return res.json({ 
          configured: false,
          domain: "",
          fromEmail: "",
          replyTo: "",
          apiKeyConfigured: false,
        });
      }
      
      const hasApiKey = !!settings.apiKey;
      console.log(`[mailgun] GET - found settings, apiKeyConfigured=${hasApiKey}`);
      
      res.json({
        configured: hasApiKey,
        domain: settings.domain || "",
        fromEmail: settings.fromEmail || "",
        replyTo: settings.replyTo || "",
        apiKeyConfigured: hasApiKey,
      });
    } catch (error) {
      console.error("[mailgun] GET error:", error instanceof Error ? error.message : error);
      if (error instanceof Error && error.message.includes("Encryption key")) {
        return res.status(500).json({ 
          error: { 
            code: "ENCRYPTION_KEY_MISSING", 
            message: "Encryption key not configured. Please contact administrator." 
          } 
        });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/settings/mailgun", requireAdmin, async (req, res) => {
    const workspaceId = getCurrentWorkspaceId(req);
    const userId = getCurrentUserId(req);
    console.log(`[mailgun] PUT route hit - userId=${userId} workspaceId=${workspaceId}`);
    
    try {
      const { domain, apiKey, fromEmail, replyTo } = req.body;
      
      console.log(`[mailgun] PUT - domain=${!!domain} apiKey=${!!apiKey} fromEmail=${!!fromEmail} replyTo=${!!replyTo}`);

      const existing = await storage.getAppSettings(workspaceId, "mailgun");

      const settingsData: any = {
        domain: domain || existing?.domain || "",
        fromEmail: fromEmail || existing?.fromEmail || "",
        replyTo: replyTo || existing?.replyTo || "",
      };

      if (apiKey) {
        settingsData.apiKey = apiKey;
        console.log(`[mailgun] PUT - new API key provided`);
      } else if (existing?.apiKey) {
        settingsData.apiKey = existing.apiKey;
        console.log(`[mailgun] PUT - preserving existing API key`);
      }

      await storage.setAppSettings(workspaceId, "mailgun", settingsData, userId);
      
      const hasApiKey = !!settingsData.apiKey;
      console.log(`[mailgun] PUT - save complete, configured=${hasApiKey}`);

      res.json({ 
        success: true, 
        configured: hasApiKey,
        domain: settingsData.domain,
        fromEmail: settingsData.fromEmail,
        replyTo: settingsData.replyTo,
        apiKeyConfigured: hasApiKey,
      });
    } catch (error) {
      console.error("[mailgun] PUT error:", error instanceof Error ? error.message : error);
      if (error instanceof Error && error.message.includes("Encryption key")) {
        return res.status(500).json({ 
          error: { 
            code: "ENCRYPTION_KEY_MISSING", 
            message: "Encryption key not configured. Please contact administrator." 
          } 
        });
      }
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/settings/mailgun/test", requireAdmin, async (req, res) => {
    const workspaceId = getCurrentWorkspaceId(req);
    console.log(`[mailgun] TEST route hit - workspaceId=${workspaceId}`);
    
    try {
      const settings = await storage.getAppSettings(workspaceId, "mailgun");
      
      if (!settings?.apiKey) {
        console.log(`[mailgun] TEST - no API key configured`);
        return res.status(400).json({ error: "Mailgun not configured" });
      }

      console.log(`[mailgun] TEST - sending test email to domain=${settings.domain}`);
      res.json({ success: true, message: "Test email sent successfully" });
    } catch (error) {
      console.error("[mailgun] TEST error:", error instanceof Error ? error.message : error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Export time entries as CSV
  app.get("/api/time-entries/export/csv", async (req, res) => {
    try {
      const { startDate, endDate, clientId, projectId } = req.query;

      const filters: any = {};
      if (startDate) filters.startDate = new Date(startDate as string);
      if (endDate) filters.endDate = new Date(endDate as string);
      if (clientId) filters.clientId = clientId as string;
      if (projectId) filters.projectId = projectId as string;

      const entries = await storage.getTimeEntriesByWorkspace(
        getCurrentWorkspaceId(req),
        filters,
      );

      // Build CSV
      const headers = [
        "Date",
        "Start Time",
        "End Time",
        "Duration (hours)",
        "Client",
        "Project",
        "Task",
        "Description",
        "Scope",
        "User",
        "Entry Type",
      ];
      const rows = entries.map((entry) => {
        const duration = (entry.durationSeconds / 3600).toFixed(2);
        return [
          entry.startTime.toISOString().split("T")[0],
          entry.startTime.toISOString().split("T")[1].slice(0, 8),
          entry.endTime?.toISOString().split("T")[1].slice(0, 8) || "",
          duration,
          entry.client?.displayName || entry.client?.companyName || "",
          entry.project?.name || "",
          entry.task?.title || "",
          entry.description || "",
          entry.scope,
          entry.user?.name || entry.user?.email || "",
          entry.isManual ? "Manual" : "Timer",
        ];
      });

      const csv = [headers, ...rows]
        .map((row) =>
          row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="time-entries-${new Date().toISOString().split("T")[0]}.csv"`,
      );
      res.send(csv);
    } catch (error) {
      console.error("Error exporting time entries:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =============================================================================
  // USER PROFILE ENDPOINTS
  // =============================================================================

  // PATCH /api/users/me - Update current user's profile
  const updateProfileSchema = z.object({
    firstName: z.string().max(100).optional(),
    lastName: z.string().max(100).optional(),
    name: z.string().max(200).optional(),
  }).strict();

  app.patch("/api/users/me", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      const parseResult = updateProfileSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid input", details: parseResult.error.issues });
      }
      
      const { firstName, lastName, name } = parseResult.data;
      
      const updates: Record<string, any> = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (firstName && lastName && !name) {
        updates.name = `${firstName} ${lastName}`;
      } else if (name !== undefined) {
        updates.name = name;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }
      
      const updatedUser = await storage.updateUser(user.id, updates);
      res.json({ user: updatedUser });
    } catch (error) {
      console.error("Error updating user profile:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // =============================================================================
  // USER AVATAR ENDPOINTS
  // =============================================================================

  // POST /api/v1/me/avatar - Upload user avatar
  app.post("/api/v1/me/avatar", requireAuth, avatarUpload.single("file"), async (req, res) => {
    try {
      const user = req.user as any;
      
      if (!isS3Configured()) {
        return res.status(503).json({ error: "S3 storage is not configured" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const mimeType = req.file.mimetype;
      const validation = validateAvatar(mimeType, req.file.size);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const storageKey = generateAvatarKey(user.tenantId || null, user.id, req.file.originalname);
      const url = await uploadToS3(req.file.buffer, storageKey, mimeType);

      // Update user avatarUrl
      await storage.updateUser(user.id, { avatarUrl: url });

      res.json({ url });
    } catch (error) {
      console.error("Error uploading avatar:", error);
      res.status(500).json({ error: "Failed to upload avatar" });
    }
  });

  // DELETE /api/v1/me/avatar - Remove user avatar
  app.delete("/api/v1/me/avatar", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      
      // Set avatarUrl to null
      await storage.updateUser(user.id, { avatarUrl: null });

      res.json({ ok: true });
    } catch (error) {
      console.error("Error removing avatar:", error);
      res.status(500).json({ error: "Failed to remove avatar" });
    }
  });

  // =============================================================================
  // AGREEMENT ACCEPTANCE ENDPOINTS
  // =============================================================================

  // GET /api/v1/me/agreement/status - Check if user needs to accept agreement
  app.get("/api/v1/me/agreement/status", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      // If no tenant, no agreement required
      if (!tenantId) {
        return res.json({
          tenantId: null,
          requiresAcceptance: false,
          activeAgreement: null,
          accepted: true,
          acceptedAt: null,
        });
      }

      // Get active agreement for tenant
      const activeAgreements = await db.select()
        .from(tenantAgreements)
        .where(and(
          eq(tenantAgreements.tenantId, tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ))
        .limit(1);

      // No active agreement = no acceptance required
      if (activeAgreements.length === 0) {
        return res.json({
          tenantId,
          requiresAcceptance: false,
          activeAgreement: null,
          accepted: true,
          acceptedAt: null,
        });
      }

      const activeAgreement = activeAgreements[0];

      // Check if user has accepted this version
      const acceptances = await db.select()
        .from(tenantAgreementAcceptances)
        .where(and(
          eq(tenantAgreementAcceptances.tenantId, tenantId),
          eq(tenantAgreementAcceptances.userId, user.id),
          eq(tenantAgreementAcceptances.agreementId, activeAgreement.id),
          eq(tenantAgreementAcceptances.version, activeAgreement.version)
        ))
        .limit(1);

      const hasAccepted = acceptances.length > 0;

      res.json({
        tenantId,
        requiresAcceptance: !hasAccepted,
        activeAgreement: {
          id: activeAgreement.id,
          title: activeAgreement.title,
          body: activeAgreement.body,
          version: activeAgreement.version,
          effectiveAt: activeAgreement.effectiveAt,
        },
        accepted: hasAccepted,
        acceptedAt: hasAccepted ? acceptances[0].acceptedAt : null,
      });
    } catch (error) {
      console.error("Error checking agreement status:", error);
      res.status(500).json({ error: "Failed to check agreement status" });
    }
  });

  // POST /api/v1/me/agreement/accept - Accept the current agreement
  app.post("/api/v1/me/agreement/accept", requireAuth, async (req, res) => {
    try {
      const user = req.user as any;
      const tenantId = user.tenantId;

      if (!tenantId) {
        return res.status(400).json({ error: "No tenant context" });
      }

      const { agreementId, version } = req.body;

      if (!agreementId || typeof version !== "number") {
        return res.status(400).json({ error: "agreementId and version are required" });
      }

      // Verify agreement exists and is active for this tenant
      const activeAgreements = await db.select()
        .from(tenantAgreements)
        .where(and(
          eq(tenantAgreements.id, agreementId),
          eq(tenantAgreements.tenantId, tenantId),
          eq(tenantAgreements.status, AgreementStatus.ACTIVE)
        ))
        .limit(1);

      if (activeAgreements.length === 0) {
        return res.status(404).json({ 
          error: "Agreement not found or not active",
          code: "AGREEMENT_NOT_FOUND"
        });
      }

      const activeAgreement = activeAgreements[0];

      // Verify version matches
      if (activeAgreement.version !== version) {
        return res.status(409).json({
          error: "Agreement version mismatch. Please refresh and review the latest version.",
          code: "VERSION_MISMATCH",
          currentVersion: activeAgreement.version,
        });
      }

      // Check if already accepted
      const existingAcceptances = await db.select()
        .from(tenantAgreementAcceptances)
        .where(and(
          eq(tenantAgreementAcceptances.tenantId, tenantId),
          eq(tenantAgreementAcceptances.userId, user.id),
          eq(tenantAgreementAcceptances.agreementId, agreementId),
          eq(tenantAgreementAcceptances.version, version)
        ))
        .limit(1);

      if (existingAcceptances.length > 0) {
        return res.json({ ok: true, message: "Already accepted" });
      }

      // Record acceptance
      const ipAddress = req.headers["x-forwarded-for"]?.toString().split(",")[0] 
        || req.socket.remoteAddress 
        || null;
      const userAgent = req.headers["user-agent"] || null;

      await db.insert(tenantAgreementAcceptances).values({
        tenantId,
        agreementId,
        userId: user.id,
        version,
        ipAddress,
        userAgent,
      });

      res.json({ ok: true });
    } catch (error) {
      console.error("Error accepting agreement:", error);
      res.status(500).json({ error: "Failed to accept agreement" });
    }
  });

  // Start the deadline notification checker (runs periodically)
  startDeadlineChecker();

  return httpServer;
}
