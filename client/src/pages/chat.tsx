import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/realtime/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Hash,
  Plus,
  Send,
  MessageCircle,
  Users,
  Lock,
  Paperclip,
  File,
  FileText,
  Image,
  X,
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

export default function ChatPage() {
  const { user } = useAuth();
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [selectedDm, setSelectedDm] = useState<ChatDmThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: channels = [] } = useQuery<ChatChannel[]>({
    queryKey: ["/api/v1/chat/channels"],
  });

  const { data: dmThreads = [] } = useQuery<ChatDmThread[]>({
    queryKey: ["/api/v1/chat/dm"],
  });

  const channelMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "messages"],
    enabled: !!selectedChannel,
  });

  const dmMessagesQuery = useQuery<ChatMessage[]>({
    queryKey: ["/api/v1/chat/dm", selectedDm?.id, "messages"],
    enabled: !!selectedDm,
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

  // Join/leave socket rooms when selection changes
  // Note: userId/tenantId are derived server-side from authenticated session for security
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    // Join the appropriate room (server validates access using session data)
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

    // Leave the room on cleanup or selection change
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
  }, [selectedChannel, selectedDm, user]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

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
  }, [selectedChannel, selectedDm]);

  const createChannelMutation = useMutation({
    mutationFn: async (data: { name: string; isPrivate: boolean }) => {
      return apiRequest("POST", "/api/v1/chat/channels", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setCreateChannelOpen(false);
      setNewChannelName("");
      setNewChannelPrivate(false);
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

  const joinChannelMutation = useMutation({
    mutationFn: async (channelId: string) => {
      return apiRequest("POST", `/api/v1/chat/channels/${channelId}/join`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels/my"] });
    },
  });

  const handleSelectChannel = (channel: ChatChannel) => {
    setSelectedChannel(channel);
    setSelectedDm(null);
    joinChannelMutation.mutate(channel.id);
  };

  const handleSelectDm = (dm: ChatDmThread) => {
    setSelectedDm(dm);
    setSelectedChannel(null);
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
          const error = await response.json();
          console.error("Upload failed:", error);
          continue;
        }
        
        const attachment = await response.json();
        setPendingAttachments(prev => [...prev, attachment]);
      } catch (error) {
        console.error("Upload error:", error);
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
      body: messageInput.trim() || " ", // Ensure body is not empty
      attachmentIds: pendingAttachments.map(a => a.id),
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
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

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const getDmDisplayName = (dm: ChatDmThread) => {
    const otherMembers = dm.members.filter((m) => m.userId !== user?.id);
    if (otherMembers.length === 0) return "Just you";
    return otherMembers.map((m) => m.user.name || m.user.email).join(", ");
  };

  return (
    <div className="flex h-full" data-testid="chat-page">
      <div className="w-64 border-r bg-sidebar flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sidebar-foreground">Channels</h2>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setCreateChannelOpen(true)}
              data-testid="button-create-channel"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="h-40">
            {channels.map((channel) => (
              <button
                key={channel.id}
                onClick={() => handleSelectChannel(channel)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover-elevate ${
                  selectedChannel?.id === channel.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground"
                }`}
                data-testid={`channel-item-${channel.id}`}
              >
                {channel.isPrivate ? (
                  <Lock className="h-4 w-4 flex-shrink-0" />
                ) : (
                  <Hash className="h-4 w-4 flex-shrink-0" />
                )}
                <span className="truncate">{channel.name}</span>
              </button>
            ))}
            {channels.length === 0 && (
              <p className="text-sm text-muted-foreground px-2">No channels yet</p>
            )}
          </ScrollArea>
        </div>

        <div className="p-4 flex-1">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-sidebar-foreground">Direct Messages</h2>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <ScrollArea className="h-40">
            {dmThreads.map((dm) => (
              <button
                key={dm.id}
                onClick={() => handleSelectDm(dm)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm hover-elevate ${
                  selectedDm?.id === dm.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground"
                }`}
                data-testid={`dm-item-${dm.id}`}
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

      <div className="flex-1 flex flex-col">
        {selectedChannel || selectedDm ? (
          <>
            <div className="h-14 border-b flex items-center px-4 gap-2">
              {selectedChannel && (
                <>
                  {selectedChannel.isPrivate ? (
                    <Lock className="h-5 w-5" />
                  ) : (
                    <Hash className="h-5 w-5" />
                  )}
                  <span className="font-semibold">{selectedChannel.name}</span>
                </>
              )}
              {selectedDm && (
                <>
                  <MessageCircle className="h-5 w-5" />
                  <span className="font-semibold">{getDmDisplayName(selectedDm)}</span>
                </>
              )}
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="flex gap-3" data-testid={`message-${message.id}`}>
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
                                    <FileIcon className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-xs truncate max-w-[150px]">{attachment.fileName}</span>
                                    <span className="text-xs text-muted-foreground">({formatFileSize(attachment.sizeBytes)})</span>
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
                    <p>No messages yet. Start the conversation!</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            <form onSubmit={handleSendMessage} className="p-4 border-t">
              {/* Pending attachments preview */}
              {pendingAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {pendingAttachments.map(attachment => {
                    const FileIcon = getFileIcon(attachment.mimeType);
                    return (
                      <div
                        key={attachment.id}
                        className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm"
                        data-testid={`pending-attachment-${attachment.id}`}
                      >
                        <FileIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[100px]">{attachment.fileName}</span>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => removePendingAttachment(attachment.id)}
                          data-testid={`remove-attachment-${attachment.id}`}
                        >
                          <X className="h-3 w-3" />
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
                  data-testid="input-file-upload"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || sendMessageMutation.isPending}
                  data-testid="button-attach-file"
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
                  placeholder={`Message ${selectedChannel ? "#" + selectedChannel.name : getDmDisplayName(selectedDm!)}`}
                  disabled={sendMessageMutation.isPending}
                  data-testid="input-message"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={(!messageInput.trim() && pendingAttachments.length === 0) || sendMessageMutation.isPending}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <Card className="p-8 text-center max-w-sm">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="font-semibold mb-2">Welcome to Chat</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select a channel or direct message to start chatting with your team.
              </p>
              <Button
                onClick={() => setCreateChannelOpen(true)}
                data-testid="button-create-first-channel"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Channel
              </Button>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={createChannelOpen} onOpenChange={setCreateChannelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Channel</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="channel-name">Channel Name</Label>
              <Input
                id="channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. general, random, project-updates"
                data-testid="input-channel-name"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="channel-private">Private Channel</Label>
                <p className="text-xs text-muted-foreground">
                  Only invited members can join
                </p>
              </div>
              <Switch
                id="channel-private"
                checked={newChannelPrivate}
                onCheckedChange={setNewChannelPrivate}
                data-testid="switch-channel-private"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateChannelOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createChannelMutation.mutate({ name: newChannelName, isPrivate: newChannelPrivate })}
              disabled={!newChannelName.trim() || createChannelMutation.isPending}
              data-testid="button-confirm-create-channel"
            >
              Create Channel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
