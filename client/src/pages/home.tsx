import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  FolderKanban,
  CheckSquare,
  Users,
  TrendingUp,
  Plus,
  ArrowRight,
  Clock,
  AlertTriangle,
  Target,
  Calendar,
  Timer,
  UserCheck,
  AlertCircle,
  Flame,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TaskCard, TaskDetailDrawer } from "@/features/tasks";
import { CreateProjectDialog } from "@/features/projects";
import { TaskProgressBar } from "@/components/task-progress-bar";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import type { Project, TaskWithRelations, Team, Workspace, Client, User } from "@shared/schema";

interface AnalyticsSummary {
  activeProjects: number;
  overdueTasksCount: number;
  dueTodayCount: number;
  unassignedOpenCount: number;
  totalOpenTasks: number;
  projectCompletions: Array<{
    projectId: string;
    projectName: string;
    completionPercent: number;
    openTasks: number;
    totalTasks: number;
  }>;
}

interface EmployeeWorkload {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  next7DaysTasks: number;
  highPriorityTasks: number;
  completionRate: number;
}

interface UnassignedTask {
  id: string;
  title: string;
  priority: string;
  dueDate: string | null;
  projectName: string;
  projectId: string;
}

interface TimeStats {
  total: number;
  billable: number;
  unbillable: number;
}

interface MyTimeStats {
  today: TimeStats;
  thisWeek: TimeStats;
  thisMonth: TimeStats;
  allTime: TimeStats;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getInitials(firstName: string | null, lastName: string | null, email: string): string {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  return email[0].toUpperCase();
}

function AdminDashboardSection({
  analytics,
  analyticsLoading,
  workload,
  workloadLoading,
  unassigned,
  unassignedLoading,
  onTaskClick,
}: {
  analytics?: AnalyticsSummary;
  analyticsLoading: boolean;
  workload?: EmployeeWorkload[];
  workloadLoading: boolean;
  unassigned?: { tasks: UnassignedTask[]; totalCount: number };
  unassignedLoading: boolean;
  onTaskClick: (task: TaskWithRelations) => void;
}) {
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card 
          className="hover-elevate cursor-pointer" 
          onClick={() => setLocation("/projects")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/projects")}
          data-testid="card-active-projects"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{analytics?.activeProjects || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card 
          className="hover-elevate cursor-pointer border-amber-200 dark:border-amber-800" 
          onClick={() => setLocation("/projects")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/projects")}
          data-testid="card-overdue-tasks"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {analytics?.overdueTasksCount || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across all projects</p>
          </CardContent>
        </Card>

        <Card data-testid="card-due-today">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{analytics?.dueTodayCount || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Team-wide deadlines</p>
          </CardContent>
        </Card>

        <Card 
          className="hover-elevate cursor-pointer"
          onClick={() => setLocation("/settings")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/settings")}
          data-testid="card-unassigned"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{analytics?.unassignedOpenCount || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Need assignment</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Team Workload</CardTitle>
              <CardDescription>Task distribution by team member</CardDescription>
            </div>
            <Link href="/settings">
              <Button variant="ghost" size="sm" data-testid="link-view-workload">
                View all
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {workloadLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : workload && workload.length > 0 ? (
              <div className="space-y-3">
                {workload.slice(0, 5).map((employee) => (
                  <div
                    key={employee.userId}
                    className="flex items-center gap-3 p-2 rounded-lg"
                    data-testid={`workload-employee-${employee.userId}`}
                  >
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={employee.avatarUrl || undefined} />
                      <AvatarFallback className="text-xs">
                        {getInitials(employee.firstName, employee.lastName, employee.email)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">
                          {employee.firstName && employee.lastName
                            ? `${employee.firstName} ${employee.lastName}`
                            : employee.email}
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {employee.openTasks} open
                          </span>
                          {employee.overdueTasks > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              {employee.overdueTasks} overdue
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress 
                          value={employee.completionRate} 
                          className="h-1.5 flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-8">
                          {employee.completionRate}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No team members with tasks</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className={unassigned && unassigned.totalCount > 0 ? "border-amber-200 dark:border-amber-800" : ""}>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                Needs Attention
                {unassigned && unassigned.totalCount > 0 && (
                  <Badge variant="secondary" className="ml-1">
                    {unassigned.totalCount}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>Unassigned tasks needing owners</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {unassignedLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : unassigned && unassigned.tasks.length > 0 ? (
              <div className="space-y-2">
                {unassigned.tasks.slice(0, 5).map((task) => (
                  <Link 
                    key={task.id} 
                    href={`/projects/${task.projectId}`}
                  >
                    <div
                      className="flex items-center gap-3 p-2 rounded-lg hover-elevate cursor-pointer"
                      data-testid={`unassigned-task-${task.id}`}
                    >
                      <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {task.projectName}
                        </p>
                      </div>
                      {task.priority === "urgent" || task.priority === "high" ? (
                        <Badge variant="destructive" className="shrink-0">
                          {task.priority}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="shrink-0">
                          {task.priority}
                        </Badge>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckSquare className="h-8 w-8 text-green-500 mb-2" />
                <p className="text-sm text-muted-foreground">All tasks are assigned</p>
                <p className="text-xs text-muted-foreground mt-1">Great job keeping the team organized</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function EmployeeDashboardSection({
  myTasks,
  tasksLoading,
  timeStats,
  timeStatsLoading,
  onTaskClick,
}: {
  myTasks?: TaskWithRelations[];
  tasksLoading: boolean;
  timeStats?: MyTimeStats;
  timeStatsLoading: boolean;
  onTaskClick: (task: TaskWithRelations) => void;
}) {
  const [, setLocation] = useLocation();

  const taskBreakdown = useMemo(() => {
    const tasks = myTasks || [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next7Days = new Date(today);
    next7Days.setDate(next7Days.getDate() + 7);

    const openTasks = tasks.filter(t => t.status !== "done");
    
    const overdue = openTasks.filter(t => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate < today;
    });

    const dueToday = openTasks.filter(t => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate.getTime() === today.getTime();
    });

    const upcoming = openTasks.filter(t => {
      if (!t.dueDate) return false;
      const dueDate = new Date(t.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      return dueDate >= tomorrow && dueDate <= next7Days;
    });

    const highPriority = openTasks.filter(t => 
      t.priority === "high" || t.priority === "urgent"
    );

    const completedToday = tasks.filter(t => {
      if (t.status !== "done" || !t.updatedAt) return false;
      const updated = new Date(t.updatedAt);
      updated.setHours(0, 0, 0, 0);
      return updated.getTime() === today.getTime();
    });

    return {
      overdue,
      dueToday,
      upcoming,
      highPriority,
      completedToday,
      totalOpen: openTasks.length,
    };
  }, [myTasks]);

  const focusTasks = useMemo(() => {
    return [...taskBreakdown.overdue, ...taskBreakdown.dueToday].slice(0, 5);
  }, [taskBreakdown]);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-4">
        <Card 
          className={`hover-elevate cursor-pointer ${taskBreakdown.overdue.length > 0 ? "border-red-200 dark:border-red-800" : ""}`}
          onClick={() => setLocation("/my-tasks")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/my-tasks")}
          data-testid="card-overdue"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${taskBreakdown.overdue.length > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className={`text-2xl font-bold ${taskBreakdown.overdue.length > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {taskBreakdown.overdue.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Need immediate attention</p>
          </CardContent>
        </Card>

        <Card 
          className="hover-elevate cursor-pointer"
          onClick={() => setLocation("/my-tasks")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/my-tasks")}
          data-testid="card-due-today"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due Today</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{taskBreakdown.dueToday.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Today's focus</p>
          </CardContent>
        </Card>

        <Card 
          className="hover-elevate cursor-pointer"
          onClick={() => setLocation("/my-time")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/my-time")}
          data-testid="card-time-today"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Time Today</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {timeStatsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {timeStats ? formatDuration(timeStats.today.total) : "0m"}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {timeStats && timeStats.thisWeek.total > 0 
                ? `${formatDuration(timeStats.thisWeek.total)} this week` 
                : "Start tracking"}
            </p>
          </CardContent>
        </Card>

        <Card 
          className="hover-elevate cursor-pointer"
          onClick={() => setLocation("/my-tasks")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setLocation("/my-tasks")}
          data-testid="card-completed-today"
        >
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {taskBreakdown.completedToday.length}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Completed today</p>
          </CardContent>
        </Card>
      </div>

      {(taskBreakdown.overdue.length > 0 || taskBreakdown.dueToday.length > 0) && (
        <Card className="border-amber-200 dark:border-amber-800">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-amber-500" />
              <CardTitle>Today's Focus</CardTitle>
              {taskBreakdown.overdue.length > 0 && (
                <Badge variant="destructive">
                  {taskBreakdown.overdue.length} overdue
                </Badge>
              )}
            </div>
            <Link href="/my-tasks">
              <Button variant="ghost" size="sm" data-testid="link-view-my-tasks">
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
            ) : focusTasks.length > 0 ? (
              <div>
                {focusTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    view="list"
                    onSelect={() => onTaskClick(task)}
                    data-testid={`focus-task-${task.id}`}
                  />
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <CardDescription>Next 7 days</CardDescription>
            </div>
            <Link href="/my-tasks">
              <Button variant="ghost" size="sm" data-testid="link-view-upcoming">
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
            ) : taskBreakdown.upcoming.length > 0 ? (
              <div>
                {taskBreakdown.upcoming.slice(0, 5).map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    view="list"
                    onSelect={() => onTaskClick(task)}
                    data-testid={`upcoming-task-${task.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Your schedule looks clear for the next week
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Time This Week</CardTitle>
              <CardDescription>Your productivity breakdown</CardDescription>
            </div>
            <Link href="/my-time">
              <Button variant="ghost" size="sm" data-testid="link-view-time">
                Details
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {timeStatsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : timeStats ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Today</span>
                  <span className="text-sm font-medium">{formatDuration(timeStats.today.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">This Week</span>
                  <span className="text-sm font-medium">{formatDuration(timeStats.thisWeek.total)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">This Month</span>
                  <span className="text-sm font-medium">{formatDuration(timeStats.thisMonth.total)}</span>
                </div>
                {timeStats.thisWeek.total > 0 && (
                  <div className="pt-2 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground">Billable this week</span>
                      <span className="text-xs font-medium">
                        {timeStats.thisWeek.total > 0 
                          ? Math.round((timeStats.thisWeek.billable / timeStats.thisWeek.total) * 100) 
                          : 0}%
                      </span>
                    </div>
                    <Progress 
                      value={timeStats.thisWeek.total > 0 
                        ? (timeStats.thisWeek.billable / timeStats.thisWeek.total) * 100 
                        : 0} 
                      className="h-2"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Clock className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No time tracked yet</p>
                <Link href="/my-time">
                  <Button variant="outline" size="sm" className="mt-3" data-testid="button-start-tracking">
                    Start tracking
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);

  const isAdmin = user?.role === "admin" || user?.role === "super_user";

  const { data: projects, isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: myTasks, isLoading: tasksLoading } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/tasks/my"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: currentWorkspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsSummary>({
    queryKey: ["/api/v1/projects/analytics/summary"],
    enabled: !!user && isAdmin,
  });

  const { data: workload, isLoading: workloadLoading } = useQuery<EmployeeWorkload[]>({
    queryKey: ["/api/v1/workload/tasks-by-employee"],
    enabled: !!user && isAdmin,
  });

  const { data: unassigned, isLoading: unassignedLoading } = useQuery<{ tasks: UnassignedTask[]; totalCount: number }>({
    queryKey: ["/api/v1/workload/unassigned"],
    enabled: !!user && isAdmin,
  });

  const { data: timeStats, isLoading: timeStatsLoading } = useQuery<MyTimeStats>({
    queryKey: ["/api/time-entries/my/stats"],
    enabled: !!user && !isAdmin,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects/analytics/summary"] });
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

  const taskStats = useMemo(() => {
    const allTasks = myTasks || [];
    return {
      total: allTasks.length,
      done: allTasks.filter(t => t.status === "done").length,
      inProgress: allTasks.filter(t => t.status === "in_progress").length,
      todo: allTasks.filter(t => t.status === "todo").length,
      blocked: allTasks.filter(t => t.status === "blocked").length,
    };
  }, [myTasks]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="border-b border-border bg-background sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              {greeting}{user?.firstName ? `, ${user.firstName}` : ""}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {isAdmin 
                ? "Here's an overview of your team's activity" 
                : "Here's what's on your plate today"}
            </p>
          </div>
          {isAdmin && (
            <Button
              onClick={() => setCreateProjectOpen(true)}
              data-testid="button-new-project-header"
            >
              <Plus className="mr-1 h-4 w-4" />
              New Project
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 md:p-6 space-y-4 md:space-y-6">
        {isAdmin ? (
          <AdminDashboardSection
            analytics={analytics}
            analyticsLoading={analyticsLoading}
            workload={workload}
            workloadLoading={workloadLoading}
            unassigned={unassigned}
            unassignedLoading={unassignedLoading}
            onTaskClick={handleTaskClick}
          />
        ) : (
          <EmployeeDashboardSection
            myTasks={myTasks}
            tasksLoading={tasksLoading}
            timeStats={timeStats}
            timeStatsLoading={timeStatsLoading}
            onTaskClick={handleTaskClick}
          />
        )}

        {taskStats.total > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Your Task Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <TaskProgressBar stats={taskStats} showMilestones />
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {!isAdmin && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle>My Tasks</CardTitle>
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
                ) : myTasks && myTasks.length > 0 ? (
                  <div>
                    {myTasks.slice(0, 5).map((task) => (
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
                    <p className="text-sm text-muted-foreground">No tasks assigned</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tasks assigned to you will appear here
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className={isAdmin ? "lg:col-span-2" : ""}>
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
                <div className={`grid gap-2 ${isAdmin ? "md:grid-cols-2 lg:grid-cols-3" : ""}`}>
                  {projects.slice(0, isAdmin ? 6 : 5).map((project) => (
                    <Link
                      key={project.id}
                      href={`/projects/${project.id}`}
                    >
                      <div
                        className="flex items-center gap-3 p-3 rounded-lg hover-elevate cursor-pointer"
                        data-testid={`project-item-${project.id}`}
                      >
                        <div
                          className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-medium shrink-0"
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
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
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
        onAddComment={(taskId: string, body: string) => {
          addCommentMutation.mutate({ taskId, body });
        }}
        workspaceId={selectedTask?.project?.workspaceId || currentWorkspace?.id}
      />
    </div>
  );
}
