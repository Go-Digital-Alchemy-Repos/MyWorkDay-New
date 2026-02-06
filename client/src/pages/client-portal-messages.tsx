import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatDistanceToNow } from "date-fns";
import { Redirect } from "wouter";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  MessageSquare,
  ArrowLeft,
  Send,
  Clock,
  User,
  ChevronRight,
} from "lucide-react";

interface ConversationSummary {
  id: string;
  tenantId: string;
  clientId: string;
  projectId: string | null;
  subject: string;
  createdByUserId: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
  clientName?: string;
  messageCount: number;
  lastMessage: {
    bodyText: string;
    createdAt: string;
    authorName: string | null;
  } | null;
}

interface Message {
  id: string;
  conversationId: string;
  authorUserId: string;
  bodyText: string;
  bodyRich: string | null;
  createdAt: string;
  authorName: string | null;
  authorRole: string | null;
}

interface ConversationDetail {
  conversation: ConversationSummary;
  messages: Message[];
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}

function ConversationList({
  conversations,
  onSelect,
}: {
  conversations: ConversationSummary[];
  onSelect: (id: string) => void;
}) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">No messages yet</h3>
        <p className="text-sm text-muted-foreground">
          Your team will reach out when there are updates to discuss.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {conversations.map((convo) => (
        <Card
          key={convo.id}
          className="hover-elevate cursor-pointer"
          onClick={() => onSelect(convo.id)}
          data-testid={`conversation-card-${convo.id}`}
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-medium truncate" data-testid={`conversation-subject-${convo.id}`}>
                    {convo.subject}
                  </h3>
                  {convo.closedAt && (
                    <Badge variant="secondary" className="text-xs">Closed</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-1">
                  Started by {convo.creatorName}
                </p>
                {convo.lastMessage && (
                  <p className="text-sm text-muted-foreground truncate">
                    {convo.lastMessage.authorName}: {convo.lastMessage.bodyText}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(convo.updatedAt), { addSuffix: true })}
                </span>
                <Badge variant="outline" className="text-xs">
                  {convo.messageCount} {convo.messageCount === 1 ? "msg" : "msgs"}
                </Badge>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ConversationThread({
  conversationId,
  currentUserId,
  onBack,
}: {
  conversationId: string;
  currentUserId: string;
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [replyText, setReplyText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery<ConversationDetail>({
    queryKey: ["/api/crm/conversations", conversationId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/conversations/${conversationId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const sendMutation = useMutation({
    mutationFn: async (bodyText: string) => {
      const res = await apiRequest("POST", `/api/crm/conversations/${conversationId}/messages`, { bodyText });
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["/api/crm/conversations", conversationId, "messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/portal/conversations"] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSend = () => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  const conversation = data?.conversation;
  const messages = data?.messages || [];
  const isClosed = !!conversation?.closedAt;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={onBack} data-testid="button-back-to-conversations">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold truncate" data-testid="conversation-subject-detail">
            {conversation?.subject}
          </h2>
          <p className="text-sm text-muted-foreground">
            Started by {(conversation as any)?.creatorName || "team member"}{" "}
            {conversation?.createdAt && formatDistanceToNow(new Date(conversation.createdAt), { addSuffix: true })}
          </p>
        </div>
        {isClosed && <Badge variant="secondary">Closed</Badge>}
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1" data-testid="messages-list">
        {messages.map((msg) => {
          const isOwn = msg.authorUserId === currentUserId;
          const isInternal = msg.authorRole !== "client";
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
              data-testid={`message-${msg.id}`}
            >
              <div className={`flex gap-2 max-w-[80%] ${isOwn ? "flex-row-reverse" : ""}`}>
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className={`text-xs ${isInternal ? "bg-primary/10" : "bg-muted"}`}>
                    {msg.authorName ? getInitials(msg.authorName) : <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className={`flex items-center gap-2 mb-1 ${isOwn ? "justify-end" : ""} flex-wrap`}>
                    <span className="text-xs font-medium">{msg.authorName || "Unknown"}</span>
                    {isInternal && <Badge variant="outline" className="text-xs">Team</Badge>}
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <Card className={isOwn ? "bg-primary/5" : ""}>
                    <CardContent className="p-3">
                      <p className="text-sm whitespace-pre-wrap" data-testid={`message-text-${msg.id}`}>
                        {msg.bodyText}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {!isClosed && (
        <div className="flex gap-2 items-end border-t pt-3">
          <Textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your reply..."
            className="resize-none min-h-[60px]"
            data-testid="input-reply-message"
          />
          <Button
            onClick={handleSend}
            disabled={!replyText.trim() || sendMutation.isPending}
            size="icon"
            data-testid="button-send-reply"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
      {isClosed && (
        <div className="text-center text-sm text-muted-foreground py-3 border-t">
          This conversation has been closed.
        </div>
      )}
    </div>
  );
}

export default function ClientPortalMessages() {
  const crmFlags = useCrmFlags();
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);

  const { data: conversations = [], isLoading } = useQuery<ConversationSummary[]>({
    queryKey: ["/api/crm/portal/conversations"],
    enabled: crmFlags.clientMessaging,
  });

  const { data: currentUser } = useQuery<{ id: string }>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) throw new Error("Not authenticated");
      return res.json();
    },
  });

  if (!crmFlags.clientMessaging) {
    return <Redirect to="/portal" />;
  }

  if (selectedConversationId && currentUser) {
    return (
      <div className="p-6 h-full flex flex-col">
        <ConversationThread
          conversationId={selectedConversationId}
          currentUserId={currentUser.id}
          onBack={() => setSelectedConversationId(null)}
        />
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-messages-title">Messages</h1>
        <p className="text-muted-foreground">Communicate with your project team</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <ConversationList
          conversations={conversations}
          onSelect={setSelectedConversationId}
        />
      )}
    </div>
  );
}
