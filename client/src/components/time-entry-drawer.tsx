import { useState, useEffect } from "react";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
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
import { TaskSelectorWithCreate } from "@/components/task-selector-with-create";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TimeEntryData {
  id?: string;
  description: string;
  durationHours: number;
  durationMinutes: number;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  scope: "in_scope" | "out_of_scope";
  date: Date;
}

interface TimeEntryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TimeEntryData) => Promise<void>;
  entry?: TimeEntryData | null;
  isLoading?: boolean;
  mode: "create" | "edit";
  clients?: Array<{ id: string; companyName: string; displayName: string | null }>;
  projects?: Array<{ id: string; name: string }>;
}

export function TimeEntryDrawer({
  open,
  onOpenChange,
  onSubmit,
  entry,
  isLoading = false,
  mode,
  clients = [],
  projects = [],
}: TimeEntryDrawerProps) {
  const [hasChanges, setHasChanges] = useState(false);
  const [description, setDescription] = useState("");
  const [durationHours, setDurationHours] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(0);
  const [clientId, setClientId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [scope, setScope] = useState<"in_scope" | "out_of_scope">("in_scope");
  const [date, setDate] = useState<Date>(new Date());

  useEffect(() => {
    if (open && entry && mode === "edit") {
      setDescription(entry.description || "");
      setDurationHours(entry.durationHours);
      setDurationMinutes(entry.durationMinutes);
      setClientId(entry.clientId);
      setProjectId(entry.projectId);
      setTaskId(entry.taskId);
      setScope(entry.scope);
      setDate(entry.date);
    } else if (open && mode === "create") {
      setDescription("");
      setDurationHours(0);
      setDurationMinutes(0);
      setClientId(null);
      setProjectId(null);
      setTaskId(null);
      setScope("in_scope");
      setDate(new Date());
    }
    setHasChanges(false);
  }, [open, entry, mode]);

  const handleFieldChange = () => {
    setHasChanges(true);
  };

  const handleSubmit = async () => {
    try {
      await onSubmit({
        id: entry?.id,
        description,
        durationHours,
        durationMinutes,
        clientId,
        projectId,
        taskId,
        scope,
        date,
      });
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save time entry:", error);
    }
  };

  const handleClose = () => {
    setHasChanges(false);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const totalMinutes = durationHours * 60 + durationMinutes;
  const isValid = totalMinutes > 0;

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={mode === "create" ? "Add Time Entry" : "Edit Time Entry"}
      description={mode === "create" ? "Log time spent on a task" : "Update time entry details"}
      hasUnsavedChanges={hasChanges}
      onConfirmClose={handleClose}
      width="xl"
      footer={
        <FullScreenDrawerFooter
          onCancel={handleCancel}
          onSave={handleSubmit}
          isLoading={isLoading}
          saveLabel={mode === "create" ? "Add Entry" : "Save Changes"}
          saveDisabled={!isValid}
        />
      }
    >
      <div className="space-y-6">
        <div>
          <Label>Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal mt-2",
                  !date && "text-muted-foreground"
                )}
                data-testid="button-date"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "PPP") : "Pick a date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    handleFieldChange();
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label>Duration</Label>
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="24"
                value={durationHours}
                onChange={(e) => {
                  setDurationHours(parseInt(e.target.value) || 0);
                  handleFieldChange();
                }}
                className="w-20"
                data-testid="input-hours"
              />
              <span className="text-sm text-muted-foreground">hours</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                max="59"
                value={durationMinutes}
                onChange={(e) => {
                  setDurationMinutes(parseInt(e.target.value) || 0);
                  handleFieldChange();
                }}
                className="w-20"
                data-testid="input-minutes"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            <Clock className="inline h-3 w-3 mr-1" />
            Total: {durationHours}h {durationMinutes}m
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <Label>Client</Label>
            <Select
              value={clientId || "none"}
              onValueChange={(v) => {
                setClientId(v === "none" ? null : v);
                handleFieldChange();
              }}
            >
              <SelectTrigger className="mt-2" data-testid="select-client">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No client</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.displayName || c.companyName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Project</Label>
            <Select
              value={projectId || "none"}
              onValueChange={(v) => {
                setProjectId(v === "none" ? null : v);
                handleFieldChange();
              }}
            >
              <SelectTrigger className="mt-2" data-testid="select-project">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Task</Label>
          <div className="mt-2">
            <TaskSelectorWithCreate
              projectId={projectId}
              taskId={taskId}
              onTaskChange={(v) => {
                setTaskId(v);
                handleFieldChange();
              }}
            />
          </div>
        </div>

        <div>
          <Label>Scope</Label>
          <Select
            value={scope}
            onValueChange={(v: "in_scope" | "out_of_scope") => {
              setScope(v);
              handleFieldChange();
            }}
          >
            <SelectTrigger className="mt-2" data-testid="select-scope">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="in_scope">In Scope</SelectItem>
              <SelectItem value="out_of_scope">Out of Scope</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Description</Label>
          <Textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              handleFieldChange();
            }}
            placeholder="What did you work on?"
            className="min-h-[120px] resize-none mt-2"
            data-testid="textarea-description"
          />
        </div>
      </div>
    </FullScreenDrawer>
  );
}
