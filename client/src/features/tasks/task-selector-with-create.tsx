import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCreateTask } from "@/hooks/use-create-task";
import { Button } from "@/components/ui/button";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { Plus, ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import type { Task, Section } from "@shared/schema";

interface TaskSelectorWithCreateProps {
  projectId: string | null;
  taskId: string | null;
  onTaskChange: (taskId: string | null) => void;
  disabled?: boolean;
}

export function TaskSelectorWithCreate({
  projectId,
  taskId,
  onTaskChange,
  disabled = false,
}: TaskSelectorWithCreateProps) {
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDescription, setNewTaskDescription] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<string>("medium");

  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/projects", projectId, "tasks"],
    enabled: !!projectId,
  });

  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ["/api/projects", projectId, "sections"],
    enabled: !!projectId && createOpen,
  });

  const createTaskMutation = useCreateTask({
    onSuccess: (newTask) => {
      onTaskChange(newTask.id);
      setCreateOpen(false);
      setNewTaskTitle("");
      setNewTaskDescription("");
      setNewTaskPriority("medium");
      toast({ title: "Task created and selected" });
    },
  });

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a task title",
        variant: "destructive",
      });
      return;
    }
    if (!projectId) {
      toast({
        title: "Project required",
        description: "Please select a project first",
        variant: "destructive",
      });
      return;
    }

    const firstSection = sections.length > 0 ? sections[0] : null;

    createTaskMutation.mutate({
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim() || undefined,
      priority: newTaskPriority,
      projectId,
      sectionId: firstSection?.id,
    });
  };

  const openTasks = tasks.filter(
    (t) => t.status !== "done" && !t.parentTaskId
  );

  const canCreate = !!projectId;

  return (
    <div className="space-y-2">
      <Label>Task</Label>
      <Select
        value={taskId || "none"}
        onValueChange={(v) => onTaskChange(v === "none" ? null : v)}
        disabled={disabled || !projectId}
      >
        <SelectTrigger data-testid="select-task">
          <SelectValue placeholder={projectId ? "Select task (optional)" : "Select a project first"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No task</SelectItem>
          {tasksLoading && (
            <SelectItem value="loading" disabled>
              Loading tasks...
            </SelectItem>
          )}
          {openTasks.map((task) => (
            <SelectItem key={task.id} value={task.id}>
              {task.title}
            </SelectItem>
          ))}
          {!tasksLoading && openTasks.length === 0 && projectId && (
            <SelectItem value="empty" disabled>
              No open tasks in this project
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      <Collapsible open={createOpen} onOpenChange={setCreateOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            disabled={!canCreate}
            data-testid="button-create-task-toggle"
          >
            {createOpen ? (
              <ChevronUp className="h-4 w-4 mr-2" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            {createOpen ? "Cancel" : "Create New Task"}
            {!canCreate && (
              <span className="ml-2 text-xs opacity-70">(select a project first)</span>
            )}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">New Task</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setCreateOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-title">Title *</Label>
              <Input
                id="new-task-title"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title"
                data-testid="input-new-task-title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-task-description">Description</Label>
              <Textarea
                id="new-task-description"
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                placeholder="Optional description"
                rows={2}
                data-testid="input-new-task-description"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                <SelectTrigger data-testid="select-new-task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              onClick={handleCreateTask}
              disabled={createTaskMutation.isPending || !newTaskTitle.trim()}
              className="w-full"
              data-testid="button-confirm-create-task"
            >
              {createTaskMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Task
                </>
              )}
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
