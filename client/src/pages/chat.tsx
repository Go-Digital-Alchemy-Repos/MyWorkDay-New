import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Search,
  AtSign,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CHAT_EVENTS, CHAT_ROOM_EVENTS, ChatNewMessagePayload, ChatMessageUpdatedPayload, ChatMessageDeletedPayload } from "@shared/events";

interface ChatChannel {
  id: string;
  tenantId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  unreadCount?: number;
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
  deletedAt?: Date | null;
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
  unreadCount?: number;
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
  const { toast } = useToast();
  const [selectedChannel, setSelectedChannel] = useState<ChatChannel | null>(null);
  const [selectedDm, setSelectedDm] = useState<ChatDmThread | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [newChannelPrivate, setNewChannelPrivate] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastMarkedReadRef = useRef<string | null>(null);
  
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionCursorPos, setMentionCursorPos] = useState(0);
  const messageInputRef = useRef<HTMLInputElement>(null);

  interface MentionableUser {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    displayName: string;
  }

  interface SearchResult {
    id: string;
    body: string;
    createdAt: Date;
    channelId: string | null;
    dmThreadId: string | null;
    channelName: string | null;
    author: { id: string; email: string; displayName: string };
  }

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

  const searchResultsQuery = useQuery<{ messages: SearchResult[]; total: number }>({
    queryKey: ["/api/v1/chat/search", { q: searchQuery }],
    enabled: searchOpen && searchQuery.length >= 2,
  });

  const mentionableUsersQuery = useQuery<MentionableUser[]>({
    queryKey: ["/api/v1/chat/users/mentionable", { 
      channelId: selectedChannel?.id, 
      dmThreadId: selectedDm?.id,
      q: mentionQuery 
    }],
    enabled: mentionOpen && (!!selectedChannel || !!selectedDm),
  });

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart || 0;
    setMessageInput(value);
    
    const textBeforeCursor = value.slice(0, cursorPos);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setMentionOpen(true);
      setMentionQuery(mentionMatch[1]);
      setMentionCursorPos(cursorPos);
    } else {
      setMentionOpen(false);
      setMentionQuery("");
    }
  };

  const insertMention = (user: MentionableUser) => {
    const textBeforeMention = messageInput.slice(0, mentionCursorPos).replace(/@\w*$/, "");
    const textAfterMention = messageInput.slice(mentionCursorPos);
    const mentionText = `@[${user.displayName}](${user.id}) `;
    setMessageInput(textBeforeMention + mentionText + textAfterMention);
    setMentionOpen(false);
    setMentionQuery("");
    messageInputRef.current?.focus();
  };

  const renderMessageBody = (body: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts = [];
    let lastIndex = 0;
    let match;
    
    while ((match = mentionRegex.exec(body)) !== null) {
      if (match.index > lastIndex) {
        parts.push(body.slice(lastIndex, match.index));
      }
      const displayName = match[1];
      const userId = match[2];
      parts.push(
        <Badge 
          key={`${userId}-${match.index}`} 
          variant="secondary" 
          className="cursor-pointer text-xs py-0 px-1"
        >
          <AtSign className="h-3 w-3 mr-0.5" />
          {displayName}
        </Badge>
      );
      lastIndex = mentionRegex.lastIndex;
    }
    
    if (lastIndex < body.length) {
      parts.push(body.slice(lastIndex));
    }
    
    return parts.length > 0 ? parts : body;
  };

  useEffect(() => {
    if (selectedChannel && channelMessagesQuery.data) {
      setMessages(channelMessagesQuery.data);
    } else if (selectedDm && dmMessagesQuery.data) {
      setMessages(dmMessagesQuery.data);
    } else {
      setMessages([]);
    }
  }, [selectedChannel, selectedDm, channelMessagesQuery.data, dmMessagesQuery.data]);

  // Mark thread as read when messages load and there are messages
  // Uses ref to prevent redundant POST requests when the same message is already marked
  useEffect(() => {
    if (messages.length > 0 && (selectedChannel || selectedDm)) {
      const lastMessage = messages[messages.length - 1];
      const threadKey = selectedChannel 
        ? `channel:${selectedChannel.id}:${lastMessage.id}`
        : `dm:${selectedDm?.id}:${lastMessage.id}`;
      
      // Skip if we've already marked this exact message as read
      if (lastMarkedReadRef.current === threadKey) {
        return;
      }
      
      lastMarkedReadRef.current = threadKey;
      
      if (selectedChannel) {
        markAsReadMutation.mutate({
          targetType: "channel",
          targetId: selectedChannel.id,
          lastReadMessageId: lastMessage.id,
        });
      } else if (selectedDm) {
        markAsReadMutation.mutate({
          targetType: "dm",
          targetId: selectedDm.id,
          lastReadMessageId: lastMessage.id,
        });
      }
    }
  }, [messages.length, selectedChannel?.id, selectedDm?.id]);

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

    const handleMessageUpdated = (payload: ChatMessageUpdatedPayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        setMessages(prev => prev.map(msg => 
          msg.id === payload.messageId 
            ? { ...msg, ...payload.updates }
            : msg
        ));
      }
    };

    const handleMessageDeleted = (payload: ChatMessageDeletedPayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        setMessages(prev => prev.map(msg => 
          msg.id === payload.messageId 
            ? { ...msg, body: "Message deleted", deletedAt: new Date() }
            : msg
        ));
      }
    };

    socket.on(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
    socket.on(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
    socket.on(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);

    return () => {
      socket.off(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
      socket.off(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
      socket.off(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);
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

  const markAsReadMutation = useMutation({
    mutationFn: async ({ targetType, targetId, lastReadMessageId }: { targetType: "channel" | "dm"; targetId: string; lastReadMessageId: string }) => {
      return apiRequest("POST", "/api/v1/chat/reads", { targetType, targetId, lastReadMessageId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, body }: { messageId: string; body: string }): Promise<ChatMessage> => {
      const res = await apiRequest("PATCH", `/api/v1/chat/messages/${messageId}`, { body });
      return res.json();
    },
    onSuccess: (data: ChatMessage) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === data.id ? { ...msg, body: data.body, editedAt: data.editedAt } : msg))
      );
      setEditingMessageId(null);
      setEditingBody("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to edit message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      return apiRequest("DELETE", `/api/v1/chat/messages/${messageId}`);
    },
    onSuccess: (_data, messageId) => {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === messageId ? { ...msg, body: "Message deleted", deletedAt: new Date() } : msg))
      );
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const markCurrentThreadAsRead = () => {
    if (messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    if (selectedChannel) {
      markAsReadMutation.mutate({
        targetType: "channel",
        targetId: selectedChannel.id,
        lastReadMessageId: lastMessage.id,
      });
    } else if (selectedDm) {
      markAsReadMutation.mutate({
        targetType: "dm",
        targetId: selectedDm.id,
        lastReadMessageId: lastMessage.id,
      });
    }
  };

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
                <span className="truncate flex-1">{channel.name}</span>
                {channel.unreadCount && channel.unreadCount > 0 && (
                  <span 
                    className="ml-auto px-1.5 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full"
                    data-testid={`channel-unread-${channel.id}`}
                  >
                    {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
                  </span>
                )}
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
                <span className="truncate flex-1">{getDmDisplayName(dm)}</span>
                {dm.unreadCount && dm.unreadCount > 0 && (
                  <span 
                    className="ml-auto px-1.5 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full"
                    data-testid={`dm-unread-${dm.id}`}
                  >
                    {dm.unreadCount > 99 ? "99+" : dm.unreadCount}
                  </span>
                )}
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
            <div className="h-14 border-b flex items-center px-4 gap-2 justify-between">
              <div className="flex items-center gap-2">
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchOpen(true)}
                data-testid="button-chat-search"
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.map((message) => {
                  const isDeleted = !!message.deletedAt;
                  const isOwnMessage = message.authorUserId === user?.id;
                  const isTenantAdmin = user?.role === "admin";
                  const isEditing = editingMessageId === message.id;
                  const canEdit = isOwnMessage && !isDeleted;
                  const canDelete = (isOwnMessage || isTenantAdmin) && !isDeleted;
                  
                  return (
                  <div key={message.id} className="flex gap-3 group" data-testid={`message-${message.id}`}>
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
                        {message.editedAt && !isDeleted && (
                          <span className="text-xs text-muted-foreground">(edited)</span>
                        )}
                        {(canEdit || canDelete) && !isEditing && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                data-testid={`message-menu-${message.id}`}
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
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
                                  onClick={() => deleteMessageMutation.mutate(message.id)}
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
                      {isEditing ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            value={editingBody}
                            onChange={(e) => setEditingBody(e.target.value)}
                            className="flex-1 text-sm"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (editingBody.trim()) {
                                  editMessageMutation.mutate({ messageId: message.id, body: editingBody.trim() });
                                }
                              }
                              if (e.key === "Escape") {
                                setEditingMessageId(null);
                                setEditingBody("");
                              }
                            }}
                            data-testid={`message-edit-input-${message.id}`}
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              if (editingBody.trim()) {
                                editMessageMutation.mutate({ messageId: message.id, body: editingBody.trim() });
                              }
                            }}
                            disabled={editMessageMutation.isPending || !editingBody.trim()}
                            data-testid={`message-edit-save-${message.id}`}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditingBody("");
                            }}
                            data-testid={`message-edit-cancel-${message.id}`}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <p className={`text-sm break-words ${isDeleted ? "text-muted-foreground italic" : ""}`}>
                          {isDeleted ? message.body : renderMessageBody(message.body)}
                        </p>
                      )}
                      {message.attachments && message.attachments.length > 0 && !isDeleted && (
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
                  );
                })}
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
                <div className="relative flex-1">
                  <Input
                    ref={messageInputRef}
                    value={messageInput}
                    onChange={handleMessageInputChange}
                    placeholder={`Message ${selectedChannel ? "#" + selectedChannel.name : getDmDisplayName(selectedDm!)}`}
                    disabled={sendMessageMutation.isPending}
                    data-testid="input-message"
                  />
                  {mentionOpen && mentionableUsersQuery.data && mentionableUsersQuery.data.length > 0 && (
                    <div className="absolute bottom-full left-0 w-64 mb-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-y-auto">
                      {mentionableUsersQuery.data.map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => insertMention(u)}
                          className="w-full px-3 py-2 text-left text-sm hover-elevate flex items-center gap-2"
                          data-testid={`mention-user-${u.id}`}
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {u.displayName.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="font-medium truncate">{u.displayName}</div>
                            <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Search Messages</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages (min 2 characters)"
              data-testid="input-search-messages"
            />
            <ScrollArea className="h-80">
              {searchResultsQuery.isLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              )}
              {searchResultsQuery.data && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground mb-2">
                    Found {searchResultsQuery.data.total} message{searchResultsQuery.data.total !== 1 ? "s" : ""}
                  </p>
                  {searchResultsQuery.data.messages.map((result) => (
                    <Card
                      key={result.id}
                      className="p-3 cursor-pointer hover-elevate"
                      onClick={() => {
                        if (result.channelId) {
                          const channel = channels.find(c => c.id === result.channelId);
                          if (channel) {
                            setSelectedChannel(channel);
                            setSelectedDm(null);
                          }
                        } else if (result.dmThreadId) {
                          const dm = dmThreads.find(d => d.id === result.dmThreadId);
                          if (dm) {
                            setSelectedDm(dm);
                            setSelectedChannel(null);
                          }
                        }
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                      data-testid={`search-result-${result.id}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Avatar className="h-5 w-5">
                          <AvatarFallback className="text-xs">
                            {result.author.displayName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm font-medium">{result.author.displayName}</span>
                        {result.channelName && (
                          <Badge variant="outline" className="text-xs">
                            <Hash className="h-3 w-3 mr-0.5" />
                            {result.channelName}
                          </Badge>
                        )}
                        {result.dmThreadId && (
                          <Badge variant="outline" className="text-xs">
                            <MessageCircle className="h-3 w-3 mr-0.5" />
                            DM
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(result.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {renderMessageBody(result.body)}
                      </p>
                    </Card>
                  ))}
                  {searchResultsQuery.data.messages.length === 0 && searchQuery.length >= 2 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No messages found matching "{searchQuery}"
                    </p>
                  )}
                </div>
              )}
              {!searchResultsQuery.data && searchQuery.length < 2 && searchQuery.length > 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Type at least 2 characters to search
                </p>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSearchOpen(false); setSearchQuery(""); }}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
