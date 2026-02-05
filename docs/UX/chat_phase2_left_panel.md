# Chat Phase 2: Conversation List Panel

## Overview

This phase implements an upgraded left panel for the chat system with a unified conversation list grouped by type, showing channels and direct messages with rich metadata.

## Component: ConversationListPanel

Location: `client/src/features/chat/ConversationListPanel.tsx`

### Features

1. **Search Input**
   - Client-side filtering of conversations
   - Filters both channels and DMs by name
   - Instant results as user types

2. **Grouped Sections**
   - **Channels Section**: Project/team channels with collapsible header
   - **Direct Messages Section**: DM threads with collapsible header
   - Each section shows count and aggregate unread badge

3. **Conversation Row Display**
   - Name (channel name or DM participant names)
   - Last message preview (truncated, mentions cleaned)
   - Last activity timestamp (relative: now, 5m, 2h, 3d)
   - Unread badge (if available)
   - Avatar/icon:
     - Channels: Hash (#) for public, Lock for private
     - DMs: User avatar or group icon for multi-user DMs

4. **Quick Actions**
   - "New DM" button - opens start chat drawer
   - "New Channel" button - opens channel creation dialog (configurable)

5. **URL Sync**
   - Clicking a row updates URL: `/chat?c=channel:{id}` or `/chat?c=dm:{id}`
   - Selection persists across page refresh via URL state
   - Browser back/forward navigation works correctly

### Props Interface

```typescript
interface ConversationListPanelProps {
  channels: ChatChannel[];           // List of channels
  dmThreads: ChatDmThread[];         // List of DM threads
  currentUserId?: string;            // Current user for filtering DM display names
  selectedConversation: SelectedConversation | null;  // Current selection
  onSelectConversation: (type: "channel" | "dm", id: string) => void;
  onNewDm: () => void;               // Handler for New DM button
  onNewChannel: () => void;          // Handler for New Channel button
  isLoading?: boolean;               // Show loading skeletons
  showNewChannelButton?: boolean;    // Toggle channel creation button
  className?: string;
}
```

### Data Types

```typescript
interface ChatChannel {
  id: string;
  tenantId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
  memberCount?: number;
}

interface ChatDmThread {
  id: string;
  tenantId: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
  members: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  }>;
}
```

### Integration

The panel is integrated into `chat.tsx` within the Chats tab:

```tsx
<ConversationListPanel
  channels={channels}
  dmThreads={dmThreads}
  currentUserId={user?.id}
  selectedConversation={selectedConversation}
  onSelectConversation={handleConversationSelect}
  onNewDm={() => setStartChatDrawerOpen(true)}
  onNewChannel={() => setCreateChannelOpen(true)}
  isLoading={isLoadingChannels || isLoadingDmThreads}
  showNewChannelButton={true}
/>
```

### URL State Management

Uses the shared `useChatUrlState` hook from `client/src/features/chat/ChatLayout.tsx`:

```typescript
export function useChatUrlState() {
  // Parses ?c=channel:id or ?c=dm:id from URL
  // Returns helpers for getting and updating URL state
  return {
    searchString,           // Raw URL search string
    selectedConversation,   // Parsed { type, id } or null
    getConversationFromUrl, // Function to parse URL
    updateUrl,              // Function to update URL
  };
}
```

## Visual Design

- Sidebar background uses `bg-sidebar` token
- Section headers are collapsible with chevron icons
- Selected conversation uses `bg-accent text-accent-foreground`
- Hover state uses `hover-elevate` utility class
- Unread badges use `variant="destructive"` for visibility
- Compact layout with proper spacing and truncation

## Future Enhancements

- Online status indicators for DM participants
- Pinned conversations section
- Typing indicators in conversation list
- Last active / presence information
- Conversation muting/archiving
