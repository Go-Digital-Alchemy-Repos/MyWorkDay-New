import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableTaskCard } from "./sortable-task-card";
import { cn } from "@/lib/utils";
import type { SectionWithTasks, TaskWithRelations } from "@shared/schema";

interface ListSectionDroppableProps {
  section: SectionWithTasks;
  onAddTask?: () => void;
  onTaskSelect?: (task: TaskWithRelations) => void;
  onTaskStatusChange?: (taskId: string, completed: boolean) => void;
}

export function ListSectionDroppable({
  section,
  onAddTask,
  onTaskSelect,
  onTaskStatusChange,
}: ListSectionDroppableProps) {
  const tasks = section.tasks || [];
  const taskIds = tasks.map((t) => t.id);

  const { setNodeRef, isOver } = useDroppable({
    id: section.id,
    data: { type: "section", section },
  });

  return (
    <div
      className="mb-6"
      data-testid={`list-section-${section.id}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <h3 className="text-sm font-medium">{section.name}</h3>
        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
          {tasks.length}
        </span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            "border border-border rounded-lg overflow-hidden transition-colors",
            isOver && "ring-2 ring-primary/50 bg-primary/5"
          )}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              view="list"
              onSelect={() => onTaskSelect?.(task)}
              onStatusChange={(completed) => onTaskStatusChange?.(task.id, completed)}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex items-center justify-center py-8 text-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={onAddTask}
                data-testid={`button-add-task-list-${section.id}`}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add task
              </Button>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}
