import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortableTaskCard } from "./sortable-task-card";
import { cn } from "@/lib/utils";
import type { SectionWithTasks, TaskWithRelations } from "@shared/schema";

interface SectionColumnProps {
  section: SectionWithTasks;
  onAddTask?: () => void;
  onTaskSelect?: (task: TaskWithRelations) => void;
  onTaskStatusChange?: (taskId: string, completed: boolean) => void;
  onEditSection?: (sectionId: string, name: string) => void;
  onDeleteSection?: (sectionId: string) => void;
}

export function SectionColumn({
  section,
  onAddTask,
  onTaskSelect,
  onTaskStatusChange,
  onEditSection,
  onDeleteSection,
}: SectionColumnProps) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editName, setEditName] = useState(section.name);
  
  const tasks = section.tasks || [];
  const taskCount = tasks.length;
  const taskIds = tasks.map((t) => t.id);

  const { setNodeRef, isOver } = useDroppable({
    id: section.id,
    data: { type: "section", section },
  });

  const handleEditSubmit = () => {
    if (editName.trim() && onEditSection) {
      onEditSection(section.id, editName.trim());
      setEditDialogOpen(false);
    }
  };

  const handleOpenEditDialog = () => {
    setEditName(section.name);
    setEditDialogOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          "flex flex-col min-w-[280px] max-w-[320px] shrink-0 bg-card/50 rounded-lg transition-colors",
          isOver && "ring-2 ring-primary/50 bg-primary/5"
        )}
        data-testid={`section-column-${section.id}`}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{section.name}</h3>
            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {taskCount}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onAddTask}
              data-testid={`button-add-task-${section.id}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  data-testid={`button-section-menu-${section.id}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={handleOpenEditDialog}
                  data-testid={`menu-item-edit-section-${section.id}`}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Section
                </DropdownMenuItem>
                {onDeleteSection && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onDeleteSection(section.id)}
                      className="text-destructive focus:text-destructive"
                      data-testid={`menu-item-delete-section-${section.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Section
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div
          ref={setNodeRef}
          className="flex flex-col gap-2 p-2 min-h-[200px] overflow-y-auto"
        >
          <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
            {tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                view="board"
                onSelect={() => onTaskSelect?.(task)}
                onStatusChange={(completed) => onTaskStatusChange?.(task.id, completed)}
              />
            ))}
          </SortableContext>
          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-xs text-muted-foreground">No tasks yet</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs"
                onClick={onAddTask}
                data-testid={`button-add-first-task-${section.id}`}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add task
              </Button>
            </div>
          )}
        </div>

        <div className="p-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground"
            onClick={onAddTask}
            data-testid={`button-add-task-bottom-${section.id}`}
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            Add task
          </Button>
        </div>
      </div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-[400px]" data-testid="dialog-edit-section">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>
              Change the name of this section
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="section-name">Section Name</Label>
              <Input
                id="section-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter section name..."
                data-testid="input-section-name"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleEditSubmit();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setEditDialogOpen(false)}
              data-testid="button-cancel-edit-section"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEditSubmit}
              disabled={!editName.trim()}
              data-testid="button-save-section"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
