import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow, isAfter, subDays, subWeeks, subMonths, startOfDay } from "date-fns";
import {
  Clock,
  MessageSquare,
  Plus,
  Edit,
  Activity,
  Trash2,
  UserPlus,
  UserMinus,
  CheckCircle2,
  FileText,
  Filter,
  Calendar,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { VirtualizedList } from "@/components/ui/virtualized-list";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  type: string;
  timestamp: string | Date;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorAvatarUrl: string | null;
  entityId: string;
  entityTitle: string;
  metadata?: Record<string, unknown>;
}

interface ActivityLogEntry {
  id: string;
  workspaceId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  diffJson: unknown;
  createdAt: string | Date;
}

type DateRangeOption = "all" | "today" | "week" | "month";

const DATE_RANGE_LABELS: Record<DateRangeOption, string> = {
  all: "All Time",
  today: "Today",
  week: "This Week",
  month: "This Month",
};

interface ActivityFeedProps {
  entityType: string;
  entityId: string;
  items?: ActivityItem[];
  apiEndpoint?: string;
  onItemClick?: (entityId: string) => void;
  limit?: number;
  showFilters?: boolean;
  showDateFilter?: boolean;
  height?: string;
  className?: string;
  emptyIcon?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
}

const ACTION_CONFIG: Record<string, { icon: typeof Activity; color: string; label: string }> = {
  task_created: { icon: Plus, color: "text-green-600 dark:text-green-400", label: "created" },
  task_updated: { icon: Edit, color: "text-blue-600 dark:text-blue-400", label: "updated" },
  comment_added: { icon: MessageSquare, color: "text-purple-600 dark:text-purple-400", label: "commented on" },
  time_logged: { icon: Clock, color: "text-orange-600 dark:text-orange-400", label: "logged time on" },
  created: { icon: Plus, color: "text-green-600 dark:text-green-400", label: "created" },
  updated: { icon: Edit, color: "text-blue-600 dark:text-blue-400", label: "updated" },
  deleted: { icon: Trash2, color: "text-red-600 dark:text-red-400", label: "deleted" },
  assigned: { icon: UserPlus, color: "text-indigo-600 dark:text-indigo-400", label: "assigned" },
  unassigned: { icon: UserMinus, color: "text-slate-600 dark:text-slate-400", label: "unassigned" },
  completed: { icon: CheckCircle2, color: "text-green-600 dark:text-green-400", label: "completed" },
  status_changed: { icon: Activity, color: "text-blue-600 dark:text-blue-400", label: "changed status of" },
  file_uploaded: { icon: FileText, color: "text-cyan-600 dark:text-cyan-400", label: "uploaded a file to" },
  member_added: { icon: UserPlus, color: "text-indigo-600 dark:text-indigo-400", label: "added a member to" },
  member_removed: { icon: UserMinus, color: "text-slate-600 dark:text-slate-400", label: "removed a member from" },
};

function getActionConfig(action: string) {
  return ACTION_CONFIG[action] || { icon: Activity, color: "text-muted-foreground", label: action };
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDescription(item: ActivityItem): string {
  const config = getActionConfig(item.type);
  const title = item.entityTitle ? `"${item.entityTitle}"` : "";

  if (item.type === "time_logged") {
    const seconds = item.metadata?.durationSeconds as number | undefined;
    if (seconds) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return `logged ${duration} on ${title}`;
    }
  }

  if (item.type === "status_changed" && item.metadata) {
    const from = item.metadata.from as string | undefined;
    const to = item.metadata.to as string | undefined;
    if (from && to) {
      return `changed status from "${from}" to "${to}" on ${title}`;
    }
  }

  return `${config.label} ${title}`;
}

function mapActivityLogToItem(log: ActivityLogEntry): ActivityItem {
  const diff = log.diffJson as Record<string, unknown> | null;
  return {
    id: log.id,
    type: log.action,
    timestamp: log.createdAt,
    actorId: log.actorUserId,
    actorName: (diff?.actorName as string) || "Unknown",
    actorEmail: (diff?.actorEmail as string) || "",
    actorAvatarUrl: (diff?.actorAvatarUrl as string) || null,
    entityId: log.entityId,
    entityTitle: (diff?.entityTitle as string) || (diff?.title as string) || log.entityId,
    metadata: diff as Record<string, unknown> | undefined,
  };
}

function ActivitySkeleton() {
  return (
    <div className="space-y-3 p-4" data-testid="activity-feed-loading">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeed({
  entityType,
  entityId,
  items: externalItems,
  apiEndpoint,
  onItemClick,
  showFilters = true,
  showDateFilter = true,
  height = "100%",
  className,
  emptyIcon,
  emptyTitle = "No activity yet",
  emptyDescription = "Activity will appear here as work happens",
}: ActivityFeedProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState<DateRangeOption>("all");

  const endpoint = apiEndpoint || `/api/activity-log/${entityType}/${entityId}`;

  const { data: rawData, isLoading } = useQuery<ActivityItem[] | ActivityLogEntry[]>({
    queryKey: [endpoint],
    enabled: !externalItems && !!entityId,
  });

  const allItems = useMemo(() => {
    if (externalItems) return externalItems;
    if (!rawData || !Array.isArray(rawData)) return [];

    if (rawData.length > 0 && "actorName" in rawData[0]) {
      return rawData as ActivityItem[];
    }
    return (rawData as ActivityLogEntry[]).map(mapActivityLogToItem);
  }, [externalItems, rawData]);

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    allItems.forEach((item) => types.add(item.type));
    return Array.from(types);
  }, [allItems]);

  const filteredItems = useMemo(() => {
    let result = allItems;

    if (selectedTypes.size > 0) {
      result = result.filter((item) => selectedTypes.has(item.type));
    }

    if (dateRange !== "all") {
      const now = new Date();
      let cutoff: Date;
      switch (dateRange) {
        case "today":
          cutoff = startOfDay(now);
          break;
        case "week":
          cutoff = subWeeks(now, 1);
          break;
        case "month":
          cutoff = subMonths(now, 1);
          break;
        default:
          cutoff = subDays(now, 365);
      }
      result = result.filter((item) => isAfter(new Date(item.timestamp), cutoff));
    }

    return result;
  }, [allItems, selectedTypes, dateRange]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  if (isLoading && !externalItems) {
    return <ActivitySkeleton />;
  }

  const hasActiveFilters = selectedTypes.size > 0 || dateRange !== "all";

  return (
    <div className={cn("flex flex-col", className)} data-testid="activity-feed">
      {(showFilters || showDateFilter) && availableTypes.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-2 border-b">
          {showFilters && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-activity-type-filter">
                  <Filter className="h-3.5 w-3.5 mr-1.5" />
                  Type
                  {selectedTypes.size > 0 && (
                    <Badge variant="secondary" className="ml-1.5">
                      {selectedTypes.size}
                    </Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Activity Types</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {availableTypes.map((type) => {
                  const config = getActionConfig(type);
                  return (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={selectedTypes.has(type)}
                      onCheckedChange={() => toggleType(type)}
                      data-testid={`checkbox-activity-type-${type}`}
                    >
                      <config.icon className={cn("h-3.5 w-3.5 mr-1.5", config.color)} />
                      {type.replace(/_/g, " ")}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {showDateFilter && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" data-testid="button-activity-date-filter">
                  <Calendar className="h-3.5 w-3.5 mr-1.5" />
                  {DATE_RANGE_LABELS[dateRange]}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Date Range</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.keys(DATE_RANGE_LABELS) as DateRangeOption[]).map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option}
                    checked={dateRange === option}
                    onCheckedChange={() => setDateRange(option)}
                    data-testid={`radio-date-range-${option}`}
                  >
                    {DATE_RANGE_LABELS[option]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedTypes(new Set());
                setDateRange("all");
              }}
              className="text-xs text-muted-foreground"
              data-testid="button-clear-activity-filters"
            >
              Clear
            </Button>
          )}
        </div>
      )}

      <div style={{ height, flex: 1 }}>
        <VirtualizedList
          data={filteredItems as ActivityItem[]}
          style={{ height: "100%" }}
          overscan={200}
          emptyContent={
            <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
              {emptyIcon || <Activity className="h-8 w-8 mb-2 opacity-20" />}
              <p className="text-sm">{emptyTitle}</p>
              <p className="text-xs mt-1">{emptyDescription}</p>
            </div>
          }
          itemContent={(_index, item) => {
            const config = getActionConfig(item.type);
            const Icon = config.icon;

            return (
              <div
                className={cn(
                  "flex items-start gap-3 px-3 py-2.5",
                  onItemClick && "hover-elevate cursor-pointer rounded-md"
                )}
                onClick={() => onItemClick?.(item.entityId)}
                data-testid={`activity-item-${item.id}`}
              >
                <div className="relative mt-0.5">
                  <Avatar className="h-7 w-7">
                    {item.actorAvatarUrl && (
                      <AvatarImage src={item.actorAvatarUrl} alt={item.actorName} />
                    )}
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(item.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <div
                    className={cn(
                      "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-background flex items-center justify-center"
                    )}
                  >
                    <Icon className={cn("h-2.5 w-2.5", config.color)} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{item.actorName}</span>{" "}
                    <span className="text-muted-foreground">{formatDescription(item)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
