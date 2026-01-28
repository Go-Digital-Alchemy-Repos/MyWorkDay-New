import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useCreatePersonalTask, useCreateSubtask } from "@/hooks/use-create-task";

const MY_TASKS_FILTERS_KEY = "my-tasks-filters";
const MY_TASKS_ORDERS_KEY = "my-tasks-section-orders";

function loadSavedFilters(): { statusFilter: string; priorityFilter: string; showCompleted: boolean } {
  try {
    const saved = localStorage.getItem(MY_TASKS_FILTERS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        statusFilter: parsed.statusFilter || "all",
        priorityFilter: parsed.priorityFilter || "all",
        showCompleted: parsed.showCompleted ?? false,
      };
    }
  } catch {}
  return { statusFilter: "all", priorityFilter: "all", showCompleted: false };
}

function saveFilters(filters: { statusFilter: string; priorityFilter: string; showCompleted: boolean }) {
  try {
    localStorage.setItem(MY_TASKS_FILTERS_KEY, JSON.stringify(filters));
  } catch {}
}

function loadSavedOrders(): Record<string, string[]> {
  try {
    const saved = localStorage.getItem(MY_TASKS_ORDERS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch {}
  return {};
}

function saveOrders(orders: Record<string, string[]>) {
  try {
    localStorage.setItem(MY_TASKS_ORDERS_KEY, JSON.stringify(orders));
  } catch {}
}
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
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
  CalendarX,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SortableTaskCard, TaskDetailDrawer } from "@/features/tasks";
import { isToday, isPast, isFuture } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { AccessInfoBanner } from "@/components/access-info-banner";
import { TaskProgressBar } from "@/components/task-progress-bar";
import type { TaskWithRelations, Workspace, User as UserType } from "@shared/schema";
import { UserRole } from "@shared/schema";

type TaskSection = {
  id: string;
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  tasks: TaskWithRelations[];
  defaultOpen: boolean;
};

function categorizeTasksForTwoColumn(tasks: TaskWithRelations[]): {
  leftColumn: TaskSection[];
  rightColumn: TaskSection[];
} {
  const personalTasks: TaskWithRelations[] = [];
  const noDueDate: TaskWithRelations[] = [];
  const overdue: TaskWithRelations[] = [];
  const today: TaskWithRelations[] = [];
  const upcoming: TaskWithRelations[] = [];

  tasks.forEach((task) => {
    const isPersonal = !task.projectId;
    
    if (isPersonal) {
      // All personal tasks go to Personal Tasks section
      personalTasks.push(task);
    } else {
      // Project tasks
      if (!task.dueDate) {
        noDueDate.push(task);
      } else {
        const dueDate = new Date(task.dueDate);
        if (isPast(dueDate) && !isToday(dueDate)) {
          overdue.push(task);
        } else if (isToday(dueDate)) {
          today.push(task);
        } else if (isFuture(dueDate)) {
          upcoming.push(task);
        }
      }
    }
  });

  const leftColumn: TaskSection[] = [
    { id: "overdue", title: "Overdue", icon: AlertCircle, iconColor: "text-red-500", tasks: overdue, defaultOpen: true },
    { id: "today", title: "Today", icon: Clock, iconColor: "text-blue-500", tasks: today, defaultOpen: true },
    { id: "upcoming", title: "Upcoming", icon: Calendar, iconColor: "text-green-500", tasks: upcoming, defaultOpen: true },
  ];

  const rightColumn: TaskSection[] = [
    { id: "personal", title: "Personal Tasks", icon: User, tasks: personalTasks, defaultOpen: true },
    { id: "no-date", title: "No Due Date", icon: CalendarX, tasks: noDueDate, defaultOpen: true },
  ];

  return { leftColumn, rightColumn };
}

interface TaskSectionListProps {
  section: TaskSection;
  onTaskSelect: (task: TaskWithRelations) => void;
  onStatusChange: (taskId: string, completed: boolean) => void;
  localOrder: string[];
  onDragEnd: (event: DragEndEvent, sectionId: string) => void;
  onAddTask?: () => void;
  supportsAddTask?: boolean;
}

function TaskSectionList({ section, onTaskSelect, onStatusChange, localOrder, onDragEnd, onAddTask, supportsAddTask = false }: TaskSectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const orderedTasks = useMemo(() => {
    if (localOrder.length === 0) return section.tasks;
    const taskMap = new Map(section.tasks.map(t => [t.id, t]));
    const ordered: TaskWithRelations[] = [];
    localOrder.forEach(id => {
      const task = taskMap.get(id);
      if (task) ordered.push(task);
    });
    section.tasks.forEach(task => {
      if (!localOrder.includes(task.id)) ordered.push(task);
    });
    return ordered;
  }, [section.tasks, localOrder]);

  return (
    <Collapsible defaultOpen={section.defaultOpen}>
      <div className="flex items-center gap-1">
        <CollapsibleTrigger className="flex items-center gap-2 flex-1 py-2 hover-elevate rounded-md px-2">
          <section.icon className={`h-4 w-4 ${section.iconColor || "text-muted-foreground"}`} />
          <span className="text-sm font-medium">{section.title}</span>
          <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            {section.tasks.length}
          </span>
        </CollapsibleTrigger>
        {onAddTask && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onAddTask}
            data-testid={`button-add-${section.id}-task`}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>
      <CollapsibleContent>
        {section.tasks.length > 0 ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e) => onDragEnd(e, section.id)}
          >
            <SortableContext items={orderedTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
              <div className="border border-border rounded-lg overflow-hidden mt-2">
                {orderedTasks.map((task) => (
                  <SortableTaskCard
                    key={task.id}
                    task={task}
                    view="list"
                    onSelect={() => onTaskSelect(task)}
                    onStatusChange={(completed) => onStatusChange(task.id, completed)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="border border-border border-dashed rounded-lg mt-2 px-4 py-6 text-center text-sm text-muted-foreground">
            {supportsAddTask && onAddTask ? (
              <div className="flex flex-col items-center gap-2">
                <p>No tasks yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onAddTask}
                  className="gap-1"
                  data-testid={`button-empty-add-${section.id}-task`}
                >
                  <Plus className="h-4 w-4" />
                  Add a task
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                <p>Drag tasks here to prioritize this section</p>
              </div>
            )}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function MyTasks() {
  const { user } = useAuth();
  const isEmployee = user?.role === UserRole.EMPLOYEE;
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  
  // Handle quick action from mobile nav (opens new task dialog via URL param)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'new') {
      setShowNewTaskDialog(true);
      // Clean up the URL without causing a page reload
      const url = new URL(window.location.href);
      url.searchParams.delete('action');
      window.history.replaceState({}, '', url.pathname);
    }
  }, []);
  
  // Personal task form state
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [newTaskAssignees, setNewTaskAssignees] = useState<string[]>([]);

  const savedFilters = useMemo(() => loadSavedFilters(), []);
  const [statusFilter, setStatusFilter] = useState<string>(savedFilters.statusFilter);
  const [priorityFilter, setPriorityFilter] = useState<string>(savedFilters.priorityFilter);
  const [showCompleted, setShowCompleted] = useState<boolean>(savedFilters.showCompleted);
  const [sectionOrders, setSectionOrders] = useState<Record<string, string[]>>(() => loadSavedOrders());

  useEffect(() => {
    saveFilters({ statusFilter, priorityFilter, showCompleted });
  }, [statusFilter, priorityFilter, showCompleted]);

  useEffect(() => {
    saveOrders(sectionOrders);
  }, [sectionOrders]);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks/my"],
  });

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: tenantUsers } = useQuery<UserType[]>({
    queryKey: ["/api/v1/users"],
  });

  const resetNewTaskForm = useCallback(() => {
    setNewTaskTitle("");
    setNewTaskDescription("");
    setNewTaskDueDate("");
    setNewTaskPriority("medium");
    setNewTaskAssignees([]);
    setShowNewTaskDialog(false);
  }, []);

  const createPersonalTaskMutation = useCreatePersonalTask({
    onSuccess: () => {
      resetNewTaskForm();
    },
  });

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

  const addSubtaskMutation = useCreateSubtask({
    onSuccess: () => {
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

  const handleCreatePersonalTask = () => {
    if (newTaskTitle.trim()) {
      createPersonalTaskMutation.mutate({ 
        title: newTaskTitle.trim(),
        description: newTaskDescription.trim() || undefined,
        dueDate: newTaskDueDate || null,
        priority: newTaskPriority,
        assigneeIds: newTaskAssignees.length > 0 ? newTaskAssignees : undefined,
      });
    }
  };

  const handleTaskSelect = (task: TaskWithRelations) => {
    setSelectedTask(task);
  };

  const handleStatusChange = (taskId: string, completed: boolean) => {
    updateTaskMutation.mutate({
      taskId,
      data: { status: completed ? "done" : "todo" },
    });
  };

  const handleDragEnd = (event: DragEndEvent, sectionId: string) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSectionOrders(prev => {
      const currentOrder = prev[sectionId] || [];
      const allTasks = filteredTasks.filter(t => {
        const isPersonal = !t.projectId;
        if (sectionId === "personal") return isPersonal;
        if (sectionId === "no-date") return !isPersonal && !t.dueDate;
        if (sectionId === "overdue") return !isPersonal && t.dueDate && isPast(new Date(t.dueDate)) && !isToday(new Date(t.dueDate));
        if (sectionId === "today") return !isPersonal && t.dueDate && isToday(new Date(t.dueDate));
        if (sectionId === "upcoming") return !isPersonal && t.dueDate && isFuture(new Date(t.dueDate));
        return false;
      });
      
      const taskIds = currentOrder.length > 0 ? currentOrder : allTasks.map(t => t.id);
      const oldIndex = taskIds.indexOf(active.id as string);
      const newIndex = taskIds.indexOf(over.id as string);
      
      if (oldIndex === -1 || newIndex === -1) return prev;
      
      return {
        ...prev,
        [sectionId]: arrayMove(taskIds, oldIndex, newIndex),
      };
    });
  };

  const filteredTasks = tasks?.filter((task) => {
    if (task.status === "done" && !showCompleted) return false;
    if (statusFilter !== "all" && task.status !== statusFilter) return false;
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
    return true;
  }) || [];

  const { leftColumn, rightColumn } = categorizeTasksForTwoColumn(filteredTasks);

  const totalTasks = filteredTasks.length;

  const taskStats = useMemo(() => {
    const allTasks = tasks || [];
    return {
      total: allTasks.length,
      done: allTasks.filter(t => t.status === "done").length,
      inProgress: allTasks.filter(t => t.status === "in_progress").length,
      todo: allTasks.filter(t => t.status === "todo").length,
      blocked: allTasks.filter(t => t.status === "blocked").length,
    };
  }, [tasks]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {isEmployee && (
        <AccessInfoBanner variant="tasks" className="mx-4 md:mx-6 mt-4" />
      )}
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex flex-col gap-3 px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 md:gap-3">
              <CheckSquare className="h-5 w-5 md:h-6 md:w-6 text-primary" />
              <h1 className="text-lg md:text-2xl font-semibold">My Tasks</h1>
              <span className="text-xs md:text-sm text-muted-foreground">({totalTasks})</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewTaskDialog(true)}
              data-testid="button-add-personal-task"
              className="md:hidden"
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowNewTaskDialog(true)}
              data-testid="button-add-personal-task-desktop"
              className="hidden md:flex"
            >
              <Plus className="h-4 w-4 mr-1" />
              Personal Task
            </Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[110px] md:w-[130px] shrink-0" data-testid="select-status-filter">
                <Filter className="h-4 w-4 mr-1 md:mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Open Tasks</SelectItem>
                <SelectItem value="todo">To Do</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-[100px] md:w-[130px] shrink-0" data-testid="select-priority-filter">
                <SortAsc className="h-4 w-4 mr-1 md:mr-2" />
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
            <Button
              variant={showCompleted ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowCompleted(!showCompleted)}
              className="gap-1 md:gap-2 shrink-0"
              data-testid="button-toggle-completed"
            >
              {showCompleted ? (
                <>
                  <Eye className="h-4 w-4" />
                  <span className="hidden md:inline">Show done</span>
                </>
              ) : (
                <>
                  <EyeOff className="h-4 w-4" />
                  <span className="hidden md:inline">Hide done</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {taskStats.total > 0 && (
          <div className="px-3 md:px-6 pb-4">
            <TaskProgressBar stats={taskStats} showMilestones />
          </div>
        )}

      </div>

      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 h-full">
            <div className="space-y-4">
              <Skeleton className="h-5 w-32" />
              {[1, 2].map((section) => (
                <div key={section} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-6 rounded-full" />
                  </div>
                  {[1, 2].map((task) => (
                    <div key={task} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <Skeleton className="h-5 w-40" />
              {[1, 2].map((section) => (
                <div key={section} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-6 rounded-full" />
                  </div>
                  {[1, 2].map((task) => (
                    <div key={task} className="flex items-center gap-3 p-3 rounded-lg border">
                      <Skeleton className="h-5 w-5 rounded" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : totalTasks > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 h-full">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Scheduled Tasks</h2>
                {leftColumn.map((section) => (
                  <TaskSectionList
                    key={section.id}
                    section={section}
                    onTaskSelect={handleTaskSelect}
                    onStatusChange={handleStatusChange}
                    localOrder={sectionOrders[section.id] || []}
                    onDragEnd={handleDragEnd}
                  />
                ))}
              </div>
            </ScrollArea>

            <ScrollArea className="h-full pr-2">
              <div className="space-y-4">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Personal & Unscheduled</h2>
                {rightColumn.map((section) => (
                  <TaskSectionList
                    key={section.id}
                    section={section}
                    onTaskSelect={handleTaskSelect}
                    onStatusChange={handleStatusChange}
                    localOrder={sectionOrders[section.id] || []}
                    onDragEnd={handleDragEnd}
                    onAddTask={section.id === "personal" ? () => setShowNewTaskDialog(true) : undefined}
                    supportsAddTask={section.id === "personal"}
                  />
                ))}
              </div>
            </ScrollArea>
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
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setShowNewTaskDialog(true)}
              data-testid="button-add-first-task"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add a personal task
            </Button>
          </div>
        )}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdate={(taskId: string, data: Partial<TaskWithRelations>) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onRefresh={refetchSelectedTask}
        onAddChildTask={(parentTaskId: string, title: string) => {
          addSubtaskMutation.mutate({ taskId: parentTaskId, title });
        }}
        onDeleteChildTask={(taskId: string) => {
          deleteSubtaskMutation.mutate(taskId);
        }}
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
        workspaceId={selectedTask?.project?.workspaceId || currentWorkspace?.id}
      />

      <Dialog open={showNewTaskDialog} onOpenChange={(open) => {
        if (!open) resetNewTaskForm();
        setShowNewTaskDialog(open);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Create Personal Task
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title *</Label>
              <Input
                id="task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="What do you need to do?"
                data-testid="input-new-personal-task-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-description">Description</Label>
              <Textarea
                id="task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Add more details..."
                rows={3}
                data-testid="input-new-personal-task-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="task-due-date">Due Date</Label>
                <Input
                  id="task-due-date"
                  type="date"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  data-testid="input-new-personal-task-due-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="task-priority">Priority</Label>
                <Select value={newTaskPriority} onValueChange={(v) => setNewTaskPriority(v as any)}>
                  <SelectTrigger data-testid="select-new-personal-task-priority">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Assign To</Label>
              <Select 
                value={newTaskAssignees.length > 0 ? newTaskAssignees[0] : "_self"} 
                onValueChange={(v) => setNewTaskAssignees(v === "_self" ? [] : [v])}
              >
                <SelectTrigger data-testid="select-new-personal-task-assignee">
                  <SelectValue placeholder="Assign to yourself (default)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_self">Myself</SelectItem>
                  {tenantUsers?.filter(u => u.id !== user?.id).map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.firstName && u.lastName 
                        ? `${u.firstName} ${u.lastName}` 
                        : u.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Leave as default to assign to yourself
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={resetNewTaskForm}
              data-testid="button-cancel-personal-task"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePersonalTask}
              disabled={!newTaskTitle.trim() || createPersonalTaskMutation.isPending}
              data-testid="button-create-personal-task"
            >
              {createPersonalTaskMutation.isPending ? "Creating..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
