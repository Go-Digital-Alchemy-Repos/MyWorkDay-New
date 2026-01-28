import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Calendar, Users, Tag, Flag, Layers, CalendarIcon, Clock, Timer, Play, Eye, Square, Pause, ChevronRight, MessageSquare, Building2, FolderKanban, Loader2, CheckSquare, Save, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor, RichTextRenderer } from "@/components/richtext";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ChildTaskList } from "./child-task-list";
import { SubtaskList } from "./subtask-list";
import { SubtaskDetailDrawer } from "./subtask-detail-drawer";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { StatusBadge } from "@/components/status-badge";
import { TagBadge } from "@/components/tag-badge";
import { MultiSelectAssignees } from "@/components/multi-select-assignees";
import { MultiSelectWatchers } from "@/components/multi-select-watchers";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { StartTimerDrawer } from "@/features/timer";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import type { TaskWithRelations, User, Tag as TagType, Comment, Project, Client } from "@shared/schema";

type ActiveTimer = {
  id: string;
  taskId: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
};

type ProjectContext = Project & {
  client?: Client;
  division?: { id: string; name: string; color?: string | null };
};

type TimeEntry = {
  id: string;
  userId: string;
  description: string | null;
  startTime: string;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  user?: { id: string; firstName: string | null; lastName: string | null; email: string };
};

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface TaskDetailDrawerProps {
  task: TaskWithRelations | null;
  childTasks?: TaskWithRelations[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (taskId: string, data: Partial<TaskWithRelations>) => void;
  onAddChildTask?: (parentTaskId: string, title: string) => void;
  onDeleteChildTask?: (taskId: string) => void;
  onReorderChildTasks?: (parentTaskId: string, taskId: string, toIndex: number) => void;
  onAddComment?: (taskId: string, body: string) => void;
  onRefresh?: () => void;
  availableTags?: TagType[];
  availableUsers?: User[];
  workspaceId?: string;
}

export function TaskDetailDrawer({
  task,
  childTasks = [],
  open,
  onOpenChange,
  onUpdate,
  onAddChildTask,
  onDeleteChildTask,
  onReorderChildTasks,
  onAddComment,
  onRefresh,
  availableTags = [],
  availableUsers = [],
  workspaceId = "",
}: TaskDetailDrawerProps) {
  const { user: currentUser } = useAuth();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [estimateMinutes, setEstimateMinutes] = useState<string>(
    task?.estimateMinutes ? String(task.estimateMinutes) : ""
  );
  const [selectedChildTask, setSelectedChildTask] = useState<TaskWithRelations | null>(null);
  const [childDrawerOpen, setChildDrawerOpen] = useState(false);
  const [selectedSubtask, setSelectedSubtask] = useState<any | null>(null);
  const [subtaskDrawerOpen, setSubtaskDrawerOpen] = useState(false);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  
  const [showTimeTrackingPrompt, setShowTimeTrackingPrompt] = useState(false);
  const [showTimeEntryForm, setShowTimeEntryForm] = useState(false);
  const [completionTimeHours, setCompletionTimeHours] = useState(0);
  const [completionTimeMinutes, setCompletionTimeMinutes] = useState(0);
  const [completionTimeDescription, setCompletionTimeDescription] = useState("");
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  
  const { isDirty, setDirty, markClean, confirmIfDirty, UnsavedChangesDialog } = useUnsavedChanges();

  const invalidateCommentQueries = () => {
    if (task) {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.id, "comments"] });
    }
  };

  const updateCommentMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      await apiRequest("PATCH", `/api/comments/${id}`, { body });
    },
    onSuccess: invalidateCommentQueries,
  });

  const deleteCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/comments/${id}`);
    },
    onSuccess: invalidateCommentQueries,
  });

  const resolveCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/comments/${id}/resolve`);
    },
    onSuccess: invalidateCommentQueries,
  });

  const unresolveCommentMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/comments/${id}/unresolve`);
    },
    onSuccess: invalidateCommentQueries,
  });

  const invalidateTaskQueries = () => {
    // Broad invalidation to ensure all task-related caches refresh
    queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
    if (task?.projectId) {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", task.projectId, "tasks"] });
    }
  };

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title });
    },
    onSuccess: invalidateTaskQueries,
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, { completed });
    },
    onSuccess: invalidateTaskQueries,
  });

  const updateSubtaskTitleMutation = useMutation({
    mutationFn: async ({ subtaskId, title }: { subtaskId: string; title: string }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, { title });
    },
    onSuccess: invalidateTaskQueries,
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtaskId}`);
    },
    onSuccess: invalidateTaskQueries,
  });

  const { data: timeEntries = [], isLoading: timeEntriesLoading } = useQuery<TimeEntry[]>({
    queryKey: [`/api/time-entries?taskId=${task?.id}`],
    enabled: !!task?.id && open,
  });

  const { data: projectContext, isLoading: projectContextLoading, isError: projectContextError } = useQuery<ProjectContext>({
    queryKey: ["/api/projects", task?.projectId, "context"],
    queryFn: async () => {
      if (!task?.projectId) return null;
      const projectRes = await fetch(`/api/projects/${task.projectId}`, { credentials: "include" });
      if (!projectRes.ok) throw new Error("Failed to load project");
      const project = await projectRes.json();
      let client = null;
      let division = null;
      if (project?.clientId) {
        const clientRes = await fetch(`/api/clients/${project.clientId}`, { credentials: "include" });
        if (clientRes.ok) client = await clientRes.json();
      }
      if (project?.divisionId && project?.clientId) {
        const divisionsRes = await fetch(`/api/v1/clients/${project.clientId}/divisions`, { credentials: "include" });
        if (divisionsRes.ok) {
          const divisions = await divisionsRes.json();
          division = divisions.find((d: any) => d.id === project.divisionId) || null;
        }
      }
      return { ...project, client, division };
    },
    enabled: !!task?.projectId && open,
    retry: 1,
  });

  const canQuickStartTimer = !task?.projectId || (projectContext && projectContext.clientId);

  const { data: activeTimer, isLoading: timerLoading } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
    enabled: open,
    refetchInterval: 30000,
  });

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const isTimerOnThisTask = activeTimer?.taskId === task?.id;
  const isTimerRunning = activeTimer?.status === "running";

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      if (task?.projectId && !projectContext?.clientId) {
        throw new Error("Client context required for project tasks");
      }
      return apiRequest("POST", "/api/timer/start", {
        clientId: projectContext?.clientId || null,
        projectId: task?.projectId || null,
        taskId: task?.id || null,
        description: task?.title || "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started", description: `Tracking time for "${task?.title}"` });
    },
    onError: (error: Error) => {
      if (error.message === "Client context required for project tasks") {
        toast({ 
          title: "Use timer drawer", 
          description: "Please use the full timer form for this task",
          variant: "default" 
        });
        setTimerDrawerOpen(true);
      } else {
        toast({ title: "Failed to start timer", variant: "destructive" });
      }
    },
  });

  const pauseTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/pause"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer paused" });
    },
  });

  const resumeTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/resume"),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer resumed" });
    },
  });

  const stopTimerMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/timer/stop", { scope: "in_scope" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/timer/current"] });
      qc.invalidateQueries({ queryKey: [`/api/time-entries?taskId=${task?.id}`] });
      toast({ title: "Timer stopped", description: "Time entry saved" });
    },
  });

  const createTimeEntryMutation = useMutation({
    mutationFn: async (data: { 
      durationSeconds: number; 
      description: string;
      taskId: string;
      projectId: string | null;
      clientId: string | null;
    }) => {
      return apiRequest("POST", "/api/time-entries", {
        taskId: data.taskId,
        projectId: data.projectId,
        clientId: data.clientId,
        description: data.description,
        durationSeconds: data.durationSeconds,
        startTime: new Date().toISOString(),
        scope: "in_scope",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/time-entries?taskId=${task?.id}`] });
      qc.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
  });

  const updateTaskStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/tasks/${task!.id}`, { status });
    },
    onSuccess: () => {
      invalidateTaskQueries();
    },
  });

  const handleMarkAsComplete = () => {
    if (task?.status === "done" || timeEntriesLoading) return;
    
    if (timeEntries.length === 0) {
      setShowTimeTrackingPrompt(true);
    } else {
      completeTaskDirectly();
    }
  };

  const completeTaskDirectly = async () => {
    setIsCompletingTask(true);
    try {
      await updateTaskStatusMutation.mutateAsync("done");
      toast({ title: "Task completed", description: `"${task?.title}" marked as done` });
      resetCompletionState();
    } catch (error) {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setIsCompletingTask(false);
    }
  };

  const handleTimeTrackingNo = () => {
    setShowTimeTrackingPrompt(false);
    completeTaskDirectly();
  };

  const handleTimeTrackingYes = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(true);
  };

  const handleTimeEntrySubmit = async () => {
    const totalSeconds = (completionTimeHours * 60 + completionTimeMinutes) * 60;
    
    if (totalSeconds <= 0) {
      toast({ title: "Please enter a valid time", variant: "destructive" });
      return;
    }

    if (task?.projectId && !projectContext?.clientId) {
      toast({ 
        title: "Client context required", 
        description: "Unable to log time for this project task. Completing without time entry.",
        variant: "destructive" 
      });
      await completeTaskDirectly();
      return;
    }

    setIsCompletingTask(true);
    
    try {
      await createTimeEntryMutation.mutateAsync({
        durationSeconds: totalSeconds,
        description: completionTimeDescription || `Completed: ${task?.title}`,
        taskId: task!.id,
        projectId: task?.projectId || null,
        clientId: projectContext?.clientId || null,
      });
      
      await updateTaskStatusMutation.mutateAsync("done");
      toast({ 
        title: "Task completed with time logged", 
        description: `Logged ${completionTimeHours}h ${completionTimeMinutes}m for "${task?.title}"` 
      });
      resetCompletionState();
    } catch (error) {
      toast({ title: "Failed to complete task", variant: "destructive" });
    } finally {
      setIsCompletingTask(false);
    }
  };

  const resetCompletionState = () => {
    setShowTimeTrackingPrompt(false);
    setShowTimeEntryForm(false);
    setCompletionTimeHours(0);
    setCompletionTimeMinutes(0);
    setCompletionTimeDescription("");
  };

  const { data: userChannels = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/v1/chat/channels"],
    enabled: open,
  });

  const getTaskChannelName = () => {
    const sanitized = task?.title?.slice(0, 40).replace(/[^a-zA-Z0-9\s-]/g, "").trim() || "";
    return `task-${sanitized || task?.id?.slice(0, 8)}`;
  };

  const existingTaskChannel = userChannels.find(c => 
    c.name.toLowerCase() === getTaskChannelName().toLowerCase()
  );

  const openOrCreateTaskChat = useMutation({
    mutationFn: async () => {
      if (existingTaskChannel) {
        return existingTaskChannel;
      }
      return apiRequest("POST", "/api/v1/chat/channels", {
        name: getTaskChannelName(),
        isPrivate: true,
      });
    },
    onSuccess: (channel: any) => {
      qc.invalidateQueries({ queryKey: ["/api/v1/chat/channels"] });
      navigate(`/chat?channel=${channel.id}`);
      toast({ 
        title: existingTaskChannel ? "Opening discussion" : "Discussion created",
        description: `Chat for "${task?.title?.slice(0, 30) || "this task"}"` 
      });
    },
    onError: () => {
      toast({ title: "Failed to open discussion", variant: "destructive" });
    },
  });
  
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
      setEstimateMinutes(task.estimateMinutes ? String(task.estimateMinutes) : "");
    }
  }, [task?.id]);

  if (!task) return null;

  const assigneeUsers: Partial<User>[] = task.assignees?.map((a) => a.user).filter(Boolean) as Partial<User>[] || [];
  const watcherUsers: Partial<User>[] = task.watchers?.map((w) => w.user).filter(Boolean) as Partial<User>[] || [];
  const taskTags: TagType[] = task.tags?.map((tt) => tt.tag).filter(Boolean) as TagType[] || [];
  const comments: (Comment & { user?: User })[] = [];
  
  const handleChildTaskClick = (childTask: TaskWithRelations) => {
    setSelectedChildTask(childTask);
    setChildDrawerOpen(true);
  };
  
  const handleChildTaskUpdate = (childTaskId: string, data: Partial<TaskWithRelations>) => {
    onUpdate?.(childTaskId, data);
    if (selectedChildTask && selectedChildTask.id === childTaskId) {
      setSelectedChildTask({ ...selectedChildTask, ...data } as TaskWithRelations);
    }
  };

  const handleTitleSave = () => {
    if (title.trim() && title !== task.title) {
      onUpdate?.(task.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
    if (value !== (task?.description || "")) {
      setDirty(true);
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== task.description) {
      onUpdate?.(task.id, { description: description || null });
      markClean();
    }
  };

  const handleDrawerClose = (shouldClose: boolean) => {
    if (!shouldClose) return;
    if (isDirty) {
      confirmIfDirty(() => {
        markClean();
        onOpenChange(false);
      });
    } else {
      onOpenChange(false);
    }
  };

  return (
    <>
      <UnsavedChangesDialog />
      <Sheet open={open} onOpenChange={handleDrawerClose}>
        <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
        data-testid="task-detail-drawer"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <SheetDescription className="sr-only">Edit task details, add subtasks, and manage comments</SheetDescription>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <SheetTitle className="sr-only">Task Details</SheetTitle>
              <StatusBadge status={task.status as any} />
              {task.status !== "done" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleMarkAsComplete}
                  disabled={timeEntriesLoading || isCompletingTask}
                  data-testid="button-mark-complete"
                >
                  {isCompletingTask ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  {isCompletingTask ? "Completing..." : "Mark Complete"}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isDirty && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (title.trim() && title !== task.title) {
                      onUpdate?.(task.id, { title: title.trim() });
                    }
                    if (description !== (task.description || "")) {
                      onUpdate?.(task.id, { description });
                    }
                    markClean();
                  }}
                  data-testid="button-save-task"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save Changes
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-6 space-y-6">
          <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap" data-testid="task-breadcrumbs">
            {task.projectId && projectContextLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Loading context...</span>
              </div>
            ) : (
              <>
                {task.projectId && projectContext?.client && (
                  <>
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium" data-testid="breadcrumb-client">
                      {projectContext.client.displayName || projectContext.client.companyName}
                    </span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                {task.projectId && projectContext?.division && (
                  <>
                    <div className="flex items-center gap-1">
                      {projectContext.division.color && (
                        <div
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: projectContext.division.color }}
                        />
                      )}
                      <span data-testid="breadcrumb-division">{projectContext.division.name}</span>
                    </div>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                {task.projectId && (
                  <>
                    <FolderKanban className="h-3.5 w-3.5 shrink-0" />
                    <span data-testid="breadcrumb-project">{projectContext?.name || "Project"}</span>
                    <ChevronRight className="h-3 w-3 shrink-0" />
                  </>
                )}
                <CheckSquare className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium" data-testid="breadcrumb-task">{task.title?.slice(0, 30) || "Task"}{(task.title?.length || 0) > 30 ? "..." : ""}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap" data-testid="task-action-bar">
            {!activeTimer && !timerLoading && (
              <>
                {projectContextLoading && task.projectId ? (
                  <Button
                    variant="default"
                    size="sm"
                    disabled
                    data-testid="button-quick-start-timer"
                  >
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    Loading...
                  </Button>
                ) : canQuickStartTimer && !projectContextError ? (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => startTimerMutation.mutate()}
                    disabled={startTimerMutation.isPending}
                    data-testid="button-quick-start-timer"
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Start Timer
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTimerDrawerOpen(true)}
                    data-testid="button-start-timer-task"
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Start Timer
                  </Button>
                )}
              </>
            )}

            {activeTimer && isTimerOnThisTask && (
              <div className="flex items-center gap-2">
                {isTimerRunning ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => pauseTimerMutation.mutate()}
                    disabled={pauseTimerMutation.isPending}
                    data-testid="button-pause-timer"
                  >
                    <Pause className="h-3.5 w-3.5 mr-1" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => resumeTimerMutation.mutate()}
                    disabled={resumeTimerMutation.isPending}
                    data-testid="button-resume-timer"
                  >
                    <Play className="h-3.5 w-3.5 mr-1" />
                    Resume
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => stopTimerMutation.mutate()}
                  disabled={stopTimerMutation.isPending}
                  data-testid="button-stop-timer"
                >
                  <Square className="h-3.5 w-3.5 mr-1" />
                  Stop
                </Button>
              </div>
            )}

            {activeTimer && !isTimerOnThisTask && (
              <Badge variant="secondary" className="text-xs">
                Timer running on another task
              </Badge>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => openOrCreateTaskChat.mutate()}
              disabled={openOrCreateTaskChat.isPending}
              data-testid="button-open-task-chat"
            >
              {openOrCreateTaskChat.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5 mr-1" />
              )}
              {existingTaskChannel ? "Open Discussion" : "Discuss"}
            </Button>
          </div>

          <Separator />
          <div className="space-y-4">
            {editingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-xl font-semibold h-auto py-1"
                autoFocus
                data-testid="input-task-title"
              />
            ) : (
              <h2
                className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setTitle(task.title);
                  setEditingTitle(true);
                }}
                data-testid="text-task-title"
              >
                {task.title}
              </h2>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Assignees
                </label>
                <div className="flex items-center">
                  <MultiSelectAssignees
                    taskId={task.id}
                    assignees={assigneeUsers}
                    workspaceId={workspaceId}
                    onAssigneeChange={onRefresh}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Due Date
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal",
                        !task.dueDate && "text-muted-foreground"
                      )}
                      data-testid="button-due-date"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {task.dueDate ? format(new Date(task.dueDate), "MMM d, yyyy") : "Set date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={task.dueDate ? new Date(task.dueDate) : undefined}
                      onSelect={(date) => {
                        onUpdate?.(task.id, { dueDate: date || null });
                      }}
                      initialFocus
                    />
                    {task.dueDate && (
                      <div className="border-t p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => onUpdate?.(task.id, { dueDate: null })}
                          data-testid="button-clear-due-date"
                        >
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                </label>
                <Select
                  value={task.priority}
                  onValueChange={(value) => onUpdate?.(task.id, { priority: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  Status
                </label>
                <Select
                  value={task.status}
                  onValueChange={(value) => onUpdate?.(task.id, { status: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Estimate (min)
                </label>
                <Input
                  type="number"
                  min="0"
                  value={estimateMinutes}
                  onChange={(e) => setEstimateMinutes(e.target.value)}
                  onBlur={() => {
                    const val = estimateMinutes.trim();
                    const parsed = val ? parseInt(val, 10) : null;
                    if (parsed !== task.estimateMinutes) {
                      onUpdate?.(task.id, { estimateMinutes: parsed });
                    }
                  }}
                  placeholder="0"
                  className="w-[140px] h-8"
                  data-testid="input-estimate-minutes"
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Eye className="h-3.5 w-3.5" />
                  Watchers
                </label>
                <div className="flex items-center">
                  <MultiSelectWatchers
                    taskId={task.id}
                    watchers={watcherUsers}
                    workspaceId={workspaceId}
                    onWatcherChange={onRefresh}
                  />
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <RichTextEditor
              value={description}
              onChange={handleDescriptionChange}
              onBlur={handleDescriptionBlur}
              placeholder="Add a description..."
              minHeight="100px"
              data-testid="textarea-description"
            />
          </div>

          <Separator />

          <SubtaskList
            subtasks={task.subtasks || []}
            taskId={task.id}
            workspaceId={workspaceId}
            taskTitle={task.title}
            taskDescription={task.description || undefined}
            onAdd={(title) => addSubtaskMutation.mutate({ taskId: task.id, title })}
            onToggle={(subtaskId, completed) => toggleSubtaskMutation.mutate({ subtaskId, completed })}
            onDelete={(subtaskId) => deleteSubtaskMutation.mutate(subtaskId)}
            onUpdate={(subtaskId, title) => updateSubtaskTitleMutation.mutate({ subtaskId, title })}
            onSubtaskUpdate={onRefresh}
            onSubtaskClick={(subtask) => {
              setSelectedSubtask(subtask);
              setSubtaskDrawerOpen(true);
            }}
          />

          <Separator />

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {taskTags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} />
              ))}
              {taskTags.length === 0 && (
                <span className="text-sm text-muted-foreground">No tags</span>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-xs" data-testid="button-add-tag">
                Add tag
              </Button>
            </div>
          </div>

          <Separator />

          <ChildTaskList
            childTasks={childTasks}
            onAdd={(title) => onAddChildTask?.(task.id, title)}
            onClick={handleChildTaskClick}
            onDelete={onDeleteChildTask}
            onReorder={(taskId, toIndex) => onReorderChildTasks?.(task.id, taskId, toIndex)}
          />

          <Separator />

          {task.projectId && (
            <AttachmentUploader taskId={task.id} projectId={task.projectId} />
          )}
          {!task.projectId && (
            <div className="text-sm text-muted-foreground">
              Attachments are available for project tasks only
            </div>
          )}

          <Separator />

          <CommentThread
            comments={comments}
            taskId={task.id}
            currentUserId={currentUser?.id}
            onAdd={(body) => onAddComment?.(task.id, body)}
            onUpdate={(id, body) => updateCommentMutation.mutate({ id, body })}
            onDelete={(id) => deleteCommentMutation.mutate(id)}
            onResolve={(id) => resolveCommentMutation.mutate(id)}
            onUnresolve={(id) => unresolveCommentMutation.mutate(id)}
          />

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Timer className="h-3.5 w-3.5" />
                Time Entries
              </label>
              <div className="flex items-center gap-2">
                {timeEntries.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    Total: {formatDurationShort(timeEntries.reduce((sum, e) => sum + e.durationSeconds, 0))}
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setTimerDrawerOpen(true)}
                  data-testid="button-start-timer-task"
                >
                  <Play className="h-3 w-3 mr-1" />
                  Start Timer
                </Button>
              </div>
            </div>
            {timeEntriesLoading ? (
              <p className="text-sm text-muted-foreground">Loading time entries...</p>
            ) : timeEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No time entries for this task</p>
            ) : (
              <div className="space-y-2">
                {timeEntries.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between p-3 rounded-md border bg-muted/30">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {formatDurationShort(entry.durationSeconds)}
                        </span>
                        <Badge variant={entry.scope === "out_of_scope" ? "default" : "secondary"} className="text-xs">
                          {entry.scope === "out_of_scope" ? "Billable" : "Unbillable"}
                        </Badge>
                      </div>
                      {entry.description && (
                        <p className="text-sm text-muted-foreground truncate">{entry.description}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{format(new Date(entry.startTime), "MMM d, yyyy")}</span>
                        {entry.user && (
                          <>
                            <span>•</span>
                            <span>
                              {entry.user.firstName && entry.user.lastName 
                                ? `${entry.user.firstName} ${entry.user.lastName}` 
                                : entry.user.email}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
      
      <SubtaskDetailDrawer
        subtask={selectedChildTask}
        parentTaskTitle={task.title}
        projectId={task.projectId || undefined}
        workspaceId={workspaceId}
        open={childDrawerOpen}
        onOpenChange={setChildDrawerOpen}
        onUpdate={handleChildTaskUpdate}
        onBack={() => setChildDrawerOpen(false)}
        availableUsers={availableUsers}
      />

      <SubtaskDetailDrawer
        subtask={selectedSubtask}
        parentTaskTitle={task.title}
        projectId={task.projectId || undefined}
        workspaceId={workspaceId}
        open={subtaskDrawerOpen}
        onOpenChange={(open) => {
          setSubtaskDrawerOpen(open);
          if (!open) setSelectedSubtask(null);
        }}
        onUpdate={(subtaskId, data) => {
          if (data.title) {
            updateSubtaskTitleMutation.mutate({ subtaskId, title: data.title }, {
              onSuccess: () => {
                if (selectedSubtask && selectedSubtask.id === subtaskId) {
                  setSelectedSubtask({ ...selectedSubtask, title: data.title });
                }
              }
            });
          } else {
            apiRequest("PATCH", `/api/subtasks/${subtaskId}`, data).then(() => {
              invalidateTaskQueries();
              if (selectedSubtask && selectedSubtask.id === subtaskId) {
                setSelectedSubtask({ ...selectedSubtask, ...data });
              }
            }).catch(console.error);
          }
        }}
        onBack={() => {
          setSubtaskDrawerOpen(false);
          setSelectedSubtask(null);
        }}
        availableUsers={availableUsers}
      />

      <StartTimerDrawer
        open={timerDrawerOpen}
        onOpenChange={setTimerDrawerOpen}
        initialTaskId={task.id}
        initialProjectId={task.projectId || null}
      />

      <Dialog open={showTimeTrackingPrompt} onOpenChange={setShowTimeTrackingPrompt}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Track time for this task?</DialogTitle>
            <DialogDescription>
              No time has been logged for this task. Would you like to add a time entry before completing it?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={handleTimeTrackingNo}
              data-testid="button-time-tracking-no"
            >
              No, just complete
            </Button>
            <Button
              onClick={handleTimeTrackingYes}
              data-testid="button-time-tracking-yes"
            >
              Yes, add time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTimeEntryForm} onOpenChange={(open) => {
        if (!open) resetCompletionState();
        else setShowTimeEntryForm(open);
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log time and complete task</DialogTitle>
            <DialogDescription>
              Enter the time spent on "{task.title}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="24"
                    value={completionTimeHours}
                    onChange={(e) => setCompletionTimeHours(parseInt(e.target.value) || 0)}
                    className="w-20"
                    data-testid="input-completion-hours"
                  />
                  <span className="text-sm text-muted-foreground">hours</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    value={completionTimeMinutes}
                    onChange={(e) => setCompletionTimeMinutes(parseInt(e.target.value) || 0)}
                    className="w-20"
                    data-testid="input-completion-minutes"
                  />
                  <span className="text-sm text-muted-foreground">minutes</span>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Textarea
                value={completionTimeDescription}
                onChange={(e) => setCompletionTimeDescription(e.target.value)}
                placeholder="What did you work on?"
                className="resize-none"
                data-testid="textarea-completion-description"
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => resetCompletionState()}
              data-testid="button-cancel-time-entry"
            >
              Cancel
            </Button>
            <Button
              onClick={handleTimeEntrySubmit}
              disabled={isCompletingTask || (completionTimeHours === 0 && completionTimeMinutes === 0)}
              data-testid="button-submit-time-complete"
            >
              {isCompletingTask ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Log Time & Complete
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </Sheet>
    </>
  );
}
