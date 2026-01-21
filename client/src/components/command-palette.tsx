import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Building2,
  FolderKanban,
  CheckSquare,
  Plus,
  Timer,
  Search,
} from "lucide-react";
import { useDebounce } from "@/hooks/use-debounce";

interface SearchResult {
  clients: Array<{ id: string; name: string; type: string }>;
  projects: Array<{ id: string; name: string; type: string; status: string }>;
  tasks: Array<{ id: string; name: string; type: string; projectId: string; status: string }>;
}

interface CommandPaletteProps {
  onNewTask?: () => void;
  onNewProject?: () => void;
  onStartTimer?: () => void;
}

export function CommandPalette({ onNewTask, onNewProject, onStartTimer }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const debouncedSearch = useDebounce(search, 200);

  const { data: searchResults, isLoading } = useQuery<SearchResult>({
    queryKey: ["/api/search", { q: debouncedSearch }],
    enabled: debouncedSearch.length >= 2,
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const handleSelect = useCallback((callback: () => void) => {
    setOpen(false);
    setSearch("");
    callback();
  }, []);

  const navigateTo = useCallback((path: string) => {
    handleSelect(() => setLocation(path));
  }, [handleSelect, setLocation]);

  const hasResults = searchResults && (
    searchResults.clients.length > 0 ||
    searchResults.projects.length > 0 ||
    searchResults.tasks.length > 0
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false} className="rounded-lg border shadow-md">
        <CommandInput
          placeholder="Search clients, projects, tasks..."
          value={search}
          onValueChange={setSearch}
          data-testid="input-command-search"
        />
        <CommandList>
          {debouncedSearch.length >= 2 && !hasResults && !isLoading && (
            <CommandEmpty>No results found.</CommandEmpty>
          )}

          {debouncedSearch.length < 2 && (
            <CommandGroup heading="Quick Actions">
              <CommandItem
                onSelect={() => handleSelect(() => onNewTask?.())}
                data-testid="command-new-task"
              >
                <Plus className="mr-2 h-4 w-4" />
                <span>New Task</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleSelect(() => onNewProject?.())}
                data-testid="command-new-project"
              >
                <FolderKanban className="mr-2 h-4 w-4" />
                <span>New Project</span>
              </CommandItem>
              <CommandItem
                onSelect={() => handleSelect(() => onStartTimer?.())}
                data-testid="command-start-timer"
              >
                <Timer className="mr-2 h-4 w-4" />
                <span>Start Timer</span>
              </CommandItem>
            </CommandGroup>
          )}

          {searchResults?.clients && searchResults.clients.length > 0 && (
            <CommandGroup heading="Clients">
              {searchResults.clients.map((client) => (
                <CommandItem
                  key={client.id}
                  value={client.id}
                  onSelect={() => navigateTo(`/clients/${client.id}`)}
                  data-testid={`command-client-${client.id}`}
                >
                  <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{client.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {searchResults?.projects && searchResults.projects.length > 0 && (
            <>
              {searchResults.clients.length > 0 && <CommandSeparator />}
              <CommandGroup heading="Projects">
                {searchResults.projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    onSelect={() => navigateTo(`/projects/${project.id}`)}
                    data-testid={`command-project-${project.id}`}
                  >
                    <FolderKanban className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{project.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">
                      {project.status}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {searchResults?.tasks && searchResults.tasks.length > 0 && (
            <>
              {(searchResults.clients.length > 0 || searchResults.projects.length > 0) && <CommandSeparator />}
              <CommandGroup heading="Tasks">
                {searchResults.tasks.map((task) => (
                  <CommandItem
                    key={task.id}
                    value={task.id}
                    onSelect={() => navigateTo(`/projects/${task.projectId}?task=${task.id}`)}
                    data-testid={`command-task-${task.id}`}
                  >
                    <CheckSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{task.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground capitalize">
                      {task.status}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
