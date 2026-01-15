import { Router, raw } from "express";
import { db } from "../db";
import { systemSettings } from "../../shared/schema";
import { decryptValue, isEncryptionAvailable } from "../lib/encryption";

const router = Router();

// POST /api/v1/webhooks/stripe - Stripe webhook handler
router.post("/stripe", raw({ type: "application/json" }), async (req, res) => {
  const requestId = (req as any).requestId || `wh-${Date.now()}`;
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    console.warn(`[stripe-webhook] [${requestId}] Missing stripe-signature header`);
    return res.status(400).json({ error: "Missing stripe-signature header" });
  }

  try {
    const [settings] = await db.select().from(systemSettings).limit(1);
    
    if (!settings?.stripeWebhookSecretEncrypted) {
      console.warn(`[stripe-webhook] [${requestId}] Webhook secret not configured`);
      return res.status(400).json({ error: "Webhook secret not configured" });
    }

    if (!isEncryptionAvailable()) {
      console.error(`[stripe-webhook] [${requestId}] Encryption not available`);
      return res.status(500).json({ error: "Server configuration error" });
    }

    const webhookSecret = decryptValue(settings.stripeWebhookSecretEncrypted);
    
    // Import Stripe dynamically
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
      apiVersion: "2025-12-15.clover",
    });

    let event: any;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature as string,
        webhookSecret
      );
    } catch (err: any) {
      console.error(`[stripe-webhook] [${requestId}] Signature verification failed: ${err.message}`);
      return res.status(400).json({ error: "Invalid signature" });
    }

    // Log the event type (no payload dumps for security)
    console.log(`[stripe-webhook] [${requestId}] Received event: ${event.type}`);

    // Supported event types (scaffolding - to be implemented later)
    const supportedEventTypes = [
      "checkout.session.completed",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "invoice.paid",
      "invoice.payment_failed",
      "customer.created",
      "customer.updated",
    ];

    if (supportedEventTypes.includes(event.type)) {
      console.log(`[stripe-webhook] [${requestId}] Processing supported event: ${event.type}`);
      // TODO: Implement event handlers for each type when subscription packages are added
    } else {
      console.log(`[stripe-webhook] [${requestId}] Ignoring unsupported event: ${event.type}`);
    }

    // Always acknowledge receipt with 200 for valid signed events
    res.status(200).json({ received: true, eventType: event.type });
  } catch (error: any) {
    console.error(`[stripe-webhook] [${requestId}] Error processing webhook:`, error.message);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

export default router;
