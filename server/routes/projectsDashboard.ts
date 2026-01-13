import { Router, Request } from "express";
import { DatabaseStorage } from "../storage";
import { getEffectiveTenantId } from "../middleware/tenantContext";
import { UserRole } from "@shared/schema";

const router = Router();
const storage = new DatabaseStorage();

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

export default router;
