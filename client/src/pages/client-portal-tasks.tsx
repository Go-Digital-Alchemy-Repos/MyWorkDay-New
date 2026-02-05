import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  CheckSquare,
  Search,
  AlertCircle,
  Calendar,
  Filter,
  FolderKanban,
} from "lucide-react";
import { useState, useMemo } from "react";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  projectId: string;
  projectName: string;
}

interface DashboardData {
  tasks: TaskInfo[];
  projects: any[];
}

function getStatusColor(status: string) {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "blocked":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function getPriorityColor(priority: string) {
  switch (priority) {
    case "urgent":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "high":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function formatDueDate(dateStr: string | null) {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "MMM d, yyyy");
}

function getDueDateClass(dateStr: string | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  if (isPast(date) && !isToday(date)) return "text-destructive";
  if (isToday(date)) return "text-orange-600 dark:text-orange-400";
  return "text-muted-foreground";
}

export default function ClientPortalTasks() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  
  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ["/api/client-portal/dashboard"],
  });

  const filteredTasks = useMemo(() => {
    if (!data?.tasks) return [];
    
    return data.tasks.filter((task) => {
      const matchesSearch = !searchQuery.trim() ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.projectName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [data?.tasks, searchQuery, statusFilter, priorityFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, TaskInfo[]> = {};
    for (const task of filteredTasks) {
      if (!groups[task.projectName]) {
        groups[task.projectName] = [];
      }
      groups[task.projectName].push(task);
    }
    return groups;
  }, [filteredTasks]);

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
  };

  const hasActiveFilters = searchQuery || statusFilter !== "all" || priorityFilter !== "all";

  if (isLoading) {
    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted-foreground">View all your tasks</p>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Error Loading Tasks
            </CardTitle>
            <CardDescription>
              There was a problem loading your tasks. Please try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" data-testid="text-tasks-title">Tasks</h1>
        <p className="text-muted-foreground">
          View and track all your tasks across projects
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-tasks"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40" data-testid="select-status-filter">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="blocked">Blocked</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-40" data-testid="select-priority-filter">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button variant="outline" onClick={clearFilters} data-testid="button-clear-filters">
            Clear
          </Button>
        )}
      </div>

      {Object.keys(groupedTasks).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(groupedTasks).map(([projectName, tasks]) => (
            <Card key={projectName}>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">{projectName}</CardTitle>
                  <Badge variant="secondary">{tasks.length}</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-start justify-between p-3 rounded-lg border bg-card"
                      data-testid={`task-row-${task.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{task.title}</div>
                        {task.description && (
                          <div className="text-sm text-muted-foreground line-clamp-1 mt-0.5">
                            {task.description}
                          </div>
                        )}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="outline" className={getPriorityColor(task.priority)}>
                            {task.priority}
                          </Badge>
                          <Badge variant="outline" className={getStatusColor(task.status)}>
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                        </div>
                      </div>
                      {task.dueDate && (
                        <div className={`flex items-center gap-1 text-sm ml-4 whitespace-nowrap ${getDueDateClass(task.dueDate)}`}>
                          <Calendar className="h-3 w-3" />
                          {formatDueDate(task.dueDate)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <CheckSquare className="h-12 w-12 mb-4 opacity-50" />
          {hasActiveFilters ? (
            <>
              <p className="text-lg font-medium">No matching tasks</p>
              <p className="text-sm">Try adjusting your filters</p>
              <Button variant="outline" onClick={clearFilters} className="mt-4">
                Clear Filters
              </Button>
            </>
          ) : (
            <>
              <p className="text-lg font-medium">No tasks yet</p>
              <p className="text-sm">Tasks will appear here when created</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
