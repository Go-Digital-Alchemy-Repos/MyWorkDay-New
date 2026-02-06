import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCrmFlags } from "@/hooks/use-crm-flags";
import { formatErrorForToast } from "@/lib/parseApiError";
import { format, formatDistanceToNow } from "date-fns";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Kanban,
  Search,
  User,
  Calendar,
  Tag,
  GripVertical,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PageShell,
  PageHeader,
  EmptyState,
} from "@/components/layout";

interface PipelineClient {
  clientId: string;
  companyName: string;
  displayName: string | null;
  email: string | null;
  industry: string | null;
  crmStatus: string | null;
  ownerUserId: string | null;
  ownerName: string | null;
  tags: string[] | null;
  lastContactAt: string | null;
  nextFollowUpAt: string | null;
  followUpNotes: string | null;
  crmUpdatedAt: string | null;
}

interface UserOption {
  id: string;
  name: string;
}

const PIPELINE_COLUMNS = [
  { id: "lead", label: "Lead" },
  { id: "prospect", label: "Prospect" },
  { id: "active", label: "Active" },
  { id: "on_hold", label: "On Hold" },
  { id: "past", label: "Past" },
] as const;

type ColumnId = (typeof PIPELINE_COLUMNS)[number]["id"];

function SortableClientCard({
  client,
  isDragOverlay,
}: {
  client: PipelineClient;
  isDragOverlay?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: client.clientId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const name = client.companyName || client.displayName || "Unnamed";

  return (
    <div
      ref={!isDragOverlay ? setNodeRef : undefined}
      style={!isDragOverlay ? style : undefined}
      {...(!isDragOverlay ? attributes : {})}
    >
      <Card
        className={`hover-elevate ${isDragOverlay ? "shadow-lg" : ""}`}
        data-testid={`card-pipeline-client-${client.clientId}`}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <button
              className="mt-0.5 cursor-grab text-muted-foreground shrink-0"
              {...(!isDragOverlay ? listeners : {})}
              data-testid={`drag-handle-${client.clientId}`}
              aria-label="Drag to move"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p
                className="text-sm font-medium truncate"
                data-testid={`text-client-name-${client.clientId}`}
              >
                {name}
              </p>

              {client.ownerName && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <User className="h-3 w-3 shrink-0" />
                  <span
                    className="truncate"
                    data-testid={`text-owner-${client.clientId}`}
                  >
                    {client.ownerName}
                  </span>
                </div>
              )}

              {client.nextFollowUpAt && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="h-3 w-3 shrink-0" />
                  <span data-testid={`text-followup-${client.clientId}`}>
                    {format(new Date(client.nextFollowUpAt), "MMM d, yyyy")}
                  </span>
                </div>
              )}

              {client.lastContactAt && (
                <p
                  className="text-xs text-muted-foreground"
                  data-testid={`text-last-activity-${client.clientId}`}
                >
                  Last activity{" "}
                  {formatDistanceToNow(new Date(client.lastContactAt), {
                    addSuffix: true,
                  })}
                </p>
              )}

              {client.tags && client.tags.length > 0 && (
                <div
                  className="flex flex-wrap gap-1"
                  data-testid={`tags-${client.clientId}`}
                >
                  {client.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {client.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{client.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PipelineColumn({
  column,
  clients,
}: {
  column: { id: string; label: string };
  clients: PipelineClient[];
}) {
  const clientIds = clients.map((c) => c.clientId);

  return (
    <div
      className="flex flex-col min-w-[260px] w-[260px] shrink-0"
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-center justify-between gap-2 mb-3 px-1">
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <Badge variant="secondary" className="text-xs">
          {clients.length}
        </Badge>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-[100px] p-1">
        <SortableContext
          items={clientIds}
          strategy={verticalListSortingStrategy}
        >
          {clients.map((client) => (
            <SortableClientCard key={client.clientId} client={client} />
          ))}
        </SortableContext>
        {clients.length === 0 && (
          <div className="flex items-center justify-center h-20 rounded-md border border-dashed text-xs text-muted-foreground">
            No clients
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineSkeleton() {
  return (
    <div className="flex gap-4 overflow-x-auto flex-1 pb-4">
      {PIPELINE_COLUMNS.map((col) => (
        <div
          key={col.id}
          className="flex flex-col min-w-[260px] w-[260px] shrink-0"
        >
          <div className="flex items-center justify-between gap-2 mb-3 px-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="space-y-2 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-md" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CrmPipelinePage() {
  const crmFlags = useCrmFlags();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (search.trim()) params.search = search.trim();
    if (ownerFilter) params.owner = ownerFilter;
    if (tagFilter.trim()) params.tag = tagFilter.trim();
    return params;
  }, [search, ownerFilter, tagFilter]);

  const queryKey = useMemo(() => {
    const hasParams = Object.keys(queryParams).length > 0;
    return hasParams
      ? ["/api/crm/pipeline", queryParams]
      : ["/api/crm/pipeline"];
  }, [queryParams]);

  const {
    data: clients = [],
    isLoading,
  } = useQuery<PipelineClient[]>({
    queryKey,
    enabled: crmFlags.client360,
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/users"],
    enabled: crmFlags.client360,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      clientId,
      status,
    }: {
      clientId: string;
      status: string;
    }) => {
      await apiRequest("PATCH", `/api/crm/clients/${clientId}/crm`, {
        status,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline"] });
    },
    onError: (error) => {
      const { title, description } = formatErrorForToast(error);
      toast({ title, description, variant: "destructive" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/pipeline"] });
    },
  });

  const columnData = useMemo(() => {
    const grouped: Record<ColumnId, PipelineClient[]> = {
      lead: [],
      prospect: [],
      active: [],
      on_hold: [],
      past: [],
    };

    for (const client of clients) {
      const status = (client.crmStatus || "active") as ColumnId;
      if (grouped[status]) {
        grouped[status].push(client);
      } else {
        grouped.active.push(client);
      }
    }

    return grouped;
  }, [clients]);

  const findColumnForClient = useCallback(
    (clientId: string): ColumnId | null => {
      for (const col of PIPELINE_COLUMNS) {
        if (columnData[col.id].some((c) => c.clientId === clientId)) {
          return col.id;
        }
      }
      return null;
    },
    [columnData]
  );

  const activeClient = useMemo(() => {
    if (!activeId) return null;
    return clients.find((c) => c.clientId === activeId) || null;
  }, [activeId, clients]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over) return;

      const activeClientId = String(active.id);
      const overTarget = String(over.id);

      const sourceColumn = findColumnForClient(activeClientId);
      if (!sourceColumn) return;

      let targetColumn: ColumnId | null = null;

      const isColumn = PIPELINE_COLUMNS.some((col) => col.id === overTarget);
      if (isColumn) {
        targetColumn = overTarget as ColumnId;
      } else {
        targetColumn = findColumnForClient(overTarget);
      }

      if (!targetColumn || sourceColumn === targetColumn) return;

      updateStatusMutation.mutate({
        clientId: activeClientId,
        status: targetColumn,
      });
    },
    [findColumnForClient, updateStatusMutation]
  );

  if (!crmFlags.client360) {
    return (
      <PageShell>
        <EmptyState
          icon={<AlertCircle className="h-12 w-12" />}
          title="Feature Not Enabled"
          description="The CRM Pipeline feature is not enabled for your account. Please contact your administrator."
          data-testid="pipeline-disabled-message"
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="flex flex-col h-full" noPadding>
      <div className="p-6 pb-0">
        <PageHeader
          title="Pipeline"
          subtitle="Manage your client pipeline with drag and drop"
          icon={<Kanban className="h-6 w-6" />}
        />

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-pipeline-search"
            />
          </div>

          <Select
            value={ownerFilter}
            onValueChange={(val) =>
              setOwnerFilter(val === "__all__" ? "" : val)
            }
          >
            <SelectTrigger
              className="w-48"
              data-testid="select-pipeline-owner"
            >
              <SelectValue placeholder="All Owners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Owners</SelectItem>
              {users.map((user) => (
                <SelectItem key={user.id} value={String(user.id)}>
                  {user.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-44">
            <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by tag..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="pl-9"
              data-testid="input-pipeline-tag"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden px-6 pb-6">
        {isLoading ? (
          <PipelineSkeleton />
        ) : clients.length === 0 ? (
          <EmptyState
            icon={<Kanban className="h-12 w-12" />}
            title="No clients in pipeline"
            description="Clients with CRM status will appear here. Add a CRM status to a client to get started."
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div
              className="flex gap-4 overflow-x-auto h-full pb-2"
              data-testid="pipeline-board"
            >
              {PIPELINE_COLUMNS.map((col) => (
                <PipelineColumn
                  key={col.id}
                  column={col}
                  clients={columnData[col.id]}
                />
              ))}
            </div>
            <DragOverlay>
              {activeClient ? (
                <div className="w-[244px]">
                  <SortableClientCard
                    client={activeClient}
                    isDragOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </PageShell>
  );
}
