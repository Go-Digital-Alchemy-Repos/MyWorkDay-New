import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getSocket } from "@/lib/realtime/socket";
import { useChatDrawer } from "@/contexts/chat-drawer-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Hash,
  Send,
  MessageCircle,
  Lock,
  X,
  ChevronLeft,
  Paperclip,
  File,
  FileText,
  Image,
  Loader2,
} from "lucide-react";
import { CHAT_EVENTS, CHAT_ROOM_EVENTS, ChatNewMessagePayload } from "@shared/events";

interface ChatChannel {
  id: string;
  tenantId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
}

interface ChatAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
}

interface PendingAttachment extends ChatAttachment {
  uploading?: boolean;
}

interface ChatMessage {
  id: string;
  tenantId: string;
  channelId: string | null;
  dmThreadId: string | null;
  authorUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  attachments?: ChatAttachment[];
  author?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

interface ChatDmThread {
  id: string;
  tenantId: string;
  createdAt: Date;
  members: Array<{
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  }>;
}

export function GlobalChatDrawer() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { isOpen, closeDrawer, lastActiveThread, setLastActiveThread } = useChatDrawer();
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [selectedDm, setSelectedDm] = useState<ChatDmThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showThreadList, setShowThreadList] = useState(true);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: channels = [] } = useQuery<ChatChannel[]>({
    queryKey: ["/api/v1/chat/channels"],
    enabled: isOpen,
  });

  const { data: dmThreads = [] } = useQuery<ChatDmThread[]>({
    queryKey: ["/api/v1/chat/dm"],
    enabled: isOpen,
  });

  const channelMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "messages"],
    enabled: !!selectedChannel && isOpen,
  });

  const dmMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/dm", selectedDm?.id, "messages"],
    enabled: !!selectedDm && isOpen,
  });

  useEffect(() => {
    if (selectedChannel && channelMessagesQuery.data) {
      setMessages(channelMessagesQuery.data);
    } else if (selectedDm && dmMessagesQuery.data) {
      setMessages(dmMessagesQuery.data);
    } else {
      setMessages([]);
    }
  }, [selectedChannel, selectedDm, channelMessagesQuery.data, dmMessagesQuery.data]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!isOpen) return;
    
    if (lastActiveThread && !selectedChannel && !selectedDm) {
      if (lastActiveThread.type === "channel") {
        const channel = channels.find((c) => c.id === lastActiveThread.id);
        if (channel) {
          setSelectedChannel(channel);
          setShowThreadList(false);
        }
      } else if (lastActiveThread.type === "dm") {
        const dm = dmThreads.find((d) => d.id === lastActiveThread.id);
        if (dm) {
          setSelectedDm(dm);
          setShowThreadList(false);
        }
      }
    }
  }, [isOpen, lastActiveThread, channels, dmThreads, selectedChannel, selectedDm]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user || !isOpen) return;

    if (selectedChannel) {
      socket.emit(CHAT_ROOM_EVENTS.JOIN as any, {
        targetType: 'channel',
        targetId: selectedChannel.id,
      });
    } else if (selectedDm) {
      socket.emit(CHAT_ROOM_EVENTS.JOIN as any, {
        targetType: 'dm',
        targetId: selectedDm.id,
      });
    }

    return () => {
      if (selectedChannel) {
        socket.emit(CHAT_ROOM_EVENTS.LEAVE as any, {
          targetType: 'channel',
          targetId: selectedChannel.id,
        });
      } else if (selectedDm) {
        socket.emit(CHAT_ROOM_EVENTS.LEAVE as any, {
          targetType: 'dm',
          targetId: selectedDm.id,
        });
      }
    };
  }, [selectedChannel, selectedDm, user, isOpen]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !isOpen) return;

    const handleNewMessage = (payload: ChatNewMessagePayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        setMessages(prev => [...prev, payload.message as ChatMessage]);
      }
    };

    socket.on(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);

    return () => {
      socket.off(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
    };
  }, [selectedChannel, selectedDm, isOpen]);

  const joinChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      return apiRequest("POST", `/api/v1/chat/channels/${channelId}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels/my"] });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ body, attachmentIds }: { body: string; attachmentIds?: string[] }) => {
      const payload = { body, attachmentIds };
      if (selectedChannel) {
        return apiRequest("POST", `/api/v1/chat/channels/${selectedChannel.id}/messages`, payload);
      } else if (selectedDm) {
        return apiRequest("POST", `/api/v1/chat/dm/${selectedDm.id}/messages`, payload);
      }
      throw new Error("No channel or DM selected");
    },
    onSuccess: () => {
      setMessageInput("");
      setPendingAttachments([]);
    },
  });

  const handleSelectChannel = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setSelectedDm(null);
    setShowThreadList(false);
    setLastActiveThread({ type: "channel", id: channel.id, name: channel.name });
    joinChannelMutation.mutate(channel.id);
  };

  const handleSelectDm = (dm: ChatDmThread) => {
    setSelectedDm(dm);
    setSelectedChannel(null);
    setShowThreadList(false);
    setLastActiveThread({ type: "dm", id: dm.id, name: getDmDisplayName(dm) });
  };

  const handleBack = () => {
    setShowThreadList(true);
    setSelectedChannel(null);
    setSelectedDm(null);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    
    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        
        const response = await fetch("/api/v1/chat/uploads", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        
        if (!response.ok) {
          const error = await response.json().catch(() => ({ message: "Upload failed" }));
          toast({
            title: "Upload failed",
            description: error.message || `Could not upload ${file.name}`,
            variant: "destructive",
          });
          continue;
        }
        
        const attachment = await response.json();
        setPendingAttachments(prev => [...prev, attachment]);
      } catch (error) {
        toast({
          title: "Upload error",
          description: `Could not upload ${file.name}`,
          variant: "destructive",
        });
      }
    }
    
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removePendingAttachment = (id: string) => {
    setPendingAttachments(prev => prev.filter(a => a.id !== id));
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageInput.trim() && pendingAttachments.length === 0) return;
    sendMessageMutation.mutate({
      body: messageInput.trim() || " ",
      attachmentIds: pendingAttachments.map(a => a.id),
    });
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return Image;
    if (mimeType === "application/pdf") return FileText;
    return File;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getDmDisplayName = (dm: ChatDmThread) => {
    const otherMembers = dm.members.filter((m) => m.userId !== user?.id);
    if (otherMembers.length === 0) return "Just you";
    return otherMembers.map((m) => m.user.name || m.user.email).join(", ");
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent 
        side="right" 
        className="w-[400px] sm:w-[450px] p-0 flex flex-col"
        data-testid="global-chat-drawer"
      >
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <div className="flex items-center justify-between">
            {!showThreadList && (selectedChannel || selectedDm) ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleBack}
                  data-testid="button-chat-back"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                {selectedChannel && (
                  <div className="flex items-center gap-2">
                    {selectedChannel.isPrivate ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <Hash className="h-4 w-4" />
                    )}
                    <SheetTitle className="text-base">{selectedChannel.name}</SheetTitle>
                  </div>
                )}
                {selectedDm && (
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4" />
                    <SheetTitle className="text-base">{getDmDisplayName(selectedDm)}</SheetTitle>
                  </div>
                )}
              </div>
            ) : (
              <SheetTitle>Chat</SheetTitle>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={closeDrawer}
              data-testid="button-close-chat-drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {showThreadList ? (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-sm mb-3">Channels</h3>
              <ScrollArea className="h-40">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleSelectChannel(channel)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover-elevate"
                    data-testid={`drawer-channel-${channel.id}`}
                  >
                    {channel.isPrivate ? (
                      <Lock className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <Hash className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))}
                {channels.length === 0 && (
                  <p className="text-sm text-muted-foreground px-2">No channels available</p>
                )}
              </ScrollArea>
            </div>

            <div className="p-4 flex-1">
              <h3 className="font-semibold text-sm mb-3">Direct Messages</h3>
              <ScrollArea className="h-40">
                {dmThreads.map((dm) => (
                  <button
                    key={dm.id}
                    onClick={() => handleSelectDm(dm)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover-elevate"
                    data-testid={`drawer-dm-${dm.id}`}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs">
                        {getInitials(getDmDisplayName(dm))}
                      </AvatarFallback>
                    </Avatar>
                    <span className="truncate">{getDmDisplayName(dm)}</span>
                  </button>
                ))}
                {dmThreads.length === 0 && (
                  <p className="text-sm text-muted-foreground px-2">No conversations yet</p>
                )}
              </ScrollArea>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-3" data-testid={`drawer-message-${message.id}`}>
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback>
                        {getInitials(message.author?.name || message.author?.email || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-sm">
                          {message.author?.name || message.author?.email || "Unknown"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(message.createdAt)}
                        </span>
                        {message.editedAt && (
                          <span className="text-xs text-muted-foreground">(edited)</span>
                        )}
                      </div>
                      <p className="text-sm break-words">{message.body}</p>
                      {message.attachments && message.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {message.attachments.map(attachment => {
                            const FileIcon = getFileIcon(attachment.mimeType);
                            const isImage = attachment.mimeType.startsWith("image/");
                            return (
                              <a
                                key={attachment.id}
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2 rounded-md bg-muted hover-elevate"
                                data-testid={`drawer-attachment-${attachment.id}`}
                              >
                                {isImage ? (
                                  <img 
                                    src={attachment.url} 
                                    alt={attachment.fileName}
                                    className="h-12 w-12 object-cover rounded"
                                  />
                                ) : (
                                  <>
                                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs truncate max-w-[100px]">{attachment.fileName}</span>
                                  </>
                                )}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No messages yet. Start the conversation!</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <form onSubmit={handleSendMessage} className="p-4 border-t shrink-0">
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map(attachment => {
                    const FileIcon = getFileIcon(attachment.mimeType);
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-1 p-1 rounded-md bg-muted text-xs"
                        data-testid={`drawer-pending-attachment-${attachment.id}`}
                      >
                        <FileIcon className="h-3 w-3 text-muted-foreground" />
                        <span className="truncate max-w-[80px]">{attachment.fileName}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-4 w-4"
                          onClick={() => removePendingAttachment(attachment.id)}
                        >
                          <X className="h-2 w-2" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.xlsx,.csv,.png,.jpg,.jpeg,.webp"
                  multiple
                  onChange={handleFileSelect}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || sendMessageMutation.isPending}
                  data-testid="drawer-button-attach"
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Paperclip className="h-4 w-4" />
                  )}
                </Button>
                <Input
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  placeholder={`Message ${selectedChannel ? "#" + selectedChannel.name : selectedDm ? getDmDisplayName(selectedDm) : ""}`}
                  disabled={sendMessageMutation.isPending}
                  data-testid="drawer-input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!messageInput.trim() && pendingAttachments.length === 0) || sendMessageMutation.isPending}
                  data-testid="drawer-button-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
