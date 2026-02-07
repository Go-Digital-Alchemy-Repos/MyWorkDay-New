import { ActivityFeed } from "@/components/activity-feed";

interface ProjectActivityFeedProps {
  projectId: string;
  limit?: number;
  onTaskClick?: (taskId: string) => void;
}

export function ProjectActivityFeed({ projectId, limit = 20, onTaskClick }: ProjectActivityFeedProps) {
  return (
    <ActivityFeed
      entityType="project"
      entityId={projectId}
      apiEndpoint={`/api/projects/${projectId}/activity?limit=${limit}`}
      onItemClick={onTaskClick}
      showFilters={true}
      showDateFilter={true}
      height="100%"
      emptyTitle="No activity yet"
      emptyDescription="Activity will appear here as work happens"
    />
  );
}
