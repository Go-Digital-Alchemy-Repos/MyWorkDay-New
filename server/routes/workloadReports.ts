import { Router, Request } from "express";
import { DatabaseStorage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { UserRole, User, TaskWithRelations } from "@shared/schema";

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
  highPriorityTasks: number;
  completionRate: number;
}

router.get("/workload/tasks-by-employee", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
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
    console.error("Error fetching workload by employee:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/workload/summary", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
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
    console.error("Error fetching workload summary:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
