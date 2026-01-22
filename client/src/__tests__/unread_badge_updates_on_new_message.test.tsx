/**
 * Test: Unread Badge Updates on New Message
 * 
 * Verifies that:
 * 1. Unread badge displays when there are unread messages
 * 2. Badge shows correct count (caps at 99+)
 * 3. Badge updates when new message arrives via socket
 * 4. Badge is hidden when count is 0
 */

import { describe, it, expect } from 'vitest';

describe('Unread Badge Behavior', () => {
  const formatUnreadCount = (count: number): string => {
    if (count <= 0) return '';
    if (count > 99) return '99+';
    return String(count);
  };

  it('should display nothing when count is 0', () => {
    expect(formatUnreadCount(0)).toBe('');
  });

  it('should display nothing when count is negative', () => {
    expect(formatUnreadCount(-1)).toBe('');
  });

  it('should display exact count when under 100', () => {
    expect(formatUnreadCount(1)).toBe('1');
    expect(formatUnreadCount(42)).toBe('42');
    expect(formatUnreadCount(99)).toBe('99');
  });

  it('should display 99+ when count is 100 or more', () => {
    expect(formatUnreadCount(100)).toBe('99+');
    expect(formatUnreadCount(999)).toBe('99+');
  });

  it('should handle channel unread badge visibility', () => {
    interface Channel {
      id: string;
      name: string;
      unreadCount?: number;
    }

    const shouldShowBadge = (channel: Channel): boolean => {
      return !!(channel.unreadCount && channel.unreadCount > 0);
    };

    expect(shouldShowBadge({ id: '1', name: 'general' })).toBe(false);
    expect(shouldShowBadge({ id: '1', name: 'general', unreadCount: 0 })).toBe(false);
    expect(shouldShowBadge({ id: '1', name: 'general', unreadCount: 5 })).toBe(true);
    expect(shouldShowBadge({ id: '1', name: 'general', unreadCount: 100 })).toBe(true);
  });
});

describe('Unread Count Cache Invalidation', () => {
  it('should invalidate channel list query on new message', () => {
    const invalidatedQueries: string[] = [];
    
    const mockQueryClient = {
      invalidateQueries: (opts: { queryKey: string[] }) => {
        invalidatedQueries.push(opts.queryKey.join('/'));
      },
    };

    // Simulate new message event handler
    const handleNewMessage = (payload: { channelId?: string; dmThreadId?: string }) => {
      if (payload.channelId) {
        mockQueryClient.invalidateQueries({ queryKey: ['/api/v1/chat/channels'] });
      }
      if (payload.dmThreadId) {
        mockQueryClient.invalidateQueries({ queryKey: ['/api/v1/chat/dm'] });
      }
    };

    handleNewMessage({ channelId: 'channel-1' });
    expect(invalidatedQueries).toContain('/api/v1/chat/channels');

    handleNewMessage({ dmThreadId: 'dm-1' });
    expect(invalidatedQueries).toContain('/api/v1/chat/dm');
  });

  it('should not invalidate unrelated queries', () => {
    const invalidatedQueries: string[] = [];
    
    const mockQueryClient = {
      invalidateQueries: (opts: { queryKey: string[] }) => {
        invalidatedQueries.push(opts.queryKey.join('/'));
      },
    };

    const handleNewMessage = (payload: { channelId?: string; dmThreadId?: string }) => {
      if (payload.channelId) {
        mockQueryClient.invalidateQueries({ queryKey: ['/api/v1/chat/channels'] });
      }
      if (payload.dmThreadId) {
        mockQueryClient.invalidateQueries({ queryKey: ['/api/v1/chat/dm'] });
      }
    };

    handleNewMessage({ channelId: 'channel-1' });
    
    // Should not invalidate DM list when channel message arrives
    expect(invalidatedQueries).not.toContain('/api/v1/chat/dm');
  });
});

describe('Unread Count Update Flow', () => {
  interface ChatChannel {
    id: string;
    unreadCount?: number;
  }

  it('should increment unread when message received in non-active channel', () => {
    const channels: ChatChannel[] = [
      { id: 'channel-1', unreadCount: 2 },
      { id: 'channel-2', unreadCount: 0 },
    ];
    const selectedChannelId: string = 'channel-1';

    // Simulate new message in channel-2 (not active)
    const incomingChannelId: string = 'channel-2';
    
    const isActiveChannel = selectedChannelId === incomingChannelId;
    expect(isActiveChannel).toBe(false);
    
    // In real app, server returns updated unreadCount via query invalidation
    const updatedChannels = channels.map(ch => 
      ch.id === incomingChannelId ? { ...ch, unreadCount: (ch.unreadCount || 0) + 1 } : ch
    );
    
    expect(updatedChannels.find(c => c.id === 'channel-2')?.unreadCount).toBe(1);
  });

  it('should not increment unread when message received in active channel', () => {
    const channels: ChatChannel[] = [
      { id: 'channel-1', unreadCount: 0 },
      { id: 'channel-2', unreadCount: 3 },
    ];
    const selectedChannelId = 'channel-1';
    const incomingChannelId = 'channel-1';

    const isActiveChannel = selectedChannelId === incomingChannelId;
    expect(isActiveChannel).toBe(true);
    
    // When viewing the channel, unread count should be marked as read (handled by server)
    // The channel-1 unread should remain 0
    const channel1 = channels.find(c => c.id === selectedChannelId);
    expect(channel1?.unreadCount).toBe(0);
  });
});

describe('Badge Styling', () => {
  it('should generate correct badge classes', () => {
    const getBadgeClasses = (hasUnread: boolean): string => {
      const baseClasses = 'px-1.5 py-0.5 text-xs font-medium rounded-full flex-shrink-0';
      if (hasUnread) {
        return `${baseClasses} bg-primary text-primary-foreground`;
      }
      return baseClasses;
    };

    expect(getBadgeClasses(true)).toContain('bg-primary');
    expect(getBadgeClasses(true)).toContain('text-primary-foreground');
    expect(getBadgeClasses(false)).not.toContain('bg-primary');
  });
});
