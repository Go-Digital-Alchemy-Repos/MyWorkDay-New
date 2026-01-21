import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface ActiveTimer {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  status: "running" | "paused";
  elapsedSeconds: number;
  lastStartedAt: string;
  createdAt: string;
  updatedAt: string;
  client?: { id: string; companyName: string } | null;
  project?: { id: string; name: string } | null;
  task?: { id: string; title: string } | null;
}

const TIMER_QUERY_KEY = "/api/timer/current";
const BROADCAST_CHANNEL_NAME = "active-timer-sync";
const RUNNING_REFETCH_INTERVAL = 30000; // 30 seconds
const PAUSED_REFETCH_INTERVAL = 60000; // 60 seconds

export function useActiveTimer() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const hasShownRecoveryToast = useRef(false);

  const isEligible = user && user.role !== "super_user";

  const {
    data: timer,
    isLoading,
    error,
    refetch,
  } = useQuery<ActiveTimer | null>({
    queryKey: [TIMER_QUERY_KEY],
    enabled: !!isEligible,
    staleTime: 10000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  const invalidateTimer = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [TIMER_QUERY_KEY] });
  }, [queryClient]);

  const broadcastTimerUpdate = useCallback(() => {
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.postMessage({ type: "timer-updated" });
      } catch {
        // BroadcastChannel may fail in some environments
      }
    }
    // Fallback: localStorage event for older browsers
    try {
      localStorage.setItem("timer-sync", Date.now().toString());
      localStorage.removeItem("timer-sync");
    } catch {
      // localStorage may be unavailable
    }
  }, []);

  // Setup BroadcastChannel for cross-tab sync
  useEffect(() => {
    if (!isEligible) return;

    try {
      broadcastChannelRef.current = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      broadcastChannelRef.current.onmessage = (event) => {
        if (event.data?.type === "timer-updated") {
          invalidateTimer();
        }
      };
    } catch {
      // BroadcastChannel not supported
    }

    // Fallback: listen to localStorage events
    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === "timer-sync") {
        invalidateTimer();
      }
    };
    window.addEventListener("storage", handleStorageEvent);

    return () => {
      broadcastChannelRef.current?.close();
      broadcastChannelRef.current = null;
      window.removeEventListener("storage", handleStorageEvent);
    };
  }, [isEligible, invalidateTimer]);

  // Periodic refetch based on timer status
  useEffect(() => {
    if (!isEligible || !timer) return;

    const interval = timer.status === "running" 
      ? RUNNING_REFETCH_INTERVAL 
      : PAUSED_REFETCH_INTERVAL;

    const intervalId = setInterval(() => {
      refetch();
    }, interval);

    return () => clearInterval(intervalId);
  }, [isEligible, timer?.status, refetch]);

  // Show recovery toast on app boot if timer exists
  useEffect(() => {
    if (timer && !hasShownRecoveryToast.current && !isLoading) {
      const sessionKey = `timer-recovered-${timer.id}`;
      const alreadyShown = sessionStorage.getItem(sessionKey);
      
      if (!alreadyShown) {
        toast({
          title: "Timer recovered",
          description: `Your ${timer.status === "running" ? "running" : "paused"} timer has been restored.`,
        });
        sessionStorage.setItem(sessionKey, "true");
      }
      hasShownRecoveryToast.current = true;
    }
  }, [timer, isLoading, toast]);

  // Start timer mutation
  const startMutation = useMutation({
    mutationFn: async (data: {
      clientId?: string | null;
      projectId?: string | null;
      taskId?: string | null;
      description?: string | null;
    }) => {
      const response = await apiRequest("POST", "/api/timer/start", data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 409 && errorData.error === "TIMER_ALREADY_RUNNING") {
          throw new Error("TIMER_ALREADY_RUNNING");
        }
        throw new Error(errorData.message || errorData.error || "Failed to start timer");
      }
      return response.json();
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error: Error) => {
      // Handle 409 - timer already running
      if (error.message === "TIMER_ALREADY_RUNNING") {
        toast({
          title: "Timer already running",
          description: "You already have an active timer. Stop it before starting a new one.",
          variant: "destructive",
        });
        invalidateTimer(); // Refresh to show existing timer
      } else {
        toast({
          title: "Failed to start timer",
          description: error.message || "Please try again",
          variant: "destructive",
        });
      }
    },
  });

  // Pause timer mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/pause");
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [TIMER_QUERY_KEY] });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>([TIMER_QUERY_KEY]);
      
      if (previousTimer) {
        queryClient.setQueryData<ActiveTimer | null>([TIMER_QUERY_KEY], {
          ...previousTimer,
          status: "paused",
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData([TIMER_QUERY_KEY], context.previousTimer);
      }
      toast({
        title: "Failed to pause timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Resume timer mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/timer/resume");
      return response.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: [TIMER_QUERY_KEY] });
      const previousTimer = queryClient.getQueryData<ActiveTimer | null>([TIMER_QUERY_KEY]);
      
      if (previousTimer) {
        queryClient.setQueryData<ActiveTimer | null>([TIMER_QUERY_KEY], {
          ...previousTimer,
          status: "running",
          lastStartedAt: new Date().toISOString(),
        });
      }
      return { previousTimer };
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error, _, context) => {
      if (context?.previousTimer) {
        queryClient.setQueryData([TIMER_QUERY_KEY], context.previousTimer);
      }
      toast({
        title: "Failed to resume timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  // Stop timer mutation (does NOT clear timer on error)
  const stopMutation = useMutation({
    mutationFn: async (data: {
      clientId: string;
      projectId?: string | null;
      taskId?: string | null;
      description?: string | null;
      scope?: string;
      saveEntry?: boolean;
    }) => {
      const response = await apiRequest("POST", "/api/timer/stop", data);
      return response.json();
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
      queryClient.invalidateQueries({ queryKey: ["/api/time-entries"] });
    },
    onError: (error) => {
      // Do NOT clear timer on failure - keep it recoverable
      toast({
        title: "Failed to stop timer",
        description: error.message || "Please try again. Your timer is still active.",
        variant: "destructive",
      });
      // Refetch to ensure UI stays in sync
      invalidateTimer();
    },
  });

  // Delete timer without saving
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/timer/current");
      return response.json();
    },
    onSuccess: () => {
      invalidateTimer();
      broadcastTimerUpdate();
    },
    onError: (error) => {
      toast({
        title: "Failed to discard timer",
        description: error.message || "Please try again",
        variant: "destructive",
      });
      invalidateTimer();
    },
  });

  return {
    timer,
    isLoading,
    error,
    hasActiveTimer: !!timer,
    isRunning: timer?.status === "running",
    isPaused: timer?.status === "paused",
    refetch,
    invalidateTimer,
    broadcastTimerUpdate,
    startMutation,
    pauseMutation,
    resumeMutation,
    stopMutation,
    deleteMutation,
  };
}
