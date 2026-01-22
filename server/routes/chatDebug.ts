/**
 * Chat Debug Routes
 * 
 * Read-only endpoints for Super Admin diagnostics when CHAT_DEBUG=true.
 * 
 * Endpoints:
 * - GET /api/v1/super/debug/chat/metrics - Active sockets, messages, errors
 * - GET /api/v1/super/debug/chat/events - Last N event summaries (IDs only)
 * - GET /api/v1/super/debug/chat/sockets - Active socket connections
 * 
 * Security Invariants:
 * - ALL routes require Super Admin role
 * - Only enabled when CHAT_DEBUG=true
 * - Returns 404 when disabled (no internal information leaked)
 * - No secrets or message contents exposed
 */

import { Router, Request, Response } from 'express';
import { requireSuperUser } from '../middleware/tenantContext';
import { chatDebugStore, isChatDebugEnabled } from '../realtime/chatDebug';
import { z } from 'zod';

const router = Router();

function requireChatDebugEnabled(_req: Request, res: Response, next: Function) {
  if (!isChatDebugEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}

router.get('/metrics', requireSuperUser, requireChatDebugEnabled, (_req: Request, res: Response) => {
  const metrics = chatDebugStore.getMetrics();
  res.json({
    success: true,
    data: metrics,
    timestamp: new Date().toISOString(),
  });
});

const eventsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(500).optional().default(200),
});

router.get('/events', requireSuperUser, requireChatDebugEnabled, (req: Request, res: Response) => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  const limit = parsed.success ? parsed.data.limit : 200;
  
  const events = chatDebugStore.getEvents(limit);
  res.json({
    success: true,
    data: events,
    count: events.length,
    timestamp: new Date().toISOString(),
  });
});

router.get('/sockets', requireSuperUser, requireChatDebugEnabled, (_req: Request, res: Response) => {
  const sockets = chatDebugStore.getActiveSockets();
  res.json({
    success: true,
    data: sockets,
    count: sockets.length,
    timestamp: new Date().toISOString(),
  });
});

router.get('/status', requireSuperUser, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      enabled: isChatDebugEnabled(),
      envVar: 'CHAT_DEBUG',
    },
  });
});

export default router;
