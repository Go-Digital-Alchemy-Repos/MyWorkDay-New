import { Router } from "express";
import { z } from "zod";
import { storage } from "../../storage";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { insertClientDivisionSchema } from "@shared/schema";
import type { Request } from "express";

function getCurrentUserId(req: Request): string {
  return req.user?.id || "demo-user-id";
}

const router = Router();

// =============================================================================
// CLIENT DIVISIONS
// =============================================================================

router.get("/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    let divisions = await storage.getClientDivisionsByClient(clientId, tenantId);
    
    if (!isAdmin) {
      const userDivisions = await storage.getUserDivisions(userId, tenantId);
      const userDivisionIds = new Set(userDivisions.map(d => d.id));
      divisions = divisions.filter(d => userDivisionIds.has(d.id));
    }
    
    const divisionsWithCounts = await Promise.all(divisions.map(async (division) => {
      const members = await storage.getDivisionMembers(division.id);
      return {
        ...division,
        memberCount: members.length,
        projectCount: 0,
      };
    }));
    
    res.json(divisionsWithCounts);
  } catch (error) {
    console.error("Error fetching divisions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/clients/:clientId/divisions", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { clientId } = req.params;
    
    const client = await storage.getClientByIdAndTenant(clientId, tenantId);
    if (!client) {
      return res.status(404).json({ error: "Client not found" });
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Only tenant admins can create divisions" });
    }
    
    const data = insertClientDivisionSchema.parse({
      ...req.body,
      clientId,
      tenantId,
    });
    
    const division = await storage.createClientDivision(data);
    res.status(201).json(division);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating division:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/divisions/:divisionId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { divisionId } = req.params;
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Only tenant admins can update divisions" });
    }
    
    const updateSchema = insertClientDivisionSchema.partial().omit({ 
      tenantId: true, 
      clientId: true 
    });
    const data = updateSchema.parse(req.body);
    
    const division = await storage.updateClientDivision(divisionId, tenantId, data);
    if (!division) {
      return res.status(404).json({ error: "Division not found" });
    }
    
    res.json(division);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error updating division:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { divisionId } = req.params;
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      return res.status(404).json({ error: "Division not found" });
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      const isMember = await storage.isDivisionMember(divisionId, userId);
      if (!isMember) {
        return res.status(403).json({ error: "You do not have access to this division" });
      }
    }
    
    const members = await storage.getDivisionMembers(divisionId);
    res.json({ members });
  } catch (error) {
    console.error("Error fetching division members:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/divisions/:divisionId/members", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { divisionId } = req.params;
    const { userIds } = req.body;
    
    if (!Array.isArray(userIds)) {
      return res.status(400).json({ error: "userIds must be an array" });
    }
    
    const userId = getCurrentUserId(req);
    const user = await storage.getUser(userId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Only tenant admins can manage division members" });
    }
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      return res.status(404).json({ error: "Division not found" });
    }
    
    for (const uid of userIds) {
      const userToAdd = await storage.getUser(uid);
      if (!userToAdd || userToAdd.tenantId !== tenantId) {
        return res.status(400).json({ error: `User ${uid} does not belong to this tenant` });
      }
    }
    
    await storage.setDivisionMembers(divisionId, tenantId, userIds);
    const members = await storage.getDivisionMembers(divisionId);
    
    res.json({ success: true, members });
  } catch (error) {
    console.error("Error updating division members:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/divisions/:divisionId/members/:userId", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    if (!tenantId) {
      return res.status(403).json({ error: "Tenant context required" });
    }
    
    const { divisionId, userId: targetUserId } = req.params;
    
    const currentUserId = getCurrentUserId(req);
    const user = await storage.getUser(currentUserId);
    const isAdmin = user?.role === 'admin' || user?.role === 'super_user';
    
    if (!isAdmin) {
      return res.status(403).json({ error: "Only tenant admins can remove division members" });
    }
    
    const division = await storage.getClientDivision(divisionId);
    if (!division || division.tenantId !== tenantId) {
      return res.status(404).json({ error: "Division not found" });
    }
    
    await storage.removeDivisionMember(divisionId, targetUserId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error removing division member:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
