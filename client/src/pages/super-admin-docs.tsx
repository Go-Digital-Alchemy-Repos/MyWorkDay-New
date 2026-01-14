import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2, FileText, Search, ArrowLeft, Calendar, HardDrive, RefreshCw, ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { queryClient } from "@/lib/queryClient";

interface DocFile {
  filename: string;
  title: string;
  sizeBytes: number;
  modifiedAt: string;
}

interface DocContent {
  filename: string;
  title: string;
  content: string;
  sizeBytes: number;
  modifiedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
        codeBlockContent = [];
      } else {
        elements.push(
          <pre key={`code-${i}`} className="bg-muted rounded-md p-4 overflow-x-auto my-4 text-sm font-mono">
            <code>{codeBlockContent.join("\n")}</code>
          </pre>
        );
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = "";
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-3xl font-bold mt-6 mb-4">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-2xl font-semibold mt-6 mb-3 border-b pb-2">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-xl font-semibold mt-4 mb-2">{line.slice(4)}</h3>);
    } else if (line.startsWith("#### ")) {
      elements.push(<h4 key={i} className="text-lg font-medium mt-3 mb-1">{line.slice(5)}</h4>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-6 list-disc">
          <InlineContent text={line.slice(2)} />
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)$/);
      if (match) {
        elements.push(
          <li key={i} className="ml-6 list-decimal">
            <InlineContent text={match[2]} />
          </li>
        );
      }
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground my-2">
          <InlineContent text={line.slice(2)} />
        </blockquote>
      );
    } else if (line.startsWith("---") || line.startsWith("***")) {
      elements.push(<hr key={i} className="my-6 border-border" />);
    } else if (line.startsWith("|")) {
      const cells = line.split("|").filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^[-:]+$/))) {
        continue;
      }
      elements.push(
        <div key={i} className="flex border-b border-border">
          {cells.map((cell, idx) => (
            <div key={idx} className="flex-1 px-3 py-2 text-sm">
              <InlineContent text={cell.trim()} />
            </div>
          ))}
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="my-2 leading-relaxed">
          <InlineContent text={line} />
        </p>
      );
    }
  }

  return <div className="prose prose-sm dark:prose-invert max-w-none">{elements}</div>;
}

function InlineContent({ text }: { text: string }) {
  const parts: (string | JSX.Element)[] = [];
  let remaining = text;
  let keyIndex = 0;

  while (remaining.length > 0) {
    const codeMatch = remaining.match(/`([^`]+)`/);
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      codeMatch ? { type: "code", match: codeMatch, index: codeMatch.index! } : null,
      boldMatch ? { type: "bold", match: boldMatch, index: boldMatch.index! } : null,
      linkMatch ? { type: "link", match: linkMatch, index: linkMatch.index! } : null,
    ].filter(Boolean).sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(remaining);
      break;
    }

    const first = matches[0]!;
    if (first.index > 0) {
      parts.push(remaining.slice(0, first.index));
    }

    if (first.type === "code") {
      parts.push(
        <code key={`inline-${keyIndex++}`} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
          {first.match![1]}
        </code>
      );
      remaining = remaining.slice(first.index + first.match![0].length);
    } else if (first.type === "bold") {
      parts.push(<strong key={`inline-${keyIndex++}`}>{first.match![1]}</strong>);
      remaining = remaining.slice(first.index + first.match![0].length);
    } else if (first.type === "link") {
      parts.push(
        <a
          key={`inline-${keyIndex++}`}
          href={first.match![2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline inline-flex items-center gap-1"
        >
          {first.match![1]}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
      remaining = remaining.slice(first.index + first.match![0].length);
    }
  }

  return <>{parts}</>;
}

export default function SuperAdminDocs() {
  const { user, isLoading: authLoading } = useAuth();
  const [selectedDoc, setSelectedDoc] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: docsData, isLoading: docsLoading, refetch } = useQuery<{ docs: DocFile[] }>({
    queryKey: ["/api/v1/super/docs"],
    enabled: !!user && user.role === "super_user",
  });

  const { data: docContent, isLoading: contentLoading } = useQuery<DocContent>({
    queryKey: ["/api/v1/super/docs", selectedDoc],
    enabled: !!selectedDoc,
  });

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const filteredDocs = docsData?.docs?.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  return (
    <div className="flex h-full">
      <div className="w-80 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold mb-3">App Documentation</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search docs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-docs"
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2">
            {docsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                {searchQuery ? "No matching documents" : "No documentation files found"}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredDocs.map((doc) => (
                  <button
                    key={doc.filename}
                    onClick={() => setSelectedDoc(doc.filename)}
                    className={`w-full text-left p-3 rounded-md transition-colors hover-elevate ${
                      selectedDoc === doc.filename
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted"
                    }`}
                    data-testid={`button-doc-${doc.filename.replace(".md", "")}`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{doc.title}</div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{formatBytes(doc.sizeBytes)}</span>
                          <span className="text-muted-foreground/50">|</span>
                          <span className="truncate">{doc.filename}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
        <div className="p-3 border-t">
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/v1/super/docs"] });
              refetch();
            }}
            data-testid="button-refresh-docs"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh List
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {!selectedDoc ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Select a document to view</p>
              <p className="text-sm mt-1">Choose from the list on the left</p>
            </div>
          </div>
        ) : contentLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : docContent ? (
          <>
            <div className="border-b px-6 py-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedDoc(null)}
                    data-testid="button-back-to-list"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h1 className="text-xl font-semibold">{docContent.title}</h1>
                    <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3.5 w-3.5" />
                        {formatBytes(docContent.sizeBytes)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(docContent.modifiedAt)}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        {docContent.filename}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 max-w-4xl">
                <MarkdownRenderer content={docContent.content} />
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Failed to load document</p>
          </div>
        )}
      </div>
    </div>
  );
}
