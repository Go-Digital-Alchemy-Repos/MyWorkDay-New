import { useState } from "react";
import { Plus, GripVertical, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Subtask } from "@shared/schema";

interface SubtaskListProps {
  subtasks: Subtask[];
  onAdd?: (title: string) => void;
  onToggle?: (subtaskId: string, completed: boolean) => void;
  onDelete?: (subtaskId: string) => void;
  onUpdate?: (subtaskId: string, title: string) => void;
}

export function SubtaskList({
  subtasks,
  onAdd,
  onToggle,
  onDelete,
  onUpdate,
}: SubtaskListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");

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

  const completedCount = subtasks.filter((s) => s.completed).length;

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
        {!isAdding && (
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

      {subtasks.length > 0 && (
        <div className="space-y-1">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className="group flex items-center gap-2 py-1.5 px-2 rounded-md hover-elevate"
              data-testid={`subtask-item-${subtask.id}`}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
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
                  className="h-7 text-sm"
                  autoFocus
                  data-testid={`input-edit-subtask-${subtask.id}`}
                />
              ) : (
                <span
                  className={cn(
                    "flex-1 text-sm cursor-pointer",
                    subtask.completed && "line-through text-muted-foreground"
                  )}
                  onClick={() => handleEdit(subtask)}
                >
                  {subtask.title}
                </span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onDelete?.(subtask.id)}
                data-testid={`button-delete-subtask-${subtask.id}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
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
        <p className="text-xs text-muted-foreground py-2">
          No subtasks yet. Click "Add" to create one.
        </p>
      )}
    </div>
  );
}
