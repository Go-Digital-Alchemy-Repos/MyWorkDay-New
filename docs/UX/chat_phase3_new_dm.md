# Chat Phase 3: New DM Flow

## Overview

This phase ensures the "New DM" flow properly creates direct message conversations and navigates to them via URL-based deep linking.

## User Flow

1. User clicks "New DM" button in the chat sidebar (or "Start New Chat" button)
2. A drawer opens with searchable tenant user selector
3. User selects 1 team member and clicks "Start Direct Message"
4. System creates or retrieves existing DM thread (idempotent)
5. Drawer closes and app navigates to `/chat?c=dm:{id}`
6. Messages load for the selected conversation

## Backend API

### Create DM Thread
```
POST /api/v1/chat/dm
Body: { userIds: string[] }
Response: ChatDmThread (with members and thread ID)
```

**Behavior:**
- Tenant-scoped (requires tenant context from session)
- Idempotent: if a DM already exists between the users, returns existing thread
- For 1:1 DMs, pass array with single userId (current user auto-included)
- For group DMs, pass multiple userIds

### Validation Schema
```typescript
const createDmSchema = z.object({
  userIds: z.array(z.string()).min(1).max(10),
});
```

## Frontend Implementation

### Start Chat Drawer

Location: `client/src/pages/chat.tsx`

The drawer provides:
- Search input for filtering team members by name/email
- Checkbox selection for multiple users
- Selected users displayed as removable chips
- Group name input (shown for 2+ selections)
- Dynamic button text based on selection count

### Mutations

**startNewChatMutation** (for 1:1 DMs):
```typescript
const startNewChatMutation = useMutation({
  mutationFn: async (userIds: string[]) => {
    const res = await apiRequest("POST", "/api/v1/chat/dm", { userIds });
    return res.json();
  },
  onSuccess: async (result) => {
    // Reset drawer state
    setStartChatSelectedUsers(new Set());
    setStartChatSearchQuery("");
    setStartChatDrawerOpen(false);
    
    // Refetch DM list and select new thread
    await queryClient.refetchQueries({ queryKey: ["/api/v1/chat/dm"] });
    
    if (result?.id) {
      const dmList = queryClient.getQueryData<ChatDmThread[]>(["/api/v1/chat/dm"]);
      const newDm = dmList?.find(dm => dm.id === result.id);
      if (newDm) {
        setSelectedDm(newDm);
        setSelectedChannel(null);
        updateUrlForConversation("dm", newDm.id);
      }
    }
  },
});
```

**createGroupFromDrawerMutation** (for group chats):
```typescript
const createGroupFromDrawerMutation = useMutation({
  mutationFn: async ({ name, userIds }) => {
    // Creates private channel and adds members
    const channel = await apiRequest("POST", "/api/v1/chat/channels", { name, isPrivate: true });
    await apiRequest("POST", `/api/v1/chat/channels/${channel.id}/members`, { userIds });
    return { channel };
  },
  onSuccess: (result) => {
    // Reset state, select channel, update URL
    updateUrlForConversation("channel", result.channel.id);
  },
});
```

## URL Navigation

After creating a DM or channel, the URL is updated using `updateUrlForConversation`:
- DM: `/chat?c=dm:{threadId}`
- Channel: `/chat?c=channel:{channelId}`

This ensures:
- Deep linking works (shareable URLs)
- Browser back/forward navigation works
- Page refresh restores correct conversation

## Data Types

```typescript
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

## Security Considerations

- All endpoints require authentication
- Tenant isolation via `getCurrentTenantId(req)`
- Users can only create DMs with other tenant members
- DM membership validated before message access

## Test IDs

- `button-start-new-chat` - Opens the Start Chat drawer
- `input-start-chat-search` - Search input for team members
- `start-chat-user-{id}` - Individual user row
- `start-chat-checkbox-{id}` - Checkbox for user selection
- `remove-chip-{id}` - Remove button on selected user chip
- `button-create-chat-from-drawer` - Submit button to create DM/group
