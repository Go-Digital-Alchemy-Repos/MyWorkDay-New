import { Link, useLocation } from "wouter";
import { Home, FolderKanban, CheckSquare, Menu, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/lib/theme-provider";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  matchPaths?: string[];
}

const navItems: NavItem[] = [
  { 
    title: "Dashboard", 
    href: "/portal", 
    icon: Home,
    matchPaths: ["/portal"]
  },
  { 
    title: "Projects", 
    href: "/portal/projects", 
    icon: FolderKanban,
    matchPaths: ["/portal/projects"]
  },
  { 
    title: "Tasks", 
    href: "/portal/tasks", 
    icon: CheckSquare,
    matchPaths: ["/portal/tasks"]
  },
];

export function ClientPortalMobileNav() {
  const [location] = useLocation();
  const { toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(path => {
        if (path === "/portal") return location === "/portal";
        return location.startsWith(path);
      });
    }
    return location === item.href;
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      data-testid="client-portal-mobile-nav"
    >
      <div className="flex h-16 items-center justify-around px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              asChild
              className={cn(
                "flex flex-col items-center justify-center gap-0.5",
                active && "bg-accent text-accent-foreground"
              )}
              data-testid={`button-portal-nav-${item.title.toLowerCase()}`}
            >
              <Link href={item.href}>
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.title}</span>
              </Link>
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleTheme}
          data-testid="button-portal-nav-theme"
          className="flex flex-col items-center justify-center gap-0.5"
        >
          {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          <span className="text-[10px] font-medium">Theme</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          data-testid="button-portal-nav-menu"
          className="flex flex-col items-center justify-center gap-0.5"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </Button>
      </div>
    </nav>
  );
}
