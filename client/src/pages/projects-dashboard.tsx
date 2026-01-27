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
import { FolderKanban, Search, Filter, Calendar, Users, CheckSquare, AlertTriangle, Clock, CircleOff, DollarSign, Plus, Pencil } from "lucide-react";
import { ProjectDetailDrawer, ProjectDrawer } from "@/features/projects";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { AccessInfoBanner } from "@/components/access-info-banner";
import type { Project, Client, Team, ClientDivision } from "@shared/schema";
import { UserRole } from "@shared/schema";
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
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<ProjectWithCounts | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithCounts | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const isEmployee = user?.role === UserRole.EMPLOYEE;

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithCounts[]>({
    queryKey: ["/api/v1/projects", { includeCounts: true }],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clientDivisions = [] } = useQuery<ClientDivision[]>({
    queryKey: ["/api/v1/clients", clientFilter, "divisions"],
    queryFn: () => fetch(`/api/v1/clients/${clientFilter}/divisions`, { credentials: "include" }).then(r => r.json()),
    enabled: clientFilter !== "all",
  });

  const selectedClientHasDivisions = clientDivisions.length > 0;

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

  const handleCreateProject = async (data: any) => {
    await createProjectMutation.mutateAsync(data);
  };

  const updateProjectMutation = useMutation({
    mutationFn: async ({ projectId, data }: { projectId: string; data: any }) => {
      const { memberIds, ...projectData } = data;
      await apiRequest("PATCH", `/api/projects/${projectId}`, projectData);
      if (memberIds !== undefined) {
        await apiRequest("PUT", `/api/projects/${projectId}/members`, { memberIds });
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", variables.projectId, "members"] });
      setEditProjectOpen(false);
      setEditingProject(null);
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const handleEditProject = (project: ProjectWithCounts) => {
    setEditingProject(project);
    setDrawerOpen(false);
    setEditProjectOpen(true);
  };

  const handleUpdateProject = async (data: any) => {
    if (!editingProject) return;
    await updateProjectMutation.mutateAsync({ projectId: editingProject.id, data });
  };

  const getProjectStats = (projectId: string) => {
    if (!analytics?.perProject) return null;
    return analytics.perProject.find(p => p.projectId === projectId);
  };

  const getProjectForecast = (projectId: string) => {
    if (!forecastSummary?.perProject) return null;
    return forecastSummary.perProject.find(p => p.projectId === projectId);
  };

  const handleClientFilterChange = (newClientId: string) => {
    setClientFilter(newClientId);
    setDivisionFilter("all");
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
      
      const matchesDivision = divisionFilter === "all" || project.divisionId === divisionFilter;
      
      const matchesTeam = teamFilter === "all" || project.teamId === teamFilter;
      
      return matchesSearch && matchesStatus && matchesClient && matchesDivision && matchesTeam;
    });
  }, [projects, searchQuery, statusFilter, clientFilter, divisionFilter, teamFilter]);

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
      <div className="container max-w-7xl mx-auto py-4 md:py-6 px-3 md:px-4">
        <div className="flex items-center justify-between mb-4 md:mb-6 gap-2">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <FolderKanban className="h-6 w-6 md:h-8 md:w-8 text-primary shrink-0" />
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-bold truncate">Projects</h1>
              <p className="text-muted-foreground text-xs md:text-sm hidden md:block">
                View and manage all projects across your workspace
              </p>
            </div>
          </div>
          <Button onClick={() => setCreateProjectOpen(true)} data-testid="button-new-project" size="sm" className="md:h-9 shrink-0">
            <Plus className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">New Project</span>
          </Button>
        </div>

        {isEmployee && (
          <AccessInfoBanner variant="projects" className="mb-4" />
        )}

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

        <div className="flex flex-col gap-3 md:gap-4 mb-4 md:mb-6">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-projects"
            />
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
            <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[100px] md:w-[130px] shrink-0" data-testid="select-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>

            <Select value={clientFilter} onValueChange={handleClientFilterChange}>
              <SelectTrigger className="w-[110px] md:w-[150px] shrink-0" data-testid="select-client-filter">
                <SelectValue placeholder="Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clients</SelectItem>
                {clients?.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.displayName || client.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedClientHasDivisions && (
              <Select value={divisionFilter} onValueChange={setDivisionFilter}>
                <SelectTrigger className="w-[110px] md:w-[150px] shrink-0" data-testid="select-division-filter">
                  <SelectValue placeholder="Division" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Divisions</SelectItem>
                  {clientDivisions.map((division) => (
                    <SelectItem key={division.id} value={division.id}>
                      {division.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-[100px] md:w-[150px] shrink-0" data-testid="select-team-filter">
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

        {projectsLoading ? (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[250px]">Project Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Open</TableHead>
                  <TableHead className="text-center">Overdue</TableHead>
                  <TableHead className="text-center">Today</TableHead>
                  <TableHead className="w-[100px]">Progress</TableHead>
                  <TableHead className="text-center">Budget</TableHead>
                  <TableHead>Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-8 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-2 w-full" /></TableCell>
                    <TableCell className="text-center"><Skeleton className="h-5 w-12 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No projects found</h3>
            <p className="text-muted-foreground text-sm mb-4">
              {searchQuery || statusFilter !== "all" || clientFilter !== "all" || divisionFilter !== "all" || teamFilter !== "all"
                ? "Try adjusting your filters"
                : "Create your first project to get started"}
            </p>
            {!(searchQuery || statusFilter !== "all" || clientFilter !== "all" || divisionFilter !== "all" || teamFilter !== "all") && (
              <Button onClick={() => setCreateProjectOpen(true)} data-testid="button-add-first-project">
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="md:hidden space-y-3">
              {filteredProjects.map((project) => {
                const stats = getProjectStats(project.id);
                return (
                  <Card
                    key={project.id}
                    className="hover-elevate cursor-pointer"
                    onClick={() => handleRowClick(project)}
                    data-testid={`card-project-${project.id}`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div
                          className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-medium shrink-0"
                          style={{ backgroundColor: project.color || "#3B82F6" }}
                        >
                          {project.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium truncate">{project.name}</h3>
                            <Badge variant={project.status === "archived" ? "secondary" : "default"} className="shrink-0">
                              {project.status === "archived" ? "Archived" : "Active"}
                            </Badge>
                          </div>
                          {project.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{project.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            {getClientName(project.clientId) !== "-" && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {getClientName(project.clientId)}
                              </span>
                            )}
                            {stats && (
                              <>
                                <span className="flex items-center gap-1">
                                  <CheckSquare className="h-3 w-3" />
                                  {stats.openTasks} open
                                </span>
                                {stats.overdueTasks > 0 && (
                                  <Badge variant="destructive" className="text-xs px-1.5 py-0">
                                    {stats.overdueTasks} overdue
                                  </Badge>
                                )}
                              </>
                            )}
                          </div>
                          {stats && (
                            <div className="mt-2">
                              <Progress value={stats.completionPercent} className="h-1.5" />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block border rounded-lg overflow-hidden">
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
          </>
        )}

        <div className="mt-4 text-sm text-muted-foreground">
          Showing {filteredProjects.length} of {projects?.length || 0} projects
        </div>
      </div>

      <ProjectDetailDrawer
        project={selectedProject}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onEdit={handleEditProject}
      />

      <ProjectDrawer
        open={editProjectOpen}
        onOpenChange={setEditProjectOpen}
        onSubmit={handleUpdateProject}
        project={editingProject}
        isLoading={updateProjectMutation.isPending}
        mode="edit"
      />

      <ProjectDrawer
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        isLoading={createProjectMutation.isPending}
        mode="create"
      />
    </div>
  );
}
