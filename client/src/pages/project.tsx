import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  Plus,
  MoreHorizontal,
  ChevronLeft,
  Users,
  Settings,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionColumn } from "@/components/section-column";
import { TaskCard } from "@/components/task-card";
import { TaskDetailDrawer } from "@/components/task-detail-drawer";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { ProjectCalendar } from "@/components/project-calendar";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProjectSocket } from "@/lib/realtime";
import type { Project, SectionWithTasks, TaskWithRelations, Section } from "@shared/schema";
import { Link } from "wouter";

type ViewType = "board" | "list" | "calendar";

export default function ProjectPage() {
  const [, params] = useRoute("/projects/:id");
  const projectId = params?.id;
  const { toast } = useToast();

  // Subscribe to real-time updates for this project
  useProjectSocket(projectId);

  const [view, setView] = useState<ViewType>("board");
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [localSections, setLocalSections] = useState<SectionWithTasks[] | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: sections, isLoading: sectionsLoading } = useQuery<SectionWithTasks[]>({
    queryKey: ["/api/projects", projectId, "sections"],
    enabled: !!projectId,
  });

  const { data: tasks } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });
  
  const { data: childTasks = [] } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks", selectedTask?.id, "childtasks"],
    enabled: !!selectedTask && !selectedTask.parentTaskId,
  });

  const displaySections = localSections || sections;

  const createTaskMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/tasks", { ...data, projectId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskWithRelations> }) => {
      return apiRequest("PATCH", `/api/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      if (selectedTask) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask.id] });
      }
    },
  });

  const addChildTaskMutation = useMutation({
    mutationFn: async ({ parentTaskId, title }: { parentTaskId: string; title: string }) => {
      return apiRequest("POST", `/api/tasks/${parentTaskId}/childtasks`, { title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      if (selectedTask) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask.id, "childtasks"] });
      }
    },
  });

  const deleteChildTaskMutation = useMutation({
    mutationFn: async (taskId: string) => {
      return apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      if (selectedTask) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask.id, "childtasks"] });
      }
    },
  });

  const reorderChildTasksMutation = useMutation({
    mutationFn: async ({ parentTaskId, taskId, toIndex }: { parentTaskId: string; taskId: string; toIndex: number }) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/tasks/reorder`, {
        moves: [{ itemType: "childTask", taskId, parentTaskId, toIndex }],
      });
    },
    onSuccess: () => {
      if (selectedTask) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", selectedTask.id, "childtasks"] });
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

  const reorderMutation = useMutation({
    mutationFn: async (moves: { itemType: string; taskId: string; toSectionId: string; toIndex: number }[]) => {
      return apiRequest("PATCH", `/api/projects/${projectId}/tasks/reorder`, { moves });
    },
    onSuccess: () => {
      setLocalSections(null);
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
    },
    onError: () => {
      setLocalSections(null);
      toast({
        title: "Failed to move task",
        description: "The task could not be moved. Please try again.",
        variant: "destructive",
      });
    },
  });

  const createSectionMutation = useMutation({
    mutationFn: async (name: string) => {
      const nextOrderIndex = sections?.length || 0;
      return apiRequest("POST", "/api/sections", { projectId, name, orderIndex: nextOrderIndex });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({
        title: "Section created",
        description: "New section has been added to the project.",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create section",
        description: "The section could not be created. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddSection = useCallback(() => {
    const sectionName = prompt("Enter section name:");
    if (sectionName && sectionName.trim()) {
      createSectionMutation.mutate(sectionName.trim());
    }
  }, [createSectionMutation]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTaskId(null);

      if (!over || !sections) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeData = active.data.current as { type: string; task: TaskWithRelations } | undefined;
      const overData = over.data.current as { type: string; section?: SectionWithTasks; task?: TaskWithRelations } | undefined;

      if (!activeData || activeData.type !== "task") return;

      const activeTask = activeData.task;
      const fromSectionId = activeTask.sectionId;

      let toSectionId: string;
      let toIndex: number;

      if (overData?.type === "section") {
        toSectionId = overId;
        toIndex = 0;
      } else if (overData?.type === "task") {
        const overTask = overData.task!;
        toSectionId = overTask.sectionId!;
        const targetSection = sections.find((s) => s.id === toSectionId);
        if (!targetSection) return;
        toIndex = targetSection.tasks?.findIndex((t) => t.id === overId) ?? 0;
      } else {
        return;
      }

      if (fromSectionId === toSectionId && activeId === overId) return;

      const newSections = sections.map((section) => {
        const newTasks = [...(section.tasks || [])];

        if (section.id === fromSectionId) {
          const taskIndex = newTasks.findIndex((t) => t.id === activeId);
          if (taskIndex !== -1) {
            newTasks.splice(taskIndex, 1);
          }
        }

        return { ...section, tasks: newTasks };
      });

      const targetSectionIndex = newSections.findIndex((s) => s.id === toSectionId);
      if (targetSectionIndex !== -1) {
        const updatedTask = { ...activeTask, sectionId: toSectionId };
        newSections[targetSectionIndex].tasks!.splice(toIndex, 0, updatedTask);
      }

      setLocalSections(newSections);

      reorderMutation.mutate([
        {
          itemType: "task",
          taskId: activeId,
          toSectionId,
          toIndex,
        },
      ]);
    },
    [sections, reorderMutation]
  );

  const refetchSelectedTask = async () => {
    if (selectedTask) {
      const response = await fetch(`/api/tasks/${selectedTask.id}`);
      const updatedTask = await response.json();
      setSelectedTask(updatedTask);
    }
  };

  const handleAddTask = (sectionId?: string) => {
    setSelectedSectionId(sectionId);
    setCreateTaskOpen(true);
  };

  const handleCreateTask = (data: any) => {
    createTaskMutation.mutate(data);
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

  const isLoading = projectLoading || sectionsLoading;

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border px-6 py-4">
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="flex-1 p-6">
          <div className="flex gap-4 overflow-x-auto">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="min-w-[280px] h-[400px] rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <h2 className="text-lg font-medium mb-2">Project not found</h2>
        <Link href="/">
          <Button variant="outline">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-medium"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold">{project.name}</h1>
              {project.description && (
                <p className="text-xs text-muted-foreground">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" data-testid="button-project-members">
              <Users className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" data-testid="button-project-settings">
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 pb-3">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
            <TabsList className="h-9">
              <TabsTrigger value="board" className="gap-1.5" data-testid="tab-board">
                <LayoutGrid className="h-3.5 w-3.5" />
                Board
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1.5" data-testid="tab-list">
                <List className="h-3.5 w-3.5" />
                List
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1.5" data-testid="tab-calendar">
                <CalendarIcon className="h-3.5 w-3.5" />
                Calendar
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => handleAddTask()} data-testid="button-add-task">
            <Plus className="h-4 w-4 mr-1" />
            Add Task
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {view === "board" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 p-6 h-full overflow-x-auto">
              {displaySections?.map((section) => (
                <SectionColumn
                  key={section.id}
                  section={section}
                  onAddTask={() => handleAddTask(section.id)}
                  onTaskSelect={handleTaskSelect}
                  onTaskStatusChange={handleStatusChange}
                />
              ))}
              <div className="min-w-[280px] max-w-[280px] shrink-0">
                <Button
                  variant="outline"
                  className="w-full h-12 border-dashed justify-center"
                  onClick={handleAddSection}
                  data-testid="button-add-section"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Section
                </Button>
              </div>
            </div>
          </DndContext>
        )}

        {view === "list" && (
          <div className="p-6">
            {sections?.map((section) => (
              <div key={section.id} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-sm font-medium">{section.name}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {section.tasks?.length || 0}
                  </span>
                </div>
                <div className="border border-border rounded-lg overflow-hidden">
                  {section.tasks?.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      view="list"
                      onSelect={() => handleTaskSelect(task)}
                      onStatusChange={(completed) => handleStatusChange(task.id, completed)}
                    />
                  ))}
                  {(!section.tasks || section.tasks.length === 0) && (
                    <div className="flex items-center justify-center py-8 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAddTask(section.id)}
                        data-testid={`button-add-task-list-${section.id}`}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add task
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <Button
              variant="outline"
              className="w-full h-12 border-dashed justify-center"
              onClick={handleAddSection}
              data-testid="button-add-section-list"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          </div>
        )}

        {view === "calendar" && projectId && sections && (
          <ProjectCalendar
            projectId={projectId}
            sections={sections.map(s => ({ id: s.id, projectId: s.projectId, name: s.name, orderIndex: s.orderIndex, createdAt: s.createdAt }))}
            onTaskSelect={handleTaskSelect}
            onDateClick={(date) => {
              setSelectedSectionId(sections[0]?.id);
              setCreateTaskOpen(true);
            }}
          />
        )}
      </div>

      <TaskDetailDrawer
        task={selectedTask}
        childTasks={childTasks}
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdate={(taskId: string, data: Partial<TaskWithRelations>) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onAddChildTask={(parentTaskId: string, title: string) => {
          addChildTaskMutation.mutate({ parentTaskId, title });
        }}
        onDeleteChildTask={(taskId: string) => {
          deleteChildTaskMutation.mutate(taskId);
        }}
        onReorderChildTasks={(parentTaskId: string, taskId: string, toIndex: number) => {
          reorderChildTasksMutation.mutate({ parentTaskId, taskId, toIndex });
        }}
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
      />

      <CreateTaskDialog
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onSubmit={handleCreateTask}
        sections={sections?.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name, orderIndex: s.orderIndex, createdAt: s.createdAt })) || []}
        defaultSectionId={selectedSectionId}
      />
    </div>
  );
}
