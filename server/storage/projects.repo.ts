import {
  type Project, type InsertProject,
  type ProjectMember, type InsertProjectMember,
  type Section, type InsertSection,
  type User,
  type SectionWithTasks, type TaskWithRelations,
  projects, projectMembers, sections, tasks, users, hiddenProjects,
} from "@shared/schema";
import { db } from "../db";
import { eq, and, desc, asc, sql, inArray, notInArray } from "drizzle-orm";
import { assertInsertHasTenantId } from "../lib/errors";

export class ProjectsRepository {
  private getUser: (id: string) => Promise<User | undefined>;
  private getTaskWithRelations: (id: string) => Promise<TaskWithRelations | undefined>;
  private getProjectsByTenant: (tenantId: string, workspaceId?: string) => Promise<Project[]>;

  constructor(deps: {
    getUser: (id: string) => Promise<User | undefined>;
    getTaskWithRelations: (id: string) => Promise<TaskWithRelations | undefined>;
    getProjectsByTenant: (tenantId: string, workspaceId?: string) => Promise<Project[]>;
  }) {
    this.getUser = deps.getUser;
    this.getTaskWithRelations = deps.getTaskWithRelations;
    this.getProjectsByTenant = deps.getProjectsByTenant;
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
    assertInsertHasTenantId(insertProject, "projects");
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

  async getProjectsByClient(clientId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.clientId, clientId)).orderBy(desc(projects.createdAt));
  }

  async getProjectByIdAndTenant(id: string, tenantId: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects)
      .where(and(eq(projects.id, id), eq(projects.tenantId, tenantId)));
    return project || undefined;
  }

  async getProjectsByTenantInternal(tenantId: string, _workspaceId?: string): Promise<Project[]> {
    return db.select().from(projects)
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

  async getOpenTaskCountsByProjectIds(projectIds: string[]): Promise<Map<string, number>> {
    if (projectIds.length === 0) return new Map();

    const result = await db.select({
      projectId: tasks.projectId,
      count: sql<number>`count(*)::int`
    })
      .from(tasks)
      .where(and(
        inArray(tasks.projectId, projectIds),
        sql`${tasks.status} != 'completed'`
      ))
      .groupBy(tasks.projectId);

    const countMap = new Map<string, number>();
    for (const row of result) {
      if (row.projectId) {
        countMap.set(row.projectId, row.count);
      }
    }
    return countMap;
  }

  async getTasksByProjectIds(projectIds: string[]): Promise<Map<string, Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    dueDate: Date | null;
    assignees: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
  }>>> {
    if (projectIds.length === 0) return new Map();

    const tasksRows = await db.select()
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds));

    const taskIds = tasksRows.map(t => t.id);
    const { taskAssignees } = await import("@shared/schema");
    const assignees = taskIds.length > 0
      ? await db.select().from(taskAssignees).where(inArray(taskAssignees.taskId, taskIds))
      : [];

    const userIds = [...new Set(assignees.map(a => a.userId))];
    const usersData = userIds.length > 0
      ? await db.select().from(users).where(inArray(users.id, userIds))
      : [];
    const usersMap = new Map(usersData.map(u => [u.id, u]));

    const assigneesByTaskId = new Map<string, typeof assignees>();
    for (const a of assignees) {
      if (!assigneesByTaskId.has(a.taskId)) {
        assigneesByTaskId.set(a.taskId, []);
      }
      assigneesByTaskId.get(a.taskId)!.push(a);
    }

    const resultMap = new Map<string, Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      dueDate: Date | null;
      assignees: Array<{ userId: string; user?: { id: string; name: string; email: string } }>;
    }>>();

    for (const t of tasksRows) {
      if (!t.projectId) continue;
      if (!resultMap.has(t.projectId)) {
        resultMap.set(t.projectId, []);
      }
      const taskAssigneesData = assigneesByTaskId.get(t.id) || [];
      resultMap.get(t.projectId)!.push({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        assignees: taskAssigneesData.map(a => {
          const u = usersMap.get(a.userId);
          return {
            userId: a.userId,
            user: u ? { id: u.id, name: u.name || u.email, email: u.email } : undefined
          };
        })
      });
    }
    return resultMap;
  }
}
