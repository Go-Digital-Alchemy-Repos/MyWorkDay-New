import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  Settings,
  MessageCircle,
  Building2,
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";

interface ClientInfo {
  id: string;
  companyName: string;
  displayName: string | null;
  accessLevel: string;
}

interface DashboardData {
  clients: ClientInfo[];
  projects: any[];
  tasks: any[];
  upcomingDeadlines: any[];
}

const mainNavItems = [
  { title: "Dashboard", url: "/portal", icon: LayoutDashboard },
  { title: "Projects", url: "/portal/projects", icon: FolderKanban },
  { title: "Tasks", url: "/portal/tasks", icon: CheckSquare },
  { title: "Chat", url: "/portal/chat", icon: MessageCircle },
];

export function ClientPortalSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });

  const isActiveRoute = (url: string) => {
    if (url === "/portal") {
      return location === "/portal";
    }
    return location.startsWith(url);
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-border h-12 flex items-center">
        <div className="flex items-center gap-2 px-2">
          <img src={dasanaLogo} alt="Logo" className="h-6 w-6" />
          <span className="font-semibold text-sm truncate group-data-[collapsible=icon]:hidden">
            Client Portal
          </span>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActiveRoute(item.url)}
                  >
                    <Link href={item.url} data-testid={`nav-${item.title.toLowerCase().replace(/\s/g, '-')}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {dashboardData?.clients && dashboardData.clients.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Your Organizations</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {dashboardData.clients.map((client) => (
                  <SidebarMenuItem key={client.id}>
                    <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground" data-testid={`client-${client.id}`}>
                      <Building2 className="h-4 w-4" />
                      <span className="truncate">
                        {client.displayName || client.companyName}
                      </span>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={location === "/portal/settings"}>
              <Link href="/portal/settings" data-testid="nav-settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center gap-2 px-2 py-2 group-data-[collapsible=icon]:hidden">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-primary/10">
              {user?.name ? getInitials(user.name) : user?.email?.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium truncate">
              {user?.name || user?.email}
            </span>
            <span className="text-xs text-muted-foreground">Client Portal</span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
