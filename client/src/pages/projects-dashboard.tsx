import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { FolderKanban, Search, Filter, Calendar, Users, CheckSquare } from "lucide-react";
import { ProjectDetailDrawer } from "@/components/project-detail-drawer";
import type { Project, Client, Team } from "@shared/schema";
import { format } from "date-fns";

interface ProjectWithCounts extends Project {
  openTaskCount?: number;
}

export default function ProjectsDashboard() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [selectedProject, setSelectedProject] = useState<ProjectWithCounts | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: projects, isLoading: projectsLoading } = useQuery<ProjectWithCounts[]>({
    queryKey: ["/api/v1/projects", { includeCounts: true }],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

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
        <div className="flex items-center gap-3 mb-6">
          <FolderKanban className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-muted-foreground text-sm">
              View and manage all projects across your workspace
            </p>
          </div>
        </div>

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
                  <TableHead className="w-[300px]">Project Name</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Open Tasks
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      Updated
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
                      <Badge variant={project.status === "archived" ? "secondary" : "default"}>
                        {project.status === "archived" ? "Archived" : "Active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">
                        {project.openTaskCount ?? "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {project.updatedAt ? (
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(project.updatedAt), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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
    </div>
  );
}
