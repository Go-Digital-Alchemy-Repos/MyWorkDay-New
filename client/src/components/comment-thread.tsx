/**
 * Comment Thread Component
 * 
 * Provides full comment management for tasks with permission-based actions.
 * 
 * Features:
 * - Add new comments with @mention support
 * - Edit/delete comments (owner-only permission)
 * - Resolve/unresolve comment threads for discussion tracking
 * - Real-time @mention autocomplete from tenant users
 * 
 * Permissions Model:
 * - Edit: Only the comment owner (userId matches currentUserId) can edit
 * - Delete: Only the comment owner can delete their comments
 * - Resolve/Unresolve: Any authenticated user can resolve/unresolve threads
 * 
 * @mention System:
 * - Format: @[DisplayName](userId) - parsed client-side for display
 * - User emails are never exposed in mentions (security)
 * - Server validates mentioned users exist in same tenant
 * - Email notifications sent via Mailgun for mentioned users
 * 
 * @see POST /api/tasks/:taskId/comments in server/routes.ts for mention parsing
 */
import { useState, useRef } from "react";
import { Pencil, Trash2, Check, X, CheckCircle2, CircleDot } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { CommentEditor, RichTextRenderer, type CommentEditorRef } from "@/components/richtext";
import type { Comment, User } from "@shared/schema";

/** Comment with optional user relation for display */
interface CommentWithUser extends Comment {
  user?: User;
}

interface CommentThreadProps {
  comments: CommentWithUser[];
  taskId: string;
  currentUserId?: string;
  onAdd?: (body: string) => void;
  onUpdate?: (id: string, body: string) => void;
  onDelete?: (id: string) => void;
  onResolve?: (id: string) => void;
  onUnresolve?: (id: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Renders @mentions as styled spans within comment text.
 * 
 * Parses mention format: @[DisplayName](userId)
 * - DisplayName is shown to user (e.g., "@John Smith")
 * - userId is captured but not displayed (for future linking)
 * - User emails are never stored in mentions for privacy
 * 
 * @param body - Comment body text containing mentions
 * @returns JSX with plain text and styled @mention spans
 */
function renderMentions(body: string): JSX.Element {
  const mentionRegex = /@\[([^\]]+)\]\(([a-f0-9-]+)\)/g;
  const parts: (string | JSX.Element)[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(body.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="text-primary font-medium">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < body.length) {
    parts.push(body.slice(lastIndex));
  }

  return <>{parts}</>;
}

export function CommentThread({
  comments,
  taskId,
  currentUserId,
  onAdd,
  onUpdate,
  onDelete,
  onResolve,
  onUnresolve,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const commentEditorRef = useRef<CommentEditorRef>(null);

  const { data: workspaceUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const handleSubmit = (content?: string) => {
    const commentBody = content || body;
    if (commentBody.trim()) {
      onAdd?.(commentBody.trim());
      setBody("");
      commentEditorRef.current?.clear();
    }
  };

  const handleEdit = (comment: CommentWithUser) => {
    setEditingId(comment.id);
    setEditBody(comment.body);
  };

  const handleSaveEdit = () => {
    if (editingId && editBody.trim()) {
      onUpdate?.(editingId, editBody.trim());
      setEditingId(null);
      setEditBody("");
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditBody("");
  };

  return (
    <div className="space-y-4" data-testid="comment-thread">
      <h4 className="text-sm font-medium">Comments</h4>

      {comments.length > 0 && (
        <div className="space-y-4">
          {comments.map((comment) => {
            const isOwner = currentUserId && comment.userId === currentUserId;
            const isEditing = editingId === comment.id;

            return (
              <div
                key={comment.id}
                className={`flex gap-3 ${comment.isResolved ? "opacity-60" : ""}`}
                data-testid={`comment-${comment.id}`}
              >
                <Avatar className="h-8 w-8 shrink-0">
                  {comment.user?.avatarUrl && (
                    <AvatarImage src={comment.user.avatarUrl} alt={comment.user.name} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {getInitials(comment.user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {comment.user?.name || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
                    </span>
                    {comment.isResolved && (
                      <span className="text-xs text-green-600 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Resolved
                      </span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="space-y-2">
                      <CommentEditor
                        value={editBody}
                        onChange={setEditBody}
                        users={workspaceUsers}
                        data-testid="textarea-edit-comment"
                      />
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleSaveEdit}
                          data-testid="button-save-edit"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={handleCancelEdit}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-foreground">
                      <RichTextRenderer value={comment.body} className="text-sm" />
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex gap-1 pt-1">
                      {isOwner && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleEdit(comment)}
                            data-testid={`button-edit-comment-${comment.id}`}
                          >
                            <Pencil className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => onDelete?.(comment.id)}
                            data-testid={`button-delete-comment-${comment.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </>
                      )}
                      {comment.isResolved ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => onUnresolve?.(comment.id)}
                          data-testid={`button-unresolve-comment-${comment.id}`}
                        >
                          <CircleDot className="h-3 w-3 mr-1" />
                          Unresolve
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => onResolve?.(comment.id)}
                          data-testid={`button-resolve-comment-${comment.id}`}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Resolve
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {comments.length === 0 && (
        <p className="text-xs text-muted-foreground py-2">
          No comments yet. Be the first to comment.
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">U</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <CommentEditor
            ref={commentEditorRef}
            value={body}
            onChange={setBody}
            onSubmit={handleSubmit}
            placeholder="Write a comment... Type @ to mention someone"
            users={workspaceUsers}
            data-testid="textarea-comment"
          />
        </div>
      </div>
    </div>
  );
}
