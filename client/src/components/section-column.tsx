import { Plus, MoreHorizontal, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/task-card";
import { cn } from "@/lib/utils";
import type { SectionWithTasks, TaskWithRelations } from "@shared/schema";

interface SectionColumnProps {
  section: SectionWithTasks;
  onAddTask?: () => void;
  onTaskSelect?: (task: TaskWithRelations) => void;
  onTaskStatusChange?: (taskId: string, completed: boolean) => void;
}

export function SectionColumn({
  section,
  onAddTask,
  onTaskSelect,
  onTaskStatusChange,
}: SectionColumnProps) {
  const tasks = section.tasks || [];
  const taskCount = tasks.length;

  return (
    <div
      className="flex flex-col min-w-[280px] max-w-[320px] shrink-0 bg-card/50 rounded-lg"
      data-testid={`section-column-${section.id}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            data-testid={`button-section-menu-${section.id}`}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2 min-h-[200px] overflow-y-auto">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            view="board"
            onSelect={() => onTaskSelect?.(task)}
            onStatusChange={(completed) => onTaskStatusChange?.(task.id, completed)}
          />
        ))}
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
  );
}
