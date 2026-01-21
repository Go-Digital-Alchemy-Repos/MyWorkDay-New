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
import { useState, useRef, useEffect, useMemo } from "react";
import { Send, Pencil, Trash2, Check, X, CheckCircle2, CircleDot } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDistanceToNow } from "date-fns";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  users: User[];
  className?: string;
  "data-testid"?: string;
}

function MentionInput({ value, onChange, placeholder, users, className, "data-testid": dataTestId }: MentionInputProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [cursorPosition, setCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const filteredUsers = useMemo(() => {
    if (!mentionQuery) return users;
    return users.filter((u) =>
      u.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(mentionQuery.toLowerCase())
    );
  }, [users, mentionQuery]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newPosition = e.target.selectionStart || 0;
    onChange(newValue);
    setCursorPosition(newPosition);

    const textBeforeCursor = newValue.slice(0, newPosition);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    
    if (atIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(atIndex + 1);
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionQuery(textAfterAt);
        setShowSuggestions(true);
        return;
      }
    }
    
    setShowSuggestions(false);
    setMentionQuery("");
  };

  const insertMention = (user: User) => {
    const textBeforeCursor = value.slice(0, cursorPosition);
    const atIndex = textBeforeCursor.lastIndexOf("@");
    const textAfterCursor = value.slice(cursorPosition);

    const newValue =
      value.slice(0, atIndex) +
      `@[${user.name}](${user.id})` +
      textAfterCursor;

    onChange(newValue);
    setShowSuggestions(false);
    setMentionQuery("");

    setTimeout(() => {
      if (textareaRef.current) {
        const newPosition = atIndex + `@[${user.name}](${user.id})`.length;
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }, 0);
  };

  return (
    <div className="relative">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={className}
        data-testid={dataTestId}
      />
      {showSuggestions && filteredUsers.length > 0 && (
        <div className="absolute z-50 w-full max-h-48 overflow-auto bg-popover border rounded-md shadow-md mt-1">
          {filteredUsers.slice(0, 5).map((user) => (
            <button
              key={user.id}
              type="button"
              className="w-full px-3 py-2 text-left text-sm hover-elevate flex items-center gap-2"
              onClick={() => insertMention(user)}
              data-testid={`mention-user-${user.id}`}
            >
              <Avatar className="h-6 w-6">
                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <span>{user.name}</span>
              {user.email && (
                <span className="text-muted-foreground text-xs ml-auto">{user.email}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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

  const { data: workspaceUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const handleSubmit = () => {
    if (body.trim()) {
      onAdd?.(body.trim());
      setBody("");
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
                      <MentionInput
                        value={editBody}
                        onChange={setEditBody}
                        users={workspaceUsers}
                        className="min-h-[60px] resize-none text-sm"
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
                    <p className="text-sm text-foreground whitespace-pre-wrap">
                      {renderMentions(comment.body)}
                    </p>
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
        <div className="flex-1 space-y-2">
          <MentionInput
            value={body}
            onChange={setBody}
            placeholder="Write a comment... Type @ to mention someone"
            users={workspaceUsers}
            className="min-h-[80px] resize-none text-sm"
            data-testid="textarea-comment"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!body.trim()}
              data-testid="button-submit-comment"
            >
              <Send className="h-3.5 w-3.5 mr-1" />
              Comment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
