/**
 * User Presence Tracking (In-Memory Store)
 * 
 * Tracks which users are currently online based on active socket connections.
 * Presence is tenant-scoped to prevent cross-tenant visibility.
 * 
 * Implementation:
 * - Uses an in-memory Map for fast lookups
 * - Key: `${tenantId}:${userId}`
 * - Value: { activeSocketCount, lastSeenAt, lastActiveAt, status }
 * 
 * Status types:
 * - "online": User has >= 1 active socket and recent activity
 * - "idle": User has >= 1 active socket but no activity for N minutes
 * - "offline": User has 0 active sockets
 * 
 * lastSeenAt: Updated on connect, ping, disconnect
 * lastActiveAt: Updated on connect, ping, and when returning from idle
 */

import { log } from '../lib/log';

export type PresenceStatus = 'online' | 'idle' | 'offline';

export interface PresenceInfo {
  activeSocketCount: number;
  lastSeenAt: Date;
  lastActiveAt: Date;
  status: PresenceStatus;
  tenantId: string;
  userId: string;
}

// In-memory presence store: key = `${tenantId}:${userId}`
const presenceStore = new Map<string, PresenceInfo>();

function getKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`;
}

/**
 * Get presence info for a user within a tenant.
 */
export function getPresence(tenantId: string, userId: string): PresenceInfo | null {
  const key = getKey(tenantId, userId);
  return presenceStore.get(key) || null;
}

/**
 * Get presence for multiple users within a tenant.
 */
export function getPresenceForUsers(tenantId: string, userIds: string[]): PresenceInfo[] {
  return userIds.map(userId => {
    const info = getPresence(tenantId, userId);
    if (info) return info;
    // Return offline state for users not in store
    return {
      tenantId,
      userId,
      activeSocketCount: 0,
      lastSeenAt: new Date(0), // Unknown
      lastActiveAt: new Date(0),
      status: 'offline' as const,
    };
  });
}

/**
 * Get all online users for a tenant.
 */
/**
 * Get all online or idle users for a tenant (users with active sockets).
 */
export function getOnlineUsersForTenant(tenantId: string): PresenceInfo[] {
  const online: PresenceInfo[] = [];
  presenceStore.forEach((info, key) => {
    if (info.tenantId === tenantId && (info.status === 'online' || info.status === 'idle')) {
      online.push(info);
    }
  });
  return online;
}

/**
 * Get all presence info for a tenant (online and offline).
 */
export function getAllPresenceForTenant(tenantId: string): PresenceInfo[] {
  const all: PresenceInfo[] = [];
  presenceStore.forEach((info, key) => {
    if (info.tenantId === tenantId) {
      all.push(info);
    }
  });
  return all;
}

/**
 * Mark a user as connected (increment socket count).
 * Returns the updated presence info and whether status changed.
 */
export function markConnected(
  tenantId: string,
  userId: string
): { info: PresenceInfo; statusChanged: boolean } {
  const key = getKey(tenantId, userId);
  const existing = presenceStore.get(key);
  const now = new Date();

  if (existing) {
    const previousStatus = existing.status;
    existing.activeSocketCount += 1;
    existing.lastSeenAt = now;
    existing.lastActiveAt = now;
    existing.status = 'online';
    const statusChanged = previousStatus !== 'online';
    log(`[presence] User ${userId} connected (sockets: ${existing.activeSocketCount})`, 'presence');
    return { info: existing, statusChanged };
  } else {
    const info: PresenceInfo = {
      tenantId,
      userId,
      activeSocketCount: 1,
      lastSeenAt: now,
      lastActiveAt: now,
      status: 'online',
    };
    presenceStore.set(key, info);
    log(`[presence] User ${userId} connected (first socket)`, 'presence');
    return { info, statusChanged: true };
  }
}

/**
 * Mark a user as disconnected (decrement socket count).
 * Returns the updated presence info and whether status changed.
 */
export function markDisconnected(
  tenantId: string,
  userId: string
): { info: PresenceInfo; statusChanged: boolean } {
  const key = getKey(tenantId, userId);
  const existing = presenceStore.get(key);
  const now = new Date();

  if (existing) {
    const previousStatus = existing.status;
    existing.activeSocketCount = Math.max(0, existing.activeSocketCount - 1);
    existing.lastSeenAt = now;
    const wentOffline = existing.activeSocketCount === 0;
    if (wentOffline) {
      existing.status = 'offline';
    }
    const statusChanged = wentOffline && previousStatus !== 'offline';
    log(`[presence] User ${userId} disconnected (sockets: ${existing.activeSocketCount})`, 'presence');
    return { info: existing, statusChanged };
  } else {
    // Shouldn't happen, but handle gracefully
    const info: PresenceInfo = {
      tenantId,
      userId,
      activeSocketCount: 0,
      lastSeenAt: now,
      lastActiveAt: now,
      status: 'offline',
    };
    presenceStore.set(key, info);
    return { info, statusChanged: false };
  }
}

/**
 * Update lastSeenAt and lastActiveAt on heartbeat ping.
 * Returns the updated info and whether status changed (e.g., idle -> online).
 */
export function recordPing(
  tenantId: string, 
  userId: string
): { info: PresenceInfo; statusChanged: boolean } {
  const key = getKey(tenantId, userId);
  const existing = presenceStore.get(key);
  const now = new Date();

  if (existing) {
    const previousStatus = existing.status;
    existing.lastSeenAt = now;
    existing.lastActiveAt = now;
    // If user was idle, return them to online
    if (existing.status === 'idle') {
      existing.status = 'online';
    }
    const statusChanged = previousStatus !== existing.status;
    return { info: existing, statusChanged };
  } else {
    // User pinged without prior connect (edge case), create entry
    const info: PresenceInfo = {
      tenantId,
      userId,
      activeSocketCount: 1,
      lastSeenAt: now,
      lastActiveAt: now,
      status: 'online',
    };
    presenceStore.set(key, info);
    return { info, statusChanged: true };
  }
}

/**
 * Set user idle/active state.
 * Returns the updated info and whether status changed.
 */
export function setIdle(
  tenantId: string,
  userId: string,
  isIdle: boolean
): { info: PresenceInfo; statusChanged: boolean } {
  const key = getKey(tenantId, userId);
  const existing = presenceStore.get(key);
  const now = new Date();

  if (!existing || existing.activeSocketCount === 0) {
    // Can't set idle for offline user
    return { 
      info: existing || {
        tenantId,
        userId,
        activeSocketCount: 0,
        lastSeenAt: now,
        lastActiveAt: now,
        status: 'offline' as const,
      }, 
      statusChanged: false 
    };
  }

  const previousStatus = existing.status;
  existing.lastSeenAt = now;
  
  if (isIdle) {
    existing.status = 'idle';
    log(`[presence] User ${userId} went idle`, 'presence');
  } else {
    existing.status = 'online';
    existing.lastActiveAt = now;
    log(`[presence] User ${userId} returned from idle`, 'presence');
  }
  
  const statusChanged = previousStatus !== existing.status;
  return { info: existing, statusChanged };
}

/**
 * Convert PresenceInfo to a safe payload for clients.
 */
export function toPresencePayload(info: PresenceInfo): {
  userId: string;
  status: PresenceStatus;
  online: boolean;
  lastSeenAt: string;
  lastActiveAt: string;
} {
  return {
    userId: info.userId,
    status: info.status,
    online: info.status === 'online' || info.status === 'idle', // Backwards compatibility
    lastSeenAt: info.lastSeenAt.toISOString(),
    lastActiveAt: info.lastActiveAt.toISOString(),
  };
}

// =============================================================================
// STALE SESSION CLEANUP
// =============================================================================

const STALE_THRESHOLD_MS = 60000; // 60 seconds without heartbeat = stale
const CLEANUP_INTERVAL_MS = 30000; // Run cleanup every 30 seconds

type OfflineCallback = (tenantId: string, userId: string, info: PresenceInfo) => void;
let offlineCallbacks: OfflineCallback[] = [];

/**
 * Register a callback to be invoked when a user goes offline due to stale session.
 */
export function onUserOffline(callback: OfflineCallback): void {
  offlineCallbacks.push(callback);
}

/**
 * Sweep the presence store and mark stale sessions as offline.
 * A session is stale if lastSeenAt is older than STALE_THRESHOLD_MS
 * and activeSocketCount is 0 (all sockets disconnected but user still "online").
 */
function sweepStalePresence(): void {
  const now = Date.now();
  const staleUsers: { tenantId: string; userId: string; info: PresenceInfo }[] = [];

  presenceStore.forEach((info, key) => {
    // Check if user is marked online but their lastSeen is stale
    // This handles cases where sockets dropped without clean disconnect
    const lastSeenMs = info.lastSeenAt.getTime();
    const isStale = (now - lastSeenMs) > STALE_THRESHOLD_MS;
    
    if (info.status === 'online' && isStale && info.activeSocketCount === 0) {
      info.status = 'offline';
      staleUsers.push({ tenantId: info.tenantId, userId: info.userId, info });
      log(`[presence] User ${info.userId} marked offline (stale session)`, 'presence');
    }
  });

  // Notify callbacks for stale users
  for (const { tenantId, userId, info } of staleUsers) {
    for (const callback of offlineCallbacks) {
      try {
        callback(tenantId, userId, info);
      } catch (err) {
        log(`[presence] Error in offline callback: ${err}`, 'presence');
      }
    }
  }
}

// Start periodic cleanup
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startPresenceCleanup(): void {
  if (cleanupInterval) return; // Already running
  
  cleanupInterval = setInterval(() => {
    sweepStalePresence();
  }, CLEANUP_INTERVAL_MS);
  
  log('[presence] Started stale session cleanup interval', 'presence');
}

export function stopPresenceCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log('[presence] Stopped stale session cleanup interval', 'presence');
  }
}
