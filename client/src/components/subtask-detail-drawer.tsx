import { useState, useEffect } from "react";
import { X, Calendar, Users, Flag, Layers, ArrowLeft } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/status-badge";
import { AvatarGroup } from "@/components/avatar-group";
import { format } from "date-fns";
import type { TaskWithRelations, User } from "@shared/schema";

interface SubtaskDetailDrawerProps {
  subtask: TaskWithRelations | null;
  parentTaskTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (subtaskId: string, data: Partial<TaskWithRelations>) => void;
  onBack?: () => void;
  availableUsers?: User[];
}

export function SubtaskDetailDrawer({
  subtask,
  parentTaskTitle,
  open,
  onOpenChange,
  onUpdate,
  onBack,
  availableUsers = [],
}: SubtaskDetailDrawerProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(subtask?.title || "");
  const [description, setDescription] = useState(subtask?.description || "");

  useEffect(() => {
    if (subtask) {
      setTitle(subtask.title);
      setDescription(subtask.description || "");
    }
  }, [subtask]);

  if (!subtask) return null;

  const assigneeUsers: Partial<User>[] = subtask.assignees?.map((a) => a.user).filter(Boolean) as Partial<User>[] || [];

  const handleTitleSave = () => {
    if (title.trim() && title !== subtask.title) {
      onUpdate?.(subtask.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescriptionBlur = () => {
    if (description !== subtask.description) {
      onUpdate?.(subtask.id, { description: description || null });
    }
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
                <div className="flex items-center gap-2">
                  {assigneeUsers.length > 0 ? (
                    <AvatarGroup users={assigneeUsers} max={3} />
                  ) : (
                    <span className="text-sm text-muted-foreground">None</span>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="button-add-subtask-assignee">
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" />
                  Due Date
                </label>
                <div className="flex items-center">
                  {subtask.dueDate ? (
                    <span className="text-sm">{format(new Date(subtask.dueDate), "MMM d, yyyy")}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">No due date</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Flag className="h-3.5 w-3.5" />
                  Priority
                </label>
                <Select
                  value={subtask.priority}
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
                  value={subtask.status}
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
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Description</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              placeholder="Add a description..."
              className="min-h-[100px] resize-none text-sm"
              data-testid="textarea-subtask-description"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
