import { RichTextEditor as UnifiedRichTextEditor } from "@/components/richtext/RichTextEditor";
import { RichTextRenderer } from "@/components/richtext/RichTextRenderer";
import { isHtmlString } from "@/components/richtext/richTextUtils";

export { UnifiedRichTextEditor as RichTextEditor };

interface RichTextViewerProps {
  content: string;
  className?: string;
}

export function RichTextViewer({ content, className }: RichTextViewerProps) {
  if (!content) return null;

  if (isHtmlString(content)) {
    return (
      <>
        <div 
          className={`rich-text-viewer ${className || ""}`}
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

  return <RichTextRenderer value={content} className={className} />;
}
