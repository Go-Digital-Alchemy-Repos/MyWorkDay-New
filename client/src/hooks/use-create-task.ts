import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatErrorForToast } from "@/lib/parseApiError";

export interface CreateTaskData {
  title: string;
  description?: string;
  projectId?: string;
  sectionId?: string;
  priority?: "low" | "medium" | "high" | "urgent";
  status?: "todo" | "in_progress" | "blocked" | "done";
  dueDate?: string | null;
  personalSectionId?: string;
  assigneeIds?: string[];
}

export interface CreatePersonalTaskData {
  title: string;
  description?: string;
  dueDate?: string | null;
  priority?: "low" | "medium" | "high" | "urgent";
  assigneeIds?: string[];
  personalSectionId?: string;
}

export interface CreateChildTaskData {
  parentTaskId: string;
  title: string;
  assigneeId?: string;
}

export interface CreateSubtaskData {
  taskId: string;
  title: string;
}

function invalidateAllTaskCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  projectId?: string | null,
  parentTaskId?: string | null
) {
  queryClient.invalidateQueries({ queryKey: ["/api/tasks/my"] });
  queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
  
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
    queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
  }
  
  if (parentTaskId) {
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", parentTaskId] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", parentTaskId, "childtasks"] });
    queryClient.invalidateQueries({ queryKey: ["/api/tasks", parentTaskId, "subtasks"] });
  }
  
  queryClient.invalidateQueries({ 
    predicate: (query) => {
      const key = query.queryKey;
      return Array.isArray(key) && key[0] === "/api/projects" && key[2] === "sections";
    }
  });
}

export function useCreateTask(options?: { 
  onSuccess?: (task: any) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreateTaskData & { projectId: string }) => {
      const response = await apiRequest("POST", "/api/tasks", data);
      return response.json();
    },
    onMutate: async (data) => {
      const myTasksKey = ["/api/tasks/my"];
      await queryClient.cancelQueries({ queryKey: myTasksKey });
      const previousMyTasks = queryClient.getQueryData(myTasksKey);
      const optimisticTask = {
        id: `temp-${Date.now()}`,
        title: data.title,
        description: data.description || null,
        status: data.status || "todo",
        priority: data.priority || "medium",
        projectId: data.projectId,
        sectionId: data.sectionId || null,
        dueDate: data.dueDate || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assignees: [],
        tags: [],
        subtasks: [],
      };
      queryClient.setQueryData<any[]>(myTasksKey, (old = []) => [optimisticTask, ...old]);
      return { previousMyTasks };
    },
    onError: (error: Error, _data, context: any) => {
      if (context?.previousMyTasks) {
        queryClient.setQueryData(["/api/tasks/my"], context.previousMyTasks);
      }
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
    onSettled: (_data, _error, variables) => {
      invalidateAllTaskCaches(queryClient, variables.projectId);
    },
    onSuccess: (task) => {
      options?.onSuccess?.(task);
    },
  });
}

export function useCreatePersonalTask(options?: { 
  onSuccess?: (task: any) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePersonalTaskData) => {
      const response = await apiRequest("POST", "/api/tasks/personal", data);
      return response.json();
    },
    onSuccess: (task) => {
      invalidateAllTaskCaches(queryClient, null);
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateChildTask(options?: { 
  projectId?: string;
  onSuccess?: (task: any) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ parentTaskId, title, assigneeId }: CreateChildTaskData) => {
      const response = await apiRequest("POST", `/api/tasks/${parentTaskId}/childtasks`, { 
        title, 
        assigneeId 
      });
      return response.json();
    },
    onSuccess: (task) => {
      invalidateAllTaskCaches(queryClient, options?.projectId || task.projectId);
      
      if (task.parentTaskId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.parentTaskId, "childtasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", task.parentTaskId] });
      }
      options?.onSuccess?.(task);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}

export function useCreateSubtask(options?: { 
  projectId?: string;
  onSuccess?: (subtask: any) => void;
  onError?: (error: Error) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ taskId, title }: CreateSubtaskData) => {
      const response = await apiRequest("POST", `/api/tasks/${taskId}/subtasks`, { title });
      return response.json();
    },
    onSuccess: (subtask, variables) => {
      invalidateAllTaskCaches(queryClient, options?.projectId || subtask.projectId, variables.taskId);
      options?.onSuccess?.(subtask);
    },
    onError: (error: Error) => {
      const { title, description } = formatErrorForToast(error);
      toast({
        title,
        description,
        variant: "destructive",
      });
      options?.onError?.(error);
    },
  });
}
