/**
 * Authentication Module
 * 
 * Purpose: Session-based authentication using Passport.js + passport-local strategy.
 * 
 * Key Invariants:
 * - Sessions stored in PostgreSQL (user_sessions table) for multi-replica support
 * - First registered user automatically becomes Super Admin (server-determined)
 * - Password hashing uses scrypt with 64-byte output and random salt
 * 
 * Sharp Edges:
 * - SESSION_SECRET must be set in production (falls back to dev secret)
 * - Role field in registration is ignored for first user (always super_user)
 * - Never expose passwordHash in session or API responses
 */
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy, Profile as GoogleProfile } from "passport-google-oauth20";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { db } from "./db";
import { users, UserRole, platformInvitations, platformAuditEvents, invitations, tenants, workspaces, passwordResetTokens } from "@shared/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import { createHash } from "crypto";
import type { User } from "@shared/schema";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { 
  loginRateLimiter, 
  bootstrapRateLimiter, 
  inviteAcceptRateLimiter 
} from "./middleware/rateLimit";

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function comparePasswords(supplied: string, stored: string): Promise<boolean> {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

declare global {
  namespace Express {
    interface User extends Omit<import("@shared/schema").User, "passwordHash"> {}
  }
}

declare module "express-session" {
  interface SessionData {
    workspaceId?: string;
  }
}

export function setupAuth(app: Express): void {
  const PgSession = connectPgSimple(session);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Create session table manually if it doesn't exist
  pool.query(`
    CREATE TABLE IF NOT EXISTS "user_sessions" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("sid")
    );
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON "user_sessions" ("expire");
  `).catch(err => console.error("Session table creation error:", err));

  const sessionMiddleware = session({
    store: new PgSession({
      pool,
      tableName: "user_sessions",
      createTableIfMissing: false, // We create it manually above
    }),
    secret: process.env.SESSION_SECRET || "dasana-dev-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        try {
          const user = await storage.getUserByEmail(email);
          if (!user) {
            return done(null, false, { message: "Invalid email or password" });
          }
          if (!user.isActive) {
            return done(null, false, { message: "Account is deactivated" });
          }
          if (!user.passwordHash) {
            return done(null, false, { message: "Account requires password setup" });
          }
          const isValid = await comparePasswords(password, user.passwordHash);
          if (!isValid) {
            return done(null, false, { message: "Invalid email or password" });
          }
          const { passwordHash, ...userWithoutPassword } = user;
          return done(null, userWithoutPassword);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      const { passwordHash, ...userWithoutPassword } = user;
      done(null, userWithoutPassword);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/auth/login", loginRateLimiter, (req, res, next) => {
    passport.authenticate("local", async (err: Error | null, user: Express.User | false, info: { message: string }) => {
      if (err) {
        return res.status(500).json({ error: "Authentication error" });
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }
      req.logIn(user, async (loginErr) => {
        if (loginErr) {
          return res.status(500).json({ error: "Login failed" });
        }
        
        try {
          // Super users don't need workspace access - they manage the platform
          const isSuperUser = user.role === UserRole.SUPER_USER;
          
          let workspaceId: string | undefined = undefined;
          if (!isSuperUser) {
            const workspaces = await storage.getWorkspacesByUser(user.id);
            workspaceId = workspaces.length > 0 ? workspaces[0].id : undefined;
            
            if (!workspaceId) {
              req.logout(() => {});
              return res.status(403).json({ 
                error: "No workspace access. Please contact your administrator." 
              });
            }
          } else {
            // Super users can optionally have a workspace from impersonation
            const workspaces = await storage.getWorkspacesByUser(user.id);
            workspaceId = workspaces.length > 0 ? workspaces[0].id : undefined;
          }
          
          req.session.workspaceId = workspaceId;
          
          req.session.save((saveErr) => {
            if (saveErr) {
              console.error("Session save error:", saveErr);
            }
            return res.json({ user, workspaceId });
          });
        } catch (workspaceErr) {
          console.error("Workspace lookup error:", workspaceErr);
          req.logout(() => {});
          return res.status(500).json({ error: "Failed to resolve workspace" });
        }
      });
    })(req, res, next);
  });

  app.post("/api/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        return res.status(500).json({ error: "Logout failed" });
      }
      req.session.destroy((sessionErr) => {
        if (sessionErr) {
          console.error("Session destroy error:", sessionErr);
        }
        res.clearCookie("connect.sid");
        res.json({ success: true });
      });
    });
  });

  app.get("/api/auth/me", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = req.user as any;
    const session = req.session as any;
    
    // Debug logging for tenant context issues
    const debugTenantContext = process.env.DEBUG_TENANT_CONTEXT === "true";
    if (debugTenantContext) {
      console.log("[auth/me] Session ID:", req.sessionID);
      console.log("[auth/me] User ID:", user?.id);
      console.log("[auth/me] User email:", user?.email);
      console.log("[auth/me] User role:", user?.role);
      console.log("[auth/me] User tenantId:", user?.tenantId);
      console.log("[auth/me] Session keys:", Object.keys(session || {}));
    }
    
    // Include impersonation context if active
    const impersonation = session.isImpersonatingUser ? {
      isImpersonating: true,
      impersonatedUser: {
        id: session.impersonatedUserId,
        email: session.impersonatedUserEmail,
        role: session.impersonatedUserRole,
      },
      impersonatedTenant: {
        id: session.impersonatedTenantId,
        name: session.impersonatedTenantName,
      },
      originalSuperUser: {
        id: session.originalSuperUserId,
        email: session.originalSuperUserEmail,
      },
      startedAt: session.impersonationStartedAt,
    } : null;
    
    res.json({ 
      user: req.user, 
      workspaceId: req.session.workspaceId,
      tenantId: user?.tenantId || null,
      impersonation,
    });
  });

  /**
   * Registration endpoint with first-user bootstrap
   * The first user to register becomes a Super Admin automatically
   * Subsequent users get the default role (employee)
   * 
   * SECURITY: The role field is NEVER accepted from the client.
   * The role is determined automatically based on whether users exist.
   */
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      // Check if email is already in use
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: "Email already registered" });
      }

      // Atomic check: is this the first user? (with transaction for concurrency safety)
      const result = await db.transaction(async (tx) => {
        // Count existing users within transaction
        const countResult = await tx.execute(sql`SELECT COUNT(*)::int as count FROM users`);
        const userCount = (countResult.rows[0] as { count: number }).count;
        
        // Determine role: first user becomes super_user, others get employee
        const role = userCount === 0 ? UserRole.SUPER_USER : UserRole.EMPLOYEE;
        
        // Hash password
        const passwordHash = await hashPassword(password);
        
        // Create user
        const [newUser] = await tx.insert(users).values({
          email,
          name: `${firstName || ""} ${lastName || ""}`.trim() || email,
          firstName: firstName || null,
          lastName: lastName || null,
          passwordHash,
          role,
          isActive: true,
          tenantId: null,
        }).returning();

        return { user: newUser, isFirstUser: userCount === 0 };
      });

      // Don't expose password hash in response
      const { passwordHash: _, ...userWithoutPassword } = result.user;

      console.log(`[auth] User registered: ${email}, role: ${result.user.role}${result.isFirstUser ? " (first user - auto super admin)" : ""}`);

      res.status(201).json({ 
        user: userWithoutPassword,
        message: result.isFirstUser 
          ? "Account created. You are the first user and have been granted Super Admin access."
          : "Account created successfully."
      });
    } catch (error) {
      console.error("[auth] Registration error:", error);
      res.status(500).json({ error: "Registration failed" });
    }
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
};

/**
 * Bootstrap endpoints for first-user registration
 * These are separate from regular registration and only work when no users exist.
 */
export function setupBootstrapEndpoints(app: Express): void {
  /**
   * GET /api/v1/auth/bootstrap-status
   * Returns whether bootstrap registration is required (no users exist)
   */
  app.get("/api/v1/auth/bootstrap-status", async (_req, res) => {
    try {
      const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
      const userCount = (countResult.rows[0] as { count: number }).count;
      
      res.json({
        bootstrapRequired: userCount === 0,
      });
    } catch (error) {
      console.error("[auth] bootstrap-status error:", error);
      res.status(500).json({ error: "Failed to check bootstrap status" });
    }
  });

  /**
   * POST /api/v1/auth/bootstrap-register
   * Creates the first super admin account (only when no users exist)
   * Logs the user in immediately after creation.
   */
  app.post("/api/v1/auth/bootstrap-register", bootstrapRateLimiter, async (req, res) => {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({ 
          error: { code: "VALIDATION_ERROR", message: "Email and password are required" },
          code: "VALIDATION_ERROR",
          message: "Email and password are required"
        });
      }

      if (password.length < 8) {
        return res.status(400).json({ 
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }

      // Atomic check + create in transaction with SERIALIZABLE isolation for concurrency safety
      const result = await db.transaction(async (tx) => {
        // Set transaction isolation to SERIALIZABLE to prevent race conditions
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL SERIALIZABLE`);
        
        // Lock the users table to prevent concurrent bootstrap attempts
        await tx.execute(sql`LOCK TABLE users IN EXCLUSIVE MODE`);
        
        // Re-check user count inside transaction
        const countResult = await tx.execute(sql`SELECT COUNT(*)::int as count FROM users`);
        const userCount = (countResult.rows[0] as { count: number }).count;
        
        if (userCount > 0) {
          return { error: "REGISTRATION_DISABLED" };
        }

        // Check if email is already in use (shouldn't happen if count is 0, but be safe)
        const existingUsers = await tx.select({ id: users.id })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existingUsers.length > 0) {
          return { error: "EMAIL_EXISTS" };
        }

        // Hash password and create super user
        const passwordHash = await hashPassword(password);
        
        const [newUser] = await tx.insert(users).values({
          email,
          name: `${firstName || ""} ${lastName || ""}`.trim() || email,
          firstName: firstName || null,
          lastName: lastName || null,
          passwordHash,
          role: UserRole.SUPER_USER,
          isActive: true,
          tenantId: null,
        }).returning();

        return { user: newUser };
      });

      // Handle transaction results
      if ("error" in result) {
        if (result.error === "REGISTRATION_DISABLED") {
          return res.status(403).json({
            error: { code: "REGISTRATION_DISABLED", message: "Registration is disabled. Users already exist." },
            code: "REGISTRATION_DISABLED",
            message: "Registration is disabled. Users already exist."
          });
        }
        if (result.error === "EMAIL_EXISTS") {
          return res.status(409).json({
            error: { code: "CONFLICT", message: "Email already registered" },
            code: "CONFLICT",
            message: "Email already registered"
          });
        }
      }

      const { passwordHash: _, ...userWithoutPassword } = result.user!;

      // Log in the user immediately
      req.logIn(userWithoutPassword as Express.User, (loginErr) => {
        if (loginErr) {
          console.error("[auth] bootstrap login error:", loginErr);
          return res.status(201).json({ 
            user: userWithoutPassword,
            message: "Account created but auto-login failed. Please log in manually.",
            autoLoginFailed: true,
          });
        }

        // Save session
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }

          // Log bootstrap event
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "bootstrap_register_created_super_admin",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            requestId: (req as any).requestId || "unknown",
            timestamp: new Date().toISOString(),
          }));

          res.status(201).json({ 
            user: userWithoutPassword,
            message: "Super Admin account created successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] bootstrap-register error:", error);
      res.status(500).json({ 
        error: { code: "INTERNAL_ERROR", message: "Registration failed" },
        code: "INTERNAL_ERROR",
        message: "Registration failed"
      });
    }
  });
}

/**
 * Platform invite endpoints for onboarding new platform administrators.
 * Allows invited admins to verify their invite token and set their password.
 */
export function setupPlatformInviteEndpoints(app: Express): void {
  /**
   * GET /api/v1/auth/platform-invite/verify
   * Verifies a platform invite token and returns the target user's email.
   * Does not require authentication.
   */
  app.get("/api/v1/auth/platform-invite/verify", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          code: "VALIDATION_ERROR",
          message: "Token is required"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(platformInvitations)
        .where(eq(platformInvitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          error: { code: "INVALID_TOKEN", message: "Invalid or expired invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid or expired invite link"
        });
      }
      
      // Check if already used
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      // Check if revoked
      if (invite.status === "revoked") {
        return res.status(410).json({
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      // Check if expired
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Get target user info
      const [targetUser] = invite.targetUserId ? await db.select({
        id: users.id,
        email: users.email,
        firstName: users.firstName,
        lastName: users.lastName,
      }).from(users)
        .where(eq(users.id, invite.targetUserId)) : [];
      
      res.json({
        valid: true,
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        role: "super_user",
        targetUser: targetUser || null,
      });
    } catch (error) {
      console.error("[auth] platform-invite/verify error:", error);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to verify invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to verify invite"
      });
    }
  });

  /**
   * POST /api/v1/auth/platform-invite/accept
   * Accepts a platform invite, sets the user's password, and logs them in.
   */
  app.post("/api/v1/auth/platform-invite/accept", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Token and password are required" },
          code: "VALIDATION_ERROR",
          message: "Token and password are required"
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(platformInvitations)
        .where(eq(platformInvitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          error: { code: "INVALID_TOKEN", message: "Invalid invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid invite link"
        });
      }
      
      // Validate invite status
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      if (invite.status === "revoked") {
        return res.status(410).json({
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      if (!invite.targetUserId) {
        return res.status(400).json({
          error: { code: "INVALID_INVITE", message: "This invite is not linked to a user" },
          code: "INVALID_INVITE",
          message: "This invite is not linked to a user"
        });
      }
      
      // Update user with password hash
      const passwordHash = await hashPassword(password);
      
      const [updatedUser] = await db.update(users)
        .set({ passwordHash })
        .where(eq(users.id, invite.targetUserId))
        .returning();
      
      // Mark invite as accepted
      await db.update(platformInvitations)
        .set({ status: "accepted", usedAt: new Date() })
        .where(eq(platformInvitations.id, invite.id));
      
      // Log audit event
      await db.insert(platformAuditEvents).values({
        actorUserId: invite.targetUserId,
        targetUserId: invite.targetUserId,
        eventType: "platform_admin_invite_accepted",
        message: `Platform admin invite accepted for ${invite.email}`,
        metadata: { inviteId: invite.id },
      });
      
      // Log in the user
      const { passwordHash: _, ...userWithoutPassword } = updatedUser;
      
      req.logIn(userWithoutPassword as Express.User, (loginErr) => {
        if (loginErr) {
          console.error("[auth] platform-invite login error:", loginErr);
          return res.status(200).json({
            success: true,
            user: userWithoutPassword,
            message: "Password set successfully. Please log in.",
            autoLoginFailed: true,
          });
        }
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }
          
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "platform_invite_accepted",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            timestamp: new Date().toISOString(),
          }));
          
          res.json({
            success: true,
            user: userWithoutPassword,
            message: "Account activated successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] platform-invite/accept error:", error);
      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Failed to accept invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to accept invite"
      });
    }
  });
}

/**
 * Tenant invite endpoints for onboarding new tenant users.
 * Allows invited users to verify their invite token and set their password.
 * These are PUBLIC endpoints - no authentication required.
 */
export function setupTenantInviteEndpoints(app: Express): void {
  /**
   * GET /api/v1/public/invites/validate
   * Validates a tenant invite token and returns safe preview info.
   * Does not require authentication.
   */
  app.get("/api/v1/public/invites/validate", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          code: "VALIDATION_ERROR",
          message: "Token is required"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite with tenant and workspace info
      const [invite] = await db.select({
        id: invitations.id,
        email: invitations.email,
        role: invitations.role,
        status: invitations.status,
        expiresAt: invitations.expiresAt,
        usedAt: invitations.usedAt,
        tenantId: invitations.tenantId,
        workspaceId: invitations.workspaceId,
      })
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid or expired invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid or expired invite link"
        });
      }
      
      // Check if already used
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      // Check if revoked
      if (invite.status === "revoked") {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      // Check if expired
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Get tenant name
      let tenantName = "Unknown Organization";
      if (invite.tenantId) {
        const [tenant] = await db.select({ name: tenants.name })
          .from(tenants)
          .where(eq(tenants.id, invite.tenantId))
          .limit(1);
        if (tenant) {
          tenantName = tenant.name;
        }
      }
      
      // Get workspace name
      let workspaceName = "Unknown Workspace";
      const [workspace] = await db.select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, invite.workspaceId))
        .limit(1);
      if (workspace) {
        workspaceName = workspace.name;
      }
      
      // Mask email for privacy (show first 2 chars + domain)
      const [localPart, domain] = invite.email.split("@");
      const maskedEmail = localPart.length > 2 
        ? `${localPart.substring(0, 2)}***@${domain}`
        : `***@${domain}`;
      
      res.json({
        ok: true,
        emailMasked: maskedEmail,
        email: invite.email, // Full email for form pre-fill
        tenantName,
        workspaceName,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] tenant-invite/validate error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to validate invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to validate invite"
      });
    }
  });

  /**
   * POST /api/v1/public/invites/accept
   * Accepts a tenant invite, creates/activates user, sets password, and logs them in.
   * Does not require authentication.
   */
  app.post("/api/v1/public/invites/accept", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, password, firstName, lastName } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token and password are required" },
          code: "VALIDATION_ERROR",
          message: "Token and password are required"
        });
      }
      
      if (password.length < 8) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          code: "VALIDATION_ERROR",
          message: "Password must be at least 8 characters"
        });
      }
      
      // Hash the token to compare with stored hash
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      // Find the invite
      const [invite] = await db.select()
        .from(invitations)
        .where(eq(invitations.tokenHash, tokenHash))
        .limit(1);
      
      if (!invite) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid invite link" },
          code: "INVALID_TOKEN",
          message: "Invalid invite link"
        });
      }
      
      // Validate invite status
      if (invite.status === "accepted" || invite.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This invite has already been used" },
          code: "TOKEN_ALREADY_USED",
          message: "This invite has already been used"
        });
      }
      
      if (invite.status === "revoked") {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_REVOKED", message: "This invite has been revoked" },
          code: "TOKEN_REVOKED",
          message: "This invite has been revoked"
        });
      }
      
      if (new Date() > invite.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This invite has expired" },
          code: "TOKEN_EXPIRED",
          message: "This invite has expired"
        });
      }
      
      // Hash the password
      const passwordHash = await hashPassword(password);
      
      // Check if user with this email already exists
      let user = await storage.getUserByEmail(invite.email);
      
      if (user) {
        // Update existing user with password and activate
        const [updatedUser] = await db.update(users)
          .set({
            passwordHash,
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            isActive: true,
            mustChangePasswordOnNextLogin: false,
            updatedAt: new Date(),
          })
          .where(eq(users.id, user.id))
          .returning();
        user = updatedUser;
      } else {
        // Create new user
        const [newUser] = await db.insert(users)
          .values({
            email: invite.email,
            passwordHash,
            firstName: firstName || null,
            lastName: lastName || null,
            role: invite.role === "admin" ? UserRole.ADMIN : UserRole.EMPLOYEE,
            tenantId: invite.tenantId,
            isActive: true,
            mustChangePasswordOnNextLogin: false,
          })
          .returning();
        user = newUser;
        
        // Add user to workspace
        await storage.addUserToWorkspace(user.id, invite.workspaceId);
      }
      
      // Mark invite as accepted
      await db.update(invitations)
        .set({
          status: "accepted",
          usedAt: new Date(),
        })
        .where(eq(invitations.id, invite.id));
      
      // Log the user in (establish session)
      const { passwordHash: _, ...userWithoutPassword } = user;
      
      req.login(userWithoutPassword, (loginErr) => {
        if (loginErr) {
          console.error("[auth] tenant-invite login error:", loginErr);
          return res.json({
            ok: true,
            success: true,
            user: userWithoutPassword,
            message: "Account activated. Please log in manually.",
            autoLoginFailed: true,
          });
        }
        
        // Set workspace in session
        req.session.workspaceId = invite.workspaceId;
        
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("[auth] session save error:", saveErr);
          }
          
          console.log(JSON.stringify({
            level: "info",
            component: "auth",
            event: "tenant_invite_accepted",
            userId: userWithoutPassword.id,
            email: userWithoutPassword.email,
            tenantId: invite.tenantId,
            workspaceId: invite.workspaceId,
            timestamp: new Date().toISOString(),
          }));
          
          res.json({
            ok: true,
            success: true,
            user: userWithoutPassword,
            message: "Account activated successfully.",
            autoLoginFailed: false,
          });
        });
      });
    } catch (error) {
      console.error("[auth] tenant-invite/accept error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to accept invite" },
        code: "INTERNAL_ERROR",
        message: "Failed to accept invite"
      });
    }
  });
}

/**
 * Password Reset Endpoints
 * 
 * Implements forgot password flow with optional email delivery.
 * - POST /api/v1/auth/forgot-password - Request a password reset
 * - POST /api/v1/auth/reset-password - Reset password with token
 * - GET /api/v1/auth/reset-password/validate - Validate a reset token
 * 
 * Security:
 * - Tokens are hashed before storage (SHA-256)
 * - Rate limited to prevent abuse
 * - Generic response to prevent email enumeration
 * - Short token expiry (30 minutes)
 */
export function setupPasswordResetEndpoints(app: Express): void {
  /**
   * POST /api/v1/auth/forgot-password
   * Request a password reset link. Always returns success to prevent email enumeration.
   */
  app.post("/api/v1/auth/forgot-password", loginRateLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email || typeof email !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Email is required" },
          message: "Email is required"
        });
      }
      
      // Always respond with success to prevent email enumeration
      const genericResponse = {
        ok: true,
        message: "If an account exists with that email, you will receive password reset instructions."
      };
      
      // Find user by email
      const user = await storage.getUserByEmail(email.toLowerCase().trim());
      
      if (!user) {
        // User doesn't exist, but we don't reveal this
        console.log(`[auth] forgot-password: no user found for ${email}`);
        return res.json(genericResponse);
      }
      
      if (!user.isActive) {
        // User is deactivated, don't reveal this
        console.log(`[auth] forgot-password: user ${email} is deactivated`);
        return res.json(genericResponse);
      }
      
      // Generate reset token
      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      
      // Store token hash
      await db.insert(passwordResetTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
        createdByUserId: null, // User-initiated
      });
      
      // Generate reset URL
      const appPublicUrl = process.env.APP_PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${appPublicUrl}/auth/reset-password?token=${token}`;
      
      // Log for audit
      console.log(JSON.stringify({
        level: "info",
        component: "auth",
        event: "password_reset_requested",
        userId: user.id,
        email: user.email,
        timestamp: new Date().toISOString(),
      }));
      
      // TODO: Send email via Mailgun if configured
      // For now, we just log the reset URL (in development only)
      if (process.env.NODE_ENV !== "production") {
        console.log(`[auth] Password reset URL for ${email}: ${resetUrl}`);
      }
      
      res.json(genericResponse);
    } catch (error) {
      console.error("[auth] forgot-password error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to process request" },
        message: "Failed to process request"
      });
    }
  });

  /**
   * GET /api/v1/auth/reset-password/validate
   * Validate a password reset token before showing the form.
   */
  app.get("/api/v1/auth/reset-password/validate", async (req, res) => {
    try {
      const { token } = req.query;
      
      if (!token || typeof token !== "string") {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token is required" },
          message: "Token is required"
        });
      }
      
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (!resetToken) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid or expired reset link" },
          message: "Invalid or expired reset link"
        });
      }
      
      if (resetToken.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This reset link has already been used" },
          message: "This reset link has already been used"
        });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This reset link has expired" },
          message: "This reset link has expired"
        });
      }
      
      // Get user email (masked)
      const [user] = await db.select({ email: users.email })
        .from(users)
        .where(eq(users.id, resetToken.userId))
        .limit(1);
      
      if (!user) {
        return res.status(404).json({
          ok: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          message: "User not found"
        });
      }
      
      // Mask email
      const [localPart, domain] = user.email.split("@");
      const maskedEmail = localPart.length > 2 
        ? `${localPart.substring(0, 2)}***@${domain}`
        : `***@${domain}`;
      
      res.json({
        ok: true,
        emailMasked: maskedEmail,
        expiresAt: resetToken.expiresAt.toISOString(),
      });
    } catch (error) {
      console.error("[auth] reset-password/validate error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to validate token" },
        message: "Failed to validate token"
      });
    }
  });

  /**
   * POST /api/v1/auth/reset-password
   * Reset password using a valid token.
   */
  app.post("/api/v1/auth/reset-password", inviteAcceptRateLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      
      if (!token || !newPassword) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Token and new password are required" },
          message: "Token and new password are required"
        });
      }
      
      if (newPassword.length < 8) {
        return res.status(400).json({
          ok: false,
          error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
          message: "Password must be at least 8 characters"
        });
      }
      
      const tokenHash = createHash("sha256").update(token).digest("hex");
      
      const [resetToken] = await db.select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1);
      
      if (!resetToken) {
        return res.status(404).json({
          ok: false,
          error: { code: "INVALID_TOKEN", message: "Invalid reset link" },
          message: "Invalid reset link"
        });
      }
      
      if (resetToken.usedAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_ALREADY_USED", message: "This reset link has already been used" },
          message: "This reset link has already been used"
        });
      }
      
      if (new Date() > resetToken.expiresAt) {
        return res.status(410).json({
          ok: false,
          error: { code: "TOKEN_EXPIRED", message: "This reset link has expired" },
          message: "This reset link has expired"
        });
      }
      
      // Hash the new password
      const passwordHash = await hashPassword(newPassword);
      
      // Update user password and clear mustChangePasswordOnNextLogin
      const [updatedUser] = await db.update(users)
        .set({
          passwordHash,
          mustChangePasswordOnNextLogin: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, resetToken.userId))
        .returning();
      
      if (!updatedUser) {
        return res.status(404).json({
          ok: false,
          error: { code: "USER_NOT_FOUND", message: "User not found" },
          message: "User not found"
        });
      }
      
      // Mark token as used
      await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));
      
      // Log for audit
      console.log(JSON.stringify({
        level: "info",
        component: "auth",
        event: "password_reset_completed",
        userId: updatedUser.id,
        email: updatedUser.email,
        initiatedBy: resetToken.createdByUserId ? "admin" : "user",
        timestamp: new Date().toISOString(),
      }));
      
      res.json({
        ok: true,
        message: "Password reset successfully. You can now log in with your new password."
      });
    } catch (error) {
      console.error("[auth] reset-password error:", error);
      res.status(500).json({
        ok: false,
        error: { code: "INTERNAL_ERROR", message: "Failed to reset password" },
        message: "Failed to reset password"
      });
    }
  });
}

/**
 * Google OAuth Authentication Setup
 * 
 * SSO Configuration Resolution Order:
 * 1. Database configuration (tenant_integrations with tenantId=NULL)
 * 2. Environment variables fallback (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
 * 
 * Account Linking Rules:
 * - If user exists with same email AND email is verified by Google → auto-link and login
 * - If user exists but already linked to different Google ID → block with error
 * - If no user exists → check if bootstrap required or invite exists
 * 
 * The SSO config is checked on each request to support runtime configuration changes.
 */
import { getSsoGoogleConfig, getSsoProvidersStatus, type SsoGoogleConfig } from "./services/ssoConfig";

let googleStrategyInitialized = false;
let cachedGoogleConfig: SsoGoogleConfig | null = null;
let googleConfigCacheTime = 0;
const GOOGLE_CONFIG_CACHE_TTL = 60000; // 1 minute cache

async function getGoogleSsoConfig(): Promise<SsoGoogleConfig | null> {
  const now = Date.now();
  if (cachedGoogleConfig && (now - googleConfigCacheTime) < GOOGLE_CONFIG_CACHE_TTL) {
    return cachedGoogleConfig;
  }
  cachedGoogleConfig = await getSsoGoogleConfig();
  googleConfigCacheTime = now;
  return cachedGoogleConfig;
}

function initializeGoogleStrategy(config: SsoGoogleConfig): void {
  if (googleStrategyInitialized) {
    passport.unuse("google");
  }
  
  console.log(`[auth] Initializing Google OAuth with config from ${config.source}, redirect: ${config.redirectUri}`);

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.clientId,
        clientSecret: config.clientSecret,
        callbackURL: config.redirectUri,
        scope: ["email", "profile"],
      },
      async (_accessToken, _refreshToken, profile: GoogleProfile, done) => {
        try {
          const googleId = profile.id;
          const email = profile.emails?.[0]?.value;
          const emailVerified = profile.emails?.[0]?.verified ?? (profile._json as any)?.email_verified;
          const displayName = profile.displayName || "";
          const firstName = profile.name?.givenName || displayName.split(" ")[0] || "";
          const lastName = profile.name?.familyName || displayName.split(" ").slice(1).join(" ") || "";
          const avatarUrl = profile.photos?.[0]?.value || null;

          if (!email) {
            return done(null, false, { message: "No email provided by Google" });
          }

          // Check if user exists by googleId
          const [existingByGoogleId] = await db.select()
            .from(users)
            .where(eq(users.googleId, googleId))
            .limit(1);

          if (existingByGoogleId) {
            if (!existingByGoogleId.isActive) {
              return done(null, false, { message: "Account is deactivated" });
            }
            const { passwordHash, ...userWithoutPassword } = existingByGoogleId;
            return done(null, userWithoutPassword);
          }

          // Check if user exists by email
          const existingByEmail = await storage.getUserByEmail(email);

          if (existingByEmail) {
            if (existingByEmail.googleId && existingByEmail.googleId !== googleId) {
              return done(null, false, { 
                message: "This email is already linked to a different Google account. Please contact support." 
              });
            }

            if (!existingByEmail.isActive) {
              return done(null, false, { message: "Account is deactivated" });
            }

            if (!emailVerified) {
              return done(null, false, { 
                message: "Cannot link Google account - email not verified by Google" 
              });
            }

            // Link Google ID to existing user
            const [updatedUser] = await db.update(users)
              .set({ 
                googleId, 
                avatarUrl: existingByEmail.avatarUrl || avatarUrl,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingByEmail.id))
              .returning();

            console.log(`[auth] Linked Google account to existing user: ${email}`);
            
            const { passwordHash, ...userWithoutPassword } = updatedUser;
            return done(null, userWithoutPassword);
          }

          // No existing user - check if we can create one
          // Check if bootstrap is required (first user)
          const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM users`);
          const userCount = (countResult.rows[0] as { count: number }).count;

          if (userCount === 0) {
            // First user - create as super admin
            const [newUser] = await db.insert(users).values({
              email,
              name: displayName || email,
              firstName: firstName || null,
              lastName: lastName || null,
              googleId,
              avatarUrl,
              role: UserRole.SUPER_USER,
              isActive: true,
              tenantId: null,
            }).returning();

            console.log(`[auth] Created first user (Super Admin) via Google: ${email}`);
            
            const { passwordHash, ...userWithoutPassword } = newUser;
            return done(null, userWithoutPassword);
          }

          // Not the first user - check for pending invite
          // For now, block new user creation without invite
          return done(null, false, { 
            message: "No account found. Please contact your administrator to request access." 
          });

        } catch (error) {
          console.error("[auth] Google OAuth error:", error);
          return done(error as Error);
        }
      }
    )
  );
  
  googleStrategyInitialized = true;
}

export function setupGoogleAuth(app: Express): void {
  // GET /api/v1/auth/google - Redirect to Google OAuth consent screen
  // Dynamically checks SSO config on each request
  app.get("/api/v1/auth/google", async (req, res, next) => {
    try {
      const config = await getGoogleSsoConfig();
      
      if (!config || !config.enabled) {
        return res.status(503).json({ 
          error: { 
            code: "SSO_DISABLED", 
            message: "Google authentication is not configured" 
          } 
        });
      }
      
      // Initialize or reinitialize strategy if needed
      initializeGoogleStrategy(config);
      
      // Proceed with passport authentication
      passport.authenticate("google", { scope: ["email", "profile"] })(req, res, next);
    } catch (error) {
      console.error("[auth] Error initializing Google auth:", error);
      res.status(500).json({ error: { code: "AUTH_ERROR", message: "Failed to initialize authentication" } });
    }
  });

  // GET /api/v1/auth/google/callback - Handle OAuth callback
  app.get("/api/v1/auth/google/callback", async (req, res, next) => {
    try {
      const config = await getGoogleSsoConfig();
      
      if (!config || !config.enabled) {
        return res.redirect(`/login?error=${encodeURIComponent("Google authentication is not configured")}`);
      }
      
      // Ensure strategy is initialized
      if (!googleStrategyInitialized) {
        initializeGoogleStrategy(config);
      }
      
      passport.authenticate("google", async (err: Error | null, user: Express.User | false, info: { message: string }) => {
        if (err) {
          console.error("[auth] Google callback error:", err);
          return res.redirect(`/login?error=${encodeURIComponent("Authentication failed")}`);
        }

        if (!user) {
          const errorMessage = info?.message || "Google authentication failed";
          console.log("[auth] Google auth rejected:", errorMessage);
          return res.redirect(`/login?error=${encodeURIComponent(errorMessage)}`);
        }

        req.logIn(user, async (loginErr) => {
          if (loginErr) {
            console.error("[auth] Google login error:", loginErr);
            return res.redirect(`/login?error=${encodeURIComponent("Login failed")}`);
          }

          try {
            const isSuperUser = user.role === UserRole.SUPER_USER;
            
            let workspaceId: string | undefined = undefined;
            if (!isSuperUser) {
              const workspacesList = await storage.getWorkspacesByUser(user.id);
              workspaceId = workspacesList.length > 0 ? workspacesList[0].id : undefined;
              
              if (!workspaceId) {
                req.logout(() => {});
                return res.redirect(`/login?error=${encodeURIComponent("No workspace access. Please contact your administrator.")}`);
              }
            } else {
              const workspacesList = await storage.getWorkspacesByUser(user.id);
              workspaceId = workspacesList.length > 0 ? workspacesList[0].id : undefined;
            }
            
            req.session.workspaceId = workspaceId;

            req.session.save((saveErr) => {
              if (saveErr) {
                console.error("[auth] Session save error:", saveErr);
              }

              console.log(`[auth] Google login successful: ${user.email}, role: ${user.role}`);
              
              // Redirect based on role
              if (isSuperUser) {
                res.redirect("/super-admin/dashboard");
              } else {
                res.redirect("/");
              }
            });
          } catch (workspaceErr) {
            console.error("[auth] Workspace lookup error:", workspaceErr);
            req.logout(() => {});
            res.redirect(`/login?error=${encodeURIComponent("Failed to resolve workspace")}`);
          }
        });
      })(req, res, next);
    } catch (error) {
      console.error("[auth] Error in Google callback:", error);
      res.redirect(`/login?error=${encodeURIComponent("Authentication error")}`);
    }
  });

  // GET /api/v1/auth/google/status - Check if Google auth is enabled (dynamic)
  app.get("/api/v1/auth/google/status", async (_req, res) => {
    try {
      const config = await getGoogleSsoConfig();
      res.json({ 
        enabled: !!config?.enabled,
        source: config?.source || null,
      });
    } catch (error) {
      console.error("[auth] Error checking Google status:", error);
      res.json({ enabled: false });
    }
  });
  
  // GET /api/v1/auth/sso/providers - Get all SSO providers status
  app.get("/api/v1/auth/sso/providers", async (_req, res) => {
    try {
      const status = await getSsoProvidersStatus();
      res.json(status);
    } catch (error) {
      console.error("[auth] Error getting SSO providers status:", error);
      res.status(500).json({ error: "Failed to get SSO providers status" });
    }
  });

  // POST /api/v1/auth/google/unlink - Unlink Google from account
  app.post("/api/v1/auth/google/unlink", requireAuth, async (req, res) => {
    try {
      const user = req.user as Express.User;
      
      // Check if user has another login method (password)
      const fullUser = await storage.getUser(user.id);
      if (!fullUser) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!fullUser.passwordHash) {
        return res.status(400).json({ 
          error: "Cannot unlink Google - no password set. Please set a password first." 
        });
      }

      if (!fullUser.googleId) {
        return res.status(400).json({ error: "No Google account linked" });
      }

      await db.update(users)
        .set({ googleId: null, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      console.log(`[auth] Unlinked Google account from user: ${user.email}`);
      
      res.json({ success: true, message: "Google account unlinked" });
    } catch (error) {
      console.error("[auth] Google unlink error:", error);
      res.status(500).json({ error: "Failed to unlink Google account" });
    }
  });
}
