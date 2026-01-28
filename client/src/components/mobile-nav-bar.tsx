import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Home, CheckSquare, FolderKanban, Clock, Plus, Calendar, Menu, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
    title: "Calendar", 
    href: "/calendar", 
    icon: Calendar,
    matchPaths: ["/calendar"]
  },
];

interface QuickAction {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: () => void;
}

export function MobileNavBar() {
  const [location, setLocation] = useLocation();
  const { toggleSidebar } = useSidebar();
  const [showQuickActions, setShowQuickActions] = useState(false);

  const isActive = (item: NavItem) => {
    if (item.matchPaths) {
      return item.matchPaths.some(path => {
        if (path === "/") return location === "/";
        return location.startsWith(path);
      });
    }
    return location === item.href;
  };

  const quickActions: QuickAction[] = [
    {
      title: "New Task",
      description: "Create a personal task",
      icon: CheckSquare,
      href: "/my-tasks?action=new",
    },
    {
      title: "Start Timer",
      description: "Track time on a task",
      icon: Play,
      href: "/my-time",
    },
    {
      title: "View Projects",
      description: "Browse all projects",
      icon: FolderKanban,
      href: "/projects",
    },
  ];

  const handleQuickAction = (action: QuickAction) => {
    setShowQuickActions(false);
    if (action.href) {
      setLocation(action.href);
    } else if (action.action) {
      action.action();
    }
  };

  return (
    <>
      <nav 
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        data-testid="mobile-nav-bar"
      >
        <div className="flex h-16 items-center justify-around px-1">
          {navItems.slice(0, 2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Button
                key={item.href}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                asChild
                className={cn("flex-1 max-w-16", active && "text-primary")}
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
          
          <div className="relative -mt-4">
            <Button
              size="lg"
              className="rounded-full shadow-lg"
              onClick={() => setShowQuickActions(true)}
              data-testid="mobile-nav-quick-add"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          
          {navItems.slice(2).map((item) => {
            const Icon = item.icon;
            const active = isActive(item);
            return (
              <Button
                key={item.href}
                variant={active ? "secondary" : "ghost"}
                size="sm"
                asChild
                className={cn("flex-1 max-w-16", active && "text-primary")}
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
            onClick={toggleSidebar}
            data-testid="mobile-nav-menu"
            className="flex-1 max-w-16 flex flex-col items-center justify-center gap-0.5"
          >
            <Menu className="h-5 w-5" />
            <span className="text-[10px] font-medium">More</span>
          </Button>
        </div>
      </nav>

      <Dialog open={showQuickActions} onOpenChange={setShowQuickActions}>
        <DialogContent className="sm:max-w-[320px]">
          <DialogHeader>
            <DialogTitle className="text-center">Quick Actions</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 pt-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.title}
                  variant="outline"
                  size="lg"
                  className="justify-start gap-3"
                  onClick={() => handleQuickAction(action)}
                  data-testid={`quick-action-${action.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <div className="rounded-full bg-primary/10 p-2 shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm">{action.title}</div>
                    <div className="text-xs text-muted-foreground">{action.description}</div>
                  </div>
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
