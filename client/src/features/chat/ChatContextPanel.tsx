import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  X,
  Users,
  FileText,
  Pin,
  Mail,
  User,
  Hash,
  Lock,
  ExternalLink,
  ChevronLeft,
} from "lucide-react";

interface ChatChannel {
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
  projectId?: string;
  projectName?: string;
}

interface ChatDmThread {
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

interface ChannelMember {
  id: string;
  userId: string;
  user: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

interface ChatContextPanelProps {
  selectedChannel: ChatChannel | null;
  selectedDm: ChatDmThread | null;
  currentUserId?: string;
  channelMembers?: ChannelMember[];
  isOpen: boolean;
  onToggle: () => void;
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

export function ChatContextPanel({
  selectedChannel,
  selectedDm,
  currentUserId,
  channelMembers = [],
  isOpen,
  onToggle,
  className,
}: ChatContextPanelProps) {
  const getOtherDmMember = () => {
    if (!selectedDm || !currentUserId) return null;
    return selectedDm.members.find((m) => m.userId !== currentUserId)?.user;
  };

  const otherMember = getOtherDmMember();

  if (!selectedChannel && !selectedDm) {
    return null;
  }

  return (
    <div
      className={cn(
        "border-l bg-background transition-all duration-300 flex flex-col overflow-hidden",
        isOpen ? "w-72" : "w-0",
        className
      )}
      data-testid="chat-context-panel"
    >
      {isOpen && (
        <>
          <div className="h-14 border-b flex items-center justify-between px-4 shrink-0">
            <span className="font-semibold text-sm">
              {selectedChannel ? "Channel Info" : "Conversation"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggle}
              data-testid="button-close-context-panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1">
            {selectedChannel && (
              <div className="p-4 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {selectedChannel.isPrivate ? (
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <Hash className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="font-semibold">{selectedChannel.name}</span>
                  </div>

                  {selectedChannel.isPrivate && (
                    <Badge variant="secondary" className="text-xs">
                      <Lock className="h-3 w-3 mr-1" />
                      Private Channel
                    </Badge>
                  )}

                  {selectedChannel.projectId && selectedChannel.projectName && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Project</p>
                        <p className="text-sm font-medium truncate">
                          {selectedChannel.projectName}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        asChild
                      >
                        <a
                          href={`/projects/${selectedChannel.projectId}`}
                          data-testid="link-project"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Members</span>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {channelMembers.length || selectedChannel.memberCount || 0}
                    </Badge>
                  </div>

                  {channelMembers.length > 0 ? (
                    <div className="space-y-1">
                      {channelMembers.slice(0, 10).map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center gap-2 p-2 rounded-md hover-elevate"
                          data-testid={`member-${member.userId}`}
                        >
                          <Avatar className="h-7 w-7">
                            {member.user.avatarUrl && (
                              <AvatarImage src={member.user.avatarUrl} />
                            )}
                            <AvatarFallback className="text-xs">
                              {getInitials(member.user.name || member.user.email)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate flex-1">
                            {member.user.name || member.user.email}
                          </span>
                          {member.userId === currentUserId && (
                            <Badge variant="secondary" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                      ))}
                      {channelMembers.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center py-1">
                          +{channelMembers.length - 10} more
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Member list not available
                    </p>
                  )}
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Pin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Pinned Messages</span>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">
                      No pinned messages
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Shared Files</span>
                  </div>
                  <div className="p-3 rounded-md bg-muted/50 text-center">
                    <p className="text-xs text-muted-foreground">
                      No shared files
                    </p>
                  </div>
                </div>
              </div>
            )}

            {selectedDm && otherMember && (
              <div className="p-4 space-y-6">
                <div className="flex flex-col items-center text-center space-y-3">
                  <Avatar className="h-20 w-20">
                    {otherMember.avatarUrl && (
                      <AvatarImage src={otherMember.avatarUrl} />
                    )}
                    <AvatarFallback className="text-xl">
                      {getInitials(otherMember.name || otherMember.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-semibold">
                      {otherMember.name || "Unknown User"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {otherMember.email}
                    </p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Quick Actions
                  </p>
                  <div className="space-y-1">
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      asChild
                    >
                      <a
                        href={`/team?user=${otherMember.id}`}
                        data-testid="button-view-profile"
                      >
                        <User className="h-4 w-4 mr-2" />
                        View Profile
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full justify-start"
                      asChild
                    >
                      <a
                        href={`mailto:${otherMember.email}`}
                        data-testid="button-send-email"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        Send Email
                      </a>
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Conversation
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      Started:{" "}
                      {new Date(selectedDm.createdAt).toLocaleDateString()}
                    </p>
                    <p>Participants: {selectedDm.members.length}</p>
                  </div>
                </div>
              </div>
            )}
          </ScrollArea>
        </>
      )}
    </div>
  );
}

export function ChatContextPanelToggle({
  onClick,
  isOpen,
}: {
  onClick: () => void;
  isOpen: boolean;
}) {
  if (isOpen) return null;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label="Show details panel"
      title="Show details"
      data-testid="button-open-context-panel"
    >
      <ChevronLeft className="h-4 w-4" />
    </Button>
  );
}
