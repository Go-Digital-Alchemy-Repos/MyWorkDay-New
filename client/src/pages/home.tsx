import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FolderKanban,
  CheckSquare,
  Users,
  TrendingUp,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskCard, TaskDetailDrawer } from "@/features/tasks";
import { CreateProjectDialog } from "@/features/projects";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Project, TaskWithRelations, Team, Workspace, Client } from "@shared/schema";

export default function Home() {
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: myTasks, isLoading: tasksLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks/my"],
  });

  const { data: teams, isLoading: teamsLoading } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setCreateProjectOpen(false);
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

  const handleCreateProject = (data: any) => {
    createProjectMutation.mutate(data);
  };

  const handleTaskClick = (task: TaskWithRelations) => {
    setSelectedTask(task);
  };

  const upcomingTasks = myTasks?.slice(0, 5) || [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Welcome back</h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Here's what's happening with your projects today
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="grid gap-3 md:gap-4 grid-cols-2 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <FolderKanban className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{projects?.length || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Tasks</CardTitle>
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {tasksLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{myTasks?.length || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Teams</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {teamsLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{teams?.length || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card className="hover-elevate cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Today</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {myTasks?.filter((t) => t.status === "done").length || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Upcoming Tasks</CardTitle>
              <Link href="/my-tasks">
                <Button variant="ghost" size="sm" data-testid="link-view-all-tasks">
                  View all
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {tasksLoading ? (
                <div className="space-y-3 p-4">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : upcomingTasks.length > 0 ? (
                <div>
                  {upcomingTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      view="list"
                      onSelect={() => handleTaskClick(task)}
                      data-testid={`dashboard-task-${task.id}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckSquare className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No upcoming tasks</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tasks assigned to you will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Recent Projects</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreateProjectOpen(true)}
                data-testid="button-new-project"
              >
                <Plus className="mr-1 h-4 w-4" />
                New
              </Button>
            </CardHeader>
            <CardContent>
              {projectsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : projects && projects.length > 0 ? (
                <div className="space-y-2">
                  {projects.slice(0, 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                    >
                      <div
                        className="flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                        data-testid={`project-item-${project.id}`}
                      >
                        <div
                          className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-medium"
                          style={{ backgroundColor: project.color || "#3B82F6" }}
                        >
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{project.name}</p>
                          {project.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {project.description}
                            </p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <FolderKanban className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No projects yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => setCreateProjectOpen(true)}
                    data-testid="button-create-first-project"
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Create your first project
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        teams={teams}
        clients={clients}
        isPending={createProjectMutation.isPending}
      />

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
