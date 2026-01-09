import { useState } from "react";
import { Send } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";
import type { Comment, User } from "@shared/schema";

interface CommentWithUser extends Comment {
  user?: User;
}

interface CommentThreadProps {
  comments: CommentWithUser[];
  onAdd?: (body: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function CommentThread({ comments, onAdd }: CommentThreadProps) {
  const [body, setBody] = useState("");

  const handleSubmit = () => {
    if (body.trim()) {
      onAdd?.(body.trim());
      setBody("");
    }
  };

  return (
    <div className="space-y-4" data-testid="comment-thread">
      <h4 className="text-sm font-medium">Comments</h4>

      {comments.length > 0 && (
        <div className="space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-3" data-testid={`comment-${comment.id}`}>
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
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {comment.body}
                </p>
              </div>
            </div>
          ))}
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
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a comment..."
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
