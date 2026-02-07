import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, Settings, Clock, MessageSquare, Users, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getSocket } from "@/lib/realtime/socket";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { ServerToClientEvents } from "@shared/events";
import { useTaskDrawerOptional } from "@/lib/task-drawer-context";
import { VirtualizedList } from "@/components/ui/virtualized-list";

interface Notification {
  id: string;
  tenantId: string | null;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  payloadJson: unknown;
  readAt: Date | null;
  createdAt: Date;
}

interface NotificationPreferences {
  id: string;
  userId: string;
  taskDeadline: boolean;
  taskAssigned: boolean;
  taskCompleted: boolean;
  commentAdded: boolean;
  commentMention: boolean;
  projectUpdate: boolean;
  projectMemberAdded: boolean;
  taskStatusChanged: boolean;
  emailEnabled: boolean;
}

type NotificationType = 
  | "task_deadline"
  | "task_assigned"
  | "task_completed"
  | "comment_added"
  | "comment_mention"
  | "project_update"
  | "project_member_added"
  | "task_status_changed";

const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  task_deadline: "Task Deadlines",
  task_assigned: "Task Assignments",
  task_completed: "Task Completions",
  comment_added: "New Comments",
  comment_mention: "Mentions",
  project_update: "Project Updates",
  project_member_added: "Team Additions",
  task_status_changed: "Status Changes",
};

const NOTIFICATION_TYPE_ICONS: Record<NotificationType, typeof Bell> = {
  task_deadline: Clock,
  task_assigned: Users,
  task_completed: Check,
  comment_added: MessageSquare,
  comment_mention: MessageSquare,
  project_update: FolderKanban,
  project_member_added: Users,
  task_status_changed: FolderKanban,
};

function getNotificationIcon(type: string) {
  const Icon = NOTIFICATION_TYPE_ICONS[type as NotificationType] || Bell;
  return Icon;
}

const TASK_NOTIFICATION_TYPES = [
  "task_deadline",
  "task_assigned", 
  "task_completed",
  "task_status_changed",
];

function isTaskNotification(type: string): boolean {
  return TASK_NOTIFICATION_TYPES.includes(type);
}

function getTaskIdFromPayload(payload: unknown): string | null {
  if (payload && typeof payload === "object" && "taskId" in payload) {
    return (payload as { taskId: string }).taskId;
  }
  return null;
}

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"notifications" | "settings">("notifications");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const taskDrawer = useTaskDrawerOptional();
  const openTask = taskDrawer?.openTask;

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery<Notification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 60000,
  });

const defaultPreferences: NotificationPreferences = {
    id: "",
    userId: "",
    taskDeadline: true,
    taskAssigned: true,
    taskCompleted: true,
    commentAdded: true,
    commentMention: true,
    projectUpdate: true,
    projectMemberAdded: true,
    taskStatusChanged: false,
    emailEnabled: false,
  };

  const { data: preferences = defaultPreferences, isLoading: preferencesLoading } = useQuery<NotificationPreferences>({
    queryKey: ["/api/notifications/preferences"],
  });

  const unreadCount = notifications.filter(n => !n.readAt).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiRequest("PATCH", `/api/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/mark-all-read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({ title: "All notifications marked as read" });
    },
  });

  
  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ type, enabled, emailEnabled }: { type: string; enabled?: boolean; emailEnabled?: boolean }) => {
      await apiRequest("PATCH", "/api/notifications/preferences", { type, enabled, emailEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/preferences"] });
    },
  });

  useEffect(() => {
    const socket = getSocket();

    const handleNewNotification: ServerToClientEvents["notification:new"] = (payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      toast({
        title: payload.notification.title,
        description: payload.notification.message || undefined,
      });
    };

    const handleNotificationRead: ServerToClientEvents["notification:read"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    const handleNotificationAllRead: ServerToClientEvents["notification:allRead"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    const handleNotificationDeleted: ServerToClientEvents["notification:deleted"] = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:read", handleNotificationRead);
    socket.on("notification:allRead", handleNotificationAllRead);
    socket.on("notification:deleted", handleNotificationDeleted);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("notification:read", handleNotificationRead);
      socket.off("notification:allRead", handleNotificationAllRead);
      socket.off("notification:deleted", handleNotificationDeleted);
    };
  }, [queryClient, toast]);

  const typeToField: Record<NotificationType, keyof NotificationPreferences> = {
    task_deadline: "taskDeadline",
    task_assigned: "taskAssigned",
    task_completed: "taskCompleted",
    comment_added: "commentAdded",
    comment_mention: "commentMention",
    project_update: "projectUpdate",
    project_member_added: "projectMemberAdded",
    task_status_changed: "taskStatusChanged",
  };

  const getPreference = (type: NotificationType) => {
    const field = typeToField[type];
    return {
      enabled: preferences[field] as boolean ?? true,
      emailEnabled: preferences.emailEnabled ?? false,
    };
  };

  const handleToggleEnabled = (type: NotificationType, currentEnabled: boolean) => {
    updatePreferenceMutation.mutate({ type, enabled: !currentEnabled });
  };

  const handleToggleEmailEnabled = (type: NotificationType, currentEmailEnabled: boolean) => {
    updatePreferenceMutation.mutate({ type, emailEnabled: !currentEmailEnabled });
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative"
          data-testid="button-notification-center"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-5 min-w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "notifications" | "settings")}>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="notifications" className="h-7 px-2 text-xs" data-testid="tab-notifications">
                  <Bell className="h-3.5 w-3.5" />
                </TabsTrigger>
                <TabsTrigger value="settings" className="h-7 px-2 text-xs" data-testid="tab-notification-settings">
                  <Settings className="h-3.5 w-3.5" />
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="notifications" className="m-0">
            {unreadCount > 0 && (
              <div className="px-4 py-2 border-b bg-muted/50">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs w-full"
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  data-testid="button-mark-all-read"
                >
                  <CheckCheck className="h-3.5 w-3.5 mr-1" />
                  Mark all as read
                </Button>
              </div>
            )}
            <div className="h-80">
              {notificationsLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Loading notifications...
                </div>
              ) : (
                <VirtualizedList
                  data={notifications as Notification[]}
                  style={{ height: "100%" }}
                  overscan={100}
                  emptyContent={
                    <div className="p-8 text-center text-muted-foreground">
                      <Bell className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No notifications yet</p>
                    </div>
                  }
                  itemContent={(_index, notification) => {
                    const Icon = getNotificationIcon(notification.type);
                    const taskId = getTaskIdFromPayload(notification.payloadJson);
                    const isTaskType = isTaskNotification(notification.type);

                    return (
                      <div
                        className={cn(
                          "px-4 py-3 hover-elevate cursor-pointer relative border-b",
                          !notification.readAt && "bg-primary/5"
                        )}
                        onClick={() => {
                          if (!notification.readAt) {
                            markAsReadMutation.mutate(notification.id);
                          }
                          if (isTaskType && taskId && openTask) {
                            setIsOpen(false);
                            openTask(taskId);
                          }
                        }}
                        data-testid={`notification-item-${notification.id}`}
                      >
                        <div className="flex gap-3">
                          <div className={cn(
                            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                            notification.readAt ? "bg-muted" : "bg-primary/10"
                          )}>
                            <Icon className={cn(
                              "h-4 w-4",
                              notification.readAt ? "text-muted-foreground" : "text-primary"
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={cn(
                              "text-sm",
                              notification.readAt ? "text-muted-foreground" : "font-medium"
                            )}>
                              {notification.title}
                            </p>
                            {notification.message && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {notification.message}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        {!notification.readAt && (
                          <div className="absolute left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                    );
                  }}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="m-0">
            <ScrollArea className="h-80">
              {preferencesLoading ? (
                <div className="p-4 text-center text-muted-foreground text-sm">
                  Loading preferences...
                </div>
              ) : (
                <div className="p-4 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Choose which notifications you want to receive.
                  </p>
                  <Separator />
                  <div className="space-y-4">
                    {(Object.keys(NOTIFICATION_TYPE_LABELS) as NotificationType[]).map((type) => {
                      const pref = getPreference(type);
                      const Icon = NOTIFICATION_TYPE_ICONS[type];
                      return (
                        <div key={type} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{NOTIFICATION_TYPE_LABELS[type]}</span>
                          </div>
                          <div className="flex items-center justify-between pl-6">
                            <Label htmlFor={`pref-${type}-enabled`} className="text-xs text-muted-foreground">
                              In-app notifications
                            </Label>
                            <Switch
                              id={`pref-${type}-enabled`}
                              checked={pref.enabled}
                              onCheckedChange={() => handleToggleEnabled(type, pref.enabled)}
                              data-testid={`switch-notification-${type}`}
                            />
                          </div>
                          <div className="flex items-center justify-between pl-6">
                            <Label htmlFor={`pref-${type}-email`} className="text-xs text-muted-foreground">
                              Email notifications
                            </Label>
                            <Switch
                              id={`pref-${type}-email`}
                              checked={pref.emailEnabled}
                              onCheckedChange={() => handleToggleEmailEnabled(type, pref.emailEnabled)}
                              data-testid={`switch-email-${type}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
