import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  ChevronDown,
  Clock,
  Copy,
  Quote,
  ListTodo,
} from "lucide-react";

export interface ChatMessage {
  id: string;
  body: string;
  authorUserId: string;
  channelId?: string | null;
  dmThreadId?: string | null;
  createdAt: Date | string;
  editedAt?: Date | string | null;
  deletedAt?: Date | string | null;
  author?: {
    id: string;
    name?: string | null;
    email: string;
    avatarUrl?: string | null;
  } | null;
  attachments?: Array<{
    id: string;
    fileName: string;
    url: string;
    mimeType: string;
    sizeBytes: number;
  }>;
  _tempId?: string;
  _status?: "pending" | "failed";
}

interface ChatMessageTimelineProps {
  messages: ChatMessage[];
  currentUserId?: string;
  currentUserRole?: string;
  isLoading?: boolean;
  hasMoreMessages?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  onEditMessage?: (messageId: string, body: string) => void;
  onDeleteMessage?: (messageId: string) => void;
  onRetryMessage?: (message: ChatMessage) => void;
  onRemoveFailedMessage?: (tempId: string) => void;
  onCopyMessage?: (body: string) => void;
  onQuoteReply?: (authorName: string, body: string) => void;
  onCreateTaskFromMessage?: (message: ChatMessage) => void;
  renderMessageBody?: (body: string) => React.ReactNode;
  getFileIcon?: (mimeType: string) => React.ComponentType<{ className?: string }>;
  formatFileSize?: (bytes: number) => string;
  isDm?: boolean;
  className?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatFullDateTime(date: Date | string): string {
  const d = new Date(date);
  return d.toLocaleString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDateSeparator(date: Date | string): string {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }
  if (d.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

function isSameDay(d1: Date | string, d2: Date | string): boolean {
  return new Date(d1).toDateString() === new Date(d2).toDateString();
}

function shouldGroupMessage(
  current: ChatMessage,
  previous: ChatMessage | undefined,
  maxGapMinutes: number = 5
): boolean {
  if (!previous) return false;
  if (current.authorUserId !== previous.authorUserId) return false;
  if (!isSameDay(current.createdAt, previous.createdAt)) return false;

  const currentTime = new Date(current.createdAt).getTime();
  const previousTime = new Date(previous.createdAt).getTime();
  const gapMs = currentTime - previousTime;
  const gapMinutes = gapMs / (1000 * 60);

  return gapMinutes <= maxGapMinutes;
}

interface MessageGroup {
  id: string;
  authorUserId: string;
  author: ChatMessage["author"];
  messages: ChatMessage[];
  dateSeparator?: string;
}

function groupMessages(messages: ChatMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  let currentGroup: MessageGroup | null = null;
  let lastDate: string | null = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const previousMessage = i > 0 ? messages[i - 1] : undefined;
    const messageDate = new Date(message.createdAt).toDateString();
    const needsDateSeparator = messageDate !== lastDate;
    const shouldGroup = !needsDateSeparator && shouldGroupMessage(message, previousMessage);

    if (needsDateSeparator) {
      lastDate = messageDate;
    }

    if (shouldGroup && currentGroup) {
      currentGroup.messages.push(message);
    } else {
      currentGroup = {
        id: message._tempId || message.id,
        authorUserId: message.authorUserId,
        author: message.author,
        messages: [message],
        dateSeparator: needsDateSeparator ? formatDateSeparator(message.createdAt) : undefined,
      };
      groups.push(currentGroup);
    }
  }

  return groups;
}

export function ChatMessageTimeline({
  messages,
  currentUserId,
  currentUserRole,
  isLoading,
  hasMoreMessages,
  onLoadMore,
  isLoadingMore,
  onEditMessage,
  onDeleteMessage,
  onRetryMessage,
  onRemoveFailedMessage,
  onCopyMessage,
  onQuoteReply,
  onCreateTaskFromMessage,
  renderMessageBody,
  getFileIcon,
  formatFileSize,
  isDm = false,
  className,
}: ChatMessageTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const lastMessageCountRef = useRef(messages.length);
  const scrollPositionRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  const checkIfAtBottom = useCallback(() => {
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!scrollContainer) return true;

    const threshold = 100;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
    return scrollHeight - scrollTop - clientHeight < threshold;
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
    setHasNewMessages(false);
    setIsAtBottom(true);
  }, []);

  useEffect(() => {
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!scrollContainer) return;

    const handleScroll = () => {
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      if (atBottom) {
        setHasNewMessages(false);
      }
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [checkIfAtBottom]);

  useEffect(() => {
    if (messages.length > lastMessageCountRef.current) {
      const newMessagesCount = messages.length - lastMessageCountRef.current;
      const lastNewMessages = messages.slice(-newMessagesCount);
      const isOwnMessage = lastNewMessages.some((m) => m.authorUserId === currentUserId);

      if (isAtBottom || isOwnMessage) {
        setTimeout(() => scrollToBottom(), 50);
      } else {
        setHasNewMessages(true);
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, isAtBottom, currentUserId, scrollToBottom]);

  useEffect(() => {
    if (scrollPositionRef.current) {
      const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollContainer) {
        const { scrollHeight: oldHeight, scrollTop: oldScrollTop } = scrollPositionRef.current;
        const newScrollTop = scrollContainer.scrollHeight - oldHeight + oldScrollTop;
        scrollContainer.scrollTop = newScrollTop;
        scrollPositionRef.current = null;
      }
    }
  }, [messages]);

  const handleLoadMore = useCallback(() => {
    const scrollContainer = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (scrollContainer && onLoadMore) {
      scrollPositionRef.current = {
        scrollHeight: scrollContainer.scrollHeight,
        scrollTop: scrollContainer.scrollTop,
      };
      onLoadMore();
    }
  }, [onLoadMore]);

  const handleEditSave = useCallback(
    (messageId: string) => {
      if (editingBody.trim() && onEditMessage) {
        onEditMessage(messageId, editingBody.trim());
        setEditingMessageId(null);
        setEditingBody("");
      }
    },
    [editingBody, onEditMessage]
  );

  const handleEditCancel = useCallback(() => {
    setEditingMessageId(null);
    setEditingBody("");
  }, []);

  const isTenantAdmin = currentUserRole === "admin";

  return (
    <div className={`relative flex flex-col h-full ${className || ""}`}>
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-1">
          {hasMoreMessages && (
            <div className="flex justify-center pb-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                data-testid="button-load-more"
              >
                {isLoadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Clock className="h-4 w-4 mr-2" />
                )}
                Load older messages
              </Button>
            </div>
          )}

          {isLoading && messages.length === 0 && (
            <div className="space-y-4" data-testid="messages-loading">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-24" />
                    <div className="h-4 bg-muted rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {messages.length === 0 && !isLoading && (
            <div
              className="flex flex-col items-center justify-center h-40 text-muted-foreground"
              data-testid="empty-messages"
            >
              <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs">Be the first to send a message!</p>
            </div>
          )}

          {messageGroups.map((group) => (
            <div key={group.id} data-testid={`message-group-${group.id}`}>
              {group.dateSeparator && (
                <div className="flex items-center gap-4 py-4" data-testid="date-separator">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs font-medium text-muted-foreground px-2">
                    {group.dateSeparator}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              )}

              <div className="flex gap-3 py-1 group/message-group">
                <div className="w-8 flex-shrink-0">
                  {!isDm || group.messages.length === 1 ? (
                    <Avatar className="h-8 w-8">
                      {group.author?.avatarUrl && (
                        <AvatarImage src={group.author.avatarUrl} />
                      )}
                      <AvatarFallback>
                        {getInitials(group.author?.name || group.author?.email || "?")}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-8" />
                  )}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm">
                      {group.author?.name || group.author?.email || "Unknown"}
                    </span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground cursor-default">
                          {formatTime(group.messages[0].createdAt)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {formatFullDateTime(group.messages[0].createdAt)}
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  {group.messages.map((message, idx) => {
                    const isDeleted = !!message.deletedAt;
                    const isOwnMessage = message.authorUserId === currentUserId;
                    const isEditing = editingMessageId === message.id;
                    const canEdit = isOwnMessage && !isDeleted && !message._status;
                    const canDelete = (isOwnMessage || isTenantAdmin) && !isDeleted && !message._status;
                    const isPending = message._status === "pending";
                    const isFailed = message._status === "failed";
                    const showTimestamp = idx > 0;

                    return (
                      <div
                        key={message._tempId || message.id}
                        className={`group relative py-0.5 ${isPending ? "opacity-60" : ""} ${
                          isFailed ? "bg-destructive/10 px-2 -mx-2 rounded" : ""
                        }`}
                        data-testid={`message-${message._tempId || message.id}`}
                      >
                        {showTimestamp && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="absolute -left-12 top-1 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity cursor-default">
                                {formatTime(message.createdAt)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {formatFullDateTime(message.createdAt)}
                            </TooltipContent>
                          </Tooltip>
                        )}

                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  value={editingBody}
                                  onChange={(e) => setEditingBody(e.target.value)}
                                  className="flex-1 text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                      e.preventDefault();
                                      handleEditSave(message.id);
                                    }
                                    if (e.key === "Escape") {
                                      handleEditCancel();
                                    }
                                  }}
                                  data-testid={`message-edit-input-${message.id}`}
                                />
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => handleEditSave(message.id)}
                                  disabled={!editingBody.trim()}
                                  data-testid={`message-edit-save-${message.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={handleEditCancel}
                                  data-testid={`message-edit-cancel-${message.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <p
                                    className={`text-sm break-words ${
                                      isDeleted ? "text-muted-foreground italic" : ""
                                    }`}
                                  >
                                    {isDeleted
                                      ? message.body
                                      : renderMessageBody
                                      ? renderMessageBody(message.body)
                                      : message.body}
                                  </p>
                                  {isPending && (
                                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    </span>
                                  )}
                                  {isFailed && (
                                    <span className="text-xs text-destructive flex items-center gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      Failed
                                    </span>
                                  )}
                                  {message.editedAt && !isDeleted && (
                                    <span className="text-xs text-muted-foreground">(edited)</span>
                                  )}
                                </div>

                                {isFailed && message._tempId && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => onRetryMessage?.(message)}
                                      data-testid={`message-retry-${message._tempId}`}
                                    >
                                      <RefreshCw className="h-3 w-3 mr-1" />
                                      Retry
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => onRemoveFailedMessage?.(message._tempId!)}
                                      data-testid={`message-remove-${message._tempId}`}
                                    >
                                      <X className="h-3 w-3 mr-1" />
                                      Remove
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}

                            {message.attachments &&
                              message.attachments.length > 0 &&
                              !isDeleted && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {message.attachments.map((attachment) => {
                                    const FileIcon = getFileIcon?.(attachment.mimeType);
                                    const isImage = attachment.mimeType.startsWith("image/");
                                    return (
                                      <a
                                        key={attachment.id}
                                        href={attachment.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 p-2 rounded-md bg-muted hover-elevate"
                                        data-testid={`attachment-${attachment.id}`}
                                      >
                                        {isImage ? (
                                          <img
                                            src={attachment.url}
                                            alt={attachment.fileName}
                                            className="h-16 w-16 object-cover rounded"
                                          />
                                        ) : (
                                          <>
                                            {FileIcon && (
                                              <FileIcon className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="text-xs truncate max-w-[150px]">
                                              {attachment.fileName}
                                            </span>
                                            {formatFileSize && (
                                              <span className="text-xs text-muted-foreground">
                                                ({formatFileSize(attachment.sizeBytes)})
                                              </span>
                                            )}
                                          </>
                                        )}
                                      </a>
                                    );
                                  })}
                                </div>
                              )}
                          </div>

                          {!isDeleted && !isEditing && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                                  data-testid={`message-menu-${message.id}`}
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => {
                                    if (onCopyMessage) {
                                      onCopyMessage(message.body);
                                    } else {
                                      navigator.clipboard.writeText(message.body);
                                    }
                                  }}
                                  data-testid={`message-copy-${message.id}`}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy text
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    const authorName = message.author?.name || message.author?.email || "Unknown";
                                    onQuoteReply?.(authorName, message.body);
                                  }}
                                  data-testid={`message-quote-${message.id}`}
                                >
                                  <Quote className="h-4 w-4 mr-2" />
                                  Quote reply
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => onCreateTaskFromMessage?.(message)}
                                  data-testid={`message-create-task-${message.id}`}
                                >
                                  <ListTodo className="h-4 w-4 mr-2" />
                                  Create task
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem
                                    onClick={() => {
                                      setEditingMessageId(message.id);
                                      setEditingBody(message.body);
                                    }}
                                    data-testid={`message-edit-${message.id}`}
                                  >
                                    <Pencil className="h-4 w-4 mr-2" />
                                    Edit
                                  </DropdownMenuItem>
                                )}
                                {canDelete && (
                                  <DropdownMenuItem
                                    onClick={() => onDeleteMessage?.(message.id)}
                                    className="text-destructive focus:text-destructive"
                                    data-testid={`message-delete-${message.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {hasNewMessages && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => scrollToBottom()}
            className="shadow-lg gap-2"
            data-testid="button-new-messages"
          >
            <ChevronDown className="h-4 w-4" />
            New messages
          </Button>
        </div>
      )}
    </div>
  );
}
