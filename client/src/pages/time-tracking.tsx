import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Clock, Play, Pause, Square, Plus, Download, Filter, 
  ChevronDown, Timer, Calendar, BarChart3, Trash2, Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { TaskSelectorWithCreate } from "@/components/task-selector-with-create";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from "date-fns";

type ActiveTimer = {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string | null;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
};

type TimeEntry = {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  startTime: string;
  endTime: string | null;
  durationSeconds: number;
  scope: "in_scope" | "out_of_scope";
  isManual: boolean;
  createdAt: string;
  client?: { id: string; companyName: string; displayName: string | null };
  project?: { id: string; name: string };
  task?: { id: string; title: string };
  user?: { id: string; name: string; email: string };
};

type ReportSummary = {
  totalSeconds: number;
  inScopeSeconds: number;
  outOfScopeSeconds: number;
  entryCount: number;
  byClient: Array<{ id: string; name: string; seconds: number }>;
  byProject: Array<{ id: string; name: string; clientName: string | null; seconds: number }>;
  byUser: Array<{ id: string; name: string; seconds: number }>;
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatDurationShort(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function ActiveTimerPanel() {
  const { toast } = useToast();
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [stopDialogOpen, setStopDialogOpen] = useState(false);
  const [stopScope, setStopScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [stopDescription, setStopDescription] = useState("");
  const [stopTaskId, setStopTaskId] = useState<string | null>(null);

  const { data: timer, isLoading } = useQuery<ActiveTimer | null>({
    queryKey: ["/api/timer/current"],
  });

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
  });

  const startMutation = useMutation({
    mutationFn: (data: { clientId?: string; projectId?: string; description?: string }) =>
      apiRequest("POST", "/api/timer/start", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer started" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to start timer", description: error.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/timer/pause"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer paused" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/timer/resume"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      toast({ title: "Timer resumed" });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (data: { discard?: boolean; scope?: string; description?: string; taskId?: string | null }) =>
      apiRequest("POST", "/api/timer/stop", data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      if (variables.discard) {
        toast({ title: "Timer discarded" });
      } else {
        toast({ title: "Time entry saved" });
      }
      setStopDialogOpen(false);
      setStopTaskId(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { clientId?: string | null; projectId?: string | null; description?: string | null }) =>
      apiRequest("PATCH", "/api/timer/current", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
    },
  });

  useEffect(() => {
    if (!timer) {
      setDisplaySeconds(0);
      return;
    }

    const calculateElapsed = () => {
      let elapsed = timer.elapsedSeconds;
      if (timer.status === "running" && timer.lastStartedAt) {
        const lastStarted = new Date(timer.lastStartedAt).getTime();
        const now = Date.now();
        elapsed += Math.floor((now - lastStarted) / 1000);
      }
      return elapsed;
    };

    setDisplaySeconds(calculateElapsed());

    if (timer.status === "running") {
      const interval = setInterval(() => {
        setDisplaySeconds(calculateElapsed());
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [timer]);

  useEffect(() => {
    if (timer?.description) {
      setStopDescription(timer.description);
    }
  }, [timer?.description]);

  useEffect(() => {
    setStopTaskId(timer?.taskId || null);
  }, [timer?.taskId, timer?.projectId]);

  const handleStartTimer = useCallback(() => {
    startMutation.mutate({});
  }, [startMutation]);

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
            <div className="flex-1">
              <div className="h-8 w-32 bg-muted animate-pulse rounded mb-2" />
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!timer) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
                <Timer className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-3xl font-mono font-bold text-foreground" data-testid="text-timer-display">
                  00:00:00
                </p>
                <p className="text-sm text-muted-foreground">No active timer</p>
              </div>
            </div>
            <Button
              size="lg"
              onClick={handleStartTimer}
              disabled={startMutation.isPending}
              data-testid="button-start-timer"
            >
              <Play className="h-5 w-5 mr-2" />
              Start Timer
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="mb-6 border-primary/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <div className={`flex items-center justify-center h-16 w-16 rounded-full ${
                timer.status === "running" ? "bg-primary/20 animate-pulse" : "bg-muted"
              }`}>
                <Timer className={`h-8 w-8 ${timer.status === "running" ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="text-4xl font-mono font-bold text-foreground" data-testid="text-timer-display">
                  {formatDuration(displaySeconds)}
                </p>
                <Badge variant={timer.status === "running" ? "default" : "secondary"}>
                  {timer.status === "running" ? "Running" : "Paused"}
                </Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {timer.status === "running" ? (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => pauseMutation.mutate()}
                  disabled={pauseMutation.isPending}
                  data-testid="button-pause-timer"
                >
                  <Pause className="h-5 w-5 mr-2" />
                  Pause
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => resumeMutation.mutate()}
                  disabled={resumeMutation.isPending}
                  data-testid="button-resume-timer"
                >
                  <Play className="h-5 w-5 mr-2" />
                  Resume
                </Button>
              )}
              <Button
                size="lg"
                onClick={() => setStopDialogOpen(true)}
                data-testid="button-stop-timer"
              >
                <Square className="h-5 w-5 mr-2" />
                Stop
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-xs text-muted-foreground">Client</Label>
              <Select
                value={timer.clientId || "none"}
                onValueChange={(value) => updateMutation.mutate({ clientId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-timer-client">
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.displayName || client.companyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Project</Label>
              <Select
                value={timer.projectId || "none"}
                onValueChange={(value) => updateMutation.mutate({ projectId: value === "none" ? null : value })}
              >
                <SelectTrigger data-testid="select-timer-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input
                value={timer.description || ""}
                onChange={(e) => updateMutation.mutate({ description: e.target.value })}
                placeholder="What are you working on?"
                data-testid="input-timer-description"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={stopDialogOpen} onOpenChange={setStopDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Timer</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="text-center">
              <p className="text-3xl font-mono font-bold">{formatDuration(displaySeconds)}</p>
              <p className="text-sm text-muted-foreground mt-1">Total time tracked</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={stopDescription}
                onChange={(e) => setStopDescription(e.target.value)}
                placeholder="What did you work on?"
                data-testid="input-stop-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={stopScope} onValueChange={(v) => setStopScope(v as "in_scope" | "out_of_scope")}>
                <SelectTrigger data-testid="select-stop-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_scope">In Scope (Billable)</SelectItem>
                  <SelectItem value="out_of_scope">Out of Scope</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {timer?.projectId && (
              <TaskSelectorWithCreate
                projectId={timer.projectId}
                taskId={stopTaskId}
                onTaskChange={setStopTaskId}
              />
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => stopMutation.mutate({ discard: true })}
              disabled={stopMutation.isPending}
              data-testid="button-discard-timer"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Discard
            </Button>
            <Button
              onClick={() => stopMutation.mutate({ scope: stopScope, description: stopDescription, taskId: stopTaskId })}
              disabled={stopMutation.isPending}
              data-testid="button-save-timer"
            >
              Save Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ManualEntryDialog({ 
  open, 
  onOpenChange 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [clientId, setClientId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [scope, setScope] = useState<"in_scope" | "out_of_scope">("in_scope");

  const { data: projects = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
  });

  const handleProjectChange = (newProjectId: string | null) => {
    setProjectId(newProjectId);
    setTaskId(null);
  };

  const createMutation = useMutation({
    mutationFn: (data: {
      description: string;
      durationSeconds: number;
      startTime: string;
      clientId: string | null;
      projectId: string | null;
      taskId: string | null;
      scope: string;
    }) => apiRequest("POST", "/api/time-entries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
      toast({ title: "Time entry created" });
      onOpenChange(false);
      setDescription("");
      setHours("0");
      setMinutes("30");
      setTaskId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create entry", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    const durationSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60;
    if (durationSeconds === 0) {
      toast({ title: "Duration required", description: "Please enter a duration greater than 0", variant: "destructive" });
      return;
    }
    const startTime = new Date(`${date}T09:00:00`);
    createMutation.mutate({
      description,
      durationSeconds,
      startTime: startTime.toISOString(),
      clientId,
      projectId,
      taskId,
      scope,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Time Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              data-testid="input-manual-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                type="number"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                data-testid="input-manual-hours"
              />
            </div>
            <div className="space-y-2">
              <Label>Minutes</Label>
              <Input
                type="number"
                min="0"
                max="59"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                data-testid="input-manual-minutes"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              data-testid="input-manual-date"
            />
          </div>
          <div className="space-y-2">
            <Label>Client</Label>
            <Select value={clientId || "none"} onValueChange={(v) => setClientId(v === "none" ? null : v)}>
              <SelectTrigger data-testid="select-manual-client">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.displayName || client.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId || "none"} onValueChange={(v) => handleProjectChange(v === "none" ? null : v)}>
              <SelectTrigger data-testid="select-manual-project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TaskSelectorWithCreate
            projectId={projectId}
            taskId={taskId}
            onTaskChange={setTaskId}
          />
          <div className="space-y-2">
            <Label>Scope</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as "in_scope" | "out_of_scope")}>
              <SelectTrigger data-testid="select-manual-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_scope">In Scope (Billable)</SelectItem>
                <SelectItem value="out_of_scope">Out of Scope</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={createMutation.isPending} data-testid="button-save-manual-entry">
            Save Entry
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TimeEntriesList() {
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("week");

  const getDateRange = () => {
    const now = new Date();
    switch (dateFilter) {
      case "today":
        return { startDate: format(now, "yyyy-MM-dd"), endDate: format(now, "yyyy-MM-dd") };
      case "week":
        return { startDate: format(startOfWeek(now), "yyyy-MM-dd"), endDate: format(endOfWeek(now), "yyyy-MM-dd") };
      case "month":
        return { startDate: format(startOfMonth(now), "yyyy-MM-dd"), endDate: format(endOfMonth(now), "yyyy-MM-dd") };
      default:
        return {};
    }
  };

  const { startDate, endDate } = getDateRange();
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data: entries = [], isLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries", dateFilter],
    queryFn: () => 
      fetch(`/api/time-entries?${queryParams.toString()}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/time-entries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
  });

  const groupedEntries = entries.reduce((acc, entry) => {
    const date = format(parseISO(entry.startTime), "yyyy-MM-dd");
    if (!acc[date]) acc[date] = [];
    acc[date].push(entry);
    return acc;
  }, {} as Record<string, TimeEntry[]>);

  const sortedDates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-medium">Time Entries</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as any)}>
              <SelectTrigger className="w-32" data-testid="select-date-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setManualEntryOpen(true)} data-testid="button-add-manual-entry">
              <Plus className="h-4 w-4 mr-2" />
              Add Entry
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : sortedDates.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <p className="text-muted-foreground">No time entries found for this period</p>
            </div>
          ) : (
            <div className="space-y-6">
              {sortedDates.map((date) => {
                const dayEntries = groupedEntries[date];
                const dayTotal = dayEntries.reduce((sum, e) => sum + e.durationSeconds, 0);
                
                return (
                  <div key={date}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-muted-foreground">
                        {format(parseISO(date), "EEEE, MMMM d")}
                      </h3>
                      <Badge variant="secondary">{formatDurationShort(dayTotal)}</Badge>
                    </div>
                    <div className="space-y-2">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover-elevate"
                          data-testid={`time-entry-${entry.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-medium truncate">
                                {entry.description || "No description"}
                              </p>
                              <Badge 
                                variant={entry.scope === "in_scope" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {entry.scope === "in_scope" ? "Billable" : "Non-billable"}
                              </Badge>
                              {entry.isManual && (
                                <Badge variant="outline" className="text-xs">Manual</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              {entry.client && (
                                <span>{entry.client.displayName || entry.client.companyName}</span>
                              )}
                              {entry.client && entry.project && <span>·</span>}
                              {entry.project && <span>{entry.project.name}</span>}
                              {entry.task && (
                                <>
                                  <span>·</span>
                                  <span>{entry.task.title}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-mono font-medium">
                                {formatDurationShort(entry.durationSeconds)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(parseISO(entry.startTime), "h:mm a")}
                                {entry.endTime && ` - ${format(parseISO(entry.endTime), "h:mm a")}`}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-entry-menu-${entry.id}`}>
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => deleteMutation.mutate(entry.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ManualEntryDialog open={manualEntryOpen} onOpenChange={setManualEntryOpen} />
    </>
  );
}

function ReportsSummary() {
  const [dateRange, setDateRange] = useState<"week" | "month" | "all">("month");

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case "week":
        return { startDate: format(startOfWeek(now), "yyyy-MM-dd"), endDate: format(endOfWeek(now), "yyyy-MM-dd") };
      case "month":
        return { startDate: format(startOfMonth(now), "yyyy-MM-dd"), endDate: format(endOfMonth(now), "yyyy-MM-dd") };
      default:
        return {};
    }
  };

  const { startDate, endDate } = getDateRange();
  const queryParams = new URLSearchParams();
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data: summary, isLoading } = useQuery<ReportSummary>({
    queryKey: ["/api/time-entries/report/summary", dateRange],
    queryFn: () => 
      fetch(`/api/time-entries/report/summary?${queryParams.toString()}`).then(r => r.json()),
  });

  const handleExport = () => {
    const exportParams = new URLSearchParams();
    if (startDate) exportParams.set("startDate", startDate);
    if (endDate) exportParams.set("endDate", endDate);
    window.location.href = `/api/time-entries/export/csv?${exportParams.toString()}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-medium">Summary</CardTitle>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <SelectTrigger className="w-32" data-testid="select-report-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="all">All Time</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleExport} data-testid="button-export-csv">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total Time</p>
            <p className="text-2xl font-mono font-bold">{formatDurationShort(summary.totalSeconds)}</p>
            <p className="text-xs text-muted-foreground">{summary.entryCount} entries</p>
          </div>
          <div className="p-4 rounded-lg bg-primary/10">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Billable</p>
            <p className="text-2xl font-mono font-bold text-primary">{formatDurationShort(summary.inScopeSeconds)}</p>
            <p className="text-xs text-muted-foreground">In scope</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Non-billable</p>
            <p className="text-2xl font-mono font-bold">{formatDurationShort(summary.outOfScopeSeconds)}</p>
            <p className="text-xs text-muted-foreground">Out of scope</p>
          </div>
        </div>

        {summary.byClient.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium mb-3">By Client</h4>
            <div className="space-y-2">
              {summary.byClient.map((client) => (
                <div key={client.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <span className="text-sm">{client.name}</span>
                  <span className="text-sm font-mono">{formatDurationShort(client.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {summary.byProject.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-3">By Project</h4>
            <div className="space-y-2">
              {summary.byProject.map((project) => (
                <div key={project.id} className="flex items-center justify-between p-2 rounded bg-muted/30">
                  <div>
                    <span className="text-sm">{project.name}</span>
                    {project.clientName && (
                      <span className="text-xs text-muted-foreground ml-2">({project.clientName})</span>
                    )}
                  </div>
                  <span className="text-sm font-mono">{formatDurationShort(project.seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TimeTrackingPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-time-tracking-title">
            Time Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Track time spent on tasks and projects
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <ActiveTimerPanel />

        <Tabs defaultValue="entries" className="mt-6">
          <TabsList>
            <TabsTrigger value="entries" data-testid="tab-entries">
              <Clock className="h-4 w-4 mr-2" />
              Entries
            </TabsTrigger>
            <TabsTrigger value="reports" data-testid="tab-reports">
              <BarChart3 className="h-4 w-4 mr-2" />
              Reports
            </TabsTrigger>
          </TabsList>
          <TabsContent value="entries" className="mt-4">
            <TimeEntriesList />
          </TabsContent>
          <TabsContent value="reports" className="mt-4">
            <ReportsSummary />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
