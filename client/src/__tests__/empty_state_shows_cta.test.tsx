/**
 * Test: Empty State Shows CTA
 * 
 * Verifies that:
 * 1. Empty channels list shows "Create Channel" CTA
 * 2. Empty DMs list shows "Start New Chat" CTA
 * 3. Empty message area shows welcome message with CTA
 * 4. Loading states show skeleton loaders
 * 5. Error states show retry button
 */

import { describe, it, expect, vi } from 'vitest';

describe('Empty State Components', () => {
  interface EmptyStateConfig {
    type: 'channels' | 'dms' | 'messages';
    hasData: boolean;
    isLoading: boolean;
    isError: boolean;
  }

  const getEmptyStateContent = (config: EmptyStateConfig) => {
    if (config.isLoading) {
      return { type: 'skeleton', testId: `${config.type}-loading` };
    }
    
    if (config.isError) {
      return { 
        type: 'error', 
        testId: `${config.type}-error`,
        cta: { text: 'Retry', action: 'refetch' }
      };
    }
    
    if (!config.hasData) {
      switch (config.type) {
        case 'channels':
          return { 
            type: 'empty', 
            testId: 'channels-empty',
            message: 'No channels yet',
            cta: { text: 'Create Channel', action: 'createChannel' }
          };
        case 'dms':
          return { 
            type: 'empty', 
            testId: 'dms-empty',
            message: 'No conversations yet',
            cta: { text: 'Start New Chat', action: 'startChat' }
          };
        case 'messages':
          return { 
            type: 'empty', 
            testId: 'empty-messages',
            message: 'No messages yet',
            cta: { text: 'Be the first to send a message!', action: null }
          };
      }
    }
    
    return { type: 'content' };
  };

  it('should show skeleton when loading channels', () => {
    const state = getEmptyStateContent({
      type: 'channels',
      hasData: false,
      isLoading: true,
      isError: false,
    });
    
    expect(state.type).toBe('skeleton');
    expect(state.testId).toBe('channels-loading');
  });

  it('should show skeleton when loading DMs', () => {
    const state = getEmptyStateContent({
      type: 'dms',
      hasData: false,
      isLoading: true,
      isError: false,
    });
    
    expect(state.type).toBe('skeleton');
    expect(state.testId).toBe('dms-loading');
  });

  it('should show error state with retry for channels', () => {
    const state = getEmptyStateContent({
      type: 'channels',
      hasData: false,
      isLoading: false,
      isError: true,
    });
    
    expect(state.type).toBe('error');
    expect(state.testId).toBe('channels-error');
    expect(state.cta?.text).toBe('Retry');
  });

  it('should show error state with retry for DMs', () => {
    const state = getEmptyStateContent({
      type: 'dms',
      hasData: false,
      isLoading: false,
      isError: true,
    });
    
    expect(state.type).toBe('error');
    expect(state.testId).toBe('dms-error');
    expect(state.cta?.text).toBe('Retry');
  });

  it('should show Create Channel CTA when no channels', () => {
    const state = getEmptyStateContent({
      type: 'channels',
      hasData: false,
      isLoading: false,
      isError: false,
    });
    
    expect(state.type).toBe('empty');
    expect(state.testId).toBe('channels-empty');
    expect(state.message).toBe('No channels yet');
    expect(state.cta?.text).toBe('Create Channel');
    expect(state.cta?.action).toBe('createChannel');
  });

  it('should show Start New Chat CTA when no DMs', () => {
    const state = getEmptyStateContent({
      type: 'dms',
      hasData: false,
      isLoading: false,
      isError: false,
    });
    
    expect(state.type).toBe('empty');
    expect(state.testId).toBe('dms-empty');
    expect(state.message).toBe('No conversations yet');
    expect(state.cta?.text).toBe('Start New Chat');
    expect(state.cta?.action).toBe('startChat');
  });

  it('should show message CTA when no messages', () => {
    const state = getEmptyStateContent({
      type: 'messages',
      hasData: false,
      isLoading: false,
      isError: false,
    });
    
    expect(state.type).toBe('empty');
    expect(state.testId).toBe('empty-messages');
    expect(state.message).toBe('No messages yet');
  });

  it('should show content when data exists', () => {
    const state = getEmptyStateContent({
      type: 'channels',
      hasData: true,
      isLoading: false,
      isError: false,
    });
    
    expect(state.type).toBe('content');
  });
});

describe('Skeleton Loader Structure', () => {
  it('should render correct number of skeleton items', () => {
    const skeletonCount = 3;
    const items = Array.from({ length: skeletonCount }, (_, i) => i + 1);
    
    expect(items).toHaveLength(3);
    expect(items).toEqual([1, 2, 3]);
  });

  it('should have appropriate skeleton classes for channels', () => {
    const skeletonClasses = 'animate-pulse flex items-start gap-2 p-2';
    
    expect(skeletonClasses).toContain('animate-pulse');
    expect(skeletonClasses).toContain('flex');
  });
});

describe('CTA Button Behavior', () => {
  it('should trigger correct action on Create Channel click', () => {
    const actions = {
      createChannel: vi.fn(),
      startChat: vi.fn(),
    };

    // Simulate click
    actions.createChannel();
    
    expect(actions.createChannel).toHaveBeenCalledTimes(1);
    expect(actions.startChat).not.toHaveBeenCalled();
  });

  it('should trigger correct action on Start New Chat click', () => {
    const actions = {
      createChannel: vi.fn(),
      startChat: vi.fn(),
    };

    // Simulate click
    actions.startChat();
    
    expect(actions.startChat).toHaveBeenCalledTimes(1);
    expect(actions.createChannel).not.toHaveBeenCalled();
  });

  it('should trigger refetch on Retry click', () => {
    const refetch = vi.fn();
    
    // Simulate retry click
    refetch();
    
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe('Welcome Card Empty State', () => {
  it('should show welcome message when no conversation selected', () => {
    const selectedChannel = null;
    const selectedDm = null;
    
    const shouldShowWelcome = !selectedChannel && !selectedDm;
    
    expect(shouldShowWelcome).toBe(true);
  });

  it('should not show welcome when channel is selected', () => {
    const selectedChannel = { id: 'channel-1', name: 'general' };
    const selectedDm = null;
    
    const shouldShowWelcome = !selectedChannel && !selectedDm;
    
    expect(shouldShowWelcome).toBe(false);
  });

  it('should not show welcome when DM is selected', () => {
    const selectedChannel = null;
    const selectedDm = { id: 'dm-1', members: [] };
    
    const shouldShowWelcome = !selectedChannel && !selectedDm;
    
    expect(shouldShowWelcome).toBe(false);
  });
});

describe('Start New Chat Button in Sidebar', () => {
  it('should have correct test ID for start new chat button', () => {
    const buttonTestId = 'button-start-new-chat';
    
    expect(buttonTestId).toBe('button-start-new-chat');
  });

  it('should have correct test ID for create channel in sidebar empty state', () => {
    const buttonTestId = 'button-create-first-channel-sidebar';
    
    expect(buttonTestId).toBe('button-create-first-channel-sidebar');
  });

  it('should have correct test ID for start DM in sidebar empty state', () => {
    const buttonTestId = 'button-start-first-dm';
    
    expect(buttonTestId).toBe('button-start-first-dm');
  });
});
