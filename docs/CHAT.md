# Chat System Documentation

## Overview

MyWorkDay includes a tenant-scoped Slack-like chat system with channels and direct messages. The chat system uses Socket.IO for real-time messaging with session-based authentication.

## Architecture

### Components

- **Client Socket** (`client/src/lib/realtime/socket.ts`): Manages Socket.IO connection with automatic reconnection
- **Server Socket** (`server/realtime/socket.ts`): Handles room management and event broadcasting
- **Chat Routes** (`server/routes/chat.ts`): REST API for CRUD operations
- **Chat Page** (`client/src/pages/chat.tsx`): Main chat UI with channels, DMs, and message display

### Event Types (from `shared/events/index.ts`)

| Event | Description |
|-------|-------------|
| `chat:newMessage` | New message received in channel/DM |
| `chat:messageUpdated` | Message was edited |
| `chat:messageDeleted` | Message was deleted |
| `chat:channelCreated` | New channel created |
| `chat:memberJoined` | User joined a channel (tenant-level) |
| `chat:memberLeft` | User left or was removed from channel (tenant-level) |
| `chat:memberAdded` | User added to channel (channel room level, richer info) |
| `chat:memberRemoved` | User removed from channel (channel room level, richer info) |
| `connection:connected` | Server ack with serverTime and requestId |

## Message Lifecycle

### Sending a Message

1. **Optimistic Insert**: Message added to UI immediately with `_status: 'pending'` and unique `_tempId`
2. **API Request**: POST to `/api/v1/chat/channels/:channelId/messages` or `/api/v1/chat/dm/:dmId/messages`
3. **Server Processing**: Message persisted to database with server-generated `id` and `createdAt`
4. **Socket Broadcast**: Server emits `chat:newMessage` to channel/DM room
5. **Reconciliation**: Client matches incoming message to pending message by body+recency, replaces with confirmed message
6. **Failure Handling**: If API fails, message marked `_status: 'failed'` with retry button

### Message States

| State | Description | UI Treatment |
|-------|-------------|--------------|
| `pending` | Sent but not confirmed | Loader icon, greyed |
| `sent` | Confirmed by server | Normal display |
| `failed` | Send failed | Alert icon, retry/remove buttons |

### Stale Pending Cleanup

Messages stuck in `pending` state for >2 minutes are automatically marked as `failed`.

## Socket Reconnection Rules

### Automatic Reconnection

- Socket.IO configured with infinite reconnection attempts
- Reconnection delay: 1-5 seconds (exponential backoff)
- Connection timeout: 20 seconds

### Room Rejoin on Reconnect

1. Client tracks all joined chat rooms in `joinedChatRooms` Set
2. On `connect` event, all tracked rooms are automatically rejoined
3. Server validates room access using authenticated session data

### Connection State Tracking

```typescript
import { isSocketConnected, onConnectionChange } from '@/lib/realtime/socket';

// Check current state
const connected = isSocketConnected();

// Subscribe to changes
const unsubscribe = onConnectionChange((connected) => {
  console.log('Connection:', connected ? 'online' : 'offline');
});
```

### Server Connected Ack

On connection, server emits `connection:connected` with:
- `serverTime`: ISO timestamp for clock sync
- `requestId`: Unique connection ID for debugging
- `userId`: Authenticated user ID
- `tenantId`: User's tenant ID

## Membership Sync

### Adding Members

1. POST `/api/v1/chat/channels/:channelId/members` with `{ userIds: [...] }`
2. Server validates caller is channel member
3. Server emits `chat:memberJoined` (tenant-level) and `chat:memberAdded` (room-level)
4. Client invalidates members list query

### Removing Members

1. DELETE `/api/v1/chat/channels/:channelId/members/:userId`
2. Server validates permissions (self-remove, owner, or admin)
3. Server emits `chat:memberLeft` and `chat:memberRemoved`
4. If removed user is current user:
   - Socket room left immediately
   - Channel deselected
   - Toast notification shown
   - Channel list refreshed

### Permission Model

- Users can always remove themselves (leave)
- Channel creator can remove anyone
- Channel owners (role=owner) can remove anyone
- Tenant admins can remove anyone

## Ordering Guarantees

Messages are always sorted by:
1. `createdAt` timestamp (server-generated)
2. `id` (UUID string comparison for same-timestamp messages)

Client time is never used for ordering.

## Cache Invalidation (TanStack Query)

### On New Message
- Invalidate channel list (for last message preview)
- Invalidate DM list

### On Membership Change
- Invalidate channel members list
- Invalidate channel list (if user was added/removed)

## Duplicate Prevention

### Client-Side Guards

- `seenMessageIds` Set tracks all processed message IDs
- Duplicate socket events are ignored

### Server-Side Guards

- Room join requests check if already in room
- Message IDs are UUIDs (collision-resistant)

## Security

### Tenant Isolation

- All chat operations require valid tenant context
- Channel/DM access validated against tenant membership
- Socket room joins validated using server-derived userId (not client-supplied)

### Authentication

- Session-based authentication via Passport.js
- Socket connections inherit session from HTTP handshake
- Unauthenticated sockets cannot join chat rooms

## Railway Deployment Checklist

### Pre-Deployment

1. Ensure DATABASE_URL is configured
2. Verify SESSION_SECRET is set
3. Check Socket.IO connection URL matches production domain

### Post-Deployment

1. Test socket connection from deployed client
2. Verify room join/leave works
3. Test message send/receive
4. Test reconnection (disable network briefly)
5. Verify member add/remove with multi-user test

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| SESSION_SECRET | Yes | Session encryption key |
| NODE_ENV | Recommended | Set to `production` |

## Troubleshooting

### Messages Not Appearing

1. Check browser console for socket connection status
2. Verify user has access to channel/DM
3. Check server logs for room join validation

### Reconnection Issues

1. Check network connectivity
2. Verify session is still valid (not expired)
3. Check server logs for authentication errors

### Duplicate Messages

1. Should be prevented by `seenMessageIds` guard
2. If occurring, check for multiple socket connections (multiple tabs)
3. Verify socket event handlers are properly cleaned up on unmount

## UX Guidelines

### Conversation List Sidebar

- **Last Message Preview**: Each channel/DM shows truncated last message (30 chars max)
- **Relative Timestamps**: Shows "now", "5m", "2h", "3d", or "Jan 15" format
- **Unread Badge**: Red badge with count, caps at "99+" for large counts
- **Active Highlight**: Selected conversation has `bg-sidebar-accent` background
- **Empty States**: 
  - Channels: Shows "No channels yet" with "Create Channel" CTA button
  - DMs: Shows "No conversations yet" with "Start New Chat" CTA button

### Conversation Header

- **Channel Name + Member Count**: Shows "#channel-name 5 members"
- **Members Button**: Opens member management drawer with text label
- **DM Name + Count**: Shows participant names and member count
- **Connection Status**: Shows "Reconnecting..." indicator when offline

### Message Composer

- **Enter to Send**: Press Enter to send message immediately
- **Shift+Enter for Newline**: Creates new line in the message (uses auto-sizing Textarea)
- **Disabled When Empty**: Send button disabled when message is empty and no attachments
- **Auto-Focus**: Message input automatically focuses when conversation is selected
- **Sending Indicator**: Pending messages show "Sending..." with spinner icon

### Loading States

- **Skeleton Loaders**: 
  - Channels list: 3 skeleton items with icon + text placeholders
  - DMs list: 3 skeleton items with avatar + text placeholders
  - Messages: 3 skeleton items with avatar + message content placeholders
- **Error States**: Show error icon, message, and "Retry" button
- **Empty Messages**: Shows welcome icon and "Be the first to send a message!" text

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line in message |
| `Escape` | Cancel editing |

### Accessibility

- All interactive elements have `data-testid` attributes for testing
- Buttons have appropriate aria labels
- Loading states announce via skeleton animations
- Error messages are visible and actionable
