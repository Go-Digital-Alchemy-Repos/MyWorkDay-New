import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Button } from "./button";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Undo, Redo } from "lucide-react";
import { useCallback, useEffect } from "react";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

export function RichTextEditor({ 
  value, 
  onChange, 
  placeholder = "Write something...",
  className = "",
  minHeight = "120px"
}: RichTextEditorProps) {
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
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  const setLink = useCallback(() => {
    if (!editor) return;
    
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("Enter URL:", previousUrl);

    if (url === null) return;

    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={`border rounded-md bg-background ${className}`}>
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
          onClick={setLink}
          className="h-7 w-7"
          data-testid="button-link"
        >
          <LinkIcon className="h-3.5 w-3.5" />
        </Button>
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
