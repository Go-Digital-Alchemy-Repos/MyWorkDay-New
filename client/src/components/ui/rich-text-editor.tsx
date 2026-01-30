import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Button } from "./button";
import { cn } from "@/lib/utils";
import { 
  Bold, 
  Italic, 
  Underline as UnderlineIcon,
  Link as LinkIcon, 
  Unlink,
  List, 
  ListOrdered, 
  Undo, 
  Redo, 
  Smile,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Paperclip
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { PromptDialog } from "@/components/prompt-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import EmojiPicker, { Theme, EmojiClickData } from "emoji-picker-react";
import { useTheme } from "@/lib/theme-provider";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  onAttachmentClick?: () => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  showAlignment?: boolean;
  showAttachment?: boolean;
  "data-testid"?: string;
}

export function RichTextEditor({ 
  value, 
  onChange,
  onAttachmentClick,
  placeholder = "Write something...",
  className = "",
  minHeight = "120px",
  showAlignment = true,
  showAttachment = false,
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
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline cursor-pointer",
        },
      }),
      TextAlign.configure({
        types: ["paragraph", "heading"],
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
      <div className="flex flex-wrap items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("bold") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          data-testid="button-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("italic") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          data-testid="button-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("underline") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          data-testid="button-underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("bulletList") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-testid="button-bullet-list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("orderedList") && "bg-muted")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          data-testid="button-ordered-list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        {showAlignment && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("px-2", editor.isActive({ textAlign: "left" }) && "bg-muted")}
              onClick={() => editor.chain().focus().setTextAlign("left").run()}
              data-testid="button-align-left"
            >
              <AlignLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("px-2", editor.isActive({ textAlign: "center" }) && "bg-muted")}
              onClick={() => editor.chain().focus().setTextAlign("center").run()}
              data-testid="button-align-center"
            >
              <AlignCenter className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={cn("px-2", editor.isActive({ textAlign: "right" }) && "bg-muted")}
              onClick={() => editor.chain().focus().setTextAlign("right").run()}
              data-testid="button-align-right"
            >
              <AlignRight className="h-4 w-4" />
            </Button>
          </>
        )}
        <div className="w-px h-5 bg-border mx-1" />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn("px-2", editor.isActive("link") && "bg-muted")}
          onClick={openLinkDialog}
          data-testid="button-link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        {editor.isActive("link") && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="px-2"
            onClick={() => editor.chain().focus().unsetLink().run()}
            data-testid="button-unlink"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        )}
        {showAttachment && onAttachmentClick && (
          <>
            <div className="w-px h-5 bg-border mx-1" />
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-2"
              onClick={onAttachmentClick}
              data-testid="button-attachment"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
          </>
        )}
        <div className="w-px h-5 bg-border mx-1" />
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="px-2"
              aria-label="Insert emoji"
              data-testid="button-emoji"
            >
              <Smile className="h-4 w-4" />
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
          size="sm"
          variant="ghost"
          className="px-2"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          data-testid="button-undo"
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="px-2"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          data-testid="button-redo"
        >
          <Redo className="h-4 w-4" />
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
        .ProseMirror u {
          text-decoration: underline;
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
        .rich-text-viewer u {
          text-decoration: underline;
        }
      `}</style>
    </>
  );
}
