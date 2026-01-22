import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { getSocket, joinChatRoom, leaveChatRoom, onConnectionChange, isSocketConnected } from "@/lib/realtime/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  UserPlus,
  UserMinus,
  Settings,
  RefreshCw,
  AlertCircle,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CHAT_EVENTS, CHAT_ROOM_EVENTS, ChatNewMessagePayload, ChatMessageUpdatedPayload, ChatMessageDeletedPayload, ChatMemberJoinedPayload, ChatMemberLeftPayload, ChatMemberAddedPayload, ChatMemberRemovedPayload } from "@shared/events";

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

// Message status for optimistic updates
type MessageStatus = 'pending' | 'sent' | 'failed';

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
  // Optimistic update status (client-side only)
  _status?: MessageStatus;
  _tempId?: string; // Temporary ID for pending messages
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

  // Team panel state
  const [sidebarTab, setSidebarTab] = useState<"chats" | "team">("chats");
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamUsers, setSelectedTeamUsers] = useState<Set<string>>(new Set());
  const [createGroupDialogOpen, setCreateGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Members drawer state
  const [membersDrawerOpen, setMembersDrawerOpen] = useState(false);
  const [addMemberSearchQuery, setAddMemberSearchQuery] = useState("");
  const [removeMemberConfirmUserId, setRemoveMemberConfirmUserId] = useState<string | null>(null);

  // Start New Chat drawer state
  const [startChatDrawerOpen, setStartChatDrawerOpen] = useState(false);
  const [startChatSearchQuery, setStartChatSearchQuery] = useState("");
  const [startChatSelectedUsers, setStartChatSelectedUsers] = useState<Set<string>>(new Set());
  const [startChatGroupName, setStartChatGroupName] = useState("");

  // Connection status tracking
  const [isConnected, setIsConnected] = useState(isSocketConnected());
  
  // Track seen message IDs to prevent duplicates
  const seenMessageIds = useRef<Set<string>>(new Set());
  
  // Track pending messages by tempId for reliable reconciliation
  const pendingMessagesRef = useRef<Map<string, { body: string; timestamp: number }>>(new Map());

  interface TeamUser {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    role: string;
    avatarUrl: string | null;
    displayName: string;
  }

  interface ChannelMember {
    id: string;
    userId: string;
    role: string;
    user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
    };
  }

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

  // Team panel: fetch all tenant users
  const { data: teamUsers = [], isLoading: isLoadingTeamUsers } = useQuery<TeamUser[]>({
    queryKey: ["/api/v1/chat/users", { search: teamSearchQuery }],
    enabled: sidebarTab === "team" || membersDrawerOpen,
  });

  // Separate query for Start Chat drawer to avoid cache conflicts
  const { data: startChatUsers = [], isLoading: isLoadingStartChatUsers } = useQuery<TeamUser[]>({
    queryKey: ["/api/v1/chat/users", "startChat", { search: startChatSearchQuery }],
    enabled: startChatDrawerOpen,
  });

  // Channel members query for the members drawer
  const { data: channelMembers = [], refetch: refetchChannelMembers } = useQuery<ChannelMember[]>({
    queryKey: ["/api/v1/chat/channels", selectedChannel?.id, "members"],
    enabled: !!selectedChannel && membersDrawerOpen,
  });

  // Mutation: Add members to channel
  const addMembersMutation = useMutation({
    mutationFn: async ({ channelId, userIds }: { channelId: string; userIds: string[] }) => {
      return apiRequest("POST", `/api/v1/chat/channels/${channelId}/members`, { userIds });
    },
    onSuccess: () => {
      refetchChannelMembers();
      setAddMemberSearchQuery("");
      toast({ title: "Members added successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add members",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation: Remove member from channel
  const removeMemberMutation = useMutation({
    mutationFn: async ({ channelId, userId }: { channelId: string; userId: string }) => {
      return apiRequest("DELETE", `/api/v1/chat/channels/${channelId}/members/${userId}`);
    },
    onSuccess: (_, { userId }) => {
      refetchChannelMembers();
      setRemoveMemberConfirmUserId(null);
      // If user removed themselves, close drawer and deselect channel
      if (userId === user?.id) {
        setMembersDrawerOpen(false);
        setSelectedChannel(null);
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
      toast({ title: "Member removed" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove member",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation: Start DM with selected users
  const startDmMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest("POST", "/api/v1/chat/dm", { userIds });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
      setSelectedTeamUsers(new Set());
      setSidebarTab("chats");
      // Select the newly created/returned DM
      if (result && result.id) {
        setSelectedDm(result);
        setSelectedChannel(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start conversation",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation: Create group channel with selected users
  const createGroupWithMembersMutation = useMutation({
    mutationFn: async ({ name, userIds }: { name: string; userIds: string[] }) => {
      const channel: any = await apiRequest("POST", "/api/v1/chat/channels", { name, isPrivate: true });
      let addMembersFailed = false;
      if (userIds.length > 0 && channel?.id) {
        try {
          await apiRequest("POST", `/api/v1/chat/channels/${channel.id}/members`, { userIds });
        } catch (err) {
          addMembersFailed = true;
        }
      }
      return { channel, addMembersFailed };
    },
    onSuccess: (result: { channel: any; addMembersFailed: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setSelectedTeamUsers(new Set());
      setCreateGroupDialogOpen(false);
      setNewGroupName("");
      setSidebarTab("chats");
      if (result.channel?.id) {
        setSelectedChannel(result.channel);
        setSelectedDm(null);
      }
      if (result.addMembersFailed) {
        toast({
          title: "Group created with warning",
          description: "The group was created but some members could not be added. You can add them later.",
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create group",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle start chat from team panel
  const handleStartChat = () => {
    if (selectedTeamUsers.size === 0) return;
    const userIds = Array.from(selectedTeamUsers);
    
    if (userIds.length === 1) {
      // Start DM
      startDmMutation.mutate(userIds);
    } else {
      // Multiple users - open group creation dialog
      setCreateGroupDialogOpen(true);
    }
  };

  // Toggle user selection in team panel
  const toggleUserSelection = (userId: string) => {
    setSelectedTeamUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Filter team users excluding self
  const filteredTeamUsers = teamUsers.filter(u => u.id !== user?.id);

  // Get users not in current channel for add member dropdown
  const channelMemberIds = new Set(channelMembers.map(m => m.userId));
  const usersNotInChannel = teamUsers.filter(u => !channelMemberIds.has(u.id) && u.id !== user?.id);
  const filteredUsersNotInChannel = addMemberSearchQuery
    ? usersNotInChannel.filter(u =>
        u.displayName.toLowerCase().includes(addMemberSearchQuery.toLowerCase()) ||
        u.email.toLowerCase().includes(addMemberSearchQuery.toLowerCase())
      )
    : usersNotInChannel;

  // Start Chat drawer: filter users by search and exclude self (uses dedicated query)
  const startChatFilteredUsers = startChatUsers.filter(u => u.id !== user?.id);

  // Get selected users for display in chips (uses dedicated query)
  const startChatSelectedUsersList = startChatUsers.filter(u => startChatSelectedUsers.has(u.id));

  // Toggle user selection in Start Chat drawer
  const toggleStartChatUserSelection = (userId: string) => {
    setStartChatSelectedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  // Mutation for starting a new chat from drawer
  const startNewChatMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return apiRequest("POST", "/api/v1/chat/dm", { userIds });
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
      setStartChatSelectedUsers(new Set());
      setStartChatSearchQuery("");
      setStartChatDrawerOpen(false);
      if (result && result.id) {
        setSelectedDm(result);
        setSelectedChannel(null);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to start conversation",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Mutation for creating a group from drawer
  const createGroupFromDrawerMutation = useMutation({
    mutationFn: async ({ name, userIds }: { name: string; userIds: string[] }) => {
      const channel: any = await apiRequest("POST", "/api/v1/chat/channels", { name, isPrivate: true });
      let addMembersFailed = false;
      if (userIds.length > 0 && channel?.id) {
        try {
          await apiRequest("POST", `/api/v1/chat/channels/${channel.id}/members`, { userIds });
        } catch (err) {
          addMembersFailed = true;
        }
      }
      return { channel, addMembersFailed };
    },
    onSuccess: (result: { channel: any; addMembersFailed: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      setStartChatSelectedUsers(new Set());
      setStartChatSearchQuery("");
      setStartChatGroupName("");
      setStartChatDrawerOpen(false);
      if (result.channel?.id) {
        setSelectedChannel(result.channel);
        setSelectedDm(null);
      }
      if (result.addMembersFailed) {
        toast({
          title: "Group created with warning",
          description: "The group was created but some members could not be added.",
          variant: "default",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create group",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handle create chat from drawer
  const handleCreateChatFromDrawer = () => {
    if (startChatSelectedUsers.size === 0) return;
    const userIds = Array.from(startChatSelectedUsers);
    
    if (userIds.length === 1) {
      // Start DM
      startNewChatMutation.mutate(userIds);
    } else {
      // Multiple users - create group
      const groupName = startChatGroupName.trim() || `Group (${userIds.length + 1} members)`;
      createGroupFromDrawerMutation.mutate({ name: groupName, userIds });
    }
  };

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

  // Sort messages by createdAt with ID fallback for consistent ordering
  const sortMessages = (msgs: ChatMessage[]): ChatMessage[] => {
    return [...msgs].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
      // Fallback to ID comparison for messages with same timestamp
      return a.id.localeCompare(b.id);
    });
  };

  useEffect(() => {
    if (selectedChannel && channelMessagesQuery.data) {
      setMessages(sortMessages(channelMessagesQuery.data));
      // Clear seen IDs when switching conversations
      seenMessageIds.current.clear();
      channelMessagesQuery.data.forEach(m => seenMessageIds.current.add(m.id));
    } else if (selectedDm && dmMessagesQuery.data) {
      setMessages(sortMessages(dmMessagesQuery.data));
      // Clear seen IDs when switching conversations
      seenMessageIds.current.clear();
      dmMessagesQuery.data.forEach(m => seenMessageIds.current.add(m.id));
    } else {
      setMessages([]);
      seenMessageIds.current.clear();
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

  // Track connection status for UI feedback
  useEffect(() => {
    const unsubscribe = onConnectionChange((connected) => {
      setIsConnected(connected);
      if (connected) {
        // Refetch data on reconnect to ensure fresh state
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
        if (selectedChannel) {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "messages"] });
        }
        if (selectedDm) {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm", selectedDm.id, "messages"] });
        }
      }
    });
    return unsubscribe;
  }, [selectedChannel, selectedDm]);

  // Join/leave socket rooms when selection changes
  // Uses centralized room management with reconnect support
  useEffect(() => {
    if (!user) return;

    // Join the appropriate room (server validates access using session data)
    if (selectedChannel) {
      joinChatRoom('channel', selectedChannel.id);
    } else if (selectedDm) {
      joinChatRoom('dm', selectedDm.id);
    }

    // Leave the room on cleanup or selection change
    return () => {
      if (selectedChannel) {
        leaveChatRoom('channel', selectedChannel.id);
      } else if (selectedDm) {
        leaveChatRoom('dm', selectedDm.id);
      }
    };
  }, [selectedChannel, selectedDm, user]);

  // Periodically clean up stale pending messages (older than 2 minutes)
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      const staleThreshold = 2 * 60 * 1000; // 2 minutes
      
      for (const [tempId, pending] of pendingMessagesRef.current.entries()) {
        if (now - pending.timestamp > staleThreshold) {
          pendingMessagesRef.current.delete(tempId);
          // Also mark the message as failed if still pending
          setMessages(prev => 
            prev.map(m => 
              m._tempId === tempId && m._status === 'pending'
                ? { ...m, _status: 'failed' as const }
                : m
            )
          );
        }
      }
    };
    
    const interval = setInterval(cleanup, 30000); // Run every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewMessage = (payload: ChatNewMessagePayload) => {
      const isCurrentChannel = selectedChannel && payload.targetType === "channel" && payload.targetId === selectedChannel.id;
      const isCurrentDm = selectedDm && payload.targetType === "dm" && payload.targetId === selectedDm.id;
      
      if (isCurrentChannel || isCurrentDm) {
        const message = payload.message as ChatMessage;
        
        // Guard against duplicate messages
        if (seenMessageIds.current.has(message.id)) {
          console.debug("[Chat] Ignoring duplicate message:", message.id);
          return;
        }
        seenMessageIds.current.add(message.id);
        
        // Try to find a matching pending message using the ref
        // This provides reliable reconciliation by finding the oldest pending message
        // with matching body from the same author
        let matchedTempId: string | null = null;
        const messageTime = new Date(message.createdAt).getTime();
        
        for (const [tempId, pending] of pendingMessagesRef.current.entries()) {
          // Match by body and recency (within 30 seconds)
          if (pending.body === message.body && 
              Math.abs(messageTime - pending.timestamp) < 30000) {
            matchedTempId = tempId;
            break; // Take the first (oldest) matching pending message
          }
        }
        
        // Replace pending message with confirmed one or add new message
        setMessages(prev => {
          let updated: ChatMessage[];
          
          if (matchedTempId) {
            // Find and replace the pending message by tempId
            const pendingIndex = prev.findIndex(m => m._tempId === matchedTempId);
            
            if (pendingIndex >= 0) {
              updated = [...prev];
              updated[pendingIndex] = { ...message, _status: 'sent' };
              // Clean up the pending reference
              pendingMessagesRef.current.delete(matchedTempId);
            } else {
              // Pending message not found in array (race condition), just add
              updated = [...prev, { ...message, _status: 'sent' }];
              pendingMessagesRef.current.delete(matchedTempId);
            }
          } else if (prev.some(m => m.id === message.id)) {
            // Message already exists, skip
            return prev;
          } else {
            // Add new message (from another user or reconnect)
            updated = [...prev, { ...message, _status: 'sent' }];
          }
          
          // Re-sort to maintain consistent ordering
          return sortMessages(updated);
        });
      }
      
      // Invalidate conversation list to update last message preview
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/dm"] });
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

    const handleMemberJoined = (payload: ChatMemberJoinedPayload) => {
      // Refresh channel members if currently viewing this channel's members
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
      }
      // Refresh channel list in case user was added to a new channel
      if (payload.targetType === 'channel') {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
    };

    const handleMemberLeft = (payload: ChatMemberLeftPayload) => {
      // Refresh channel members if currently viewing this channel's members
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
        // If current user was removed, deselect and show notification
        if (payload.userId === user?.id) {
          setSelectedChannel(null);
          setMembersDrawerOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
          toast({
            title: "Removed from channel",
            description: "You've been removed from this chat.",
            variant: "default",
          });
        }
      }
      // Refresh channel list
      if (payload.targetType === 'channel') {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      }
    };

    // Handle member added (richer info, emitted to channel room)
    const handleMemberAdded = (payload: ChatMemberAddedPayload) => {
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        // Invalidate members list to refresh with new member
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
      }
    };

    // Handle member removed (richer info, emitted to channel room)
    const handleMemberRemoved = (payload: ChatMemberRemovedPayload) => {
      if (payload.targetType === 'channel' && selectedChannel && payload.targetId === selectedChannel.id) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels", selectedChannel.id, "members"] });
        // If current user was removed, deselect and navigate out with message
        if (payload.userId === user?.id) {
          // Leave the socket room immediately
          leaveChatRoom('channel', selectedChannel.id);
          setSelectedChannel(null);
          setMembersDrawerOpen(false);
          queryClient.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
          toast({
            title: "Removed from channel",
            description: "You have been removed from this channel and can no longer access it.",
            variant: "destructive",
          });
        }
      }
    };

    socket.on(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
    socket.on(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
    socket.on(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);
    socket.on(CHAT_EVENTS.MEMBER_JOINED as any, handleMemberJoined as any);
    socket.on(CHAT_EVENTS.MEMBER_LEFT as any, handleMemberLeft as any);
    socket.on(CHAT_EVENTS.MEMBER_ADDED as any, handleMemberAdded as any);
    socket.on(CHAT_EVENTS.MEMBER_REMOVED as any, handleMemberRemoved as any);

    return () => {
      socket.off(CHAT_EVENTS.NEW_MESSAGE as any, handleNewMessage as any);
      socket.off(CHAT_EVENTS.MESSAGE_UPDATED as any, handleMessageUpdated as any);
      socket.off(CHAT_EVENTS.MESSAGE_DELETED as any, handleMessageDeleted as any);
      socket.off(CHAT_EVENTS.MEMBER_JOINED as any, handleMemberJoined as any);
      socket.off(CHAT_EVENTS.MEMBER_LEFT as any, handleMemberLeft as any);
      socket.off(CHAT_EVENTS.MEMBER_ADDED as any, handleMemberAdded as any);
      socket.off(CHAT_EVENTS.MEMBER_REMOVED as any, handleMemberRemoved as any);
    };
  }, [selectedChannel, selectedDm, user?.id]);

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
    mutationFn: async ({ body, attachmentIds, tempId }: { body: string; attachmentIds?: string[]; tempId: string }) => {
      const payload = { body, attachmentIds };
      if (selectedChannel) {
        return apiRequest("POST", `/api/v1/chat/channels/${selectedChannel.id}/messages`, payload);
      } else if (selectedDm) {
        return apiRequest("POST", `/api/v1/chat/dm/${selectedDm.id}/messages`, payload);
      }
      throw new Error("No channel or DM selected");
    },
    onMutate: async ({ body, tempId }) => {
      // Track pending message for reliable reconciliation
      pendingMessagesRef.current.set(tempId, { 
        body, 
        timestamp: Date.now() 
      });
      
      // Optimistic update: add pending message immediately
      const pendingMessage: ChatMessage = {
        id: tempId,
        tenantId: user?.tenantId || '',
        channelId: selectedChannel?.id || null,
        dmThreadId: selectedDm?.id || null,
        authorUserId: user?.id || '',
        body,
        createdAt: new Date(),
        editedAt: null,
        author: user ? {
          id: user.id,
          name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl || null,
        } : undefined,
        _status: 'pending',
        _tempId: tempId,
      };
      
      setMessages(prev => [...prev, pendingMessage]);
      setMessageInput("");
      setPendingAttachments([]);
      
      return { tempId, body };
    },
    onError: (_error, _variables, context) => {
      // Mark the pending message as failed
      if (context?.tempId) {
        // Remove from pending ref since it failed
        pendingMessagesRef.current.delete(context.tempId);
        
        setMessages(prev => 
          prev.map(msg => 
            msg._tempId === context.tempId 
              ? { ...msg, _status: 'failed' as const }
              : msg
          )
        );
      }
      toast({
        title: "Failed to send message",
        description: "Click the retry button to try again.",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      // Message will be replaced by socket event with confirmed ID
    },
  });

  // Retry failed message
  const retryFailedMessage = (failedMsg: ChatMessage) => {
    // Remove the failed message
    setMessages(prev => prev.filter(m => m._tempId !== failedMsg._tempId));
    
    // Re-send the message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sendMessageMutation.mutate({ 
      body: failedMsg.body, 
      attachmentIds: failedMsg.attachments?.map(a => a.id),
      tempId 
    });
  };

  // Remove failed message
  const removeFailedMessage = (tempId: string) => {
    setMessages(prev => prev.filter(m => m._tempId !== tempId));
  };

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

  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageInput.trim() && pendingAttachments.length === 0) return;
    
    // Generate temporary ID for optimistic update
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    sendMessageMutation.mutate({
      body: messageInput.trim() || " ", // Ensure body is not empty
      attachmentIds: pendingAttachments.map(a => a.id),
      tempId,
    });
  };

  // Handle keyboard shortcuts for message input (Enter to send, Shift+Enter for newline)
  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
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
        <Tabs value={sidebarTab} onValueChange={(v) => setSidebarTab(v as "chats" | "team")} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-2 mt-2" style={{ width: "calc(100% - 16px)" }}>
            <TabsTrigger value="chats" data-testid="tab-chats">
              <MessageCircle className="h-4 w-4 mr-1" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-1" />
              Team
            </TabsTrigger>
          </TabsList>

          {/* Chats Tab */}
          <TabsContent value="chats" className="flex-1 flex flex-col overflow-hidden mt-0 p-0">
            {/* Start New Chat Button */}
            <div className="p-2 border-b">
              <Button
                className="w-full justify-start gap-2"
                variant="outline"
                onClick={() => setStartChatDrawerOpen(true)}
                data-testid="button-start-new-chat"
              >
                <UserPlus className="h-4 w-4" />
                Start New Chat
              </Button>
            </div>

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
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="flex-1 flex flex-col overflow-hidden mt-0 p-0">
            <div className="p-4 border-b">
              <Input
                placeholder="Search team members..."
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                className="mb-2"
                data-testid="input-team-search"
              />
              {selectedTeamUsers.size > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">
                    {selectedTeamUsers.size} selected
                  </Badge>
                  <Button
                    size="sm"
                    onClick={handleStartChat}
                    disabled={startDmMutation.isPending || createGroupWithMembersMutation.isPending}
                    data-testid="button-start-chat"
                  >
                    {startDmMutation.isPending || createGroupWithMembersMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <MessageCircle className="h-4 w-4 mr-1" />
                    )}
                    Start Chat
                  </Button>
                </div>
              )}
            </div>
            <ScrollArea className="flex-1 p-2">
              {isLoadingTeamUsers ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredTeamUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4">
                  {teamSearchQuery ? "No users found" : "No team members"}
                </p>
              ) : (
                <div className="space-y-1">
                  {filteredTeamUsers.map((teamUser) => (
                    <div
                      key={teamUser.id}
                      className="flex items-center gap-2 px-2 py-2 rounded hover-elevate cursor-pointer"
                      onClick={() => toggleUserSelection(teamUser.id)}
                      data-testid={`team-user-${teamUser.id}`}
                    >
                      <Checkbox
                        checked={selectedTeamUsers.has(teamUser.id)}
                        onCheckedChange={() => toggleUserSelection(teamUser.id)}
                        data-testid={`checkbox-user-${teamUser.id}`}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(teamUser.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{teamUser.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{teamUser.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {teamUser.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
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
              <div className="flex items-center gap-1">
                {/* Connection status indicator */}
                {!isConnected && (
                  <div 
                    className="flex items-center gap-1 text-xs text-muted-foreground px-2"
                    data-testid="connection-status-offline"
                  >
                    <WifiOff className="h-3 w-3 text-destructive" />
                    <span>Reconnecting...</span>
                  </div>
                )}
                {selectedChannel && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMembersDrawerOpen(true)}
                    data-testid="button-channel-members"
                  >
                    <Users className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  data-testid="button-chat-search"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
              <div className="space-y-4">
                {messages.length === 0 && !channelMessagesQuery.isLoading && !dmMessagesQuery.isLoading && (
                  <div className="flex flex-col items-center justify-center h-40 text-muted-foreground" data-testid="empty-messages">
                    <MessageCircle className="h-12 w-12 mb-2 opacity-50" />
                    <p className="text-sm">No messages yet</p>
                    <p className="text-xs">Be the first to send a message!</p>
                  </div>
                )}
                {(channelMessagesQuery.isLoading || dmMessagesQuery.isLoading) && messages.length === 0 && (
                  <div className="space-y-4" data-testid="messages-loading">
                    {[1, 2, 3].map(i => (
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
                {messages.map((message) => {
                  const isDeleted = !!message.deletedAt;
                  const isOwnMessage = message.authorUserId === user?.id;
                  const isTenantAdmin = user?.role === "admin";
                  const isEditing = editingMessageId === message.id;
                  const canEdit = isOwnMessage && !isDeleted && !message._status;
                  const canDelete = (isOwnMessage || isTenantAdmin) && !isDeleted && !message._status;
                  const isPending = message._status === 'pending';
                  const isFailed = message._status === 'failed';
                  
                  return (
                  <div 
                    key={message._tempId || message.id} 
                    className={`flex gap-3 group ${isPending ? 'opacity-60' : ''} ${isFailed ? 'bg-destructive/10 p-2 rounded-md' : ''}`} 
                    data-testid={`message-${message._tempId || message.id}`}
                  >
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
                        {isPending && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sending...
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
                        <>
                          <p className={`text-sm break-words ${isDeleted ? "text-muted-foreground italic" : ""}`}>
                            {isDeleted ? message.body : renderMessageBody(message.body)}
                          </p>
                          {isFailed && message._tempId && (
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => retryFailedMessage(message)}
                                data-testid={`message-retry-${message._tempId}`}
                              >
                                <RefreshCw className="h-3 w-3 mr-1" />
                                Retry
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFailedMessage(message._tempId!)}
                                data-testid={`message-remove-${message._tempId}`}
                              >
                                <X className="h-3 w-3 mr-1" />
                                Remove
                              </Button>
                            </div>
                          )}
                        </>
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
                    onKeyDown={handleMessageKeyDown}
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

      {/* Members Drawer */}
      <Sheet open={membersDrawerOpen} onOpenChange={setMembersDrawerOpen}>
        <SheetContent className="w-80">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Channel Members
            </SheetTitle>
            <SheetDescription>
              {selectedChannel?.name} has {channelMembers.length} member{channelMembers.length !== 1 ? "s" : ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            {/* Add members section - only for channel creator */}
            {selectedChannel?.createdBy === user?.id && usersNotInChannel.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Add Members</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Search users..."
                    value={addMemberSearchQuery}
                    onChange={(e) => setAddMemberSearchQuery(e.target.value)}
                    className="flex-1"
                    data-testid="input-add-member-search"
                  />
                </div>
                {addMemberSearchQuery && filteredUsersNotInChannel.length > 0 && (
                  <ScrollArea className="h-32 border rounded-md p-2">
                    {filteredUsersNotInChannel.map((u) => (
                      <button
                        key={u.id}
                        className="w-full flex items-center gap-2 p-2 rounded hover-elevate text-left"
                        onClick={() => {
                          if (selectedChannel) {
                            addMembersMutation.mutate({ 
                              channelId: selectedChannel.id, 
                              userIds: [u.id] 
                            });
                          }
                        }}
                        data-testid={`add-member-${u.id}`}
                      >
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {getInitials(u.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{u.displayName}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        <Plus className="h-4 w-4 text-muted-foreground" />
                      </button>
                    ))}
                  </ScrollArea>
                )}
              </div>
            )}

            {/* Current members list */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Members</p>
              <ScrollArea className="h-64">
                {channelMembers.map((member) => {
                  const isCreator = selectedChannel?.createdBy === member.userId;
                  const isCurrentUser = member.userId === user?.id;
                  const canRemove = selectedChannel?.createdBy === user?.id || isCurrentUser;
                  
                  return (
                    <div 
                      key={member.id} 
                      className="flex items-center gap-2 p-2 rounded"
                      data-testid={`member-${member.userId}`}
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(member.user?.name || member.user?.email || "?")}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {member.user?.name || member.user?.email || "Unknown"}
                          {isCurrentUser && " (you)"}
                        </p>
                        {isCreator && (
                          <Badge variant="outline" className="text-xs">Owner</Badge>
                        )}
                      </div>
                      {canRemove && !isCreator && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => setRemoveMemberConfirmUserId(member.userId)}
                          data-testid={`remove-member-${member.userId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </ScrollArea>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Create Group Dialog */}
      <Dialog open={createGroupDialogOpen} onOpenChange={setCreateGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Group Chat</DialogTitle>
            <DialogDescription>
              Create a group chat with {selectedTeamUsers.size} selected member{selectedTeamUsers.size !== 1 ? "s" : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="group-name">Group Name</Label>
            <Input
              id="group-name"
              placeholder="Enter group name..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              className="mt-2"
              data-testid="input-group-name"
            />
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setCreateGroupDialogOpen(false);
                setNewGroupName("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newGroupName.trim()) {
                  createGroupWithMembersMutation.mutate({
                    name: newGroupName.trim(),
                    userIds: Array.from(selectedTeamUsers),
                  });
                }
              }}
              disabled={!newGroupName.trim() || createGroupWithMembersMutation.isPending}
              data-testid="button-confirm-create-group"
            >
              {createGroupWithMembersMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Create Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog 
        open={!!removeMemberConfirmUserId} 
        onOpenChange={(open) => !open && setRemoveMemberConfirmUserId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeMemberConfirmUserId === user?.id ? "Leave Channel?" : "Remove Member?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeMemberConfirmUserId === user?.id 
                ? "Are you sure you want to leave this channel? You will need to be re-added by the channel owner to rejoin."
                : "Are you sure you want to remove this member from the channel?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedChannel && removeMemberConfirmUserId) {
                  removeMemberMutation.mutate({
                    channelId: selectedChannel.id,
                    userId: removeMemberConfirmUserId,
                  });
                }
              }}
              data-testid="button-confirm-remove-member"
            >
              {removeMemberMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {removeMemberConfirmUserId === user?.id ? "Leave" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Start New Chat Drawer */}
      <Sheet open={startChatDrawerOpen} onOpenChange={(open) => {
        setStartChatDrawerOpen(open);
        if (!open) {
          // Reset state when drawer closes
          setStartChatSearchQuery("");
          setStartChatSelectedUsers(new Set());
          setStartChatGroupName("");
        }
      }}>
        <SheetContent side="left" className="w-80 flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Start New Chat
            </SheetTitle>
            <SheetDescription>
              Select one or more team members to start a conversation.
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 flex flex-col overflow-hidden mt-4">
            {/* Search input */}
            <Input
              placeholder="Search by name or email..."
              value={startChatSearchQuery}
              onChange={(e) => setStartChatSearchQuery(e.target.value)}
              className="mb-4"
              data-testid="input-start-chat-search"
            />

            {/* Selected users chips */}
            {startChatSelectedUsersList.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-4 p-2 border rounded-md bg-muted/50">
                {startChatSelectedUsersList.map((u) => (
                  <Badge 
                    key={u.id} 
                    variant="secondary" 
                    className="flex items-center gap-1 pr-1"
                  >
                    {u.displayName}
                    <button
                      onClick={() => toggleStartChatUserSelection(u.id)}
                      className="ml-1 rounded-full hover:bg-muted p-0.5"
                      data-testid={`remove-chip-${u.id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Group name input (shown for 2+ selections) */}
            {startChatSelectedUsers.size >= 2 && (
              <div className="mb-4">
                <Label htmlFor="start-chat-group-name" className="text-sm">Group Name (optional)</Label>
                <Input
                  id="start-chat-group-name"
                  placeholder="Enter group name..."
                  value={startChatGroupName}
                  onChange={(e) => setStartChatGroupName(e.target.value)}
                  className="mt-1"
                  data-testid="input-start-chat-group-name"
                />
              </div>
            )}

            {/* User list */}
            <ScrollArea className="flex-1">
              {isLoadingStartChatUsers ? (
                <div className="flex justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : startChatFilteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center p-4">
                  {startChatSearchQuery ? "No users found" : "No team members available"}
                </p>
              ) : (
                <div className="space-y-1">
                  {startChatFilteredUsers.map((teamUser) => (
                    <div
                      key={teamUser.id}
                      className={`flex items-center gap-2 px-2 py-2 rounded hover-elevate cursor-pointer ${
                        startChatSelectedUsers.has(teamUser.id) ? "bg-accent" : ""
                      }`}
                      onClick={() => toggleStartChatUserSelection(teamUser.id)}
                      data-testid={`start-chat-user-${teamUser.id}`}
                    >
                      <Checkbox
                        checked={startChatSelectedUsers.has(teamUser.id)}
                        onCheckedChange={() => toggleStartChatUserSelection(teamUser.id)}
                        data-testid={`start-chat-checkbox-${teamUser.id}`}
                      />
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getInitials(teamUser.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{teamUser.displayName}</p>
                        <p className="text-xs text-muted-foreground truncate">{teamUser.email}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {teamUser.role}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Action button */}
            <div className="pt-4 border-t mt-auto">
              <Button
                className="w-full"
                onClick={handleCreateChatFromDrawer}
                disabled={
                  startChatSelectedUsers.size === 0 ||
                  startNewChatMutation.isPending ||
                  createGroupFromDrawerMutation.isPending
                }
                data-testid="button-create-chat-from-drawer"
              >
                {(startNewChatMutation.isPending || createGroupFromDrawerMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <MessageCircle className="h-4 w-4 mr-2" />
                )}
                {startChatSelectedUsers.size === 0
                  ? "Select Recipients"
                  : startChatSelectedUsers.size === 1
                  ? "Start Direct Message"
                  : `Create Group Chat (${startChatSelectedUsers.size + 1} members)`}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
