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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
  AlertTriangle,
  TrendingUp,
  User,
  CircleOff,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import type { Project, Client, Team, TaskWithRelations } from "@shared/schema";

interface ProjectAnalytics {
  projectId: string;
  metrics: {
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    dueToday: number;
    unassignedOpenTasks: number;
    totalTasks: number;
    completionPercent: number;
  };
  byStatus: Array<{ status: string; count: number }>;
  byPriority: Array<{ priority: string; count: number }>;
  dueTimeline: Array<{ date: string; count: number }>;
  byAssignee: Array<{ userId: string; name: string; count: number }>;
  overdueTasksList: Array<{ id: string; title: string; dueDate: string | null; priority: string | null; status: string }>;
  dueTodayTasksList: Array<{ id: string; title: string; dueDate: string | null; priority: string | null; status: string }>;
}

const COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"];
const STATUS_COLORS: Record<string, string> = {
  "todo": "#9CA3AF",
  "in_progress": "#3B82F6",
  "in_review": "#F59E0B",
  "done": "#10B981",
};
const PRIORITY_COLORS: Record<string, string> = {
  "urgent": "#EF4444",
  "high": "#F97316",
  "medium": "#F59E0B",
  "low": "#10B981",
  "none": "#9CA3AF",
};

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

  const { data: analytics, isLoading: analyticsLoading } = useQuery<ProjectAnalytics>({
    queryKey: ["/api/v1/projects", project?.id, "analytics"],
    enabled: !!project?.id && open && activeTab === "insights",
    staleTime: 30000,
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
          <TabsList className={`grid w-full ${isSuperUser ? "grid-cols-4" : "grid-cols-3"}`}>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">Tasks</TabsTrigger>
            <TabsTrigger value="insights" data-testid="tab-insights">Insights</TabsTrigger>
            {isSuperUser && (
              <TabsTrigger value="admin" data-testid="tab-admin">Admin</TabsTrigger>
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

          <TabsContent value="insights" className="mt-4 space-y-4">
            {analyticsLoading ? (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-20 w-full" />
                  ))}
                </div>
                <Skeleton className="h-48 w-full" />
              </div>
            ) : analytics ? (
              <>
                <div className="grid grid-cols-3 gap-3" data-testid="insights-metrics-row-1">
                  <Card data-testid="card-metric-open-tasks">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="text-xl font-bold text-primary" data-testid="text-open-tasks">{analytics.metrics.openTasks}</div>
                      <div className="text-xs text-muted-foreground">Open Tasks</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-completed">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="text-xl font-bold text-green-600 dark:text-green-500" data-testid="text-completed-tasks">{analytics.metrics.completedTasks}</div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-overdue">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="text-xl font-bold text-destructive" data-testid="text-overdue-tasks">{analytics.metrics.overdueTasks}</div>
                      <div className="text-xs text-muted-foreground">Overdue</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-3 gap-3" data-testid="insights-metrics-row-2">
                  <Card data-testid="card-metric-due-today">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="text-xl font-bold" data-testid="text-due-today">{analytics.metrics.dueToday}</div>
                      <div className="text-xs text-muted-foreground">Due Today</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-unassigned">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="text-xl font-bold" data-testid="text-unassigned-tasks">{analytics.metrics.unassignedOpenTasks}</div>
                      <div className="text-xs text-muted-foreground">Unassigned</div>
                    </CardContent>
                  </Card>
                  <Card data-testid="card-metric-completion">
                    <CardContent className="pt-3 pb-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Progress value={analytics.metrics.completionPercent} className="h-2 w-12" data-testid="progress-completion" />
                        <span className="text-sm font-bold" data-testid="text-completion-percent">{analytics.metrics.completionPercent}%</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">Completion</div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid grid-cols-2 gap-4" data-testid="insights-charts-row">
                  <Card data-testid="card-chart-status">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Tasks by Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[150px]" data-testid="chart-status-pie">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={analytics.byStatus}
                              cx="50%"
                              cy="50%"
                              innerRadius={30}
                              outerRadius={50}
                              paddingAngle={2}
                              dataKey="count"
                              nameKey="status"
                            >
                              {analytics.byStatus.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value, name) => [value, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2 justify-center" data-testid="legend-status">
                        {analytics.byStatus.map((s, i) => (
                          <div key={s.status} className="flex items-center gap-1 text-xs" data-testid={`legend-item-status-${s.status}`}>
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: STATUS_COLORS[s.status] || COLORS[i % COLORS.length] }} 
                            />
                            <span className="capitalize">{s.status.replace("_", " ")}</span>
                            <span className="text-muted-foreground">({s.count})</span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>

                  <Card data-testid="card-chart-priority">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Tasks by Priority</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[150px]" data-testid="chart-priority-bar">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={analytics.byPriority} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis type="number" className="text-xs" />
                            <YAxis dataKey="priority" type="category" className="text-xs" width={50} />
                            <Tooltip />
                            <Bar dataKey="count">
                              {analytics.byPriority.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={PRIORITY_COLORS[entry.priority] || COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {analytics.dueTimeline.some(d => d.count > 0) && (
                  <Card data-testid="card-chart-timeline">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">Due Date Timeline (Next 14 Days)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="h-[120px]" data-testid="chart-timeline-line">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={analytics.dueTimeline}>
                            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                            <XAxis 
                              dataKey="date" 
                              className="text-xs" 
                              tickFormatter={(v) => format(new Date(v), "MMM d")}
                            />
                            <YAxis className="text-xs" />
                            <Tooltip 
                              labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
                            />
                            <Line type="monotone" dataKey="count" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {analytics.byAssignee.length > 0 && (
                  <Card data-testid="card-workload-assignee">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Workload by Assignee (Top 5)
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2" data-testid="list-workload-assignees">
                        {analytics.byAssignee.map((assignee) => (
                          <div key={assignee.userId} className="flex items-center justify-between" data-testid={`row-assignee-${assignee.userId}`}>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm" data-testid={`text-assignee-name-${assignee.userId}`}>{assignee.name}</span>
                            </div>
                            <Badge variant="secondary" data-testid={`badge-assignee-count-${assignee.userId}`}>{assignee.count} tasks</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {analytics.overdueTasksList.length > 0 && (
                  <Card data-testid="card-overdue-tasks">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        Overdue Tasks
                      </CardTitle>
                      <CardDescription>Tasks past their due date</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2" data-testid="list-overdue-tasks">
                        {analytics.overdueTasksList.map((task) => (
                          <div key={task.id} className="flex items-center justify-between py-1" data-testid={`row-overdue-task-${task.id}`}>
                            <span className="text-sm truncate flex-1 mr-2" data-testid={`text-overdue-task-title-${task.id}`}>{task.title}</span>
                            <div className="flex items-center gap-2">
                              {task.dueDate && (
                                <span className="text-xs text-destructive" data-testid={`text-overdue-task-date-${task.id}`}>
                                  {format(new Date(task.dueDate), "MMM d")}
                                </span>
                              )}
                              {task.priority && task.priority !== "none" && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${task.priority === "urgent" ? "border-red-500" : task.priority === "high" ? "border-orange-500" : task.priority === "medium" ? "border-yellow-500" : "border-green-500"}`}
                                  data-testid={`badge-overdue-task-priority-${task.id}`}
                                >
                                  {task.priority}
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                        {analytics.metrics.overdueTasks > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2" data-testid="text-overdue-more">
                            +{analytics.metrics.overdueTasks - 10} more overdue tasks
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {analytics.dueTodayTasksList.length > 0 && (
                  <Card data-testid="card-due-today-tasks">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Clock className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                        Due Today
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2" data-testid="list-due-today-tasks">
                        {analytics.dueTodayTasksList.map((task) => (
                          <div key={task.id} className="flex items-center justify-between py-1" data-testid={`row-due-today-task-${task.id}`}>
                            <span className="text-sm truncate flex-1 mr-2" data-testid={`text-due-today-task-title-${task.id}`}>{task.title}</span>
                            <div className="flex items-center gap-2">
                              {task.priority && task.priority !== "none" && (
                                <Badge 
                                  variant="outline" 
                                  className={`text-xs ${task.priority === "urgent" ? "border-red-500" : task.priority === "high" ? "border-orange-500" : task.priority === "medium" ? "border-yellow-500" : "border-green-500"}`}
                                  data-testid={`badge-due-today-task-priority-${task.id}`}
                                >
                                  {task.priority}
                                </Badge>
                              )}
                              <Badge variant="outline" className="text-xs" data-testid={`badge-due-today-task-status-${task.id}`}>
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        ))}
                        {analytics.metrics.dueToday > 10 && (
                          <p className="text-xs text-muted-foreground text-center pt-2" data-testid="text-due-today-more">
                            +{analytics.metrics.dueToday - 10} more tasks due today
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Analytics unavailable</p>
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
