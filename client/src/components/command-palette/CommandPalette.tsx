import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Home,
  CheckSquare,
  FolderOpen,
  Users,
  Clock,
  Calendar,
  MessageSquare,
  BarChart3,
  Settings,
  FileText,
  Plus,
  User,
  Layers,
  Play,
} from "lucide-react";

interface CommandPaletteProps {
  onNewTask?: () => void;
  onNewProject?: () => void;
  onNewClient?: () => void;
  onStartTimer?: () => void;
}

interface NavigationItem {
  id: string;
  label: string;
  path: string;
  icon: typeof Home;
  keywords?: string[];
}

interface SearchableItem {
  id: string;
  type: "project" | "client" | "task";
  label: string;
  path: string;
  subtitle?: string;
}

const navigationItems: NavigationItem[] = [
  { id: "home", label: "Home", path: "/", icon: Home, keywords: ["dashboard"] },
  { id: "my-tasks", label: "My Tasks", path: "/my-tasks", icon: CheckSquare, keywords: ["todo", "assigned"] },
  { id: "projects", label: "Projects", path: "/projects", icon: FolderOpen },
  { id: "clients", label: "Clients", path: "/clients", icon: Users, keywords: ["accounts", "customers"] },
  { id: "time-tracking", label: "Time Tracking", path: "/time-tracking", icon: Clock, keywords: ["timer", "hours"] },
  { id: "my-time", label: "My Time", path: "/my-time", icon: Clock, keywords: ["timesheet"] },
  { id: "calendar", label: "Calendar", path: "/calendar", icon: Calendar, keywords: ["schedule", "dates"] },
  { id: "my-calendar", label: "My Calendar", path: "/my-calendar", icon: Calendar },
  { id: "chat", label: "Chat", path: "/chat", icon: MessageSquare, keywords: ["messages", "slack"] },
  { id: "reports", label: "Reports", path: "/reports", icon: BarChart3, keywords: ["analytics", "metrics"] },
  { id: "templates", label: "Templates", path: "/templates", icon: Layers, keywords: ["project templates"] },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, keywords: ["preferences", "config"] },
  { id: "profile", label: "Profile", path: "/profile", icon: User, keywords: ["account"] },
];

export function CommandPalette({
  onNewTask,
  onNewProject,
  onNewClient,
  onStartTimer,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const [searchValue, setSearchValue] = useState("");

  // Fetch projects for search
  const { data: projects } = useQuery<Array<{ id: number; name: string; clientId?: number | null }>>({
    queryKey: ["/api/projects"],
    enabled: open && searchValue.length > 0,
  });

  // Fetch clients for search
  const { data: clients } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/clients"],
    enabled: open && searchValue.length > 0,
  });

  // Global keyboard listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (callback: () => void) => {
      setOpen(false);
      setSearchValue("");
      callback();
    },
    []
  );

  const navigateTo = useCallback(
    (path: string) => {
      handleSelect(() => setLocation(path));
    },
    [handleSelect, setLocation]
  );

  // Build searchable items from projects and clients
  const searchableItems: SearchableItem[] = [
    ...(projects?.map((p) => ({
      id: `project-${p.id}`,
      type: "project" as const,
      label: p.name,
      path: `/projects/${p.id}`,
      subtitle: "Project",
    })) || []),
    ...(clients?.map((c) => ({
      id: `client-${c.id}`,
      type: "client" as const,
      label: c.name,
      path: `/clients/${c.id}`,
      subtitle: "Client",
    })) || []),
  ];

  const hasQuickActions = onNewTask || onNewProject || onNewClient || onStartTimer;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Type a command or search..."
        value={searchValue}
        onValueChange={setSearchValue}
        data-testid="input-command-search"
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Quick Actions */}
        {hasQuickActions && (
          <CommandGroup heading="Quick Actions">
            {onNewTask && (
              <CommandItem
                onSelect={() => handleSelect(onNewTask)}
                data-testid="command-item-create-task"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create Task</span>
              </CommandItem>
            )}
            {onNewProject && (
              <CommandItem
                onSelect={() => handleSelect(onNewProject)}
                data-testid="command-item-create-project"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Create Project</span>
              </CommandItem>
            )}
            {onNewClient && (
              <CommandItem
                onSelect={() => handleSelect(onNewClient)}
                data-testid="command-item-create-client"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>Add Client</span>
              </CommandItem>
            )}
            {onStartTimer && (
              <CommandItem
                onSelect={() => handleSelect(onStartTimer)}
                data-testid="command-item-start-timer"
              >
                <Play className="mr-2 h-4 w-4" />
                <span>Start Timer</span>
              </CommandItem>
            )}
          </CommandGroup>
        )}

        {/* Navigation */}
        <CommandGroup heading="Navigation">
          {navigationItems.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => navigateTo(item.path)}
              keywords={item.keywords}
              data-testid={`command-item-nav-${item.id}`}
            >
              <item.icon className="mr-2 h-4 w-4" />
              <span>{item.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>

        {/* Search Results */}
        {searchValue.length > 0 && searchableItems.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Search Results">
              {searchableItems.slice(0, 10).map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => navigateTo(item.path)}
                  data-testid={`command-item-search-${item.id}`}
                >
                  {item.type === "project" ? (
                    <FolderOpen className="mr-2 h-4 w-4" />
                  ) : item.type === "client" ? (
                    <Users className="mr-2 h-4 w-4" />
                  ) : (
                    <FileText className="mr-2 h-4 w-4" />
                  )}
                  <div className="flex flex-col">
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.subtitle}</span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
