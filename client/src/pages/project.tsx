import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { useCreateTask } from "@/hooks/use-create-task";
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
  Play,
  Activity,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionColumn, TaskCard, TaskDetailDrawer, TaskCreateDrawer, ListSectionDroppable } from "@/features/tasks";
import { ProjectCalendar, ProjectSettingsSheet, ProjectMembersSheet, ProjectActivityFeed, AIProjectPlanner } from "@/features/projects";
import { StartTimerDrawer } from "@/features/timer";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useProjectSocket } from "@/lib/realtime";
import type { Project, SectionWithTasks, TaskWithRelations, Section } from "@shared/schema";
import { Link } from "wouter";
import { usePromptDialog } from "@/components/prompt-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import type { Client } from "@shared/schema";

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [timerDrawerOpen, setTimerDrawerOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [aiPlannerOpen, setAiPlannerOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<string | undefined>();
  const [localSections, setLocalSections] = useState<SectionWithTasks[] | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const { prompt: promptSectionName, PromptDialogComponent: SectionNameDialog } = usePromptDialog({
    title: "Create Section",
    description: "Enter a name for the new section",
    label: "Section Name",
    placeholder: "e.g., In Progress, Review, Done",
    confirmText: "Create",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  // Fetch client for breadcrumbs
  const { data: client } = useQuery<Client>({
    queryKey: ["/api/clients", project?.clientId],
    enabled: !!project?.clientId,
  });

  const { data: sections, isLoading: sectionsLoading } = useQuery<SectionWithTasks[]>({
    queryKey: ["/api/projects", projectId, "sections"],
    enabled: !!projectId,
  });

  const { data: tasks } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });
  
  const { data: tenantUsers = [] } = useQuery<{ id: string; email: string; firstName?: string | null; lastName?: string | null }[]>({
    queryKey: ["/api/users"],
    enabled: !!projectId,
  });

  const displaySections = localSections || sections;

  const activeTask = activeTaskId
    ? displaySections?.flatMap((s) => s.tasks || []).find((t) => t.id === activeTaskId)
    : null;

  const createTaskMutation = useCreateTask();

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

  const updateSectionMutation = useMutation({
    mutationFn: async ({ sectionId, name }: { sectionId: string; name: string }) => {
      return apiRequest("PATCH", `/api/sections/${sectionId}`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({ title: "Section updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update section", variant: "destructive" });
    },
  });

  const deleteSectionMutation = useMutation({
    mutationFn: async (sectionId: string) => {
      return apiRequest("DELETE", `/api/sections/${sectionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      toast({ title: "Section deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete section", variant: "destructive" });
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

  const handleAddSection = useCallback(async () => {
    const sectionName = await promptSectionName();
    if (sectionName && sectionName.trim()) {
      createSectionMutation.mutate(sectionName.trim());
    }
  }, [createSectionMutation, promptSectionName]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveTaskId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTaskId(null);

      const currentSections = displaySections;
      if (!over || !currentSections) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeData = active.data.current as { type: string; task: TaskWithRelations } | undefined;
      const overData = over.data.current as { type: string; section?: SectionWithTasks; task?: TaskWithRelations } | undefined;

      if (!activeData || activeData.type !== "task") return;

      const activeTask = activeData.task;
      const fromSectionId = activeTask.sectionId;

      let toSectionId: string;
      let overIndex: number;

      if (overData?.type === "section") {
        toSectionId = overId;
        const targetSection = currentSections.find((s) => s.id === toSectionId);
        overIndex = targetSection?.tasks?.length ?? 0;
      } else if (overData?.type === "task") {
        const overTask = overData.task!;
        toSectionId = overTask.sectionId!;
        const targetSection = currentSections.find((s) => s.id === toSectionId);
        if (!targetSection) return;
        overIndex = targetSection.tasks?.findIndex((t) => t.id === overId) ?? 0;
      } else {
        return;
      }

      if (fromSectionId === toSectionId && activeId === overId) return;

      const fromSection = currentSections.find((s) => s.id === fromSectionId);
      const fromIndex = fromSection?.tasks?.findIndex((t) => t.id === activeId) ?? -1;

      if (fromSectionId === toSectionId) {
        if (fromIndex === -1 || fromIndex === overIndex) return;
        const sectionTasks = [...(fromSection?.tasks || [])];
        const reorderedTasks = arrayMove(sectionTasks, fromIndex, overIndex);
        
        const newSections = currentSections.map((section) => {
          if (section.id === fromSectionId) {
            return { ...section, tasks: reorderedTasks };
          }
          return section;
        });

        setLocalSections(newSections);

        reorderMutation.mutate([
          {
            itemType: "task",
            taskId: activeId,
            toSectionId,
            toIndex: overIndex,
          },
        ]);
      } else {
        const newSections = currentSections.map((section) => {
          if (section.id === fromSectionId) {
            const newTasks = [...(section.tasks || [])];
            const taskIndex = newTasks.findIndex((t) => t.id === activeId);
            if (taskIndex !== -1) {
              newTasks.splice(taskIndex, 1);
            }
            return { ...section, tasks: newTasks };
          }
          return section;
        });

        const targetSectionIndex = newSections.findIndex((s) => s.id === toSectionId);
        if (targetSectionIndex !== -1) {
          const newTasks = [...(newSections[targetSectionIndex].tasks || [])];
          const updatedTask = { ...activeTask, sectionId: toSectionId };
          newTasks.splice(overIndex, 0, updatedTask);
          newSections[targetSectionIndex] = { ...newSections[targetSectionIndex], tasks: newTasks };
        }

        setLocalSections(newSections);

        reorderMutation.mutate([
          {
            itemType: "task",
            taskId: activeId,
            toSectionId,
            toIndex: overIndex,
          },
        ]);
      }
    },
    [displaySections, reorderMutation]
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

  const handleCreateTask = async (data: any) => {
    return new Promise<void>((resolve, reject) => {
      createTaskMutation.mutate({ ...data, projectId: projectId! }, {
        onSuccess: () => {
          toast({ title: "Task created successfully" });
          resolve();
        },
        onError: (error) => {
          toast({ 
            title: "Failed to create task", 
            description: error instanceof Error ? error.message : "Unknown error",
            variant: "destructive"
          });
          reject(error);
        },
      });
    });
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

  const handleEditSection = (sectionId: string, name: string) => {
    updateSectionMutation.mutate({ sectionId, name });
  };

  const handleDeleteSection = (sectionId: string) => {
    if (window.confirm("Are you sure you want to delete this section? All tasks in this section will be moved to no section.")) {
      deleteSectionMutation.mutate(sectionId);
    }
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
        {/* Breadcrumbs: Client > Project (or just Project if no client) */}
        <div className="px-4 md:px-6 pt-3 hidden md:block">
          <Breadcrumb>
            <BreadcrumbList>
              {client ? (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/clients" data-testid="breadcrumb-clients">Clients</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/clients/${client.id}`} data-testid="breadcrumb-client">
                        {client.companyName}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              ) : (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href="/projects" data-testid="breadcrumb-projects">Projects</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem>
                <BreadcrumbPage data-testid="breadcrumb-project">{project.name}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div
              className="h-7 w-7 md:h-8 md:w-8 rounded-md flex items-center justify-center text-white text-sm font-medium shrink-0"
              style={{ backgroundColor: project.color || "#3B82F6" }}
            >
              {project.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-base md:text-xl font-semibold truncate">{project.name}</h1>
              {project.description && (
                <p className="text-xs text-muted-foreground truncate hidden md:block">{project.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 md:gap-2 shrink-0">
            <Button 
              variant="default" 
              size="icon"
              className="md:hidden"
              onClick={() => setTimerDrawerOpen(true)}
              data-testid="button-start-timer-project-mobile"
            >
              <Play className="h-4 w-4" />
            </Button>
            <Button 
              variant="default" 
              size="sm"
              className="hidden md:flex"
              onClick={() => setTimerDrawerOpen(true)}
              data-testid="button-start-timer-project"
            >
              <Play className="h-4 w-4 mr-1" />
              Start Timer
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="md:hidden"
              onClick={() => setAiPlannerOpen(true)}
              data-testid="button-ai-planner-mobile"
            >
              <Sparkles className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex"
              onClick={() => setAiPlannerOpen(true)}
              data-testid="button-ai-planner"
            >
              <Sparkles className="h-4 w-4 mr-1" />
              AI Plan
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setMembersOpen(true)}
              data-testid="button-project-members"
              className="hidden md:flex"
            >
              <Users className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setActivityOpen(true)}
              data-testid="button-project-activity"
              className="hidden md:flex"
            >
              <Activity className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setSettingsOpen(true)}
              data-testid="button-project-settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 md:px-6 pb-3">
          <Tabs value={view} onValueChange={(v) => setView(v as ViewType)}>
            <TabsList className="h-8 md:h-9">
              <TabsTrigger value="board" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-board">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Board</span>
              </TabsTrigger>
              <TabsTrigger value="list" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-list">
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </TabsTrigger>
              <TabsTrigger value="calendar" className="gap-1 md:gap-1.5 text-xs md:text-sm" data-testid="tab-calendar">
                <CalendarIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Calendar</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" onClick={() => handleAddTask()} data-testid="button-add-task">
            <Plus className="h-4 w-4 md:mr-1" />
            <span className="hidden md:inline">Add Task</span>
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
            <div className="flex gap-3 md:gap-4 p-4 md:p-6 h-full overflow-x-auto">
              {displaySections?.map((section) => (
                <SectionColumn
                  key={section.id}
                  section={section}
                  onAddTask={() => handleAddTask(section.id)}
                  onTaskSelect={handleTaskSelect}
                  onTaskStatusChange={handleStatusChange}
                  onEditSection={handleEditSection}
                  onDeleteSection={handleDeleteSection}
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
            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  view="board"
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        )}

        {view === "list" && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="p-4 md:p-6">
              {displaySections?.map((section) => (
                <ListSectionDroppable
                  key={section.id}
                  section={section}
                  onAddTask={() => handleAddTask(section.id)}
                  onTaskSelect={handleTaskSelect}
                  onTaskStatusChange={handleStatusChange}
                />
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
            <DragOverlay>
              {activeTask && (
                <TaskCard
                  task={activeTask}
                  view="list"
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
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
        open={!!selectedTask}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onUpdate={(taskId: string, data: Partial<TaskWithRelations>) => {
          updateTaskMutation.mutate({ taskId, data });
        }}
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
        workspaceId={project?.workspaceId}
      />

      <TaskCreateDrawer
        open={createTaskOpen}
        onOpenChange={setCreateTaskOpen}
        onSubmit={handleCreateTask}
        sections={sections?.map((s) => ({ id: s.id, projectId: s.projectId, name: s.name, orderIndex: s.orderIndex, createdAt: s.createdAt })) || []}
        defaultSectionId={selectedSectionId}
        tenantUsers={tenantUsers}
        isLoading={createTaskMutation.isPending}
      />

      {project && (
        <ProjectSettingsSheet
          project={project}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}

      {project && (
        <ProjectMembersSheet
          project={project}
          open={membersOpen}
          onOpenChange={setMembersOpen}
        />
      )}

      <Sheet open={aiPlannerOpen} onOpenChange={setAiPlannerOpen}>
        <SheetContent className="w-[440px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Project Planner
            </SheetTitle>
          </SheetHeader>
          {project && (
            <div className="mt-4">
              <AIProjectPlanner
                projectName={project.name}
                projectDescription={project.description || undefined}
                onCreateTask={(title) => {
                  const defaultSectionId = sections?.[0]?.id;
                  if (!defaultSectionId) {
                    toast({
                      title: "Cannot create task",
                      description: "Please create a section in the project first",
                      variant: "destructive",
                    });
                    return;
                  }
                  if (projectId) {
                    createTaskMutation.mutate({
                      title,
                      sectionId: defaultSectionId,
                      projectId,
                    });
                  }
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <StartTimerDrawer
        open={timerDrawerOpen}
        onOpenChange={setTimerDrawerOpen}
        initialProjectId={projectId}
        initialClientId={project?.clientId}
      />

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent className="w-[380px] sm:w-[440px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Activity
            </SheetTitle>
          </SheetHeader>
          {projectId && (
            <div className="h-[calc(100vh-120px)] mt-4">
              <ProjectActivityFeed
                projectId={projectId}
                limit={30}
                onTaskClick={(taskId) => {
                  setActivityOpen(false);
                  const task = tasks?.find((t) => t.id === taskId);
                  if (task) setSelectedTask(task);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <SectionNameDialog />
    </div>
  );
}
