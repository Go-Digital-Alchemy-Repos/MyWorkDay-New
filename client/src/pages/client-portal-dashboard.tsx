import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  FolderKanban,
  CheckSquare,
  Clock,
  AlertCircle,
  ArrowRight,
  Calendar,
  TrendingUp,
  FileText,
  MessageSquare,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow, format, isToday, isTomorrow, isPast } from "date-fns";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface ProjectInfo {
  id: string;
  name: string;
  description: string | null;
  status: string;
  clientId: string;
}

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
}

interface DashboardStats {
  totalProjects: number;
  activeProjects: number;
  totalTasks: number;
  completedTasks: number;
  overdueTasks: number;
}

interface DashboardData {
  clients: ClientInfo[];
  projects: ProjectInfo[];
  tasks: TaskInfo[];
  upcomingDeadlines: TaskInfo[];
  stats: DashboardStats;
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
    case "active":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "on_hold":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDueDate(dateStr: string) {
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isPast(date)) return formatDistanceToNow(date, { addSuffix: true });
  return format(date, "MMM d");
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    </div>
  );
}

export default function ClientPortalDashboard() {
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });

  if (isLoading) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome to your client portal</p>
        </div>
        <DashboardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Dashboard
            </CardTitle>
            <CardDescription>
              There was a problem loading your dashboard data. Please try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const stats = data?.stats || {
    totalProjects: 0,
    activeProjects: 0,
    totalTasks: 0,
    completedTasks: 0,
    overdueTasks: 0,
  };

  const completionRate = stats.totalTasks > 0 
    ? Math.round((stats.completedTasks / stats.totalTasks) * 100) 
    : 0;

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to your client portal. Track your projects and tasks here.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-active-projects">
              {stats.activeProjects}
            </div>
            <p className="text-xs text-muted-foreground">
              of {stats.totalProjects} total projects
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Tasks</CardTitle>
            <CheckSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-open-tasks">
              {stats.totalTasks - stats.completedTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.completedTasks} completed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-completion-rate">
              {completionRate}%
            </div>
            <div className="mt-1 h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.overdueTasks > 0 ? 'text-destructive' : ''}`} data-testid="stat-overdue-tasks">
              {stats.overdueTasks}
            </div>
            <p className="text-xs text-muted-foreground">
              {stats.overdueTasks > 0 ? 'Needs attention' : 'All on track'}
            </p>
          </CardContent>
        </Card>
      </div>

      {stats.totalProjects === 0 && stats.totalTasks === 0 && (
        <div className="mb-6 animate-tab-in">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Getting Started</CardTitle>
              <CardDescription>Here's what you can do in your portal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Link href="/portal/projects">
                  <div className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer" data-testid="guide-card-projects">
                    <FolderKanban className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">View Projects</span>
                    <span className="text-xs text-muted-foreground">Track progress on your active projects</span>
                  </div>
                </Link>
                <Link href="/portal/approvals">
                  <div className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer" data-testid="guide-card-approvals">
                    <ClipboardCheck className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">Approvals</span>
                    <span className="text-xs text-muted-foreground">Review and approve deliverables</span>
                  </div>
                </Link>
                <Link href="/portal/messages">
                  <div className="flex flex-col items-center gap-2 p-4 rounded-md hover-elevate text-center cursor-pointer" data-testid="guide-card-messages">
                    <MessageSquare className="h-6 w-6 text-muted-foreground" />
                    <span className="text-sm font-medium">Messages</span>
                    <span className="text-xs text-muted-foreground">Communicate with your team</span>
                  </div>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Upcoming Deadlines</CardTitle>
              <CardDescription>Tasks due in the next 14 days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/tasks" data-testid="link-view-all-tasks">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.upcomingDeadlines && data.upcomingDeadlines.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingDeadlines.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between p-3 rounded-lg border bg-card"
                    data-testid={`deadline-task-${task.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{task.title}</div>
                      <div className="text-sm text-muted-foreground truncate">
                        {task.projectName}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className={getPriorityColor(task.priority)}>
                          {task.priority}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(task.status)}>
                          {task.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground ml-4 whitespace-nowrap">
                      <Calendar className="h-3 w-3" />
                      {task.dueDate ? formatDueDate(task.dueDate) : "No date"}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <Calendar className="h-8 w-8 mb-2 opacity-50" />
                <p>No upcoming deadlines</p>
                <p className="text-sm">All tasks are on schedule</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your active projects</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/portal/projects" data-testid="link-view-all-projects">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data?.projects && data.projects.length > 0 ? (
              <div className="space-y-3">
                {data.projects.slice(0, 5).map((project) => (
                  <Link
                    key={project.id}
                    href={`/portal/projects/${project.id}`}
                    data-testid={`project-card-${project.id}`}
                  >
                    <div className="flex items-center justify-between p-3 rounded-lg border bg-card hover-elevate cursor-pointer">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{project.name}</div>
                        {project.description && (
                          <div className="text-sm text-muted-foreground truncate">
                            {project.description}
                          </div>
                        )}
                      </div>
                      <Badge variant="outline" className={getStatusColor(project.status)}>
                        {project.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                <FolderKanban className="h-8 w-8 mb-2 opacity-50" />
                <p>No projects yet</p>
                <p className="text-sm">Projects will appear here when created</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
