import { Router, Request } from "express";
import { DatabaseStorage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { UserRole, TaskWithRelations } from "@shared/schema";

const router = Router();
const storage = new DatabaseStorage();

function isTaskOverdue(task: TaskWithRelations): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function isTaskDueToday(task: TaskWithRelations): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate.getTime() === today.getTime();
}

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

function getCurrentWorkspaceId(_req: Request): string {
  return "demo-workspace-id";
}

function isSuperUser(req: Request): boolean {
  return (req.user as any)?.role === UserRole.SUPER_USER;
}

router.get("/projects", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const includeCounts = req.query.includeCounts === "true";
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;
    const teamId = typeof req.query.teamId === "string" ? req.query.teamId : undefined;
    const search = typeof req.query.search === "string" ? req.query.search : undefined;

    let projects;
    
    if (tenantId) {
      projects = await storage.getProjectsByTenant(tenantId, workspaceId);
    } else if (isSuperUser(req)) {
      projects = await storage.getProjectsByWorkspace(workspaceId);
    } else {
      console.error(`[v1/projects] User ${getCurrentUserId(req)} has no tenantId`);
      return res.status(500).json({ error: "User tenant not configured" });
    }

    let filteredProjects = projects;
    
    if (status && status !== "all") {
      filteredProjects = filteredProjects.filter(p => p.status === status);
    }
    
    if (clientId && clientId !== "all") {
      filteredProjects = filteredProjects.filter(p => p.clientId === clientId);
    }
    
    if (teamId && teamId !== "all") {
      filteredProjects = filteredProjects.filter(p => p.teamId === teamId);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProjects = filteredProjects.filter(p => 
        p.name.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      );
    }

    if (includeCounts) {
      const projectsWithCounts = await Promise.all(
        filteredProjects.map(async (project) => {
          const tasks = await storage.getTasksByProject(project.id);
          const openTaskCount = tasks.filter(t => t.status !== "done").length;
          return {
            ...project,
            openTaskCount,
          };
        })
      );
      return res.json(projectsWithCounts);
    }

    return res.json(filteredProjects);
  } catch (error) {
    console.error("Error fetching projects for dashboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/analytics/summary", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);
    const onlyActive = req.query.onlyActive !== "false";
    const clientId = typeof req.query.clientId === "string" ? req.query.clientId : undefined;

    let projects;
    if (tenantId) {
      projects = await storage.getProjectsByTenant(tenantId, workspaceId);
    } else if (isSuperUser(req)) {
      projects = await storage.getProjectsByWorkspace(workspaceId);
    } else {
      return res.status(500).json({ error: "User tenant not configured" });
    }

    if (onlyActive) {
      projects = projects.filter(p => p.status === "active");
    }

    if (clientId) {
      projects = projects.filter(p => p.clientId === clientId);
    }

    let totalOpenTasks = 0;
    let totalOverdueTasks = 0;
    let totalDueToday = 0;
    let totalUnassignedOpen = 0;
    let projectsWithOverdue = 0;

    const perProject: Array<{
      projectId: string;
      openTasks: number;
      completedTasks: number;
      overdueTasks: number;
      dueToday: number;
      completionPercent: number;
      lastActivityAt: string | null;
    }> = [];

    for (const project of projects) {
      const tasks = await storage.getTasksByProject(project.id);
      
      const openTasks = tasks.filter(t => t.status !== "done");
      const completedTasks = tasks.filter(t => t.status === "done");
      const overdueTasks = tasks.filter(isTaskOverdue);
      const dueToday = tasks.filter(isTaskDueToday);
      const unassignedOpen = openTasks.filter(t => !t.assigneeId && (!t.assignees || t.assignees.length === 0));

      totalOpenTasks += openTasks.length;
      totalOverdueTasks += overdueTasks.length;
      totalDueToday += dueToday.length;
      totalUnassignedOpen += unassignedOpen.length;

      if (overdueTasks.length > 0) {
        projectsWithOverdue++;
      }

      const totalTasks = tasks.length;
      const completionPercent = totalTasks > 0 
        ? Math.round((completedTasks.length / totalTasks) * 100) 
        : 0;

      const lastActivityAt = tasks.length > 0 
        ? tasks.reduce((latest, t) => {
            const taskDate = new Date(t.updatedAt || t.createdAt);
            return taskDate > latest ? taskDate : latest;
          }, new Date(0)).toISOString()
        : null;

      perProject.push({
        projectId: project.id,
        openTasks: openTasks.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        dueToday: dueToday.length,
        completionPercent,
        lastActivityAt,
      });
    }

    return res.json({
      totals: {
        activeProjects: projects.length,
        projectsWithOverdue,
        tasksDueToday: totalDueToday,
        unassignedOpenTasks: totalUnassignedOpen,
        totalOpenTasks,
        totalOverdueTasks,
      },
      perProject,
    });
  } catch (error) {
    console.error("Error fetching projects analytics summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/projects/:projectId/analytics", async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = getEffectiveTenantId(req);

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const tasks = await storage.getTasksByProject(projectId);

    const openTasks = tasks.filter(t => t.status !== "done");
    const completedTasks = tasks.filter(t => t.status === "done");
    const overdueTasks = tasks.filter(isTaskOverdue);
    const dueTodayTasks = tasks.filter(isTaskDueToday);
    const unassignedOpenTasks = openTasks.filter(t => !t.assigneeId && (!t.assignees || t.assignees.length === 0));

    const byStatus: Array<{ status: string; count: number }> = [];
    const statusCounts: Record<string, number> = {};
    for (const task of tasks) {
      const status = task.status || "unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
    for (const [status, count] of Object.entries(statusCounts)) {
      byStatus.push({ status, count });
    }

    const byPriority: Array<{ priority: string; count: number }> = [];
    const priorityCounts: Record<string, number> = {};
    for (const task of tasks) {
      const priority = task.priority || "none";
      priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
    }
    for (const [priority, count] of Object.entries(priorityCounts)) {
      byPriority.push({ priority, count });
    }

    const dueTimeline: Array<{ date: string; count: number }> = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < 14; i++) {
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + i);
      const dateStr = targetDate.toISOString().split("T")[0];
      
      const count = openTasks.filter(t => {
        if (!t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        return dueDate.toISOString().split("T")[0] === dateStr;
      }).length;
      
      dueTimeline.push({ date: dateStr, count });
    }

    const byAssignee: Array<{ userId: string; name: string; count: number }> = [];
    const assigneeCounts: Record<string, { name: string; count: number }> = {};
    
    for (const task of openTasks) {
      const assignees = task.assignees || [];
      if (task.assigneeId && assignees.length === 0) {
        const assignee = await storage.getUser(task.assigneeId);
        if (assignee) {
          const name = assignee.firstName && assignee.lastName 
            ? `${assignee.firstName} ${assignee.lastName}` 
            : assignee.email;
          if (!assigneeCounts[task.assigneeId]) {
            assigneeCounts[task.assigneeId] = { name, count: 0 };
          }
          assigneeCounts[task.assigneeId].count++;
        }
      } else {
        for (const assignee of assignees) {
          const name = assignee.firstName && assignee.lastName
            ? `${assignee.firstName} ${assignee.lastName}`
            : assignee.email;
          if (!assigneeCounts[assignee.id]) {
            assigneeCounts[assignee.id] = { name, count: 0 };
          }
          assigneeCounts[assignee.id].count++;
        }
      }
    }

    for (const [userId, data] of Object.entries(assigneeCounts)) {
      byAssignee.push({ userId, name: data.name, count: data.count });
    }
    byAssignee.sort((a, b) => b.count - a.count);

    const overdueTasksList = overdueTasks.slice(0, 10).map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
    }));

    const dueTodayTasksList = dueTodayTasks.slice(0, 10).map(t => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate,
      priority: t.priority,
      status: t.status,
    }));

    return res.json({
      projectId,
      metrics: {
        openTasks: openTasks.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        dueToday: dueTodayTasks.length,
        unassignedOpenTasks: unassignedOpenTasks.length,
        totalTasks: tasks.length,
        completionPercent: tasks.length > 0 
          ? Math.round((completedTasks.length / tasks.length) * 100) 
          : 0,
      },
      byStatus,
      byPriority,
      dueTimeline,
      byAssignee: byAssignee.slice(0, 5),
      overdueTasksList,
      dueTodayTasksList,
    });
  } catch (error) {
    console.error("Error fetching project analytics:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
