/**
 * Chat Typing Indicators
 * 
 * In-memory state management for typing indicators in chat.
 * No database persistence - purely real-time Socket.IO feature.
 * 
 * Key behaviors:
 * - Typing state auto-expires after 5 seconds without refresh
 * - State is cleaned up on disconnect
 * - Tenant-scoped and membership-validated
 */

import { log } from "../lib/log";

const TYPING_EXPIRY_MS = 5000; // 5 seconds

interface TypingEntry {
  userId: string;
  tenantId: string;
  expiresAt: number;
}

// Map: conversationId -> Map<userId, TypingEntry>
const typingState = new Map<string, Map<string, TypingEntry>>();

// Map: socketId -> Set<conversationId> (for cleanup on disconnect)
const socketConversations = new Map<string, Set<string>>();

// Map: socketId -> { userId, tenantId }
const socketUserMap = new Map<string, { userId: string; tenantId: string }>();

/**
 * Register socket with user info for cleanup on disconnect
 */
export function registerTypingSocket(socketId: string, userId: string, tenantId: string): void {
  socketUserMap.set(socketId, { userId, tenantId });
  socketConversations.set(socketId, new Set());
}

/**
 * Mark user as typing in a conversation
 * Returns true if state changed (was not typing before)
 */
export function startTyping(
  tenantId: string,
  userId: string,
  conversationId: string,
  socketId: string
): { stateChanged: boolean } {
  let conversationTypers = typingState.get(conversationId);
  if (!conversationTypers) {
    conversationTypers = new Map();
    typingState.set(conversationId, conversationTypers);
  }

  const wasTyping = conversationTypers.has(userId);
  conversationTypers.set(userId, {
    userId,
    tenantId,
    expiresAt: Date.now() + TYPING_EXPIRY_MS,
  });

  // Track which conversations this socket is typing in
  const socketConvs = socketConversations.get(socketId);
  if (socketConvs) {
    socketConvs.add(conversationId);
  }

  return { stateChanged: !wasTyping };
}

/**
 * Mark user as stopped typing in a conversation
 * Returns true if state changed (was typing before)
 */
export function stopTyping(
  userId: string,
  conversationId: string,
  socketId: string
): { stateChanged: boolean } {
  const conversationTypers = typingState.get(conversationId);
  if (!conversationTypers) {
    return { stateChanged: false };
  }

  const wasTyping = conversationTypers.has(userId);
  conversationTypers.delete(userId);

  // Clean up empty map
  if (conversationTypers.size === 0) {
    typingState.delete(conversationId);
  }

  // Remove from socket tracking
  const socketConvs = socketConversations.get(socketId);
  if (socketConvs) {
    socketConvs.delete(conversationId);
  }

  return { stateChanged: wasTyping };
}

/**
 * Get all users currently typing in a conversation
 */
export function getTypingUsers(conversationId: string): string[] {
  const conversationTypers = typingState.get(conversationId);
  if (!conversationTypers) {
    return [];
  }

  const now = Date.now();
  const activeTypers: string[] = [];

  Array.from(conversationTypers.entries()).forEach(([userId, entry]) => {
    if (entry.expiresAt > now) {
      activeTypers.push(userId);
    }
  });

  return activeTypers;
}

/**
 * Clean up expired typing entries
 * Returns list of { conversationId, userId } pairs that expired
 */
export function cleanupExpiredTyping(): Array<{ conversationId: string; userId: string; tenantId: string }> {
  const now = Date.now();
  const expired: Array<{ conversationId: string; userId: string; tenantId: string }> = [];

  Array.from(typingState.entries()).forEach(([conversationId, typers]) => {
    Array.from(typers.entries()).forEach(([userId, entry]) => {
      if (entry.expiresAt <= now) {
        expired.push({ conversationId, userId, tenantId: entry.tenantId });
        typers.delete(userId);
      }
    });

    // Clean up empty map
    if (typers.size === 0) {
      typingState.delete(conversationId);
    }
  });

  return expired;
}

/**
 * Clean up all typing state for a disconnected socket
 * Returns list of { conversationId, userId } pairs that were cleaned up
 */
export function cleanupSocketTyping(socketId: string): Array<{ conversationId: string; userId: string }> {
  const userInfo = socketUserMap.get(socketId);
  const conversations = socketConversations.get(socketId);
  
  if (!userInfo || !conversations) {
    socketUserMap.delete(socketId);
    socketConversations.delete(socketId);
    return [];
  }

  const cleaned: Array<{ conversationId: string; userId: string }> = [];

  Array.from(conversations).forEach((conversationId) => {
    const conversationTypers = typingState.get(conversationId);
    if (conversationTypers && conversationTypers.has(userInfo.userId)) {
      conversationTypers.delete(userInfo.userId);
      cleaned.push({ conversationId, userId: userInfo.userId });

      if (conversationTypers.size === 0) {
        typingState.delete(conversationId);
      }
    }
  });

  socketUserMap.delete(socketId);
  socketConversations.delete(socketId);

  return cleaned;
}

// Cleanup interval reference
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

// Callback for expired typing
type TypingExpiredCallback = (conversationId: string, userId: string, tenantId: string) => void;
let onTypingExpiredCallback: TypingExpiredCallback | null = null;

/**
 * Register callback for when typing expires
 */
export function onTypingExpired(callback: TypingExpiredCallback): void {
  onTypingExpiredCallback = callback;
}

/**
 * Start the typing cleanup interval (run every 1 second)
 */
export function startTypingCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const expired = cleanupExpiredTyping();
    
    if (expired.length > 0 && onTypingExpiredCallback) {
      for (const { conversationId, userId, tenantId } of expired) {
        onTypingExpiredCallback(conversationId, userId, tenantId);
      }
    }
  }, 1000);

  log("[typing] Started typing cleanup interval", "typing");
}

/**
 * Stop the typing cleanup interval
 */
export function stopTypingCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    log("[typing] Stopped typing cleanup interval", "typing");
  }
}

/**
 * Parse conversation ID to get type and id
 */
export function parseConversationId(conversationId: string): { type: 'channel' | 'dm'; id: string } | null {
  if (conversationId.startsWith('channel:')) {
    return { type: 'channel', id: conversationId.slice(8) };
  }
  if (conversationId.startsWith('dm:')) {
    return { type: 'dm', id: conversationId.slice(3) };
  }
  return null;
}
