import { useState } from "react";
import { Plus, GripVertical, X, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { cn } from "@/lib/utils";
import type { TaskWithRelations } from "@shared/schema";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ChildTaskListProps {
  childTasks: TaskWithRelations[];
  onAdd?: (title: string) => void;
  onDelete?: (taskId: string) => void;
  onClick?: (task: TaskWithRelations) => void;
  onReorder?: (taskId: string, toIndex: number) => void;
}

function SortableChildTaskItem({
  task,
  onClick,
  onDelete,
}: {
  task: TaskWithRelations;
  onClick?: (task: TaskWithRelations) => void;
  onDelete?: (taskId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 py-2 px-2 rounded-md hover-elevate border border-transparent",
        isDragging && "opacity-50 border-border bg-muted"
      )}
      data-testid={`child-task-item-${task.id}`}
    >
      <div {...attributes} {...listeners} className="cursor-grab">
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <div
        className="flex-1 flex items-center gap-2 cursor-pointer"
        onClick={() => onClick?.(task)}
      >
        <StatusBadge status={task.status as any} size="sm" />
        <span
          className={cn(
            "flex-1 text-sm",
            task.status === "done" && "line-through text-muted-foreground"
          )}
        >
          {task.title}
        </span>
        {task.priority !== "medium" && (
          <PriorityBadge priority={task.priority as any} />
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 opacity-0 group-hover:opacity-100"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(task.id);
        }}
        data-testid={`button-delete-child-task-${task.id}`}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function ChildTaskList({
  childTasks,
  onAdd,
  onDelete,
  onClick,
  onReorder,
}: ChildTaskListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleAdd = () => {
    if (newTitle.trim()) {
      onAdd?.(newTitle.trim());
      setNewTitle("");
      setIsAdding(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = childTasks.findIndex((t) => t.id === active.id);
      const newIndex = childTasks.findIndex((t) => t.id === over.id);
      onReorder?.(active.id as string, newIndex);
    }
  };

  const completedCount = childTasks.filter((t) => t.status === "done").length;

  return (
    <div className="space-y-2" data-testid="child-task-list">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">
          Subtasks
          {childTasks.length > 0 && (
            <span className="ml-2 text-xs text-muted-foreground">
              {completedCount}/{childTasks.length}
            </span>
          )}
        </h4>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(true)}
            data-testid="button-add-child-task"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        )}
      </div>

      {childTasks.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={childTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {childTasks.map((task) => (
                <SortableChildTaskItem
                  key={task.id}
                  task={task}
                  onClick={onClick}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
            data-testid="input-new-child-task"
          />
          <Button size="sm" onClick={handleAdd} data-testid="button-save-child-task">
            Add
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsAdding(false);
              setNewTitle("");
            }}
            data-testid="button-cancel-child-task"
          >
            Cancel
          </Button>
        </div>
      )}

      {childTasks.length === 0 && !isAdding && (
        <p className="text-xs text-muted-foreground py-2">
          No subtasks yet. Click "Add" to create one.
        </p>
      )}
    </div>
  );
}
