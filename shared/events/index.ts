/**
 * Shared Socket.IO Event Contracts
 * 
 * This file defines all real-time event names and their payload types.
 * Both server and client import from this file to ensure type safety.
 * 
 * Event naming convention: {entity}:{action}
 * - entity: project, section, task, subtask, attachment
 * - action: created, updated, deleted, moved, reordered
 */

// =============================================================================
// PROJECT EVENTS
// =============================================================================

export const PROJECT_EVENTS = {
  CREATED: 'project:created',
  UPDATED: 'project:updated',
  DELETED: 'project:deleted',
  CLIENT_ASSIGNED: 'project:clientAssigned',
} as const;

export interface ProjectCreatedPayload {
  project: {
    id: string;
    name: string;
    description: string | null;
    color: string;
    icon: string | null;
    workspaceId: string;
    teamId: string | null;
    isArchived: boolean;
    createdAt: Date;
  };
}

export interface ProjectUpdatedPayload {
  projectId: string;
  updates: Partial<ProjectCreatedPayload['project']>;
}

export interface ProjectDeletedPayload {
  projectId: string;
}

export interface ProjectClientAssignedPayload {
  projectId: string;
  clientId: string | null;
  previousClientId: string | null;
  project: ProjectCreatedPayload['project'] & { clientId: string | null };
}

// =============================================================================
// SECTION EVENTS
// =============================================================================

export const SECTION_EVENTS = {
  CREATED: 'section:created',
  UPDATED: 'section:updated',
  DELETED: 'section:deleted',
  REORDERED: 'section:reordered',
} as const;

export interface SectionCreatedPayload {
  section: {
    id: string;
    name: string;
    projectId: string;
    position: number;
    createdAt: Date;
  };
}

export interface SectionUpdatedPayload {
  sectionId: string;
  projectId: string;
  updates: Partial<SectionCreatedPayload['section']>;
}

export interface SectionDeletedPayload {
  sectionId: string;
  projectId: string;
}

export interface SectionReorderedPayload {
  projectId: string;
  sections: Array<{ id: string; position: number }>;
}

// =============================================================================
// TASK EVENTS
// =============================================================================

export const TASK_EVENTS = {
  CREATED: 'task:created',
  UPDATED: 'task:updated',
  DELETED: 'task:deleted',
  MOVED: 'task:moved',
  REORDERED: 'task:reordered',
} as const;

export interface TaskPayload {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  startDate: Date | null;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  position: number;
  createdAt: Date;
  assignees?: Array<{ id: string; name: string; email: string; avatarUrl: string | null }>;
  tags?: Array<{ id: string; name: string; color: string }>;
}

export interface TaskCreatedPayload {
  task: TaskPayload;
  projectId: string;
}

export interface TaskUpdatedPayload {
  taskId: string;
  projectId: string;
  parentTaskId: string | null;
  updates: Partial<TaskPayload>;
}

export interface TaskDeletedPayload {
  taskId: string;
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
}

export interface TaskMovedPayload {
  taskId: string;
  projectId: string;
  fromSectionId: string | null;
  toSectionId: string | null;
  newPosition: number;
}

export interface TaskReorderedPayload {
  projectId: string;
  sectionId: string | null;
  parentTaskId: string | null;
  tasks: Array<{ id: string; position: number }>;
}

// =============================================================================
// SUBTASK EVENTS (checklist items, not child tasks)
// =============================================================================

export const SUBTASK_EVENTS = {
  CREATED: 'subtask:created',
  UPDATED: 'subtask:updated',
  DELETED: 'subtask:deleted',
  REORDERED: 'subtask:reordered',
} as const;

export interface SubtaskPayload {
  id: string;
  title: string;
  isCompleted: boolean;
  taskId: string;
  position: number;
  createdAt: Date;
}

export interface SubtaskCreatedPayload {
  subtask: SubtaskPayload;
  taskId: string;
  projectId: string;
}

export interface SubtaskUpdatedPayload {
  subtaskId: string;
  taskId: string;
  projectId: string;
  updates: Partial<SubtaskPayload>;
}

export interface SubtaskDeletedPayload {
  subtaskId: string;
  taskId: string;
  projectId: string;
}

export interface SubtaskReorderedPayload {
  taskId: string;
  projectId: string;
  subtasks: Array<{ id: string; position: number }>;
}

// =============================================================================
// ATTACHMENT EVENTS
// =============================================================================

export const ATTACHMENT_EVENTS = {
  ADDED: 'attachment:added',
  DELETED: 'attachment:deleted',
} as const;

export interface AttachmentPayload {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  storageKey: string;
  taskId: string | null;
  subtaskId: string | null;
  uploadedBy: string;
  createdAt: Date;
}

export interface AttachmentAddedPayload {
  attachment: AttachmentPayload;
  taskId: string | null;
  subtaskId: string | null;
  projectId: string;
}

export interface AttachmentDeletedPayload {
  attachmentId: string;
  taskId: string | null;
  subtaskId: string | null;
  projectId: string;
}

// =============================================================================
// CLIENT EVENTS (CRM Module)
// =============================================================================

export const CLIENT_EVENTS = {
  CREATED: 'client:created',
  UPDATED: 'client:updated',
  DELETED: 'client:deleted',
} as const;

export interface ClientPayload {
  id: string;
  companyName: string;
  displayName: string | null;
  status: string;
  workspaceId: string;
  createdAt: Date;
}

export interface ClientCreatedPayload {
  client: ClientPayload;
  workspaceId: string;
}

export interface ClientUpdatedPayload {
  clientId: string;
  workspaceId: string;
  updates: Partial<ClientPayload>;
}

export interface ClientDeletedPayload {
  clientId: string;
  workspaceId: string;
}

// =============================================================================
// CLIENT CONTACT EVENTS
// =============================================================================

export const CLIENT_CONTACT_EVENTS = {
  CREATED: 'clientContact:created',
  UPDATED: 'clientContact:updated',
  DELETED: 'clientContact:deleted',
} as const;

export interface ClientContactPayload {
  id: string;
  clientId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isPrimary: boolean;
  createdAt: Date;
}

export interface ClientContactCreatedPayload {
  contact: ClientContactPayload;
  clientId: string;
  workspaceId: string;
}

export interface ClientContactUpdatedPayload {
  contactId: string;
  clientId: string;
  workspaceId: string;
  updates: Partial<ClientContactPayload>;
}

export interface ClientContactDeletedPayload {
  contactId: string;
  clientId: string;
  workspaceId: string;
}

// =============================================================================
// CLIENT INVITE EVENTS (Placeholder for future auth integration)
// =============================================================================

export const CLIENT_INVITE_EVENTS = {
  SENT: 'clientInvite:sent',
  REVOKED: 'clientInvite:revoked',
} as const;

export interface ClientInvitePayload {
  id: string;
  clientId: string;
  contactId: string;
  email: string;
  status: string;
  createdAt: Date;
}

export interface ClientInviteSentPayload {
  invite: ClientInvitePayload;
  clientId: string;
  workspaceId: string;
}

export interface ClientInviteRevokedPayload {
  inviteId: string;
  clientId: string;
  workspaceId: string;
}

// =============================================================================
// ROOM EVENTS (for joining/leaving project and client rooms)
// =============================================================================

export const ROOM_EVENTS = {
  JOIN_PROJECT: 'room:join:project',
  LEAVE_PROJECT: 'room:leave:project',
  JOIN_CLIENT: 'room:join:client',
  LEAVE_CLIENT: 'room:leave:client',
  JOIN_WORKSPACE: 'room:join:workspace',
  LEAVE_WORKSPACE: 'room:leave:workspace',
} as const;

export interface JoinProjectPayload {
  projectId: string;
}

export interface LeaveProjectPayload {
  projectId: string;
}

export interface JoinClientPayload {
  clientId: string;
}

export interface LeaveClientPayload {
  clientId: string;
}

export interface JoinWorkspacePayload {
  workspaceId: string;
}

export interface LeaveWorkspacePayload {
  workspaceId: string;
}

// =============================================================================
// TIME TRACKING EVENTS
// =============================================================================

export const TIMER_EVENTS = {
  STARTED: 'timer:started',
  PAUSED: 'timer:paused',
  RESUMED: 'timer:resumed',
  STOPPED: 'timer:stopped',
  UPDATED: 'timer:updated',
} as const;

export const TIME_ENTRY_EVENTS = {
  CREATED: 'timeEntry:created',
  UPDATED: 'timeEntry:updated',
  DELETED: 'timeEntry:deleted',
} as const;

export interface TimerPayload {
  id: string;
  userId: string;
  workspaceId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  status: 'running' | 'paused';
  elapsedSeconds: number;
  lastStartedAt: Date;
  createdAt: Date;
}

export interface TimerStartedPayload {
  timer: TimerPayload;
  userId: string;
}

export interface TimerPausedPayload {
  timerId: string;
  userId: string;
  elapsedSeconds: number;
}

export interface TimerResumedPayload {
  timerId: string;
  userId: string;
  lastStartedAt: Date;
}

export interface TimerStoppedPayload {
  timerId: string;
  userId: string;
  timeEntryId: string | null; // Created time entry ID, null if discarded
}

export interface TimerUpdatedPayload {
  timerId: string;
  userId: string;
  updates: Partial<TimerPayload>;
}

export interface TimeEntryPayload {
  id: string;
  workspaceId: string;
  userId: string;
  clientId: string | null;
  projectId: string | null;
  taskId: string | null;
  description: string | null;
  startTime: Date;
  endTime: Date | null;
  durationSeconds: number;
  scope: 'in_scope' | 'out_of_scope';
  isManual: boolean;
  createdAt: Date;
}

export interface TimeEntryCreatedPayload {
  timeEntry: TimeEntryPayload;
  workspaceId: string;
}

export interface TimeEntryUpdatedPayload {
  timeEntryId: string;
  workspaceId: string;
  updates: Partial<TimeEntryPayload>;
}

export interface TimeEntryDeletedPayload {
  timeEntryId: string;
  workspaceId: string;
}

// =============================================================================
// PERSONAL TASK EVENTS (My Tasks)
// =============================================================================

export const MY_TASK_EVENTS = {
  CREATED: 'myTask:created',
  UPDATED: 'myTask:updated',
  DELETED: 'myTask:deleted',
} as const;

export interface MyTaskPayload {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  isPersonal: boolean;
  createdBy: string;
  createdAt: Date;
}

export interface MyTaskCreatedPayload {
  userId: string;
  task: MyTaskPayload;
}

export interface MyTaskUpdatedPayload {
  userId: string;
  taskId: string;
  updates: Partial<MyTaskPayload>;
}

export interface MyTaskDeletedPayload {
  userId: string;
  taskId: string;
}

// =============================================================================
// CONNECTION EVENTS
// =============================================================================

export const CONNECTION_EVENTS = {
  CONNECTED: 'connection:connected',
} as const;

export interface ConnectionConnectedPayload {
  serverTime: string; // ISO timestamp
  requestId: string;  // Unique connection request ID
  userId: string | null;
  tenantId: string | null;
}

// =============================================================================
// CHAT EVENTS (Slack-like messaging)
// =============================================================================

export const CHAT_EVENTS = {
  NEW_MESSAGE: 'chat:newMessage',
  MESSAGE_UPDATED: 'chat:messageUpdated',
  MESSAGE_DELETED: 'chat:messageDeleted',
  CHANNEL_CREATED: 'chat:channelCreated',
  MEMBER_JOINED: 'chat:memberJoined',
  MEMBER_LEFT: 'chat:memberLeft',
  MEMBER_ADDED: 'chat:memberAdded',
  MEMBER_REMOVED: 'chat:memberRemoved',
  CONVERSATION_READ: 'chat:conversationRead',
} as const;

export const CHAT_ROOM_EVENTS = {
  JOIN: 'chat:join',
  LEAVE: 'chat:leave',
  SEND: 'chat:send',
} as const;

export interface ChatMessagePayload {
  id: string;
  tenantId: string;
  channelId: string | null;
  dmThreadId: string | null;
  authorUserId: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  author?: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
  };
}

export interface ChatNewMessagePayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  message: ChatMessagePayload;
}

export interface ChatMessageUpdatedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  messageId: string;
  updates: Partial<ChatMessagePayload>;
}

export interface ChatMessageDeletedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  messageId: string;
}

export interface ChatChannelCreatedPayload {
  channel: {
    id: string;
    tenantId: string;
    name: string;
    isPrivate: boolean;
    createdBy: string;
    createdAt: Date;
  };
}

export interface ChatMemberJoinedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  userName: string;
}

export interface ChatMemberLeftPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  userName: string;
  removedBy: string | null;
}

export interface ChatMemberAddedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userAvatarUrl: string | null;
  addedBy: string | null;
}

export interface ChatMemberRemovedPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  userName: string;
  removedBy: string | null;
}

export interface ChatConversationReadPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  userId: string;
  lastReadAt: Date;
  lastReadMessageId: string;
}

export interface ChatJoinPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  // Note: userId and tenantId are derived server-side from authenticated session
}

export interface ChatLeavePayload {
  targetType: 'channel' | 'dm';
  targetId: string;
}

export interface ChatSendPayload {
  targetType: 'channel' | 'dm';
  targetId: string;
  body: string;
}

// =============================================================================
// NOTIFICATION EVENTS
// =============================================================================

export const NOTIFICATION_EVENTS = {
  NEW: 'notification:new',
  READ: 'notification:read',
  ALL_READ: 'notification:allRead',
  DELETED: 'notification:deleted',
} as const;

export interface NotificationPayload {
  id: string;
  tenantId: string | null;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  payloadJson: any;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationNewPayload {
  notification: NotificationPayload;
}

export interface NotificationReadPayload {
  notificationId: string;
  userId: string;
}

export interface NotificationAllReadPayload {
  userId: string;
}

export interface NotificationDeletedPayload {
  notificationId: string;
  userId: string;
}

// =============================================================================
// ALL EVENTS TYPE (for type-safe event handling)
// =============================================================================

export type ServerToClientEvents = {
  [PROJECT_EVENTS.CREATED]: (payload: ProjectCreatedPayload) => void;
  [PROJECT_EVENTS.UPDATED]: (payload: ProjectUpdatedPayload) => void;
  [PROJECT_EVENTS.DELETED]: (payload: ProjectDeletedPayload) => void;
  [PROJECT_EVENTS.CLIENT_ASSIGNED]: (payload: ProjectClientAssignedPayload) => void;
  [SECTION_EVENTS.CREATED]: (payload: SectionCreatedPayload) => void;
  [SECTION_EVENTS.UPDATED]: (payload: SectionUpdatedPayload) => void;
  [SECTION_EVENTS.DELETED]: (payload: SectionDeletedPayload) => void;
  [SECTION_EVENTS.REORDERED]: (payload: SectionReorderedPayload) => void;
  [TASK_EVENTS.CREATED]: (payload: TaskCreatedPayload) => void;
  [TASK_EVENTS.UPDATED]: (payload: TaskUpdatedPayload) => void;
  [TASK_EVENTS.DELETED]: (payload: TaskDeletedPayload) => void;
  [TASK_EVENTS.MOVED]: (payload: TaskMovedPayload) => void;
  [TASK_EVENTS.REORDERED]: (payload: TaskReorderedPayload) => void;
  [SUBTASK_EVENTS.CREATED]: (payload: SubtaskCreatedPayload) => void;
  [SUBTASK_EVENTS.UPDATED]: (payload: SubtaskUpdatedPayload) => void;
  [SUBTASK_EVENTS.DELETED]: (payload: SubtaskDeletedPayload) => void;
  [SUBTASK_EVENTS.REORDERED]: (payload: SubtaskReorderedPayload) => void;
  [ATTACHMENT_EVENTS.ADDED]: (payload: AttachmentAddedPayload) => void;
  [ATTACHMENT_EVENTS.DELETED]: (payload: AttachmentDeletedPayload) => void;
  // Client events
  [CLIENT_EVENTS.CREATED]: (payload: ClientCreatedPayload) => void;
  [CLIENT_EVENTS.UPDATED]: (payload: ClientUpdatedPayload) => void;
  [CLIENT_EVENTS.DELETED]: (payload: ClientDeletedPayload) => void;
  [CLIENT_CONTACT_EVENTS.CREATED]: (payload: ClientContactCreatedPayload) => void;
  [CLIENT_CONTACT_EVENTS.UPDATED]: (payload: ClientContactUpdatedPayload) => void;
  [CLIENT_CONTACT_EVENTS.DELETED]: (payload: ClientContactDeletedPayload) => void;
  [CLIENT_INVITE_EVENTS.SENT]: (payload: ClientInviteSentPayload) => void;
  [CLIENT_INVITE_EVENTS.REVOKED]: (payload: ClientInviteRevokedPayload) => void;
  // Time tracking events
  [TIMER_EVENTS.STARTED]: (payload: TimerStartedPayload) => void;
  [TIMER_EVENTS.PAUSED]: (payload: TimerPausedPayload) => void;
  [TIMER_EVENTS.RESUMED]: (payload: TimerResumedPayload) => void;
  [TIMER_EVENTS.STOPPED]: (payload: TimerStoppedPayload) => void;
  [TIMER_EVENTS.UPDATED]: (payload: TimerUpdatedPayload) => void;
  [TIME_ENTRY_EVENTS.CREATED]: (payload: TimeEntryCreatedPayload) => void;
  [TIME_ENTRY_EVENTS.UPDATED]: (payload: TimeEntryUpdatedPayload) => void;
  [TIME_ENTRY_EVENTS.DELETED]: (payload: TimeEntryDeletedPayload) => void;
  // Personal task events
  [MY_TASK_EVENTS.CREATED]: (payload: MyTaskCreatedPayload) => void;
  [MY_TASK_EVENTS.UPDATED]: (payload: MyTaskUpdatedPayload) => void;
  [MY_TASK_EVENTS.DELETED]: (payload: MyTaskDeletedPayload) => void;
  // Chat events
  [CHAT_EVENTS.NEW_MESSAGE]: (payload: ChatNewMessagePayload) => void;
  [CHAT_EVENTS.MESSAGE_UPDATED]: (payload: ChatMessageUpdatedPayload) => void;
  [CHAT_EVENTS.MESSAGE_DELETED]: (payload: ChatMessageDeletedPayload) => void;
  [CHAT_EVENTS.CHANNEL_CREATED]: (payload: ChatChannelCreatedPayload) => void;
  [CHAT_EVENTS.MEMBER_JOINED]: (payload: ChatMemberJoinedPayload) => void;
  [CHAT_EVENTS.MEMBER_LEFT]: (payload: ChatMemberLeftPayload) => void;
  [CHAT_EVENTS.MEMBER_ADDED]: (payload: ChatMemberAddedPayload) => void;
  [CHAT_EVENTS.MEMBER_REMOVED]: (payload: ChatMemberRemovedPayload) => void;
  [CHAT_EVENTS.CONVERSATION_READ]: (payload: ChatConversationReadPayload) => void;
  // Connection events
  [CONNECTION_EVENTS.CONNECTED]: (payload: ConnectionConnectedPayload) => void;
  // Notification events
  [NOTIFICATION_EVENTS.NEW]: (payload: NotificationNewPayload) => void;
  [NOTIFICATION_EVENTS.READ]: (payload: NotificationReadPayload) => void;
  [NOTIFICATION_EVENTS.ALL_READ]: (payload: NotificationAllReadPayload) => void;
  [NOTIFICATION_EVENTS.DELETED]: (payload: NotificationDeletedPayload) => void;
};

export type ClientToServerEvents = {
  [ROOM_EVENTS.JOIN_PROJECT]: (payload: JoinProjectPayload) => void;
  [ROOM_EVENTS.LEAVE_PROJECT]: (payload: LeaveProjectPayload) => void;
  [ROOM_EVENTS.JOIN_CLIENT]: (payload: JoinClientPayload) => void;
  [ROOM_EVENTS.LEAVE_CLIENT]: (payload: LeaveClientPayload) => void;
  [ROOM_EVENTS.JOIN_WORKSPACE]: (payload: JoinWorkspacePayload) => void;
  [ROOM_EVENTS.LEAVE_WORKSPACE]: (payload: LeaveWorkspacePayload) => void;
  // Chat room events
  [CHAT_ROOM_EVENTS.JOIN]: (payload: ChatJoinPayload) => void;
  [CHAT_ROOM_EVENTS.LEAVE]: (payload: ChatLeavePayload) => void;
  [CHAT_ROOM_EVENTS.SEND]: (payload: ChatSendPayload) => void;
};
