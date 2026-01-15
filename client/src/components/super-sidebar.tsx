import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Building2,
  Wrench,
  Activity,
  LayoutDashboard,
  FileText,
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

const superAdminNavItems = [
  { title: "Dashboard", url: "/super-admin/dashboard", icon: LayoutDashboard, exact: false },
  { title: "Tenants", url: "/super-admin/tenants", icon: Building2, exact: false },
  { title: "System Settings", url: "/super-admin/settings", icon: Wrench, exact: false },
  { title: "System Status", url: "/super-admin/status", icon: Activity, exact: false },
  { title: "App Docs", url: "/super-admin/docs", icon: FileText, exact: false },
];

export function SuperSidebar() {
  const [location] = useLocation();
  const { user } = useAuth();

  const isActive = (url: string, exact: boolean) => {
    if (exact) return location === url;
    return location.startsWith(url);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-4 py-3">
        <div className="flex items-center gap-3">
          <img src={dasanaLogo} alt="MyWorkDay" className="h-8 w-8" />
          <div className="flex flex-col">
            <span className="text-lg font-semibold text-sidebar-foreground">
              MyWorkDay
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Super Admin
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs font-medium uppercase tracking-wide text-muted-foreground px-2">
            Administration
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {superAdminNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive(item.url, item.exact)}
                  >
                    <Link href={item.url} data-testid={`link-super-${item.title.toLowerCase().replace(/\s/g, "-")}`}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
              SA
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-1 flex-col overflow-hidden">
            <span className="truncate text-sm font-medium">
              {user?.firstName} {user?.lastName}
            </span>
            <span className="truncate text-xs text-amber-600 dark:text-amber-400">
              Super Admin
            </span>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
