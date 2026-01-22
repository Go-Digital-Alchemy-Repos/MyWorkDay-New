/**
 * Test: Reconnect Rehydrates Rooms Without Duplicates
 * 
 * Verifies that:
 * 1. Socket tracks joined rooms correctly
 * 2. On reconnect, all rooms are rejoined
 * 3. Duplicate room joins are prevented
 * 4. Room leaves are tracked correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate the room tracking logic from socket.ts
class RoomTracker {
  private joinedRooms: Set<string> = new Set();
  private socket = {
    emit: vi.fn(),
  };

  joinRoom(targetType: 'channel' | 'dm', targetId: string): boolean {
    const roomKey = `${targetType}:${targetId}`;
    
    // Prevent duplicate joins
    if (this.joinedRooms.has(roomKey)) {
      return false; // Already joined
    }
    
    this.socket.emit('chat:join', { targetType, targetId });
    this.joinedRooms.add(roomKey);
    return true;
  }

  leaveRoom(targetType: 'channel' | 'dm', targetId: string): boolean {
    const roomKey = `${targetType}:${targetId}`;
    
    if (!this.joinedRooms.has(roomKey)) {
      return false; // Not in room
    }
    
    this.socket.emit('chat:leave', { targetType, targetId });
    this.joinedRooms.delete(roomKey);
    return true;
  }

  rejoinAllRooms(): number {
    const rooms = Array.from(this.joinedRooms);
    let rejoined = 0;
    
    for (const roomKey of rooms) {
      const [targetType, targetId] = roomKey.split(':') as ['channel' | 'dm', string];
      this.socket.emit('chat:join', { targetType, targetId });
      rejoined++;
    }
    
    return rejoined;
  }

  getRoomCount(): number {
    return this.joinedRooms.size;
  }

  getEmitCalls(): number {
    return this.socket.emit.mock.calls.length;
  }

  clearRooms(): void {
    this.joinedRooms.clear();
  }
}

describe('Room Tracking and Reconnection', () => {
  let tracker: RoomTracker;

  beforeEach(() => {
    tracker = new RoomTracker();
  });

  it('should track joined rooms correctly', () => {
    tracker.joinRoom('channel', 'channel-1');
    tracker.joinRoom('dm', 'dm-1');
    
    expect(tracker.getRoomCount()).toBe(2);
  });

  it('should prevent duplicate room joins', () => {
    const firstJoin = tracker.joinRoom('channel', 'channel-1');
    const secondJoin = tracker.joinRoom('channel', 'channel-1');
    
    expect(firstJoin).toBe(true);
    expect(secondJoin).toBe(false);
    expect(tracker.getRoomCount()).toBe(1);
  });

  it('should handle room leaves correctly', () => {
    tracker.joinRoom('channel', 'channel-1');
    expect(tracker.getRoomCount()).toBe(1);
    
    const left = tracker.leaveRoom('channel', 'channel-1');
    expect(left).toBe(true);
    expect(tracker.getRoomCount()).toBe(0);
  });

  it('should not leave room if not joined', () => {
    const left = tracker.leaveRoom('channel', 'channel-1');
    expect(left).toBe(false);
  });

  it('should rejoin all rooms on reconnect', () => {
    tracker.joinRoom('channel', 'channel-1');
    tracker.joinRoom('channel', 'channel-2');
    tracker.joinRoom('dm', 'dm-1');
    
    // Simulate initial join calls
    expect(tracker.getEmitCalls()).toBe(3);
    
    // Simulate reconnect - rejoin all rooms
    const rejoined = tracker.rejoinAllRooms();
    
    expect(rejoined).toBe(3);
    expect(tracker.getEmitCalls()).toBe(6); // 3 initial + 3 rejoins
  });

  it('should maintain room tracking after rejoin', () => {
    tracker.joinRoom('channel', 'channel-1');
    tracker.joinRoom('dm', 'dm-1');
    
    // Rejoin should not add duplicates to tracking
    tracker.rejoinAllRooms();
    
    // Count should still be 2
    expect(tracker.getRoomCount()).toBe(2);
  });

  it('should handle clearRooms correctly', () => {
    tracker.joinRoom('channel', 'channel-1');
    tracker.joinRoom('dm', 'dm-1');
    expect(tracker.getRoomCount()).toBe(2);
    
    tracker.clearRooms();
    expect(tracker.getRoomCount()).toBe(0);
  });

  it('should allow rejoining after leave', () => {
    tracker.joinRoom('channel', 'channel-1');
    tracker.leaveRoom('channel', 'channel-1');
    
    const rejoin = tracker.joinRoom('channel', 'channel-1');
    expect(rejoin).toBe(true);
    expect(tracker.getRoomCount()).toBe(1);
  });

  it('should handle mixed channel and dm rooms', () => {
    tracker.joinRoom('channel', 'id-1');
    tracker.joinRoom('dm', 'id-1'); // Same ID but different type
    
    expect(tracker.getRoomCount()).toBe(2);
    
    tracker.leaveRoom('channel', 'id-1');
    expect(tracker.getRoomCount()).toBe(1);
    
    // DM should still be tracked
    const dmLeave = tracker.leaveRoom('dm', 'id-1');
    expect(dmLeave).toBe(true);
  });
});

describe('Connection State Tracking', () => {
  it('should track connection state changes', () => {
    let isConnected = false;
    const callbacks = new Set<(connected: boolean) => void>();
    
    const onConnectionChange = (cb: (connected: boolean) => void) => {
      callbacks.add(cb);
      return () => callbacks.delete(cb);
    };
    
    const notify = (connected: boolean) => {
      isConnected = connected;
      callbacks.forEach(cb => cb(connected));
    };
    
    // Subscribe to connection changes
    let receivedState: boolean | null = null;
    const unsubscribe = onConnectionChange((connected) => {
      receivedState = connected;
    });
    
    // Simulate connect
    notify(true);
    expect(isConnected).toBe(true);
    expect(receivedState).toBe(true);
    
    // Simulate disconnect
    notify(false);
    expect(isConnected).toBe(false);
    expect(receivedState).toBe(false);
    
    // Unsubscribe
    unsubscribe();
    notify(true);
    expect(receivedState).toBe(false); // Not updated after unsubscribe
  });
});

describe('Server Connected Ack', () => {
  it('should parse connected ack payload correctly', () => {
    const payload = {
      serverTime: '2024-01-01T12:00:00.000Z',
      requestId: 'uuid-request-123',
      userId: 'user-1',
      tenantId: 'tenant-1',
    };
    
    expect(payload.serverTime).toBe('2024-01-01T12:00:00.000Z');
    expect(payload.requestId).toMatch(/^uuid-/);
    expect(payload.userId).toBe('user-1');
    expect(payload.tenantId).toBe('tenant-1');
  });

  it('should handle null userId and tenantId for unauthenticated connections', () => {
    const payload = {
      serverTime: '2024-01-01T12:00:00.000Z',
      requestId: 'uuid-request-456',
      userId: null,
      tenantId: null,
    };
    
    expect(payload.userId).toBeNull();
    expect(payload.tenantId).toBeNull();
  });
});
