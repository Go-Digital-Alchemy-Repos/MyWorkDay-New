import { db } from "./db";
import { users, workspaces, workspaceMembers } from "@shared/schema";
import { hashPassword } from "./auth";
import { eq } from "drizzle-orm";

const ADMIN_EMAIL = "admin@dasana.com";
const ADMIN_PASSWORD = "admin123";
const DEFAULT_WORKSPACE_ID = "demo-workspace-id";

export async function bootstrapAdminUser(): Promise<void> {
  try {
    const existingAdmin = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
    
    if (existingAdmin.length > 0) {
      console.log("[bootstrap] Admin user already exists");
      return;
    }

    console.log("[bootstrap] Creating admin user...");
    
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    
    const [admin] = await db.insert(users).values({
      id: "admin-user-id",
      email: ADMIN_EMAIL,
      name: "Admin User",
      firstName: "Admin",
      lastName: "User",
      passwordHash,
      role: "admin",
      isActive: true,
    }).returning();

    const existingWorkspace = await db.select().from(workspaces).where(eq(workspaces.id, DEFAULT_WORKSPACE_ID)).limit(1);
    
    if (existingWorkspace.length === 0) {
      console.log("[bootstrap] Creating default workspace...");
      await db.insert(workspaces).values({
        id: DEFAULT_WORKSPACE_ID,
        name: "DASANA Workspace",
        createdBy: admin.id,
      });

      await db.insert(workspaceMembers).values({
        workspaceId: DEFAULT_WORKSPACE_ID,
        userId: admin.id,
        role: "owner",
        status: "active",
      });
    } else {
      const existingMembership = await db.select().from(workspaceMembers)
        .where(eq(workspaceMembers.userId, admin.id))
        .limit(1);
      
      if (existingMembership.length === 0) {
        await db.insert(workspaceMembers).values({
          workspaceId: DEFAULT_WORKSPACE_ID,
          userId: admin.id,
          role: "owner",
          status: "active",
        });
      }
    }

    console.log("[bootstrap] Admin user created successfully");
    console.log("[bootstrap] Login: admin@dasana.com / admin123");
  } catch (error) {
    console.error("[bootstrap] Error creating admin user:", error);
  }
}
