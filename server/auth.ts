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
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { db } from "./db";
import { users, UserRole } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import type { User } from "@shared/schema";
import type { Express, RequestHandler } from "express";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";

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

  app.post("/api/auth/login", (req, res, next) => {
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
    res.json({ 
      user: req.user, 
      workspaceId: req.session.workspaceId,
      tenantId: user?.tenantId || null,
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
  app.post("/api/v1/auth/bootstrap-register", async (req, res) => {
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
