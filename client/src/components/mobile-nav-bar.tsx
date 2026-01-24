import { Link, useLocation } from "wouter";
import { Home, CheckSquare, FolderKanban, Clock, Menu, Moon, Sun } from "lucide-react";
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
    title: "Home", 
    href: "/", 
    icon: Home,
    matchPaths: ["/"]
  },
  { 
    title: "Tasks", 
    href: "/my-tasks", 
    icon: CheckSquare,
    matchPaths: ["/my-tasks"]
  },
  { 
    title: "Projects", 
    href: "/projects", 
    icon: FolderKanban,
    matchPaths: ["/projects"]
  },
  { 
    title: "Timer", 
    href: "/time-tracking", 
    icon: Clock,
    matchPaths: ["/time-tracking"]
  },
];

export function MobileNavBar() {
  const [location] = useLocation();
  const { toggleSidebar } = useSidebar();
  const { theme, toggleTheme } = useTheme();

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(path => {
        if (path === "/") return location === "/";
        return location.startsWith(path);
      });
    }
    return location === item.href;
  };

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
      data-testid="mobile-nav-bar"
    >
      <div className="flex h-16 items-center justify-around px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Button
              key={item.href}
              variant={active ? "secondary" : "ghost"}
              size="sm"
              asChild
              className={cn(active && "text-primary")}
            >
              <Link
                href={item.href}
                data-testid={`mobile-nav-${item.title.toLowerCase()}`}
                className="flex flex-col items-center justify-center gap-0.5"
              >
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
          data-testid="mobile-nav-theme"
          className="flex flex-col items-center justify-center gap-0.5"
        >
          {theme === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
          <span className="text-[10px] font-medium">Theme</span>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          data-testid="mobile-nav-menu"
          className="flex flex-col items-center justify-center gap-0.5"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px] font-medium">Menu</span>
        </Button>
      </div>
    </nav>
  );
}
