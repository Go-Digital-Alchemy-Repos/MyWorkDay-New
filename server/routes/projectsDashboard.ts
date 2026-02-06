import { Router, Request } from "express";
import { DatabaseStorage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { UserRole, TaskWithRelations } from "@shared/schema";
import { handleRouteError } from "../lib/errors";

const router = Router();
const storage = new DatabaseStorage();

interface LightweightTask {
  id: string;
  projectId: string | null;
  status: string | null;
  priority: string | null;
  dueDate: Date | null;
  estimateMinutes: number | null;
  assigneeUserIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

function isTaskOverdue(task: TaskWithRelations | LightweightTask): boolean {
  if (!task.dueDate || task.status === "done") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDate = new Date(task.dueDate);
  dueDate.setHours(0, 0, 0, 0);
  return dueDate < today;
}

function isTaskDueToday(task: TaskWithRelations | LightweightTask): boolean {
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
      // Optimized: Single batch query instead of N+1 (N+1 → 2 queries)
      const projectIds = filteredProjects.map(p => p.id);
      const taskCounts = await storage.getOpenTaskCountsByProjectIds(projectIds);
      
      const projectsWithCounts = filteredProjects.map(project => ({
        ...project,
        openTaskCount: taskCounts.get(project.id) || 0,
      }));
      return res.json(projectsWithCounts);
    }

    return res.json(filteredProjects);
  } catch (error) {
    return handleRouteError(res, error, "GET /projects", req);
  }
});

// Optimized: Uses batch fetch instead of N+1 (N+1 → 3 queries)
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

    // Batch fetch all tasks for all projects at once
    const projectIds = projects.map(p => p.id);
    const tasksByProject = await storage.getTasksByProjectIds(projectIds);

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
      const tasks = tasksByProject.get(project.id) || [];
      
      const openTasks = tasks.filter(t => t.status !== "done");
      const completedTasks = tasks.filter(t => t.status === "done");
      const overdueTasks = tasks.filter(isTaskOverdue);
      const dueToday = tasks.filter(isTaskDueToday);
      const unassignedOpen = openTasks.filter(t => t.assigneeUserIds.length === 0);

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
    return handleRouteError(res, error, "GET /projects/analytics/summary", req);
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
    const unassignedOpenTasks = openTasks.filter(t => !t.assignees || t.assignees.length === 0);

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
      for (const assignee of assignees) {
        const user = assignee.user;
        if (user) {
          const name = user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.name;
          if (!assigneeCounts[user.id]) {
            assigneeCounts[user.id] = { name, count: 0 };
          }
          assigneeCounts[user.id].count++;
        } else {
          if (!assigneeCounts[assignee.userId]) {
            assigneeCounts[assignee.userId] = { name: "Unknown", count: 0 };
          }
          assigneeCounts[assignee.userId].count++;
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
    return handleRouteError(res, error, "GET /projects/:projectId/analytics", req);
  }
});

router.get("/projects/:projectId/forecast", async (req, res) => {
  try {
    const { projectId } = req.params;
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const project = await storage.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (tenantId && project.tenantId !== tenantId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const tasks = await storage.getTasksByProject(projectId);
    const openTasks = tasks.filter(t => t.status !== "done");
    const overdueTasks = tasks.filter(isTaskOverdue);

    let timeEntries;
    if (tenantId) {
      timeEntries = await storage.getTimeEntriesByTenant(tenantId, workspaceId, { projectId });
    } else {
      timeEntries = await storage.getTimeEntriesByWorkspace(workspaceId, { projectId });
    }

    const taskEstimateMinutes = tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
    const openTaskEstimateMinutes = openTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
    const projectBudgetMinutes = project.budgetMinutes || null;

    const trackedMinutesTotal = timeEntries.reduce((sum, te) => {
      const durationSecs = te.durationSeconds || 0;
      return sum + Math.round(durationSecs / 60);
    }, 0);

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const trackedMinutesThisWeek = timeEntries
      .filter(te => te.startTime && new Date(te.startTime) >= oneWeekAgo)
      .reduce((sum, te) => {
        const durationSecs = te.durationSeconds || 0;
        return sum + Math.round(durationSecs / 60);
      }, 0);

    const remainingEstimateMinutes = taskEstimateMinutes > 0
      ? Math.max(openTaskEstimateMinutes - trackedMinutesTotal, 0)
      : null;

    const budgetRemainingMinutes = projectBudgetMinutes !== null
      ? Math.max(projectBudgetMinutes - trackedMinutesTotal, 0)
      : null;

    const overBudget = projectBudgetMinutes !== null
      ? trackedMinutesTotal > projectBudgetMinutes
      : null;

    const byAssignee: Array<{
      userId: string;
      name: string;
      openTasks: number;
      overdueTasks: number;
      estimateMinutesOpen: number;
      trackedMinutesTotal: number;
    }> = [];

    const assigneeData: Record<string, {
      name: string;
      openTasks: number;
      overdueTasks: number;
      estimateMinutesOpen: number;
      trackedMinutesTotal: number;
    }> = {};

    for (const task of openTasks) {
      const assignees = task.assignees || [];
      const assigneeCount = assignees.length || 1;
      const estimatePerAssignee = (task.estimateMinutes || 0) / assigneeCount;

      for (const assignee of assignees) {
        const userId = assignee.userId;
        const user = assignee.user;
        const name = user
          ? (user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.name)
          : "Unknown";

        if (!assigneeData[userId]) {
          assigneeData[userId] = {
            name,
            openTasks: 0,
            overdueTasks: 0,
            estimateMinutesOpen: 0,
            trackedMinutesTotal: 0,
          };
        }
        assigneeData[userId].openTasks++;
        assigneeData[userId].estimateMinutesOpen += estimatePerAssignee;

        if (isTaskOverdue(task)) {
          assigneeData[userId].overdueTasks++;
        }
      }
    }

    for (const te of timeEntries) {
      if (te.userId && assigneeData[te.userId]) {
        const durationSecs = te.durationSeconds || 0;
        assigneeData[te.userId].trackedMinutesTotal += Math.round(durationSecs / 60);
      } else if (te.userId) {
        const user = te.user;
        const name = user
          ? (user.firstName && user.lastName
            ? `${user.firstName} ${user.lastName}`
            : user.email || user.name)
          : "Unknown";
        if (!assigneeData[te.userId]) {
          assigneeData[te.userId] = {
            name,
            openTasks: 0,
            overdueTasks: 0,
            estimateMinutesOpen: 0,
            trackedMinutesTotal: 0,
          };
        }
        const durationSecs = te.durationSeconds || 0;
        assigneeData[te.userId].trackedMinutesTotal += Math.round(durationSecs / 60);
      }
    }

    for (const [userId, data] of Object.entries(assigneeData)) {
      byAssignee.push({
        userId,
        name: data.name,
        openTasks: data.openTasks,
        overdueTasks: data.overdueTasks,
        estimateMinutesOpen: Math.round(data.estimateMinutesOpen),
        trackedMinutesTotal: data.trackedMinutesTotal,
      });
    }
    byAssignee.sort((a, b) => b.openTasks - a.openTasks);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next7 = new Date(today);
    next7.setDate(today.getDate() + 7);
    const next30 = new Date(today);
    next30.setDate(today.getDate() + 30);

    const dueForecast: Array<{
      bucket: "overdue" | "today" | "next7" | "next30" | "later" | "noDueDate";
      openTasks: number;
      estimateMinutesOpen: number;
    }> = [
      { bucket: "overdue", openTasks: 0, estimateMinutesOpen: 0 },
      { bucket: "today", openTasks: 0, estimateMinutesOpen: 0 },
      { bucket: "next7", openTasks: 0, estimateMinutesOpen: 0 },
      { bucket: "next30", openTasks: 0, estimateMinutesOpen: 0 },
      { bucket: "later", openTasks: 0, estimateMinutesOpen: 0 },
      { bucket: "noDueDate", openTasks: 0, estimateMinutesOpen: 0 },
    ];

    for (const task of openTasks) {
      const estimate = task.estimateMinutes || 0;
      if (!task.dueDate) {
        dueForecast[5].openTasks++;
        dueForecast[5].estimateMinutesOpen += estimate;
      } else {
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        if (dueDate < today) {
          dueForecast[0].openTasks++;
          dueForecast[0].estimateMinutesOpen += estimate;
        } else if (dueDate.getTime() === today.getTime()) {
          dueForecast[1].openTasks++;
          dueForecast[1].estimateMinutesOpen += estimate;
        } else if (dueDate < next7) {
          dueForecast[2].openTasks++;
          dueForecast[2].estimateMinutesOpen += estimate;
        } else if (dueDate < next30) {
          dueForecast[3].openTasks++;
          dueForecast[3].estimateMinutesOpen += estimate;
        } else {
          dueForecast[4].openTasks++;
          dueForecast[4].estimateMinutesOpen += estimate;
        }
      }
    }

    return res.json({
      projectId,
      totals: {
        taskEstimateMinutes,
        projectBudgetMinutes,
        trackedMinutesTotal,
        trackedMinutesThisWeek,
        remainingEstimateMinutes,
        budgetRemainingMinutes,
        overBudget,
      },
      byAssignee,
      dueForecast,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /projects/:projectId/forecast", req);
  }
});

// Optimized: Uses batch fetch instead of N+1 (N+1 → 3-4 queries)
router.get("/projects/forecast/summary", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    let projects;
    if (tenantId) {
      projects = await storage.getProjectsByTenant(tenantId, workspaceId);
    } else if (isSuperUser(req)) {
      projects = await storage.getProjectsByWorkspace(workspaceId);
    } else {
      return res.status(500).json({ error: "User tenant not configured" });
    }

    projects = projects.filter(p => p.status === "active");

    // Batch fetch: time entries and tasks in parallel
    const projectIds = projects.map(p => p.id);
    const [timeEntries, tasksByProject] = await Promise.all([
      tenantId 
        ? storage.getTimeEntriesByTenant(tenantId, workspaceId, {})
        : storage.getTimeEntriesByWorkspace(workspaceId, {}),
      storage.getTasksByProjectIds(projectIds),
    ]);

    const perProject: Array<{
      projectId: string;
      trackedMinutesTotal: number;
      taskEstimateMinutes: number;
      budgetMinutes: number | null;
      overBudget: boolean | null;
      remainingEstimateMinutes: number | null;
    }> = [];

    for (const project of projects) {
      const tasks = tasksByProject.get(project.id) || [];
      const openTasks = tasks.filter(t => t.status !== "done");

      const taskEstimateMinutes = tasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
      const openTaskEstimateMinutes = openTasks.reduce((sum, t) => sum + (t.estimateMinutes || 0), 0);
      const budgetMinutes = project.budgetMinutes || null;

      const projectTimeEntries = timeEntries.filter(te => te.projectId === project.id);
      const trackedMinutesTotal = projectTimeEntries.reduce((sum, te) => {
        const durationSecs = te.durationSeconds || 0;
        return sum + Math.round(durationSecs / 60);
      }, 0);

      const remainingEstimateMinutes = taskEstimateMinutes > 0
        ? Math.max(openTaskEstimateMinutes - trackedMinutesTotal, 0)
        : null;

      const overBudget = budgetMinutes !== null
        ? trackedMinutesTotal > budgetMinutes
        : null;

      perProject.push({
        projectId: project.id,
        trackedMinutesTotal,
        taskEstimateMinutes,
        budgetMinutes,
        overBudget,
        remainingEstimateMinutes,
      });
    }

    return res.json({ perProject });
  } catch (error) {
    return handleRouteError(res, error, "GET /projects/forecast/summary", req);
  }
});

export default router;
