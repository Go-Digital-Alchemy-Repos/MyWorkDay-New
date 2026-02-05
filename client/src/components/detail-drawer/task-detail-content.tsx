import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { DetailDrawer, useDetailDrawer, DetailTab } from "./detail-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StatusBadge } from "@/components/status-badge";
import { TagBadge } from "@/components/tag-badge";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { RichTextRenderer } from "@/components/richtext";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { 
  FileText, 
  MessageSquare, 
  Activity, 
  Clock, 
  Calendar, 
  Users, 
  Flag, 
  Layers, 
  Tag,
  ExternalLink,
  Edit,
  Play,
  Plus,
  CheckSquare,
} from "lucide-react";
import { Link } from "wouter";
import type { TaskWithRelations, User, Tag as TagType, Comment, ActivityLog } from "@shared/schema";

interface TaskOverviewTabProps {
  task: TaskWithRelations;
  onEdit?: () => void;
}

function TaskOverviewTab({ task, onEdit }: TaskOverviewTabProps) {
  const subtasks = task.subtasks || [];
  const completedSubtasks = subtasks.filter(s => s.completed).length;
  const totalSubtasks = subtasks.length;
  
  const tags = task.tags || [];
  const assignees = task.assignees || [];
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Flag className="h-4 w-4" />
              Status
            </span>
            <StatusBadge status={task.status} />
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground flex items-center gap-2">
              <Flag className="h-4 w-4" />
              Priority
            </span>
            <Badge variant="outline">{task.priority || "none"}</Badge>
          </div>
          
          {task.dueDate && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Due Date
              </span>
              <span className={`text-sm ${new Date(task.dueDate) < new Date() && task.status !== "done" ? 'text-destructive' : ''}`}>
                {format(new Date(task.dueDate), "MMM d, yyyy")}
              </span>
            </div>
          )}
          
          {task.estimateMinutes && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Estimate
              </span>
              <span className="text-sm">
                {Math.floor(task.estimateMinutes / 60)}h {task.estimateMinutes % 60}m
              </span>
            </div>
          )}
        </CardContent>
      </Card>
      
      {task.description && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <RichTextRenderer content={task.description} />
          </CardContent>
        </Card>
      )}
      
      {assignees.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4" />
              Assignees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {assignees.map((a) => (
                <div key={a.userId} className="flex items-center gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="text-xs">
                      {a.user?.firstName?.[0] || a.user?.email?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm">{a.user?.firstName || a.user?.email}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {tags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {tags.map((tt) => (
                <TagBadge key={tt.tagId} tag={tt.tag} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      
      {totalSubtasks > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Subtasks ({completedSubtasks}/{totalSubtasks})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subtasks.map((subtask) => (
                <div key={subtask.id} className="flex items-center gap-2">
                  <CheckSquare className={`h-4 w-4 ${subtask.completed ? 'text-green-600' : 'text-muted-foreground'}`} />
                  <span className={`text-sm ${subtask.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {subtask.title}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface TaskActivityTabProps {
  taskId: string;
}

function TaskActivityTab({ taskId }: TaskActivityTabProps) {
  const { data: activities, isLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/tasks", taskId, "activity"],
  });
  
  const { data: comments, isLoading: commentsLoading } = useQuery<Comment[]>({
    queryKey: ["/api/tasks", taskId, "comments"],
  });
  
  if (isLoading || commentsLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  
  const allActivity = [
    ...(activities || []).map(a => ({ ...a, type: "activity" as const, time: new Date(a.createdAt) })),
    ...(comments || []).map(c => ({ ...c, type: "comment" as const, time: new Date(c.createdAt) })),
  ].sort((a, b) => b.time.getTime() - a.time.getTime());
  
  if (allActivity.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No activity yet</p>
      </div>
    );
  }
  
  return (
    <ScrollArea className="h-[400px]">
      <div className="space-y-3">
        {allActivity.map((item) => (
          <Card key={item.id} className="p-3">
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                {item.type === "comment" ? (
                  <MessageSquare className="h-4 w-4 text-primary" />
                ) : (
                  <Activity className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {item.type === "comment" 
                      ? (item as any).user?.firstName || (item as any).user?.email || "User"
                      : (item as any).actorName || "System"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(item.time, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {item.type === "comment" 
                    ? (item as any).body?.substring(0, 100) || "Added a comment"
                    : (item as any).description || (item as any).action || "Activity"}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </ScrollArea>
  );
}

interface TaskFilesTabProps {
  taskId: string;
  projectId: string;
}

function TaskFilesTab({ taskId, projectId }: TaskFilesTabProps) {
  return (
    <AttachmentUploader taskId={taskId} projectId={projectId} />
  );
}

interface TaskNotesTabProps {
  taskId: string;
}

function TaskNotesTab({ taskId }: TaskNotesTabProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  
  const { data: comments = [], isLoading } = useQuery<Comment[]>({
    queryKey: ["/api/tasks", taskId, "comments"],
  });
  
  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      return apiRequest("POST", `/api/tasks/${taskId}/comments`, { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
    },
  });
  
  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      return apiRequest("PATCH", `/api/comments/${id}`, { body });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
    },
  });
  
  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/tasks", taskId, "comments"] });
    },
  });
  
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  
  return (
    <CommentThread
      comments={comments}
      currentUserId={user?.id || ""}
      onAddComment={(body) => addCommentMutation.mutate(body)}
      onUpdateComment={(id, body) => updateCommentMutation.mutate({ id, body })}
      onDeleteComment={(id) => deleteCommentMutation.mutate(id)}
      isAdding={addCommentMutation.isPending}
    />
  );
}

interface UnifiedTaskDetailDrawerProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (task: TaskWithRelations) => void;
}

export function UnifiedTaskDetailDrawer({
  taskId,
  open,
  onOpenChange,
  onEdit,
}: UnifiedTaskDetailDrawerProps) {
  const { data: task, isLoading, error } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", taskId],
    enabled: !!taskId && open,
  });
  
  const tabs: DetailTab[] = [
    {
      id: "overview",
      label: "Overview",
      icon: <FileText className="h-4 w-4" />,
      content: task ? <TaskOverviewTab task={task} onEdit={() => onEdit?.(task)} /> : null,
    },
    {
      id: "activity",
      label: "Activity",
      icon: <Activity className="h-4 w-4" />,
      content: taskId ? <TaskActivityTab taskId={taskId} /> : null,
    },
    {
      id: "files",
      label: "Files",
      icon: <FileText className="h-4 w-4" />,
      content: taskId && task?.projectId ? (
        <TaskFilesTab taskId={taskId} projectId={task.projectId} />
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Files require a project context</p>
        </div>
      ),
    },
    {
      id: "notes",
      label: "Notes",
      icon: <MessageSquare className="h-4 w-4" />,
      content: taskId ? <TaskNotesTab taskId={taskId} /> : null,
    },
  ];
  
  return (
    <DetailDrawer
      entityType="task"
      entityId={taskId}
      open={open}
      onOpenChange={onOpenChange}
      title={task?.title || "Task Details"}
      subtitle={task?.projectId && (
        <Link href={`/projects/${task.projectId}`} className="text-primary hover:underline flex items-center gap-1">
          <ExternalLink className="h-3 w-3" />
          View Project
        </Link>
      )}
      headerActions={
        task && onEdit && (
          <Button variant="outline" size="sm" onClick={() => onEdit(task)} data-testid="button-edit-task">
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        )
      }
      tabs={tabs}
      defaultTab="overview"
      isLoading={isLoading}
      error={error as Error | null}
      isEmpty={!task && !isLoading && !error}
      emptyMessage="Task not found"
    />
  );
}
