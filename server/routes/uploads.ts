/**
 * Unified Upload Routes
 * 
 * Provides a single presign endpoint for all S3 uploads across the application.
 * Security enforced at this layer:
 * - Authentication required for all uploads
 * - Category-based permission validation
 * - Tenant isolation enforced
 * - S3 keys always generated server-side
 * 
 * SECURITY INVARIANTS:
 * - Client cannot specify S3 keys or override tenantId
 * - All permissions derived from authenticated session
 * - File validation happens before presigning
 */

import { Router, Request, Response } from "express";
import { z } from "zod";
import multer from "multer";
import { db } from "../db";
import { users, tasks, projects, UserRole } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  validateCategory,
  validateFile,
  createPresignedUpload,
  uploadToStorage,
  getCategoryConfig,
  type UploadCategory,
  type AssetType,
} from "../services/uploads/s3UploadService";
import { 
  StorageNotConfiguredError, 
  StorageDecryptionError, 
  StorageEncryptionNotAvailableError,
  getStorageStatus 
} from "../storage/getStorageProvider";
import { uploadRateLimiter } from "../middleware/rateLimit";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (largest category limit)
  },
});

const presignRequestSchema = z.object({
  category: z.string(),
  filename: z.string().min(1).max(255),
  contentType: z.string(),
  size: z.number().int().positive(),
  context: z.object({
    projectId: z.string().optional(),
    taskId: z.string().optional(),
    assetType: z.enum(["logo", "icon", "favicon"]).optional(),
  }).optional(),
});

function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.isAuthenticated || !req.isAuthenticated() || !req.user) {
    const requestId = req.requestId || "unknown";
    return res.status(401).json({
      error: { 
        code: "UNAUTHORIZED", 
        message: "Authentication required",
        status: 401,
        requestId,
      },
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  next();
}

async function validateTaskAccess(
  tenantId: string,
  projectId: string,
  taskId: string
): Promise<boolean> {
  const [task] = await db.select()
    .from(tasks)
    .where(and(
      eq(tasks.id, taskId),
      eq(tasks.projectId, projectId),
      eq(tasks.tenantId, tenantId)
    ))
    .limit(1);
  
  return !!task;
}

/**
 * POST /api/v1/uploads/presign
 * 
 * Generate a presigned URL for direct S3 upload.
 * 
 * Request body:
 * - category: Upload category (determines permissions and validation rules)
 * - filename: Original filename
 * - contentType: MIME type
 * - size: File size in bytes
 * - context: Optional context (projectId, taskId for attachments)
 * 
 * Response:
 * - uploadUrl: Presigned PUT URL (expires in 5 minutes)
 * - fileUrl: Public URL after upload completes
 * - key: S3 object key
 * - expiresInSeconds: URL expiration time
 */
router.post("/presign", uploadRateLimiter, requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = presignRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.format() },
        code: "VALIDATION_ERROR",
        message: "Invalid request",
      });
    }

    const { category, filename, contentType, size, context } = parsed.data;
    const user = req.user as any;

    if (!validateCategory(category)) {
      return res.status(400).json({
        error: { code: "INVALID_CATEGORY", message: `Invalid upload category: ${category}` },
        code: "INVALID_CATEGORY",
        message: `Invalid upload category: ${category}`,
      });
    }

    const categoryTyped = category as UploadCategory;
    const config = getCategoryConfig(categoryTyped);

    if (!config) {
      return res.status(400).json({
        error: { code: "INVALID_CATEGORY", message: `Invalid upload category: ${category}` },
        code: "INVALID_CATEGORY",
        message: `Invalid upload category: ${category}`,
      });
    }

    const validation = validateFile(categoryTyped, contentType, size);
    if (!validation.valid) {
      return res.status(400).json({
        error: { code: validation.code || "VALIDATION_ERROR", message: validation.error },
        code: validation.code || "VALIDATION_ERROR",
        message: validation.error,
      });
    }

    if (config.requiresSuperUser && user.role !== UserRole.SUPER_USER) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Super admin access required for this upload category" },
        code: "FORBIDDEN",
        message: "Super admin access required for this upload category",
      });
    }

    const tenantId = req.tenant?.effectiveTenantId || user.tenantId;

    if (config.requiresTenantAdmin) {
      const isSuperUser = user.role === UserRole.SUPER_USER;
      const isAdmin = user.role === UserRole.ADMIN;
      
      if (!isSuperUser && !isAdmin) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Tenant admin access required for this upload category" },
          code: "FORBIDDEN",
          message: "Tenant admin access required for this upload category",
        });
      }
      
      if (!tenantId) {
        return res.status(400).json({
          error: { code: "TENANT_REQUIRED", message: "Tenant context required for this upload" },
          code: "TENANT_REQUIRED",
          message: "Tenant context required for this upload",
        });
      }
    }

    if (config.requiresTenantId && !tenantId) {
      return res.status(400).json({
        error: { code: "TENANT_REQUIRED", message: "Tenant context required for this upload" },
        code: "TENANT_REQUIRED",
        message: "Tenant context required for this upload",
      });
    }

    if (config.requiresTaskContext) {
      if (!context?.projectId || !context?.taskId) {
        return res.status(400).json({
          error: { code: "TASK_CONTEXT_REQUIRED", message: "projectId and taskId required for task attachments" },
          code: "TASK_CONTEXT_REQUIRED",
          message: "projectId and taskId required for task attachments",
        });
      }

      const hasAccess = await validateTaskAccess(tenantId, context.projectId, context.taskId);
      if (!hasAccess) {
        return res.status(403).json({
          error: { code: "TASK_NOT_FOUND", message: "Task not found or access denied" },
          code: "TASK_NOT_FOUND",
          message: "Task not found or access denied",
        });
      }
    }

    const presignContext = {
      tenantId: tenantId || null,
      userId: user.id,
      projectId: context?.projectId,
      taskId: context?.taskId,
      assetType: context?.assetType,
    };

    const result = await createPresignedUpload(
      categoryTyped,
      filename,
      contentType,
      size,
      presignContext
    );

    res.json(result);
  } catch (error: any) {
    console.error("[uploads] Presign error:", error);
    
    if (error instanceof StorageNotConfiguredError) {
      return res.status(503).json({
        error: { code: "STORAGE_NOT_CONFIGURED", message: error.message },
        code: "STORAGE_NOT_CONFIGURED",
        message: error.message,
      });
    }
    
    if (error instanceof StorageDecryptionError) {
      return res.status(500).json({
        error: { code: "STORAGE_DECRYPTION_FAILED", message: "Storage credentials could not be accessed. Contact your administrator." },
        code: "STORAGE_DECRYPTION_FAILED",
        message: "Storage credentials could not be accessed. Contact your administrator.",
      });
    }
    
    if (error instanceof StorageEncryptionNotAvailableError) {
      return res.status(500).json({
        error: { code: "STORAGE_ENCRYPTION_NOT_AVAILABLE", message: "Storage encryption is not configured. Contact your administrator." },
        code: "STORAGE_ENCRYPTION_NOT_AVAILABLE",
        message: "Storage encryption is not configured. Contact your administrator.",
      });
    }
    
    res.status(500).json({
      error: { code: "PRESIGN_FAILED", message: error.message || "Failed to generate upload URL" },
      code: "PRESIGN_FAILED",
      message: error.message || "Failed to generate upload URL",
    });
  }
});

/**
 * GET /api/v1/uploads/status
 * 
 * Check if S3 uploads are configured and available.
 * Supports hierarchical storage resolution when tenantId is provided.
 */
router.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;
    const tenantId = req.tenant?.effectiveTenantId || user.tenantId || null;
    
    const status = await getStorageStatus(tenantId);
    
    res.json({
      configured: status.configured,
      source: status.source,
      tenantHasOverride: status.tenantHasOverride,
      systemHasDefault: status.systemHasDefault,
    });
  } catch (error: any) {
    console.error("[uploads] Status check error:", error);
    res.status(500).json({
      configured: false,
      source: "none",
      error: error.message,
    });
  }
});

/**
 * POST /api/v1/uploads/upload
 * 
 * Proxy upload endpoint that receives files and uploads them server-side.
 * This bypasses CORS restrictions when direct S3/R2 uploads aren't possible.
 * 
 * Request: multipart/form-data with:
 * - file: The file to upload
 * - category: Upload category
 * - context: Optional JSON context (projectId, taskId, assetType)
 * 
 * Response:
 * - fileUrl: Public URL of the uploaded file
 * - key: Storage object key
 */
router.post("/upload", uploadRateLimiter, requireAuth, upload.single("file"), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: { code: "NO_FILE", message: "No file uploaded" },
        code: "NO_FILE",
        message: "No file uploaded",
      });
    }

    const category = req.body.category;
    let context: { projectId?: string; taskId?: string; assetType?: string } = {};
    
    try {
      if (req.body.context) {
        context = JSON.parse(req.body.context);
      }
    } catch {
      return res.status(400).json({
        error: { code: "INVALID_CONTEXT", message: "Invalid context JSON" },
        code: "INVALID_CONTEXT",
        message: "Invalid context JSON",
      });
    }

    if (!validateCategory(category)) {
      return res.status(400).json({
        error: { code: "INVALID_CATEGORY", message: `Invalid upload category: ${category}` },
        code: "INVALID_CATEGORY",
        message: `Invalid upload category: ${category}`,
      });
    }

    const categoryTyped = category as UploadCategory;
    const config = getCategoryConfig(categoryTyped);

    if (!config) {
      return res.status(400).json({
        error: { code: "INVALID_CATEGORY", message: `Invalid upload category: ${category}` },
        code: "INVALID_CATEGORY",
        message: `Invalid upload category: ${category}`,
      });
    }

    const user = req.user as any;

    if (config.requiresSuperUser && user.role !== UserRole.SUPER_USER) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Super admin access required for this upload category" },
        code: "FORBIDDEN",
        message: "Super admin access required for this upload category",
      });
    }

    const tenantId = req.tenant?.effectiveTenantId || user.tenantId;

    if (config.requiresTenantAdmin) {
      const isSuperUser = user.role === UserRole.SUPER_USER;
      const isAdmin = user.role === UserRole.ADMIN;
      
      if (!isSuperUser && !isAdmin) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "Tenant admin access required for this upload category" },
          code: "FORBIDDEN",
          message: "Tenant admin access required for this upload category",
        });
      }
      
      if (!tenantId) {
        return res.status(400).json({
          error: { code: "TENANT_REQUIRED", message: "Tenant context required for this upload" },
          code: "TENANT_REQUIRED",
          message: "Tenant context required for this upload",
        });
      }
    }

    if (config.requiresTenantId && !tenantId) {
      return res.status(400).json({
        error: { code: "TENANT_REQUIRED", message: "Tenant context required for this upload" },
        code: "TENANT_REQUIRED",
        message: "Tenant context required for this upload",
      });
    }

    if (config.requiresTaskContext) {
      if (!context?.projectId || !context?.taskId) {
        return res.status(400).json({
          error: { code: "TASK_CONTEXT_REQUIRED", message: "projectId and taskId required for task attachments" },
          code: "TASK_CONTEXT_REQUIRED",
          message: "projectId and taskId required for task attachments",
        });
      }

      const hasAccess = await validateTaskAccess(tenantId, context.projectId, context.taskId);
      if (!hasAccess) {
        return res.status(403).json({
          error: { code: "TASK_NOT_FOUND", message: "Task not found or access denied" },
          code: "TASK_NOT_FOUND",
          message: "Task not found or access denied",
        });
      }
    }

    const uploadContext = {
      tenantId: tenantId || null,
      userId: user.id,
      projectId: context?.projectId,
      taskId: context?.taskId,
      assetType: context?.assetType as AssetType | undefined,
    };

    const result = await uploadToStorage(
      categoryTyped,
      req.file.originalname,
      req.file.mimetype,
      req.file.buffer,
      uploadContext
    );

    res.json({
      fileUrl: result.fileUrl,
      key: result.key,
    });
  } catch (error: any) {
    console.error("[uploads] Upload error:", error);
    
    if (error instanceof StorageNotConfiguredError) {
      return res.status(503).json({
        error: { code: "STORAGE_NOT_CONFIGURED", message: error.message },
        code: "STORAGE_NOT_CONFIGURED",
        message: error.message,
      });
    }
    
    if (error instanceof StorageDecryptionError) {
      return res.status(500).json({
        error: { code: "STORAGE_DECRYPTION_FAILED", message: "Storage credentials could not be accessed. Contact your administrator." },
        code: "STORAGE_DECRYPTION_FAILED",
        message: "Storage credentials could not be accessed. Contact your administrator.",
      });
    }
    
    if (error instanceof StorageEncryptionNotAvailableError) {
      return res.status(500).json({
        error: { code: "STORAGE_ENCRYPTION_NOT_AVAILABLE", message: "Storage encryption is not configured. Contact your administrator." },
        code: "STORAGE_ENCRYPTION_NOT_AVAILABLE",
        message: "Storage encryption is not configured. Contact your administrator.",
      });
    }
    
    res.status(500).json({
      error: { code: "UPLOAD_FAILED", message: error.message || "Failed to upload file" },
      code: "UPLOAD_FAILED",
      message: error.message || "Failed to upload file",
    });
  }
});

export default router;
