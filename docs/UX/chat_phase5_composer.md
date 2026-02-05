# Chat Phase 5: Composer Upgrade

## Overview

This phase upgrades the chat message composer with enhanced keyboard shortcuts, draft persistence, error handling, and attachments UI.

## Features

### 1. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | Insert newline |

Implementation in `chat.tsx`:
```typescript
const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
  // Shift+Enter allows default behavior (newline in textarea)
};
```

### 2. Send Button Disabled State

The send button is disabled when:
- Message input is empty AND no pending attachments
- A message send is in progress

```tsx
<Button
  type="submit"
  size="icon"
  disabled={(!messageInput.trim() && pendingAttachments.length === 0) || sendMessageMutation.isPending}
>
  <Send className="h-4 w-4" />
</Button>
```

### 3. Inline Error Display

When a message fails to send:
- Error message is displayed inline above the composer
- Dismiss button to clear the error
- Error is automatically cleared when a new message is attempted

State:
```typescript
const [sendError, setSendError] = useState<string | null>(null);
```

UI:
```tsx
{sendError && (
  <div className="mb-2 flex items-center gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
    <AlertCircle className="h-4 w-4 flex-shrink-0" />
    <span className="flex-1">{sendError}</span>
    <Button variant="ghost" onClick={() => setSendError(null)}>
      Dismiss
    </Button>
  </div>
)}
```

### 4. Draft Persistence

Drafts are automatically saved to localStorage per conversation:

**Key Format:**
- Channels: `chat-draft:channel:{channelId}`
- DMs: `chat-draft:dm:{dmThreadId}`

**Behavior:**
- Debounced save (500ms delay) to avoid excessive writes
- Draft loaded when switching conversations
- Draft cleared from localStorage when message is sent successfully
- Empty drafts are removed from storage

```typescript
// Load draft on conversation change
useEffect(() => {
  const key = getConversationKey();
  if (key) {
    const savedDraft = localStorage.getItem(key);
    if (savedDraft) {
      setMessageInput(savedDraft);
    } else {
      setMessageInput("");
    }
  }
}, [selectedChannel?.id, selectedDm?.id]);

// Save draft (debounced)
useEffect(() => {
  const key = getConversationKey();
  if (!key) return;
  
  const timeoutId = setTimeout(() => {
    if (messageInput.trim()) {
      localStorage.setItem(key, messageInput);
    } else {
      localStorage.removeItem(key);
    }
  }, 500);

  return () => clearTimeout(timeoutId);
}, [messageInput, selectedChannel?.id, selectedDm?.id]);
```

### 5. Attachments UI

Already implemented with:
- Paperclip button to open file picker
- Drag-and-drop zone with visual indicator
- Pending attachments preview with remove button
- File type icons based on MIME type
- Loading spinner during upload

**Supported File Types:**
- Images: `.png`, `.jpg`, `.jpeg`, `.webp`
- Documents: `.pdf`, `.docx`, `.xlsx`, `.csv`

**Upload Flow:**
1. User selects or drops file(s)
2. Files uploaded via presigned URL
3. Attachments appear in pending preview
4. Attachments sent with message

### 6. Quote Reply UI

When quoting a message:
- Quote indicator appears above composer
- Shows author name and truncated message
- Cancel button to remove quote

```tsx
{quoteReply && (
  <div className="mb-2 flex items-start gap-2 p-2 rounded-md bg-muted border-l-2 border-primary">
    <div className="flex-1 min-w-0">
      <div className="text-xs font-medium text-muted-foreground mb-0.5">
        Replying to {quoteReply.authorName}
      </div>
      <div className="text-sm text-muted-foreground truncate">
        {quoteReply.body}
      </div>
    </div>
    <Button size="icon" variant="ghost" onClick={() => setQuoteReply(null)}>
      <X className="h-4 w-4" />
    </Button>
  </div>
)}
```

## @Mentions

The composer supports @mentions for channel messages:
- Type `@` to open user picker
- Select user from dropdown
- User is inserted as mention syntax: `@[Name](userId)`
- Mentions are rendered as highlighted links in messages

## Test IDs

- `message-composer-form` - Form element
- `input-message` - Message textarea
- `button-send-message` - Send button
- `button-attach-file` - Attachment button
- `input-file-upload` - File input
- `pending-attachment-{id}` - Pending attachment preview
- `remove-attachment-{id}` - Remove attachment button
- `send-error-indicator` - Error message display
- `button-dismiss-error` - Error dismiss button
- `quote-reply-indicator` - Quote reply display
- `button-cancel-quote` - Cancel quote button
- `mention-user-{id}` - User in mention picker

## Future Enhancements

- Emoji picker integration
- Slash commands
- Message scheduling
- Voice message recording
