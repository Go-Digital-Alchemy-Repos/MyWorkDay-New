import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";

import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ActivityFeed } from "@/components/activity-feed";
import { cn } from "@/lib/utils";

import {
  Building2,
  FolderKanban,
  User,
  Mail,
  Phone,
  Globe,
  MapPin,
  Calendar,
  Clock,
  ExternalLink,
  Plus,
  StickyNote,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Activity,
  FileText,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  Send,
} from "lucide-react";

import type { ClientWithContacts, Project, ClientContact } from "@shared/schema";

interface ClientProfileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string | null;
}

function getStatusColor(status: string) {
  switch (status) {
    case "active":
      return "bg-green-500/10 text-green-600 dark:text-green-400";
    case "inactive":
      return "bg-muted text-muted-foreground";
    case "prospect":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getHealthScore(client: ClientWithContacts): {
  score: number;
  label: string;
  color: string;
  icon: typeof TrendingUp;
} {
  let score = 50;
  if (client.status === "active") score += 20;
  if (client.projects && client.projects.length > 0) score += 15;
  if (client.contacts && client.contacts.length > 0) score += 10;
  if (client.email || client.phone) score += 5;
  if (client.primaryContactEmail) score += 5;
  if (client.website) score += 3;
  if (client.industry) score += 2;
  score = Math.min(100, score);

  if (score >= 80) return { score, label: "Excellent", color: "text-green-600 dark:text-green-400", icon: TrendingUp };
  if (score >= 60) return { score, label: "Good", color: "text-blue-600 dark:text-blue-400", icon: TrendingUp };
  if (score >= 40) return { score, label: "Fair", color: "text-yellow-600 dark:text-yellow-400", icon: Minus };
  return { score, label: "Needs Attention", color: "text-red-600 dark:text-red-400", icon: TrendingDown };
}

function getInitials(name: string) {
  return name.split(" ").map((word) => word[0]).join("").toUpperCase().slice(0, 2);
}

function OverviewTab({ client }: { client: ClientWithContacts }) {
  const health = getHealthScore(client);
  const HealthIcon = health.icon;
  const primaryContact = client.contacts?.find((c) => c.isPrimary) || client.contacts?.[0];

  return (
    <div className="space-y-6 p-1">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <div className={cn("text-3xl font-bold", health.color)}>{health.score}</div>
            <div className="flex items-center justify-center gap-1 mt-1">
              <HealthIcon className={cn("h-3.5 w-3.5", health.color)} />
              <span className={cn("text-sm font-medium", health.color)}>{health.label}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">Health Score</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{client.projects?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Projects</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold">{client.contacts?.length || 0}</div>
            <p className="text-xs text-muted-foreground mt-1">Contacts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Company Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow icon={Building2} label="Industry" value={client.industry} />
            <InfoRow icon={Building2} label="Company Size" value={client.companySize} />
            <InfoRow icon={Globe} label="Website" value={client.website} isLink />
            <InfoRow icon={Mail} label="Email" value={client.email} />
            <InfoRow icon={Phone} label="Phone" value={client.phone} />
            <InfoRow
              icon={MapPin}
              label="Location"
              value={[client.city, client.state, client.country].filter(Boolean).join(", ") || null}
            />
          </div>
          {client.description && (
            <>
              <Separator />
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{client.description}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {primaryContact && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              Primary Contact
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                  {primaryContact.firstName?.[0]}{primaryContact.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">
                  {primaryContact.firstName} {primaryContact.lastName}
                </p>
                {primaryContact.title && (
                  <p className="text-xs text-muted-foreground">{primaryContact.title}</p>
                )}
                <div className="flex items-center gap-3 mt-1">
                  {primaryContact.email && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {primaryContact.email}
                    </span>
                  )}
                  {primaryContact.phone && (
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {primaryContact.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {client.contacts && client.contacts.length > 1 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              All Contacts ({client.contacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {client.contacts.map((contact) => (
                <div key={contact.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                      {contact.firstName?.[0]}{contact.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {contact.firstName} {contact.lastName}
                      {contact.isPrimary && (
                        <Badge variant="outline" className="ml-2 text-xs">Primary</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {contact.title || contact.email || ""}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  isLink,
}: {
  icon: typeof Building2;
  label: string;
  value: string | null | undefined;
  isLink?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {isLink ? (
          <a
            href={value.startsWith("http") ? value : `https://${value}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline truncate block"
          >
            {value}
          </a>
        ) : (
          <p className="text-sm truncate">{value}</p>
        )}
      </div>
    </div>
  );
}

function TimelineTab({ clientId }: { clientId: string }) {
  return (
    <div className="p-1">
      <ActivityFeed
        entityType="client"
        entityId={clientId}
        showFilters
        showDateFilter
        height="500px"
        emptyIcon={<Activity className="h-12 w-12" />}
        emptyTitle="No activity yet"
        emptyDescription="Activity for this client will appear here as it happens."
      />
    </div>
  );
}

function ProjectsTab({ client }: { client: ClientWithContacts }) {
  if (!client.projects || client.projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center p-1">
        <FolderKanban className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium mb-1">No projects yet</p>
        <p className="text-xs text-muted-foreground">
          Projects linked to this client will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-1">
      {client.projects.map((project) => (
        <Link key={project.id} href={`/projects/${project.id}`}>
          <Card className="hover-elevate cursor-pointer" data-testid={`drawer-project-${project.id}`}>
            <CardContent className="p-3">
              <div className="flex items-center gap-3">
                <div
                  className="h-3 w-3 rounded-sm shrink-0"
                  style={{ backgroundColor: project.color || "#3B82F6" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{project.name}</p>
                  {project.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {project.description}
                    </p>
                  )}
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function FilesTab({ clientId }: { clientId: string }) {
  const { data: documents, isLoading } = useQuery<any[]>({
    queryKey: ["/api/v1/clients", clientId, "documents"],
    enabled: !!clientId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center p-1">
        <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="text-sm font-medium mb-1">No files yet</p>
        <p className="text-xs text-muted-foreground">
          Documents and files attached to this client will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 p-1">
      {documents.map((doc: any) => (
        <Card key={doc.id} data-testid={`drawer-file-${doc.id}`}>
          <CardContent className="p-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{doc.fileName || doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.createdAt && formatDistanceToNow(new Date(doc.createdAt), { addSuffix: true })}
                  {doc.fileSize && ` - ${(doc.fileSize / 1024).toFixed(0)} KB`}
                </p>
              </div>
              {doc.category && (
                <Badge variant="outline" className="text-xs shrink-0">{doc.category}</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function QuickActionsBar({
  clientId,
  onLogNote,
}: {
  clientId: string;
  onLogNote: () => void;
}) {
  return (
    <div className="flex items-center gap-2 p-3 border-t border-border bg-muted/30">
      <Link href={`/clients/${clientId}`}>
        <Button variant="outline" size="sm" data-testid="button-quick-full-page">
          <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
          Full Page
        </Button>
      </Link>
      <Button variant="outline" size="sm" onClick={onLogNote} data-testid="button-quick-log-note">
        <StickyNote className="h-3.5 w-3.5 mr-1.5" />
        Log Note
      </Button>
    </div>
  );
}

function QuickNotePanel({
  clientId,
  onClose,
}: {
  clientId: string;
  onClose: () => void;
}) {
  const [noteContent, setNoteContent] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const { toast } = useToast();

  const createNoteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/clients/${clientId}/notes`, {
        title: noteTitle || "Quick Note",
        content: noteContent,
        category: "general",
      });
    },
    onSuccess: () => {
      toast({ title: "Note saved" });
      setNoteContent("");
      setNoteTitle("");
      onClose();
      queryClient.invalidateQueries({ queryKey: ["/api/v1/clients", clientId, "notes"] });
    },
    onError: () => {
      toast({ title: "Failed to save note", variant: "destructive" });
    },
  });

  return (
    <Card className="mx-1 mb-4">
      <CardContent className="p-3 space-y-2">
        <Input
          placeholder="Note title (optional)"
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          data-testid="input-quick-note-title"
        />
        <Textarea
          placeholder="Type your note..."
          value={noteContent}
          onChange={(e) => setNoteContent(e.target.value)}
          rows={3}
          data-testid="textarea-quick-note"
        />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!noteContent.trim() || createNoteMutation.isPending}
            onClick={() => createNoteMutation.mutate()}
            data-testid="button-save-quick-note"
          >
            {createNoteMutation.isPending ? "Saving..." : "Save Note"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ClientProfileDrawer({
  open,
  onOpenChange,
  clientId,
}: ClientProfileDrawerProps) {
  const [showQuickNote, setShowQuickNote] = useState(false);

  const { data: client, isLoading } = useQuery<ClientWithContacts>({
    queryKey: ["/api/clients", clientId],
    enabled: !!clientId && open,
  });

  if (!clientId) return null;

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={client?.companyName || "Client Profile"}
      description={client?.displayName || undefined}
      width="2xl"
    >
      {isLoading ? (
        <div className="space-y-4 p-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <Skeleton className="h-48" />
        </div>
      ) : client ? (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-4 px-1 pb-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="bg-primary/10 text-primary text-lg">
                {getInitials(client.companyName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-semibold truncate" data-testid="text-drawer-client-name">
                  {client.companyName}
                </h2>
                <Badge className={getStatusColor(client.status)}>
                  {client.status}
                </Badge>
              </div>
              {client.industry && (
                <p className="text-sm text-muted-foreground">{client.industry}</p>
              )}
              {client.createdAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Client since {format(new Date(client.createdAt), "MMM yyyy")}
                </p>
              )}
            </div>
          </div>

          {showQuickNote && (
            <QuickNotePanel
              clientId={clientId}
              onClose={() => setShowQuickNote(false)}
            />
          )}

          <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-1 shrink-0">
              <TabsTrigger value="overview" data-testid="drawer-tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="timeline" data-testid="drawer-tab-timeline">Timeline</TabsTrigger>
              <TabsTrigger value="projects" data-testid="drawer-tab-projects">
                Projects ({client.projects?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="files" data-testid="drawer-tab-files">Files</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-auto mt-3">
              <TabsContent value="overview" className="m-0">
                <OverviewTab client={client} />
              </TabsContent>
              <TabsContent value="timeline" className="m-0">
                <TimelineTab clientId={clientId} />
              </TabsContent>
              <TabsContent value="projects" className="m-0">
                <ProjectsTab client={client} />
              </TabsContent>
              <TabsContent value="files" className="m-0">
                <FilesTab clientId={clientId} />
              </TabsContent>
            </div>
          </Tabs>

          <QuickActionsBar
            clientId={clientId}
            onLogNote={() => setShowQuickNote(!showQuickNote)}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">Client not found</p>
        </div>
      )}
    </FullScreenDrawer>
  );
}
