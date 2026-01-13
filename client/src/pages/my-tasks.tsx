import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckSquare,
  Filter,
  SortAsc,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle2,
  Plus,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { isToday, isTomorrow, isPast, isFuture, addDays } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskWithRelations } from "@shared/schema";

type TaskGroup = {
  id: string;
  title: string;
  icon: React.ElementType;
  tasks: TaskWithRelations[];
  defaultOpen: boolean;
};

function groupTasksByDueDate(tasks: TaskWithRelations[]): TaskGroup[] {
  const overdue: TaskWithRelations[] = [];
  const today: TaskWithRelations[] = [];
  const tomorrow: TaskWithRelations[] = [];
  const upcoming: TaskWithRelations[] = [];
  const noDueDate: TaskWithRelations[] = [];

  tasks.forEach((task) => {
    if (!task.dueDate) {
      noDueDate.push(task);
    } else {
      const dueDate = new Date(task.dueDate);
      if (isPast(dueDate) && !isToday(dueDate)) {
        overdue.push(task);
      } else if (isToday(dueDate)) {
        today.push(task);
      } else if (isTomorrow(dueDate)) {
        tomorrow.push(task);
      } else {
        upcoming.push(task);
      }
    }
  });

  return [
    { id: "overdue", title: "Overdue", icon: AlertCircle, tasks: overdue, defaultOpen: true },
    { id: "today", title: "Today", icon: Clock, tasks: today, defaultOpen: true },
    { id: "tomorrow", title: "Tomorrow", icon: Calendar, tasks: tomorrow, defaultOpen: true },
    { id: "upcoming", title: "Upcoming", icon: Calendar, tasks: upcoming, defaultOpen: true },
    { id: "no-date", title: "No Due Date", icon: CheckSquare, tasks: noDueDate, defaultOpen: false },
  ].filter((group) => group.tasks.length > 0);
}

export default function MyTasks() {
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks/my"],
  });

  const createPersonalTaskMutation = useMutation({
    mutationFn: async (title: string) => {
      return apiRequest("POST", "/api/tasks/personal", { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      setNewTaskTitle("");
      setShowNewTaskInput(false);
    },
  });

  const handleCreatePersonalTask = () => {
    if (newTaskTitle.trim()) {
      createPersonalTaskMutation.mutate(newTaskTitle.trim());
    }
  };

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskWithRelations> }) => {
      return apiRequest("PATCH", `/api/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const addSubtaskMutation = useMutation({
    mutationFn: async ({ taskId, title }: { taskId: string; title: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const toggleSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, completed }: { subtaskId: string; completed: boolean }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, { completed });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const deleteSubtaskMutation = useMutation({
    mutationFn: async (subtaskId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtaskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const addCommentMutation = useMutation({
    mutationFn: async ({ taskId, body }: { taskId: string; body: string }) => {
      return apiRequest("POST", `/api/tasks/${taskId}/comments`, { body });
    },
    onSuccess: () => {
      if (selectedTask) {
        refetchSelectedTask();
      }
    },
  });

  const refetchSelectedTask = async () => {
    if (selectedTask) {
      const response = await fetch(`/api/tasks/${selectedTask.id}`);
      const updatedTask = await response.json();
      setSelectedTask(updatedTask);
    }
  };

  const filteredTasks = tasks?.filter((task) => {
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  }) || [];

  const taskGroups = groupTasksByDueDate(filteredTasks);

  const handleTaskSelect = (task: TaskWithRelations) => {
    setSelectedTask(task);
  };

  const handleStatusChange = (taskId: string, completed: boolean) => {
    updateTaskMutation.mutate({
      taskId,
      data: { status: completed ? "done" : "todo" },
    });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <CheckSquare className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-semibold">My Tasks</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowNewTaskInput(true);
                setTimeout(() => inputRef.current?.focus(), 0);
              }}
              data-testid="button-add-personal-task"
            >
              <Plus className="h-4 w-4 mr-1" />
              Personal Task
            </Button>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[130px]" data-testid="select-priority-filter">
                <SortAsc className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priority</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {showNewTaskInput && (
          <div className="px-6 pb-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Personal</span>
              </div>
              <Input
                ref={inputRef}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreatePersonalTask();
                  } else if (e.key === "Escape") {
                    setShowNewTaskInput(false);
                    setNewTaskTitle("");
                  }
                }}
                placeholder="What do you need to do?"
                className="flex-1"
                data-testid="input-new-personal-task"
              />
              <Button
                size="sm"
                onClick={handleCreatePersonalTask}
                disabled={!newTaskTitle.trim() || createPersonalTaskMutation.isPending}
                data-testid="button-create-personal-task"
              >
                {createPersonalTaskMutation.isPending ? "Creating..." : "Add Task"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowNewTaskInput(false);
                  setNewTaskTitle("");
                }}
                data-testid="button-cancel-personal-task"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : taskGroups.length > 0 ? (
          <div className="p-6 space-y-4">
            {taskGroups.map((group) => (
              <Collapsible key={group.id} defaultOpen={group.defaultOpen}>
                <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 hover-elevate rounded-md px-2">
                  <group.icon className={`h-4 w-4 ${group.id === "overdue" ? "text-red-500" : "text-muted-foreground"}`} />
                  <span className="text-sm font-medium">{group.title}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {group.tasks.length}
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border border-border rounded-lg overflow-hidden mt-2">
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        view="list"
                        onSelect={() => handleTaskSelect(task)}
                        onStatusChange={(completed) => handleStatusChange(task.id, completed)}
                      />
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center">
            <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">You're all caught up!</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {statusFilter !== "all" || priorityFilter !== "all"
                ? "No tasks match your current filters"
                : "Tasks assigned to you will appear here"}
            </p>
          </div>
        )}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdate={(taskId, data) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onAddSubtask={(taskId, title) => {
          addSubtaskMutation.mutate({ taskId, title });
        }}
        onToggleSubtask={(subtaskId, completed) => {
          toggleSubtaskMutation.mutate({ subtaskId, completed });
        }}
        onDeleteSubtask={(subtaskId) => {
          deleteSubtaskMutation.mutate(subtaskId);
        }}
        onAddComment={(taskId, body) => {
          addCommentMutation.mutate({ taskId, body });
        }}
      />
    </div>
  );
}
