/**
 * Chat Debug Module
 * 
 * Provides safe observability for diagnosing chat issues when CHAT_DEBUG=true.
 * 
 * Features:
 * - In-memory rolling event log (last N events)
 * - Per-process metrics (active sockets, rooms, messages, disconnects)
 * - No secrets or message contents logged
 * - Super Admin only access
 * 
 * Safety Invariants:
 * - Only enabled when CHAT_DEBUG=true
 * - Logs only IDs, timestamps, and payload sizes
 * - Never stores message body content
 * - Never exposes PII beyond minimal user/tenant IDs
 * - Data is ephemeral (in-memory only, no persistence)
 */

import { randomUUID } from 'crypto';

export type ChatEventType =
  | 'socket_connected'
  | 'socket_disconnected'
  | 'auth_session_missing'
  | 'room_joined'
  | 'room_left'
  | 'message_send_attempt'
  | 'message_persisted'
  | 'message_broadcast'
  | 'membership_add_attempt'
  | 'membership_remove_attempt'
  | 'membership_changed_broadcast'
  | 'room_access_denied'
  | 'error';

export interface ChatDebugEvent {
  id: string;
  timestamp: string;
  eventType: ChatEventType;
  socketId?: string;
  requestId?: string;
  userId?: string;
  tenantId?: string;
  conversationId?: string;
  roomName?: string;
  payloadSize?: number;
  disconnectReason?: string;
  errorCode?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface ActiveSocketInfo {
  socketId: string;
  userId?: string;
  tenantId?: string;
  connectedAt: string;
  roomsCount: number;
}

export interface ChatMetrics {
  activeSockets: number;
  roomsJoined: number;
  messagesLast5Min: number;
  disconnectsLast5Min: number;
  lastErrors: Array<{ code: string; count: number; lastOccurred: string }>;
}

const MAX_EVENTS = 500;
const METRICS_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

class ChatDebugStore {
  private events: ChatDebugEvent[] = [];
  private activeSockets = new Map<string, ActiveSocketInfo>();
  private roomJoinCounts = new Map<string, number>();
  private messageTimestamps: number[] = [];
  private disconnectTimestamps: number[] = [];
  private errorCounts = new Map<string, { count: number; lastOccurred: string }>();

  isEnabled(): boolean {
    return process.env.CHAT_DEBUG === 'true';
  }

  logEvent(event: Omit<ChatDebugEvent, 'id' | 'timestamp'>): void {
    if (!this.isEnabled()) return;

    const fullEvent: ChatDebugEvent = {
      ...event,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.events.push(fullEvent);
    if (this.events.length > MAX_EVENTS) {
      this.events.shift();
    }

    this.updateMetrics(fullEvent);
  }

  private updateMetrics(event: ChatDebugEvent): void {
    const now = Date.now();

    switch (event.eventType) {
      case 'socket_connected':
        if (event.socketId) {
          this.activeSockets.set(event.socketId, {
            socketId: event.socketId,
            userId: event.userId,
            tenantId: event.tenantId,
            connectedAt: event.timestamp,
            roomsCount: 0,
          });
        }
        break;

      case 'socket_disconnected':
        if (event.socketId) {
          this.activeSockets.delete(event.socketId);
        }
        this.disconnectTimestamps.push(now);
        break;

      case 'room_joined':
        if (event.socketId) {
          const socketInfo = this.activeSockets.get(event.socketId);
          if (socketInfo) {
            socketInfo.roomsCount++;
          }
        }
        if (event.roomName) {
          const count = this.roomJoinCounts.get(event.roomName) || 0;
          this.roomJoinCounts.set(event.roomName, count + 1);
        }
        break;

      case 'room_left':
        if (event.socketId) {
          const socketInfo = this.activeSockets.get(event.socketId);
          if (socketInfo && socketInfo.roomsCount > 0) {
            socketInfo.roomsCount--;
          }
        }
        if (event.roomName) {
          const count = this.roomJoinCounts.get(event.roomName) || 0;
          if (count > 0) {
            this.roomJoinCounts.set(event.roomName, count - 1);
          }
        }
        break;

      case 'message_persisted':
        this.messageTimestamps.push(now);
        break;

      case 'error':
        if (event.errorCode) {
          this.errorCounts.set(event.errorCode, {
            count: (this.errorCounts.get(event.errorCode)?.count || 0) + 1,
            lastOccurred: event.timestamp,
          });
        }
        break;
    }

    this.pruneOldMetrics(now);
  }

  private pruneOldMetrics(now: number): void {
    const cutoff = now - METRICS_WINDOW_MS;
    this.messageTimestamps = this.messageTimestamps.filter(ts => ts > cutoff);
    this.disconnectTimestamps = this.disconnectTimestamps.filter(ts => ts > cutoff);
  }

  getMetrics(): ChatMetrics {
    const now = Date.now();
    this.pruneOldMetrics(now);

    let roomsJoined = 0;
    Array.from(this.roomJoinCounts.values()).forEach(count => {
      roomsJoined += count;
    });

    const lastErrors: ChatMetrics['lastErrors'] = [];
    Array.from(this.errorCounts.entries()).forEach(([code, data]) => {
      lastErrors.push({ code, count: data.count, lastOccurred: data.lastOccurred });
    });
    lastErrors.sort((a, b) => b.count - a.count);

    return {
      activeSockets: this.activeSockets.size,
      roomsJoined,
      messagesLast5Min: this.messageTimestamps.length,
      disconnectsLast5Min: this.disconnectTimestamps.length,
      lastErrors: lastErrors.slice(0, 10),
    };
  }

  getEvents(limit = 200): ChatDebugEvent[] {
    return this.events.slice(-limit).reverse();
  }

  getActiveSockets(): ActiveSocketInfo[] {
    return Array.from(this.activeSockets.values());
  }

  updateSocketRoomCount(socketId: string, roomsCount: number): void {
    const socketInfo = this.activeSockets.get(socketId);
    if (socketInfo) {
      socketInfo.roomsCount = roomsCount;
    }
  }

  reset(): void {
    this.events = [];
    this.activeSockets.clear();
    this.roomJoinCounts.clear();
    this.messageTimestamps = [];
    this.disconnectTimestamps = [];
    this.errorCounts.clear();
  }
}

export const chatDebugStore = new ChatDebugStore();

export function isChatDebugEnabled(): boolean {
  return chatDebugStore.isEnabled();
}
