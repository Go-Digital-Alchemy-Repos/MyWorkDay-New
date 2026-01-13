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
  LayoutGrid,
  List,
  Pencil,
  Trash2,
  MoreHorizontal,
  FolderOpen,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { isToday, isTomorrow, isPast } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskWithRelations, PersonalTaskSection, Workspace } from "@shared/schema";

type ViewType = "date" | "sections";

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

function groupTasksBySections(
  tasks: TaskWithRelations[],
  sections: PersonalTaskSection[]
): { section: PersonalTaskSection | null; tasks: TaskWithRelations[] }[] {
  const sectionMap = new Map<string | null, TaskWithRelations[]>();
  
  sectionMap.set(null, []);
  sections.forEach((section) => sectionMap.set(section.id, []));
  
  tasks.forEach((task) => {
    const sectionId = task.personalSectionId;
    if (sectionMap.has(sectionId)) {
      sectionMap.get(sectionId)!.push(task);
    } else {
      sectionMap.get(null)!.push(task);
    }
  });
  
  const result: { section: PersonalTaskSection | null; tasks: TaskWithRelations[] }[] = [];
  
  sections.forEach((section) => {
    result.push({
      section,
      tasks: sectionMap.get(section.id) || [],
    });
  });
  
  const unsectionedTasks = sectionMap.get(null) || [];
  if (unsectionedTasks.length > 0) {
    result.push({
      section: null,
      tasks: unsectionedTasks,
    });
  }
  
  return result;
}

export default function MyTasks() {
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [viewType, setViewType] = useState<ViewType>("date");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showNewTaskInput, setShowNewTaskInput] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [showNewSectionInput, setShowNewSectionInput] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sectionInputRef = useRef<HTMLInputElement>(null);

  const { data: tasks, isLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks/my"],
  });

  const { data: sections = [], isLoading: sectionsLoading } = useQuery<PersonalTaskSection[]>({
    queryKey: ["/api/v1/my-tasks/sections"],
  });

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
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

  const createSectionMutation = useMutation({
    mutationFn: async (name: string) => {
      return apiRequest("POST", "/api/v1/my-tasks/sections", { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/my-tasks/sections"] });
      setNewSectionName("");
      setShowNewSectionInput(false);
    },
  });

  const updateSectionMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      return apiRequest("PATCH", `/api/v1/my-tasks/sections/${id}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/my-tasks/sections"] });
      setEditingSectionId(null);
      setEditingSectionName("");
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/my-tasks/sections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/my-tasks/sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
    },
  });

  const moveTaskToSectionMutation = useMutation({
    mutationFn: async ({ taskId, sectionId }: { taskId: string; sectionId: string | null }) => {
      return apiRequest("POST", `/api/v1/my-tasks/tasks/${taskId}/move`, { sectionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
    },
  });

  const handleCreatePersonalTask = () => {
    if (newTaskTitle.trim()) {
      createPersonalTaskMutation.mutate(newTaskTitle.trim());
    }
  };

  const handleCreateSection = () => {
    if (newSectionName.trim()) {
      createSectionMutation.mutate(newSectionName.trim());
    }
  };

  const handleUpdateSection = (id: string) => {
    if (editingSectionName.trim()) {
      updateSectionMutation.mutate({ id, name: editingSectionName.trim() });
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
  const sectionedTasks = groupTasksBySections(filteredTasks, sections);

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
            <Tabs value={viewType} onValueChange={(v) => setViewType(v as ViewType)}>
              <TabsList className="h-8">
                <TabsTrigger value="date" className="h-7 px-3 text-xs" data-testid="tab-date-view">
                  <Calendar className="h-3.5 w-3.5 mr-1" />
                  Date
                </TabsTrigger>
                <TabsTrigger value="sections" className="h-7 px-3 text-xs" data-testid="tab-sections-view">
                  <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                  Sections
                </TabsTrigger>
              </TabsList>
            </Tabs>
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
        {isLoading || (viewType === "sections" && sectionsLoading) ? (
          <div className="p-6 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ))}
          </div>
        ) : viewType === "date" ? (
          taskGroups.length > 0 ? (
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
          )
        ) : (
          <div className="p-6 space-y-4">
            {sectionedTasks.map(({ section, tasks: sectionTasks }) => (
              <Card key={section?.id || "unsectioned"} className="overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
                  {editingSectionId === section?.id ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={editingSectionName}
                        onChange={(e) => setEditingSectionName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && section?.id) {
                            handleUpdateSection(section.id);
                          } else if (e.key === "Escape") {
                            setEditingSectionId(null);
                            setEditingSectionName("");
                          }
                        }}
                        className="h-7 text-sm"
                        autoFocus
                        data-testid="input-edit-section-name"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => section?.id && handleUpdateSection(section.id)}
                        data-testid="button-save-section-name"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => {
                          setEditingSectionId(null);
                          setEditingSectionName("");
                        }}
                        data-testid="button-cancel-edit-section"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {section?.name || "Unsectioned"}
                        </span>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {sectionTasks.length}
                        </span>
                      </div>
                      {section && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-section-menu-${section.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => {
                                setEditingSectionId(section.id);
                                setEditingSectionName(section.name);
                              }}
                              data-testid={`button-edit-section-${section.id}`}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-500"
                              onClick={() => deleteSectionMutation.mutate(section.id)}
                              data-testid={`button-delete-section-${section.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </>
                  )}
                </div>
                <div>
                  {sectionTasks.length > 0 ? (
                    sectionTasks.map((task) => (
                      <div key={task.id} className="flex items-center">
                        <div className="flex-1">
                          <TaskCard
                            task={task}
                            view="list"
                            onSelect={() => handleTaskSelect(task)}
                            onStatusChange={(completed) => handleStatusChange(task.id, completed)}
                          />
                        </div>
                        {sections.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 mr-2 flex-shrink-0"
                                data-testid={`button-move-task-${task.id}`}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {task.personalSectionId && (
                                <DropdownMenuItem
                                  onClick={() => moveTaskToSectionMutation.mutate({ taskId: task.id, sectionId: null })}
                                  data-testid={`button-move-task-unsectioned-${task.id}`}
                                >
                                  Remove from section
                                </DropdownMenuItem>
                              )}
                              {sections
                                .filter((s) => s.id !== task.personalSectionId)
                                .map((s) => (
                                  <DropdownMenuItem
                                    key={s.id}
                                    onClick={() => moveTaskToSectionMutation.mutate({ taskId: task.id, sectionId: s.id })}
                                    data-testid={`button-move-task-to-section-${s.id}-${task.id}`}
                                  >
                                    Move to {s.name}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No tasks in this section
                    </div>
                  )}
                </div>
              </Card>
            ))}

            {showNewSectionInput ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={sectionInputRef}
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateSection();
                    } else if (e.key === "Escape") {
                      setShowNewSectionInput(false);
                      setNewSectionName("");
                    }
                  }}
                  placeholder="Section name..."
                  className="flex-1"
                  autoFocus
                  data-testid="input-new-section-name"
                />
                <Button
                  size="sm"
                  onClick={handleCreateSection}
                  disabled={!newSectionName.trim() || createSectionMutation.isPending}
                  data-testid="button-create-section"
                >
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowNewSectionInput(false);
                    setNewSectionName("");
                  }}
                  data-testid="button-cancel-new-section"
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full h-12 border-dashed justify-center"
                onClick={() => {
                  setShowNewSectionInput(true);
                  setTimeout(() => sectionInputRef.current?.focus(), 0);
                }}
                data-testid="button-add-section"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Section
              </Button>
            )}
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
    </div>
  );
}
