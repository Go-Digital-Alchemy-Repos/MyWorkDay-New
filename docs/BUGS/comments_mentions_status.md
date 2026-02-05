# Comments & Mentions System Status

## Overview
This document captures the current state of the comments and @mentions system for tasks and subtasks, identifies root causes for known issues, and outlines the plan for fixes.

## Current Implementation Status

### Backend Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/tasks/:taskId/comments` | GET | List comments for task | ✅ Working |
| `/api/tasks/:taskId/comments` | POST | Create comment for task | ✅ Working |
| `/api/comments/:id` | PATCH | Update comment | ✅ Working |
| `/api/comments/:id` | DELETE | Delete comment | ✅ Working |
| `/api/comments/:id/resolve` | POST | Resolve comment thread | ✅ Working |
| `/api/comments/:id/unresolve` | POST | Unresolve comment thread | ✅ Working |
| `/api/subtasks/:subtaskId/comments` | GET | List comments for subtask | ✅ Working |
| `/api/subtasks/:subtaskId/comments` | POST | Create comment for subtask | ✅ Working |

### Database Tables

- `comments` table: Stores comment body, userId, taskId, **subtaskId** (optional), timestamps, resolve status
- `comment_mentions` table: Tracks @mentions in comments (commentId → mentionedUserId)

### UI Components

| Component | File | Description |
|-----------|------|-------------|
| CommentThread | `client/src/components/comment-thread.tsx` | Displays list of comments with actions |
| CommentEditor | `client/src/components/richtext/CommentEditor.tsx` | TipTap-based editor with @mention support |
| TaskDetailDrawer | `client/src/features/tasks/task-detail-drawer.tsx` | Uses CommentThread for task comments |

### @Mentions Infrastructure

- **Frontend**: TipTap `@tiptap/extension-mention` extension in CommentEditor
- **Storage format**: TipTap JSON with mention nodes containing `id` and `label` attributes
- **Parsing**: `extractMentionsFromTipTapJson()` extracts user IDs from mention nodes
- **Tenant users**: Fetched via `/api/tenant/users` for mention autocomplete
- **Mention records**: Stored in `comment_mentions` table
- **Display**: `renderMentions()` parses `@[Name](userId)` format for display

### Notification System

- `notifyCommentMention()` - In-app notification when user is @mentioned
- `notifyCommentAdded()` - In-app notification for task assignees when comment is added
- Email notifications via `emailOutboxService` for mentions (when user has email)

## Root Cause Analysis

### Issue: "Post Comment not appearing immediately"

**Investigation Findings:**

1. **Backend works correctly**: POST `/api/tasks/:taskId/comments` returns 201 with created comment
2. **Query invalidation is correct**: `invalidateCommentQueries()` invalidates the correct query key
3. **Potential issue identified**: The created comment is returned without the `user` relation, but the UI expects `Comment & { user?: User }`. While the subsequent refetch after invalidation gets the full data, there could be a brief moment where the comment appears without user info.

**Root Cause**: The primary issue is likely that:
- The mutation returns the raw comment without user data
- The query refetch after invalidation should work, but if there's any caching issue or the drawer closes before refetch completes, comments may not appear
- Need to verify actual behavior in browser console/network tab

**Resolution Plan**:
1. Update POST endpoint to return comment with user relation
2. Add optimistic update or ensure proper cache invalidation timing
3. Add error toast if comment creation fails

### Issue: Subtask comments not supported (RESOLVED ✅)

**Root Cause**: No backend endpoints existed for subtask comments.

**Resolution (Completed 2026-02-05)**:
1. ✅ Added `subtaskId` column to comments table (additive change via direct SQL)
2. ✅ Added index on `subtask_id` column
3. ✅ Created GET/POST endpoints for `/api/subtasks/:subtaskId/comments`
4. ✅ Added storage method `getCommentsBySubtask()`
5. ✅ POST endpoint includes full @mention support (notifications, email)
6. ✅ Tenant ownership validation on both endpoints (getEffectiveTenantId + getTaskByIdAndTenant)
7. ✅ Comment-added notifications for subtask assignees (notifyCommentAdded parity with task comments)
8. ⏳ UI integration pending - need to add CommentThread to subtask detail drawer

## Plan for Fixes

### Phase 1: Fix Comments Posting Reliability (COMPLETED ✅)
1. ✅ Updated POST `/api/tasks/:taskId/comments` to return comment with user relation
2. ✅ Added proper error handling and toast notifications on failure  
3. ✅ Added subtask comment support (backend complete, UI pending)

### Phase 2: Enhance @Mentions
1. Verify mention dropdown works correctly (already implemented in TipTap)
2. Ensure mention users are properly filtered to tenant scope
3. Verify mention storage and retrieval

### Phase 3: Notifications
1. Verify in-app notifications for mentions are working
2. Add user preference for email notifications (if not exists)
3. Test email sending for mentions

### Phase 4: Reusable Framework
1. Extract mention search as reusable hook: `useMentionsSearch(query)`
2. Document pattern for adding mentions to other text fields

## Files to Modify

### Backend
- `server/routes.ts` - Update comment create response, add subtask endpoints
- `server/storage.ts` - Add subtask comment methods
- `shared/schema.ts` - Add subtaskId to comments table (additive)

### Frontend
- `client/src/features/tasks/task-detail-drawer.tsx` - Improve error handling
- `client/src/components/comment-thread.tsx` - Already has good @mention support
- `client/src/components/richtext/CommentEditor.tsx` - Already has TipTap mention extension

## Limitations & TODOs

- [ ] Mentions currently only work in task comments; expansion to other text fields requires refactoring
- [ ] Email notification preference per user not yet implemented
- [ ] Real-time comment updates via Socket.IO not implemented (refetch only)
