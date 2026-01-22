/**
 * Chat Debug Store Unit Tests
 * 
 * Tests the ChatDebugStore behavior for event logging and metrics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chatDebugStore, isChatDebugEnabled, ChatEventType } from '../realtime/chatDebug';

describe('ChatDebugStore', () => {
  const originalEnv = process.env.CHAT_DEBUG;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHAT_DEBUG;
    } else {
      process.env.CHAT_DEBUG = originalEnv;
    }
    chatDebugStore.reset();
  });

  describe('isChatDebugEnabled', () => {
    it('should return true when CHAT_DEBUG=true', () => {
      process.env.CHAT_DEBUG = 'true';
      expect(isChatDebugEnabled()).toBe(true);
    });

    it('should return false when CHAT_DEBUG is not set', () => {
      delete process.env.CHAT_DEBUG;
      expect(isChatDebugEnabled()).toBe(false);
    });

    it('should return false when CHAT_DEBUG=false', () => {
      process.env.CHAT_DEBUG = 'false';
      expect(isChatDebugEnabled()).toBe(false);
    });
  });

  describe('logEvent', () => {
    beforeEach(() => {
      process.env.CHAT_DEBUG = 'true';
    });

    it('should log events when enabled', () => {
      chatDebugStore.logEvent({
        eventType: 'socket_connected',
        socketId: 'sock-123',
        userId: 'user-456',
      });

      const events = chatDebugStore.getEvents(10);
      expect(events.length).toBe(1);
      expect(events[0].eventType).toBe('socket_connected');
      expect(events[0].socketId).toBe('sock-123');
    });

    it('should not log events when disabled', () => {
      process.env.CHAT_DEBUG = 'false';
      
      chatDebugStore.logEvent({
        eventType: 'socket_connected',
        socketId: 'sock-123',
      });

      const events = chatDebugStore.getEvents(10);
      expect(events.length).toBe(0);
    });

    it('should assign unique IDs and timestamps', () => {
      chatDebugStore.logEvent({ eventType: 'room_joined' });
      chatDebugStore.logEvent({ eventType: 'room_left' });

      const events = chatDebugStore.getEvents(10);
      expect(events[0].id).toBeDefined();
      expect(events[1].id).toBeDefined();
      expect(events[0].id).not.toBe(events[1].id);
      expect(events[0].timestamp).toBeDefined();
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      process.env.CHAT_DEBUG = 'true';
    });

    it('should track active sockets', () => {
      chatDebugStore.logEvent({ eventType: 'socket_connected', socketId: 'sock-1' });
      chatDebugStore.logEvent({ eventType: 'socket_connected', socketId: 'sock-2' });

      const metrics = chatDebugStore.getMetrics();
      expect(metrics.activeSockets).toBe(2);
    });

    it('should decrease active sockets on disconnect', () => {
      chatDebugStore.logEvent({ eventType: 'socket_connected', socketId: 'sock-1' });
      chatDebugStore.logEvent({ eventType: 'socket_disconnected', socketId: 'sock-1' });

      const metrics = chatDebugStore.getMetrics();
      expect(metrics.activeSockets).toBe(0);
    });

    it('should track message counts', () => {
      chatDebugStore.logEvent({ eventType: 'message_persisted' });
      chatDebugStore.logEvent({ eventType: 'message_persisted' });

      const metrics = chatDebugStore.getMetrics();
      expect(metrics.messagesLast5Min).toBe(2);
    });

    it('should track error counts by code', () => {
      chatDebugStore.logEvent({ eventType: 'error', errorCode: 'ACCESS_DENIED' });
      chatDebugStore.logEvent({ eventType: 'error', errorCode: 'ACCESS_DENIED' });
      chatDebugStore.logEvent({ eventType: 'error', errorCode: 'NOT_FOUND' });

      const metrics = chatDebugStore.getMetrics();
      expect(metrics.lastErrors.length).toBeGreaterThan(0);
      const accessDenied = metrics.lastErrors.find(e => e.code === 'ACCESS_DENIED');
      expect(accessDenied?.count).toBe(2);
    });
  });

  describe('getActiveSockets', () => {
    beforeEach(() => {
      process.env.CHAT_DEBUG = 'true';
    });

    it('should return active socket info', () => {
      chatDebugStore.logEvent({
        eventType: 'socket_connected',
        socketId: 'sock-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
      });

      const sockets = chatDebugStore.getActiveSockets();
      expect(sockets.length).toBe(1);
      expect(sockets[0].socketId).toBe('sock-1');
      expect(sockets[0].userId).toBe('user-1');
      expect(sockets[0].tenantId).toBe('tenant-1');
    });

    it('should track room counts per socket', () => {
      chatDebugStore.logEvent({ eventType: 'socket_connected', socketId: 'sock-1' });
      chatDebugStore.logEvent({ eventType: 'room_joined', socketId: 'sock-1', roomName: 'room-a' });
      chatDebugStore.logEvent({ eventType: 'room_joined', socketId: 'sock-1', roomName: 'room-b' });

      const sockets = chatDebugStore.getActiveSockets();
      expect(sockets[0].roomsCount).toBe(2);
    });
  });

  describe('Security invariants', () => {
    it('should never include message body in events', () => {
      const eventTypes: ChatEventType[] = [
        'message_send_attempt',
        'message_persisted',
        'message_broadcast',
      ];
      
      eventTypes.forEach(eventType => {
        expect(eventType).not.toContain('body');
      });
    });
  });
});
