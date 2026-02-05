import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, DatesSetArg, DateSelectArg } from "@fullcalendar/core";
import { 
  Clock, Calendar, ChevronLeft, ChevronRight, Play, AlertCircle, 
  CheckCircle2, Circle, Timer, ListTodo
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { TaskDetailDrawer } from "@/features/tasks";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Link } from "wouter";
import type { TaskWithRelations, TimeEntryWithRelations } from "@shared/schema";

interface CalendarTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | Date | null;
  projectId: string | null;
  isPersonal?: boolean;
  assignees?: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
}

interface MyCalendarEvent {
  id: string;
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  type: "task" | "time_entry" | "personal_task";
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    type: "task" | "time_entry" | "personal_task";
    status?: string;
    priority?: string;
    isOverdue?: boolean;
    taskId?: string;
    timeEntryData?: TimeEntryWithRelations;
    duration?: number;
  };
}

interface MyCalendarDataResponse {
  tasks: CalendarTask[];
  personalTasks: CalendarTask[];
  timeEntries: TimeEntryWithRelations[];
}

const statusColors: Record<string, string> = {
  not_started: "#6B7280",
  in_progress: "#3B82F6",
  on_hold: "#F59E0B",
  completed: "#10B981",
  cancelled: "#EF4444",
};

const priorityColors: Record<string, string> = {
  low: "#6B7280",
  medium: "#F59E0B",
  high: "#EF4444",
  urgent: "#DC2626",
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export default function MyCalendarPage() {
  const { toast } = useToast();
  const calendarRef = useRef<FullCalendar>(null);
  const [currentView, setCurrentView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay">("timeGridWeek");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString(),
    end: new Date(new Date().setDate(new Date().getDate() + 30)).toISOString(),
  });
  
  const [showTasks, setShowTasks] = useState(true);
  const [showPersonalTasks, setShowPersonalTasks] = useState(true);
  const [showTimeEntries, setShowTimeEntries] = useState(true);
  
  const [selectedTask, setSelectedTask] = useState<TaskWithRelations | null>(null);
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);
  const [selectedTimeEntry, setSelectedTimeEntry] = useState<TimeEntryWithRelations | null>(null);
  const [timeEntryDrawerOpen, setTimeEntryDrawerOpen] = useState(false);
  
  const { data: calendarData, isLoading, error } = useQuery<MyCalendarDataResponse>({
    queryKey: ["/api/my-calendar/events", dateRange.start, dateRange.end],
    queryFn: async () => {
      const params = new URLSearchParams({
        start: dateRange.start,
        end: dateRange.end,
      });
      const response = await fetch(`/api/my-calendar/events?${params}`);
      if (!response.ok) throw new Error("Failed to fetch calendar data");
      return response.json();
    },
  });
  
  const startTimerMutation = useMutation({
    mutationFn: async (params: { taskId?: string; description?: string }) => {
      return apiRequest("POST", "/api/active-timer/start", params);
    },
    onSuccess: () => {
      toast({ title: "Timer started" });
      queryClient.invalidateQueries({ queryKey: ["/api/active-timer"] });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Failed to start timer", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });
  
  const events = useMemo(() => {
    if (!calendarData) return [];
    
    const events: MyCalendarEvent[] = [];
    const now = new Date();
    
    if (showTasks) {
      for (const task of calendarData.tasks) {
        if (!task.dueDate) continue;
        
        const dueDate = new Date(task.dueDate);
        const isOverdue = task.status !== "completed" && dueDate < now;
        const dueDateStr = task.dueDate instanceof Date 
          ? task.dueDate.toISOString() 
          : String(task.dueDate);
        
        events.push({
          id: `task-${task.id}`,
          title: task.title,
          start: dueDateStr,
          allDay: true,
          type: "task",
          backgroundColor: isOverdue ? "#EF4444" : (statusColors[task.status] || "#6B7280"),
          borderColor: priorityColors[task.priority] || "#6B7280",
          textColor: "#FFFFFF",
          extendedProps: {
            type: "task",
            status: task.status,
            priority: task.priority,
            isOverdue,
            taskId: task.id,
          },
        });
      }
    }
    
    if (showPersonalTasks) {
      for (const task of calendarData.personalTasks) {
        if (!task.dueDate) continue;
        
        const dueDate = new Date(task.dueDate);
        const isOverdue = task.status !== "completed" && dueDate < now;
        const dueDateStr = task.dueDate instanceof Date 
          ? task.dueDate.toISOString() 
          : String(task.dueDate);
        
        events.push({
          id: `personal-${task.id}`,
          title: `[Personal] ${task.title}`,
          start: dueDateStr,
          allDay: true,
          type: "personal_task",
          backgroundColor: isOverdue ? "#DC2626" : "#8B5CF6",
          borderColor: priorityColors[task.priority] || "#8B5CF6",
          textColor: "#FFFFFF",
          extendedProps: {
            type: "personal_task",
            status: task.status,
            priority: task.priority,
            isOverdue,
            taskId: task.id,
          },
        });
      }
    }
    
    if (showTimeEntries) {
      for (const entry of calendarData.timeEntries) {
        if (!entry.startTime) continue;
        
        const isBillable = entry.scope === "out_of_scope";
        const startTime = new Date(entry.startTime);
        const endTime = entry.endTime 
          ? new Date(entry.endTime) 
          : new Date(startTime.getTime() + entry.durationSeconds * 1000);
        
        events.push({
          id: `time-${entry.id}`,
          title: entry.description || entry.project?.name || (entry.client as any)?.companyName || "Time Entry",
          start: startTime.toISOString(),
          end: endTime.toISOString(),
          allDay: false,
          type: "time_entry",
          backgroundColor: isBillable ? "#8B5CF6" : "#06B6D4",
          borderColor: isBillable ? "#7C3AED" : "#0891B2",
          textColor: "#FFFFFF",
          extendedProps: {
            type: "time_entry",
            timeEntryData: entry,
            duration: entry.durationSeconds,
          },
        });
      }
    }
    
    return events;
  }, [calendarData, showTasks, showPersonalTasks, showTimeEntries]);
  
  const handleEventClick = useCallback(async (info: EventClickArg) => {
    const eventType = info.event.extendedProps.type;
    
    if (eventType === "task" || eventType === "personal_task") {
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
  
  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    const startTime = selectInfo.start;
    const description = `Work on ${startTime.toLocaleDateString()}`;
    
    startTimerMutation.mutate({ description });
    
    const calendarApi = selectInfo.view.calendar;
    calendarApi.unselect();
  }, [startTimerMutation]);
  
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
  
  const handlePrev = () => calendarRef.current?.getApi().prev();
  const handleNext = () => calendarRef.current?.getApi().next();
  const handleToday = () => calendarRef.current?.getApi().today();
  
  const handleStartTimerFromTask = (taskId: string, taskTitle: string) => {
    startTimerMutation.mutate({ taskId, description: taskTitle });
  };
  
  if (error) {
    return (
      <div className="p-6">
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">Failed to load calendar. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-semibold text-[24px]" data-testid="page-title">My Calendar</h1>
          <Badge variant="secondary" className="text-xs">Personal View</Badge>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-4 mr-4">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="show-tasks" 
                checked={showTasks} 
                onCheckedChange={(c) => setShowTasks(!!c)}
                data-testid="checkbox-show-tasks"
              />
              <Label htmlFor="show-tasks" className="text-sm flex items-center gap-1">
                <ListTodo className="h-3 w-3" /> Tasks
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="show-personal" 
                checked={showPersonalTasks} 
                onCheckedChange={(c) => setShowPersonalTasks(!!c)}
                data-testid="checkbox-show-personal"
              />
              <Label htmlFor="show-personal" className="text-sm flex items-center gap-1">
                <Circle className="h-3 w-3" /> Personal
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox 
                id="show-time" 
                checked={showTimeEntries} 
                onCheckedChange={(c) => setShowTimeEntries(!!c)}
                data-testid="checkbox-show-time"
              />
              <Label htmlFor="show-time" className="text-sm flex items-center gap-1">
                <Timer className="h-3 w-3" /> Time
              </Label>
            </div>
          </div>
          
          <div className="flex items-center gap-1 border rounded-md">
            <Button 
              size="sm" 
              variant={currentView === "dayGridMonth" ? "default" : "ghost"}
              onClick={() => handleViewChange("dayGridMonth")}
              data-testid="button-view-month"
            >
              Month
            </Button>
            <Button 
              size="sm" 
              variant={currentView === "timeGridWeek" ? "default" : "ghost"}
              onClick={() => handleViewChange("timeGridWeek")}
              data-testid="button-view-week"
            >
              Week
            </Button>
            <Button 
              size="sm" 
              variant={currentView === "timeGridDay" ? "default" : "ghost"}
              onClick={() => handleViewChange("timeGridDay")}
              data-testid="button-view-day"
            >
              Day
            </Button>
          </div>
          
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" onClick={handlePrev} data-testid="button-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button size="sm" variant="outline" onClick={handleToday} data-testid="button-today">
              Today
            </Button>
            <Button size="icon" variant="outline" onClick={handleNext} data-testid="button-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 p-4 min-h-0">
        {isLoading ? (
          <div className="h-full flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={currentView}
            events={events}
            headerToolbar={false}
            selectable={true}
            selectMirror={true}
            editable={false}
            eventClick={handleEventClick}
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
            slotMinTime="06:00:00"
            slotMaxTime="22:00:00"
            allDaySlot={true}
            dayMaxEvents={3}
          />
        )}
      </div>
      <div className="p-4 border-t">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#3B82F6" }} />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#10B981" }} />
              <span>Completed</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#EF4444" }} />
              <span>Overdue</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#8B5CF6" }} />
              <span>Personal / Billable</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: "#06B6D4" }} />
              <span>Non-billable</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link href="/my-time">
              <Button size="sm" variant="outline" data-testid="button-my-time">
                <Clock className="h-4 w-4 mr-1" />
                My Time Stats
              </Button>
            </Link>
            <Link href="/calendar">
              <Button size="sm" variant="ghost" data-testid="button-team-calendar">
                Team Calendar
              </Button>
            </Link>
          </div>
        </div>
      </div>
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          open={taskDrawerOpen}
          onOpenChange={setTaskDrawerOpen}
        />
      )}
      {selectedTimeEntry && (
        <FullScreenDrawer
          open={timeEntryDrawerOpen}
          onOpenChange={setTimeEntryDrawerOpen}
          title="Time Entry Details"
        >
          <div className="p-6 space-y-4">
            <div>
              <h3 className="font-medium">{selectedTimeEntry.description || "No description"}</h3>
              <p className="text-sm text-muted-foreground">
                {selectedTimeEntry.project?.name || (selectedTimeEntry.client as any)?.companyName || "No project"}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Duration</span>
                <p className="font-medium">{formatDuration(selectedTimeEntry.durationSeconds)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Type</span>
                <p className="font-medium">
                  {selectedTimeEntry.scope === "out_of_scope" ? "Billable" : "Non-billable"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Start Time</span>
                <p className="font-medium">
                  {new Date(selectedTimeEntry.startTime).toLocaleString()}
                </p>
              </div>
              {selectedTimeEntry.endTime && (
                <div>
                  <span className="text-muted-foreground">End Time</span>
                  <p className="font-medium">
                    {new Date(selectedTimeEntry.endTime).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
            
            <div className="pt-4">
              <Link href={`/my-time?edit=${selectedTimeEntry.id}`}>
                <Button data-testid="button-edit-time-entry">
                  Edit Time Entry
                </Button>
              </Link>
            </div>
          </div>
        </FullScreenDrawer>
      )}
    </div>
  );
}
