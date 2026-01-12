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
  users, workspaces, workspaceMembers, teams, teamMembers,
  projects, projectMembers, sections, tasks, taskAssignees,
  subtasks, tags, taskTags, comments, activityLog, taskAttachments,
  clients, clientContacts, clientInvites,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, inArray, gte, lte, sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getWorkspace(id: string): Promise<Workspace | undefined>;
  getWorkspacesByUser(userId: string): Promise<Workspace[]>;
  createWorkspace(workspace: InsertWorkspace): Promise<Workspace>;
  
  getWorkspaceMembers(workspaceId: string): Promise<(WorkspaceMember & { user?: User })[]>;
  addWorkspaceMember(member: InsertWorkspaceMember): Promise<WorkspaceMember>;
  
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByWorkspace(workspaceId: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  
  getTeamMembers(teamId: string): Promise<(TeamMember & { user?: User })[]>;
  addTeamMember(member: InsertTeamMember): Promise<TeamMember>;
  
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByWorkspace(workspaceId: string): Promise<Project[]>;
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

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project || undefined;
  }

  async getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(desc(projects.createdAt));
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
          sql`${tasks.parentTaskId} IS NULL`
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
    const project = await this.getProject(task.projectId);
    
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
      const project = await this.getProject(task.projectId);
      
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
      .where(eq(tasks.projectId, projectId))
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
    const taskIds = assigneeRecords.map(a => a.taskId);
    if (taskIds.length === 0) return [];

    const result: TaskWithRelations[] = [];
    for (const taskId of taskIds) {
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
      : await db.select().from(tasks).where(and(
          eq(tasks.projectId, insertTask.projectId),
          sql`${tasks.parentTaskId} IS NULL`
        ));
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

  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return db.select()
      .from(projects)
      .where(eq(projects.clientId, clientId))
      .orderBy(asc(projects.name));
  }
}

export const storage = new DatabaseStorage();
