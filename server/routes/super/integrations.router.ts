/**
 * Super Admin Integrations Router
 * 
 * Handles global integration management for Mailgun, Cloudflare R2, and Stripe.
 * All routes require super_user role.
 * 
 * Note: Cloudflare R2 is the default storage provider. R2 configuration is handled
 * via environment variables (CF_R2_*) or the system integrations router.
 * 
 * Mounted at: /api/v1/super (endpoints: /integrations/*)
 * 
 * Endpoints:
 * - GET /integrations/status - Check all integration statuses
 * - GET/PUT /integrations/mailgun - Mailgun settings
 * - POST /integrations/mailgun/test - Test Mailgun connection
 * - POST /integrations/mailgun/send-test-email - Send test email
 * - DELETE /integrations/mailgun/secret/:secretName - Clear Mailgun secret
 * - GET/PUT /integrations/stripe - Stripe settings
 * - POST /integrations/stripe/test - Test Stripe connection
 * - DELETE /integrations/stripe/secret/:secretName - Clear Stripe secret
 */
import { Router } from "express";
import { z } from "zod";
import { requireSuperUser } from "../../middleware/tenantContext";
import { db } from "../../db";
import { eq } from "drizzle-orm";
import { systemSettings } from "@shared/schema";
import { encryptValue, decryptValue, isEncryptionAvailable } from "../../lib/encryption";
import Mailgun from "mailgun.js";
import FormData from "form-data";

const router = Router();

function maskSecret(value: string | null | undefined): string | null {
  if (!value || value.length < 4) return null;
  return "••••" + value.slice(-4);
}

/**
 * GET /integrations/status - Check platform integrations status
 */
router.get("/integrations/status", requireSuperUser, async (req, res) => {
  try {
    let settings: typeof systemSettings.$inferSelect | null = null;
    try {
      const [row] = await db.select().from(systemSettings).limit(1);
      settings = row || null;
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[integrations] systemSettings table/column issue:", message);
      } else {
        throw dbError;
      }
    }
    
    const mailgunConfigured = !!(
      settings?.mailgunDomain && 
      settings?.mailgunFromEmail && 
      settings?.mailgunApiKeyEncrypted
    );
    
    // R2 is configured via environment variables or system integrations
    const r2Configured = !!(
      process.env.CF_R2_ACCOUNT_ID &&
      process.env.CF_R2_ACCESS_KEY_ID &&
      process.env.CF_R2_SECRET_ACCESS_KEY &&
      process.env.CF_R2_BUCKET_NAME
    );
    
    const stripeConfigured = !!(
      settings?.stripePublishableKey && 
      settings?.stripeSecretKeyEncrypted
    );
    
    const encryptionConfigured = isEncryptionAvailable();
    
    res.json({
      mailgun: mailgunConfigured,
      r2: r2Configured,
      stripe: stripeConfigured,
      encryptionConfigured,
    });
  } catch (error) {
    console.error("[integrations] Failed to check integration status:", error);
    res.json({
      mailgun: false,
      r2: false,
      stripe: false,
      encryptionConfigured: isEncryptionAvailable(),
    });
  }
});

const globalMailgunUpdateSchema = z.object({
  domain: z.string().optional(),
  fromEmail: z.string().email().optional(),
  region: z.enum(["US", "EU"]).optional(),
  apiKey: z.string().optional(),
  signingKey: z.string().optional(),
});

/**
 * GET /integrations/mailgun - Get global Mailgun settings
 */
router.get("/integrations/mailgun", requireSuperUser, async (req, res) => {
  const notConfiguredResponse = {
    status: "not_configured",
    config: null,
    secretMasked: null,
    lastTestedAt: null,
  };

  try {
    let settings: typeof systemSettings.$inferSelect | null = null;
    try {
      const [row] = await db.select().from(systemSettings).limit(1);
      settings = row || null;
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[integrations] systemSettings table/column issue:", message);
        return res.json(notConfiguredResponse);
      }
      throw dbError;
    }
    
    if (!settings) {
      return res.json(notConfiguredResponse);
    }

    let apiKeyMasked: string | null = null;
    let signingKeyMasked: string | null = null;
    
    if (settings.mailgunApiKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.mailgunApiKeyEncrypted);
        apiKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Mailgun API key for masking");
      }
    }
    
    if (settings.mailgunSigningKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.mailgunSigningKeyEncrypted);
        signingKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Mailgun signing key for masking");
      }
    }

    const isConfigured = !!(
      settings.mailgunDomain && 
      settings.mailgunFromEmail && 
      settings.mailgunApiKeyEncrypted
    );

    res.json({
      status: isConfigured ? "configured" : "not_configured",
      config: {
        domain: settings.mailgunDomain,
        fromEmail: settings.mailgunFromEmail,
        region: settings.mailgunRegion || "US",
      },
      secretMasked: {
        apiKeyMasked,
        signingKeyMasked,
      },
      lastTestedAt: settings.mailgunLastTestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[integrations] Failed to get Mailgun settings:", error);
    res.json(notConfiguredResponse);
  }
});

/**
 * PUT /integrations/mailgun - Update global Mailgun settings
 */
router.put("/integrations/mailgun", requireSuperUser, async (req, res) => {
  try {
    const body = globalMailgunUpdateSchema.parse(req.body);
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (body.domain !== undefined) {
      updateData.mailgunDomain = body.domain || null;
    }
    if (body.fromEmail !== undefined) {
      updateData.mailgunFromEmail = body.fromEmail || null;
    }
    if (body.region !== undefined) {
      updateData.mailgunRegion = body.region || null;
    }
    if (body.apiKey && body.apiKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.mailgunApiKeyEncrypted = encryptValue(body.apiKey.trim());
    }
    if (body.signingKey && body.signingKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.mailgunSigningKeyEncrypted = encryptValue(body.signingKey.trim());
    }

    const [existing] = await db.select().from(systemSettings).limit(1);
    if (existing) {
      await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({ id: 1, ...updateData });
    }

    res.json({ success: true, message: "Mailgun settings saved successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[integrations] Failed to save Mailgun settings:", error);
    res.status(500).json({ error: "Failed to save Mailgun settings" });
  }
});

/**
 * POST /integrations/mailgun/test - Test global Mailgun connection
 */
router.post("/integrations/mailgun/test", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.mailgunDomain || !settings?.mailgunFromEmail || !settings?.mailgunApiKeyEncrypted) {
      return res.json({ success: false, message: "Mailgun is not fully configured" });
    }

    if (!isEncryptionAvailable()) {
      return res.json({ success: false, message: "Encryption not available" });
    }

    const apiKey = decryptValue(settings.mailgunApiKeyEncrypted);
    const domain = settings.mailgunDomain;
    const region = settings.mailgunRegion || "US";

    const mailgun = new Mailgun(FormData);
    const mgUrl = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const mg = mailgun.client({ username: "api", key: apiKey, url: mgUrl });

    await mg.domains.get(domain);
    
    await db.update(systemSettings)
      .set({ mailgunLastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(systemSettings.id, 1));

    res.json({ success: true, message: "Mailgun configuration is valid" });
  } catch (error: any) {
    console.error("[integrations] Mailgun test failed:", error.message);
    res.json({ success: false, message: error.message || "Failed to validate Mailgun domain" });
  }
});

/**
 * POST /integrations/mailgun/send-test-email - Send test email
 */
router.post("/integrations/mailgun/send-test-email", requireSuperUser, async (req, res) => {
  try {
    const { toEmail } = req.body;
    if (!toEmail || !toEmail.includes("@")) {
      return res.status(400).json({ error: "Valid email address required" });
    }

    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.mailgunDomain || !settings?.mailgunFromEmail || !settings?.mailgunApiKeyEncrypted) {
      return res.status(400).json({ error: "Mailgun is not fully configured" });
    }

    if (!isEncryptionAvailable()) {
      return res.status(400).json({ error: "Encryption not available" });
    }

    const apiKey = decryptValue(settings.mailgunApiKeyEncrypted);
    const domain = settings.mailgunDomain;
    const fromEmail = settings.mailgunFromEmail;
    const region = settings.mailgunRegion || "US";

    const mailgun = new Mailgun(FormData);
    const mgUrl = region === "EU" ? "https://api.eu.mailgun.net" : "https://api.mailgun.net";
    const mg = mailgun.client({ username: "api", key: apiKey, url: mgUrl });

    const timestamp = new Date().toISOString();
    await mg.messages.create(domain, {
      from: fromEmail,
      to: [toEmail],
      subject: "Global Mailgun Test - MyWorkDay Platform",
      text: `This is a test email from the MyWorkDay platform.\n\nTimestamp: ${timestamp}\n\nIf you received this email, your global Mailgun integration is working correctly.`,
    });

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error: any) {
    console.error("[integrations] Send test email failed:", error.message);
    res.status(500).json({ error: error.message || "Failed to send test email" });
  }
});

/**
 * DELETE /integrations/mailgun/secret/:secretName - Clear a Mailgun secret
 */
router.delete("/integrations/mailgun/secret/:secretName", requireSuperUser, async (req, res) => {
  try {
    const { secretName } = req.params;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (secretName === "apiKey") {
      updateData.mailgunApiKeyEncrypted = null;
    } else if (secretName === "signingKey") {
      updateData.mailgunSigningKeyEncrypted = null;
    } else {
      return res.status(400).json({ error: "Invalid secret name" });
    }

    await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    res.json({ success: true, message: `${secretName} cleared successfully` });
  } catch (error) {
    console.error("[integrations] Failed to clear Mailgun secret:", error);
    res.status(500).json({ error: "Failed to clear secret" });
  }
});

const globalStripeUpdateSchema = z.object({
  publishableKey: z.string().optional(),
  secretKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  defaultCurrency: z.string().optional(),
});

/**
 * GET /integrations/stripe - Get global Stripe settings
 */
router.get("/integrations/stripe", requireSuperUser, async (req, res) => {
  const notConfiguredResponse = {
    status: "not_configured",
    config: null,
    secretMasked: null,
    lastTestedAt: null,
  };

  try {
    let settings: typeof systemSettings.$inferSelect | null = null;
    try {
      const [row] = await db.select().from(systemSettings).limit(1);
      settings = row || null;
    } catch (dbError: unknown) {
      const message = dbError instanceof Error ? dbError.message : String(dbError);
      if (message.includes("does not exist") || message.includes("column")) {
        console.warn("[integrations] systemSettings table/column issue:", message);
        return res.json(notConfiguredResponse);
      }
      throw dbError;
    }
    
    if (!settings) {
      return res.json(notConfiguredResponse);
    }

    let secretKeyMasked: string | null = null;
    let webhookSecretMasked: string | null = null;
    
    if (settings.stripeSecretKeyEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.stripeSecretKeyEncrypted);
        secretKeyMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Stripe secret key for masking");
      }
    }
    
    if (settings.stripeWebhookSecretEncrypted && isEncryptionAvailable()) {
      try {
        const decrypted = decryptValue(settings.stripeWebhookSecretEncrypted);
        webhookSecretMasked = maskSecret(decrypted);
      } catch (e) {
        console.error("[integrations] Failed to decrypt Stripe webhook secret for masking");
      }
    }

    const isConfigured = !!(
      settings.stripePublishableKey && 
      settings.stripeSecretKeyEncrypted
    );

    res.json({
      status: isConfigured ? "configured" : "not_configured",
      config: {
        publishableKey: settings.stripePublishableKey,
        defaultCurrency: settings.stripeDefaultCurrency || "usd",
      },
      secretMasked: {
        secretKeyMasked,
        webhookSecretMasked,
      },
      lastTestedAt: settings.stripeLastTestedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error("[integrations] Failed to get Stripe settings:", error);
    res.json(notConfiguredResponse);
  }
});

/**
 * PUT /integrations/stripe - Update global Stripe settings
 */
router.put("/integrations/stripe", requireSuperUser, async (req, res) => {
  try {
    const body = globalStripeUpdateSchema.parse(req.body);
    
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };
    
    if (body.publishableKey !== undefined) {
      updateData.stripePublishableKey = body.publishableKey || null;
    }
    if (body.defaultCurrency !== undefined) {
      updateData.stripeDefaultCurrency = body.defaultCurrency || "usd";
    }
    if (body.secretKey && body.secretKey.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.stripeSecretKeyEncrypted = encryptValue(body.secretKey.trim());
    }
    if (body.webhookSecret && body.webhookSecret.trim()) {
      if (!isEncryptionAvailable()) {
        return res.status(400).json({ error: "Encryption not configured. Cannot store secrets." });
      }
      updateData.stripeWebhookSecretEncrypted = encryptValue(body.webhookSecret.trim());
    }

    const [existing] = await db.select().from(systemSettings).limit(1);
    if (existing) {
      await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    } else {
      await db.insert(systemSettings).values({ id: 1, ...updateData });
    }

    res.json({ success: true, message: "Stripe settings saved successfully" });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Validation error", details: error.errors });
    }
    console.error("[integrations] Failed to save Stripe settings:", error);
    res.status(500).json({ error: "Failed to save Stripe settings" });
  }
});

/**
 * POST /integrations/stripe/test - Test global Stripe connection
 */
router.post("/integrations/stripe/test", requireSuperUser, async (req, res) => {
  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.stripeSecretKeyEncrypted) {
      return res.json({ ok: false, error: { code: "not_configured", message: "Stripe secret key is not configured" } });
    }

    if (!isEncryptionAvailable()) {
      return res.json({ ok: false, error: { code: "encryption_unavailable", message: "Encryption not available" } });
    }

    const secretKey = decryptValue(settings.stripeSecretKeyEncrypted);
    
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(secretKey, {
      apiVersion: "2025-12-15.clover",
    });

    await stripe.balance.retrieve();
    
    await db.update(systemSettings)
      .set({ stripeLastTestedAt: new Date(), updatedAt: new Date() })
      .where(eq(systemSettings.id, 1));

    res.json({ ok: true });
  } catch (error: any) {
    const requestId = (req as any).requestId || "unknown";
    console.error("[integrations] Stripe test failed:", error.message);
    res.json({ 
      ok: false, 
      error: { 
        code: error.code || "stripe_error", 
        message: error.message || "Failed to connect to Stripe",
        requestId,
      } 
    });
  }
});

/**
 * DELETE /integrations/stripe/secret/:secretName - Clear a Stripe secret
 */
router.delete("/integrations/stripe/secret/:secretName", requireSuperUser, async (req, res) => {
  try {
    const { secretName } = req.params;
    const updateData: Record<string, any> = { updatedAt: new Date() };
    
    if (secretName === "secretKey") {
      updateData.stripeSecretKeyEncrypted = null;
    } else if (secretName === "webhookSecret") {
      updateData.stripeWebhookSecretEncrypted = null;
    } else {
      return res.status(400).json({ error: "Invalid secret name" });
    }

    await db.update(systemSettings).set(updateData).where(eq(systemSettings.id, 1));
    res.json({ success: true, message: `${secretName} cleared successfully` });
  } catch (error) {
    console.error("[integrations] Failed to clear Stripe secret:", error);
    res.status(500).json({ error: "Failed to clear secret" });
  }
});

export default router;
