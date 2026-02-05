# Chat Phase 6: Engagement Upgrades

## Overview

This phase adds message engagement features including actions menu, quote reply, create task from message, and reactions (behind feature flag).

## Features

### 1. Message Actions Menu

A dropdown menu appears on hover for each non-deleted message with the following actions:

| Action | Description | Availability |
|--------|-------------|--------------|
| Copy text | Copies message body to clipboard | All messages |
| Quote reply | Prefills composer with quoted message | All messages |
| Create task | Opens task creation modal | All messages |
| Edit | Opens inline editor | Own messages only |
| Delete | Soft-deletes message | Own messages or admin |

**Implementation in ChatMessageTimeline:**
```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
      <MoreHorizontal className="h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    <DropdownMenuItem onClick={() => onCopyMessage?.(message.body)}>
      <Copy className="h-4 w-4 mr-2" />
      Copy text
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => onQuoteReply?.(authorName, message.body)}>
      <Quote className="h-4 w-4 mr-2" />
      Quote reply
    </DropdownMenuItem>
    <DropdownMenuItem onClick={() => onCreateTaskFromMessage?.(message)}>
      <ListTodo className="h-4 w-4 mr-2" />
      Create task
    </DropdownMenuItem>
    {/* Edit and Delete for authorized users */}
  </DropdownMenuContent>
</DropdownMenu>
```

### 2. Copy Text

- Copies message body to clipboard using `navigator.clipboard.writeText()`
- Shows toast confirmation: "Copied to clipboard"

```typescript
const handleCopyMessage = (body: string) => {
  navigator.clipboard.writeText(body);
  toast({
    title: "Copied to clipboard",
    description: "Message text copied successfully.",
  });
};
```

### 3. Quote Reply

When user clicks "Quote reply":
1. Sets quote state with author name and message body
2. Quote indicator appears above composer
3. User can type their response
4. Quote is cleared when message is sent or cancelled

State:
```typescript
const [quoteReply, setQuoteReply] = useState<{ 
  authorName: string; 
  body: string 
} | null>(null);
```

Handler:
```typescript
const handleQuoteReply = (authorName: string, body: string) => {
  setQuoteReply({ authorName, body });
  setTimeout(() => messageInputRef.current?.focus(), 100);
};
```

### 4. Create Task from Message

Opens a modal to create a task with message content prefilled.

**Modal Content:**
- Task title (prefilled from message, truncated to 80 chars)
- Message content preview
- Reference info (conversation type + message ID)

**State:**
```typescript
const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
const [createTaskMessage, setCreateTaskMessage] = useState<{
  id: string;
  body: string;
  authorName: string;
  conversationType: "channel" | "dm";
  conversationId: string;
} | null>(null);
```

**Current Status:** UI-only implementation with "Coming soon" toast. Will be wired to task creation API when available.

### 5. Reactions (Feature Flag OFF)

Reactions are not yet implemented due to missing database schema.

**Future Implementation:**

When enabled, reactions will include:
- Reaction button in message actions
- Emoji picker popup
- Reaction display below message
- Reaction count and participants

**Database Schema Required:**
```sql
CREATE TABLE chat_message_reactions (
  id UUID PRIMARY KEY,
  message_id UUID REFERENCES chat_messages(id),
  user_id UUID REFERENCES users(id),
  emoji VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);
```

**Feature Flag:**
```typescript
const FEATURES = {
  CHAT_REACTIONS: false, // Enable when backend ready
};
```

## Props Interface Updates

ChatMessageTimeline now accepts these additional props:
```typescript
interface ChatMessageTimelineProps {
  // ... existing props
  onCopyMessage?: (body: string) => void;
  onQuoteReply?: (authorName: string, body: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
}
```

## Test IDs

### Message Actions
- `message-menu-{id}` - Actions dropdown trigger
- `message-copy-{id}` - Copy text action
- `message-quote-{id}` - Quote reply action
- `message-create-task-{id}` - Create task action
- `message-edit-{id}` - Edit action
- `message-delete-{id}` - Delete action

### Create Task Modal
- `input-task-title` - Task title input
- `button-confirm-create-task` - Create button

## Integration with Chat Page

```tsx
<ChatMessageTimeline
  messages={messages}
  currentUserId={user?.id}
  currentUserRole={user?.role}
  onCopyMessage={handleCopyMessage}
  onQuoteReply={handleQuoteReply}
  onCreateTaskFromMessage={handleCreateTaskFromMessage}
  // ... other props
/>
```

## Future Enhancements

- Wire Create Task to task API when available
- Add reactions backend and enable feature flag
- Add message forwarding
- Add message threading
- Add message pinning
- Add message bookmarking
