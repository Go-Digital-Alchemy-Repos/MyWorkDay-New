import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSocket, joinProjectRoom, leaveProjectRoom } from "./socket";
import type { ServerToClientEvents } from "@shared/events";

export function useProjectSocket(projectId: string | null | undefined) {
  const queryClient = useQueryClient();
  const currentProjectId = useRef<string | null>(null);

  useEffect(() => {
    if (!projectId) return;

    const socket = getSocket();

    if (currentProjectId.current !== projectId) {
      if (currentProjectId.current) {
        leaveProjectRoom(currentProjectId.current);
      }
      joinProjectRoom(projectId);
      currentProjectId.current = projectId;
    }

    const handleProjectUpdated: ServerToClientEvents["project:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      }
    };

    const handleSectionCreated: ServerToClientEvents["section:created"] = (payload) => {
      if (payload.section.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      }
    };

    const handleSectionUpdated: ServerToClientEvents["section:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      }
    };

    const handleSectionDeleted: ServerToClientEvents["section:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      }
    };

    const handleSectionReordered: ServerToClientEvents["section:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      }
    };

    const handleTaskCreated: ServerToClientEvents["task:created"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "calendar-events"] });
        if (payload.task.parentTaskId) {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.task.parentTaskId] });
        }
      }
    };

    const handleTaskUpdated: ServerToClientEvents["task:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "calendar-events"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId] });
        if (payload.parentTaskId) {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.parentTaskId] });
        }
      }
    };

    const handleTaskDeleted: ServerToClientEvents["task:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "calendar-events"] });
        if (payload.parentTaskId) {
          queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.parentTaskId] });
        }
      }
    };

    const handleTaskMoved: ServerToClientEvents["task:moved"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks"] });
      }
    };

    const handleTaskReordered: ServerToClientEvents["task:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "sections"] });
      }
    };

    const handleSubtaskCreated: ServerToClientEvents["subtask:created"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId, "subtasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId] });
      }
    };

    const handleSubtaskUpdated: ServerToClientEvents["subtask:updated"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId, "subtasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId] });
      }
    };

    const handleSubtaskDeleted: ServerToClientEvents["subtask:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId, "subtasks"] });
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId] });
      }
    };

    const handleSubtaskReordered: ServerToClientEvents["subtask:reordered"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks", payload.taskId, "subtasks"] });
      }
    };

    const handleAttachmentAdded: ServerToClientEvents["attachment:added"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks", payload.taskId, "attachments"] });
      }
    };

    const handleAttachmentDeleted: ServerToClientEvents["attachment:deleted"] = (payload) => {
      if (payload.projectId === projectId) {
        queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "tasks", payload.taskId, "attachments"] });
      }
    };

    socket.on("project:updated", handleProjectUpdated);
    socket.on("section:created", handleSectionCreated);
    socket.on("section:updated", handleSectionUpdated);
    socket.on("section:deleted", handleSectionDeleted);
    socket.on("section:reordered", handleSectionReordered);
    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("task:moved", handleTaskMoved);
    socket.on("task:reordered", handleTaskReordered);
    socket.on("subtask:created", handleSubtaskCreated);
    socket.on("subtask:updated", handleSubtaskUpdated);
    socket.on("subtask:deleted", handleSubtaskDeleted);
    socket.on("subtask:reordered", handleSubtaskReordered);
    socket.on("attachment:added", handleAttachmentAdded);
    socket.on("attachment:deleted", handleAttachmentDeleted);

    return () => {
      socket.off("project:updated", handleProjectUpdated);
      socket.off("section:created", handleSectionCreated);
      socket.off("section:updated", handleSectionUpdated);
      socket.off("section:deleted", handleSectionDeleted);
      socket.off("section:reordered", handleSectionReordered);
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("task:moved", handleTaskMoved);
      socket.off("task:reordered", handleTaskReordered);
      socket.off("subtask:created", handleSubtaskCreated);
      socket.off("subtask:updated", handleSubtaskUpdated);
      socket.off("subtask:deleted", handleSubtaskDeleted);
      socket.off("subtask:reordered", handleSubtaskReordered);
      socket.off("attachment:added", handleAttachmentAdded);
      socket.off("attachment:deleted", handleAttachmentDeleted);

      if (currentProjectId.current) {
        leaveProjectRoom(currentProjectId.current);
        currentProjectId.current = null;
      }
    };
  }, [projectId, queryClient]);
}

export function useSocketEvent<E extends keyof ServerToClientEvents>(
  event: E,
  handler: ServerToClientEvents[E]
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const socket = getSocket();
    const wrappedHandler = (...args: Parameters<ServerToClientEvents[E]>) => {
      (handlerRef.current as Function)(...args);
    };

    socket.on(event, wrappedHandler as any);

    return () => {
      socket.off(event, wrappedHandler as any);
    };
  }, [event]);
}
