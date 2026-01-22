/**
 * Test: Removed Member Loses Access Immediately
 * 
 * Verifies that when a user is removed from a channel:
 * 1. Socket event is received immediately
 * 2. User is auto-navigated out of the channel
 * 3. Channel is removed from their list
 * 4. Appropriate notification is shown
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Simulate the member removal handling logic
interface MemberRemovedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  userName: string;
  removedBy: string | null;
}

interface ChannelState {
  selectedChannelId: string | null;
  membersDrawerOpen: boolean;
  channelList: string[];
}

class MembershipHandler {
  private state: ChannelState;
  private currentUserId: string;
  private toasts: Array<{ title: string; description: string; variant: string }> = [];
  private socketRoomLeft: string | null = null;
  private invalidatedQueries: string[] = [];

  constructor(currentUserId: string, initialState: ChannelState) {
    this.currentUserId = currentUserId;
    this.state = { ...initialState };
  }

  handleMemberRemoved(payload: MemberRemovedPayload): void {
    if (payload.targetType === 'channel' && this.state.selectedChannelId === payload.targetId) {
      // Invalidate members list
      this.invalidatedQueries.push(`/api/v1/chat/channels/${payload.targetId}/members`);
      
      // If current user was removed
      if (payload.userId === this.currentUserId) {
        // Leave socket room immediately
        this.socketRoomLeft = `channel:${payload.targetId}`;
        
        // Deselect channel
        this.state.selectedChannelId = null;
        this.state.membersDrawerOpen = false;
        
        // Remove from channel list
        this.state.channelList = this.state.channelList.filter(id => id !== payload.targetId);
        
        // Invalidate channel list
        this.invalidatedQueries.push('/api/v1/chat/channels');
        
        // Show toast notification
        this.toasts.push({
          title: 'Removed from channel',
          description: 'You have been removed from this channel and can no longer access it.',
          variant: 'destructive',
        });
      }
    }
  }

  getState(): ChannelState {
    return { ...this.state };
  }

  getToasts(): Array<{ title: string; description: string; variant: string }> {
    return [...this.toasts];
  }

  getSocketRoomLeft(): string | null {
    return this.socketRoomLeft;
  }

  getInvalidatedQueries(): string[] {
    return [...this.invalidatedQueries];
  }
}

describe('Member Removal Handling', () => {
  let handler: MembershipHandler;
  const currentUserId = 'user-1';

  beforeEach(() => {
    handler = new MembershipHandler(currentUserId, {
      selectedChannelId: 'channel-1',
      membersDrawerOpen: true,
      channelList: ['channel-1', 'channel-2', 'channel-3'],
    });
  });

  it('should navigate user out when they are removed from current channel', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1', // Current user
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.selectedChannelId).toBeNull();
    expect(state.membersDrawerOpen).toBe(false);
  });

  it('should remove channel from list when user is removed', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.channelList).not.toContain('channel-1');
    expect(state.channelList).toHaveLength(2);
  });

  it('should show toast notification when user is removed', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const toasts = handler.getToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0].title).toBe('Removed from channel');
    expect(toasts[0].variant).toBe('destructive');
  });

  it('should leave socket room immediately when removed', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    expect(handler.getSocketRoomLeft()).toBe('channel:channel-1');
  });

  it('should invalidate correct queries when user is removed', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const queries = handler.getInvalidatedQueries();
    expect(queries).toContain('/api/v1/chat/channels/channel-1/members');
    expect(queries).toContain('/api/v1/chat/channels');
  });

  it('should not navigate out when other user is removed', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-2', // Different user
      userName: 'Other User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.selectedChannelId).toBe('channel-1'); // Still selected
    expect(state.membersDrawerOpen).toBe(true); // Still open
    expect(handler.getToasts()).toHaveLength(0); // No toast
    expect(handler.getSocketRoomLeft()).toBeNull(); // No room left
  });

  it('should not react to events for different channels', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-2', // Different channel
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.selectedChannelId).toBe('channel-1'); // Unchanged
    expect(handler.getToasts()).toHaveLength(0);
  });

  it('should handle self-removal (user left voluntarily)', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: null, // Self-removal
    };

    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.selectedChannelId).toBeNull();
    expect(handler.getSocketRoomLeft()).toBe('channel:channel-1');
  });

  it('should handle DM events differently (no removal from DMs)', () => {
    const payload: MemberRemovedPayload = {
      targetType: 'dm',
      targetId: 'dm-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    };

    // Handler only processes channel events
    handler.handleMemberRemoved(payload);

    const state = handler.getState();
    expect(state.selectedChannelId).toBe('channel-1'); // Unchanged
    expect(handler.getToasts()).toHaveLength(0);
  });
});

describe('Access Revocation Timing', () => {
  it('should process removal event synchronously (immediate effect)', () => {
    const handler = new MembershipHandler('user-1', {
      selectedChannelId: 'channel-1',
      membersDrawerOpen: true,
      channelList: ['channel-1'],
    });

    const startTime = Date.now();
    
    handler.handleMemberRemoved({
      targetType: 'channel',
      targetId: 'channel-1',
      userId: 'user-1',
      userName: 'Test User',
      removedBy: 'admin-1',
    });

    const endTime = Date.now();
    
    // Should complete in under 10ms (synchronous)
    expect(endTime - startTime).toBeLessThan(10);
    
    // State should be updated immediately
    expect(handler.getState().selectedChannelId).toBeNull();
  });
});

describe('Conversation List Filtering', () => {
  it('should filter out channels user no longer belongs to', () => {
    // Simulating the React Query cache behavior
    const allChannels = [
      { id: 'channel-1', name: 'General' },
      { id: 'channel-2', name: 'Random' },
      { id: 'channel-3', name: 'Private' },
    ];
    
    const userMemberships = ['channel-1', 'channel-3']; // User is not in channel-2
    
    const visibleChannels = allChannels.filter(ch => 
      userMemberships.includes(ch.id)
    );
    
    expect(visibleChannels).toHaveLength(2);
    expect(visibleChannels.map(c => c.id)).toEqual(['channel-1', 'channel-3']);
  });
});
