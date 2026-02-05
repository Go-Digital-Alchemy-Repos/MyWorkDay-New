/**
 * @module server/storage
 * @description Database storage layer implementing the IStorage interface.
 * 
 * This module provides all CRUD operations for the application's entities.
 * It uses Drizzle ORM for type-safe database operations.
 * 
 * ## Key Features
 * - Multi-tenant data isolation via tenantId scoping
 * - Relational data loading for tasks, comments, etc.
 * - Time tracking with active timers and time entries
 * - Client (CRM) management with contacts and invites
 * 
 * ## Tenant Scoping
 * Many methods have tenant-scoped variants (e.g., getClientsByTenant).
 * Use these methods when enforcing tenant isolation in routes.
 * 
 * @see IStorage for the interface definition
 */
import {
  type User, type InsertUser,
  type Workspace, type InsertWorkspace,
  type WorkspaceMember, type InsertWorkspaceMember,
  type Team, type InsertTeam,
  type TeamMember, type InsertTeamMember,
  type Project, type InsertProject,
  type ProjectMember, type InsertProjectMember,
  type Section, type InsertSection,
  type Task, type InsertTask,
  type TaskAssignee, type InsertTaskAssignee,
  type TaskWatcher, type InsertTaskWatcher,
  type Subtask, type InsertSubtask,
  type Tag, type InsertTag,
  type TaskTag, type InsertTaskTag,
  type SubtaskAssignee, type InsertSubtaskAssignee,
  type SubtaskTag, type InsertSubtaskTag,
  type Comment, type InsertComment,
  type ActivityLog, type InsertActivityLog,
  type TaskAttachment, type InsertTaskAttachment,
  type TaskWithRelations, type SectionWithTasks, type TaskAttachmentWithUser,
  type Client, type InsertClient,
  type ClientContact, type InsertClientContact,
  type ClientInvite, type InsertClientInvite,
  type ClientWithContacts,
  type TimeEntry, type InsertTimeEntry,
  type ActiveTimer, type InsertActiveTimer,
  type TimeEntryWithRelations, type ActiveTimerWithRelations,
  type Invitation, type InsertInvitation,
  type AppSetting,
  type ClientUserAccess, type InsertClientUserAccess,
  type Tenant, type InsertTenant,
  type TenantSettings, type InsertTenantSettings,
  type PersonalTaskSection, type InsertPersonalTaskSection,
  type ChatChannel, type InsertChatChannel,
  type ChatChannelMember, type InsertChatChannelMember,
  type ChatDmThread, type InsertChatDmThread,
  type ChatDmMember, type InsertChatDmMember,
  type ChatMessage, type InsertChatMessage,
  type ChatAttachment, type InsertChatAttachment,
  type ErrorLog, type InsertErrorLog,
  type ClientDivision, type InsertClientDivision,
  type DivisionMember, type InsertDivisionMember,
  type Notification, type InsertNotification,
  type NotificationPreferences, type InsertNotificationPreferences,
  users, workspaces, workspaceMembers, teams, teamMembers,
  projects, projectMembers, hiddenProjects, sections, tasks, taskAssignees, taskWatchers,
  subtasks, subtaskAssignees, subtaskTags, tags, taskTags, comments, commentMentions, activityLog, taskAttachments,
  clients, clientContacts, clientInvites, clientUserAccess,
  clientDivisions, divisionMembers,
  timeEntries, activeTimers,
  invitations, appSettings, tenants, tenantSettings, personalTaskSections,
  chatChannels, chatChannelMembers, chatDmThreads, chatDmMembers, chatMessages, chatAttachments, chatReads, errorLogs,
  notifications, notificationPreferences,
  UserRole,
  type CommentMention, type InsertCommentMention,
} from "@shared/schema";
import crypto from "crypto";
import { db } from "./db";
import { assertInsertHasTenantId } from "./lib/errors";

// Calendar Task - Lightweight DTO for calendar display (no heavy relations)
export type CalendarTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  projectId: string | null;
  assignees: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
};

// Project Activity Feed Types
export type ProjectActivityItem = {
  id: string;
  type: "task_created" | "task_updated" | "comment_added" | "time_logged";
  timestamp: Date;
  actorId: string;
  actorName: string;
  actorEmail: string;
  actorAvatarUrl: string | null;
  entityId: string;
  entityTitle: string;
  metadata?: Record<string, unknown>;
};
import { eq, and, desc, asc, inArray, notInArray, gte, lte, gt, isNull, sql, ilike, or } from "drizzle-orm";
import { encryptValue, decryptValue } from "./lib/encryption";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUser(userId: string): Promise<Workspace[]>;
  getWorkspacesByTenant(tenantId: string): Promise<Workspace[]>;
  getPrimaryWorkspaceId(tenantId: string): Promise<string | null>;
  getPrimaryWorkspaceIdOrFail(tenantId: string, requestId?: string): Promise<string>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  
  getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user?: User })[]>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  updateWorkspace(id: string, workspace: Partial<InsertWorkspace>): Promise<Workspace | undefined>;
  
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByWorkspace(workspaceId: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  getTeamMembers(teamId: string): Promise<(TeamMember & { user?: User })[]>;
  addTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<void>;
  removeTeamMember(teamId: string, userId: string): Promise<void>;
  
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByWorkspace(workspaceId: string): Promise<Project[]>;
  getUnassignedProjects(workspaceId: string, searchQuery?: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined>;
  
  getProjectMembers(projectId: string): Promise<(ProjectMember & { user?: User })[]>;
  addProjectMember(member: InsertProjectMember): Promise<ProjectMember>;
  removeProjectMember(projectId: string, userId: string): Promise<void>;
  setProjectMembers(projectId: string, userIds: string[]): Promise<void>;
  isProjectMember(projectId: string, userId: string): Promise<boolean>;
  getProjectsForUser(userId: string, tenantId: string, workspaceId?: string, isAdmin?: boolean): Promise<Project[]>;
  hideProject(projectId: string, userId: string): Promise<void>;
  unhideProject(projectId: string, userId: string): Promise<void>;
  isProjectHidden(projectId: string, userId: string): Promise<boolean>;
  getHiddenProjectsForUser(userId: string, tenantId: string): Promise<Project[]>;
  
  getSection(id: string): Promise<Section | undefined>;
  getSectionsByProject(projectId: string): Promise<Section[]>;
  getSectionsWithTasks(projectId: string): Promise<SectionWithTasks[]>;
  createSection(section: InsertSection): Promise<Section>;
  updateSection(id: string, section: Partial<InsertSection>): Promise<Section | undefined>;
  deleteSection(id: string): Promise<void>;
  
  getTask(id: string): Promise<Task | undefined>;
  getTaskWithRelations(id: string): Promise<TaskWithRelations | undefined>;
  getTasksByProject(projectId: string): Promise<TaskWithRelations[]>;
  getTasksByUser(userId: string): Promise<TaskWithRelations[]>;
  getCalendarTasksByTenant(tenantId: string, workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]>;
  getCalendarTasksByWorkspace(workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]>;
  getChildTasks(parentTaskId: string): Promise<TaskWithRelations[]>;
  createTask(task: InsertTask): Promise<Task>;
  createChildTask(parentTaskId: string, task: InsertTask): Promise<Task>;
  updateTask(id: string, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<void>;
  moveTask(id: string, sectionId: string, targetIndex: number): Promise<void>;
  reorderChildTasks(parentTaskId: string, taskId: string, toIndex: number): Promise<void>;
  
  getTaskAssignees(taskId: string): Promise<(TaskAssignee & { user?: User })[]>;
  addTaskAssignee(assignee: InsertTaskAssignee): Promise<TaskAssignee>;
  removeTaskAssignee(taskId: string, userId: string): Promise<void>;
  
  getTaskWatchers(taskId: string): Promise<(TaskWatcher & { user?: User })[]>;
  addTaskWatcher(watcher: InsertTaskWatcher): Promise<TaskWatcher>;
  removeTaskWatcher(taskId: string, userId: string): Promise<void>;
  
  getSubtask(id: string): Promise<Subtask | undefined>;
  getSubtasksByTask(taskId: string): Promise<Subtask[]>;
  createSubtask(subtask: InsertSubtask): Promise<Subtask>;
  updateSubtask(id: string, subtask: Partial<InsertSubtask>): Promise<Subtask | undefined>;
  deleteSubtask(id: string): Promise<void>;
  moveSubtask(id: string, targetIndex: number): Promise<void>;
  
  getTag(id: string): Promise<Tag | undefined>;
  getTagsByWorkspace(workspaceId: string): Promise<Tag[]>;
  createTag(tag: InsertTag): Promise<Tag>;
  updateTag(id: string, tag: Partial<InsertTag>): Promise<Tag | undefined>;
  deleteTag(id: string): Promise<void>;
  
  getTaskTags(taskId: string): Promise<(TaskTag & { tag?: Tag })[]>;
  addTaskTag(taskTag: InsertTaskTag): Promise<TaskTag>;
  removeTaskTag(taskId: string, tagId: string): Promise<void>;
  
  getSubtaskAssignees(subtaskId: string): Promise<(SubtaskAssignee & { user?: User })[]>;
  addSubtaskAssignee(assignee: InsertSubtaskAssignee): Promise<SubtaskAssignee>;
  removeSubtaskAssignee(subtaskId: string, userId: string): Promise<void>;
  
  getSubtaskTags(subtaskId: string): Promise<(SubtaskTag & { tag?: Tag })[]>;
  addSubtaskTag(subtaskTag: InsertSubtaskTag): Promise<SubtaskTag>;
  removeSubtaskTag(subtaskId: string, tagId: string): Promise<void>;
  
  getSubtaskWithRelations(id: string): Promise<(Subtask & { assignees: (SubtaskAssignee & { user?: User })[]; tags: (SubtaskTag & { tag?: Tag })[] }) | undefined>;
  
  getComment(id: string): Promise<Comment | undefined>;
  getCommentsByTask(taskId: string): Promise<(Comment & { user?: User })[]>;
  getCommentsBySubtask(subtaskId: string): Promise<(Comment & { user?: User })[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: string, comment: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(id: string): Promise<void>;
  
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogByEntity(entityType: string, entityId: string): Promise<ActivityLog[]>;
  getProjectActivity(projectId: string, tenantId: string | null, limit?: number): Promise<ProjectActivityItem[]>;
  
  getTaskAttachment(id: string): Promise<TaskAttachment | undefined>;
  getTaskAttachmentsByTask(taskId: string): Promise<TaskAttachmentWithUser[]>;
  createTaskAttachment(attachment: InsertTaskAttachment): Promise<TaskAttachment>;
  updateTaskAttachment(id: string, attachment: Partial<InsertTaskAttachment>): Promise<TaskAttachment | undefined>;
  deleteTaskAttachment(id: string): Promise<void>;
  
  // Client (CRM) methods
  getClient(id: string): Promise<Client | undefined>;
  getClientWithContacts(id: string): Promise<ClientWithContacts | undefined>;
  getClientsByWorkspace(workspaceId: string): Promise<ClientWithContacts[]>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: string): Promise<void>;
  
  // Client Contact methods
  getClientContact(id: string): Promise<ClientContact | undefined>;
  getContactsByClient(clientId: string): Promise<ClientContact[]>;
  createClientContact(contact: InsertClientContact): Promise<ClientContact>;
  updateClientContact(id: string, contact: Partial<InsertClientContact>): Promise<ClientContact | undefined>;
  deleteClientContact(id: string): Promise<void>;
  
  // Client Invite methods (placeholder for future auth)
  getClientInvite(id: string): Promise<ClientInvite | undefined>;
  getInvitesByClient(clientId: string): Promise<ClientInvite[]>;
  createClientInvite(invite: InsertClientInvite): Promise<ClientInvite>;
  updateClientInvite(id: string, invite: Partial<InsertClientInvite>): Promise<ClientInvite | undefined>;
  deleteClientInvite(id: string): Promise<void>;
  
  // Projects by client
  getProjectsByClient(clientId: string): Promise<Project[]>;
  
  // Client User Access
  addClientUserAccess(access: InsertClientUserAccess): Promise<ClientUserAccess>;
  getClientUsers(clientId: string): Promise<Array<{ user: User; access: ClientUserAccess }>>;
  getClientUserAccessByUserAndClient(userId: string, clientId: string): Promise<ClientUserAccess | undefined>;
  updateClientUserAccess(clientId: string, userId: string, updates: Partial<InsertClientUserAccess>): Promise<ClientUserAccess | undefined>;
  deleteClientUserAccess(clientId: string, userId: string): Promise<void>;
  getClientsForUser(userId: string): Promise<Array<{ client: Client; access: ClientUserAccess }>>;
  
  // Time Tracking - Time Entries
  getTimeEntry(id: string): Promise<TimeEntry | undefined>;
  getTimeEntriesByWorkspace(workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]>;
  getTimeEntriesByUser(userId: string, workspaceId: string): Promise<TimeEntryWithRelations[]>;
  createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry>;
  updateTimeEntry(id: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined>;
  deleteTimeEntry(id: string): Promise<void>;
  
  // Time Tracking - Active Timers
  getActiveTimer(id: string): Promise<ActiveTimer | undefined>;
  getActiveTimerByUser(userId: string): Promise<ActiveTimerWithRelations | undefined>;
  createActiveTimer(timer: InsertActiveTimer): Promise<ActiveTimer>;
  updateActiveTimer(id: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined>;
  deleteActiveTimer(id: string): Promise<void>;

  // Tenant management (Super Admin)
  getAllTenants(): Promise<Tenant[]>;
  getTenant(id: string): Promise<Tenant | undefined>;
  getTenantBySlug(slug: string): Promise<Tenant | undefined>;
  createTenant(tenant: InsertTenant): Promise<Tenant>;
  updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined>;

  // Tenant-scoped methods (Phase 2A)
  getClientByIdAndTenant(id: string, tenantId: string): Promise<Client | undefined>;
  getClientsByTenant(tenantId: string, workspaceId?: string): Promise<ClientWithContacts[]>;
  getClientsByTenantWithHierarchy(tenantId: string): Promise<(Client & { depth: number; parentName?: string; contactCount: number; projectCount: number })[]>;
  getChildClients(parentClientId: string): Promise<Client[]>;
  validateParentClient(parentClientId: string, tenantId: string): Promise<boolean>;
  createClientWithTenant(client: InsertClient, tenantId: string): Promise<Client>;
  updateClientWithTenant(id: string, tenantId: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClientWithTenant(id: string, tenantId: string): Promise<boolean>;

  getProjectByIdAndTenant(id: string, tenantId: string): Promise<Project | undefined>;
  getProjectsByTenant(tenantId: string, workspaceId?: string): Promise<Project[]>;
  createProjectWithTenant(project: InsertProject, tenantId: string): Promise<Project>;
  updateProjectWithTenant(id: string, tenantId: string, project: Partial<InsertProject>): Promise<Project | undefined>;

  getTeamByIdAndTenant(id: string, tenantId: string): Promise<Team | undefined>;
  getTeamsByTenant(tenantId: string, workspaceId: string): Promise<Team[]>;
  createTeamWithTenant(team: InsertTeam, tenantId: string): Promise<Team>;
  updateTeamWithTenant(id: string, tenantId: string, team: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeamWithTenant(id: string, tenantId: string): Promise<boolean>;

  getTaskByIdAndTenant(id: string, tenantId: string): Promise<Task | undefined>;
  createTaskWithTenant(task: InsertTask, tenantId: string): Promise<Task>;
  updateTaskWithTenant(id: string, tenantId: string, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTaskWithTenant(id: string, tenantId: string): Promise<boolean>;

  getUserByIdAndTenant(id: string, tenantId: string): Promise<User | undefined>;
  getUserByEmailAndTenant(email: string, tenantId: string): Promise<User | undefined>;
  getUsersByTenant(tenantId: string): Promise<User[]>;
  createUserWithTenant(user: InsertUser & { tenantId: string }): Promise<User>;
  updateUserWithTenant(id: string, tenantId: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  setUserPasswordWithTenant(id: string, tenantId: string, passwordHash: string): Promise<User | undefined>;
  setUserActiveWithTenant(id: string, tenantId: string, isActive: boolean): Promise<User | undefined>;
  getInvitationsByTenant(tenantId: string): Promise<Invitation[]>;
  updateInvitation(id: string, updates: Partial<InsertInvitation>): Promise<Invitation | undefined>;
  revokeInvitation(id: string): Promise<Invitation | undefined>;

  getAppSettingsByTenant(tenantId: string, workspaceId: string, key: string): Promise<any>;
  setAppSettingsByTenant(tenantId: string, workspaceId: string, key: string, value: any, userId?: string): Promise<void>;

  // Phase 2B: Tenant-scoped Time Tracking methods
  getTimeEntryByIdAndTenant(id: string, tenantId: string): Promise<TimeEntry | undefined>;
  getTimeEntriesByTenant(tenantId: string, workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]>;
  createTimeEntryWithTenant(entry: InsertTimeEntry, tenantId: string): Promise<TimeEntry>;
  updateTimeEntryWithTenant(id: string, tenantId: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined>;
  deleteTimeEntryWithTenant(id: string, tenantId: string): Promise<boolean>;

  getActiveTimerByIdAndTenant(id: string, tenantId: string): Promise<ActiveTimer | undefined>;
  getActiveTimerByUserAndTenant(userId: string, tenantId: string): Promise<ActiveTimerWithRelations | undefined>;
  createActiveTimerWithTenant(timer: InsertActiveTimer, tenantId: string): Promise<ActiveTimer>;
  updateActiveTimerWithTenant(id: string, tenantId: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined>;
  deleteActiveTimerWithTenant(id: string, tenantId: string): Promise<boolean>;

  // Phase 2B: Tenant-scoped Task Attachments
  getTaskAttachmentByIdAndTenant(id: string, tenantId: string): Promise<TaskAttachment | undefined>;
  getTaskAttachmentsByTaskAndTenant(taskId: string, tenantId: string): Promise<TaskAttachmentWithUser[]>;

  // Phase 3A: Tenant Settings
  getTenantSettings(tenantId: string): Promise<TenantSettings | undefined>;
  createTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings>;
  updateTenantSettings(tenantId: string, settings: Partial<InsertTenantSettings>): Promise<TenantSettings | undefined>;

  // Phase 3A: Tenant Admin Invitations (extend existing)
  createTenantAdminInvitation(data: {
    tenantId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: "admin" | "employee";
    expiresInDays?: number;
    createdByUserId: string;
    workspaceId: string;
  }): Promise<{ invitation: Invitation; token: string }>;

  // User invite management for Super Admin
  getInvitationById(invitationId: string): Promise<Invitation | undefined>;
  getLatestInvitationByUserEmail(email: string, tenantId: string): Promise<Invitation | undefined>;
  regenerateInvitation(invitationId: string, createdByUserId: string): Promise<{ invitation: Invitation; token: string }>;
  setUserMustChangePassword(userId: string, tenantId: string, mustChange: boolean): Promise<User | undefined>;
  setUserPasswordWithMustChange(userId: string, tenantId: string, passwordHash: string, mustChange: boolean): Promise<User | undefined>;

  // Personal Task Sections (My Tasks organization)
  getPersonalTaskSection(id: string): Promise<PersonalTaskSection | undefined>;
  getPersonalTaskSections(userId: string): Promise<PersonalTaskSection[]>;
  createPersonalTaskSection(section: InsertPersonalTaskSection): Promise<PersonalTaskSection>;
  updatePersonalTaskSection(id: string, section: Partial<InsertPersonalTaskSection>): Promise<PersonalTaskSection | undefined>;
  deletePersonalTaskSection(id: string): Promise<void>;
  clearPersonalSectionFromTasks(sectionId: string): Promise<void>;

  // Client Divisions - CRUD operations
  getClientDivision(id: string): Promise<ClientDivision | undefined>;
  getClientDivisionsByClient(clientId: string, tenantId: string): Promise<ClientDivision[]>;
  getClientDivisionsByTenant(tenantId: string): Promise<ClientDivision[]>;
  createClientDivision(division: InsertClientDivision): Promise<ClientDivision>;
  updateClientDivision(id: string, tenantId: string, division: Partial<InsertClientDivision>): Promise<ClientDivision | undefined>;
  deleteClientDivision(id: string, tenantId: string): Promise<boolean>;
  
  // Division Members - CRUD operations
  getDivisionMembers(divisionId: string): Promise<(DivisionMember & { user?: User })[]>;
  addDivisionMember(member: InsertDivisionMember): Promise<DivisionMember>;
  removeDivisionMember(divisionId: string, userId: string): Promise<void>;
  setDivisionMembers(divisionId: string, tenantId: string, userIds: string[]): Promise<void>;
  isDivisionMember(divisionId: string, userId: string): Promise<boolean>;
  getUserDivisions(userId: string, tenantId: string): Promise<ClientDivision[]>;
  
  // Division Scoping Helpers (no route changes)
  getEffectiveDivisionScope(userId: string, tenantId: string): Promise<string[] | "ALL">;
  validateDivisionBelongsToClientTenant(divisionId: string, clientId: string, tenantId: string): Promise<boolean>;
  validateUserBelongsToTenant(userId: string, tenantId: string): Promise<boolean>;

  // Chat - Channels
  getChatChannel(id: string): Promise<ChatChannel | undefined>;
  getChatChannelsByTenant(tenantId: string): Promise<ChatChannel[]>;
  createChatChannel(channel: InsertChatChannel): Promise<ChatChannel>;
  updateChatChannel(id: string, channel: Partial<InsertChatChannel>): Promise<ChatChannel | undefined>;
  deleteChatChannel(id: string): Promise<void>;

  // Chat - Channel Members
  getChatChannelMember(channelId: string, userId: string): Promise<ChatChannelMember | undefined>;
  getChatChannelMembers(channelId: string): Promise<(ChatChannelMember & { user: User })[]>;
  getUserChatChannels(tenantId: string, userId: string): Promise<(ChatChannelMember & { channel: ChatChannel })[]>;
  addChatChannelMember(member: InsertChatChannelMember): Promise<ChatChannelMember>;
  removeChatChannelMember(channelId: string, userId: string): Promise<void>;
  
  // Chat - Access Validation
  validateChatRoomAccess(targetType: 'channel' | 'dm', targetId: string, userId: string, tenantId: string): Promise<boolean>;

  // Chat - DM Threads
  getChatDmThread(id: string): Promise<ChatDmThread | undefined>;
  getChatDmThreadByMembers(tenantId: string, userIds: string[]): Promise<ChatDmThread | undefined>;
  getUserChatDmThreads(tenantId: string, userId: string): Promise<(ChatDmThread & { members: (ChatDmMember & { user: User })[] })[]>;
  getChatDmParticipants(dmThreadId: string): Promise<ChatDmMember[]>;
  createChatDmThread(thread: InsertChatDmThread, memberUserIds: string[]): Promise<ChatDmThread>;

  // Chat - Messages
  getChatMessage(id: string): Promise<ChatMessage | undefined>;
  getChatMessages(targetType: 'channel' | 'dm', targetId: string, limit?: number, before?: Date): Promise<(ChatMessage & { author: User; attachments?: ChatAttachment[] })[]>;
  createChatMessage(message: InsertChatMessage): Promise<ChatMessage>;
  updateChatMessage(id: string, updates: Partial<InsertChatMessage>): Promise<ChatMessage | undefined>;
  deleteChatMessage(id: string): Promise<void>;
  searchChatMessages(tenantId: string, userId: string, options: {
    query: string;
    channelId?: string;
    dmThreadId?: string;
    fromUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: any[]; total: number }>;

  // Chat - Attachments
  createChatAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment>;
  getChatAttachmentsByMessageId(messageId: string): Promise<ChatAttachment[]>;
  getChatAttachment(id: string): Promise<ChatAttachment | undefined>;
  getChatAttachmentsByTenantAndIds(tenantId: string, ids: string[]): Promise<ChatAttachment[]>;
  linkChatAttachmentsToMessage(messageId: string, attachmentIds: string[]): Promise<void>;

  // Chat - Read Tracking
  upsertChatRead(tenantId: string, userId: string, targetType: "channel" | "dm", targetId: string, lastReadMessageId: string): Promise<{ lastReadAt: Date }>;
  getChatReadForChannel(userId: string, channelId: string): Promise<{ lastReadMessageId: string | null } | undefined>;
  getChatReadForDm(userId: string, dmThreadId: string): Promise<{ lastReadMessageId: string | null } | undefined>;
  getUnreadCountForChannel(userId: string, channelId: string): Promise<number>;
  getUnreadCountForDm(userId: string, dmThreadId: string): Promise<number>;

  // Chat - Diagnostics (Super Admin)
  getChatDiagnostics(): Promise<{
    nullTenantCounts: {
      channels: number;
      channelMembers: number;
      dmThreads: number;
      dmMembers: number;
      messages: number;
      attachments: number;
    };
    orphanedChannels: number;
    underMemberedDmThreads: number;
  }>;

  // Error Logs - Super Admin Monitoring
  createErrorLog(log: InsertErrorLog): Promise<ErrorLog>;
  getErrorLogs(filters?: {
    tenantId?: string;
    status?: number;
    startDate?: Date;
    endDate?: Date;
    pathContains?: string;
    requestId?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: ErrorLog[]; total: number }>;
  getErrorLog(id: string): Promise<ErrorLog | undefined>;
  markErrorLogResolved(id: string, resolved: boolean): Promise<ErrorLog | undefined>;

  // Notifications
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string, tenantId: string | null, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string, tenantId: string | null): Promise<number>;
  markNotificationRead(id: string, userId: string, tenantId: string | null): Promise<Notification | undefined>;
  markAllNotificationsRead(userId: string, tenantId: string | null): Promise<void>;
  deleteNotification(id: string, userId: string, tenantId: string | null): Promise<void>;

  // Notification Preferences
  getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined>;
  upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences>;

  // Session management
  invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getWorkspace(id: string): Promise<Workspace | undefined> {
    const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id));
    return workspace || undefined;
  }

  async getWorkspacesByUser(userId: string): Promise<Workspace[]> {
    const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, userId));
    if (members.length === 0) return [];
    const workspaceIds = members.map(m => m.workspaceId);
    return db.select().from(workspaces).where(inArray(workspaces.id, workspaceIds));
  }

  async getWorkspacesByTenant(tenantId: string): Promise<Workspace[]> {
    return db.select().from(workspaces).where(eq(workspaces.tenantId, tenantId)).orderBy(asc(workspaces.createdAt));
  }

  async getPrimaryWorkspaceId(tenantId: string): Promise<string | null> {
    const [primaryWorkspace] = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);
    
    if (primaryWorkspace) {
      return primaryWorkspace.id;
    }
    
    // Fallback to first workspace if no primary exists
    const tenantWorkspaces = await this.getWorkspacesByTenant(tenantId);
    return tenantWorkspaces.length > 0 ? tenantWorkspaces[0].id : null;
  }
  
  async getPrimaryWorkspaceIdOrFail(tenantId: string, requestId?: string): Promise<string> {
    const [primaryWorkspace] = await db.select()
      .from(workspaces)
      .where(and(eq(workspaces.tenantId, tenantId), eq(workspaces.isPrimary, true)))
      .limit(1);
    
    if (primaryWorkspace) {
      return primaryWorkspace.id;
    }
    
    // Log error with requestId for debugging
    const reqIdInfo = requestId ? ` (requestId: ${requestId})` : '';
    console.error(`[getPrimaryWorkspaceIdOrFail] No primary workspace found for tenant ${tenantId}${reqIdInfo}`);
    throw new Error(`No primary workspace found for tenant ${tenantId}`);
  }

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
    assertInsertHasTenantId(insertWorkspace, "workspaces");
    const [workspace] = await db.insert(workspaces).values(insertWorkspace).returning();
    return workspace;
  }

  async getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user?: User })[]> {
    const members = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId));
    const result = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      result.push({ ...member, user });
    }
    return result;
  }

  async addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember> {
    const [result] = await db.insert(workspaceMembers).values(member).returning();
    return result;
  }

  async updateWorkspace(id: string, workspace: Partial<InsertWorkspace>): Promise<Workspace | undefined> {
    const [updated] = await db.update(workspaces).set({ ...workspace, updatedAt: new Date() }).where(eq(workspaces.id, id)).returning();
    return updated || undefined;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    return team || undefined;
  }

  async getTeamsByWorkspace(workspaceId: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.workspaceId, workspaceId));
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    assertInsertHasTenantId(insertTeam, "teams");
    const [team] = await db.insert(teams).values(insertTeam).returning();
    return team;
  }

  async getTeamMembers(teamId: string): Promise<(TeamMember & { user?: User })[]> {
    const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
    const result = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      result.push({ ...member, user });
    }
    return result;
  }

  async addTeamMember(member: InsertTeamMember): Promise<TeamMember> {
    const [result] = await db.insert(teamMembers).values(member).returning();
    return result;
  }

  async updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team | undefined> {
    const [updated] = await db.update(teams).set(team).where(eq(teams.id, id)).returning();
    return updated || undefined;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await db.delete(teamMembers).where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
    );
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(desc(projects.createdAt));
  }

  async getUnassignedProjects(workspaceId: string, searchQuery?: string): Promise<Project[]> {
    const conditions = [
      eq(projects.workspaceId, workspaceId),
      sql`${projects.clientId} IS NULL`
    ];
    
    if (searchQuery && searchQuery.trim()) {
      conditions.push(sql`LOWER(${projects.name}) LIKE LOWER(${'%' + searchQuery.trim() + '%'})`);
    }
    
    return db.select().from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects).set({ ...project, updatedAt: new Date() }).where(eq(projects.id, id)).returning();
    return updated || undefined;
  }

  async getProjectMembers(projectId: string): Promise<(ProjectMember & { user?: User })[]> {
    const members = await db.select().from(projectMembers).where(eq(projectMembers.projectId, projectId));
    const result = [];
    for (const member of members) {
      const user = await this.getUser(member.userId);
      result.push({ ...member, user });
    }
    return result;
  }

  async addProjectMember(member: InsertProjectMember): Promise<ProjectMember> {
    const [result] = await db.insert(projectMembers).values(member).returning();
    return result;
  }

  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    await db.delete(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
  }

  async setProjectMembers(projectId: string, userIds: string[]): Promise<void> {
    const existingMembers = await db.select()
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    
    const existingUserIds = new Set(existingMembers.map(m => m.userId));
    const newUserIds = new Set(userIds);
    
    const toAdd = userIds.filter(id => !existingUserIds.has(id));
    const toRemove = existingMembers.filter(m => !newUserIds.has(m.userId)).map(m => m.userId);
    
    for (const userId of toRemove) {
      await this.removeProjectMember(projectId, userId);
    }
    
    for (const userId of toAdd) {
      await db.insert(projectMembers)
        .values({ projectId, userId, role: "member" })
        .onConflictDoNothing();
    }
  }

  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    const [member] = await db.select()
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    return !!member;
  }

  async getProjectsForUser(userId: string, tenantId: string, _workspaceId?: string, _isAdmin?: boolean): Promise<Project[]> {
    // All active projects in a tenant are visible to all tenant members by default
    // Users can hide projects they don't want to see
    
    // Get the list of project IDs the user has hidden
    const hidden = await db.select({ projectId: hiddenProjects.projectId })
      .from(hiddenProjects)
      .where(eq(hiddenProjects.userId, userId));
    
    const hiddenProjectIds = hidden.map(h => h.projectId);
    
    // Return all tenant projects except hidden ones
    if (hiddenProjectIds.length > 0) {
      return db.select().from(projects)
        .where(and(
          eq(projects.tenantId, tenantId),
          notInArray(projects.id, hiddenProjectIds)
        ))
        .orderBy(desc(projects.createdAt));
    }
    
    // No hidden projects, return all tenant projects
    return db.select().from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.createdAt));
  }
  
  async hideProject(projectId: string, userId: string): Promise<void> {
    await db.insert(hiddenProjects)
      .values({ projectId, userId })
      .onConflictDoNothing();
  }
  
  async unhideProject(projectId: string, userId: string): Promise<void> {
    await db.delete(hiddenProjects)
      .where(and(
        eq(hiddenProjects.projectId, projectId),
        eq(hiddenProjects.userId, userId)
      ));
  }
  
  async isProjectHidden(projectId: string, userId: string): Promise<boolean> {
    const [hidden] = await db.select()
      .from(hiddenProjects)
      .where(and(
        eq(hiddenProjects.projectId, projectId),
        eq(hiddenProjects.userId, userId)
      ));
    return !!hidden;
  }
  
  async getHiddenProjectsForUser(userId: string, tenantId: string): Promise<Project[]> {
    const hidden = await db.select({ project: projects })
      .from(hiddenProjects)
      .innerJoin(projects, eq(hiddenProjects.projectId, projects.id))
      .where(and(
        eq(hiddenProjects.userId, userId),
        eq(projects.tenantId, tenantId)
      ))
      .orderBy(desc(projects.createdAt));
    
    return hidden.map(h => h.project);
  }

  async getSection(id: string): Promise<Section | undefined> {
    const [section] = await db.select().from(sections).where(eq(sections.id, id));
    return section || undefined;
  }

  async getSectionsByProject(projectId: string): Promise<Section[]> {
    return db.select().from(sections).where(eq(sections.projectId, projectId)).orderBy(asc(sections.orderIndex));
  }

  async getSectionsWithTasks(projectId: string): Promise<SectionWithTasks[]> {
    const sectionsList = await this.getSectionsByProject(projectId);
    const result: SectionWithTasks[] = [];
    
    for (const section of sectionsList) {
      const sectionTasks = await db.select().from(tasks)
        .where(and(
          eq(tasks.sectionId, section.id),
          sql`${tasks.parentTaskId} IS NULL`,
          eq(tasks.isPersonal, false)
        ))
        .orderBy(asc(tasks.orderIndex));
      
      const tasksWithRelations: TaskWithRelations[] = [];
      for (const task of sectionTasks) {
        const taskWithRelations = await this.getTaskWithRelations(task.id);
        if (taskWithRelations) {
          tasksWithRelations.push(taskWithRelations);
        }
      }
      
      result.push({ ...section, tasks: tasksWithRelations });
    }
    
    return result;
  }

  async createSection(insertSection: InsertSection): Promise<Section> {
    const existingSections = await this.getSectionsByProject(insertSection.projectId);
    const orderIndex = insertSection.orderIndex ?? existingSections.length;
    const [section] = await db.insert(sections).values({ ...insertSection, orderIndex }).returning();
    return section;
  }

  async updateSection(id: string, section: Partial<InsertSection>): Promise<Section | undefined> {
    const [updated] = await db.update(sections).set(section).where(eq(sections.id, id)).returning();
    return updated || undefined;
  }

  async deleteSection(id: string): Promise<void> {
    await db.delete(tasks).where(eq(tasks.sectionId, id));
    await db.delete(sections).where(eq(sections.id, id));
  }

  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task || undefined;
  }

  async getTaskWithRelations(id: string): Promise<TaskWithRelations | undefined> {
    const task = await this.getTask(id);
    if (!task) return undefined;

    const assignees = await this.getTaskAssignees(id);
    const watchers = await this.getTaskWatchers(id);
    const taskTagsList = await this.getTaskTags(id);
    const subtasksList = await this.getSubtasksByTask(id);
    const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
    const project = task.projectId ? await this.getProject(task.projectId) : undefined;
    
    const childTasksList = await this.getChildTasks(id);

    return {
      ...task,
      assignees,
      watchers,
      tags: taskTagsList,
      subtasks: subtasksList,
      childTasks: childTasksList,
      section,
      project,
    };
  }
  
  async getChildTasks(parentTaskId: string): Promise<TaskWithRelations[]> {
    const childTasksList = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId))
      .orderBy(asc(tasks.orderIndex));
    
    const result: TaskWithRelations[] = [];
    for (const task of childTasksList) {
      const assignees = await this.getTaskAssignees(task.id);
      const watchers = await this.getTaskWatchers(task.id);
      const taskTagsList = await this.getTaskTags(task.id);
      const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
      const project = task.projectId ? await this.getProject(task.projectId) : undefined;
      
      result.push({
        ...task,
        assignees,
        watchers,
        tags: taskTagsList,
        subtasks: [],
        childTasks: [],
        section,
        project,
      });
    }
    return result;
  }

  async getTasksByProject(projectId: string): Promise<TaskWithRelations[]> {
    const tasksList = await db.select().from(tasks)
      .where(and(
        eq(tasks.projectId, projectId),
        eq(tasks.isPersonal, false)
      ))
      .orderBy(asc(tasks.orderIndex));
    
    const result: TaskWithRelations[] = [];
    for (const task of tasksList) {
      const taskWithRelations = await this.getTaskWithRelations(task.id);
      if (taskWithRelations) {
        result.push(taskWithRelations);
      }
    }
    return result;
  }

  // Get tasks with due dates before the specified date (for deadline notifications)
  async getTasksDueSoon(beforeDate: Date): Promise<Task[]> {
    const now = new Date();
    const tasksList = await db.select().from(tasks)
      .where(and(
        gte(tasks.dueDate, now),
        lte(tasks.dueDate, beforeDate),
        sql`${tasks.status} != 'completed'`,
        eq(tasks.isPersonal, false)
      ))
      .orderBy(asc(tasks.dueDate));
    
    return tasksList;
  }

  async getTasksByUser(userId: string): Promise<TaskWithRelations[]> {
    const assigneeRecords = await db.select().from(taskAssignees).where(eq(taskAssignees.userId, userId));
    const assignedTaskIds = new Set(assigneeRecords.map(a => a.taskId));
    
    const personalTasks = await db.select().from(tasks).where(
      and(
        eq(tasks.isPersonal, true),
        eq(tasks.createdBy, userId)
      )
    );
    const personalTaskIds = personalTasks.map(t => t.id);
    
    const allTaskIds = [...new Set([...Array.from(assignedTaskIds), ...personalTaskIds])];
    if (allTaskIds.length === 0) return [];

    const result: TaskWithRelations[] = [];
    for (const taskId of allTaskIds) {
      const taskWithRelations = await this.getTaskWithRelations(taskId);
      if (taskWithRelations) {
        result.push(taskWithRelations);
      }
    }
    return result.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
  }

  async getCalendarTasksByTenant(tenantId: string, workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]> {
    // Optimized: Single query to get tasks with due dates in range
    const tasksList = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    }).from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.tenantId, tenantId),
        eq(projects.workspaceId, workspaceId),
        eq(tasks.isPersonal, false),
        gte(tasks.dueDate, startDate),
        lte(tasks.dueDate, endDate)
      ))
      .orderBy(asc(tasks.dueDate));
    
    if (tasksList.length === 0) return [];
    
    // Batch fetch assignees for all tasks in one query using inArray
    const taskIds = tasksList.map(t => t.id);
    const allAssignees = await db.select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      userName: users.name,
      userEmail: users.email,
    }).from(taskAssignees)
      .leftJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
    
    // Group assignees by task
    const assigneesByTask = new Map<string, CalendarTask["assignees"]>();
    for (const a of allAssignees) {
      if (!assigneesByTask.has(a.taskId)) {
        assigneesByTask.set(a.taskId, []);
      }
      assigneesByTask.get(a.taskId)!.push({
        userId: a.userId,
        user: a.userName ? { id: a.userId, name: a.userName, email: a.userEmail || "" } : undefined
      });
    }
    
    // Return lightweight CalendarTask DTOs
    return tasksList.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      assignees: assigneesByTask.get(task.id) || [],
    }));
  }

  async getCalendarTasksByWorkspace(workspaceId: string, startDate: Date, endDate: Date): Promise<CalendarTask[]> {
    // Optimized: Single query to get tasks with due dates in range
    const tasksList = await db.select({
      id: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectId: tasks.projectId,
    }).from(tasks)
      .innerJoin(projects, eq(tasks.projectId, projects.id))
      .where(and(
        eq(projects.workspaceId, workspaceId),
        eq(tasks.isPersonal, false),
        gte(tasks.dueDate, startDate),
        lte(tasks.dueDate, endDate)
      ))
      .orderBy(asc(tasks.dueDate));
    
    if (tasksList.length === 0) return [];
    
    // Batch fetch assignees for all tasks in one query using inArray
    const taskIds = tasksList.map(t => t.id);
    const allAssignees = await db.select({
      taskId: taskAssignees.taskId,
      userId: taskAssignees.userId,
      userName: users.name,
      userEmail: users.email,
    }).from(taskAssignees)
      .leftJoin(users, eq(taskAssignees.userId, users.id))
      .where(inArray(taskAssignees.taskId, taskIds));
    
    // Group assignees by task
    const assigneesByTask = new Map<string, CalendarTask["assignees"]>();
    for (const a of allAssignees) {
      if (!assigneesByTask.has(a.taskId)) {
        assigneesByTask.set(a.taskId, []);
      }
      assigneesByTask.get(a.taskId)!.push({
        userId: a.userId,
        user: a.userName ? { id: a.userId, name: a.userName, email: a.userEmail || "" } : undefined
      });
    }
    
    // Return lightweight CalendarTask DTOs
    return tasksList.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      assignees: assigneesByTask.get(task.id) || [],
    }));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const existingTasks = insertTask.sectionId 
      ? await db.select().from(tasks).where(and(
          eq(tasks.sectionId, insertTask.sectionId),
          sql`${tasks.parentTaskId} IS NULL`
        ))
      : insertTask.projectId 
        ? await db.select().from(tasks).where(and(
            eq(tasks.projectId, insertTask.projectId),
            sql`${tasks.parentTaskId} IS NULL`
          ))
        : [];
    const orderIndex = insertTask.orderIndex ?? existingTasks.length;
    const [task] = await db.insert(tasks).values({ ...insertTask, orderIndex }).returning();
    return task;
  }
  
  async createChildTask(parentTaskId: string, insertTask: InsertTask): Promise<Task> {
    const parentTask = await this.getTask(parentTaskId);
    if (!parentTask) {
      throw new Error("Parent task not found");
    }
    if (parentTask.parentTaskId) {
      throw new Error("Cannot create subtask of a subtask (max depth is 2 levels)");
    }
    
    const existingChildren = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId));
    const orderIndex = insertTask.orderIndex ?? existingChildren.length;
    
    const [task] = await db.insert(tasks).values({
      ...insertTask,
      parentTaskId,
      sectionId: parentTask.sectionId,
      projectId: parentTask.projectId,
      orderIndex,
    }).returning();
    return task;
  }

  async updateTask(id: string, task: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks).set({ ...task, updatedAt: new Date() }).where(eq(tasks.id, id)).returning();
    return updated || undefined;
  }

  async deleteTask(id: string): Promise<void> {
    const childTasksList = await db.select().from(tasks).where(eq(tasks.parentTaskId, id));
    for (const childTask of childTasksList) {
      await db.delete(taskAssignees).where(eq(taskAssignees.taskId, childTask.id));
      await db.delete(taskTags).where(eq(taskTags.taskId, childTask.id));
      await db.delete(comments).where(eq(comments.taskId, childTask.id));
    }
    await db.delete(tasks).where(eq(tasks.parentTaskId, id));
    
    await db.delete(subtasks).where(eq(subtasks.taskId, id));
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
    await db.delete(taskTags).where(eq(taskTags.taskId, id));
    await db.delete(comments).where(eq(comments.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  async moveTask(id: string, sectionId: string, targetIndex: number): Promise<void> {
    const task = await this.getTask(id);
    if (!task) return;

    const tasksInSection = await db.select().from(tasks)
      .where(and(
        eq(tasks.sectionId, sectionId),
        sql`${tasks.parentTaskId} IS NULL`
      ))
      .orderBy(asc(tasks.orderIndex));

    const filtered = tasksInSection.filter(t => t.id !== id);
    filtered.splice(targetIndex, 0, { ...task, sectionId });

    for (let i = 0; i < filtered.length; i++) {
      await db.update(tasks)
        .set({ sectionId, orderIndex: i, updatedAt: new Date() })
        .where(eq(tasks.id, filtered[i].id));
    }
    
    await db.update(tasks)
      .set({ sectionId, updatedAt: new Date() })
      .where(eq(tasks.parentTaskId, id));
  }
  
  async reorderChildTasks(parentTaskId: string, taskId: string, toIndex: number): Promise<void> {
    const childTask = await this.getTask(taskId);
    if (!childTask || childTask.parentTaskId !== parentTaskId) return;

    const childTasksList = await db.select().from(tasks)
      .where(eq(tasks.parentTaskId, parentTaskId))
      .orderBy(asc(tasks.orderIndex));

    const filtered = childTasksList.filter(t => t.id !== taskId);
    filtered.splice(toIndex, 0, childTask);

    for (let i = 0; i < filtered.length; i++) {
      await db.update(tasks)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(eq(tasks.id, filtered[i].id));
    }
  }

  async getTaskAssignees(taskId: string): Promise<(TaskAssignee & { user?: User })[]> {
    const assignees = await db.select().from(taskAssignees).where(eq(taskAssignees.taskId, taskId));
    const result = [];
    for (const assignee of assignees) {
      const user = await this.getUser(assignee.userId);
      result.push({ ...assignee, user });
    }
    return result;
  }

  async addTaskAssignee(assignee: InsertTaskAssignee): Promise<TaskAssignee> {
    const [result] = await db.insert(taskAssignees).values(assignee).returning();
    return result;
  }

  async removeTaskAssignee(taskId: string, userId: string): Promise<void> {
    await db.delete(taskAssignees).where(
      and(eq(taskAssignees.taskId, taskId), eq(taskAssignees.userId, userId))
    );
  }

  async getTaskWatchers(taskId: string): Promise<(TaskWatcher & { user?: User })[]> {
    const watchers = await db.select().from(taskWatchers).where(eq(taskWatchers.taskId, taskId));
    const result = [];
    for (const watcher of watchers) {
      const user = await this.getUser(watcher.userId);
      result.push({ ...watcher, user });
    }
    return result;
  }

  async addTaskWatcher(watcher: InsertTaskWatcher): Promise<TaskWatcher> {
    const [result] = await db.insert(taskWatchers).values(watcher).returning();
    return result;
  }

  async removeTaskWatcher(taskId: string, userId: string): Promise<void> {
    await db.delete(taskWatchers).where(
      and(eq(taskWatchers.taskId, taskId), eq(taskWatchers.userId, userId))
    );
  }

  async getSubtask(id: string): Promise<Subtask | undefined> {
    const [subtask] = await db.select().from(subtasks).where(eq(subtasks.id, id));
    return subtask || undefined;
  }

  async getSubtasksByTask(taskId: string): Promise<Subtask[]> {
    return db.select().from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.orderIndex));
  }

  async createSubtask(insertSubtask: InsertSubtask): Promise<Subtask> {
    const existingSubtasks = await this.getSubtasksByTask(insertSubtask.taskId);
    const orderIndex = insertSubtask.orderIndex ?? existingSubtasks.length;
    const [subtask] = await db.insert(subtasks).values({ ...insertSubtask, orderIndex }).returning();
    return subtask;
  }

  async updateSubtask(id: string, subtask: Partial<InsertSubtask>): Promise<Subtask | undefined> {
    const [updated] = await db.update(subtasks).set({ ...subtask, updatedAt: new Date() }).where(eq(subtasks.id, id)).returning();
    return updated || undefined;
  }

  async deleteSubtask(id: string): Promise<void> {
    await db.delete(subtasks).where(eq(subtasks.id, id));
  }

  async moveSubtask(id: string, targetIndex: number): Promise<void> {
    const subtask = await this.getSubtask(id);
    if (!subtask) return;

    const subtasksList = await this.getSubtasksByTask(subtask.taskId);
    const filtered = subtasksList.filter(s => s.id !== id);
    filtered.splice(targetIndex, 0, subtask);

    for (let i = 0; i < filtered.length; i++) {
      await db.update(subtasks)
        .set({ orderIndex: i, updatedAt: new Date() })
        .where(eq(subtasks.id, filtered[i].id));
    }
  }

  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag || undefined;
  }

  async getTagsByWorkspace(workspaceId: string): Promise<Tag[]> {
    return db.select().from(tags).where(eq(tags.workspaceId, workspaceId));
  }

  async createTag(insertTag: InsertTag): Promise<Tag> {
    const [tag] = await db.insert(tags).values(insertTag).returning();
    return tag;
  }

  async updateTag(id: string, tag: Partial<InsertTag>): Promise<Tag | undefined> {
    const [updated] = await db.update(tags).set(tag).where(eq(tags.id, id)).returning();
    return updated || undefined;
  }

  async deleteTag(id: string): Promise<void> {
    await db.delete(taskTags).where(eq(taskTags.tagId, id));
    await db.delete(tags).where(eq(tags.id, id));
  }

  async getTaskTags(taskId: string): Promise<(TaskTag & { tag?: Tag })[]> {
    const taskTagsList = await db.select().from(taskTags).where(eq(taskTags.taskId, taskId));
    const result = [];
    for (const tt of taskTagsList) {
      const tag = await this.getTag(tt.tagId);
      result.push({ ...tt, tag });
    }
    return result;
  }

  async addTaskTag(taskTag: InsertTaskTag): Promise<TaskTag> {
    const [result] = await db.insert(taskTags).values(taskTag).returning();
    return result;
  }

  async removeTaskTag(taskId: string, tagId: string): Promise<void> {
    await db.delete(taskTags).where(
      and(eq(taskTags.taskId, taskId), eq(taskTags.tagId, tagId))
    );
  }

  async getSubtaskAssignees(subtaskId: string): Promise<(SubtaskAssignee & { user?: User })[]> {
    const results = await db.select().from(subtaskAssignees)
      .leftJoin(users, eq(subtaskAssignees.userId, users.id))
      .where(eq(subtaskAssignees.subtaskId, subtaskId));
    return results.map(r => ({
      ...r.subtask_assignees,
      user: r.users || undefined,
    }));
  }

  async addSubtaskAssignee(assignee: InsertSubtaskAssignee): Promise<SubtaskAssignee> {
    const [result] = await db.insert(subtaskAssignees).values(assignee).returning();
    return result;
  }

  async removeSubtaskAssignee(subtaskId: string, userId: string): Promise<void> {
    await db.delete(subtaskAssignees).where(
      and(eq(subtaskAssignees.subtaskId, subtaskId), eq(subtaskAssignees.userId, userId))
    );
  }

  async getSubtaskTags(subtaskId: string): Promise<(SubtaskTag & { tag?: Tag })[]> {
    const results = await db.select().from(subtaskTags)
      .leftJoin(tags, eq(subtaskTags.tagId, tags.id))
      .where(eq(subtaskTags.subtaskId, subtaskId));
    return results.map(r => ({
      ...r.subtask_tags,
      tag: r.tags || undefined,
    }));
  }

  async addSubtaskTag(subtaskTag: InsertSubtaskTag): Promise<SubtaskTag> {
    const [result] = await db.insert(subtaskTags).values(subtaskTag).returning();
    return result;
  }

  async removeSubtaskTag(subtaskId: string, tagId: string): Promise<void> {
    await db.delete(subtaskTags).where(
      and(eq(subtaskTags.subtaskId, subtaskId), eq(subtaskTags.tagId, tagId))
    );
  }

  async getSubtaskWithRelations(id: string): Promise<(Subtask & { assignees: (SubtaskAssignee & { user?: User })[]; tags: (SubtaskTag & { tag?: Tag })[] }) | undefined> {
    const subtask = await this.getSubtask(id);
    if (!subtask) return undefined;
    
    const assignees = await this.getSubtaskAssignees(id);
    const subtaskTagsList = await this.getSubtaskTags(id);
    
    return {
      ...subtask,
      assignees,
      tags: subtaskTagsList,
    };
  }

  async getComment(id: string): Promise<Comment | undefined> {
    const [comment] = await db.select().from(comments).where(eq(comments.id, id));
    return comment || undefined;
  }

  async getCommentsByTask(taskId: string): Promise<(Comment & { user?: User })[]> {
    const commentsList = await db.select().from(comments)
      .where(eq(comments.taskId, taskId))
      .orderBy(asc(comments.createdAt));
    
    const result = [];
    for (const comment of commentsList) {
      const user = await this.getUser(comment.userId);
      result.push({ ...comment, user });
    }
    return result;
  }

  async getCommentsBySubtask(subtaskId: string): Promise<(Comment & { user?: User })[]> {
    const commentsList = await db.select().from(comments)
      .where(eq(comments.subtaskId, subtaskId))
      .orderBy(asc(comments.createdAt));
    
    const result = [];
    for (const comment of commentsList) {
      const user = await this.getUser(comment.userId);
      result.push({ ...comment, user });
    }
    return result;
  }

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }

  async updateComment(id: string, comment: Partial<InsertComment>): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({ ...comment, updatedAt: new Date() }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async deleteComment(id: string): Promise<void> {
    await db.delete(commentMentions).where(eq(commentMentions.commentId, id));
    await db.delete(comments).where(eq(comments.id, id));
  }

  async resolveComment(id: string, resolvedByUserId: string): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({
      isResolved: true,
      resolvedAt: new Date(),
      resolvedByUserId,
      updatedAt: new Date(),
    }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async unresolveComment(id: string): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({
      isResolved: false,
      resolvedAt: null,
      resolvedByUserId: null,
      updatedAt: new Date(),
    }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async createCommentMention(mention: InsertCommentMention): Promise<CommentMention> {
    const [result] = await db.insert(commentMentions).values(mention).returning();
    return result;
  }

  async getCommentMentions(commentId: string): Promise<(CommentMention & { mentionedUser?: User })[]> {
    const mentions = await db.select().from(commentMentions).where(eq(commentMentions.commentId, commentId));
    const result = [];
    for (const mention of mentions) {
      const user = await this.getUser(mention.mentionedUserId);
      result.push({ ...mention, mentionedUser: user });
    }
    return result;
  }

  async deleteCommentMentions(commentId: string): Promise<void> {
    await db.delete(commentMentions).where(eq(commentMentions.commentId, commentId));
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    const [result] = await db.insert(activityLog).values(log).returning();
    return result;
  }

  async getActivityLogByEntity(entityType: string, entityId: string): Promise<ActivityLog[]> {
    return db.select().from(activityLog)
      .where(and(eq(activityLog.entityType, entityType), eq(activityLog.entityId, entityId)))
      .orderBy(desc(activityLog.createdAt));
  }

  async getProjectActivity(projectId: string, tenantId: string | null, limit: number = 50): Promise<ProjectActivityItem[]> {
    const activityItems: ProjectActivityItem[] = [];
    const userIds = new Set<string>();
    const taskCache = new Map<string, { id: string; title: string }>();

    // Build tenant filter conditions
    const taskFilters = tenantId 
      ? and(eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId))
      : eq(tasks.projectId, projectId);

    const timeEntryFilters = tenantId
      ? and(eq(timeEntries.projectId, projectId), eq(timeEntries.tenantId, tenantId))
      : eq(timeEntries.projectId, projectId);

    // 1. Get ALL task IDs in this project (for comment lookup)
    const allProjectTasks = await db.select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(taskFilters);
    
    const allTaskIds = allProjectTasks.map(t => t.id);
    for (const t of allProjectTasks) {
      taskCache.set(t.id, t);
    }

    // 2. Get recently created/updated tasks
    const recentTasks = await db.select().from(tasks)
      .where(taskFilters)
      .orderBy(desc(tasks.createdAt))
      .limit(limit);

    for (const task of recentTasks) {
      if (task.createdBy) userIds.add(task.createdBy);
      activityItems.push({
        id: `task-created-${task.id}`,
        type: "task_created",
        timestamp: task.createdAt,
        actorId: task.createdBy || "system",
        actorName: "",
        actorEmail: "",
        actorAvatarUrl: null,
        entityId: task.id,
        entityTitle: task.title,
      });

      // Add task_updated if updatedAt differs from createdAt by more than 1 minute
      const timeDiff = task.updatedAt.getTime() - task.createdAt.getTime();
      if (timeDiff > 60000) {
        activityItems.push({
          id: `task-updated-${task.id}-${task.updatedAt.getTime()}`,
          type: "task_updated",
          timestamp: task.updatedAt,
          actorId: task.createdBy || "system",
          actorName: "",
          actorEmail: "",
          actorAvatarUrl: null,
          entityId: task.id,
          entityTitle: task.title,
        });
      }
    }

    // 3. Get recent comments on ALL tasks in this project (not just recentTasks)
    if (allTaskIds.length > 0) {
      const recentComments = await db.select().from(comments)
        .where(inArray(comments.taskId, allTaskIds))
        .orderBy(desc(comments.createdAt))
        .limit(limit);

      for (const comment of recentComments) {
        userIds.add(comment.userId);
        const task = taskCache.get(comment.taskId);
        activityItems.push({
          id: `comment-${comment.id}`,
          type: "comment_added",
          timestamp: comment.createdAt,
          actorId: comment.userId,
          actorName: "",
          actorEmail: "",
          actorAvatarUrl: null,
          entityId: comment.taskId,
          entityTitle: task?.title || "Task",
          metadata: { commentBody: comment.body.substring(0, 100) },
        });
      }
    }

    // 4. Get time entries for this project
    const recentTimeEntries = await db.select().from(timeEntries)
      .where(timeEntryFilters)
      .orderBy(desc(timeEntries.startTime))
      .limit(limit);

    for (const entry of recentTimeEntries) {
      userIds.add(entry.userId);
      const task = entry.taskId ? taskCache.get(entry.taskId) : null;
      activityItems.push({
        id: `time-entry-${entry.id}`,
        type: "time_logged",
        timestamp: entry.createdAt,
        actorId: entry.userId,
        actorName: "",
        actorEmail: "",
        actorAvatarUrl: null,
        entityId: entry.taskId || projectId,
        entityTitle: task?.title || entry.description || "Time logged",
        metadata: { durationSeconds: entry.durationSeconds },
      });
    }

    // 5. Batch fetch all users
    const userMap = new Map<string, { id: string; name: string; email: string; avatarUrl: string | null }>();
    if (userIds.size > 0) {
      const userList = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl })
        .from(users)
        .where(inArray(users.id, Array.from(userIds)));
      for (const u of userList) {
        userMap.set(u.id, u);
      }
    }

    // 6. Fill in actor details
    for (const item of activityItems) {
      if (item.actorId === "system") {
        item.actorName = "System";
        item.actorEmail = "";
        item.actorAvatarUrl = null;
      } else {
        const user = userMap.get(item.actorId);
        item.actorName = user?.name || "Unknown";
        item.actorEmail = user?.email || "";
        item.actorAvatarUrl = user?.avatarUrl || null;
      }
    }

    // Sort all items by timestamp descending and limit
    activityItems.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return activityItems.slice(0, limit);
  }

  async getTaskAttachment(id: string): Promise<TaskAttachment | undefined> {
    const [attachment] = await db.select().from(taskAttachments).where(eq(taskAttachments.id, id));
    return attachment || undefined;
  }

  async getTaskAttachmentsByTask(taskId: string): Promise<TaskAttachmentWithUser[]> {
    const attachmentsList = await db.select().from(taskAttachments)
      .where(eq(taskAttachments.taskId, taskId))
      .orderBy(desc(taskAttachments.createdAt));
    
    const result: TaskAttachmentWithUser[] = [];
    for (const attachment of attachmentsList) {
      const user = await this.getUser(attachment.uploadedByUserId);
      result.push({ ...attachment, uploadedByUser: user });
    }
    return result;
  }

  async createTaskAttachment(insertAttachment: InsertTaskAttachment): Promise<TaskAttachment> {
    const [attachment] = await db.insert(taskAttachments).values(insertAttachment).returning();
    return attachment;
  }

  async updateTaskAttachment(id: string, attachment: Partial<InsertTaskAttachment>): Promise<TaskAttachment | undefined> {
    const [updated] = await db.update(taskAttachments)
      .set({ ...attachment, updatedAt: new Date() })
      .where(eq(taskAttachments.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTaskAttachment(id: string): Promise<void> {
    await db.delete(taskAttachments).where(eq(taskAttachments.id, id));
  }

  // =============================================================================
  // CLIENT (CRM) METHODS
  // =============================================================================

  async getClient(id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client || undefined;
  }

  async getClientWithContacts(id: string): Promise<ClientWithContacts | undefined> {
    const client = await this.getClient(id);
    if (!client) return undefined;
    
    const contacts = await this.getContactsByClient(id);
    const clientProjects = await this.getProjectsByClient(id);
    
    return { ...client, contacts, projects: clientProjects };
  }

  async getClientsByWorkspace(workspaceId: string): Promise<ClientWithContacts[]> {
    const clientsList = await db.select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.companyName));
    
    const result: ClientWithContacts[] = [];
    for (const client of clientsList) {
      const contacts = await this.getContactsByClient(client.id);
      const clientProjects = await this.getProjectsByClient(client.id);
      result.push({ ...client, contacts, projects: clientProjects });
    }
    return result;
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const [client] = await db.insert(clients).values(insertClient).returning();
    return client;
  }

  async updateClient(id: string, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(eq(clients.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClient(id: string): Promise<void> {
    // Delete related contacts and invites first
    await db.delete(clientInvites).where(eq(clientInvites.clientId, id));
    await db.delete(clientContacts).where(eq(clientContacts.clientId, id));
    // Update projects to remove client reference
    await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, id));
    // Delete the client
    await db.delete(clients).where(eq(clients.id, id));
  }

  // =============================================================================
  // CLIENT CONTACT METHODS
  // =============================================================================

  async getClientContact(id: string): Promise<ClientContact | undefined> {
    const [contact] = await db.select().from(clientContacts).where(eq(clientContacts.id, id));
    return contact || undefined;
  }

  async getContactsByClient(clientId: string): Promise<ClientContact[]> {
    return db.select()
      .from(clientContacts)
      .where(eq(clientContacts.clientId, clientId))
      .orderBy(desc(clientContacts.isPrimary), asc(clientContacts.firstName));
  }

  async createClientContact(insertContact: InsertClientContact): Promise<ClientContact> {
    const [contact] = await db.insert(clientContacts).values(insertContact).returning();
    return contact;
  }

  async updateClientContact(id: string, contact: Partial<InsertClientContact>): Promise<ClientContact | undefined> {
    const [updated] = await db.update(clientContacts)
      .set({ ...contact, updatedAt: new Date() })
      .where(eq(clientContacts.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClientContact(id: string): Promise<void> {
    // Delete related invites first
    await db.delete(clientInvites).where(eq(clientInvites.contactId, id));
    await db.delete(clientContacts).where(eq(clientContacts.id, id));
  }

  // =============================================================================
  // CLIENT INVITE METHODS (placeholder for future auth integration)
  // =============================================================================

  async getClientInvite(id: string): Promise<ClientInvite | undefined> {
    const [invite] = await db.select().from(clientInvites).where(eq(clientInvites.id, id));
    return invite || undefined;
  }

  async getInvitesByClient(clientId: string): Promise<ClientInvite[]> {
    return db.select()
      .from(clientInvites)
      .where(eq(clientInvites.clientId, clientId))
      .orderBy(desc(clientInvites.createdAt));
  }

  async createClientInvite(insertInvite: InsertClientInvite): Promise<ClientInvite> {
    const [invite] = await db.insert(clientInvites).values(insertInvite).returning();
    return invite;
  }

  async updateClientInvite(id: string, invite: Partial<InsertClientInvite>): Promise<ClientInvite | undefined> {
    const [updated] = await db.update(clientInvites)
      .set({ ...invite, updatedAt: new Date() })
      .where(eq(clientInvites.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteClientInvite(id: string): Promise<void> {
    await db.delete(clientInvites).where(eq(clientInvites.id, id));
  }

  // =============================================================================
  // PROJECTS BY CLIENT
  // =============================================================================

  async addClientUserAccess(access: InsertClientUserAccess): Promise<ClientUserAccess> {
    const [result] = await db.insert(clientUserAccess).values(access).returning();
    return result;
  }

  async getClientUsers(clientId: string): Promise<Array<{ user: User; access: ClientUserAccess }>> {
    const accessRecords = await db.select()
      .from(clientUserAccess)
      .where(eq(clientUserAccess.clientId, clientId));
    
    const result: Array<{ user: User; access: ClientUserAccess }> = [];
    for (const access of accessRecords) {
      const [user] = await db.select().from(users).where(eq(users.id, access.userId));
      if (user) {
        result.push({ user, access });
      }
    }
    return result;
  }

  async getClientUserAccessByUserAndClient(userId: string, clientId: string): Promise<ClientUserAccess | undefined> {
    // Get user and client to verify tenant isolation
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return undefined;
    }
    
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    if (!client) {
      return undefined;
    }
    
    // Enforce strict tenant isolation for client portal access
    // Both user and client must have tenantId set and they must match
    if (!user.tenantId || !client.tenantId) {
      console.warn("[storage] getClientUserAccessByUserAndClient: Missing tenantId", {
        userId: user.id,
        userTenantId: user.tenantId,
        clientId: client.id,
        clientTenantId: client.tenantId,
      });
      return undefined;
    }
    
    if (user.tenantId !== client.tenantId) {
      console.warn("[storage] getClientUserAccessByUserAndClient: Tenant mismatch", {
        userId: user.id,
        userTenantId: user.tenantId,
        clientId: client.id,
        clientTenantId: client.tenantId,
      });
      return undefined;
    }
    
    const [access] = await db.select()
      .from(clientUserAccess)
      .where(and(
        eq(clientUserAccess.userId, userId),
        eq(clientUserAccess.clientId, clientId)
      ));
    return access || undefined;
  }

  async updateClientUserAccess(clientId: string, userId: string, updates: Partial<InsertClientUserAccess>): Promise<ClientUserAccess | undefined> {
    const [result] = await db.update(clientUserAccess)
      .set({ ...updates })
      .where(and(
        eq(clientUserAccess.clientId, clientId),
        eq(clientUserAccess.userId, userId)
      ))
      .returning();
    return result || undefined;
  }

  async deleteClientUserAccess(clientId: string, userId: string): Promise<void> {
    await db.delete(clientUserAccess)
      .where(and(
        eq(clientUserAccess.clientId, clientId),
        eq(clientUserAccess.userId, userId)
      ));
  }

  async getClientsForUser(userId: string): Promise<Array<{ client: Client; access: ClientUserAccess }>> {
    // Get the user to verify tenant
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      return [];
    }
    
    const accessRecords = await db.select()
      .from(clientUserAccess)
      .where(eq(clientUserAccess.userId, userId));
    
    const result: Array<{ client: Client; access: ClientUserAccess }> = [];
    for (const access of accessRecords) {
      const [client] = await db.select().from(clients).where(eq(clients.id, access.clientId));
      if (!client) {
        continue;
      }
      
      // Enforce tenant isolation for cross-tenant security
      // Both user and client should have matching tenantIds
      // If either is missing tenantId, this is a data integrity issue - skip for safety
      if (!user.tenantId || !client.tenantId) {
        console.warn("[storage] getClientsForUser: Missing tenantId", {
          userId: user.id,
          userTenantId: user.tenantId,
          clientId: client.id,
          clientTenantId: client.tenantId,
        });
        continue;
      }
      
      if (user.tenantId !== client.tenantId) {
        console.warn("[storage] getClientsForUser: Tenant mismatch", {
          userId: user.id,
          userTenantId: user.tenantId,
          clientId: client.id,
          clientTenantId: client.tenantId,
        });
        continue;
      }
      
      result.push({ client, access });
    }
    return result;
  }

  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return db.select()
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(asc(projects.name));
  }

  // =============================================================================
  // TIME TRACKING - TIME ENTRIES
  // =============================================================================

  async getTimeEntry(id: string): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries).where(eq(timeEntries.id, id));
    return entry || undefined;
  }

  async getTimeEntriesByWorkspace(workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]> {
    let conditions = [eq(timeEntries.workspaceId, workspaceId)];
    
    if (filters?.userId) {
      conditions.push(eq(timeEntries.userId, filters.userId));
    }
    if (filters?.clientId) {
      conditions.push(eq(timeEntries.clientId, filters.clientId));
    }
    if (filters?.projectId) {
      conditions.push(eq(timeEntries.projectId, filters.projectId));
    }
    if (filters?.taskId) {
      conditions.push(eq(timeEntries.taskId, filters.taskId));
    }
    if (filters?.scope) {
      conditions.push(eq(timeEntries.scope, filters.scope));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeEntries.startTime, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeEntries.startTime, filters.endDate));
    }

    const entries = await db.select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime));

    // Enrich with relations
    const result: TimeEntryWithRelations[] = [];
    for (const entry of entries) {
      const enriched: TimeEntryWithRelations = { ...entry };
      
      if (entry.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, entry.userId));
        if (user) enriched.user = user;
      }
      if (entry.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, entry.clientId));
        if (client) enriched.client = client;
      }
      if (entry.projectId) {
        const [project] = await db.select().from(projects).where(eq(projects.id, entry.projectId));
        if (project) enriched.project = project;
      }
      if (entry.taskId) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, entry.taskId));
        if (task) enriched.task = task;
      }
      
      result.push(enriched);
    }
    
    return result;
  }

  async getTimeEntriesByUser(userId: string, workspaceId: string): Promise<TimeEntryWithRelations[]> {
    return this.getTimeEntriesByWorkspace(workspaceId, { userId });
  }

  async createTimeEntry(entry: InsertTimeEntry): Promise<TimeEntry> {
    assertInsertHasTenantId(entry, "time_entries");
    const [created] = await db.insert(timeEntries).values(entry).returning();
    return created;
  }

  async updateTimeEntry(id: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [updated] = await db.update(timeEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(eq(timeEntries.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteTimeEntry(id: string): Promise<void> {
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
  }

  // =============================================================================
  // TIME TRACKING - ACTIVE TIMERS
  // =============================================================================

  async getActiveTimer(id: string): Promise<ActiveTimer | undefined> {
    const [timer] = await db.select().from(activeTimers).where(eq(activeTimers.id, id));
    return timer || undefined;
  }

  async getActiveTimerByUser(userId: string): Promise<ActiveTimerWithRelations | undefined> {
    const [timer] = await db.select().from(activeTimers).where(eq(activeTimers.userId, userId));
    
    if (!timer) return undefined;
    
    const enriched: ActiveTimerWithRelations = { ...timer };
    
    if (timer.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, timer.userId));
      if (user) enriched.user = user;
    }
    if (timer.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, timer.clientId));
      if (client) enriched.client = client;
    }
    if (timer.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, timer.projectId));
      if (project) enriched.project = project;
    }
    if (timer.taskId) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, timer.taskId));
      if (task) enriched.task = task;
    }
    
    return enriched;
  }

  async createActiveTimer(timer: InsertActiveTimer): Promise<ActiveTimer> {
    assertInsertHasTenantId(timer, "active_timers");
    const [created] = await db.insert(activeTimers).values(timer).returning();
    return created;
  }

  async updateActiveTimer(id: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined> {
    const [updated] = await db.update(activeTimers)
      .set({ ...timer, updatedAt: new Date() })
      .where(eq(activeTimers.id, id))
      .returning();
    return updated || undefined;
  }

  async deleteActiveTimer(id: string): Promise<void> {
    await db.delete(activeTimers).where(eq(activeTimers.id, id));
  }

  // =============================================================================
  // USER MANAGEMENT
  // =============================================================================

  async getUsersByWorkspace(workspaceId: string): Promise<User[]> {
    const members = await db.select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId));
    
    if (members.length === 0) {
      return db.select().from(users);
    }
    
    const userIds = members.map(m => m.userId);
    const result: User[] = [];
    
    for (const userId of userIds) {
      const [user] = await db.select().from(users).where(eq(users.id, userId));
      if (user) result.push(user);
    }
    
    return result;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const { passwordHash, ...safeUpdates } = updates as any;
    const [updated] = await db.update(users)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated || undefined;
  }

  // =============================================================================
  // INVITATIONS
  // =============================================================================

  async getInvitationsByWorkspace(workspaceId: string): Promise<Invitation[]> {
    return db.select().from(invitations).where(eq(invitations.workspaceId, workspaceId));
  }

  async createInvitation(invitation: InsertInvitation): Promise<Invitation> {
    const [created] = await db.insert(invitations).values(invitation).returning();
    return created;
  }

  async deleteInvitation(id: string): Promise<void> {
    await db.delete(invitations).where(eq(invitations.id, id));
  }

  // =============================================================================
  // APP SETTINGS (Encrypted)
  // =============================================================================

  async getAppSettings(workspaceId: string, key: string): Promise<any> {
    console.log(`[settings] GET workspaceId=${workspaceId} key=${key}`);
    
    const [setting] = await db.select()
      .from(appSettings)
      .where(and(eq(appSettings.workspaceId, workspaceId), eq(appSettings.key, key)));
    
    if (!setting) {
      console.log(`[settings] No record found for workspaceId=${workspaceId} key=${key}`);
      return null;
    }
    
    try {
      const decrypted = decryptValue(setting.valueEncrypted);
      const parsed = JSON.parse(decrypted);
      console.log(`[settings] Successfully decrypted workspaceId=${workspaceId} key=${key}`);
      return parsed;
    } catch (error) {
      console.error(`[settings] Decryption failed for workspaceId=${workspaceId} key=${key}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  async setAppSettings(workspaceId: string, key: string, value: any, userId?: string): Promise<void> {
    console.log(`[settings] PUT workspaceId=${workspaceId} key=${key} userId=${userId || 'unknown'}`);
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const encryptedValue = encryptValue(stringValue);
    
    const [existing] = await db.select()
      .from(appSettings)
      .where(and(eq(appSettings.workspaceId, workspaceId), eq(appSettings.key, key)));
    
    if (existing) {
      await db.update(appSettings)
        .set({ 
          valueEncrypted: encryptedValue, 
          updatedAt: new Date(),
          updatedByUserId: userId || null,
        })
        .where(eq(appSettings.id, existing.id));
      console.log(`[settings] Updated existing record id=${existing.id}`);
    } else {
      const [inserted] = await db.insert(appSettings).values({
        workspaceId,
        key,
        valueEncrypted: encryptedValue,
        updatedByUserId: userId || null,
      }).returning();
      console.log(`[settings] Inserted new record id=${inserted.id}`);
    }
  }

  // =============================================================================
  // TENANT-SCOPED METHODS (Phase 2A)
  // =============================================================================

  // Clients - tenant scoped
  async getClientByIdAndTenant(id: string, tenantId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients)
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)));
    return client || undefined;
  }

  async getClientsByTenant(tenantId: string, _workspaceId?: string): Promise<ClientWithContacts[]> {
    const clientsList = await db.select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(asc(clients.companyName));
    
    const result: ClientWithContacts[] = [];
    for (const client of clientsList) {
      const contacts = await this.getContactsByClient(client.id);
      const clientProjects = await this.getProjectsByClient(client.id);
      result.push({ ...client, contacts, projects: clientProjects });
    }
    return result;
  }

  async getClientsByTenantWithHierarchy(tenantId: string): Promise<(Client & { depth: number; parentName?: string; contactCount: number; projectCount: number })[]> {
    // Get all clients for the tenant
    const allClients = await db.select()
      .from(clients)
      .where(eq(clients.tenantId, tenantId))
      .orderBy(asc(clients.companyName));
    
    if (allClients.length === 0) {
      return [];
    }
    
    // Bulk fetch contact counts per client
    const clientIds = allClients.map(c => c.id);
    const contactCounts = await db.select({
      clientId: clientContacts.clientId,
      count: sql<number>`count(*)::int`,
    })
      .from(clientContacts)
      .where(inArray(clientContacts.clientId, clientIds))
      .groupBy(clientContacts.clientId);
    
    const contactCountMap = new Map(contactCounts.map(c => [c.clientId, c.count]));
    
    // Bulk fetch project counts per client
    const projectCounts = await db.select({
      clientId: projects.clientId,
      count: sql<number>`count(*)::int`,
    })
      .from(projects)
      .where(and(
        inArray(projects.clientId, clientIds),
        isNotNull(projects.clientId)
      ))
      .groupBy(projects.clientId);
    
    const projectCountMap = new Map(projectCounts.map(p => [p.clientId!, p.count]));
    
    // Build parent->children map for O(1) child lookups
    const childrenMap = new Map<string | null, Client[]>();
    for (const client of allClients) {
      const parentId = client.parentClientId || null;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(client);
    }
    
    // Build client map for parent name lookup
    const clientMap = new Map(allClients.map(c => [c.id, c]));
    
    // Build hierarchy with depth calculation
    type ClientWithHierarchy = Client & { depth: number; parentName?: string; contactCount: number; projectCount: number };
    const result: ClientWithHierarchy[] = [];
    
    // Non-recursive function to add client and its children
    const addWithChildren = (client: Client, depth: number, parentName?: string) => {
      result.push({ 
        ...client, 
        depth, 
        parentName,
        contactCount: contactCountMap.get(client.id) || 0,
        projectCount: projectCountMap.get(client.id) || 0,
      });
      
      // Get children from map
      const children = childrenMap.get(client.id) || [];
      for (const child of children) {
        addWithChildren(child, depth + 1, client.companyName);
      }
    };
    
    // Process top-level clients first
    const topLevel = childrenMap.get(null) || [];
    for (const client of topLevel) {
      addWithChildren(client, 0);
    }
    
    return result;
  }

  async getChildClients(parentClientId: string): Promise<Client[]> {
    return db.select()
      .from(clients)
      .where(eq(clients.parentClientId, parentClientId))
      .orderBy(asc(clients.companyName));
  }

  async validateParentClient(parentClientId: string, tenantId: string): Promise<boolean> {
    if (!parentClientId) return true; // null parent is always valid
    
    const [parent] = await db.select()
      .from(clients)
      .where(and(
        eq(clients.id, parentClientId),
        eq(clients.tenantId, tenantId)
      ));
    return !!parent;
  }

  async createClientWithTenant(insertClient: InsertClient, tenantId: string): Promise<Client> {
    const [client] = await db.insert(clients).values({ ...insertClient, tenantId }).returning();
    return client;
  }

  async updateClientWithTenant(id: string, tenantId: string, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients)
      .set({ ...client, updatedAt: new Date() })
      .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteClientWithTenant(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getClientByIdAndTenant(id, tenantId);
    if (!existing) return false;
    
    await db.delete(clientInvites).where(eq(clientInvites.clientId, id));
    await db.delete(clientContacts).where(eq(clientContacts.clientId, id));
    await db.update(projects).set({ clientId: null }).where(eq(projects.clientId, id));
    await db.delete(clients).where(eq(clients.id, id));
    return true;
  }

  // Projects - tenant scoped
  async getProjectByIdAndTenant(id: string, tenantId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));
    return project || undefined;
  }

  async getProjectsByTenant(tenantId: string, _workspaceId?: string): Promise<Project[]> {
    return db.select()
      .from(projects)
      .where(eq(projects.tenantId, tenantId))
      .orderBy(desc(projects.createdAt));
  }

  async createProjectWithTenant(insertProject: InsertProject, tenantId: string): Promise<Project> {
    const [project] = await db.insert(projects).values({ ...insertProject, tenantId }).returning();
    return project;
  }

  async updateProjectWithTenant(id: string, tenantId: string, project: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db.update(projects)
      .set({ ...project, updatedAt: new Date() })
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  // Teams - tenant scoped
  async getTeamByIdAndTenant(id: string, tenantId: string): Promise<Team | undefined> {
    const [team] = await db.select().from(teams)
      .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)));
    return team || undefined;
  }

  async getTeamsByTenant(tenantId: string, workspaceId: string): Promise<Team[]> {
    return db.select()
      .from(teams)
      .where(and(eq(teams.tenantId, tenantId), eq(teams.workspaceId, workspaceId)))
      .orderBy(asc(teams.name));
  }

  async createTeamWithTenant(insertTeam: InsertTeam, tenantId: string): Promise<Team> {
    const [team] = await db.insert(teams).values({ ...insertTeam, tenantId }).returning();
    return team;
  }

  async updateTeamWithTenant(id: string, tenantId: string, team: Partial<InsertTeam>): Promise<Team | undefined> {
    const [updated] = await db.update(teams)
      .set({ ...team })
      .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteTeamWithTenant(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getTeamByIdAndTenant(id, tenantId);
    if (!existing) return false;
    
    await db.delete(teamMembers).where(eq(teamMembers.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
    return true;
  }

  // Tasks - tenant scoped
  async getTaskByIdAndTenant(id: string, tenantId: string): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)));
    return task || undefined;
  }

  async createTaskWithTenant(insertTask: InsertTask, tenantId: string): Promise<Task> {
    let orderIndex = insertTask.orderIndex;
    if (orderIndex === undefined && insertTask.sectionId) {
      const existingTasks = await db.select().from(tasks).where(eq(tasks.sectionId, insertTask.sectionId));
      orderIndex = existingTasks.length;
    }
    const [task] = await db.insert(tasks).values({ ...insertTask, tenantId, orderIndex: orderIndex ?? 0 }).returning();
    return task;
  }

  async updateTaskWithTenant(id: string, tenantId: string, task: Partial<InsertTask>): Promise<Task | undefined> {
    const [updated] = await db.update(tasks)
      .set({ ...task, updatedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteTaskWithTenant(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getTaskByIdAndTenant(id, tenantId);
    if (!existing) return false;
    
    await db.delete(subtasks).where(eq(subtasks.taskId, id));
    await db.delete(taskAssignees).where(eq(taskAssignees.taskId, id));
    await db.delete(taskTags).where(eq(taskTags.taskId, id));
    await db.delete(comments).where(eq(comments.taskId, id));
    await db.delete(tasks).where(eq(tasks.id, id));
    return true;
  }

  // Users - tenant scoped
  async getUserByIdAndTenant(id: string, tenantId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)));
    return user || undefined;
  }

  async getUserByEmailAndTenant(email: string, tenantId: string): Promise<User | undefined> {
    const [user] = await db.select().from(users)
      .where(and(eq(users.email, email), eq(users.tenantId, tenantId)));
    return user || undefined;
  }

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
  }

  async createUserWithTenant(user: InsertUser & { tenantId: string }): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUserWithTenant(id: string, tenantId: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const { passwordHash, ...safeUpdates } = updates as any;
    const [updated] = await db.update(users)
      .set({ ...safeUpdates, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async setUserPasswordWithTenant(id: string, tenantId: string, passwordHash: string): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async setUserActiveWithTenant(id: string, tenantId: string, isActive: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async getInvitationsByTenant(tenantId: string): Promise<Invitation[]> {
    return db.select().from(invitations).where(eq(invitations.tenantId, tenantId));
  }

  async updateInvitation(id: string, updates: Partial<InsertInvitation>): Promise<Invitation | undefined> {
    const [updated] = await db.update(invitations)
      .set(updates)
      .where(eq(invitations.id, id))
      .returning();
    return updated || undefined;
  }

  async revokeInvitation(id: string): Promise<Invitation | undefined> {
    const [updated] = await db.update(invitations)
      .set({ status: "revoked" })
      .where(eq(invitations.id, id))
      .returning();
    return updated || undefined;
  }

  // App Settings - tenant scoped
  async getAppSettingsByTenant(tenantId: string, workspaceId: string, key: string): Promise<any> {
    console.log(`[settings] GET tenantId=${tenantId} workspaceId=${workspaceId} key=${key}`);
    
    const [setting] = await db.select()
      .from(appSettings)
      .where(and(
        eq(appSettings.tenantId, tenantId),
        eq(appSettings.workspaceId, workspaceId),
        eq(appSettings.key, key)
      ));
    
    if (!setting) {
      console.log(`[settings] No record found for tenantId=${tenantId} workspaceId=${workspaceId} key=${key}`);
      return null;
    }
    
    try {
      const decrypted = decryptValue(setting.valueEncrypted);
      const parsed = JSON.parse(decrypted);
      console.log(`[settings] Successfully decrypted tenantId=${tenantId} workspaceId=${workspaceId} key=${key}`);
      return parsed;
    } catch (error) {
      console.error(`[settings] Decryption failed for tenantId=${tenantId} workspaceId=${workspaceId} key=${key}:`, error instanceof Error ? error.message : error);
      return null;
    }
  }

  async setAppSettingsByTenant(tenantId: string, workspaceId: string, key: string, value: any, userId?: string): Promise<void> {
    console.log(`[settings] PUT tenantId=${tenantId} workspaceId=${workspaceId} key=${key} userId=${userId || 'unknown'}`);
    
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    const encryptedValue = encryptValue(stringValue);
    
    const [existing] = await db.select()
      .from(appSettings)
      .where(and(
        eq(appSettings.tenantId, tenantId),
        eq(appSettings.workspaceId, workspaceId),
        eq(appSettings.key, key)
      ));
    
    if (existing) {
      await db.update(appSettings)
        .set({ 
          valueEncrypted: encryptedValue, 
          updatedAt: new Date(),
          updatedByUserId: userId || null,
        })
        .where(eq(appSettings.id, existing.id));
      console.log(`[settings] Updated existing record id=${existing.id}`);
    } else {
      const [inserted] = await db.insert(appSettings).values({
        tenantId,
        workspaceId,
        key,
        valueEncrypted: encryptedValue,
        updatedByUserId: userId || null,
      }).returning();
      console.log(`[settings] Inserted new record id=${inserted.id}`);
    }
  }

  // Tenant management (Super Admin)
  async getAllTenants(): Promise<Tenant[]> {
    return db.select().from(tenants).orderBy(asc(tenants.name));
  }

  async getTenant(id: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
    return tenant || undefined;
  }

  async getTenantBySlug(slug: string): Promise<Tenant | undefined> {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.slug, slug));
    return tenant || undefined;
  }

  async createTenant(tenant: InsertTenant): Promise<Tenant> {
    const [created] = await db.insert(tenants).values(tenant).returning();
    return created;
  }

  async updateTenant(id: string, tenant: Partial<InsertTenant>): Promise<Tenant | undefined> {
    const [updated] = await db.update(tenants)
      .set({ ...tenant, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    return updated || undefined;
  }

  // =============================================================================
  // PHASE 2B: TENANT-SCOPED TIME ENTRIES
  // =============================================================================

  async getTimeEntryByIdAndTenant(id: string, tenantId: string): Promise<TimeEntry | undefined> {
    const [entry] = await db.select().from(timeEntries)
      .where(and(eq(timeEntries.id, id), eq(timeEntries.tenantId, tenantId)));
    return entry || undefined;
  }

  async getTimeEntriesByTenant(tenantId: string, workspaceId: string, filters?: {
    userId?: string;
    clientId?: string;
    projectId?: string;
    taskId?: string;
    scope?: 'in_scope' | 'out_of_scope';
    startDate?: Date;
    endDate?: Date;
  }): Promise<TimeEntryWithRelations[]> {
    let conditions = [
      eq(timeEntries.tenantId, tenantId),
      eq(timeEntries.workspaceId, workspaceId)
    ];
    
    if (filters?.userId) {
      conditions.push(eq(timeEntries.userId, filters.userId));
    }
    if (filters?.clientId) {
      conditions.push(eq(timeEntries.clientId, filters.clientId));
    }
    if (filters?.projectId) {
      conditions.push(eq(timeEntries.projectId, filters.projectId));
    }
    if (filters?.taskId) {
      conditions.push(eq(timeEntries.taskId, filters.taskId));
    }
    if (filters?.scope) {
      conditions.push(eq(timeEntries.scope, filters.scope));
    }
    if (filters?.startDate) {
      conditions.push(gte(timeEntries.startTime, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(timeEntries.startTime, filters.endDate));
    }

    const entries = await db.select()
      .from(timeEntries)
      .where(and(...conditions))
      .orderBy(desc(timeEntries.startTime));

    const result: TimeEntryWithRelations[] = [];
    for (const entry of entries) {
      const enriched: TimeEntryWithRelations = { ...entry };
      
      if (entry.userId) {
        const [user] = await db.select().from(users).where(eq(users.id, entry.userId));
        if (user) enriched.user = user;
      }
      if (entry.clientId) {
        const [client] = await db.select().from(clients).where(eq(clients.id, entry.clientId));
        if (client) enriched.client = client;
      }
      if (entry.projectId) {
        const [project] = await db.select().from(projects).where(eq(projects.id, entry.projectId));
        if (project) enriched.project = project;
      }
      if (entry.taskId) {
        const [task] = await db.select().from(tasks).where(eq(tasks.id, entry.taskId));
        if (task) enriched.task = task;
      }
      
      result.push(enriched);
    }
    
    return result;
  }

  async createTimeEntryWithTenant(entry: InsertTimeEntry, tenantId: string): Promise<TimeEntry> {
    const [created] = await db.insert(timeEntries).values({ ...entry, tenantId }).returning();
    return created;
  }

  async updateTimeEntryWithTenant(id: string, tenantId: string, entry: Partial<InsertTimeEntry>): Promise<TimeEntry | undefined> {
    const [updated] = await db.update(timeEntries)
      .set({ ...entry, updatedAt: new Date() })
      .where(and(eq(timeEntries.id, id), eq(timeEntries.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteTimeEntryWithTenant(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getTimeEntryByIdAndTenant(id, tenantId);
    if (!existing) return false;
    await db.delete(timeEntries).where(eq(timeEntries.id, id));
    return true;
  }

  // =============================================================================
  // PHASE 2B: TENANT-SCOPED ACTIVE TIMERS
  // =============================================================================

  async getActiveTimerByIdAndTenant(id: string, tenantId: string): Promise<ActiveTimer | undefined> {
    const [timer] = await db.select().from(activeTimers)
      .where(and(eq(activeTimers.id, id), eq(activeTimers.tenantId, tenantId)));
    return timer || undefined;
  }

  async getActiveTimerByUserAndTenant(userId: string, tenantId: string): Promise<ActiveTimerWithRelations | undefined> {
    const [timer] = await db.select().from(activeTimers)
      .where(and(eq(activeTimers.userId, userId), eq(activeTimers.tenantId, tenantId)));
    
    if (!timer) return undefined;
    
    const enriched: ActiveTimerWithRelations = { ...timer };
    
    if (timer.userId) {
      const [user] = await db.select().from(users).where(eq(users.id, timer.userId));
      if (user) enriched.user = user;
    }
    if (timer.clientId) {
      const [client] = await db.select().from(clients).where(eq(clients.id, timer.clientId));
      if (client) enriched.client = client;
    }
    if (timer.projectId) {
      const [project] = await db.select().from(projects).where(eq(projects.id, timer.projectId));
      if (project) enriched.project = project;
    }
    if (timer.taskId) {
      const [task] = await db.select().from(tasks).where(eq(tasks.id, timer.taskId));
      if (task) enriched.task = task;
    }
    
    return enriched;
  }

  async createActiveTimerWithTenant(timer: InsertActiveTimer, tenantId: string): Promise<ActiveTimer> {
    const [created] = await db.insert(activeTimers).values({ ...timer, tenantId }).returning();
    return created;
  }

  async updateActiveTimerWithTenant(id: string, tenantId: string, timer: Partial<InsertActiveTimer>): Promise<ActiveTimer | undefined> {
    const [updated] = await db.update(activeTimers)
      .set({ ...timer, updatedAt: new Date() })
      .where(and(eq(activeTimers.id, id), eq(activeTimers.tenantId, tenantId)))
      .returning();
    return updated || undefined;
  }

  async deleteActiveTimerWithTenant(id: string, tenantId: string): Promise<boolean> {
    const existing = await this.getActiveTimerByIdAndTenant(id, tenantId);
    if (!existing) return false;
    await db.delete(activeTimers).where(eq(activeTimers.id, id));
    return true;
  }

  // =============================================================================
  // PHASE 2B: TENANT-SCOPED TASK ATTACHMENTS
  // =============================================================================

  async getTaskAttachmentByIdAndTenant(id: string, tenantId: string): Promise<TaskAttachment | undefined> {
    const [attachment] = await db.select().from(taskAttachments)
      .where(and(eq(taskAttachments.id, id), eq(taskAttachments.tenantId, tenantId)));
    return attachment || undefined;
  }

  async getTaskAttachmentsByTaskAndTenant(taskId: string, tenantId: string): Promise<TaskAttachmentWithUser[]> {
    const attachments = await db.select()
      .from(taskAttachments)
      .where(and(eq(taskAttachments.taskId, taskId), eq(taskAttachments.tenantId, tenantId)))
      .orderBy(desc(taskAttachments.uploadedAt));
    
    const result: TaskAttachmentWithUser[] = [];
    for (const att of attachments) {
      const enriched: TaskAttachmentWithUser = { ...att };
      if (att.uploadedBy) {
        const [user] = await db.select().from(users).where(eq(users.id, att.uploadedBy));
        if (user) enriched.uploadedByUser = user;
      }
      result.push(enriched);
    }
    return result;
  }

  // =============================================================================
  // PHASE 3A: TENANT SETTINGS
  // =============================================================================

  async getTenantSettings(tenantId: string): Promise<TenantSettings | undefined> {
    const [settings] = await db.select().from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    return settings || undefined;
  }

  async createTenantSettings(settings: InsertTenantSettings): Promise<TenantSettings> {
    const [created] = await db.insert(tenantSettings).values(settings).returning();
    return created;
  }

  async updateTenantSettings(tenantId: string, settings: Partial<InsertTenantSettings>): Promise<TenantSettings | undefined> {
    const [updated] = await db.update(tenantSettings)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(tenantSettings.tenantId, tenantId))
      .returning();
    return updated || undefined;
  }

  // =============================================================================
  // PHASE 3A: TENANT ADMIN INVITATIONS
  // =============================================================================

  async createTenantAdminInvitation(data: {
    tenantId: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: "admin" | "employee";
    expiresInDays?: number;
    createdByUserId: string;
    workspaceId: string;
  }): Promise<{ invitation: Invitation; token: string }> {
    const expiresInDays = data.expiresInDays || 7;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [invitation] = await db.insert(invitations).values({
      tenantId: data.tenantId,
      workspaceId: data.workspaceId,
      email: data.email,
      role: data.role === "employee" ? UserRole.EMPLOYEE : UserRole.ADMIN,
      tokenHash,
      status: "pending",
      expiresAt,
      createdByUserId: data.createdByUserId,
    }).returning();

    return { invitation, token };
  }

  async getInvitationById(invitationId: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select()
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .limit(1);
    return invitation || undefined;
  }

  async getLatestInvitationByUserEmail(email: string, tenantId: string): Promise<Invitation | undefined> {
    const [invitation] = await db.select()
      .from(invitations)
      .where(and(
        eq(invitations.email, email),
        eq(invitations.tenantId, tenantId)
      ))
      .orderBy(desc(invitations.createdAt))
      .limit(1);
    return invitation || undefined;
  }

  async regenerateInvitation(invitationId: string, createdByUserId: string): Promise<{ invitation: Invitation; token: string }> {
    const existingInvitation = await db.select().from(invitations).where(eq(invitations.id, invitationId)).limit(1);
    if (!existingInvitation.length) {
      throw new Error("Invitation not found");
    }

    const oldInvite = existingInvitation[0];

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const [newInvitation] = await db.update(invitations)
      .set({
        tokenHash,
        status: "pending",
        expiresAt,
        usedAt: null,
      })
      .where(eq(invitations.id, invitationId))
      .returning();

    return { invitation: newInvitation, token };
  }

  async setUserMustChangePassword(userId: string, tenantId: string, mustChange: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ 
        mustChangePasswordOnNextLogin: mustChange,
        updatedAt: new Date() 
      })
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ))
      .returning();
    return updated || undefined;
  }

  async setUserPasswordWithMustChange(userId: string, tenantId: string, passwordHash: string, mustChange: boolean): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ 
        passwordHash,
        mustChangePasswordOnNextLogin: mustChange,
        updatedAt: new Date() 
      })
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ))
      .returning();
    return updated || undefined;
  }

  // =============================================================================
  // PERSONAL TASK SECTIONS (My Tasks organization)
  // =============================================================================

  async getPersonalTaskSection(id: string): Promise<PersonalTaskSection | undefined> {
    const [section] = await db.select().from(personalTaskSections).where(eq(personalTaskSections.id, id));
    return section || undefined;
  }

  async getPersonalTaskSections(userId: string): Promise<PersonalTaskSection[]> {
    return await db.select()
      .from(personalTaskSections)
      .where(eq(personalTaskSections.userId, userId))
      .orderBy(asc(personalTaskSections.sortOrder));
  }

  async createPersonalTaskSection(section: InsertPersonalTaskSection): Promise<PersonalTaskSection> {
    const [created] = await db.insert(personalTaskSections).values(section).returning();
    return created;
  }

  async updatePersonalTaskSection(id: string, section: Partial<InsertPersonalTaskSection>): Promise<PersonalTaskSection | undefined> {
    const [updated] = await db.update(personalTaskSections)
      .set({ ...section, updatedAt: new Date() })
      .where(eq(personalTaskSections.id, id))
      .returning();
    return updated || undefined;
  }

  async deletePersonalTaskSection(id: string): Promise<void> {
    await db.delete(personalTaskSections).where(eq(personalTaskSections.id, id));
  }

  async clearPersonalSectionFromTasks(sectionId: string): Promise<void> {
    await db.update(tasks)
      .set({ personalSectionId: null })
      .where(eq(tasks.personalSectionId, sectionId));
  }

  // =============================================================================
  // CLIENT DIVISIONS - CRUD OPERATIONS
  // =============================================================================

  async getClientDivision(id: string): Promise<ClientDivision | undefined> {
    const results = await db.select().from(clientDivisions).where(eq(clientDivisions.id, id));
    return results[0];
  }

  async getClientDivisionsByClient(clientId: string, tenantId: string): Promise<ClientDivision[]> {
    return db.select().from(clientDivisions)
      .where(and(
        eq(clientDivisions.clientId, clientId),
        eq(clientDivisions.tenantId, tenantId)
      ))
      .orderBy(asc(clientDivisions.name));
  }

  async getClientDivisionsByTenant(tenantId: string): Promise<ClientDivision[]> {
    return db.select().from(clientDivisions)
      .where(eq(clientDivisions.tenantId, tenantId))
      .orderBy(asc(clientDivisions.name));
  }

  async createClientDivision(division: InsertClientDivision): Promise<ClientDivision> {
    const [created] = await db.insert(clientDivisions).values(division).returning();
    return created;
  }

  async updateClientDivision(id: string, tenantId: string, division: Partial<InsertClientDivision>): Promise<ClientDivision | undefined> {
    const [updated] = await db.update(clientDivisions)
      .set({ ...division, updatedAt: new Date() })
      .where(and(
        eq(clientDivisions.id, id),
        eq(clientDivisions.tenantId, tenantId)
      ))
      .returning();
    return updated;
  }

  async deleteClientDivision(id: string, tenantId: string): Promise<boolean> {
    const result = await db.delete(clientDivisions)
      .where(and(
        eq(clientDivisions.id, id),
        eq(clientDivisions.tenantId, tenantId)
      ))
      .returning();
    return result.length > 0;
  }

  // =============================================================================
  // DIVISION MEMBERS - CRUD OPERATIONS
  // =============================================================================

  async getDivisionMembers(divisionId: string): Promise<(DivisionMember & { user?: User })[]> {
    const results = await db.select({
      divisionMember: divisionMembers,
      user: users,
    })
    .from(divisionMembers)
    .leftJoin(users, eq(divisionMembers.userId, users.id))
    .where(eq(divisionMembers.divisionId, divisionId));

    return results.map(r => ({
      ...r.divisionMember,
      user: r.user || undefined,
    }));
  }

  async addDivisionMember(member: InsertDivisionMember): Promise<DivisionMember> {
    const [created] = await db.insert(divisionMembers).values(member).returning();
    return created;
  }

  async removeDivisionMember(divisionId: string, userId: string): Promise<void> {
    await db.delete(divisionMembers)
      .where(and(
        eq(divisionMembers.divisionId, divisionId),
        eq(divisionMembers.userId, userId)
      ));
  }

  async setDivisionMembers(divisionId: string, tenantId: string, userIds: string[]): Promise<void> {
    // Delete all existing members
    await db.delete(divisionMembers).where(eq(divisionMembers.divisionId, divisionId));
    
    // Add new members
    if (userIds.length > 0) {
      await db.insert(divisionMembers).values(
        userIds.map(userId => ({
          divisionId,
          tenantId,
          userId,
          role: "member",
        }))
      );
    }
  }

  async isDivisionMember(divisionId: string, userId: string): Promise<boolean> {
    const results = await db.select({ id: divisionMembers.id })
      .from(divisionMembers)
      .where(and(
        eq(divisionMembers.divisionId, divisionId),
        eq(divisionMembers.userId, userId)
      ))
      .limit(1);
    return results.length > 0;
  }

  async getUserDivisions(userId: string, tenantId: string): Promise<ClientDivision[]> {
    const results = await db.select({ division: clientDivisions })
      .from(divisionMembers)
      .innerJoin(clientDivisions, eq(divisionMembers.divisionId, clientDivisions.id))
      .where(and(
        eq(divisionMembers.userId, userId),
        eq(divisionMembers.tenantId, tenantId)
      ));
    return results.map(r => r.division);
  }

  // =============================================================================
  // DIVISION SCOPING HELPERS
  // =============================================================================

  /**
   * Get the effective division scope for a user.
   * For tenant admins, returns "ALL" - they can see all projects.
   * For employees, returns an array of division IDs they belong to.
   * If user belongs to no divisions, returns empty array.
   */
  async getEffectiveDivisionScope(userId: string, tenantId: string): Promise<string[] | "ALL"> {
    // Check if user is an admin (tenant admin or super user)
    const userResults = await db.select({ role: users.role })
      .from(users)
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ));
    
    if (userResults.length === 0) {
      return []; // User not found in tenant
    }
    
    const userRole = userResults[0].role;
    if (userRole === "admin" || userRole === "super_user") {
      return "ALL";
    }
    
    // For employees, get their division memberships
    const membershipResults = await db.select({ divisionId: divisionMembers.divisionId })
      .from(divisionMembers)
      .where(and(
        eq(divisionMembers.userId, userId),
        eq(divisionMembers.tenantId, tenantId)
      ));
    
    return membershipResults.map(r => r.divisionId);
  }

  /**
   * Validate that a division belongs to the specified client and tenant.
   * Used to prevent cross-tenant or cross-client division assignments.
   */
  async validateDivisionBelongsToClientTenant(divisionId: string, clientId: string, tenantId: string): Promise<boolean> {
    const results = await db.select({ id: clientDivisions.id })
      .from(clientDivisions)
      .where(and(
        eq(clientDivisions.id, divisionId),
        eq(clientDivisions.clientId, clientId),
        eq(clientDivisions.tenantId, tenantId)
      ))
      .limit(1);
    return results.length > 0;
  }

  /**
   * Validate that a user belongs to the specified tenant.
   * Used for tenant isolation checks.
   */
  async validateUserBelongsToTenant(userId: string, tenantId: string): Promise<boolean> {
    const results = await db.select({ id: users.id })
      .from(users)
      .where(and(
        eq(users.id, userId),
        eq(users.tenantId, tenantId)
      ))
      .limit(1);
    return results.length > 0;
  }

  // =============================================================================
  // N+1 OPTIMIZATION: BATCH FETCH METHODS
  // =============================================================================

  /**
   * Get open task counts for multiple projects in a single query.
   * Used to avoid N+1 when listing projects with includeCounts=true.
   */
  async getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    
    // Match prior JS behavior: null !== 'done' is true, so null counts as open
    const result = await db.select({
      projectId: tasks.projectId,
      count: sql<number>`count(*)::int`,
    })
      .from(tasks)
      .where(and(
        inArray(tasks.projectId, projectIds),
        sql`(${tasks.status} IS NULL OR ${tasks.status} != 'done')`
      ))
      .groupBy(tasks.projectId);

    const counts = new Map<string, number>();
    for (const row of result) {
      if (row.projectId) {
        counts.set(row.projectId, row.count);
      }
    }
    return counts;
  }

  /**
   * Get all tasks for multiple projects in a single query.
   * 
   * Performance: Avoids N+1 queries by fetching all tasks in one DB query,
   * then batching assignee lookups. Used by analytics/forecast and command palette search.
   * 
   * Security Note: This method does NOT validate tenantId directly. Caller must ensure
   * projectIds are from the correct tenant context. When used for search, projects are
   * pre-filtered by tenant via getProjectsByTenant, making tasks inherently tenant-scoped.
   * 
   * @param projectIds - Array of project IDs to fetch tasks for
   * @returns Map of projectId -> array of lightweight task objects
   */
  async getTasksByProjectIds(projectIds: string[]): Promise<Map<string, Array<{
    id: string;
    title: string;
    projectId: string | null;
    status: string | null;
    priority: string | null;
    dueDate: Date | null;
    estimateMinutes: number | null;
    assigneeUserIds: string[];
    createdAt: Date;
    updatedAt: Date;
  }>>> {
    if (projectIds.length === 0) return new Map();
    
    const tasksRows = await db.select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      estimateMinutes: tasks.estimateMinutes,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
    })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds));

    const taskIds = tasksRows.map(t => t.id);
    
    const assignees = taskIds.length > 0 
      ? await db.select({
          taskId: taskAssignees.taskId,
          userId: taskAssignees.userId,
        })
          .from(taskAssignees)
          .where(inArray(taskAssignees.taskId, taskIds))
      : [];

    const assigneesByTask = new Map<string, string[]>();
    for (const a of assignees) {
      const list = assigneesByTask.get(a.taskId) || [];
      list.push(a.userId);
      assigneesByTask.set(a.taskId, list);
    }

    const tasksByProject = new Map<string, Array<{
      id: string;
      title: string;
      projectId: string | null;
      status: string | null;
      priority: string | null;
      dueDate: Date | null;
      estimateMinutes: number | null;
      assigneeUserIds: string[];
      createdAt: Date;
      updatedAt: Date;
    }>>();

    for (const t of tasksRows) {
      const projectId = t.projectId || "";
      const list = tasksByProject.get(projectId) || [];
      list.push({
        ...t,
        assigneeUserIds: assigneesByTask.get(t.id) || [],
      });
      tasksByProject.set(projectId, list);
    }

    return tasksByProject;
  }

  /**
   * Get all tenants with their settings and user counts in optimized queries.
   * Used to avoid 2N+1 in tenants-detail endpoint.
   */
  async getTenantsWithDetails(): Promise<Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    onboardedAt: Date | null;
    ownerUserId: string | null;
    activatedBySuperUserAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    settings: TenantSettings | null;
    userCount: number;
  }>> {
    const allTenants = await db.select().from(tenants);
    
    if (allTenants.length === 0) return [];

    const tenantIds = allTenants.map(t => t.id);

    const [settingsRows, userCounts] = await Promise.all([
      db.select().from(tenantSettings).where(inArray(tenantSettings.tenantId, tenantIds)),
      db.select({
        tenantId: users.tenantId,
        count: sql<number>`count(*)::int`,
      })
        .from(users)
        .where(inArray(users.tenantId, tenantIds))
        .groupBy(users.tenantId),
    ]);

    const settingsMap = new Map<string, TenantSettings>();
    for (const s of settingsRows) {
      settingsMap.set(s.tenantId, s);
    }

    const userCountMap = new Map<string, number>();
    for (const uc of userCounts) {
      if (uc.tenantId) {
        userCountMap.set(uc.tenantId, uc.count);
      }
    }

    return allTenants.map(tenant => {
      const settings = settingsMap.get(tenant.id);
      return {
        ...tenant,
        settings, // undefined when missing, preserving prior JSON serialization behavior
        userCount: userCountMap.get(tenant.id) || 0,
      };
    });
  }

  // =============================================================================
  // CHAT - CHANNELS
  // =============================================================================

  async getChatChannel(id: string): Promise<ChatChannel | undefined> {
    const [channel] = await db.select().from(chatChannels).where(eq(chatChannels.id, id));
    return channel || undefined;
  }

  async getChatChannelsByTenant(tenantId: string): Promise<ChatChannel[]> {
    return db.select().from(chatChannels).where(eq(chatChannels.tenantId, tenantId)).orderBy(asc(chatChannels.name));
  }

  async createChatChannel(channel: InsertChatChannel): Promise<ChatChannel> {
    const [newChannel] = await db.insert(chatChannels).values(channel).returning();
    return newChannel;
  }

  async updateChatChannel(id: string, channel: Partial<InsertChatChannel>): Promise<ChatChannel | undefined> {
    const [updated] = await db.update(chatChannels).set(channel).where(eq(chatChannels.id, id)).returning();
    return updated || undefined;
  }

  async deleteChatChannel(id: string): Promise<void> {
    await db.delete(chatMessages).where(eq(chatMessages.channelId, id));
    await db.delete(chatChannelMembers).where(eq(chatChannelMembers.channelId, id));
    await db.delete(chatChannels).where(eq(chatChannels.id, id));
  }

  // =============================================================================
  // CHAT - CHANNEL MEMBERS
  // =============================================================================

  async getChatChannelMember(channelId: string, userId: string): Promise<ChatChannelMember | undefined> {
    const [member] = await db.select().from(chatChannelMembers).where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))
    );
    return member || undefined;
  }

  async getChatChannelMembers(channelId: string): Promise<(ChatChannelMember & { user: User })[]> {
    const members = await db.select().from(chatChannelMembers).where(eq(chatChannelMembers.channelId, channelId));
    if (members.length === 0) return [];

    const userIds = members.map(m => m.userId);
    const userRows = await db.select().from(users).where(inArray(users.id, userIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    return members.map(m => ({
      ...m,
      user: userMap.get(m.userId)!,
    })).filter(m => m.user);
  }

  async getUserChatChannels(tenantId: string, userId: string): Promise<(ChatChannelMember & { channel: ChatChannel })[]> {
    const memberships = await db.select().from(chatChannelMembers).where(
      and(eq(chatChannelMembers.tenantId, tenantId), eq(chatChannelMembers.userId, userId))
    );
    if (memberships.length === 0) return [];

    const channelIds = memberships.map(m => m.channelId);
    const channelRows = await db.select().from(chatChannels).where(inArray(chatChannels.id, channelIds));
    const channelMap = new Map(channelRows.map(c => [c.id, c]));

    return memberships.map(m => ({
      ...m,
      channel: channelMap.get(m.channelId)!,
    })).filter(m => m.channel);
  }

  async addChatChannelMember(member: InsertChatChannelMember): Promise<ChatChannelMember> {
    const [newMember] = await db.insert(chatChannelMembers).values(member).returning();
    return newMember;
  }

  async removeChatChannelMember(channelId: string, userId: string): Promise<void> {
    await db.delete(chatChannelMembers).where(
      and(eq(chatChannelMembers.channelId, channelId), eq(chatChannelMembers.userId, userId))
    );
  }

  async validateChatRoomAccess(targetType: 'channel' | 'dm', targetId: string, userId: string, tenantId: string): Promise<boolean> {
    if (targetType === 'channel') {
      const channel = await this.getChatChannel(targetId);
      if (!channel || channel.tenantId !== tenantId) return false;
      if (!channel.isPrivate) return true; // Public channels are accessible to all tenant users
      const member = await this.getChatChannelMember(targetId, userId);
      return !!member;
    } else {
      const thread = await this.getChatDmThread(targetId);
      if (!thread || thread.tenantId !== tenantId) return false;
      const members = await db.select().from(chatDmMembers).where(
        and(eq(chatDmMembers.dmThreadId, targetId), eq(chatDmMembers.userId, userId))
      );
      return members.length > 0;
    }
  }

  // =============================================================================
  // CHAT - DM THREADS
  // =============================================================================

  async getChatDmThread(id: string): Promise<ChatDmThread | undefined> {
    const [thread] = await db.select().from(chatDmThreads).where(eq(chatDmThreads.id, id));
    return thread || undefined;
  }

  async getChatDmThreadByMembers(tenantId: string, userIds: string[]): Promise<ChatDmThread | undefined> {
    if (userIds.length < 2) return undefined;

    const sortedUserIds = [...userIds].sort();
    const threads = await db.select().from(chatDmThreads).where(eq(chatDmThreads.tenantId, tenantId));

    for (const thread of threads) {
      const members = await db.select().from(chatDmMembers).where(eq(chatDmMembers.dmThreadId, thread.id));
      const memberUserIds = members.map(m => m.userId).sort();
      
      if (memberUserIds.length === sortedUserIds.length && memberUserIds.every((id, i) => id === sortedUserIds[i])) {
        return thread;
      }
    }
    return undefined;
  }

  async getUserChatDmThreads(tenantId: string, userId: string): Promise<(ChatDmThread & { members: (ChatDmMember & { user: User })[] })[]> {
    const memberships = await db.select().from(chatDmMembers).where(
      and(eq(chatDmMembers.tenantId, tenantId), eq(chatDmMembers.userId, userId))
    );
    if (memberships.length === 0) return [];

    const threadIds = memberships.map(m => m.dmThreadId);
    const threads = await db.select().from(chatDmThreads).where(inArray(chatDmThreads.id, threadIds));

    const allMembers = await db.select().from(chatDmMembers).where(inArray(chatDmMembers.dmThreadId, threadIds));
    const allUserIds = [...new Set(allMembers.map(m => m.userId))];
    const userRows = await db.select().from(users).where(inArray(users.id, allUserIds));
    const userMap = new Map(userRows.map(u => [u.id, u]));

    return threads.map(thread => ({
      ...thread,
      members: allMembers
        .filter(m => m.dmThreadId === thread.id)
        .map(m => ({ ...m, user: userMap.get(m.userId)! }))
        .filter(m => m.user),
    }));
  }

  async getChatDmParticipants(dmThreadId: string): Promise<ChatDmMember[]> {
    return await db.select().from(chatDmMembers).where(eq(chatDmMembers.dmThreadId, dmThreadId));
  }

  async createChatDmThread(thread: InsertChatDmThread, memberUserIds: string[]): Promise<ChatDmThread> {
    const [newThread] = await db.insert(chatDmThreads).values(thread).returning();
    
    for (const userId of memberUserIds) {
      await db.insert(chatDmMembers).values({
        tenantId: thread.tenantId,
        dmThreadId: newThread.id,
        userId,
      });
    }
    
    return newThread;
  }

  // =============================================================================
  // CHAT - MESSAGES
  // =============================================================================

  async getChatMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id));
    return message || undefined;
  }

  async getChatMessages(targetType: 'channel' | 'dm', targetId: string, limit = 50, before?: Date): Promise<(ChatMessage & { author: User })[]> {
    let query = db.select().from(chatMessages);

    if (targetType === 'channel') {
      query = query.where(
        before 
          ? and(eq(chatMessages.channelId, targetId), lte(chatMessages.createdAt, before))
          : eq(chatMessages.channelId, targetId)
      ) as typeof query;
    } else {
      query = query.where(
        before 
          ? and(eq(chatMessages.dmThreadId, targetId), lte(chatMessages.createdAt, before))
          : eq(chatMessages.dmThreadId, targetId)
      ) as typeof query;
    }

    const messages = await query.orderBy(desc(chatMessages.createdAt)).limit(limit);
    if (messages.length === 0) return [];

    const authorIds = [...new Set(messages.map(m => m.authorUserId))];
    const authorRows = await db.select().from(users).where(inArray(users.id, authorIds));
    const authorMap = new Map(authorRows.map(u => [u.id, u]));

    return messages
      .map(m => ({ ...m, author: authorMap.get(m.authorUserId)! }))
      .filter(m => m.author)
      .reverse();
  }

  async createChatMessage(message: InsertChatMessage): Promise<ChatMessage> {
    const [newMessage] = await db.insert(chatMessages).values(message).returning();
    return newMessage;
  }

  async updateChatMessage(id: string, updates: Partial<InsertChatMessage>): Promise<ChatMessage | undefined> {
    const [updated] = await db.update(chatMessages).set({
      ...updates,
      editedAt: new Date(),
    }).where(eq(chatMessages.id, id)).returning();
    return updated || undefined;
  }

  async deleteChatMessage(id: string): Promise<void> {
    await db.update(chatMessages).set({ deletedAt: new Date() }).where(eq(chatMessages.id, id));
  }

  async searchChatMessages(tenantId: string, userId: string, options: {
    query: string;
    channelId?: string;
    dmThreadId?: string;
    fromUserId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ messages: any[]; total: number }> {
    const { query, channelId, dmThreadId, fromUserId, limit = 50, offset = 0 } = options;
    
    const accessibleChannelIds = (await this.getUserChatChannels(tenantId, userId)).map(m => m.channelId);
    const accessibleDmIds = (await this.getUserChatDmThreads(tenantId, userId)).map(dm => dm.id);

    const conditions = [
      eq(chatMessages.tenantId, tenantId),
      isNull(chatMessages.deletedAt),
      isNull(chatMessages.archivedAt),
      ilike(chatMessages.body, `%${query}%`),
    ];

    if (channelId) {
      if (!accessibleChannelIds.includes(channelId)) {
        return { messages: [], total: 0 };
      }
      conditions.push(eq(chatMessages.channelId, channelId));
    } else if (dmThreadId) {
      if (!accessibleDmIds.includes(dmThreadId)) {
        return { messages: [], total: 0 };
      }
      conditions.push(eq(chatMessages.dmThreadId, dmThreadId));
    } else {
      const accessConditions = [];
      if (accessibleChannelIds.length > 0) {
        accessConditions.push(inArray(chatMessages.channelId, accessibleChannelIds));
      }
      if (accessibleDmIds.length > 0) {
        accessConditions.push(inArray(chatMessages.dmThreadId, accessibleDmIds));
      }
      if (accessConditions.length > 0) {
        conditions.push(or(...accessConditions)!);
      } else {
        return { messages: [], total: 0 };
      }
    }

    if (fromUserId) {
      conditions.push(eq(chatMessages.authorUserId, fromUserId));
    }

    const [countResult] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(...conditions));

    const messages = await db.select({
      id: chatMessages.id,
      body: chatMessages.body,
      createdAt: chatMessages.createdAt,
      editedAt: chatMessages.editedAt,
      channelId: chatMessages.channelId,
      dmThreadId: chatMessages.dmThreadId,
      authorId: chatMessages.authorUserId,
      authorEmail: users.email,
      authorFirstName: users.firstName,
      authorLastName: users.lastName,
      channelName: chatChannels.name,
    })
    .from(chatMessages)
    .leftJoin(users, eq(chatMessages.authorUserId, users.id))
    .leftJoin(chatChannels, eq(chatMessages.channelId, chatChannels.id))
    .where(and(...conditions))
    .orderBy(desc(chatMessages.createdAt))
    .limit(limit)
    .offset(offset);

    return {
      messages: messages.map(m => ({
        id: m.id,
        body: m.body,
        createdAt: m.createdAt,
        editedAt: m.editedAt,
        channelId: m.channelId,
        dmThreadId: m.dmThreadId,
        channelName: m.channelName,
        author: {
          id: m.authorId,
          email: m.authorEmail,
          displayName: `${m.authorFirstName || ""} ${m.authorLastName || ""}`.trim() || m.authorEmail,
        },
      })),
      total: countResult?.count || 0,
    };
  }

  // Chat - Attachments
  async createChatAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment> {
    const [newAttachment] = await db.insert(chatAttachments).values(attachment).returning();
    return newAttachment;
  }

  async getChatAttachmentsByMessageId(messageId: string): Promise<ChatAttachment[]> {
    return db.select().from(chatAttachments).where(eq(chatAttachments.messageId, messageId));
  }

  async getChatAttachment(id: string): Promise<ChatAttachment | undefined> {
    const [attachment] = await db.select().from(chatAttachments).where(eq(chatAttachments.id, id));
    return attachment || undefined;
  }

  async getChatAttachmentsByTenantAndIds(tenantId: string, ids: string[]): Promise<ChatAttachment[]> {
    if (ids.length === 0) return [];
    return db.select().from(chatAttachments).where(
      and(eq(chatAttachments.tenantId, tenantId), inArray(chatAttachments.id, ids))
    );
  }

  async linkChatAttachmentsToMessage(messageId: string, attachmentIds: string[]): Promise<void> {
    if (attachmentIds.length === 0) return;
    await db.update(chatAttachments)
      .set({ messageId })
      .where(inArray(chatAttachments.id, attachmentIds));
  }

  // Chat - Read Tracking
  async upsertChatRead(tenantId: string, userId: string, targetType: "channel" | "dm", targetId: string, lastReadMessageId: string): Promise<{ lastReadAt: Date }> {
    const lastReadAt = new Date();
    if (targetType === "channel") {
      await db.insert(chatReads)
        .values({
          tenantId,
          userId,
          channelId: targetId,
          lastReadMessageId,
          lastReadAt,
        })
        .onConflictDoUpdate({
          target: [chatReads.userId, chatReads.channelId],
          set: {
            lastReadMessageId,
            lastReadAt,
          },
        });
    } else {
      await db.insert(chatReads)
        .values({
          tenantId,
          userId,
          dmThreadId: targetId,
          lastReadMessageId,
          lastReadAt,
        })
        .onConflictDoUpdate({
          target: [chatReads.userId, chatReads.dmThreadId],
          set: {
            lastReadMessageId,
            lastReadAt,
          },
        });
    }
    return { lastReadAt };
  }

  async getChatReadForChannel(userId: string, channelId: string): Promise<{ lastReadMessageId: string | null } | undefined> {
    const [read] = await db.select({ lastReadMessageId: chatReads.lastReadMessageId })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.channelId, channelId)));
    return read;
  }

  async getChatReadForDm(userId: string, dmThreadId: string): Promise<{ lastReadMessageId: string | null } | undefined> {
    const [read] = await db.select({ lastReadMessageId: chatReads.lastReadMessageId })
      .from(chatReads)
      .where(and(eq(chatReads.userId, userId), eq(chatReads.dmThreadId, dmThreadId)));
    return read;
  }

  async getUnreadCountForChannel(userId: string, channelId: string): Promise<number> {
    const readRecord = await this.getChatReadForChannel(userId, channelId);
    
    if (!readRecord?.lastReadMessageId) {
      // No read record - count all messages in channel
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(eq(chatMessages.channelId, channelId), isNull(chatMessages.deletedAt)));
      return result?.count ?? 0;
    }

    // Get the timestamp of the last read message
    const [lastReadMsg] = await db.select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, readRecord.lastReadMessageId));

    if (!lastReadMsg) return 0;

    // Count messages after the last read message
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.channelId, channelId),
        isNull(chatMessages.deletedAt),
        gt(chatMessages.createdAt, lastReadMsg.createdAt)
      ));
    return result?.count ?? 0;
  }

  async getUnreadCountForDm(userId: string, dmThreadId: string): Promise<number> {
    const readRecord = await this.getChatReadForDm(userId, dmThreadId);
    
    if (!readRecord?.lastReadMessageId) {
      // No read record - count all messages in thread
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(eq(chatMessages.dmThreadId, dmThreadId), isNull(chatMessages.deletedAt)));
      return result?.count ?? 0;
    }

    // Get the timestamp of the last read message
    const [lastReadMsg] = await db.select({ createdAt: chatMessages.createdAt })
      .from(chatMessages)
      .where(eq(chatMessages.id, readRecord.lastReadMessageId));

    if (!lastReadMsg) return 0;

    // Count messages after the last read message
    const [result] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(and(
        eq(chatMessages.dmThreadId, dmThreadId),
        isNull(chatMessages.deletedAt),
        gt(chatMessages.createdAt, lastReadMsg.createdAt)
      ));
    return result?.count ?? 0;
  }

  // =============================================================================
  // Chat - Diagnostics (Super Admin)
  // =============================================================================

  async getChatDiagnostics(): Promise<{
    nullTenantCounts: {
      channels: number;
      channelMembers: number;
      dmThreads: number;
      dmMembers: number;
      messages: number;
      attachments: number;
    };
    orphanedChannels: number;
    underMemberedDmThreads: number;
  }> {
    // Count rows with null tenantId in chat tables
    // Note: Schema requires tenantId NOT NULL, so these counts should be 0
    // This is for detecting data corruption or migration issues
    
    const [channelsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatChannels)
      .where(isNull(chatChannels.tenantId));
    
    const [channelMembersNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatChannelMembers)
      .where(isNull(chatChannelMembers.tenantId));
    
    const [dmThreadsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatDmThreads)
      .where(isNull(chatDmThreads.tenantId));
    
    const [dmMembersNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatDmMembers)
      .where(isNull(chatDmMembers.tenantId));
    
    const [messagesNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatMessages)
      .where(isNull(chatMessages.tenantId));
    
    const [attachmentsNull] = await db.select({ count: sql<number>`count(*)::int` })
      .from(chatAttachments)
      .where(isNull(chatAttachments.tenantId));

    // Count channels without any members
    const orphanedChannelsResult = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM chat_channels c
      WHERE NOT EXISTS (SELECT 1 FROM chat_channel_members m WHERE m.channel_id = c.id)
    `);
    const orphanedChannels = (orphanedChannelsResult.rows[0] as any)?.count ?? 0;

    // Count DM threads with fewer than 2 members
    const underMemberedResult = await db.execute(sql`
      SELECT COUNT(*)::int as count FROM (
        SELECT dm.id, COUNT(m.id) as member_count
        FROM chat_dm_threads dm
        LEFT JOIN chat_dm_members m ON m.dm_thread_id = dm.id
        GROUP BY dm.id
        HAVING COUNT(m.id) < 2
      ) sub
    `);
    const underMemberedDmThreads = (underMemberedResult.rows[0] as any)?.count ?? 0;

    return {
      nullTenantCounts: {
        channels: channelsNull?.count ?? 0,
        channelMembers: channelMembersNull?.count ?? 0,
        dmThreads: dmThreadsNull?.count ?? 0,
        dmMembers: dmMembersNull?.count ?? 0,
        messages: messagesNull?.count ?? 0,
        attachments: attachmentsNull?.count ?? 0,
      },
      orphanedChannels,
      underMemberedDmThreads,
    };
  }

  // =============================================================================
  // Error Logs - Super Admin Monitoring
  // =============================================================================

  async createErrorLog(log: InsertErrorLog): Promise<ErrorLog> {
    try {
      const [errorLog] = await db.insert(errorLogs).values(log).returning();
      return errorLog;
    } catch (error: any) {
      // Gracefully handle missing table - log to console but don't throw
      if (error?.message?.includes("does not exist") || error?.code === "42P01") {
        console.warn("[storage] error_logs table not found - error not persisted:", log.message?.slice(0, 100));
        // Return a synthetic log object so callers don't break
        // Use special UUID format that's clearly not a real DB record
        return {
          id: "00000000-0000-0000-0000-000000000000",
          requestId: log.requestId,
          tenantId: log.tenantId ?? null,
          userId: log.userId ?? null,
          method: log.method,
          path: log.path,
          status: log.status,
          errorName: log.errorName ?? null,
          message: log.message,
          stack: log.stack ?? null,
          dbCode: log.dbCode ?? null,
          dbConstraint: log.dbConstraint ?? null,
          meta: { ...((log.meta as Record<string, unknown>) ?? {}), _notPersisted: true },
          environment: log.environment ?? "development",
          resolved: false,
          createdAt: new Date(),
        };
      }
      throw error;
    }
  }

  async getErrorLogs(filters?: {
    tenantId?: string;
    status?: number;
    startDate?: Date;
    endDate?: Date;
    pathContains?: string;
    requestId?: string;
    resolved?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: ErrorLog[]; total: number }> {
    try {
      const conditions: any[] = [];
      
      if (filters?.tenantId) {
        conditions.push(eq(errorLogs.tenantId, filters.tenantId));
      }
      if (filters?.status !== undefined) {
        conditions.push(eq(errorLogs.status, filters.status));
      }
      if (filters?.startDate) {
        conditions.push(gte(errorLogs.createdAt, filters.startDate));
      }
      if (filters?.endDate) {
        conditions.push(lte(errorLogs.createdAt, filters.endDate));
      }
      if (filters?.pathContains) {
        conditions.push(ilike(errorLogs.path, `%${filters.pathContains}%`));
      }
      if (filters?.requestId) {
        conditions.push(eq(errorLogs.requestId, filters.requestId));
      }
      if (filters?.resolved !== undefined) {
        conditions.push(eq(errorLogs.resolved, filters.resolved));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const limit = filters?.limit ?? 50;
      const offset = filters?.offset ?? 0;

      const [logs, countResult] = await Promise.all([
        db.select()
          .from(errorLogs)
          .where(whereClause)
          .orderBy(desc(errorLogs.createdAt))
          .limit(limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(errorLogs)
          .where(whereClause)
      ]);

      return { logs, total: countResult[0]?.count ?? 0 };
    } catch (error: any) {
      // Gracefully handle missing table
      if (error?.message?.includes("does not exist") || error?.code === "42P01") {
        console.warn("[storage] error_logs table not found - returning empty list");
        return { logs: [], total: 0 };
      }
      throw error;
    }
  }

  async getErrorLog(id: string): Promise<ErrorLog | undefined> {
    try {
      const [log] = await db.select().from(errorLogs).where(eq(errorLogs.id, id));
      return log || undefined;
    } catch (error: any) {
      // Gracefully handle missing table
      if (error?.message?.includes("does not exist") || error?.code === "42P01") {
        console.warn("[storage] error_logs table not found - cannot fetch log");
        return undefined;
      }
      throw error;
    }
  }

  async markErrorLogResolved(id: string, resolved: boolean): Promise<ErrorLog | undefined> {
    try {
      const [log] = await db.update(errorLogs)
        .set({ resolved })
        .where(eq(errorLogs.id, id))
        .returning();
      return log || undefined;
    } catch (error: any) {
      // Gracefully handle missing table
      if (error?.message?.includes("does not exist") || error?.code === "42P01") {
        console.warn("[storage] error_logs table not found - cannot update log");
        return undefined;
      }
      throw error;
    }
  }

  // =============================================================================
  // NOTIFICATIONS
  // =============================================================================

  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [created] = await db.insert(notifications).values(notification).returning();
    return created;
  }

  async getNotificationsByUser(userId: string, tenantId: string | null, options?: { unreadOnly?: boolean; limit?: number; offset?: number }): Promise<Notification[]> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options || {};
    
    try {
      const conditions = [eq(notifications.userId, userId)];
      
      // Tenant scoping: include notifications where tenantId matches OR is null (system notifications)
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      if (unreadOnly) {
        conditions.push(isNull(notifications.readAt));
      }
      
      return db.select()
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Handle missing table or column (production migration issue)
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] notifications query failed (schema issue) - returning empty array:", message);
        return [];
      }
      throw error;
    }
  }

  async getUnreadNotificationCount(userId: string, tenantId: string | null): Promise<number> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      ];
      
      // Tenant scoping: include notifications where tenantId matches OR is null
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      const [result] = await db.select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(...conditions));
      return result?.count ?? 0;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] unread count query failed (schema issue) - returning 0:", message);
        return 0;
      }
      throw error;
    }
  }

  async markNotificationRead(id: string, userId: string, tenantId: string | null): Promise<Notification | undefined> {
    try {
      const conditions = [
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ];
      
      // Tenant scoping for security
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      const [updated] = await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions))
        .returning();
      return updated || undefined;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] markNotificationRead failed (schema issue):", message);
        return undefined;
      }
      throw error;
    }
  }

  async markAllNotificationsRead(userId: string, tenantId: string | null): Promise<void> {
    try {
      const conditions = [
        eq(notifications.userId, userId),
        isNull(notifications.readAt)
      ];
      
      // Tenant scoping
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
      
      await db.update(notifications)
        .set({ readAt: new Date() })
        .where(and(...conditions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] markAllNotificationsRead failed (schema issue):", message);
        return;
      }
      throw error;
    }
  }

  async deleteNotification(id: string, userId: string, tenantId: string | null): Promise<void> {
    try {
      const conditions = [
        eq(notifications.id, id),
        eq(notifications.userId, userId)
      ];
      
      // Tenant scoping for security
      if (tenantId) {
        conditions.push(
          sql`(${notifications.tenantId} = ${tenantId} OR ${notifications.tenantId} IS NULL)`
        );
      }
    
      await db.delete(notifications)
        .where(and(...conditions));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("does not exist") || message.includes("column") && message.includes("not")) {
        console.warn("[storage] deleteNotification failed (schema issue):", message);
        return;
      }
      throw error;
    }
  }

  // =============================================================================
  // NOTIFICATION PREFERENCES
  // =============================================================================

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences | undefined> {
    try {
      const [prefs] = await db.select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, userId));
      return prefs || undefined;
    } catch (error: unknown) {
      // Handle case where table doesn't exist in production (migration not run)
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("relation") && message.includes("does not exist")) {
        console.warn("[storage] notification_preferences table does not exist - returning undefined");
        return undefined;
      }
      throw error;
    }
  }

  async upsertNotificationPreferences(userId: string, prefs: Partial<InsertNotificationPreferences>): Promise<NotificationPreferences> {
    try {
      const existing = await this.getNotificationPreferences(userId);
      
      if (existing) {
        const [updated] = await db.update(notificationPreferences)
          .set({ ...prefs, updatedAt: new Date() })
          .where(eq(notificationPreferences.userId, userId))
          .returning();
        return updated;
      }
      
      const [created] = await db.insert(notificationPreferences)
        .values({ userId, ...prefs })
        .returning();
      return created;
    } catch (error: unknown) {
      // Handle case where table doesn't exist in production (migration not run)
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("relation") && message.includes("does not exist")) {
        console.warn("[storage] notification_preferences table does not exist - returning defaults");
        // Return a synthetic default preferences object
        return {
          id: "default",
          tenantId: prefs.tenantId || null,
          userId,
          taskDeadline: true,
          taskAssigned: true,
          taskCompleted: true,
          commentAdded: true,
          commentMention: true,
          projectUpdate: true,
          projectMemberAdded: true,
          taskStatusChanged: true,
          emailEnabled: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
      throw error;
    }
  }

  async invalidateUserSessions(userId: string, exceptSessionId?: string): Promise<void> {
    try {
      // Delete all sessions for this user except the current one
      // Sessions store userId in the sess JSON column as sess->'passport'->>'user'
      if (exceptSessionId) {
        await db.execute(
          sql`DELETE FROM user_sessions WHERE sess->'passport'->>'user' = ${userId} AND sid != ${exceptSessionId}`
        );
        console.log(`[storage] Invalidated sessions for user ${userId} (except ${exceptSessionId})`);
      } else {
        await db.execute(
          sql`DELETE FROM user_sessions WHERE sess->'passport'->>'user' = ${userId}`
        );
        console.log(`[storage] Invalidated all sessions for user ${userId}`);
      }
    } catch (error) {
      // Session invalidation is non-critical, log but don't throw
      console.warn(`[storage] Failed to invalidate sessions for user ${userId}:`, error);
    }
  }
}

export const storage = new DatabaseStorage();
