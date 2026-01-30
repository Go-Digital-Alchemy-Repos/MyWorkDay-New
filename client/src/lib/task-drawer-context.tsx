import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { TaskDetailDrawer } from "@/features/tasks";
import type { TaskWithRelations } from "@shared/schema";

interface TaskDrawerContextType {
  openTask: (taskId: string) => void;
  closeTask: () => void;
}

const TaskDrawerContext = createContext<TaskDrawerContextType | null>(null);

export function useTaskDrawer() {
  const context = useContext(TaskDrawerContext);
  if (!context) {
    throw new Error("useTaskDrawer must be used within a TaskDrawerProvider");
  }
  return context;
}

interface TaskDrawerProviderProps {
  children: ReactNode;
}

export function TaskDrawerProvider({ children }: TaskDrawerProviderProps) {
  const [taskIdToOpen, setTaskIdToOpen] = useState<string | null>(null);

  const { data: task } = useQuery<TaskWithRelations>({
    queryKey: ["/api/tasks", taskIdToOpen],
    enabled: !!taskIdToOpen,
  });

  const openTask = useCallback((taskId: string) => {
    setTaskIdToOpen(taskId);
  }, []);

  const closeTask = useCallback(() => {
    setTaskIdToOpen(null);
  }, []);

  return (
    <TaskDrawerContext.Provider value={{ openTask, closeTask }}>
      {children}
      {task && (
        <TaskDetailDrawer
          task={task}
          open={!!taskIdToOpen && !!task}
          onOpenChange={(open) => {
            if (!open) closeTask();
          }}
        />
      )}
    </TaskDrawerContext.Provider>
  );
}
