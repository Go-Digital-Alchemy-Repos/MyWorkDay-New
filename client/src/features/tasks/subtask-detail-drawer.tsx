import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Calendar, Users, Flag, Layers, ArrowLeft, Tag, Plus, Clock, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/richtext";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { AvatarGroup } from "@/components/avatar-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { format } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Subtask, User, Tag as TagType, WorkspaceMember, TaskWithRelations } from "@shared/schema";
import { cn } from "@/lib/utils";

type SubtaskOrTask = (Subtask | (TaskWithRelations & { taskId?: string; completed?: boolean; assigneeId?: string | null })) & {
  id: string;
  title: string;
  description?: unknown;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
  estimateMinutes?: number | null;
  projectId?: string | null;
};

function isSubtask(item: SubtaskOrTask | null): item is Subtask {
  if (!item) return false;
  return 'taskId' in item && 'completed' in item && typeof item.completed === 'boolean';
}

interface SubtaskAssignee {
  id: string;
  subtaskId: string;
  userId: string;
  tenantId: string | null;
  createdAt: string;
  user?: User;
}

interface SubtaskTag {
  id: string;
  subtaskId: string;
  tagId: string;
  createdAt: string;
  tag?: TagType;
}

interface SubtaskDetailDrawerProps {
  subtask: SubtaskOrTask | null;
  parentTaskTitle: string;
  projectId?: string;
  workspaceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (subtaskId: string, data: any) => void;
  onBack?: () => void;
  availableUsers?: User[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function SubtaskDetailDrawer({
  subtask,
  parentTaskTitle,
  projectId,
  workspaceId,
  open,
  onOpenChange,
  onUpdate,
  onBack,
  availableUsers = [],
}: SubtaskDetailDrawerProps) {
  const { toast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(subtask?.title || "");
  const [description, setDescription] = useState<string>(
    typeof subtask?.description === 'string' 
      ? subtask.description 
      : subtask?.description ? JSON.stringify(subtask.description) : ""
  );
  const [assigneePopoverOpen, setAssigneePopoverOpen] = useState(false);
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false);
  const [dueDatePopoverOpen, setDueDatePopoverOpen] = useState(false);

  const isActualSubtask = isSubtask(subtask);

  const { data: subtaskAssignees = [], refetch: refetchAssignees, isLoading: loadingAssignees } = useQuery<SubtaskAssignee[]>({
    queryKey: ["/api/subtasks", subtask?.id, "assignees"],
    queryFn: async () => {
      if (!subtask?.id) return [];
      const res = await fetch(`/api/subtasks/${subtask.id}/assignees`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subtask?.id && open && isActualSubtask,
  });

  const { data: subtaskTags = [], refetch: refetchTags, isLoading: loadingTags } = useQuery<SubtaskTag[]>({
    queryKey: ["/api/subtasks", subtask?.id, "tags"],
    queryFn: async () => {
      if (!subtask?.id) return [];
      const res = await fetch(`/api/subtasks/${subtask.id}/tags`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!subtask?.id && open && isActualSubtask,
  });

  const { data: workspaceMembers = [] } = useQuery<(WorkspaceMember & { user?: User })[]>({
    queryKey: ["/api/workspaces", workspaceId, "members"],
    enabled: !!workspaceId && open,
  });

  const { data: workspaceTags = [] } = useQuery<TagType[]>({
    queryKey: ["/api/workspaces", workspaceId, "tags"],
    enabled: !!workspaceId && open,
  });

  const addAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("POST", `/api/subtasks/${subtask?.id}/assignees`, { userId });
    },
    onSuccess: () => {
      refetchAssignees();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
      setAssigneePopoverOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to add assignee", description: error.message, variant: "destructive" });
    },
  });

  const removeAssigneeMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtask?.id}/assignees/${userId}`);
    },
    onSuccess: () => {
      refetchAssignees();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove assignee", description: error.message, variant: "destructive" });
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/subtasks/${subtask?.id}/tags`, { tagId });
    },
    onSuccess: () => {
      refetchTags();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
      setTagPopoverOpen(false);
    },
    onError: (error: any) => {
      if (error.message?.includes("already added")) {
        toast({ title: "Tag already added", variant: "destructive" });
      } else {
        toast({ title: "Failed to add tag", description: error.message, variant: "destructive" });
      }
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/subtasks/${subtask?.id}/tags/${tagId}`);
    },
    onSuccess: () => {
      refetchTags();
      queryClient.invalidateQueries({ queryKey: ["/api/subtasks", subtask?.id] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove tag", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.title);
      setDescription(
        typeof subtask.description === 'string' 
          ? subtask.description 
          : subtask.description ? JSON.stringify(subtask.description) : ""
      );
    }
  }, [subtask]);

  if (!subtask) return null;

  const childTaskAssignees = !isActualSubtask && 'assignees' in subtask ? (subtask as TaskWithRelations).assignees || [] : [];
  const childTaskTags = !isActualSubtask && 'tags' in subtask ? (subtask as TaskWithRelations).tags || [] : [];

  const assigneeUsers: Partial<User>[] = isActualSubtask 
    ? subtaskAssignees.map((a) => a.user).filter(Boolean) as Partial<User>[]
    : childTaskAssignees.map((a) => a.user).filter(Boolean) as Partial<User>[];

  const assignedUserIds = new Set(
    isActualSubtask 
      ? subtaskAssignees.map((a) => a.userId)
      : childTaskAssignees.map((a) => a.userId)
  );
  const assignedTagIds = new Set(
    isActualSubtask
      ? subtaskTags.map((t) => t.tagId)
      : childTaskTags.map((t) => t.tagId)
  );

  const handleTitleSave = () => {
    if (title.trim() && title !== subtask.title) {
      onUpdate?.(subtask.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescriptionChange = (value: string) => {
    setDescription(value);
  };

  const handleDescriptionBlur = () => {
    const currentDesc = typeof subtask.description === 'string' 
      ? subtask.description 
      : subtask.description ? JSON.stringify(subtask.description) : "";
    if (description !== currentDesc) {
      onUpdate?.(subtask.id, { description: description || null });
    }
  };

  const handleDueDateChange = (date: Date | undefined) => {
    onUpdate?.(subtask.id, { dueDate: date || null });
    setDueDatePopoverOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[480px] sm:max-w-[480px] overflow-y-auto p-0"
        data-testid="subtask-detail-drawer"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <SheetDescription className="sr-only">Edit subtask details</SheetDescription>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                data-testid="button-back-to-parent"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <SheetTitle className="sr-only">Subtask Details</SheetTitle>
              <StatusBadge status={subtask.status as any} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-subtask-drawer"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Subtask of: {parentTaskTitle}
          </div>
        </SheetHeader>

        <div className="px-6 py-6 space-y-6">
          <div className="space-y-4">
            {editingTitle ? (
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleTitleSave();
                  if (e.key === "Escape") {
                    setTitle(subtask.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-xl font-semibold h-auto py-1"
                autoFocus
                data-testid="input-subtask-title"
              />
            ) : (
              <h2
                className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setTitle(subtask.title);
                  setEditingTitle(true);
                }}
                data-testid="text-subtask-title"
              >
                {subtask.title}
              </h2>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Assignees
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {(isActualSubtask && loadingAssignees) ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : assigneeUsers.length > 0 ? (
                    <div className="flex items-center gap-1 flex-wrap">
                      {assigneeUsers.map((user) => (
                        <div
                          key={user.id}
                          className="group relative"
                          data-testid={`subtask-assignee-${user.id}`}
                        >
                          <Avatar className="h-6 w-6 cursor-pointer">
                            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || ""} />}
                            <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                              {getInitials(user.name || "U")}
                            </AvatarFallback>
                          </Avatar>
                          {isActualSubtask && (
                            <button
                              className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => removeAssigneeMutation.mutate(user.id!)}
                              data-testid={`button-remove-assignee-${user.id}`}
                            >
                              <X className="h-2 w-2" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                  {isActualSubtask && (
                    <Popover open={assigneePopoverOpen} onOpenChange={setAssigneePopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" data-testid="button-add-subtask-assignee">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-48 p-1" align="start">
                        <ScrollArea className="max-h-48">
                          <div className="space-y-0.5">
                            {workspaceMembers.map((member) => {
                              if (!member.user) return null;
                              const user = member.user;
                              const isAssigned = assignedUserIds.has(user.id);
                              if (isAssigned) return null;
                              return (
                                <button
                                  key={user.id}
                                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate"
                                  onClick={() => addAssigneeMutation.mutate(user.id)}
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
                            {workspaceMembers.filter((m) => m.user && !assignedUserIds.has(m.user.id)).length === 0 && (
                              <div className="px-2 py-2 text-xs text-muted-foreground">
                                All members assigned
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Due Date
                </label>
                <Popover open={dueDatePopoverOpen} onOpenChange={setDueDatePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 justify-start px-2 font-normal"
                      data-testid="button-subtask-due-date"
                    >
                      {subtask.dueDate ? (
                        format(new Date(subtask.dueDate), "MMM d, yyyy")
                      ) : (
                        <span className="text-muted-foreground">Set due date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={subtask.dueDate ? new Date(subtask.dueDate) : undefined}
                      onSelect={handleDueDateChange}
                      initialFocus
                    />
                    {subtask.dueDate && (
                      <div className="p-2 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => handleDueDateChange(undefined)}
                        >
                          Clear due date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                </label>
                <Select
                  value={subtask.priority || "medium"}
                  onValueChange={(value) => onUpdate?.(subtask.id, { priority: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-subtask-priority">
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

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  Status
                </label>
                <Select
                  value={subtask.status || "todo"}
                  onValueChange={(value) => onUpdate?.(subtask.id, { status: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-subtask-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Estimate
                </label>
                <Input
                  type="number"
                  min="0"
                  value={subtask.estimateMinutes || ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value) : null;
                    onUpdate?.(subtask.id, { estimateMinutes: val });
                  }}
                  placeholder="Minutes"
                  className="h-8 w-[140px]"
                  data-testid="input-subtask-estimate"
                />
              </div>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Tag className="h-3.5 w-3.5" />
                Tags
              </label>
              {isActualSubtask && (
                <Popover open={tagPopoverOpen} onOpenChange={setTagPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-6 px-2" data-testid="button-add-subtask-tag">
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    <ScrollArea className="max-h-48">
                      <div className="space-y-0.5">
                        {workspaceTags.map((tag) => {
                          if (assignedTagIds.has(tag.id)) return null;
                          return (
                            <button
                              key={tag.id}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover-elevate"
                              onClick={() => addTagMutation.mutate(tag.id)}
                              data-testid={`button-subtask-add-tag-${tag.id}`}
                            >
                              <div
                                className="h-3 w-3 rounded-full"
                                style={{ backgroundColor: tag.color || "#888" }}
                              />
                              <span className="text-sm truncate">{tag.name}</span>
                            </button>
                          );
                        })}
                        {workspaceTags.filter((t) => !assignedTagIds.has(t.id)).length === 0 && (
                          <div className="px-2 py-2 text-xs text-muted-foreground">
                            {workspaceTags.length === 0 ? "No tags available" : "All tags added"}
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {(isActualSubtask && loadingTags) ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <>
                  {(isActualSubtask ? subtaskTags : childTaskTags).map((st) => {
                    const tag = isActualSubtask ? (st as SubtaskTag).tag : (st as any).tag;
                    const tagId = isActualSubtask ? (st as SubtaskTag).tagId : (st as any).tagId;
                    if (!tag) return null;
                    return (
                      <Badge
                        key={tagId}
                        variant="secondary"
                        className="gap-1 pr-1"
                        style={{ backgroundColor: `${tag.color}20`, borderColor: tag.color }}
                        data-testid={`subtask-tag-${tag.id}`}
                      >
                        <span style={{ color: tag.color }}>{tag.name}</span>
                        {isActualSubtask && (
                          <button
                            className="ml-1 h-3 w-3 rounded-full hover:bg-destructive/20 flex items-center justify-center"
                            onClick={() => removeTagMutation.mutate(tag.id)}
                            data-testid={`button-remove-tag-${tag.id}`}
                          >
                            <X className="h-2 w-2" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                  {(isActualSubtask ? subtaskTags : childTaskTags).length === 0 && (
                    <span className="text-sm text-muted-foreground">No tags</span>
                  )}
                </>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <RichTextEditor
              value={description}
              onChange={handleDescriptionChange}
              onBlur={handleDescriptionBlur}
              placeholder="Add a description..."
              minHeight="100px"
              data-testid="textarea-subtask-description"
            />
          </div>

          <Separator />

          {projectId && (
            <AttachmentUploader taskId={subtask.id} projectId={projectId} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
