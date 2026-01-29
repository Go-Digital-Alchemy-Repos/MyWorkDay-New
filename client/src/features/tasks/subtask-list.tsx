import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, GripVertical, X, CalendarIcon, UserCircle, Sparkles, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Subtask, User, WorkspaceMember } from "@shared/schema";

interface SubtaskListProps {
  subtasks: Subtask[];
  taskId: string;
  workspaceId?: string;
  taskTitle?: string;
  taskDescription?: string;
  onAdd?: (title: string) => void;
  onToggle?: (subtaskId: string, completed: boolean) => void;
  onDelete?: (subtaskId: string) => void;
  onUpdate?: (subtaskId: string, title: string) => void;
  onSubtaskUpdate?: () => void;
  onSubtaskClick?: (subtask: Subtask) => void;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SubtaskList({
  subtasks,
  taskId,
  workspaceId,
  taskTitle,
  taskDescription,
  onAdd,
  onToggle,
  onDelete,
  onUpdate,
  onSubtaskUpdate,
  onSubtaskClick,
}: SubtaskListProps) {
  const { toast } = useToast();
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<Array<{ title: string; description?: string }>>([]);

  const { data: workspaceMembers = [] } = useQuery<(WorkspaceMember & { user?: User })[]>({
    queryKey: ["/api/workspaces", workspaceId, "members"],
    enabled: !!workspaceId,
  });

  const { data: aiStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/v1/ai/status"],
    queryFn: async () => {
      const res = await fetch("/api/v1/ai/status", { credentials: "include" });
      if (!res.ok) return { enabled: false };
      return res.json();
    },
    staleTime: 60000,
  });

  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/ai/suggest/task-breakdown", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskTitle: taskTitle || "Task",
          taskDescription: taskDescription || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to get AI suggestions");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.subtasks && data.subtasks.length > 0) {
        setAiSuggestions(data.subtasks);
        toast({ title: `AI suggested ${data.subtasks.length} subtasks` });
      } else {
        toast({ title: "No suggestions generated", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: "AI suggestion failed", 
        description: error.message,
        variant: "destructive" 
      });
    },
  });

  const handleAcceptSuggestion = (suggestion: { title: string }) => {
    onAdd?.(suggestion.title);
    setAiSuggestions((prev) => prev.filter((s) => s.title !== suggestion.title));
  };

  const handleDismissSuggestions = () => {
    setAiSuggestions([]);
  };

  const updateSubtaskMutation = useMutation({
    mutationFn: async ({ subtaskId, data }: { subtaskId: string; data: Partial<Subtask> }) => {
      return apiRequest("PATCH", `/api/subtasks/${subtaskId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks", taskId] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      onSubtaskUpdate?.();
    },
  });

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAdd?.(newTitle.trim());
      setNewTitle("");
      setIsAdding(false);
    }
  };

  const handleEdit = (subtask: Subtask) => {
    setEditingId(subtask.id);
    setEditingTitle(subtask.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editingTitle.trim()) {
      onUpdate?.(editingId, editingTitle.trim());
    }
    setEditingId(null);
    setEditingTitle("");
  };

  const handleAssigneeChange = (subtaskId: string, userId: string | null) => {
    updateSubtaskMutation.mutate({ 
      subtaskId, 
      data: { assigneeId: userId } 
    });
  };

  const handleDueDateChange = (subtaskId: string, date: Date | null) => {
    updateSubtaskMutation.mutate({ 
      subtaskId, 
      data: { dueDate: date } 
    });
  };

  const completedCount = subtasks.filter((s) => s.completed).length;

  const getAssigneeUser = (assigneeId: string | null): User | undefined => {
    if (!assigneeId) return undefined;
    const member = workspaceMembers.find((m) => m.user?.id === assigneeId);
    return member?.user;
  };

  return (
    <div className="space-y-2" data-testid="subtask-list">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          Subtasks
          {subtasks.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {completedCount}/{subtasks.length}
            </span>
          )}
        </h4>
        <div className="flex items-center gap-1">
          {aiStatus?.enabled && taskTitle && !isAdding && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => aiSuggestMutation.mutate()}
              disabled={aiSuggestMutation.isPending}
              data-testid="button-ai-suggest-subtasks"
            >
              {aiSuggestMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              AI Suggest
            </Button>
          )}
          {!isAdding && subtasks.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsAdding(true)}
              data-testid="button-add-subtask"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add
            </Button>
          )}
        </div>
      </div>

      {aiSuggestions.length > 0 && (
        <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              AI Suggestions
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDismissSuggestions}
              className="h-6 text-xs"
              data-testid="button-dismiss-ai-suggestions"
            >
              <X className="h-3 w-3 mr-1" />
              Dismiss
            </Button>
          </div>
          <div className="space-y-1">
            {aiSuggestions.map((suggestion, index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-2 py-1.5 px-2 bg-background rounded-md border"
                data-testid={`ai-suggestion-${index}`}
              >
                <span className="text-sm flex-1 min-w-0 truncate">{suggestion.title}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAcceptSuggestion(suggestion)}
                  className="h-6 text-xs"
                  data-testid={`button-accept-suggestion-${index}`}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((subtask) => {
            const assignee = getAssigneeUser(subtask.assigneeId);
            
            return (
              <div
                key={subtask.id}
                className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate"
                data-testid={`subtask-item-${subtask.id}`}
              >
                <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab flex-shrink-0" />
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={(checked) => onToggle?.(subtask.id, checked as boolean)}
                  data-testid={`checkbox-subtask-${subtask.id}`}
                />
                {editingId === subtask.id ? (
                  <Input
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={handleSaveEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit();
                      if (e.key === "Escape") {
                        setEditingId(null);
                        setEditingTitle("");
                      }
                    }}
                    className="h-7 text-sm flex-1"
                    autoFocus
                    data-testid={`input-edit-subtask-${subtask.id}`}
                  />
                ) : (
                  <span
                    className={cn(
                      "flex-1 text-sm cursor-pointer min-w-0 truncate hover:text-primary transition-colors",
                      subtask.completed && "line-through text-muted-foreground"
                    )}
                    onClick={() => onSubtaskClick?.(subtask)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      handleEdit(subtask);
                    }}
                    title="Click to view details, double-click to edit title"
                  >
                    {subtask.title}
                  </span>
                )}

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 flex-shrink-0",
                        !assignee && "opacity-0 group-hover:opacity-100"
                      )}
                      data-testid={`button-subtask-assignee-${subtask.id}`}
                    >
                      {assignee ? (
                        <Avatar className="h-5 w-5">
                          {assignee.avatarUrl && <AvatarImage src={assignee.avatarUrl} alt={assignee.name || ""} />}
                          <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                            {getInitials(assignee.name || "U")}
                          </AvatarFallback>
                        </Avatar>
                      ) : (
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    <ScrollArea className="max-h-48">
                      <div className="space-y-0.5">
                        {assignee && (
                          <button
                            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate text-sm text-muted-foreground"
                            onClick={() => handleAssigneeChange(subtask.id, null)}
                          >
                            Unassign
                          </button>
                        )}
                        {workspaceMembers.map((member) => {
                          if (!member.user) return null;
                          const user = member.user;
                          const isSelected = subtask.assigneeId === user.id;
                          
                          return (
                            <button
                              key={user.id}
                              className={cn(
                                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate",
                                isSelected && "bg-primary/5"
                              )}
                              onClick={() => handleAssigneeChange(subtask.id, user.id)}
                              data-testid={`button-subtask-assign-${user.id}`}
                            >
                              <Avatar className="h-5 w-5">
                                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || ""} />}
                                <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                                  {getInitials(user.name || "U")}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm truncate">{user.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "h-6 w-6 flex-shrink-0",
                        !subtask.dueDate && "opacity-0 group-hover:opacity-100"
                      )}
                      data-testid={`button-subtask-duedate-${subtask.id}`}
                    >
                      {subtask.dueDate ? (
                        <span className="text-[10px] text-muted-foreground">
                          {format(new Date(subtask.dueDate), "MMM d")}
                        </span>
                      ) : (
                        <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="end">
                    <Calendar
                      mode="single"
                      selected={subtask.dueDate ? new Date(subtask.dueDate) : undefined}
                      onSelect={(date) => handleDueDateChange(subtask.id, date || null)}
                      initialFocus
                    />
                    {subtask.dueDate && (
                      <div className="border-t p-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => handleDueDateChange(subtask.id, null)}
                        >
                          Clear date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 flex-shrink-0"
                  onClick={() => onDelete?.(subtask.id)}
                  data-testid={`button-delete-subtask-${subtask.id}`}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {isAdding && (
        <div className="flex items-center gap-2">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Subtask title..."
            className="h-8 text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
              if (e.key === "Escape") {
                setIsAdding(false);
                setNewTitle("");
              }
            }}
            autoFocus
            data-testid="input-new-subtask"
          />
          <Button size="sm" onClick={handleAdd} data-testid="button-save-subtask">
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAdding(false);
              setNewTitle("");
            }}
            data-testid="button-cancel-subtask"
          >
            Cancel
          </Button>
        </div>
      )}

      {subtasks.length === 0 && !isAdding && (
        <div 
          className="flex items-center justify-center py-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent/50 transition-colors group" 
          onClick={() => setIsAdding(true)}
          data-testid="div-empty-subtask-add"
        >
          <div className="flex flex-col items-center gap-1 text-muted-foreground group-hover:text-primary transition-colors">
            <Plus className="h-5 w-5" />
            <p className="text-xs font-medium">Add a subtask</p>
          </div>
        </div>
      )}
    </div>
  );
}
