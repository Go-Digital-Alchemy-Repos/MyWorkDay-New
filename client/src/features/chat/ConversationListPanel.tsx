import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  MessageSquare,
  Hash,
  Lock,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { SelectedConversation, ConversationType } from "./ChatLayout";

export interface ChatChannel {
  id: string;
  tenantId: string;
  name: string;
  isPrivate: boolean;
  createdBy: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
  memberCount?: number;
}

export interface ChatDmThread {
  id: string;
  tenantId: string;
  createdAt: Date;
  unreadCount?: number;
  lastMessage?: {
    body: string;
    createdAt: Date;
    authorName?: string;
  };
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

interface ConversationListPanelProps {
  channels: ChatChannel[];
  dmThreads: ChatDmThread[];
  currentUserId?: string;
  selectedConversation: SelectedConversation | null;
  onSelectConversation: (type: ConversationType, id: string) => void;
  onNewDm: () => void;
  onNewChannel: () => void;
  isLoading?: boolean;
  showNewChannelButton?: boolean;
  className?: string;
}

export function ConversationListPanel({
  channels,
  dmThreads,
  currentUserId,
  selectedConversation,
  onSelectConversation,
  onNewDm,
  onNewChannel,
  isLoading = false,
  showNewChannelButton = true,
  className,
}: ConversationListPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const query = searchQuery.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(query));
  }, [channels, searchQuery]);

  const filteredDmThreads = useMemo(() => {
    if (!searchQuery.trim()) return dmThreads;
    const query = searchQuery.toLowerCase();
    return dmThreads.filter((dm) => {
      const displayName = getDmDisplayName(dm, currentUserId);
      return displayName.toLowerCase().includes(query);
    });
  }, [dmThreads, searchQuery, currentUserId]);

  const totalUnreadChannels = useMemo(
    () => channels.reduce((sum, c) => sum + (c.unreadCount || 0), 0),
    [channels]
  );

  const totalUnreadDms = useMemo(
    () => dmThreads.reduce((sum, dm) => sum + (dm.unreadCount || 0), 0),
    [dmThreads]
  );

  if (isLoading) {
    return (
      <div className={cn("flex flex-col h-full bg-sidebar", className)}>
        <div className="p-3 border-b space-y-3">
          <Skeleton className="h-9 w-full" />
          <div className="flex gap-2">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-8 flex-1" />
          </div>
        </div>
        <div className="p-3 space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col h-full bg-sidebar", className)}
      data-testid="conversation-list-panel"
    >
      <div className="p-3 border-b space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
            data-testid="input-conversation-search"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onNewDm}
            data-testid="button-new-dm"
          >
            <MessageSquare className="h-4 w-4 mr-1.5" />
            New DM
          </Button>
          {showNewChannelButton && (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={onNewChannel}
              data-testid="button-new-channel"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Channel
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          <SectionHeader
            title="Channels"
            count={filteredChannels.length}
            unreadCount={totalUnreadChannels}
            expanded={channelsExpanded}
            onToggle={() => setChannelsExpanded(!channelsExpanded)}
          />
          {channelsExpanded && (
            <div className="px-2 space-y-0.5">
              {filteredChannels.length === 0 ? (
                <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                  {searchQuery ? "No channels match your search" : "No channels yet"}
                </div>
              ) : (
                filteredChannels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    isSelected={
                      selectedConversation?.type === "channel" &&
                      selectedConversation?.id === channel.id
                    }
                    onClick={() => onSelectConversation("channel", channel.id)}
                  />
                ))
              )}
            </div>
          )}

          <div className="my-2" />

          <SectionHeader
            title="Direct Messages"
            count={filteredDmThreads.length}
            unreadCount={totalUnreadDms}
            expanded={dmsExpanded}
            onToggle={() => setDmsExpanded(!dmsExpanded)}
          />
          {dmsExpanded && (
            <div className="px-2 space-y-0.5">
              {filteredDmThreads.length === 0 ? (
                <div className="px-2 py-6 text-center">
                  {searchQuery ? (
                    <p className="text-sm text-muted-foreground">No DMs match your search</p>
                  ) : (
                    <>
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mx-auto mb-2">
                        <MessageSquare className="h-5 w-5 text-primary" />
                      </div>
                      <p className="text-sm font-medium mb-1">No conversations yet</p>
                      <p className="text-xs text-muted-foreground mb-3">Start a direct message with a teammate</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onNewDm}
                        className="mx-auto"
                        data-testid="button-start-first-dm"
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                        Start a DM
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                filteredDmThreads.map((dm) => (
                  <DmRow
                    key={dm.id}
                    dm={dm}
                    currentUserId={currentUserId}
                    isSelected={
                      selectedConversation?.type === "dm" &&
                      selectedConversation?.id === dm.id
                    }
                    onClick={() => onSelectConversation("dm", dm.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  count: number;
  unreadCount: number;
  expanded: boolean;
  onToggle: () => void;
}

function SectionHeader({
  title,
  count,
  unreadCount,
  expanded,
  onToggle,
}: SectionHeaderProps) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-1.5 px-3 py-1.5 w-full text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hover-elevate rounded-md mx-1"
      style={{ width: "calc(100% - 8px)" }}
      data-testid={`section-header-${title.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{title}</span>
      <span className="text-muted-foreground/70">({count})</span>
      {unreadCount > 0 && (
        <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 h-4">
          {unreadCount}
        </Badge>
      )}
    </button>
  );
}

interface ChannelRowProps {
  channel: ChatChannel;
  isSelected: boolean;
  onClick: () => void;
}

function ChannelRow({ channel, isSelected, onClick }: ChannelRowProps) {
  const hasUnread = (channel.unreadCount || 0) > 0;
  const lastActivityTime = channel.lastMessage?.createdAt
    ? formatRelativeTime(new Date(channel.lastMessage.createdAt))
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 w-full p-2 rounded-md text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover-elevate"
      )}
      data-testid={`channel-row-${channel.id}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {channel.isPrivate ? (
          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center">
            <Lock className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center">
            <Hash className="h-4 w-4 text-primary" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm truncate",
              hasUnread ? "font-semibold" : "font-medium"
            )}
          >
            {channel.name}
          </span>
          {lastActivityTime && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {lastActivityTime}
            </span>
          )}
        </div>
        {channel.lastMessage && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {channel.lastMessage.authorName && (
              <span className="font-medium">{channel.lastMessage.authorName}: </span>
            )}
            {cleanMessagePreview(channel.lastMessage.body)}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {channel.memberCount !== undefined && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Users className="h-3 w-3" />
              {channel.memberCount}
            </span>
          )}
          {hasUnread && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 ml-auto">
              {channel.unreadCount}
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

interface DmRowProps {
  dm: ChatDmThread;
  currentUserId?: string;
  isSelected: boolean;
  onClick: () => void;
}

function DmRow({ dm, currentUserId, isSelected, onClick }: DmRowProps) {
  const displayName = getDmDisplayName(dm, currentUserId);
  const hasUnread = (dm.unreadCount || 0) > 0;
  const lastActivityTime = dm.lastMessage?.createdAt
    ? formatRelativeTime(new Date(dm.lastMessage.createdAt))
    : null;

  const otherMembers = dm.members.filter((m) => m.userId !== currentUserId);
  const isGroup = otherMembers.length > 1;
  const firstMember = otherMembers[0];

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-start gap-2.5 w-full p-2 rounded-md text-left transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "hover-elevate"
      )}
      data-testid={`dm-row-${dm.id}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isGroup ? (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : firstMember ? (
          <Avatar className="h-8 w-8">
            <AvatarImage src={firstMember.user.avatarUrl || undefined} />
            <AvatarFallback className="text-xs">
              {getInitials(firstMember.user.name || firstMember.user.email)}
            </AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">?</AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "text-sm truncate",
              hasUnread ? "font-semibold" : "font-medium"
            )}
          >
            {displayName}
          </span>
          {lastActivityTime && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {lastActivityTime}
            </span>
          )}
        </div>
        {dm.lastMessage && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {cleanMessagePreview(dm.lastMessage.body)}
          </p>
        )}
        {hasUnread && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 mt-1">
            {dm.unreadCount}
          </Badge>
        )}
      </div>
    </button>
  );
}

function getDmDisplayName(dm: ChatDmThread, currentUserId?: string): string {
  const otherMembers = dm.members.filter((m) => m.userId !== currentUserId);
  if (otherMembers.length === 0) return "Just you";
  return otherMembers.map((m) => m.user.name || m.user.email).join(", ");
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

function cleanMessagePreview(body: string, maxLength = 50): string {
  const mentionRegex = /@\[([^\]]+)\]\([^)]+\)/g;
  const cleaned = body.replace(mentionRegex, "@$1").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
}

function formatRelativeTime(date: Date): string {
  try {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return formatDistanceToNow(date, { addSuffix: false });
  } catch {
    return "";
  }
}
