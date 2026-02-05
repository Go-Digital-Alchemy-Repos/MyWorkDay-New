import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Home,
  FolderKanban,
  Users,
  CheckSquare,
  Settings,
  Plus,
  ChevronDown,
  Building2,
  Check,
  Briefcase,
  Clock,
  Cog,
  UserCog,
  MessageCircle,
  UsersRound,
  BarChart3,
  CalendarDays,
  FileStack,
} from "lucide-react";
import dasanaLogo from "@assets/Symbol_1767994625714.png";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { CreateProjectDialog } from "@/features/projects";
import { TeamDrawer } from "@/features/teams";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import type { Project, Team, Workspace, Client, ClientDivision } from "@shared/schema";

const mainNavItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "My Tasks", url: "/my-tasks", icon: CheckSquare },
  { title: "My Time", url: "/my-time", icon: Clock },
  { title: "My Calendar", url: "/my-calendar", icon: CalendarDays },
  { title: "Projects", url: "/projects", icon: FolderKanban },
  { title: "Clients", url: "/clients", icon: Briefcase },
  { title: "Team Calendar", url: "/calendar", icon: CalendarDays },
  { title: "Chat", url: "/chat", icon: MessageCircle },
];

export function TenantSidebar() {
  const [location] = useLocation();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/v1/projects"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const { data: clients } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const { data: allDivisions = [] } = useQuery<ClientDivision[]>({
    queryKey: ["/api/v1/divisions"],
    queryFn: async () => {
      if (!clients || clients.length === 0) return [];
      const allDivs: ClientDivision[] = [];
      for (const client of clients) {
        try {
          const res = await fetch(`/api/v1/clients/${client.id}/divisions`, { credentials: "include" });
          if (res.ok) {
            const divs = await res.json();
            allDivs.push(...divs);
          }
        } catch {
        }
      }
      return allDivs;
    },
    enabled: !!clients && clients.length > 0,
  });

  const getClientName = (clientId: string | null) => {
    if (!clientId || !clients) return null;
    const client = clients.find(c => c.id === clientId);
    return client ? (client.displayName || client.companyName) : null;
  };

  const getDivisionName = (divisionId: string | null) => {
    if (!divisionId) return null;
    const division = allDivisions.find(d => d.id === divisionId);
    return division?.name || null;
  };

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

  const handleCreateProject = (data: any) => {
    createProjectMutation.mutate(data);
  };

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setCreateTeamOpen(false);
      toast({ title: "Team created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create team", variant: "destructive" });
    },
  });

  const handleCreateTeam = async (data: { name: string }) => {
    await createTeamMutation.mutateAsync(data);
  };

  const handleAddWorkspace = () => {
    toast({
      title: "Coming Soon",
      description: "Multiple workspaces will be available in a future update.",
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <img src={dasanaLogo} alt="MyWorkDay" className="h-8 w-8" />
          <span className="text-lg font-semibold text-sidebar-foreground">
            MyWorkDay
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url || (item.url !== "/" && location.startsWith(item.url))}
                  >
                    <Link href={item.url} data-testid={`link-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Projects</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreateProjectOpen(true)}
                data-testid="button-add-project"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects?.map((project) => {
                    const clientName = getClientName(project.clientId);
                    const divisionName = getDivisionName(project.divisionId);
                    return (
                      <SidebarMenuItem key={project.id}>
                        <SidebarMenuButton
                          asChild
                          isActive={location === `/projects/${project.id}`}
                        >
                          <Link
                            href={`/projects/${project.id}`}
                            data-testid={`link-project-${project.id}`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <div
                                className="h-3 w-3 rounded-sm shrink-0"
                                style={{ backgroundColor: project.color || "#3B82F6" }}
                              />
                              <span className="truncate flex-1">{project.name}</span>
                              {(clientName || divisionName) && (
                                <div className="flex items-center gap-1 shrink-0">
                                  {clientName && (
                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-client-${project.id}`}>
                                      {clientName.length > 10 ? clientName.slice(0, 10) + "…" : clientName}
                                    </Badge>
                                  )}
                                  {divisionName && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 h-4" data-testid={`badge-project-division-${project.id}`}>
                                      {divisionName.length > 8 ? divisionName.slice(0, 8) + "…" : divisionName}
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                  {(!projects || projects.length === 0) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No projects yet
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Teams</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setCreateTeamOpen(true)}
                data-testid="button-add-team"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {teams?.map((team) => (
                    <SidebarMenuItem key={team.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === `/teams/${team.id}`}
                      >
                        <Link
                          href={`/teams/${team.id}`}
                          data-testid={`link-team-${team.id}`}
                        >
                          <Users className="h-4 w-4" />
                          <span className="truncate">{team.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {(!teams || teams.length === 0) && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No teams yet
                    </div>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        <SidebarGroup>
          <Collapsible defaultOpen className="group/collapsible">
            <div className="flex items-center justify-between pr-2">
              <CollapsibleTrigger asChild>
                <SidebarGroupLabel className="cursor-pointer hover-elevate rounded-md px-2 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <ChevronDown className="h-3 w-3 transition-transform group-data-[state=closed]/collapsible:-rotate-90" />
                  <span className="ml-1">Workspaces</span>
                </SidebarGroupLabel>
              </CollapsibleTrigger>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleAddWorkspace}
                data-testid="button-add-workspace"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton className="justify-between">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        <span className="truncate">{workspace?.name || "Default Workspace"}</span>
                      </div>
                      <Check className="h-4 w-4 text-primary" />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </CollapsibleContent>
          </Collapsible>
        </SidebarGroup>

        {/* Team Manager - available to all tenant members */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === "/user-manager" || location.startsWith("/user-manager/")}
                >
                  <Link href="/user-manager" data-testid="link-user-manager">
                    <UsersRound className="h-4 w-4" />
                    <span>{isAdmin || isSuperUser ? "User Manager" : "Team Manager"}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {(isAdmin || isSuperUser) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/account")}
                  >
                    <Link href="/account" data-testid="link-account-settings">
                      <UserCog className="h-4 w-4" />
                      <span>Account</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/reports" || location.startsWith("/reports/")}
                  >
                    <Link href="/reports" data-testid="link-reports">
                      <BarChart3 className="h-4 w-4" />
                      <span>Reports</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/templates" || location.startsWith("/templates/")}
                  >
                    <Link href="/templates" data-testid="link-templates">
                      <FileStack className="h-4 w-4" />
                      <span>Templates</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location.startsWith("/settings")}
                  >
                    <Link href="/settings" data-testid="link-global-settings">
                      <Cog className="h-4 w-4" />
                      <span>System Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              {user?.firstName?.charAt(0) || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user?.email}
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-settings">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>

      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onSubmit={handleCreateProject}
        teams={teams}
        clients={clients}
        isPending={createProjectMutation.isPending}
      />

      <TeamDrawer
        open={createTeamOpen}
        onOpenChange={setCreateTeamOpen}
        onSubmit={handleCreateTeam}
        mode="create"
        isLoading={createTeamMutation.isPending}
      />
    </Sidebar>
  );
}
