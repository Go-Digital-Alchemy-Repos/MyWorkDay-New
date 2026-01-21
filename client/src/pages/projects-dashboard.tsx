import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FolderKanban, Search, Filter, Calendar, Users, CheckSquare, AlertTriangle, Clock, CircleOff, DollarSign, Plus } from "lucide-react";
import { ProjectDetailDrawer } from "@/components/project-detail-drawer";
import { CreateProjectDialog } from "@/components/create-project-dialog";
import { useToast } from "@/hooks/use-toast";
import type { Project, Client, Team } from "@shared/schema";
import { format } from "date-fns";

interface ProjectWithCounts extends Project {
  openTaskCount?: number;
}

interface ProjectAnalyticsSummary {
  totals: {
    activeProjects: number;
    projectsWithOverdue: number;
    tasksDueToday: number;
    unassignedOpenTasks: number;
    totalOpenTasks: number;
    totalOverdueTasks: number;
  };
  perProject: Array<{
    projectId: string;
    openTasks: number;
    completedTasks: number;
    overdueTasks: number;
    dueToday: number;
    completionPercent: number;
    lastActivityAt: string | null;
  }>;
}

interface ForecastSummary {
  perProject: Array<{
    projectId: string;
    trackedMinutesTotal: number;
    taskEstimateMinutes: number;
    budgetMinutes: number | null;
    overBudget: boolean | null;
    remainingEstimateMinutes: number | null;
  }>;
}

export default function ProjectsDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<ProjectWithCounts | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const { toast } = useToast();

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithCounts[]>({
    queryKey: ["/api/v1/projects", { includeCounts: true }],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<ProjectAnalyticsSummary>({
    queryKey: ["/api/v1/projects/analytics/summary"],
    staleTime: 30000,
  });

  const { data: forecastSummary } = useQuery<ForecastSummary>({
    queryKey: ["/api/v1/projects/forecast/summary"],
    staleTime: 30000,
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      setCreateProjectOpen(false);
      toast({ title: "Project created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const handleCreateProject = (data: any) => {
    createProjectMutation.mutate(data);
  };

  const getProjectStats = (projectId: string) => {
    if (!analytics?.perProject) return null;
    return analytics.perProject.find(p => p.projectId === projectId);
  };

  const getProjectForecast = (projectId: string) => {
    if (!forecastSummary?.perProject) return null;
    return forecastSummary.perProject.find(p => p.projectId === projectId);
  };

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    
    return projects.filter((project) => {
      const matchesSearch = !searchQuery || 
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const isArchived = project.status === "archived";
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "active" && !isArchived) ||
        (statusFilter === "archived" && isArchived);
      
      const matchesClient = clientFilter === "all" || project.clientId === clientFilter;
      
      const matchesTeam = teamFilter === "all" || project.teamId === teamFilter;
      
      return matchesSearch && matchesStatus && matchesClient && matchesTeam;
    });
  }, [projects, searchQuery, statusFilter, clientFilter, teamFilter]);

  const handleRowClick = (project: ProjectWithCounts) => {
    setSelectedProject(project);
    setDrawerOpen(true);
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return "-";
    const client = clients.find(c => c.id === clientId);
    return client?.companyName || "-";
  };

  const getTeamName = (teamId: string | null) => {
    if (!teamId || !teams) return "-";
    const team = teams.find(t => t.id === teamId);
    return team?.name || "-";
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-7xl mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <FolderKanban className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Projects</h1>
              <p className="text-muted-foreground text-sm">
                View and manage all projects across your workspace
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateProjectOpen(true)} data-testid="button-new-project">
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {analytics?.totals && (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4 mb-6">
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  <span className="text-sm text-muted-foreground">Active Projects</span>
                </div>
                <div className="text-2xl font-bold mt-1">{analytics.totals.activeProjects}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <span className="text-sm text-muted-foreground">Projects at Risk</span>
                </div>
                <div className="text-2xl font-bold mt-1 text-destructive">
                  {analytics.totals.projectsWithOverdue}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="text-sm text-muted-foreground">Due Today</span>
                </div>
                <div className="text-2xl font-bold mt-1">{analytics.totals.tasksDueToday}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2">
                  <CircleOff className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Unassigned Tasks</span>
                </div>
                <div className="text-2xl font-bold mt-1">{analytics.totals.unassignedOpenTasks}</div>
              </CardContent>
            </Card>
          </div>
        )}

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="input-search-projects"
              />
            </div>
            
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>

              <Select value={clientFilter} onValueChange={setClientFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-client-filter">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients?.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="w-[150px]" data-testid="select-team-filter">
                  <SelectValue placeholder="Team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Teams</SelectItem>
                  {teams?.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {projectsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No projects found</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery || statusFilter !== "all" || clientFilter !== "all" || teamFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first project to get started"}
            </p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Project Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Open
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                      Overdue
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      Today
                    </div>
                  </TableHead>
                  <TableHead className="w-[100px]">Progress</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <DollarSign className="h-3.5 w-3.5" />
                      Budget
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Activity
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer hover-elevate"
                    onClick={() => handleRowClick(project)}
                    data-testid={`row-project-${project.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div
                          className="h-3 w-3 rounded-sm shrink-0"
                          style={{ backgroundColor: project.color || "#3B82F6" }}
                        />
                        <div className="min-w-0">
                          <div className="font-medium truncate">{project.name}</div>
                          {project.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">
                              {project.description}
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getClientName(project.clientId)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{getTeamName(project.teamId)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={project.status === "archived" ? "secondary" : "default"}>
                          {project.status === "archived" ? "Archived" : "Active"}
                        </Badge>
                        {getProjectStats(project.id)?.overdueTasks ? (
                          <Tooltip>
                            <TooltipTrigger>
                              <Badge variant="destructive" className="text-xs">At Risk</Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              {getProjectStats(project.id)?.overdueTasks} overdue tasks
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-muted-foreground">
                        {getProjectStats(project.id)?.openTasks ?? project.openTaskCount ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {(getProjectStats(project.id)?.overdueTasks ?? 0) > 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          {getProjectStats(project.id)?.overdueTasks}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {(getProjectStats(project.id)?.dueToday ?? 0) > 0 ? (
                        <Badge variant="secondary" className="text-xs">
                          {getProjectStats(project.id)?.dueToday}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = getProjectStats(project.id);
                        if (!stats) return <span className="text-muted-foreground">-</span>;
                        return (
                          <Tooltip>
                            <TooltipTrigger className="w-full">
                              <div className="flex items-center gap-2">
                                <Progress value={stats.completionPercent} className="h-2 flex-1" />
                                <span className="text-xs text-muted-foreground w-8">
                                  {stats.completionPercent}%
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              {stats.completedTasks} of {stats.openTasks + stats.completedTasks} tasks completed
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      {(() => {
                        const forecast = getProjectForecast(project.id);
                        if (!forecast) return <span className="text-muted-foreground">-</span>;
                        if (forecast.budgetMinutes === null) {
                          return <span className="text-muted-foreground">No budget</span>;
                        }
                        if (forecast.overBudget) {
                          return (
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant="destructive" className="text-xs">Over</Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {Math.floor(forecast.trackedMinutesTotal / 60)}h / {Math.floor(forecast.budgetMinutes / 60)}h tracked
                              </TooltipContent>
                            </Tooltip>
                          );
                        }
                        const percent = Math.round((forecast.trackedMinutesTotal / forecast.budgetMinutes) * 100);
                        return (
                          <Tooltip>
                            <TooltipTrigger>
                              <span className={`text-xs ${percent >= 80 ? "text-orange-500 dark:text-orange-400 font-medium" : "text-muted-foreground"}`}>
                                {percent}%
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {Math.floor(forecast.trackedMinutesTotal / 60)}h / {Math.floor(forecast.budgetMinutes / 60)}h tracked
                            </TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const stats = getProjectStats(project.id);
                        if (stats?.lastActivityAt) {
                          return (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(stats.lastActivityAt), "MMM d")}
                            </span>
                          );
                        }
                        if (project.updatedAt) {
                          return (
                            <span className="text-sm text-muted-foreground">
                              {format(new Date(project.updatedAt), "MMM d")}
                            </span>
                          );
                        }
                        return <span className="text-muted-foreground">-</span>;
                      })()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredProjects.length} of {projects?.length || 0} projects
        </div>
      </div>

      <ProjectDetailDrawer
        project={selectedProject}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        teams={teams}
        isPending={createProjectMutation.isPending}
      />
    </div>
  );
}
