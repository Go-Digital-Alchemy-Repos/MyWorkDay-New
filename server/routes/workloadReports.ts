import { Router, Request } from "express";
import { DatabaseStorage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { UserRole, User, TaskWithRelations } from "@shared/schema";
import { AppError, handleRouteError } from "../lib/errors";

const router = Router();
const storage = new DatabaseStorage();

function getCurrentWorkspaceId(_req: Request): string {
  return "demo-workspace-id";
}

function isSuperUser(req: Request): boolean {
  return (req.user as any)?.role === UserRole.SUPER_USER;
}

function isAdmin(req: Request): boolean {
  const role = (req.user as any)?.role;
  return role === UserRole.ADMIN || role === UserRole.SUPER_USER;
}

interface EmployeeWorkload {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
  totalTasks: number;
  openTasks: number;
  completedTasks: number;
  overdueTasks: number;
  dueTodayTasks: number;
  next7DaysTasks: number;
  highPriorityTasks: number;
  completionRate: number;
}

router.get("/workload/tasks-by-employee", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    const users = await storage.getUsersByTenant(tenantId || "");
    
    if (!users || users.length === 0) {
      return res.json([]);
    }

    const workloadData: EmployeeWorkload[] = await Promise.all(
      users.map(async (user: User) => {
        const allTasks = await storage.getTasksByUser(user.id);
        
        let openTasks = allTasks.filter((t: TaskWithRelations) => t.status !== "done");
        let completedTasks = allTasks.filter((t: TaskWithRelations) => t.status === "done");
        
        if (status === "open") {
          completedTasks = [];
        } else if (status === "completed") {
          openTasks = [];
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const next7Days = new Date(today);
        next7Days.setDate(next7Days.getDate() + 7);
        
        const overdueTasks = openTasks.filter((t: TaskWithRelations) => {
          if (!t.dueDate) return false;
          const dueDate = new Date(t.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate < today;
        });

        const dueTodayTasks = openTasks.filter((t: TaskWithRelations) => {
          if (!t.dueDate) return false;
          const dueDate = new Date(t.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate.getTime() === today.getTime();
        });

        const next7DaysTasks = openTasks.filter((t: TaskWithRelations) => {
          if (!t.dueDate) return false;
          const dueDate = new Date(t.dueDate);
          dueDate.setHours(0, 0, 0, 0);
          return dueDate >= tomorrow && dueDate <= next7Days;
        });

        const highPriorityTasks = openTasks.filter((t: TaskWithRelations) => 
          t.priority === "high" || t.priority === "urgent"
        );

        return {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarUrl: user.avatarUrl,
          totalTasks: allTasks.length,
          openTasks: openTasks.length,
          completedTasks: completedTasks.length,
          overdueTasks: overdueTasks.length,
          dueTodayTasks: dueTodayTasks.length,
          next7DaysTasks: next7DaysTasks.length,
          highPriorityTasks: highPriorityTasks.length,
          completionRate: allTasks.length > 0 
            ? Math.round((completedTasks.length / allTasks.length) * 100) 
            : 0,
        };
      })
    );

    const sortedData = workloadData
      .filter((w: EmployeeWorkload) => w.totalTasks > 0 || w.openTasks > 0)
      .sort((a: EmployeeWorkload, b: EmployeeWorkload) => b.openTasks - a.openTasks);

    return res.json(sortedData);
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/tasks-by-employee", req);
  }
});

// Enhanced tasks by employee with next 7 days metric
router.get("/workload/employee/:userId/tasks", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const { userId } = req.params;
    const filter = typeof req.query.filter === "string" ? req.query.filter : undefined;

    const user = await storage.getUser(userId);
    if (!user || user.tenantId !== tenantId) {
      throw AppError.notFound("User");
    }

    const allTasks = await storage.getTasksByUser(userId);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const next7Days = new Date(today);
    next7Days.setDate(next7Days.getDate() + 7);

    let filteredTasks = allTasks;

    if (filter === "overdue") {
      filteredTasks = allTasks.filter((t: TaskWithRelations) => {
        if (t.status === "done" || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate < today;
      });
    } else if (filter === "today") {
      filteredTasks = allTasks.filter((t: TaskWithRelations) => {
        if (t.status === "done" || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate.getTime() === today.getTime();
      });
    } else if (filter === "next7days") {
      filteredTasks = allTasks.filter((t: TaskWithRelations) => {
        if (t.status === "done" || !t.dueDate) return false;
        const dueDate = new Date(t.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        return dueDate >= tomorrow && dueDate <= next7Days;
      });
    } else if (filter === "open") {
      filteredTasks = allTasks.filter((t: TaskWithRelations) => t.status !== "done");
    }

    const tasksWithProject = await Promise.all(
      filteredTasks.map(async (task: TaskWithRelations) => {
        let projectName = null;
        if (task.projectId) {
          const project = await storage.getProject(task.projectId);
          projectName = project?.name || null;
        }
        return {
          ...task,
          projectName,
        };
      })
    );

    return res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
      tasks: tasksWithProject,
      totalCount: tasksWithProject.length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/employee/:userId/tasks", req);
  }
});

// Unassigned tasks queue
router.get("/workload/unassigned", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const projects = tenantId 
      ? await storage.getProjectsByTenant(tenantId, workspaceId)
      : await storage.getProjectsByWorkspace(workspaceId);

    const unassignedTasks: any[] = [];

    for (const project of projects) {
      const tasks = await storage.getTasksByProject(project.id);
      for (const task of tasks) {
        if (task.status === "done") continue;
        const hasAssignees = task.assignees && task.assignees.length > 0;
        if (!hasAssignees) {
          unassignedTasks.push({
            ...task,
            projectName: project.name,
            projectId: project.id,
          });
        }
      }
    }

    return res.json({
      tasks: unassignedTasks.sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        }
        if (a.dueDate) return -1;
        if (b.dueDate) return 1;
        return 0;
      }),
      totalCount: unassignedTasks.length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/unassigned", req);
  }
});

// Summary by status
router.get("/workload/by-status", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const projects = tenantId 
      ? await storage.getProjectsByTenant(tenantId, workspaceId)
      : await storage.getProjectsByWorkspace(workspaceId);

    const statusCounts: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
    };

    for (const project of projects) {
      const tasks = await storage.getTasksByProject(project.id);
      for (const task of tasks) {
        const status = task.status || "todo";
        statusCounts[status] = (statusCounts[status] || 0) + 1;
      }
    }

    return res.json({
      summary: Object.entries(statusCounts).map(([status, count]) => ({
        status,
        count,
      })),
      total: Object.values(statusCounts).reduce((sum, c) => sum + c, 0),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/by-status", req);
  }
});

// Summary by priority
router.get("/workload/by-priority", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const projects = tenantId 
      ? await storage.getProjectsByTenant(tenantId, workspaceId)
      : await storage.getProjectsByWorkspace(workspaceId);

    const priorityCounts: Record<string, number> = {
      none: 0,
      low: 0,
      medium: 0,
      high: 0,
      urgent: 0,
    };

    for (const project of projects) {
      const tasks = await storage.getTasksByProject(project.id);
      for (const task of tasks) {
        if (task.status === "done") continue;
        const priority = task.priority || "none";
        priorityCounts[priority] = (priorityCounts[priority] || 0) + 1;
      }
    }

    return res.json({
      summary: Object.entries(priorityCounts).map(([priority, count]) => ({
        priority,
        count,
      })),
      total: Object.values(priorityCounts).reduce((sum, c) => sum + c, 0),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/by-priority", req);
  }
});

router.get("/workload/summary", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    const workspaceId = getCurrentWorkspaceId(req);

    const users = await storage.getUsersByTenant(tenantId || "");
    const projects = tenantId 
      ? await storage.getProjectsByTenant(tenantId, workspaceId)
      : await storage.getProjectsByWorkspace(workspaceId);

    let totalOpenTasks = 0;
    let totalCompletedTasks = 0;
    let totalOverdueTasks = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const project of projects) {
      const tasks = await storage.getTasksByProject(project.id);
      
      for (const task of tasks) {
        if (task.status === "done") {
          totalCompletedTasks++;
        } else {
          totalOpenTasks++;
          if (task.dueDate) {
            const dueDate = new Date(task.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            if (dueDate < today) {
              totalOverdueTasks++;
            }
          }
        }
      }
    }

    return res.json({
      totalEmployees: users.length,
      totalProjects: projects.length,
      totalOpenTasks,
      totalCompletedTasks,
      totalOverdueTasks,
      avgTasksPerEmployee: users.length > 0 
        ? Math.round((totalOpenTasks + totalCompletedTasks) / users.length) 
        : 0,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /workload/summary", req);
  }
});

export default router;
