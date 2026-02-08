import { Router } from "express";
import { z } from "zod";
import { db } from "../../db";
import * as schema from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getEffectiveTenantId } from "../../middleware/tenantContext";
import { UserRole } from "@shared/schema";
import type { Request } from "express";
import { handleRouteError, AppError } from "../../lib/errors";

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
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      throw AppError.tenantRequired();
    }

    const templates = await db.select()
      .from(schema.projectTemplates)
      .where(eq(schema.projectTemplates.tenantId, tenantId))
      .orderBy(desc(schema.projectTemplates.createdAt));

    res.json(templates);
  } catch (error) {
    return handleRouteError(res, error, "GET /", req);
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      throw AppError.tenantRequired();
    }

    const [template] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!template) {
      throw AppError.notFound("Template");
    }

    res.json(template);
  } catch (error) {
    return handleRouteError(res, error, "GET /:id", req);
  }
});

router.post("/", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      throw AppError.tenantRequired();
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
      throw AppError.badRequest("Validation failed", error.errors);
    }
    return handleRouteError(res, error, "POST /", req);
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      throw AppError.tenantRequired();
    }

    const [existing] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      throw AppError.notFound("Template");
    }

    const data = updateTemplateSchema.parse(req.body);

    const [template] = await db.update(schema.projectTemplates)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.projectTemplates.id, req.params.id), eq(schema.projectTemplates.tenantId, tenantId)))
      .returning();

    res.json(template);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw AppError.badRequest("Validation failed", error.errors);
    }
    return handleRouteError(res, error, "PATCH /:id", req);
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!isAdmin(req)) {
      throw AppError.forbidden("Admin access required");
    }

    const tenantId = getEffectiveTenantId(req);
    
    if (!tenantId) {
      throw AppError.tenantRequired();
    }

    const [existing] = await db.select()
      .from(schema.projectTemplates)
      .where(and(
        eq(schema.projectTemplates.id, req.params.id),
        eq(schema.projectTemplates.tenantId, tenantId)
      ))
      .limit(1);

    if (!existing) {
      throw AppError.notFound("Template");
    }

    await db.delete(schema.projectTemplates)
      .where(and(eq(schema.projectTemplates.id, req.params.id), eq(schema.projectTemplates.tenantId, tenantId)));

    res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, "DELETE /:id", req);
  }
});

export default router;
