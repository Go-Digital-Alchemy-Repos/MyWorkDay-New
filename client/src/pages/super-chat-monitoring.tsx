import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2, 
  MessageSquare, 
  Users, 
  Hash, 
  Lock, 
  Search, 
  Eye,
  FileText,
  Image,
  File,
  ChevronLeft,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";

interface Tenant {
  id: string;
  name: string;
  status: string;
}

interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  createdAt: string;
  createdBy: string;
}

interface DmThread {
  id: string;
  createdAt: string;
  displayName: string;
  members: Array<{
    id: string;
    userId: string;
    userName: string | null;
    userEmail: string;
  }>;
}

interface ThreadsResponse {
  channels: Channel[];
  dmThreads: DmThread[];
}

interface MessageAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
}

interface Message {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  authorUserId: string;
  authorName: string | null;
  authorEmail: string;
  channelId?: string;
  dmThreadId?: string;
  attachments?: MessageAttachment[];
}

interface ChannelMessagesResponse {
  channel: { id: string; name: string; isPrivate: boolean };
  messages: Message[];
}

interface DmMessagesResponse {
  dmThread: { id: string; displayName: string; members: Array<{ userId: string; userName: string | null; userEmail: string }> };
  messages: Message[];
}

interface SearchResponse {
  messages: Message[];
  total: number;
}

function getInitials(name: string): string {
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2) || "?";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

export default function SuperChatMonitoringPage() {
  const { user } = useAuth();
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [selectedDm, setSelectedDm] = useState<DmThread | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: tenants, isLoading: tenantsLoading } = useQuery<Tenant[]>({
    queryKey: ["/api/v1/super/tenants"],
  });

  const { data: threads, isLoading: threadsLoading, refetch: refetchThreads } = useQuery<ThreadsResponse>({
    queryKey: ["/api/v1/super/chat/tenants", selectedTenantId, "threads"],
    enabled: !!selectedTenantId,
  });

  const { data: channelMessages, isLoading: channelMessagesLoading } = useQuery<ChannelMessagesResponse>({
    queryKey: ["/api/v1/super/chat/tenants", selectedTenantId, "channels", selectedChannel?.id, "messages"],
    enabled: !!selectedTenantId && !!selectedChannel,
  });

  const { data: dmMessages, isLoading: dmMessagesLoading } = useQuery<DmMessagesResponse>({
    queryKey: ["/api/v1/super/chat/tenants", selectedTenantId, "dms", selectedDm?.id, "messages"],
    enabled: !!selectedTenantId && !!selectedDm,
  });

  const buildSearchUrl = () => {
    const params = new URLSearchParams();
    params.set("tenantId", selectedTenantId);
    if (searchQuery) params.set("q", searchQuery);
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo).toISOString());
    if (searchUserId) params.set("userId", searchUserId);
    return `/api/v1/super/chat/search?${params.toString()}`;
  };

  const { data: searchResults, isLoading: searchLoading, refetch: refetchSearch } = useQuery<SearchResponse>({
    queryKey: [buildSearchUrl()],
    enabled: isSearching && !!selectedTenantId,
  });

  const handleSearch = () => {
    if (!selectedTenantId) return;
    setIsSearching(true);
    setSelectedChannel(null);
    setSelectedDm(null);
    refetchSearch();
  };

  const handleClearSearch = () => {
    setIsSearching(false);
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setSearchUserId("");
  };

  const handleSelectTenant = (tenantId: string) => {
    setSelectedTenantId(tenantId);
    setSelectedChannel(null);
    setSelectedDm(null);
    setIsSearching(false);
    handleClearSearch();
  };

  const handleBack = () => {
    setSelectedChannel(null);
    setSelectedDm(null);
  };

  const messages = selectedChannel ? channelMessages?.messages : selectedDm ? dmMessages?.messages : null;
  const isMessagesLoading = selectedChannel ? channelMessagesLoading : dmMessagesLoading;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Chat System</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Manage and monitor platform chat functionality
        </p>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs defaultValue="monitoring" className="h-full flex flex-col">
          <TabsList className="mb-4" data-testid="chat-system-tabs">
            <TabsTrigger value="monitoring" data-testid="tab-chat-monitoring">Chat Monitoring</TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="flex-1 overflow-auto mt-0 space-y-4">
            <div className="flex items-center justify-end">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Read-only mode
              </Badge>
            </div>


            <div className="grid grid-cols-12 gap-6">
        <div className="col-span-3 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Select Tenant</CardTitle>
            </CardHeader>
            <CardContent>
              {tenantsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <Select value={selectedTenantId} onValueChange={handleSelectTenant}>
                  <SelectTrigger data-testid="select-tenant">
                    <SelectValue placeholder="Select a tenant..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants?.map((tenant) => (
                      <SelectItem key={tenant.id} value={tenant.id} data-testid={`tenant-option-${tenant.id}`}>
                        {tenant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {selectedTenantId && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search Messages
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-xs">Keyword</Label>
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="text-sm"
                    data-testid="input-search-keyword"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">From</Label>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="text-sm"
                      data-testid="input-date-from"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">To</Label>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="text-sm"
                      data-testid="input-date-to"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSearch} className="flex-1" data-testid="button-search">
                    <Search className="h-3 w-3 mr-1" />
                    Search
                  </Button>
                  {isSearching && (
                    <Button size="sm" variant="outline" onClick={handleClearSearch} data-testid="button-clear-search">
                      Clear
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {selectedTenantId && !isSearching && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Channels ({threads?.channels.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {threadsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ScrollArea className="h-[200px]">
                    {threads?.channels.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-4 py-2">No channels</p>
                    ) : (
                      threads?.channels.map((channel) => (
                        <button
                          key={channel.id}
                          onClick={() => { setSelectedChannel(channel); setSelectedDm(null); }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover-elevate ${
                            selectedChannel?.id === channel.id ? "bg-accent" : ""
                          }`}
                          data-testid={`channel-${channel.id}`}
                        >
                          {channel.isPrivate ? <Lock className="h-3 w-3" /> : <Hash className="h-3 w-3" />}
                          <span className="truncate">{channel.name}</span>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}

          {selectedTenantId && !isSearching && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  DM Threads ({threads?.dmThreads.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {threadsLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <ScrollArea className="h-[200px]">
                    {threads?.dmThreads.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-4 py-2">No DM threads</p>
                    ) : (
                      threads?.dmThreads.map((dm) => (
                        <button
                          key={dm.id}
                          onClick={() => { setSelectedDm(dm); setSelectedChannel(null); }}
                          className={`w-full flex items-center gap-2 px-4 py-2 text-left text-sm hover-elevate ${
                            selectedDm?.id === dm.id ? "bg-accent" : ""
                          }`}
                          data-testid={`dm-${dm.id}`}
                        >
                          <MessageSquare className="h-3 w-3" />
                          <span className="truncate">{dm.displayName}</span>
                        </button>
                      ))
                    )}
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="col-span-9">
          <Card className="h-[calc(100vh-250px)]">
            <CardHeader className="pb-3 border-b">
              {(selectedChannel || selectedDm) && (
                <Button variant="ghost" size="sm" onClick={handleBack} className="w-fit mb-2" data-testid="button-back">
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back to list
                </Button>
              )}
              <CardTitle className="text-sm flex items-center gap-2">
                {selectedChannel && (
                  <>
                    {selectedChannel.isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
                    {selectedChannel.name}
                  </>
                )}
                {selectedDm && (
                  <>
                    <MessageSquare className="h-4 w-4" />
                    {selectedDm.displayName}
                  </>
                )}
                {isSearching && (
                  <>
                    <Search className="h-4 w-4" />
                    Search Results ({searchResults?.total || 0} messages)
                  </>
                )}
                {!selectedChannel && !selectedDm && !isSearching && (
                  <span className="text-muted-foreground">Select a channel or DM thread to view messages</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 h-[calc(100%-80px)]">
              <ScrollArea className="h-full p-4">
                {isMessagesLoading || searchLoading ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : isSearching ? (
                  <div className="space-y-4">
                    {searchResults?.messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No messages found</p>
                    ) : (
                      searchResults?.messages.map((message) => (
                        <MessageItem key={message.id} message={message} showContext />
                      ))
                    )}
                  </div>
                ) : messages ? (
                  <div className="space-y-4">
                    {messages.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No messages in this thread</p>
                    ) : (
                      messages.map((message) => (
                        <MessageItem key={message.id} message={message} />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <MessageSquare className="h-12 w-12 mb-4" />
                    <p>Select a thread to view messages</p>
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MessageItem({ message, showContext }: { message: Message; showContext?: boolean }) {
  const isDeleted = !!message.deletedAt;
  
  return (
    <div className="flex gap-3" data-testid={`monitoring-message-${message.id}`}>
      <Avatar className="h-8 w-8 flex-shrink-0">
        <AvatarFallback>
          {getInitials(message.authorName || message.authorEmail)}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-sm">
            {message.authorName || message.authorEmail}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDate(message.createdAt)}
          </span>
          {message.editedAt && !isDeleted && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          {isDeleted && (
            <Badge variant="secondary" className="text-xs">deleted</Badge>
          )}
          {showContext && (message.channelId || message.dmThreadId) && (
            <Badge variant="outline" className="text-xs">
              {message.channelId ? "Channel" : "DM"}
            </Badge>
          )}
        </div>
        <p className={`text-sm break-words ${isDeleted ? "text-muted-foreground italic" : ""}`}>
          {message.body}
        </p>
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
                  data-testid={`monitoring-attachment-${attachment.id}`}
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
}
