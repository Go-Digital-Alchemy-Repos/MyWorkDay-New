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
  type Subtask, type InsertSubtask,
  type Tag, type InsertTag,
  type TaskTag, type InsertTaskTag,
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
  users, workspaces, workspaceMembers, teams, teamMembers,
  projects, projectMembers, sections, tasks, taskAssignees,
  subtasks, tags, taskTags, comments, activityLog, taskAttachments,
  clients, clientContacts, clientInvites, clientUserAccess,
  timeEntries, activeTimers,
  invitations, appSettings, tenants, tenantSettings, personalTaskSections,
  UserRole,
} from "@shared/schema";
import crypto from "crypto";
import { db } from "./db";
import { eq, and, desc, asc, inArray, gte, lte, sql } from "drizzle-orm";
import { encryptValue, decryptValue } from "./lib/encryption";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUser(userId: string): Promise<Workspace[]>;
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
  
  getComment(id: string): Promise<Comment | undefined>;
  getCommentsByTask(taskId: string): Promise<(Comment & { user?: User })[]>;
  createComment(comment: InsertComment): Promise<Comment>;
  updateComment(id: string, comment: Partial<InsertComment>): Promise<Comment | undefined>;
  deleteComment(id: string): Promise<void>;
  
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
  getActivityLogByEntity(entityType: string, entityId: string): Promise<ActivityLog[]>;
  
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
  getClientsByTenant(tenantId: string, workspaceId: string): Promise<ClientWithContacts[]>;
  createClientWithTenant(client: InsertClient, tenantId: string): Promise<Client>;
  updateClientWithTenant(id: string, tenantId: string, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClientWithTenant(id: string, tenantId: string): Promise<boolean>;

  getProjectByIdAndTenant(id: string, tenantId: string): Promise<Project | undefined>;
  getProjectsByTenant(tenantId: string, workspaceId: string): Promise<Project[]>;
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
  getUsersByTenant(tenantId: string): Promise<User[]>;

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
    expiresInDays?: number;
    createdByUserId: string;
    workspaceId: string;
  }): Promise<{ invitation: Invitation; token: string }>;

  // Personal Task Sections (My Tasks organization)
  getPersonalTaskSection(id: string): Promise<PersonalTaskSection | undefined>;
  getPersonalTaskSections(userId: string): Promise<PersonalTaskSection[]>;
  createPersonalTaskSection(section: InsertPersonalTaskSection): Promise<PersonalTaskSection>;
  updatePersonalTaskSection(id: string, section: Partial<InsertPersonalTaskSection>): Promise<PersonalTaskSection | undefined>;
  deletePersonalTaskSection(id: string): Promise<void>;
  clearPersonalSectionFromTasks(sectionId: string): Promise<void>;
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

  async createWorkspace(insertWorkspace: InsertWorkspace): Promise<Workspace> {
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
    const taskTagsList = await this.getTaskTags(id);
    const subtasksList = await this.getSubtasksByTask(id);
    const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
    const project = task.projectId ? await this.getProject(task.projectId) : undefined;
    
    const childTasksList = await this.getChildTasks(id);

    return {
      ...task,
      assignees,
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
      const taskTagsList = await this.getTaskTags(task.id);
      const section = task.sectionId ? await this.getSection(task.sectionId) : undefined;
      const project = task.projectId ? await this.getProject(task.projectId) : undefined;
      
      result.push({
        ...task,
        assignees,
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

  async createComment(insertComment: InsertComment): Promise<Comment> {
    const [comment] = await db.insert(comments).values(insertComment).returning();
    return comment;
  }

  async updateComment(id: string, comment: Partial<InsertComment>): Promise<Comment | undefined> {
    const [updated] = await db.update(comments).set({ ...comment, updatedAt: new Date() }).where(eq(comments.id, id)).returning();
    return updated || undefined;
  }

  async deleteComment(id: string): Promise<void> {
    await db.delete(comments).where(eq(comments.id, id));
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

  async getClientsByTenant(tenantId: string, workspaceId: string): Promise<ClientWithContacts[]> {
    const clientsList = await db.select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), eq(clients.workspaceId, workspaceId)))
      .orderBy(asc(clients.companyName));
    
    const result: ClientWithContacts[] = [];
    for (const client of clientsList) {
      const contacts = await this.getContactsByClient(client.id);
      const clientProjects = await this.getProjectsByClient(client.id);
      result.push({ ...client, contacts, projects: clientProjects });
    }
    return result;
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

  async getProjectsByTenant(tenantId: string, workspaceId: string): Promise<Project[]> {
    return db.select()
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.workspaceId, workspaceId)))
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

  async getUsersByTenant(tenantId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.tenantId, tenantId));
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
      role: UserRole.ADMIN,
      tokenHash,
      status: "pending",
      expiresAt,
      createdByUserId: data.createdByUserId,
    }).returning();

    return { invitation, token };
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
  // N+1 OPTIMIZATION: BATCH FETCH METHODS
  // =============================================================================

  /**
   * Get open task counts for multiple projects in a single query.
   * Used to avoid N+1 when listing projects with includeCounts=true.
   */
  async getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();
    
    const result = await db.select({
      projectId: tasks.projectId,
      count: sql<number>`count(*)::int`,
    })
      .from(tasks)
      .where(and(
        inArray(tasks.projectId, projectIds),
        sql`${tasks.status} != 'done'`
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
   * Used to avoid N+1 in analytics/forecast summary endpoints.
   * Returns a lightweight task structure (not full TaskWithRelations).
   */
  async getTasksByProjectIds(projectIds: string[]): Promise<Map<string, Array<{
    id: string;
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

    return allTenants.map(tenant => ({
      ...tenant,
      settings: settingsMap.get(tenant.id) || null,
      userCount: userCountMap.get(tenant.id) || 0,
    }));
  }
}

export const storage = new DatabaseStorage();
