import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Link } from "wouter";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FolderKanban,
  Users,
  Briefcase,
  Clock,
  CheckSquare,
  ExternalLink,
  Settings,
  Shield,
  Calendar,
  BarChart3,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Project, Client, Team, TaskWithRelations } from "@shared/schema";

interface ProjectDetailDrawerProps {
  project: Project | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectDetailDrawer({ project, open, onOpenChange }: ProjectDetailDrawerProps) {
  const { user } = useAuth();
  const isSuperUser = user?.role === "super_user";
  const [activeTab, setActiveTab] = useState("overview");

  const { data: projectDetails, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", project?.id],
    enabled: !!project?.id && open,
  });

  const { data: tasks } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", project?.id, "tasks"],
    enabled: !!project?.id && open,
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
    enabled: open,
  });

  const currentProject = projectDetails || project;

  if (!currentProject) return null;

  const client = clients?.find(c => c.id === currentProject.clientId);
  const team = teams?.find(t => t.id === currentProject.teamId);

  const openTasks = tasks?.filter(t => t.status !== "done") || [];
  const completedTasks = tasks?.filter(t => t.status === "done") || [];
  const overdueTasks = openTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto" data-testid="drawer-project-detail">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="h-6 w-6 rounded-md shrink-0"
                style={{ backgroundColor: currentProject.color || "#3B82F6" }}
              />
              <div>
                <SheetTitle className="text-xl">{currentProject.name}</SheetTitle>
                {currentProject.description && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {currentProject.description}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={currentProject.status === "archived" ? "secondary" : "default"}>
                {currentProject.status === "archived" ? "Archived" : "Active"}
              </Badge>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/projects/${currentProject.id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Open Project
                </Link>
              </Button>
            </div>
          </div>
        </SheetHeader>

        <Separator className="my-4" />

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
            {isSuperUser && (
              <TabsTrigger value="admin" data-testid="tab-admin">Admin Tools</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="overview" className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Briefcase className="h-4 w-4" />
                    Client
                  </div>
                  <div className="font-medium">
                    {client ? (
                      <Link 
                        href={`/clients/${client.id}`} 
                        className="text-primary hover:underline"
                      >
                        {client.companyName}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">No client assigned</span>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                    <Users className="h-4 w-4" />
                    Team
                  </div>
                  <div className="font-medium">
                    {team?.name || <span className="text-muted-foreground">No team assigned</span>}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-primary">{openTasks.length}</div>
                  <div className="text-xs text-muted-foreground">Open Tasks</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{completedTasks.length}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-destructive">{overdueTasks.length}</div>
                  <div className="text-xs text-muted-foreground">Overdue</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Timeline
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Created</span>
                  <span>{format(new Date(currentProject.createdAt), "MMM d, yyyy")}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Last Updated</span>
                  <span>{format(new Date(currentProject.updatedAt), "MMM d, yyyy")}</span>
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" asChild>
                <Link href={`/projects/${currentProject.id}`}>
                  <FolderKanban className="h-4 w-4 mr-2" />
                  View Board
                </Link>
              </Button>
              {currentProject.clientId && (
                <Button variant="outline" className="flex-1" asChild>
                  <Link href={`/clients/${currentProject.clientId}`}>
                    <Briefcase className="h-4 w-4 mr-2" />
                    View Client
                  </Link>
                </Button>
              )}
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="mt-4">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : tasks && tasks.length > 0 ? (
              <div className="space-y-2">
                {openTasks.slice(0, 10).map((task) => (
                  <Card key={task.id} className="hover-elevate cursor-pointer">
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckSquare className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{task.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {task.dueDate && (
                            <span className={`text-xs ${new Date(task.dueDate) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {format(new Date(task.dueDate), "MMM d")}
                            </span>
                          )}
                          <Badge variant="outline" className="text-xs">
                            {task.status}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {openTasks.length > 10 && (
                  <p className="text-sm text-muted-foreground text-center py-2">
                    +{openTasks.length - 10} more open tasks
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <CheckSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No tasks in this project</p>
              </div>
            )}
          </TabsContent>

          {isSuperUser && (
            <TabsContent value="admin" className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Admin Tools
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Project Identifiers</h4>
                    <div className="bg-muted rounded-md p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Project ID</span>
                        <code className="text-xs bg-background px-2 py-0.5 rounded">
                          {currentProject.id}
                        </code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tenant ID</span>
                        <code className="text-xs bg-background px-2 py-0.5 rounded">
                          {currentProject.tenantId || "N/A"}
                        </code>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Workspace ID</span>
                        <code className="text-xs bg-background px-2 py-0.5 rounded">
                          {currentProject.workspaceId}
                        </code>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Quick Actions</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/projects/${currentProject.id}`}>
                          <FolderKanban className="h-4 w-4 mr-2" />
                          Open Tasks
                        </Link>
                      </Button>
                      {currentProject.clientId && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/clients/${currentProject.clientId}`}>
                            <Briefcase className="h-4 w-4 mr-2" />
                            View Client
                          </Link>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/time-tracking">
                          <Clock className="h-4 w-4 mr-2" />
                          Time Tracking
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link href="/settings/reports">
                          <BarChart3 className="h-4 w-4 mr-2" />
                          Reports
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Statistics</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="bg-muted rounded-md p-2">
                        <span className="text-muted-foreground">Total Tasks:</span>
                        <span className="ml-2 font-medium">{tasks?.length || 0}</span>
                      </div>
                      <div className="bg-muted rounded-md p-2">
                        <span className="text-muted-foreground">Completion:</span>
                        <span className="ml-2 font-medium">
                          {tasks && tasks.length > 0 
                            ? Math.round((completedTasks.length / tasks.length) * 100) 
                            : 0}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
