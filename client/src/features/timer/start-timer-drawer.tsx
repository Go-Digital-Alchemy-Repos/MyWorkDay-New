import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaskSelectorWithCreate } from "@/features/tasks";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { RichTextEditor } from "@/components/richtext";

const BROADCAST_CHANNEL_NAME = "active-timer-sync";

interface StartTimerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-populate the client field */
  initialClientId?: string | null;
  /** Pre-populate the project field */
  initialProjectId?: string | null;
  /** Pre-populate the task field */
  initialTaskId?: string | null;
}

export function StartTimerDrawer({ 
  open, 
  onOpenChange,
  initialClientId = null,
  initialProjectId = null,
  initialTaskId = null,
}: StartTimerDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [hasChanges, setHasChanges] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  const broadcastTimerUpdate = useCallback(() => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "timer-updated" });
      } catch {
        // BroadcastChannel may fail in some environments
      }
    }
    try {
      localStorage.setItem("timer-sync", Date.now().toString());
      localStorage.removeItem("timer-sync");
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // Setup BroadcastChannel
  useEffect(() => {
    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    } catch {
      // BroadcastChannel not supported
    }
    return () => {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
    };
  }, []);

  const { data: clients = [] } = useQuery<Array<{ id: string; companyName: string; displayName: string | null }>>({
    queryKey: ["/api/clients"],
    enabled: open,
  });

  const { data: clientDivisions = [], isLoading: divisionsLoading } = useQuery<Array<{ id: string; name: string; color?: string | null }>>({
    queryKey: ["/api/v1/clients", clientId, "divisions"],
    queryFn: () => fetch(`/api/v1/clients/${clientId}/divisions`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  const clientHasDivisions = clientDivisions.length > 0;

  const { data: clientProjects = [] } = useQuery<Array<{ id: string; name: string; divisionId?: string | null }>>({
    queryKey: ["/api/clients", clientId, "projects"],
    queryFn: () => fetch(`/api/clients/${clientId}/projects`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!clientId && open,
  });

  const projects = clientHasDivisions && divisionId
    ? clientProjects.filter(p => p.divisionId === divisionId)
    : clientProjects;

  const startMutation = useMutation({
    mutationFn: async (data: { clientId?: string | null; projectId?: string | null; taskId?: string | null; title?: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/timer/start", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.error === "TIMER_ALREADY_RUNNING") {
          throw new Error("TIMER_ALREADY_RUNNING");
        }
        throw new Error(errorData.message || errorData.error || "Failed to start timer");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
      broadcastTimerUpdate();
      toast({ title: "Timer started" });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: Error) => {
      if (error.message === "TIMER_ALREADY_RUNNING") {
        toast({ 
          title: "Timer already running", 
          description: "You already have an active timer. Stop it before starting a new one.", 
          variant: "destructive" 
        });
        queryClient.invalidateQueries({ queryKey: ["/api/timer/current"] });
        onOpenChange(false);
      } else {
        toast({ title: "Failed to start timer", description: error.message, variant: "destructive" });
      }
    },
  });

  const resetForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setClientId(initialClientId);
    setDivisionId(null);
    setProjectId(initialProjectId);
    setTaskId(initialTaskId);
    setHasChanges(false);
  }, [initialClientId, initialProjectId, initialTaskId]);

  useEffect(() => {
    if (open) {
      resetForm();
    }
  }, [open, resetForm]);

  const handleFieldChange = () => {
    setHasChanges(true);
  };

  const handleClientChange = (value: string | null) => {
    setClientId(value);
    setDivisionId(null);
    setProjectId(null);
    setTaskId(null);
    handleFieldChange();
  };

  const handleDivisionChange = (value: string | null) => {
    setDivisionId(value);
    setProjectId(null);
    setTaskId(null);
    handleFieldChange();
  };

  const handleProjectChange = (value: string | null) => {
    setProjectId(value);
    setTaskId(null);
    handleFieldChange();
  };

  const handleStartTimer = () => {
    startMutation.mutate({
      clientId,
      projectId,
      taskId,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
    });
  };

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Start Timer"
      hasUnsavedChanges={hasChanges}
      footer={
        <FullScreenDrawerFooter
          onCancel={() => onOpenChange(false)}
          onSave={handleStartTimer}
          isLoading={startMutation.isPending}
          saveLabel="Start Timer"
          cancelLabel="Cancel"
        />
      }
    >
      <div className="p-6 space-y-6">
        <div className="space-y-2">
          <Label>Client</Label>
          <Select value={clientId || "none"} onValueChange={(v) => handleClientChange(v === "none" ? null : v)}>
            <SelectTrigger data-testid="select-start-timer-client">
              <SelectValue placeholder="Select client (optional)" />
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

        {clientId && divisionsLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading divisions...
          </div>
        )}

        {clientHasDivisions && (
          <div className="space-y-2">
            <Label>Division</Label>
            <Select 
              value={divisionId || "none"} 
              onValueChange={(v) => handleDivisionChange(v === "none" ? null : v)}
            >
              <SelectTrigger data-testid="select-start-timer-division">
                <SelectValue placeholder="Select division" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All divisions</SelectItem>
                {clientDivisions.map((division) => (
                  <SelectItem key={division.id} value={division.id}>
                    <div className="flex items-center gap-2">
                      {division.color && (
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: division.color }}
                        />
                      )}
                      {division.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Project</Label>
          <Select 
            value={projectId || "none"} 
            onValueChange={(v) => handleProjectChange(v === "none" ? null : v)}
            disabled={!clientId}
          >
            <SelectTrigger data-testid="select-start-timer-project">
              <SelectValue placeholder={clientId ? "Select project (optional)" : "Select client first"} />
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

        <div className="space-y-2">
          <TaskSelectorWithCreate
            taskId={taskId}
            onTaskChange={(id: string | null) => {
              setTaskId(id);
              handleFieldChange();
            }}
            projectId={projectId}
          />
        </div>

        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              handleFieldChange();
            }}
            placeholder="Brief summary of work (e.g., Website updates)"
            data-testid="input-start-timer-title"
          />
        </div>

        <div className="space-y-2">
          <Label>Description</Label>
          <div className="min-h-[150px] border rounded-md focus-within:ring-1 focus-within:ring-ring transition-shadow">
            <RichTextEditor
              value={description}
              onChange={(val) => {
                setDescription(val);
                handleFieldChange();
              }}
              placeholder="Additional details about the work..."
              className="border-0 focus-visible:ring-0"
            />
          </div>
        </div>
      </div>
    </FullScreenDrawer>
  );
}
