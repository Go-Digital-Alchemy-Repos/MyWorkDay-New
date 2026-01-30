import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "./button";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Undo, Redo, Smile } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PromptDialog } from "@/components/prompt-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { useTheme } from "@/lib/theme-provider";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  "data-testid"?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Write something...",
  className = "",
  minHeight = "120px",
  "data-testid": dataTestId = "rich-text-editor"
}: RichTextEditorProps) {
  const { theme } = useTheme();
  const [emojiOpen, setEmojiOpen] = useState(false);
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[${minHeight}] p-3`,
        "data-placeholder": placeholder,
        "data-testid": `${dataTestId}-content`,
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkDefaultValue, setLinkDefaultValue] = useState("");

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const openLinkDialog = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href || "";
    setLinkDefaultValue(previousUrl);
    setLinkDialogOpen(true);
  }, [editor]);

  const handleLinkConfirm = useCallback((url: string) => {
    if (!editor) return;
    
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emojiData.emoji).run();
    setEmojiOpen(false);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`border rounded-md bg-background ${className}`} data-testid={dataTestId}>
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("bold") ? "default" : "ghost"}
          onClick={() => editor.chain().focus().toggleBold().run()}
          className="h-7 w-7"
          data-testid="button-bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("italic") ? "default" : "ghost"}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className="h-7 w-7"
          data-testid="button-italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("bulletList") ? "default" : "ghost"}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className="h-7 w-7"
          data-testid="button-bullet-list"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("orderedList") ? "default" : "ghost"}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className="h-7 w-7"
          data-testid="button-ordered-list"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          size="icon"
          variant={editor.isActive("link") ? "default" : "ghost"}
          onClick={openLinkDialog}
          className="h-7 w-7"
          data-testid="button-link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              data-testid="button-emoji"
            >
              <Smile className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent 
            side="bottom" 
            align="start" 
            className="w-auto p-0 border-0"
            sideOffset={8}
          >
            <EmojiPicker
              onEmojiClick={handleEmojiClick}
              theme={theme === "dark" ? Theme.DARK : Theme.LIGHT}
              width={300}
              height={350}
              searchPlaceHolder="Search emoji..."
              previewConfig={{ showPreview: false }}
            />
          </PopoverContent>
        </Popover>
        <div className="flex-1" />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          className="h-7 w-7"
          data-testid="button-undo"
        >
          <Undo className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          className="h-7 w-7"
          data-testid="button-redo"
        >
          <Redo className="h-3.5 w-3.5" />
        </Button>
      </div>
      <EditorContent editor={editor} />
      <style>{`
        .ProseMirror {
          min-height: ${minHeight};
          padding: 12px;
        }
        .ProseMirror:focus {
          outline: none;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          float: left;
          height: 0;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
        }
        .ProseMirror ul {
          list-style-type: disc;
        }
        .ProseMirror ol {
          list-style-type: decimal;
        }
        .ProseMirror a {
          color: hsl(var(--primary));
          text-decoration: underline;
          cursor: pointer;
        }
      `}</style>

      <PromptDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        title="Insert Link"
        description="Enter the URL for the link"
        label="URL"
        placeholder="https://..."
        defaultValue={linkDefaultValue}
        confirmText="Insert"
        onConfirm={handleLinkConfirm}
      />
    </div>
  );
}

interface RichTextViewerProps {
  content: string;
  className?: string;
}

export function RichTextViewer({ content, className = "" }: RichTextViewerProps) {
  return (
    <>
      <div 
        className={`rich-text-viewer ${className}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
      <style>{`
        .rich-text-viewer {
          word-break: break-word;
        }
        .rich-text-viewer p {
          margin: 0.25em 0;
        }
        .rich-text-viewer ul, .rich-text-viewer ol {
          padding-left: 1.5rem;
          margin: 0.5em 0;
        }
        .rich-text-viewer ul {
          list-style-type: disc;
        }
        .rich-text-viewer ol {
          list-style-type: decimal;
        }
        .rich-text-viewer a {
          color: hsl(var(--primary));
          text-decoration: underline;
        }
        .rich-text-viewer strong {
          font-weight: 600;
        }
        .rich-text-viewer em {
          font-style: italic;
        }
      `}</style>
    </>
  );
}
