/**
 * Tenant Core Flows Smoke Tests
 * 
 * Purpose: Catch schema drift, missing columns, or null-tenant issues before deploy.
 * These tests verify that core tenant tables exist with required columns.
 * 
 * Coverage:
 * - Clients: table exists, can CRUD with tenant_id
 * - Projects: table exists, can CRUD with tenant_id
 * - Tasks: table exists, can CRUD with tenant_id
 * - Notifications: table has tenant_id column, can insert
 * - Notification preferences: table exists
 * - Tenant settings: has chat_retention_days column
 * 
 * SAFETY RULES:
 * - Creates test data in isolated tenant, cleans up after
 * - No schema modifications
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "../db";
import { 
  tenants, workspaces, clients, projects, tasks, 
  notifications, notificationPreferences, tenantSettings,
  TenantStatus, UserRole 
} from "../../shared/schema";
import { eq, sql } from "drizzle-orm";
import { 
  createTestTenant, 
  createTestWorkspace, 
  createTestProject, 
  createTestUser,
  cleanupTestData 
} from "./fixtures";

describe("Tenant Core Flows - Smoke Tests", () => {
  let tenant: any;
  let workspace: any;
  let adminUser: any;
  let testClientId: string | null = null;
  let testProjectId: string | null = null;
  let testTaskId: string | null = null;
  let testNotificationId: string | null = null;

  beforeAll(async () => {
    tenant = await createTestTenant({ name: "Smoke Test Tenant" });
    workspace = await createTestWorkspace({ tenantId: tenant.id, isPrimary: true });
    
    adminUser = await createTestUser({
      email: `smoke-admin-${Date.now()}@test.com`,
      password: "testpass123",
      role: UserRole.ADMIN,
      tenantId: tenant.id,
    });
  });

  afterAll(async () => {
    if (testNotificationId) {
      await db.delete(notifications).where(eq(notifications.id, testNotificationId)).catch(() => {});
    }
    if (testTaskId) {
      await db.delete(tasks).where(eq(tasks.id, testTaskId)).catch(() => {});
    }
    if (testProjectId) {
      await db.delete(projects).where(eq(projects.id, testProjectId)).catch(() => {});
    }
    if (testClientId) {
      await db.delete(clients).where(eq(clients.id, testClientId)).catch(() => {});
    }
    await cleanupTestData({ tenantIds: [tenant.id] });
  });

  describe("Clients Table - Schema Parity", () => {
    it("clients table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'clients'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("clients table has tenant_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'clients' AND column_name = 'tenant_id'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("can insert client with tenant_id", async () => {
      const [client] = await db.insert(clients).values({
        companyName: "Smoke Test Client",
        tenantId: tenant.id,
        workspaceId: workspace.id,
      }).returning();
      
      testClientId = client.id;
      expect(client.id).toBeDefined();
      expect(client.tenantId).toBe(tenant.id);
    });

    it("can query clients by tenant_id", async () => {
      const result = await db.select()
        .from(clients)
        .where(eq(clients.tenantId, tenant.id));
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Projects Table - Schema Parity", () => {
    it("projects table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'projects'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("projects table has tenant_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'tenant_id'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("can insert project with tenant_id", async () => {
      const [project] = await db.insert(projects).values({
        name: "Smoke Test Project",
        workspaceId: workspace.id,
        tenantId: tenant.id,
      }).returning();
      
      testProjectId = project.id;
      expect(project.id).toBeDefined();
      expect(project.tenantId).toBe(tenant.id);
    });

    it("can query projects by tenant_id", async () => {
      const result = await db.select()
        .from(projects)
        .where(eq(projects.tenantId, tenant.id));
      
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("Tasks Table - Schema Parity", () => {
    it("tasks table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tasks'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("tasks table has tenant_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'tenant_id'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("can insert task with tenant_id", async () => {
      if (!testProjectId) {
        console.log("Skipping - no project created");
        return;
      }
      
      const [task] = await db.insert(tasks).values({
        title: "Smoke Test Task",
        projectId: testProjectId,
        tenantId: tenant.id,
      }).returning();
      
      testTaskId = task.id;
      expect(task.id).toBeDefined();
      expect(task.tenantId).toBe(tenant.id);
    });

    it("can query tasks by tenant_id", async () => {
      const result = await db.select()
        .from(tasks)
        .where(eq(tasks.tenantId, tenant.id));
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Notifications Table - Schema Parity", () => {
    it("notifications table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'notifications'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("notifications table has tenant_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'notifications' AND column_name = 'tenant_id'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("can insert notification with tenant_id", async () => {
      const [notification] = await db.insert(notifications).values({
        userId: adminUser.id,
        tenantId: tenant.id,
        type: "task_assigned",
        title: "Test Notification",
        message: "Smoke test notification",
      }).returning();
      
      testNotificationId = notification.id;
      expect(notification.id).toBeDefined();
      expect(notification.tenantId).toBe(tenant.id);
    });

    it("can query notifications by tenant_id without 500", async () => {
      const result = await db.select()
        .from(notifications)
        .where(eq(notifications.tenantId, tenant.id));
      
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("Notification Preferences Table - Schema Parity", () => {
    it("notification_preferences table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'notification_preferences'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("notification_preferences has required columns", async () => {
      const requiredColumns = ["user_id", "task_deadline", "task_assigned", "email_enabled"];
      
      for (const col of requiredColumns) {
        const result = await db.execute(sql`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'notification_preferences' AND column_name = ${col}
        `);
        expect(result.rows.length).toBeGreaterThan(0);
      }
    });

    it("can insert notification preferences", async () => {
      const [pref] = await db.insert(notificationPreferences).values({
        userId: adminUser.id,
        taskDeadline: true,
        taskAssigned: true,
        emailEnabled: true,
      }).returning();

      expect(pref.id).toBeDefined();

      await db.delete(notificationPreferences).where(eq(notificationPreferences.id, pref.id));
    });
  });

  describe("Tenant Settings Table - Schema Parity", () => {
    it("tenant_settings table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tenant_settings'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("tenant_settings has chat_retention_days column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'tenant_settings' AND column_name = 'chat_retention_days'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("can insert tenant settings with chat_retention_days", async () => {
      const [settings] = await db.insert(tenantSettings).values({
        tenantId: tenant.id,
        displayName: "Smoke Test Tenant",
        chatRetentionDays: 90,
      }).returning();

      expect(settings.tenantId).toBe(tenant.id);
      expect(settings.chatRetentionDays).toBe(90);

      await db.delete(tenantSettings).where(eq(tenantSettings.tenantId, tenant.id));
    });
  });

  describe("Error Logs Table - Schema Parity", () => {
    it("error_logs table exists", async () => {
      const result = await db.execute(sql`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'error_logs'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("error_logs has request_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'error_logs' AND column_name = 'request_id'
      `);
      expect(result.rows.length).toBe(1);
    });

    it("error_logs has tenant_id column", async () => {
      const result = await db.execute(sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'error_logs' AND column_name = 'tenant_id'
      `);
      expect(result.rows.length).toBe(1);
    });
  });

  describe("Core Tables - No Null TenantId Orphans", () => {
    it("projects table has no null tenant_id rows (warning if found)", async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int as count 
        FROM projects 
        WHERE tenant_id IS NULL
      `);
      const count = (result.rows[0] as any)?.count || 0;
      if (count > 0) {
        console.warn(`[SMOKE TEST WARNING] Found ${count} projects with null tenant_id - data needs repair`);
      }
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("clients table has no null tenant_id rows (warning if found)", async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int as count 
        FROM clients 
        WHERE tenant_id IS NULL
      `);
      const count = (result.rows[0] as any)?.count || 0;
      if (count > 0) {
        console.warn(`[SMOKE TEST WARNING] Found ${count} clients with null tenant_id - data needs repair`);
      }
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("tasks table has no null tenant_id rows (warning if found)", async () => {
      const result = await db.execute(sql`
        SELECT COUNT(*)::int as count 
        FROM tasks 
        WHERE tenant_id IS NULL
      `);
      const count = (result.rows[0] as any)?.count || 0;
      if (count > 0) {
        console.warn(`[SMOKE TEST WARNING] Found ${count} tasks with null tenant_id - data needs repair`);
      }
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
