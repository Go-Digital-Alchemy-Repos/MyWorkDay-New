import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import { 
  Filter, 
  User as UserIcon, 
  FolderOpen, 
  Building2,
  DollarSign,
  CalendarDays,
  Clock,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { TaskDetailDrawer } from "@/features/tasks";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import type { TaskWithRelations, TimeEntryWithRelations, Client, Project, User } from "@shared/schema";

interface CalendarTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  projectId: string | null;
  assignees: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  type: "task" | "time_entry";
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    type: "task" | "time_entry";
    status?: string;
    priority?: string;
    scope?: string;
    clientId?: string;
    projectId?: string;
    userId?: string;
    duration?: number;
    taskId?: string;
    timeEntryData?: TimeEntryWithRelations;
  };
}

interface CalendarDataResponse {
  tasks: CalendarTask[];
  timeEntries: TimeEntryWithRelations[];
  clients: Client[];
  projects: Project[];
  users: User[];
}

const priorityColors: Record<string, string> = {
  low: "#10B981",
  medium: "#F59E0B",
  high: "#F97316",
  urgent: "#EF4444",
};

const statusColors: Record<string, string> = {
  todo: "#6B7280",
  in_progress: "#3B82F6",
  blocked: "#EF4444",
  done: "#10B981",
};

export default function CalendarPage() {
  const { toast } = useToast();
  const calendarRef = useRef<FullCalendar>(null);
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [currentView, setCurrentView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("dayGridMonth");
  const [filtersOpen, setFiltersOpen] = useState(false);
  
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [showTasks, setShowTasks] = useState(true);
  const [showTimeEntries, setShowTimeEntries] = useState(true);

  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<TimeEntryWithRelations | null>(null);
  const [timeEntryDrawerOpen, setTimeEntryDrawerOpen] = useState(false);

  const { data: calendarData, isLoading } = useQuery<CalendarDataResponse>({
    queryKey: [
      "/api/calendar/events",
      { start: dateRange.start, end: dateRange.end },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.start) params.set("start", dateRange.start);
      if (dateRange.end) params.set("end", dateRange.end);
      
      const response = await fetch(`/api/calendar/events?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch calendar events");
      return response.json();
    },
    enabled: !!dateRange.start && !!dateRange.end,
  });

  const filteredEvents = useMemo(() => {
    if (!calendarData) return [];
    
    const events: CalendarEvent[] = [];
    
    if (showTasks) {
      for (const task of calendarData.tasks) {
        if (!task.dueDate) continue;
        
        if (clientFilter !== "all") {
          const project = calendarData.projects.find(p => p.id === task.projectId);
          if (project?.clientId !== clientFilter) continue;
        }
        
        if (projectFilter !== "all" && task.projectId !== projectFilter) continue;
        
        if (assigneeFilter !== "all") {
          const hasAssignee = task.assignees?.some((a: any) => a.userId === assigneeFilter || a.user?.id === assigneeFilter);
          if (!hasAssignee) continue;
        }
        
        const dueDateStr = task.dueDate instanceof Date 
          ? task.dueDate.toISOString() 
          : String(task.dueDate);
        
        events.push({
          id: `task-${task.id}`,
          title: task.title,
          start: dueDateStr,
          allDay: true,
          type: "task",
          backgroundColor: statusColors[task.status] || "#6B7280",
          borderColor: priorityColors[task.priority] || "#6B7280",
          textColor: "#FFFFFF",
          extendedProps: {
            type: "task",
            status: task.status,
            priority: task.priority,
            clientId: calendarData.projects.find(p => p.id === task.projectId)?.clientId || undefined,
            projectId: task.projectId || undefined,
            userId: task.assignees?.[0]?.userId || undefined,
            taskId: task.id,
          },
        });
      }
    }
    
    if (showTimeEntries) {
      for (const entry of calendarData.timeEntries) {
        if (!entry.startTime) continue;
        
        if (clientFilter !== "all" && entry.clientId !== clientFilter) continue;
        if (projectFilter !== "all" && entry.projectId !== projectFilter) continue;
        if (assigneeFilter !== "all" && entry.userId !== assigneeFilter) continue;
        if (scopeFilter !== "all" && entry.scope !== scopeFilter) continue;
        
        const startTime = new Date(entry.startTime);
        const endTime = entry.endTime ? new Date(entry.endTime) : new Date(startTime.getTime() + (entry.durationSeconds || 0) * 1000);
        
        const isBillable = entry.scope === "out_of_scope";
        
        events.push({
          id: `time-${entry.id}`,
          title: entry.title || entry.description || "Time Entry",
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          allDay: false,
          type: "time_entry",
          backgroundColor: isBillable ? "#8B5CF6" : "#06B6D4",
          borderColor: isBillable ? "#7C3AED" : "#0891B2",
          textColor: "#FFFFFF",
          extendedProps: {
            type: "time_entry",
            scope: entry.scope,
            clientId: entry.clientId || undefined,
            projectId: entry.projectId || undefined,
            userId: entry.userId,
            duration: entry.durationSeconds || 0,
            timeEntryData: entry,
          },
        });
      }
    }
    
    return events;
  }, [calendarData, clientFilter, projectFilter, assigneeFilter, scopeFilter, showTasks, showTimeEntries]);

  const handleEventClick = useCallback(async (info: EventClickArg) => {
    const eventType = info.event.extendedProps.type;
    
    if (eventType === "task") {
      const taskId = info.event.extendedProps.taskId;
      if (taskId) {
        try {
          const response = await fetch(`/api/tasks/${taskId}`);
          if (response.ok) {
            const fullTask = await response.json() as TaskWithRelations;
            setSelectedTask(fullTask);
            setTaskDrawerOpen(true);
          }
        } catch (error) {
          console.error("Failed to fetch task:", error);
        }
      }
    } else if (eventType === "time_entry") {
      const timeEntryData = info.event.extendedProps.timeEntryData as TimeEntryWithRelations;
      if (timeEntryData) {
        setSelectedTimeEntry(timeEntryData);
        setTimeEntryDrawerOpen(true);
      }
    }
  }, []);

  const handleDatesSet = useCallback((dateInfo: DatesSetArg) => {
    setDateRange({
      start: dateInfo.startStr,
      end: dateInfo.endStr,
    });
  }, []);

  const handleViewChange = (view: "dayGridMonth" | "timeGridWeek" | "timeGridDay") => {
    setCurrentView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  const handlePrev = () => {
    calendarRef.current?.getApi().prev();
  };

  const handleNext = () => {
    calendarRef.current?.getApi().next();
  };

  const handleToday = () => {
    calendarRef.current?.getApi().today();
  };

  const activeFiltersCount = [
    clientFilter !== "all",
    projectFilter !== "all",
    assigneeFilter !== "all",
    scopeFilter !== "all",
    !showTasks,
    !showTimeEntries,
  ].filter(Boolean).length;

  const clearFilters = () => {
    setClientFilter("all");
    setProjectFilter("all");
    setAssigneeFilter("all");
    setScopeFilter("all");
    setShowTasks(true);
    setShowTimeEntries(true);
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (isLoading && !calendarData) {
    return (
      <div className="h-full p-6">
        <Skeleton className="w-full h-[calc(100vh-200px)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between px-3 md:px-6 py-2 md:py-3 border-b border-border bg-muted/30 gap-2">
        <div className="flex items-center justify-between md:justify-start gap-2 md:gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-base md:text-lg font-semibold">Calendar</h1>
          </div>
          <div className="flex items-center gap-1 md:hidden">
            <Button variant="outline" size="icon" onClick={handlePrev} data-testid="button-calendar-prev-mobile">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday} data-testid="button-calendar-today-mobile">
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={handleNext} data-testid="button-calendar-next-mobile">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
          <div className="flex items-center gap-0.5 border rounded-lg p-0.5 shrink-0">
            <Button
              variant={currentView === "dayGridMonth" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("dayGridMonth")}
              data-testid="button-view-month"
            >
              Month
            </Button>
            <Button
              variant={currentView === "timeGridWeek" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("timeGridWeek")}
              data-testid="button-view-week"
            >
              Week
            </Button>
            <Button
              variant={currentView === "timeGridDay" ? "default" : "ghost"}
              size="sm"
              onClick={() => handleViewChange("timeGridDay")}
              data-testid="button-view-day"
            >
              Day
            </Button>
          </div>
          
          <div className="hidden md:flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={handlePrev} data-testid="button-calendar-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleToday} data-testid="button-calendar-today">
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={handleNext} data-testid="button-calendar-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1 md:gap-2 shrink-0" data-testid="button-calendar-filters">
                <Filter className="h-4 w-4" />
                <span className="hidden md:inline">Filters</span>
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    Client
                  </Label>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="h-8" data-testid="select-client-filter">
                      <SelectValue placeholder="All clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {calendarData?.clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.displayName || client.companyName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <FolderOpen className="h-3.5 w-3.5" />
                    Project
                  </Label>
                  <Select value={projectFilter} onValueChange={setProjectFilter}>
                    <SelectTrigger className="h-8" data-testid="select-project-filter">
                      <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All projects</SelectItem>
                      {calendarData?.projects
                        .filter(p => clientFilter === "all" || p.clientId === clientFilter)
                        .map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <UserIcon className="h-3.5 w-3.5" />
                    Assigned User
                  </Label>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="h-8" data-testid="select-assignee-filter">
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All users</SelectItem>
                      {calendarData?.users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <DollarSign className="h-3.5 w-3.5" />
                    Billing Scope
                  </Label>
                  <Select value={scopeFilter} onValueChange={setScopeFilter}>
                    <SelectTrigger className="h-8" data-testid="select-scope-filter">
                      <SelectValue placeholder="All scopes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All scopes</SelectItem>
                      <SelectItem value="in_scope">In Scope (Unbillable)</SelectItem>
                      <SelectItem value="out_of_scope">Out of Scope (Billable)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs font-medium">Show on Calendar</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={showTasks ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowTasks(!showTasks)}
                      data-testid="button-toggle-tasks"
                    >
                      Tasks
                    </Button>
                    <Button
                      variant={showTimeEntries ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => setShowTimeEntries(!showTimeEntries)}
                      data-testid="button-toggle-time-entries"
                    >
                      Time Entries
                    </Button>
                  </div>
                </div>

                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={clearFilters}
                    data-testid="button-clear-filters"
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="flex items-center gap-4 px-6 py-2 border-b bg-background">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Legend:</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: "#06B6D4" }} />
            <span>In Scope (Unbillable)</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: "#8B5CF6" }} />
            <span>Out of Scope (Billable)</span>
          </div>
          <span className="mx-2">|</span>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: "#3B82F6" }} />
            <span>Task: In Progress</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded" style={{ backgroundColor: "#10B981" }} />
            <span>Task: Done</span>
          </div>
        </div>
        <div className="ml-auto text-xs text-muted-foreground">
          {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="h-full min-h-[500px]">
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin]}
            initialView={currentView}
            headerToolbar={false}
            events={filteredEvents}
            editable={false}
            selectable={false}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="100%"
            eventDisplay="block"
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
            }}
            nowIndicator={true}
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={true}
            dayMaxEvents={3}
          />
        </div>
      </div>

      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          open={taskDrawerOpen}
          onOpenChange={(open) => {
            setTaskDrawerOpen(open);
            if (!open) setSelectedTask(null);
          }}
        />
      )}

      {selectedTimeEntry && (
        <TimeEntryViewDrawer
          entry={selectedTimeEntry}
          open={timeEntryDrawerOpen}
          onOpenChange={(open) => {
            setTimeEntryDrawerOpen(open);
            if (!open) setSelectedTimeEntry(null);
          }}
        />
      )}
    </div>
  );
}

function TimeEntryViewDrawer({
  entry,
  open,
  onOpenChange,
}: {
  entry: TimeEntryWithRelations;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDateTime = (date: string | Date | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleString();
  };

  const isBillable = entry.scope === "out_of_scope";

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Time Entry Details"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {entry.title || entry.description || "Time Entry"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Duration</Label>
                <p className="font-medium">{formatDuration(entry.durationSeconds || 0)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Scope</Label>
                <Badge variant={isBillable ? "default" : "secondary"}>
                  {isBillable ? "Out of Scope (Billable)" : "In Scope (Unbillable)"}
                </Badge>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Start Time</Label>
                <p className="text-sm">{formatDateTime(entry.startTime)}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">End Time</Label>
                <p className="text-sm">{formatDateTime(entry.endTime)}</p>
              </div>
            </div>

            {entry.client && (
              <div>
                <Label className="text-xs text-muted-foreground">Client</Label>
                <p className="text-sm">{entry.client.displayName || entry.client.companyName}</p>
              </div>
            )}

            {entry.project && (
              <div>
                <Label className="text-xs text-muted-foreground">Project</Label>
                <p className="text-sm">{entry.project.name}</p>
              </div>
            )}

            {entry.task && (
              <div>
                <Label className="text-xs text-muted-foreground">Task</Label>
                <p className="text-sm">{entry.task.title}</p>
              </div>
            )}

            {entry.description && (
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <p className="text-sm whitespace-pre-wrap">{entry.description}</p>
              </div>
            )}

            {entry.user && (
              <div>
                <Label className="text-xs text-muted-foreground">Logged By</Label>
                <p className="text-sm">{entry.user.name}</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-time-entry">
            Close
          </Button>
        </div>
      </div>
    </FullScreenDrawer>
  );
}
