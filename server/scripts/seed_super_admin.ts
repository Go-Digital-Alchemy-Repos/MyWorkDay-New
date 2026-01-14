#!/usr/bin/env tsx
/**
 * CLI Script: Seed Super Admin (Emergency Recovery)
 * 
 * Creates a super_user account in production for emergency recovery.
 * 
 * SAFETY GUARDS:
 * - Requires SEED_SUPER_ADMIN_ALLOWED=true to run
 * - Refuses if ANY super_user already exists
 * - Refuses if email exists with a different role (no auto-promote)
 * - Never logs password
 * 
 * Required env vars:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - SEED_SUPER_ADMIN_ALLOWED: Must be "true" to run
 *   - SEED_SUPER_ADMIN_EMAIL: Email for the super admin account
 *   - SEED_SUPER_ADMIN_PASSWORD: Password (min 8 characters)
 * 
 * Optional env vars:
 *   - SEED_SUPER_ADMIN_FIRSTNAME: First name (default: "Super")
 *   - SEED_SUPER_ADMIN_LASTNAME: Last name (default: "Admin")
 * 
 * Usage (Railway one-off):
 *   SEED_SUPER_ADMIN_ALLOWED=true \
 *   SEED_SUPER_ADMIN_EMAIL=admin@example.com \
 *   SEED_SUPER_ADMIN_PASSWORD=securepassword \
 *   npx tsx server/scripts/seed_super_admin.ts
 * 
 * npm script:
 *   npm run seed:superadmin
 */

import { db } from "../db";
import { users, UserRole } from "@shared/schema";
import { hashPassword } from "../auth";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

async function seedSuperAdmin(): Promise<void> {
  const requestId = randomUUID();
  console.log(`[seed-super-admin] Starting (requestId: ${requestId})`);

  // SAFETY GUARD: Require explicit env flag
  if (process.env.SEED_SUPER_ADMIN_ALLOWED !== "true") {
    console.error("[seed-super-admin] ERROR: SEED_SUPER_ADMIN_ALLOWED must be set to 'true'");
    console.error("[seed-super-admin] This is a safety guard to prevent accidental execution");
    process.exit(1);
  }

  // Get credentials from environment
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const firstName = process.env.SEED_SUPER_ADMIN_FIRSTNAME || "Super";
  const lastName = process.env.SEED_SUPER_ADMIN_LASTNAME || "Admin";

  // Validate required env vars
  if (!email) {
    console.error("[seed-super-admin] ERROR: SEED_SUPER_ADMIN_EMAIL is required");
    process.exit(1);
  }

  if (!password) {
    console.error("[seed-super-admin] ERROR: SEED_SUPER_ADMIN_PASSWORD is required");
    process.exit(1);
  }

  if (password.length < 8) {
    console.error("[seed-super-admin] ERROR: Password must be at least 8 characters");
    process.exit(1);
  }

  try {
    // SAFETY: Check if ANY super_user already exists
    const existingSuperUsers = await db.select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.role, UserRole.SUPER_USER))
      .limit(1);

    if (existingSuperUsers.length > 0) {
      console.error("[seed-super-admin] ERROR: A super admin already exists");
      console.error(`[seed-super-admin] Existing super admin: ${existingSuperUsers[0].email}`);
      console.error("[seed-super-admin] This script only works when NO super admin exists");
      process.exit(1);
    }

    // SAFETY: Check if email exists with a different role (do NOT auto-promote)
    const existingUser = await db.select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length > 0) {
      console.error(`[seed-super-admin] ERROR: User with email ${email} already exists`);
      console.error("[seed-super-admin] This script will NOT auto-promote existing users");
      console.error("[seed-super-admin] Use a different email or manually update the user role");
      process.exit(1);
    }

    // Hash password and create super user
    const passwordHash = await hashPassword(password);
    
    const [superUser] = await db.insert(users).values({
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      passwordHash,
      role: UserRole.SUPER_USER,
      isActive: true,
      tenantId: null,
    }).returning({ id: users.id, email: users.email });

    // Log to console (audit events require tenantId which is null for super admins)
    console.log(JSON.stringify({
      level: "info",
      component: "seed_super_admin",
      event: "seed_super_admin_created",
      userId: superUser.id,
      email: superUser.email,
      requestId,
      timestamp: new Date().toISOString(),
    }));

    console.log("[seed-super-admin] SUCCESS: Super admin created");
    console.log(`[seed-super-admin] User ID: ${superUser.id}`);
    console.log(`[seed-super-admin] Email: ${superUser.email}`);
    console.log("[seed-super-admin] You can now login at /login");
    
    process.exit(0);
  } catch (error) {
    console.error("[seed-super-admin] FAILED:", error);
    process.exit(1);
  }
}

seedSuperAdmin();
