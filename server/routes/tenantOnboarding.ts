/**
 * Tenant Onboarding Routes
 * 
 * These routes are accessible by tenant admins even when the tenant is inactive.
 * They allow the tenant admin to complete onboarding and activate the tenant.
 * 
 * Routes:
 * - GET  /api/v1/tenant/me - Get current tenant info
 * - PATCH /api/v1/tenant/settings - Update tenant settings
 * - GET  /api/v1/tenant/onboarding/status - Get onboarding status
 * - POST /api/v1/tenant/onboarding/complete - Complete onboarding
 */

import { Router } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { db } from "../db";
import { tenants, TenantStatus, UserRole } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

// Middleware to ensure user is authenticated
function requireAuth(req: any, res: any, next: any) {
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
}

// Middleware to ensure user is tenant admin
function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user as any;
  if (!user.tenantId) {
    return res.status(403).json({ error: "No tenant context" });
  }
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_USER) {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

// =============================================================================
// GET /api/v1/tenant/me - Get current tenant info with settings
// =============================================================================

router.get("/me", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const tenantSettings = await storage.getTenantSettings(tenantId);

    res.json({
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        onboardedAt: tenant.onboardedAt,
        ownerUserId: tenant.ownerUserId,
      },
      tenantSettings: tenantSettings || null,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error fetching tenant info:", error);
    res.status(500).json({ error: "Failed to fetch tenant info" });
  }
});

// =============================================================================
// PATCH /api/v1/tenant/settings - Update tenant settings
// =============================================================================

const updateSettingsSchema = z.object({
  displayName: z.string().min(1).optional(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Must be valid hex color").optional().nullable(),
  supportEmail: z.string().email().optional().nullable(),
});

router.patch("/settings", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    const data = updateSettingsSchema.parse(req.body);

    // Ensure settings record exists
    let settings = await storage.getTenantSettings(tenantId);
    if (!settings) {
      const tenant = await storage.getTenant(tenantId);
      if (!tenant) {
        return res.status(404).json({ error: "Tenant not found" });
      }
      settings = await storage.createTenantSettings({
        tenantId,
        displayName: tenant.name,
      });
    }

    const updatedSettings = await storage.updateTenantSettings(tenantId, data);
    
    res.json({
      success: true,
      settings: updatedSettings,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("Error updating tenant settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// =============================================================================
// GET /api/v1/tenant/onboarding/status - Get onboarding progress
// =============================================================================

router.get("/onboarding/status", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    const settings = await storage.getTenantSettings(tenantId);

    // Determine onboarding steps completion
    const steps = {
      profile: !!(settings?.displayName),
      branding: !!(settings?.logoUrl || settings?.primaryColor),
      mailgun: false, // Will check appSettings for mailgun config
      completed: tenant.status === TenantStatus.ACTIVE && tenant.onboardedAt !== null,
    };

    res.json({
      status: tenant.status,
      onboardedAt: tenant.onboardedAt,
      ownerUserId: tenant.ownerUserId,
      steps,
      settings: settings ? {
        displayName: settings.displayName,
        logoUrl: settings.logoUrl,
        primaryColor: settings.primaryColor,
        supportEmail: settings.supportEmail,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    res.status(500).json({ error: "Failed to fetch onboarding status" });
  }
});

// =============================================================================
// POST /api/v1/tenant/onboarding/complete - Complete onboarding
// =============================================================================

router.post("/onboarding/complete", requireAuth, requireTenantAdmin, async (req, res) => {
  try {
    const user = req.user as any;
    const tenantId = user.tenantId;

    const tenant = await storage.getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    if (tenant.status === TenantStatus.ACTIVE && tenant.onboardedAt) {
      return res.json({
        success: true,
        message: "Tenant is already onboarded",
        tenant: {
          id: tenant.id,
          name: tenant.name,
          status: tenant.status,
          onboardedAt: tenant.onboardedAt,
        },
      });
    }

    // Update tenant: set status to active, onboardedAt to now, ownerUserId to current user
    const [updatedTenant] = await db.update(tenants)
      .set({
        status: TenantStatus.ACTIVE,
        onboardedAt: new Date(),
        ownerUserId: user.id,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId))
      .returning();

    res.json({
      success: true,
      message: "Onboarding completed successfully",
      tenant: {
        id: updatedTenant.id,
        name: updatedTenant.name,
        status: updatedTenant.status,
        onboardedAt: updatedTenant.onboardedAt,
        ownerUserId: updatedTenant.ownerUserId,
      },
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    res.status(500).json({ error: "Failed to complete onboarding" });
  }
});

export default router;
