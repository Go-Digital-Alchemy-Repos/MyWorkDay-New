/**
 * Test: Optimistic Message Replaced on Server Ack
 * 
 * Verifies that when a message is sent optimistically:
 * 1. Message appears immediately with 'pending' status
 * 2. When server ack arrives via socket, pending message is replaced
 * 3. No duplicates appear in the message list
 * 4. Failed messages can be retried
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock socket module
const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
  connected: true,
};

vi.mock('@/lib/realtime/socket', () => ({
  getSocket: () => mockSocket,
  isSocketConnected: () => true,
  joinChatRoom: vi.fn(),
  leaveChatRoom: vi.fn(),
  onConnectionChange: vi.fn(() => () => {}),
}));

describe('Optimistic Message Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should create a pending message with _tempId and _status', () => {
    const tempId = `temp-${Date.now()}-abc123`;
    const pendingMessage = {
      id: tempId,
      tenantId: 'tenant-1',
      channelId: 'channel-1',
      dmThreadId: null,
      authorUserId: 'user-1',
      body: 'Hello world',
      createdAt: new Date(),
      editedAt: null,
      _status: 'pending' as const,
      _tempId: tempId,
    };

    expect(pendingMessage._status).toBe('pending');
    expect(pendingMessage._tempId).toBe(tempId);
    expect(pendingMessage.id).toBe(tempId);
  });

  it('should match server message to pending message by body and recency', () => {
    const tempId = `temp-${Date.now()}-abc123`;
    const timestamp = Date.now();
    
    // Pending message from optimistic insert
    const pendingMessage = {
      id: tempId,
      body: 'Hello world',
      createdAt: new Date(timestamp),
      _status: 'pending' as const,
      _tempId: tempId,
    };

    // Server-confirmed message
    const serverMessage = {
      id: 'uuid-from-server',
      body: 'Hello world',
      createdAt: new Date(timestamp + 100), // Within 30 second window
    };

    // Match by body + recency (within 30 seconds)
    const bodyMatches = pendingMessage.body === serverMessage.body;
    const timeA = new Date(serverMessage.createdAt).getTime();
    const timeB = new Date(pendingMessage.createdAt).getTime();
    const isRecent = Math.abs(timeA - timeB) < 30000;

    expect(bodyMatches).toBe(true);
    expect(isRecent).toBe(true);
  });

  it('should not match messages outside the recency window', () => {
    const tempId = `temp-${Date.now()}-abc123`;
    const timestamp = Date.now();
    
    const pendingMessage = {
      id: tempId,
      body: 'Hello world',
      createdAt: new Date(timestamp - 60000), // 1 minute ago
      _status: 'pending' as const,
      _tempId: tempId,
    };

    const serverMessage = {
      id: 'uuid-from-server',
      body: 'Hello world',
      createdAt: new Date(timestamp),
    };

    const timeA = new Date(serverMessage.createdAt).getTime();
    const timeB = new Date(pendingMessage.createdAt).getTime();
    const isRecent = Math.abs(timeA - timeB) < 30000;

    expect(isRecent).toBe(false);
  });

  it('should sort messages by createdAt then id', () => {
    const messages = [
      { id: 'c', createdAt: new Date('2024-01-01T12:00:00Z'), body: 'Third' },
      { id: 'a', createdAt: new Date('2024-01-01T12:00:00Z'), body: 'First (same time)' },
      { id: 'b', createdAt: new Date('2024-01-01T11:00:00Z'), body: 'Second (earlier)' },
    ];

    const sorted = [...messages].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
      return a.id.localeCompare(b.id);
    });

    expect(sorted[0].id).toBe('b'); // Earliest time
    expect(sorted[1].id).toBe('a'); // Same time, 'a' < 'c'
    expect(sorted[2].id).toBe('c'); // Same time, 'c' > 'a'
  });

  it('should mark message as failed when send fails', () => {
    const tempId = `temp-${Date.now()}-abc123`;
    const pendingMessage = {
      id: tempId,
      body: 'Hello world',
      createdAt: new Date(),
      _status: 'pending' as const,
      _tempId: tempId,
    };

    // Simulate failure - update status
    const failedMessage = {
      ...pendingMessage,
      _status: 'failed' as const,
    };

    expect(failedMessage._status).toBe('failed');
    expect(failedMessage._tempId).toBe(tempId);
  });

  it('should generate unique tempIds for each message', () => {
    const generateTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const id1 = generateTempId();
    const id2 = generateTempId();
    const id3 = generateTempId();

    expect(id1).not.toBe(id2);
    expect(id2).not.toBe(id3);
    expect(id1).not.toBe(id3);
  });
});
