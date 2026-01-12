import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg, DateSelectArg, DatesSetArg } from "@fullcalendar/core";
import { Filter, User as UserIcon, Tag as TagIcon, Layers, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskWithRelations, Tag, User, Section } from "@shared/schema";

interface CalendarEvent {
  id: string;
  title: string;
  dueDate: string | Date | null;
  parentTaskId: string | null;
  status: string;
  priority: string;
  sectionId: string | null;
  projectId: string;
  assignees: { user?: User }[];
  tags: { tag?: Tag }[];
  isSubtask: boolean;
}

interface ProjectCalendarProps {
  projectId: string;
  sections: Section[];
  onTaskSelect: (task: TaskWithRelations) => void;
  onDateClick?: (date: Date) => void;
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

export function ProjectCalendar({
  projectId,
  sections,
  onTaskSelect,
  onDateClick,
}: ProjectCalendarProps) {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: "",
    end: "",
  });
  const [includeSubtasks, setIncludeSubtasks] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: calendarEvents = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: [
      "/api/projects",
      projectId,
      "calendar-events",
      { start: dateRange.start, end: dateRange.end, includeSubtasks },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.start) params.set("start", dateRange.start);
      if (dateRange.end) params.set("end", dateRange.end);
      params.set("includeSubtasks", includeSubtasks.toString());
      
      const response = await fetch(
        `/api/projects/${projectId}/calendar-events?${params.toString()}`
      );
      if (!response.ok) throw new Error("Failed to fetch calendar events");
      return response.json();
    },
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery<TaskWithRelations[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  const { data: tags = [] } = useQuery<Tag[]>({
    queryKey: ["/api/workspaces", "demo-workspace-id", "tags"],
    queryFn: async () => {
      const response = await fetch("/api/workspaces/demo-workspace-id/tags");
      if (!response.ok) throw new Error("Failed to fetch tags");
      return response.json();
    },
  });

  const uniqueAssignees = useMemo(() => {
    const assigneeMap = new Map<string, User>();
    calendarEvents.forEach((event) => {
      event.assignees?.forEach((a) => {
        if (a.user && !assigneeMap.has(a.user.id)) {
          assigneeMap.set(a.user.id, a.user);
        }
      });
    });
    return Array.from(assigneeMap.values());
  }, [calendarEvents]);

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, data }: { taskId: string; data: Partial<TaskWithRelations> }) => {
      return apiRequest("PATCH", `/api/tasks/${taskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
    },
    onError: () => {
      toast({
        title: "Failed to update task",
        description: "Could not update the task date. Please try again.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "calendar-events"] });
    },
  });

  const filteredEvents = useMemo(() => {
    return calendarEvents.filter((event) => {
      if (statusFilter !== "all" && event.status !== statusFilter) return false;
      
      if (assigneeFilter !== "all") {
        const hasAssignee = event.assignees?.some((a) => a.user?.id === assigneeFilter);
        if (!hasAssignee) return false;
      }
      
      if (tagFilter !== "all") {
        const hasTag = event.tags?.some((t) => t.tag?.id === tagFilter);
        if (!hasTag) return false;
      }
      
      return true;
    });
  }, [calendarEvents, statusFilter, assigneeFilter, tagFilter]);

  const fullCalendarEvents = useMemo(() => {
    return filteredEvents.map((event) => ({
      id: event.id,
      title: event.isSubtask ? `↳ ${event.title}` : event.title,
      start: event.dueDate ? new Date(event.dueDate) : undefined,
      allDay: true,
      backgroundColor: statusColors[event.status] || "#6B7280",
      borderColor: priorityColors[event.priority] || "#6B7280",
      textColor: "#FFFFFF",
      extendedProps: {
        isSubtask: event.isSubtask,
        parentTaskId: event.parentTaskId,
        status: event.status,
        priority: event.priority,
        sectionId: event.sectionId,
        assignees: event.assignees,
        tags: event.tags,
      },
    }));
  }, [filteredEvents]);

  const handleEventClick = useCallback(
    async (info: EventClickArg) => {
      const eventId = info.event.id;
      const isSubtask = info.event.extendedProps.isSubtask;
      
      try {
        const response = await fetch(`/api/tasks/${eventId}`);
        if (response.ok) {
          const task = await response.json();
          onTaskSelect(task);
        }
      } catch (error) {
        console.error("Failed to fetch task:", error);
      }
    },
    [onTaskSelect]
  );

  const handleEventDrop = useCallback(
    (info: EventDropArg) => {
      const eventId = info.event.id;
      const newDate = info.event.start;
      
      if (!newDate) {
        info.revert();
        return;
      }
      
      updateTaskMutation.mutate(
        {
          taskId: eventId,
          data: { dueDate: newDate },
        },
        {
          onError: () => {
            info.revert();
          },
        }
      );
      
      toast({
        title: "Task rescheduled",
        description: `Task moved to ${newDate.toLocaleDateString()}`,
      });
    },
    [updateTaskMutation, toast]
  );

  const handleDateSelect = useCallback(
    (info: DateSelectArg) => {
      if (onDateClick) {
        onDateClick(info.start);
      }
    },
    [onDateClick]
  );

  const handleDatesSet = useCallback((dateInfo: DatesSetArg) => {
    setDateRange({
      start: dateInfo.startStr,
      end: dateInfo.endStr,
    });
  }, []);

  const activeFiltersCount = [
    statusFilter !== "all",
    assigneeFilter !== "all",
    tagFilter !== "all",
    !includeSubtasks,
  ].filter(Boolean).length;

  if (isLoading) {
    return (
      <div className="h-full p-6">
        <Skeleton className="w-full h-[calc(100vh-200px)]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2" data-testid="button-calendar-filters">
                <Filter className="h-4 w-4" />
                Filters
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="start">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <Layers className="h-3.5 w-3.5" />
                    Status
                  </Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-8" data-testid="select-status-filter">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="todo">To Do</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                      <SelectItem value="done">Done</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <UserIcon className="h-3.5 w-3.5" />
                    Assignee
                  </Label>
                  <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                    <SelectTrigger className="h-8" data-testid="select-assignee-filter">
                      <SelectValue placeholder="All assignees" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All assignees</SelectItem>
                      {uniqueAssignees.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <TagIcon className="h-3.5 w-3.5" />
                    Tag
                  </Label>
                  <Select value={tagFilter} onValueChange={setTagFilter}>
                    <SelectTrigger className="h-8" data-testid="select-tag-filter">
                      <SelectValue placeholder="All tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All tags</SelectItem>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: tag.color || "#6B7280" }}
                            />
                            {tag.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2 text-xs font-medium">
                    <CornerDownRight className="h-3.5 w-3.5" />
                    Include sub-tasks
                  </Label>
                  <Switch
                    checked={includeSubtasks}
                    onCheckedChange={setIncludeSubtasks}
                    data-testid="switch-include-subtasks"
                  />
                </div>

                {activeFiltersCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setStatusFilter("all");
                      setAssigneeFilter("all");
                      setTagFilter("all");
                      setIncludeSubtasks(true);
                    }}
                    data-testid="button-clear-filters"
                  >
                    Clear all filters
                  </Button>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <div className="text-xs text-muted-foreground">
            {filteredEvents.length} event{filteredEvents.length !== 1 ? "s" : ""}
          </div>
        </div>
      </div>

      <div className="flex-1 p-6 overflow-auto">
        <div className="h-full min-h-[500px]">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek",
            }}
            events={fullCalendarEvents}
            editable={true}
            selectable={true}
            selectMirror={true}
            dayMaxEvents={true}
            eventClick={handleEventClick}
            eventDrop={handleEventDrop}
            select={handleDateSelect}
            datesSet={handleDatesSet}
            height="100%"
            eventDisplay="block"
            eventTimeFormat={{
              hour: "numeric",
              minute: "2-digit",
              meridiem: "short",
            }}
            nowIndicator={true}
          />
        </div>
      </div>
    </div>
  );
}
