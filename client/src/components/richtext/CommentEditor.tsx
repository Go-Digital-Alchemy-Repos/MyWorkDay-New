import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Link as LinkIcon,
  Send,
} from "lucide-react";
import { getDocForEditor, serializeDocToString } from "./richTextUtils";
import type { User } from "@shared/schema";

interface CommentEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  users?: User[];
  isSubmitting?: boolean;
  "data-testid"?: string;
}

export interface CommentEditorRef {
  clear: () => void;
  focus: () => void;
}

interface MentionSuggestionProps {
  query: string;
  users: User[];
  command: (props: { id: string; label: string }) => void;
}

function MentionList({ query, users, command }: MentionSuggestionProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredUsers = users.filter((user) => {
    const searchText = query.toLowerCase();
    const name = user.name?.toLowerCase() || "";
    const email = user.email?.toLowerCase() || "";
    const firstName = user.firstName?.toLowerCase() || "";
    const lastName = user.lastName?.toLowerCase() || "";
    return (
      name.includes(searchText) ||
      email.includes(searchText) ||
      firstName.includes(searchText) ||
      lastName.includes(searchText)
    );
  }).slice(0, 5);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const selectUser = useCallback(
    (index: number) => {
      const user = filteredUsers[index];
      if (user) {
        command({
          id: user.id,
          label: user.name || user.email,
        });
      }
    },
    [filteredUsers, command]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredUsers.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredUsers.length) % filteredUsers.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        selectUser(selectedIndex);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredUsers.length, selectedIndex, selectUser]);

  if (filteredUsers.length === 0) {
    return (
      <div className="bg-popover border rounded-md shadow-md p-2 text-sm text-muted-foreground">
        No users found
      </div>
    );
  }

  return (
    <div className="bg-popover border rounded-md shadow-md overflow-hidden">
      {filteredUsers.map((user, index) => (
        <button
          key={user.id}
          type="button"
          className={cn(
            "w-full px-3 py-2 text-left text-sm flex flex-col",
            index === selectedIndex && "bg-accent"
          )}
          onClick={() => selectUser(index)}
          data-testid={`mention-option-${user.id}`}
        >
          <span className="font-medium">{user.name || "Unknown"}</span>
          <span className="text-xs text-muted-foreground">{user.email}</span>
        </button>
      ))}
    </div>
  );
}

function MenuBar({ editor, onSubmit, isSubmitting }: { editor: Editor | null; onSubmit?: () => void; isSubmitting?: boolean }) {
  const setLink = useCallback(() => {
    if (!editor) return;

    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL (https://...)", previousUrl || "https://");

    if (url === null) return;

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      alert("Please enter a valid URL starting with http:// or https://");
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 border-t border-border p-1 bg-muted/30" data-testid="comment-toolbar">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("bold") && "bg-muted")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        data-testid="button-comment-bold"
      >
        <Bold className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("italic") && "bg-muted")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        data-testid="button-comment-italic"
      >
        <Italic className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("underline") && "bg-muted")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        data-testid="button-comment-underline"
      >
        <UnderlineIcon className="h-3 w-3" />
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("bulletList") && "bg-muted")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        data-testid="button-comment-bullet-list"
      >
        <List className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("orderedList") && "bg-muted")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        data-testid="button-comment-ordered-list"
      >
        <ListOrdered className="h-3 w-3" />
      </Button>
      <div className="w-px h-4 bg-border mx-1" />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("h-6 w-6", editor.isActive("link") && "bg-muted")}
        onClick={setLink}
        data-testid="button-comment-link"
      >
        <LinkIcon className="h-3 w-3" />
      </Button>
      <div className="flex-1" />
      {onSubmit && (
        <Button
          type="button"
          size="sm"
          className="h-6"
          onClick={onSubmit}
          disabled={isSubmitting}
          data-testid="button-comment-submit"
        >
          <Send className="h-3 w-3 mr-1" />
          Post Comment
        </Button>
      )}
    </div>
  );
}

export const CommentEditor = forwardRef<CommentEditorRef, CommentEditorProps>(
  function CommentEditor(
    {
      value,
      onChange,
      onSubmit,
      placeholder = "Write a comment... Type @ to mention someone",
      className,
      disabled = false,
      autoFocus = false,
      users = [],
      isSubmitting = false,
      "data-testid": testId,
    },
    ref
  ) {
    const [mentionPopupOpen, setMentionPopupOpen] = useState(false);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionCommand, setMentionCommand] = useState<((props: { id: string; label: string }) => void) | null>(null);

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        }),
        Underline,
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
          },
          validate: (href) => /^https?:\/\//.test(href),
        }),
        Mention.configure({
          HTMLAttributes: {
            class: "mention",
          },
          suggestion: {
            char: "@",
            items: ({ query }: { query: string }) => {
              return users.filter((user) => {
                const searchText = query.toLowerCase();
                const name = user.name?.toLowerCase() || "";
                const email = user.email?.toLowerCase() || "";
                return name.includes(searchText) || email.includes(searchText);
              }).slice(0, 5);
            },
            render: () => {
              return {
                onStart: (props: { query: string; command: (props: { id: string; label: string }) => void }) => {
                  setMentionQuery(props.query);
                  setMentionCommand(() => props.command);
                  setMentionPopupOpen(true);
                },
                onUpdate: (props: { query: string }) => {
                  setMentionQuery(props.query);
                },
                onKeyDown: (props: { event: KeyboardEvent }) => {
                  if (props.event.key === "Escape") {
                    setMentionPopupOpen(false);
                    return true;
                  }
                  return false;
                },
                onExit: () => {
                  setMentionPopupOpen(false);
                  setMentionCommand(null);
                },
              };
            },
          },
        }),
      ],
      content: value ? getDocForEditor(value) : "",
      editable: !disabled,
      autofocus: autoFocus,
      editorProps: {
        attributes: {
          class: cn(
            "prose prose-sm dark:prose-invert max-w-none focus:outline-none",
            "min-h-[60px] px-3 py-2"
          ),
          "data-testid": testId ? `${testId}-content` : "comment-content",
        },
        handlePaste: (_view, event) => {
          const text = event.clipboardData?.getData("text/plain");
          if (text) {
            event.preventDefault();
            editor?.commands.insertContent(text);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor }) => {
        const doc = editor.getJSON();
        onChange?.(serializeDocToString(doc));
      },
    });

    useImperativeHandle(ref, () => ({
      clear: () => {
        editor?.commands.clearContent();
      },
      focus: () => {
        editor?.commands.focus();
      },
    }));

    const handleSubmit = useCallback(() => {
      if (!editor) return;
      const doc = editor.getJSON();
      const content = serializeDocToString(doc);
      onSubmit?.(content);
    }, [editor, onSubmit]);

    useEffect(() => {
      if (editor) {
        editor.setEditable(!disabled);
      }
    }, [editor, disabled]);

    return (
      <div
        className={cn(
          "border border-input rounded-md overflow-hidden bg-background relative",
          disabled && "opacity-50 cursor-not-allowed",
          className
        )}
        data-testid={testId}
      >
        <EditorContent
          editor={editor}
          className={cn(
            "[&_.ProseMirror]:focus:outline-none",
            "[&_.ProseMirror_p]:my-1",
            "[&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:ml-4",
            "[&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:ml-4",
            "[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline",
            "[&_.ProseMirror_.mention]:bg-primary/20 [&_.ProseMirror_.mention]:text-primary [&_.ProseMirror_.mention]:rounded [&_.ProseMirror_.mention]:px-1"
          )}
        />
        {mentionPopupOpen && mentionCommand && (
          <div className="absolute bottom-full left-0 mb-1 z-50">
            <MentionList
              query={mentionQuery}
              users={users}
              command={mentionCommand}
            />
          </div>
        )}
        <MenuBar editor={editor} onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </div>
    );
  }
);

export default CommentEditor;
