import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  Home,
  FolderKanban,
  Users,
  CheckSquare,
  Settings,
  Plus,
  ChevronDown,
  Hash,
  Building2,
  Check,
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
import { CreateProjectDialog } from "@/components/create-project-dialog";
import type { Project, Team, Workspace } from "@shared/schema";

const mainNavItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "My Tasks", url: "/my-tasks", icon: CheckSquare },
];

export function AppSidebar() {
  const [location] = useLocation();
  const [createProjectOpen, setCreateProjectOpen] = useState(false);

  const { data: workspace } = useQuery<Workspace>({
    queryKey: ["/api/workspaces/current"],
  });

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: teams } = useQuery<Team[]>({
    queryKey: ["/api/teams"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setCreateProjectOpen(false);
    },
  });

  const handleCreateProject = (data: any) => {
    createProjectMutation.mutate(data);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <img src={dasanaLogo} alt="DASANA" className="h-8 w-8" />
          <span className="text-lg font-semibold text-sidebar-foreground">
            DASANA
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
                    isActive={location === item.url}
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
                className="h-6 w-6"
                onClick={() => setCreateProjectOpen(true)}
                data-testid="button-add-project"
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <CollapsibleContent>
              <SidebarGroupContent>
                <SidebarMenu>
                  {projects?.map((project) => (
                    <SidebarMenuItem key={project.id}>
                      <SidebarMenuButton
                        asChild
                        isActive={location === `/projects/${project.id}`}
                      >
                        <Link
                          href={`/projects/${project.id}`}
                          data-testid={`link-project-${project.id}`}
                        >
                          <div
                            className="h-3 w-3 rounded-sm"
                            style={{ backgroundColor: project.color || "#3B82F6" }}
                          />
                          <span className="truncate">{project.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
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
                className="h-6 w-6"
                data-testid="button-add-team"
              >
                <Plus className="h-3 w-3" />
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
                className="h-6 w-6"
                data-testid="button-add-workspace"
              >
                <Plus className="h-3 w-3" />
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
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary/10 text-primary text-xs">
              U
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">Demo User</span>
            <span className="truncate text-xs text-muted-foreground">
              owner@demo.com
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
        isPending={createProjectMutation.isPending}
      />
    </Sidebar>
  );
}
