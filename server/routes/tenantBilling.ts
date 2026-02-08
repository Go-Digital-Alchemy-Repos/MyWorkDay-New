import { Router } from "express";
import { db } from "../db";
import { tenants, systemSettings, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { UserRole } from "@shared/schema";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";
import { AppError, handleRouteError } from "../lib/errors";
import Stripe from "stripe";

const router = Router();

function requireTenantAdmin(req: any, res: any, next: any) {
  const user = req.user;
  if (!user) {
    throw AppError.unauthorized("Authentication required");
  }
  
  const isSuperUser = user.role === UserRole.SUPER_USER;
  const isAdmin = user.role === UserRole.ADMIN;
  
  if (!isSuperUser && !isAdmin) {
    throw AppError.forbidden("Admin access required");
  }
  
  next();
}

async function getStripeClient(): Promise<Stripe | null> {
  const [settings] = await db.select().from(systemSettings).limit(1);
  
  if (!settings?.stripeSecretKeyEncrypted || !isEncryptionAvailable()) {
    return null;
  }
  
  try {
    const secretKey = decryptValue(settings.stripeSecretKeyEncrypted);
    return new Stripe(secretKey, { apiVersion: "2025-12-15.clover" });
  } catch (error) {
    console.error("Failed to initialize Stripe client:", error);
    return null;
  }
}

async function getTenantForBilling(req: any): Promise<{ tenantId: string; tenant: any } | null> {
  const user = req.user;
  const isSuperUser = user?.role === UserRole.SUPER_USER;
  
  let tenantId: string;
  
  if (isSuperUser) {
    tenantId = req.headers["x-tenant-id"] as string;
    if (!tenantId) {
      return null;
    }
  } else {
    tenantId = user?.tenantId;
    if (!tenantId) {
      return null;
    }
  }
  
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) {
    return null;
  }
  
  return { tenantId, tenant };
}

router.get("/billing", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      throw AppError.badRequest("Tenant context required");
    }
    
    const { tenant } = tenantData;
    
    res.json({
      billingEmail: tenant.billingEmail || null,
      hasPaymentMethod: !!tenant.stripeDefaultPaymentMethodId,
      stripeCustomerIdPresent: !!tenant.stripeCustomerId,
      billingStatus: tenant.billingStatus || "none",
      invoicesEnabled: !!tenant.stripeCustomerId,
    });
  } catch (error) {
    handleRouteError(res, error, "billing.get", req);
  }
});

router.post("/billing/initialize", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      throw AppError.badRequest("Tenant context required");
    }
    
    const { tenantId, tenant } = tenantData;
    
    if (tenant.stripeCustomerId) {
      return res.json({
        success: true,
        message: "Billing already initialized",
        billingEmail: tenant.billingEmail || null,
        hasPaymentMethod: !!tenant.stripeDefaultPaymentMethodId,
        stripeCustomerIdPresent: true,
        billingStatus: tenant.billingStatus || "none",
      });
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      throw AppError.badRequest("Stripe is not configured. Please contact the platform administrator.");
    }
    
    const [tenantSettings] = await db.select()
      .from(require("@shared/schema").tenantSettings)
      .where(eq(require("@shared/schema").tenantSettings.tenantId, tenantId));
    
    const ownerEmail = req.user?.email || tenant.billingEmail;
    
    const customer = await stripe.customers.create({
      name: tenantSettings?.displayName || tenant.name,
      email: ownerEmail,
      metadata: {
        tenantId: tenantId,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      },
    });
    
    await db.update(tenants)
      .set({
        stripeCustomerId: customer.id,
        billingEmail: ownerEmail || null,
        billingStatus: "none",
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
    
    console.log(`[Billing] Created Stripe customer ${customer.id} for tenant ${tenantId}`);
    
    res.json({
      success: true,
      message: "Billing initialized successfully",
      billingEmail: ownerEmail || null,
      hasPaymentMethod: false,
      stripeCustomerIdPresent: true,
      billingStatus: "none",
    });
  } catch (error: any) {
    if (error.type?.startsWith("Stripe")) {
      return handleRouteError(res, AppError.badRequest(error.message || "Stripe error occurred"), "billing.initialize", req);
    }
    handleRouteError(res, error, "billing.initialize", req);
  }
});

router.post("/billing/portal-session", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      throw AppError.badRequest("Tenant context required");
    }
    
    const { tenant } = tenantData;
    
    if (!tenant.stripeCustomerId) {
      throw AppError.badRequest("Billing has not been initialized. Please initialize billing first.");
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      throw AppError.badRequest("Stripe is not configured. Please contact the platform administrator.");
    }
    
    const allowedHosts = [
      ".replit.dev",
      ".repl.co",
      "localhost",
      "127.0.0.1",
    ];
    
    const host = req.get("host") || "";
    const hostWithoutPort = host.split(":")[0];
    const isAllowedHost = allowedHosts.some(allowed => 
      hostWithoutPort.endsWith(allowed) || hostWithoutPort.startsWith(allowed.slice(1))
    );
    
    if (!host || !isAllowedHost) {
      throw AppError.badRequest("Cannot determine valid return URL");
    }
    
    const protocol = req.protocol === "https" || host.endsWith(".replit.dev") || host.endsWith(".repl.co") 
      ? "https" 
      : req.protocol;
    const returnUrl = `${protocol}://${host}/settings?tab=billing`;
    
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId,
      return_url: returnUrl,
    });
    
    res.json({ url: session.url });
  } catch (error: any) {
    if (error.type?.startsWith("Stripe")) {
      return handleRouteError(res, AppError.badRequest(error.message || "Stripe error occurred"), "billing.portal-session", req);
    }
    handleRouteError(res, error, "billing.portal-session", req);
  }
});

router.get("/billing/invoices", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      throw AppError.badRequest("Tenant context required");
    }
    
    const { tenant } = tenantData;
    
    if (!tenant.stripeCustomerId) {
      return res.json({ invoices: [], hasMore: false });
    }
    
    const stripe = await getStripeClient();
    if (!stripe) {
      throw AppError.badRequest("Stripe is not configured.");
    }
    
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    
    const invoices = await stripe.invoices.list({
      customer: tenant.stripeCustomerId,
      limit,
    });
    
    const safeInvoices = invoices.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      dueDate: inv.due_date ? new Date(inv.due_date * 1000).toISOString() : null,
      amount: inv.amount_due,
      amountPaid: inv.amount_paid,
      currency: inv.currency,
      status: inv.status,
      hostedInvoiceUrl: inv.hosted_invoice_url,
      invoicePdfUrl: inv.invoice_pdf,
      description: inv.description,
    }));
    
    res.json({
      invoices: safeInvoices,
      hasMore: invoices.has_more,
    });
  } catch (error: any) {
    if (error.type?.startsWith("Stripe")) {
      return handleRouteError(res, AppError.badRequest(error.message || "Stripe error occurred"), "billing.invoices", req);
    }
    handleRouteError(res, error, "billing.invoices", req);
  }
});

router.patch("/billing/email", requireTenantAdmin, async (req, res) => {
  try {
    const tenantData = await getTenantForBilling(req);
    if (!tenantData) {
      throw AppError.badRequest("Tenant context required");
    }
    
    const { tenantId, tenant } = tenantData;
    const { billingEmail } = req.body;
    
    if (!billingEmail || typeof billingEmail !== "string") {
      throw AppError.badRequest("Valid email required");
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(billingEmail)) {
      throw AppError.badRequest("Invalid email format");
    }
    
    await db.update(tenants)
      .set({
        billingEmail,
        updatedAt: new Date(),
      })
      .where(eq(tenants.id, tenantId));
    
    if (tenant.stripeCustomerId) {
      const stripe = await getStripeClient();
      if (stripe) {
        await stripe.customers.update(tenant.stripeCustomerId, {
          email: billingEmail,
        });
      }
    }
    
    res.json({ success: true, billingEmail });
  } catch (error) {
    handleRouteError(res, error, "billing.email", req);
  }
});

export default router;
