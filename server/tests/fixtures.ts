/**
 * Test Fixtures & Utilities
 * 
 * Purpose: Shared test helpers for creating test data and proper cleanup.
 * 
 * Key Function: safeDeleteAllUsers()
 * Deletes ALL test data in FK-safe order. Use in afterAll() for full cleanup.
 * 
 * Cleanup Order (safeDeleteAllUsers):
 *   Level 1-4: Task hierarchy (assignees → tasks → sections)
 *   Level 5: Time tracking (entries, timers, activity_log)
 *   Level 6: Memberships (workspace_members, team_members, teams)
 *   Level 7: Clients (client_contacts, client_invites, client_user_access, clients)
 *   Level 8: User-related (personal_task_sections, notifications, acceptances)
 *   Level 9: Workspaces
 *   Level 10: Tenant-related (tenant_audit_events, agreements, settings, etc.)
 *   Level 11: Tenants
 *   Level 12: Platform-level (platform_audit_events, platform_invitations, email_outbox)
 *   Level 13: Sessions (user_sessions)
 *   Level 14: Users
 * 
 * Critical: platform_audit_events and platform_invitations MUST be deleted
 * before users due to FK constraints on actor_user_id and invited_by_user_id.
 * 
 * Usage:
 *   - Use factories to create test data with proper tenant scoping
 *   - Call safeDeleteAllUsers() in afterAll() to safely remove test data
 *   - Prefer scoped cleanup (by tenant/user ID) over full table truncation
 * 
 * @see docs/TESTING.md for complete test documentation
 */

import { db } from "../db";
import { 
  users, tenants, workspaces, teams, clients, projects, tasks, sections,
  timeEntries, activeTimers, comments, activityLog, taskAssignees, taskTags,
  taskAttachments, projectMembers, workspaceMembers, teamMembers,
  tenantSettings, tenantAgreements, tenantAgreementAcceptances,
  invitations, tenantAuditEvents, tenantNotes, tenantIntegrations,
  personalTaskSections, notifications, commentMentions,
  UserRole, TenantStatus
} from "../../shared/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { hashPassword } from "../auth";

// ============================================================================
// Factory Helpers
// ============================================================================

export interface CreateUserOptions {
  email?: string;
  name?: string;
  role?: typeof UserRole[keyof typeof UserRole];
  tenantId?: string | null;
  isActive?: boolean;
  password?: string;
}

export async function createTestUser(options: CreateUserOptions = {}) {
  const passwordHash = await hashPassword(options.password || "testpass123");
  const [user] = await db.insert(users).values({
    email: options.email || `test-${Date.now()}@example.com`,
    name: options.name || "Test User",
    passwordHash,
    role: options.role || UserRole.EMPLOYEE,
    tenantId: options.tenantId,
    isActive: options.isActive ?? true,
  }).returning();
  return user;
}

export interface CreateTenantOptions {
  name?: string;
  slug?: string;
  status?: typeof TenantStatus[keyof typeof TenantStatus];
}

export async function createTestTenant(options: CreateTenantOptions = {}) {
  const timestamp = Date.now();
  const [tenant] = await db.insert(tenants).values({
    name: options.name || `Test Tenant ${timestamp}`,
    slug: options.slug || `test-tenant-${timestamp}`,
    status: options.status || TenantStatus.ACTIVE,
  }).returning();
  return tenant;
}

export interface CreateWorkspaceOptions {
  name?: string;
  tenantId: string;
  isPrimary?: boolean;
}

export async function createTestWorkspace(options: CreateWorkspaceOptions) {
  const [workspace] = await db.insert(workspaces).values({
    name: options.name || "Test Workspace",
    tenantId: options.tenantId,
    isPrimary: options.isPrimary ?? false,
  }).returning();
  return workspace;
}

export interface CreateProjectOptions {
  name?: string;
  workspaceId: string;
  tenantId: string;
  clientId?: string | null;
  status?: string;
}

export async function createTestProject(options: CreateProjectOptions) {
  const [project] = await db.insert(projects).values({
    name: options.name || "Test Project",
    workspaceId: options.workspaceId,
    tenantId: options.tenantId,
    clientId: options.clientId || null,
    status: options.status || "active",
  }).returning();
  return project;
}

export interface CreateSectionOptions {
  name?: string;
  projectId: string;
}

export async function createTestSection(options: CreateSectionOptions) {
  const { sections } = await import("../../shared/schema");
  const [section] = await db.insert(sections).values({
    name: options.name || "Test Section",
    projectId: options.projectId,
  }).returning();
  return section;
}

export interface CreateTaskOptions {
  title?: string;
  projectId: string;
  tenantId: string;
  sectionId?: string | null;
  createdBy?: string | null;
  status?: string;
  dueDate?: Date | null;
}

export async function createTestTask(options: CreateTaskOptions) {
  const [task] = await db.insert(tasks).values({
    title: options.title || "Test Task",
    projectId: options.projectId,
    tenantId: options.tenantId,
    sectionId: options.sectionId || null,
    createdBy: options.createdBy || null,
    status: options.status || "todo",
    dueDate: options.dueDate || null,
  }).returning();
  return task;
}

export interface CreateClientOptions {
  companyName?: string;
  workspaceId: string;
  tenantId: string;
}

export async function createTestClient(options: CreateClientOptions) {
  const [client] = await db.insert(clients).values({
    companyName: options.companyName || "Test Client",
    workspaceId: options.workspaceId,
    tenantId: options.tenantId,
  }).returning();
  return client;
}

export interface CreateTeamOptions {
  name?: string;
  workspaceId: string;
  tenantId: string;
}

export async function createTestTeam(options: CreateTeamOptions) {
  const [team] = await db.insert(teams).values({
    name: options.name || "Test Team",
    workspaceId: options.workspaceId,
    tenantId: options.tenantId,
  }).returning();
  return team;
}

// ============================================================================
// Cleanup Helpers
// ============================================================================

/**
 * Safely delete all test data by following FK dependency order.
 * Use this in afterAll/afterEach hooks.
 * 
 * @param options - Optional filters to scope cleanup
 */
export async function cleanupTestData(options: {
  tenantIds?: string[];
  userIds?: string[];
  skipTenants?: boolean;
} = {}) {
  const { tenantIds, userIds, skipTenants } = options;

  // Use raw SQL for efficient cleanup with proper ordering
  // Tables are deleted in reverse dependency order (children first)
  
  if (tenantIds && tenantIds.length > 0) {
    // Scoped cleanup by tenant
    for (const tenantId of tenantIds) {
      await cleanupByTenant(tenantId);
    }
  } else if (userIds && userIds.length > 0) {
    // Scoped cleanup by user (for tests that only create users)
    await cleanupByUserIds(userIds, skipTenants);
  }
}

async function cleanupByTenant(tenantId: string) {
  // Level 1: Task relations
  await db.delete(taskAssignees).where(
    inArray(taskAssignees.taskId, 
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tenantId, tenantId))
    )
  );
  await db.delete(taskTags).where(
    inArray(taskTags.taskId,
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tenantId, tenantId))
    )
  );
  await db.delete(commentMentions).where(
    inArray(commentMentions.commentId,
      db.select({ id: comments.id }).from(comments).where(
        inArray(comments.taskId, db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tenantId, tenantId)))
      )
    )
  );
  await db.delete(taskAttachments).where(
    inArray(taskAttachments.taskId,
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tenantId, tenantId))
    )
  );

  // Level 2: Comments, subtasks (via parentTaskId)
  await db.delete(comments).where(
    inArray(comments.taskId,
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.tenantId, tenantId))
    )
  );
  
  // Level 3: Time tracking (must be before tasks due to FK on taskId)
  await db.delete(timeEntries).where(eq(timeEntries.tenantId, tenantId));
  await db.delete(activeTimers).where(eq(activeTimers.tenantId, tenantId));
  
  // Level 4: Tasks
  await db.delete(tasks).where(eq(tasks.tenantId, tenantId));

  // Level 5: Sections
  await db.delete(sections).where(
    inArray(sections.projectId,
      db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, tenantId))
    )
  );

  // Level 6: Project members, projects
  await db.delete(projectMembers).where(
    inArray(projectMembers.projectId,
      db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, tenantId))
    )
  );
  await db.delete(projects).where(eq(projects.tenantId, tenantId));

  // Level 7: Activity logs (join through workspaces for tenant scoping)
  await db.delete(activityLog).where(
    inArray(activityLog.workspaceId,
      db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.tenantId, tenantId))
    )
  );
  await db.delete(tenantAuditEvents).where(eq(tenantAuditEvents.tenantId, tenantId));

  // Level 8: Workspace/team members
  await db.delete(workspaceMembers).where(
    inArray(workspaceMembers.workspaceId,
      db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.tenantId, tenantId))
    )
  );
  await db.delete(teamMembers).where(
    inArray(teamMembers.teamId,
      db.select({ id: teams.id }).from(teams).where(eq(teams.tenantId, tenantId))
    )
  );

  // Level 9: Teams, clients
  await db.delete(teams).where(eq(teams.tenantId, tenantId));
  await db.delete(clients).where(eq(clients.tenantId, tenantId));

  // Level 10: Workspaces
  await db.delete(workspaces).where(eq(workspaces.tenantId, tenantId));

  // Level 11: User-related
  await db.delete(personalTaskSections).where(eq(personalTaskSections.tenantId, tenantId));
  await db.delete(notifications).where(
    inArray(notifications.userId,
      db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId))
    )
  );

  // Level 12: Tenant user relations
  await db.delete(tenantAgreementAcceptances).where(
    inArray(tenantAgreementAcceptances.agreementId,
      db.select({ id: tenantAgreements.id }).from(tenantAgreements).where(eq(tenantAgreements.tenantId, tenantId))
    )
  );
  await db.delete(invitations).where(eq(invitations.tenantId, tenantId));

  // Level 13: Users
  await db.delete(users).where(eq(users.tenantId, tenantId));

  // Level 14: Tenant settings/integrations/notes
  await db.delete(tenantAgreements).where(eq(tenantAgreements.tenantId, tenantId));
  await db.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenantId));
  await db.delete(tenantIntegrations).where(eq(tenantIntegrations.tenantId, tenantId));
  await db.delete(tenantNotes).where(eq(tenantNotes.tenantId, tenantId));

  // Level 15: Tenant itself
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function cleanupByUserIds(userIds: string[], skipTenants?: boolean) {
  // For tests that only create users (no tenant), clean user-related data
  for (const userId of userIds) {
    // Clean FK references to user
    await db.delete(projectMembers).where(eq(projectMembers.userId, userId));
    await db.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    await db.delete(teamMembers).where(eq(teamMembers.userId, userId));
    await db.delete(personalTaskSections).where(eq(personalTaskSections.userId, userId));
    await db.delete(notifications).where(eq(notifications.userId, userId));
    await db.delete(tenantAgreementAcceptances).where(eq(tenantAgreementAcceptances.userId, userId));
    
    // Clean tasks created by user
    const userTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.createdBy, userId));
    if (userTasks.length > 0) {
      const taskIds = userTasks.map(t => t.id);
      await db.delete(taskAssignees).where(inArray(taskAssignees.taskId, taskIds));
      await db.delete(comments).where(inArray(comments.taskId, taskIds));
    }
    await db.update(tasks).set({ createdBy: null }).where(eq(tasks.createdBy, userId));
    
    // Clean time entries
    await db.delete(timeEntries).where(eq(timeEntries.userId, userId));
    await db.delete(activeTimers).where(eq(activeTimers.userId, userId));
    
    // Clean activity logs (uses actorUserId, not userId)
    await db.delete(activityLog).where(eq(activityLog.actorUserId, userId));
    
    // Now delete the user
    await db.delete(users).where(eq(users.id, userId));
  }
}

/**
 * Clean all users without tenant (for tests creating isolated users).
 * Safely removes FK dependencies first.
 */
export async function cleanupUsersWithoutTenant() {
  // Get users without tenant (typically super users or test users)
  const usersWithoutTenant = await db.select({ id: users.id })
    .from(users)
    .where(sql`${users.tenantId} IS NULL`);
  
  const userIds = usersWithoutTenant.map(u => u.id);
  if (userIds.length > 0) {
    await cleanupByUserIds(userIds, true);
  }
}

/**
 * Safe cleanup for tests that only touch users table (like auth tests).
 * Removes FK dependencies before deleting users.
 * 
 * NOTE: This deletes ALL data including tenants. Use only when
 * you need a completely clean database state.
 */
export async function safeDeleteAllUsers() {
  // Delete in FK order - comprehensive cleanup
  // Level 1: Task relations
  await db.execute(sql`DELETE FROM comment_mentions`);
  await db.execute(sql`DELETE FROM task_assignees`);
  await db.execute(sql`DELETE FROM task_tags`);
  await db.execute(sql`DELETE FROM task_attachments`);
  await db.execute(sql`DELETE FROM comments`);
  await db.execute(sql`DELETE FROM subtasks`);
  await db.execute(sql`DELETE FROM tasks`);
  await db.execute(sql`DELETE FROM sections`);
  
  // Level 2: Tags (references workspaces)
  await db.execute(sql`DELETE FROM tags`);
  
  // Level 3: Projects
  await db.execute(sql`DELETE FROM project_members`);
  await db.execute(sql`DELETE FROM projects`);
  
  // Level 4: Time tracking
  await db.execute(sql`DELETE FROM time_entries`);
  await db.execute(sql`DELETE FROM active_timers`);
  await db.execute(sql`DELETE FROM activity_log`);
  
  // Level 5: Workspace/team members
  await db.execute(sql`DELETE FROM workspace_members`);
  await db.execute(sql`DELETE FROM team_members`);
  await db.execute(sql`DELETE FROM teams`);
  
  // Level 6: Clients (references workspaces)
  await db.execute(sql`DELETE FROM client_contacts`);
  await db.execute(sql`DELETE FROM client_invites`);
  await db.execute(sql`DELETE FROM client_user_access`);
  await db.execute(sql`DELETE FROM clients`);
  
  // Level 7: User-related (some reference workspaces)
  await db.execute(sql`DELETE FROM personal_task_sections`);
  await db.execute(sql`DELETE FROM notifications`);
  await db.execute(sql`DELETE FROM tenant_agreement_acceptances`);
  await db.execute(sql`DELETE FROM invitations`);
  
  // Level 8: Workspaces
  await db.execute(sql`DELETE FROM workspaces`);
  
  // Level 9: Tenant-related
  await db.execute(sql`DELETE FROM tenant_audit_events`);
  await db.execute(sql`DELETE FROM tenant_agreements`);
  await db.execute(sql`DELETE FROM tenant_settings`);
  await db.execute(sql`DELETE FROM tenant_integrations`);
  await db.execute(sql`DELETE FROM tenant_notes`);
  await db.execute(sql`DELETE FROM tenancy_warnings`);
  await db.execute(sql`DELETE FROM tenants`);
  
  // Level 10: Platform-level tables (reference users)
  await db.execute(sql`DELETE FROM platform_audit_events`);
  await db.execute(sql`DELETE FROM platform_invitations`);
  await db.execute(sql`DELETE FROM email_outbox`);
  
  // Level 11: Sessions (must clear before users in case of FK)
  await db.execute(sql`DELETE FROM user_sessions`);
  
  // Level 12: Users (no more FK references)
  await db.execute(sql`DELETE FROM users`);
}

// ============================================================================
// Login Helpers
// ============================================================================

import request from "supertest";
import { Express } from "express";

export async function loginAsUser(
  app: Express,
  email: string,
  password: string
): Promise<string> {
  const response = await request(app)
    .post("/api/auth/login")
    .send({ email, password });
  
  return response.headers["set-cookie"]?.[0] || "";
}

export async function createAndLoginSuperUser(
  app: Express,
  options: { email?: string; password?: string } = {}
): Promise<{ user: any; cookie: string }> {
  const email = options.email || `super-${Date.now()}@test.com`;
  const password = options.password || "superpass123";
  
  const user = await createTestUser({
    email,
    password,
    role: UserRole.SUPER_USER,
    tenantId: null,
  });
  
  const cookie = await loginAsUser(app, email, password);
  return { user, cookie };
}

export async function createAndLoginTenantAdmin(
  app: Express,
  tenantId: string,
  options: { email?: string; password?: string } = {}
): Promise<{ user: any; cookie: string }> {
  const email = options.email || `admin-${Date.now()}@test.com`;
  const password = options.password || "adminpass123";
  
  const user = await createTestUser({
    email,
    password,
    role: UserRole.ADMIN,
    tenantId,
  });
  
  const cookie = await loginAsUser(app, email, password);
  return { user, cookie };
}

export async function createAndLoginEmployee(
  app: Express,
  tenantId: string,
  options: { email?: string; password?: string } = {}
): Promise<{ user: any; cookie: string }> {
  const email = options.email || `employee-${Date.now()}@test.com`;
  const password = options.password || "emppass123";
  
  const user = await createTestUser({
    email,
    password,
    role: UserRole.EMPLOYEE,
    tenantId,
  });
  
  const cookie = await loginAsUser(app, email, password);
  return { user, cookie };
}

// ============================================================================
// Full Test Environment Setup
// ============================================================================

export interface TestEnvironment {
  tenant: any;
  workspace: any;
  adminUser: any;
  employeeUser: any;
  adminCookie: string;
  employeeCookie: string;
}

export async function setupTestEnvironment(app: Express): Promise<TestEnvironment> {
  const tenant = await createTestTenant();
  const workspace = await createTestWorkspace({ tenantId: tenant.id, isPrimary: true });
  
  const adminEmail = `admin-${Date.now()}@test.com`;
  const employeeEmail = `employee-${Date.now()}@test.com`;
  const password = "testpass123";
  
  const adminUser = await createTestUser({
    email: adminEmail,
    password,
    role: UserRole.ADMIN,
    tenantId: tenant.id,
  });
  
  const employeeUser = await createTestUser({
    email: employeeEmail,
    password,
    role: UserRole.EMPLOYEE,
    tenantId: tenant.id,
  });
  
  const adminCookie = await loginAsUser(app, adminEmail, password);
  const employeeCookie = await loginAsUser(app, employeeEmail, password);
  
  return {
    tenant,
    workspace,
    adminUser,
    employeeUser,
    adminCookie,
    employeeCookie,
  };
}

export async function teardownTestEnvironment(env: TestEnvironment) {
  await cleanupTestData({ tenantIds: [env.tenant.id] });
}
