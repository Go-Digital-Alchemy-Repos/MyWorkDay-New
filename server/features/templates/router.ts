import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole } from "@shared/schema";
import type { Request } from "express";

const router = Router();

function isAdmin(req: Request): boolean {
  return req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.SUPER_USER;
}

const templateContentSchema = z.object({
  sections: z.array(z.object({
    name: z.string().min(1),
    tasks: z.array(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      subtasks: z.array(z.string()).optional(),
    })),
  })),
});

const createTemplateSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  category: z.string().default("general"),
  isDefault: z.boolean().default(false),
  content: templateContentSchema,
});

const updateTemplateSchema = createTemplateSchema.partial();

router.get("/", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const templates = await db.select()
      .from(schema.projectTemplates)
      .where(eq(schema.projectTemplates.tenantId, tenantId))
      .orderBy(desc(schema.projectTemplates.createdAt));

    res.json(templates);
  } catch (error) {
    console.error("Error fetching templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const [template] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    res.json(template);
  } catch (error) {
    console.error("Error fetching template:", error);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const data = createTemplateSchema.parse(req.body);

    const [template] = await db.insert(schema.projectTemplates)
      .values({
        tenantId,
        name: data.name,
        description: data.description,
        category: data.category,
        isDefault: data.isDefault,
        content: data.content,
        createdBy: req.user?.id,
      })
      .returning();

    res.status(201).json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error creating template:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const [existing] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    const data = updateTemplateSchema.parse(req.body);

    const [template] = await db.update(schema.projectTemplates)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(schema.projectTemplates.id, req.params.id))
      .returning();

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Error updating template:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      return res.status(400).json({ error: "Tenant context required" });
    }

    const [existing] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      return res.status(404).json({ error: "Template not found" });
    }

    await db.delete(schema.projectTemplates)
      .where(eq(schema.projectTemplates.id, req.params.id));

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting template:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

export default router;
