import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { UserRole } from "@shared/schema";

// Check if the current user is a client user
export function isClientUser(req: Request): boolean {
  return req.user?.role === UserRole.CLIENT;
}

// Get the client IDs that a client user has access to
export async function getClientUserAccessibleClients(userId: string): Promise<string[]> {
  const clientsAccess = await storage.getClientsForUser(userId);
  return clientsAccess.map(ca => ca.client.id);
}

// Middleware to restrict client users to only their accessible clients
export function requireClientAccess(
  paramName: string = "clientId"
): (req: Request, res: Response, next: NextFunction) => void {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      // Non-client users pass through (they have their own access controls)
      if (!user || user.role !== UserRole.CLIENT) {
        return next();
      }
      
      const clientId = req.params[paramName] || req.body[paramName] || req.query[paramName];
      
      if (!clientId) {
        return next(); // No client context - let other middleware handle
      }
      
      // Check if client user has access to this client
      const access = await storage.getClientUserAccessByUserAndClient(user.id, clientId as string);
      
      if (!access) {
        return res.status(403).json({ 
          error: "Access denied",
          message: "You do not have access to this client"
        });
      }
      
      // Attach access level to request for downstream use
      req.clientAccess = access;
      next();
    } catch (error) {
      console.error("Error checking client access:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}

// Middleware to block client users from certain routes entirely
export function blockClientUsers(
  req: Request, 
  res: Response, 
  next: NextFunction
): void {
  if (req.user?.role === UserRole.CLIENT) {
    res.status(403).json({ 
      error: "Access denied",
      message: "This feature is not available for client users"
    });
    return;
  }
  next();
}

// Get accessible project IDs for a client user (projects belonging to their clients)
export async function getClientUserAccessibleProjects(userId: string): Promise<string[]> {
  const clientsAccess = await storage.getClientsForUser(userId);
  const projectIds: string[] = [];
  
  for (const { client } of clientsAccess) {
    const projects = await storage.getProjectsByClient(client.id);
    projectIds.push(...projects.map(p => p.id));
  }
  
  return projectIds;
}

// Check if a client user can access a specific project
export async function canClientAccessProject(userId: string, projectId: string): Promise<boolean> {
  const project = await storage.getProject(projectId);
  if (!project || !project.clientId) {
    return false;
  }
  
  const access = await storage.getClientUserAccessByUserAndClient(userId, project.clientId);
  return !!access;
}

// Check if a client user can access a specific task
export async function canClientAccessTask(userId: string, taskId: string): Promise<boolean> {
  const task = await storage.getTask(taskId);
  if (!task || !task.projectId) {
    return false;
  }
  
  return canClientAccessProject(userId, task.projectId);
}
