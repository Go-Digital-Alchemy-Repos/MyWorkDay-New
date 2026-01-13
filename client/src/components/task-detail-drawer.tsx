import { useState, useEffect } from "react";
import { X, Calendar, Users, Tag, Flag, Layers } from "lucide-react";
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
import { ChildTaskList } from "@/components/child-task-list";
import { SubtaskDetailDrawer } from "@/components/subtask-detail-drawer";
import { CommentThread } from "@/components/comment-thread";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { StatusBadge } from "@/components/status-badge";
import { TagBadge } from "@/components/tag-badge";
import { AvatarGroup } from "@/components/avatar-group";
import { format } from "date-fns";
import type { TaskWithRelations, User, Tag as TagType, Comment } from "@shared/schema";

interface TaskDetailDrawerProps {
  task: TaskWithRelations | null;
  childTasks?: TaskWithRelations[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: (taskId: string, data: Partial<TaskWithRelations>) => void;
  onAddChildTask?: (parentTaskId: string, title: string) => void;
  onDeleteChildTask?: (taskId: string) => void;
  onReorderChildTasks?: (parentTaskId: string, taskId: string, toIndex: number) => void;
  onAddComment?: (taskId: string, body: string) => void;
  availableTags?: TagType[];
  availableUsers?: User[];
}

export function TaskDetailDrawer({
  task,
  childTasks = [],
  open,
  onOpenChange,
  onUpdate,
  onAddChildTask,
  onDeleteChildTask,
  onReorderChildTasks,
  onAddComment,
  availableTags = [],
  availableUsers = [],
}: TaskDetailDrawerProps) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(task?.title || "");
  const [description, setDescription] = useState(task?.description || "");
  const [selectedChildTask, setSelectedChildTask] = useState<TaskWithRelations | null>(null);
  const [childDrawerOpen, setChildDrawerOpen] = useState(false);
  
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || "");
    }
  }, [task?.id]);

  if (!task) return null;

  const assigneeUsers: Partial<User>[] = task.assignees?.map((a) => a.user).filter(Boolean) as Partial<User>[] || [];
  const taskTags: TagType[] = task.tags?.map((tt) => tt.tag).filter(Boolean) as TagType[] || [];
  const comments: (Comment & { user?: User })[] = [];
  
  const handleChildTaskClick = (childTask: TaskWithRelations) => {
    setSelectedChildTask(childTask);
    setChildDrawerOpen(true);
  };
  
  const handleChildTaskUpdate = (childTaskId: string, data: Partial<TaskWithRelations>) => {
    onUpdate?.(childTaskId, data);
    if (selectedChildTask && selectedChildTask.id === childTaskId) {
      setSelectedChildTask({ ...selectedChildTask, ...data } as TaskWithRelations);
    }
  };

  const handleTitleSave = () => {
    if (title.trim() && title !== task.title) {
      onUpdate?.(task.id, { title: title.trim() });
    }
    setEditingTitle(false);
  };

  const handleDescriptionBlur = () => {
    if (description !== task.description) {
      onUpdate?.(task.id, { description: description || null });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto p-0"
        data-testid="task-detail-drawer"
      >
        <SheetHeader className="sticky top-0 z-10 bg-background border-b border-border px-6 py-4">
          <SheetDescription className="sr-only">Edit task details, add subtasks, and manage comments</SheetDescription>
          <div className="flex items-center justify-between">
            <SheetTitle className="sr-only">Task Details</SheetTitle>
            <StatusBadge status={task.status as any} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-drawer"
            >
              <X className="h-4 w-4" />
            </Button>
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
                    setTitle(task.title);
                    setEditingTitle(false);
                  }
                }}
                className="text-xl font-semibold h-auto py-1"
                autoFocus
                data-testid="input-task-title"
              />
            ) : (
              <h2
                className="text-xl font-semibold cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={() => {
                  setTitle(task.title);
                  setEditingTitle(true);
                }}
                data-testid="text-task-title"
              >
                {task.title}
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
                  <Button variant="ghost" size="sm" className="h-7 text-xs" data-testid="button-add-assignee">
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
                  {task.dueDate ? (
                    <span className="text-sm">{format(new Date(task.dueDate), "MMM d, yyyy")}</span>
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
                  value={task.priority}
                  onValueChange={(value) => onUpdate?.(task.id, { priority: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-priority">
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
                  value={task.status}
                  onValueChange={(value) => onUpdate?.(task.id, { status: value })}
                >
                  <SelectTrigger className="w-[140px] h-8" data-testid="select-status">
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
              data-testid="textarea-description"
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Tag className="h-3.5 w-3.5" />
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5">
              {taskTags.map((tag) => (
                <TagBadge key={tag.id} name={tag.name} color={tag.color} />
              ))}
              {taskTags.length === 0 && (
                <span className="text-sm text-muted-foreground">No tags</span>
              )}
              <Button variant="ghost" size="sm" className="h-6 text-xs" data-testid="button-add-tag">
                Add tag
              </Button>
            </div>
          </div>

          <Separator />

          <ChildTaskList
            childTasks={childTasks}
            onAdd={(title) => onAddChildTask?.(task.id, title)}
            onClick={handleChildTaskClick}
            onDelete={onDeleteChildTask}
            onReorder={(taskId, toIndex) => onReorderChildTasks?.(task.id, taskId, toIndex)}
          />

          <Separator />

          <AttachmentUploader taskId={task.id} projectId={task.projectId} />

          <Separator />

          <CommentThread
            comments={comments}
            onAdd={(body) => onAddComment?.(task.id, body)}
          />
        </div>
      </SheetContent>
      
      <SubtaskDetailDrawer
        subtask={selectedChildTask}
        parentTaskTitle={task.title}
        open={childDrawerOpen}
        onOpenChange={setChildDrawerOpen}
        onUpdate={handleChildTaskUpdate}
        onBack={() => setChildDrawerOpen(false)}
        availableUsers={availableUsers}
      />
    </Sheet>
  );
}
