import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Clock,
  MessageSquare,
  Plus,
  Edit,
  Activity,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ActivityType = "task_created" | "task_updated" | "comment_added" | "time_logged";

interface ActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorAvatarUrl: string | null;
  entityId: string;
  entityTitle: string;
  metadata?: Record<string, unknown>;
}

interface ProjectActivityFeedProps {
  projectId: string;
  limit?: number;
  onTaskClick?: (taskId: string) => void;
}

function getActivityIcon(type: ActivityType) {
  switch (type) {
    case "task_created":
      return <Plus className="h-3.5 w-3.5 text-green-500" />;
    case "task_updated":
      return <Edit className="h-3.5 w-3.5 text-blue-500" />;
    case "comment_added":
      return <MessageSquare className="h-3.5 w-3.5 text-purple-500" />;
    case "time_logged":
      return <Clock className="h-3.5 w-3.5 text-orange-500" />;
    default:
      return <Activity className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function getActivityDescription(item: ActivityItem): string {
  switch (item.type) {
    case "task_created":
      return `created task "${item.entityTitle}"`;
    case "task_updated":
      return `updated task "${item.entityTitle}"`;
    case "comment_added":
      return `commented on "${item.entityTitle}"`;
    case "time_logged":
      const seconds = item.metadata?.durationSeconds as number | undefined;
      if (seconds) {
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
        return `logged ${duration} on "${item.entityTitle}"`;
      }
      return `logged time on "${item.entityTitle}"`;
    default:
      return `updated "${item.entityTitle}"`;
  }
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

export function ProjectActivityFeed({ projectId, limit = 20, onTaskClick }: ProjectActivityFeedProps) {
  const { data: activity, isLoading } = useQuery<ActivityItem[]>({
    queryKey: ["/api/projects", projectId, "activity", limit],
    enabled: !!projectId,
  });

  if (isLoading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-start gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!activity || activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <Activity className="h-8 w-8 mb-2" />
        <p className="text-sm">No activity yet</p>
        <p className="text-xs">Activity will appear here as work happens</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-2">
        {activity.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-2 rounded-md ${
              onTaskClick ? "hover-elevate cursor-pointer" : ""
            }`}
            onClick={() => onTaskClick?.(item.entityId)}
            data-testid={`activity-item-${item.id}`}
          >
            <Avatar className="h-7 w-7">
              {item.actorAvatarUrl && <AvatarImage src={item.actorAvatarUrl} alt={item.actorName} />}
              <AvatarFallback className="text-xs">
                {getInitials(item.actorName)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                {getActivityIcon(item.type)}
                <span className="text-sm font-medium truncate">{item.actorName}</span>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {getActivityDescription(item)}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
