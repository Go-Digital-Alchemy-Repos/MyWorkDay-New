import { Router } from "express";
import { storage } from "../../storage";
import { UserRole } from "@shared/schema";
import type { Request, Response, NextFunction } from "express";
import { isClientUser, getClientUserAccessibleClients } from "../../middleware/clientAccess";
import { handleRouteError } from "../../lib/errors";

const router = Router();

// Middleware to ensure only client users can access these routes
function requireClientRole(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.CLIENT) {
    return res.status(403).json({ 
      error: "Access denied",
      message: "This endpoint is only accessible to client portal users"
    });
  }
  next();
}

router.use(requireClientRole);

// =============================================================================
// CLIENT PORTAL DASHBOARD DATA
// =============================================================================

// Get dashboard summary for client user
router.get("/dashboard", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    
    if (clientIds.length === 0) {
      return res.json({
        clients: [],
        projects: [],
        tasks: [],
        upcomingDeadlines: [],
        recentActivity: [],
      });
    }
    
    // Get all accessible clients
    const clientsData = await storage.getClientsForUser(userId);
    const clients = clientsData.map(cd => ({
      id: cd.client.id,
      companyName: cd.client.companyName,
      displayName: cd.client.displayName,
      accessLevel: cd.access.accessLevel,
    }));
    
    // Get all projects for these clients
    const allProjects: any[] = [];
    const allTasks: any[] = [];
    
    for (const clientId of clientIds) {
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        allProjects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          clientId: project.clientId,
          createdAt: project.createdAt,
        });
        
        // Get tasks for this project (excluding personal tasks)
        const tasksList = await storage.getTasksByProject(project.id);
        for (const task of tasksList) {
          allTasks.push({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            projectId: task.projectId,
            projectName: project.name,
          });
        }
      }
    }
    
    // Get upcoming deadlines (tasks due in next 14 days)
    const now = new Date();
    const twoWeeksLater = new Date(now);
    twoWeeksLater.setDate(twoWeeksLater.getDate() + 14);
    
    const upcomingDeadlines = allTasks
      .filter(t => t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= twoWeeksLater)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 10);
    
    // Calculate summary stats
    const stats = {
      totalProjects: allProjects.length,
      activeProjects: allProjects.filter(p => p.status === "active" || p.status === "in_progress").length,
      totalTasks: allTasks.length,
      completedTasks: allTasks.filter(t => t.status === "completed").length,
      pendingTasks: allTasks.filter(t => t.status !== "completed").length,
      overdueTasks: allTasks.filter(t => 
        t.dueDate && 
        new Date(t.dueDate) < now && 
        t.status !== "completed"
      ).length,
    };
    
    res.json({
      clients,
      projects: allProjects,
      tasks: allTasks,
      stats,
      upcomingDeadlines,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /dashboard", req);
  }
});

// Get projects for client user
router.get("/projects", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    
    const allProjects: any[] = [];
    
    for (const clientId of clientIds) {
      const client = await storage.getClient(clientId);
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        // Get task counts for this project
        const tasks = await storage.getTasksByProject(project.id);
        const taskCount = tasks.length;
        const completedCount = tasks.filter(t => t.status === "completed").length;
        
        allProjects.push({
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          clientId: project.clientId,
          clientName: client?.companyName,
          createdAt: project.createdAt,
          taskCount,
          completedCount,
          progress: taskCount > 0 ? Math.round((completedCount / taskCount) * 100) : 0,
        });
      }
    }
    
    res.json(allProjects);
  } catch (error) {
    return handleRouteError(res, error, "GET /projects", req);
  }
});

// Get specific project details
router.get("/projects/:projectId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { projectId } = req.params;
    
    const project = await storage.getProject(projectId);
    if (!project || !project.clientId) {
      return res.status(404).json({ error: "Project not found" });
    }
    
    // Verify client user has access to this project's client
    const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    const client = await storage.getClient(project.clientId);
    const tasks = await storage.getTasksByProject(projectId);
    
    // Map tasks without time tracking info
    const tasksForClient = tasks.map(task => ({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.assignees?.map(a => ({
        id: a.user?.id || a.userId,
        name: a.user?.name || "Unknown",
        avatarUrl: a.user?.avatarUrl,
      })),
      subtasks: task.subtasks,
      tags: task.tags,
    }));
    
    res.json({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
      clientId: project.clientId,
      clientName: client?.companyName,
      tasks: tasksForClient,
      taskCount: tasks.length,
      completedCount: tasks.filter(t => t.status === "completed").length,
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /projects/:projectId", req);
  }
});

// Get tasks for client user across all accessible projects
router.get("/tasks", async (req, res) => {
  try {
    const userId = req.user!.id;
    const clientIds = await getClientUserAccessibleClients(userId);
    const { status, projectId } = req.query;
    
    const allTasks: any[] = [];
    
    for (const clientId of clientIds) {
      const projects = await storage.getProjectsByClient(clientId);
      
      for (const project of projects) {
        // Filter by projectId if provided
        if (projectId && project.id !== projectId) continue;
        
        const tasks = await storage.getTasksByProject(project.id);
        
        for (const task of tasks) {
          // Filter by status if provided
          if (status && task.status !== status) continue;
          
          allTasks.push({
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dueDate: task.dueDate,
            projectId: project.id,
            projectName: project.name,
            sectionId: task.sectionId,
            assignees: task.assignees?.map(a => ({
              id: a.user?.id || a.userId,
              name: a.user?.name || "Unknown",
              avatarUrl: a.user?.avatarUrl,
            })),
            subtasks: task.subtasks,
            tags: task.tags,
          });
        }
      }
    }
    
    // Sort by due date (null dates at the end)
    allTasks.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });
    
    res.json(allTasks);
  } catch (error) {
    return handleRouteError(res, error, "GET /tasks", req);
  }
});

// Get specific task details
router.get("/tasks/:taskId", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { taskId } = req.params;
    
    const task = await storage.getTaskWithRelations(taskId);
    if (!task || !task.projectId) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    const project = await storage.getProject(task.projectId);
    if (!project || !project.clientId) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    // Verify client user has access to this task's client
    const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    // Get comments for this task
    const comments = await storage.getCommentsByTask(taskId);
    
    res.json({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
      projectId: task.projectId,
      projectName: project.name,
      sectionId: task.sectionId,
      section: task.section,
      assignees: task.assignees?.map(a => ({
        id: a.user?.id || a.userId,
        name: a.user?.name || "Unknown",
        avatarUrl: a.user?.avatarUrl,
      })),
      subtasks: task.subtasks,
      tags: task.tags,
      comments: comments.map(c => ({
        id: c.id,
        body: c.body,
        createdAt: c.createdAt,
        user: c.user ? {
          id: c.user.id,
          name: c.user.name,
          avatarUrl: c.user.avatarUrl,
        } : null,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /tasks/:taskId", req);
  }
});

// Add comment to task (for collaborator access level)
router.post("/tasks/:taskId/comments", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { taskId } = req.params;
    // Accept both 'body' (schema field name) and 'content' (legacy) for compatibility
    const commentBody = req.body.body || req.body.content;
    
    if (!commentBody || typeof commentBody !== "string" || commentBody.trim().length === 0) {
      return res.status(400).json({ error: "Comment body is required" });
    }
    
    const task = await storage.getTask(taskId);
    if (!task || !task.projectId) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    const project = await storage.getProject(task.projectId);
    if (!project || !project.clientId) {
      return res.status(404).json({ error: "Task not found" });
    }
    
    // Verify client user has collaborator access
    const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
    if (!access) {
      return res.status(403).json({ error: "Access denied" });
    }
    
    if (access.accessLevel !== "collaborator") {
      return res.status(403).json({ error: "Collaborator access required to add comments" });
    }
    
    const comment = await storage.createComment({
      taskId,
      userId,
      body: commentBody.trim(),
    });
    
    const user = await storage.getUser(userId);
    
    res.status(201).json({
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt,
      user: user ? {
        id: user.id,
        name: user.name,
        avatarUrl: user.avatarUrl,
      } : null,
    });
  } catch (error) {
    return handleRouteError(res, error, "POST /tasks/:taskId/comments", req);
  }
});

// Get client user profile info
router.get("/profile", async (req, res) => {
  try {
    const userId = req.user!.id;
    const user = await storage.getUser(userId);
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const clientsAccess = await storage.getClientsForUser(userId);
    
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      clients: clientsAccess.map(ca => ({
        id: ca.client.id,
        companyName: ca.client.companyName,
        displayName: ca.client.displayName,
        accessLevel: ca.access.accessLevel,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, "GET /profile", req);
  }
});

export default router;
