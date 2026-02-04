/**
 * Unified R2 Upload Service
 * 
 * This module provides a centralized service for all Cloudflare R2 uploads across the application.
 * Uses S3-compatible API for R2 storage operations.
 * 
 * It enforces:
 * - Category-based file type and size validation
 * - Tenant isolation via namespaced R2 keys
 * - Permission validation (server derives tenant/user context from session)
 * 
 * SECURITY INVARIANTS:
 * - R2 keys are ALWAYS generated server-side based on authenticated context
 * - Client cannot specify arbitrary keys or tenant IDs
 * - Presigned URLs have limited expiration (5 minutes)
 * - File types and sizes are validated before presigning
 * 
 * Note: Cloudflare R2 is the exclusive storage provider. All S3 fallback code has been removed.
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";
import { getStorageProvider, getStorageStatus, createS3ClientFromConfig, StorageNotConfiguredError, type S3Config } from "../../storage/getStorageProvider";

export type UploadCategory =
  | "global-branding-logo"
  | "global-branding-icon"
  | "global-branding-favicon"
  | "tenant-branding-logo"
  | "tenant-branding-icon"
  | "tenant-branding-favicon"
  | "user-avatar"
  | "task-attachment";

export type AssetType = "logo" | "icon" | "favicon";

interface CategoryConfig {
  allowedMimeTypes: string[];
  maxSizeBytes: number;
  requiresTenantId: boolean;
  requiresUserId: boolean;
  requiresTaskContext: boolean;
  requiresSuperUser: boolean;
  requiresTenantAdmin: boolean;
}

const CATEGORY_CONFIGS: Record<UploadCategory, CategoryConfig> = {
  "global-branding-logo": {
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    requiresTenantId: false,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: true,
    requiresTenantAdmin: false,
  },
  "global-branding-icon": {
    allowedMimeTypes: ["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"],
    maxSizeBytes: 512 * 1024, // 512KB
    requiresTenantId: false,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: true,
    requiresTenantAdmin: false,
  },
  "global-branding-favicon": {
    allowedMimeTypes: ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"],
    maxSizeBytes: 512 * 1024, // 512KB
    requiresTenantId: false,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: true,
    requiresTenantAdmin: false,
  },
  "tenant-branding-logo": {
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    requiresTenantId: true,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: false,
    requiresTenantAdmin: true,
  },
  "tenant-branding-icon": {
    allowedMimeTypes: ["image/png", "image/svg+xml", "image/x-icon", "image/vnd.microsoft.icon"],
    maxSizeBytes: 512 * 1024, // 512KB
    requiresTenantId: true,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: false,
    requiresTenantAdmin: true,
  },
  "tenant-branding-favicon": {
    allowedMimeTypes: ["image/png", "image/x-icon", "image/vnd.microsoft.icon", "image/svg+xml"],
    maxSizeBytes: 512 * 1024, // 512KB
    requiresTenantId: true,
    requiresUserId: false,
    requiresTaskContext: false,
    requiresSuperUser: false,
    requiresTenantAdmin: true,
  },
  "user-avatar": {
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    maxSizeBytes: 2 * 1024 * 1024, // 2MB
    requiresTenantId: false, // Can be null for super users
    requiresUserId: true,
    requiresTaskContext: false,
    requiresSuperUser: false,
    requiresTenantAdmin: false,
  },
  "task-attachment": {
    allowedMimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/plain",
      "application/zip",
      "application/x-zip-compressed",
    ],
    maxSizeBytes: 25 * 1024 * 1024, // 25MB
    requiresTenantId: true,
    requiresUserId: false,
    requiresTaskContext: true,
    requiresSuperUser: false,
    requiresTenantAdmin: false,
  },
};

const PRESIGN_EXPIRES_SECONDS = 300; // 5 minutes

interface PresignContext {
  tenantId?: string | null;
  userId?: string;
  projectId?: string;
  taskId?: string;
  assetType?: AssetType;
}

interface PresignResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
  expiresInSeconds: number;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .toLowerCase()
    .slice(0, 100);
}

function getDatePrefix(): { year: string; month: string } {
  const now = new Date();
  return {
    year: now.getFullYear().toString(),
    month: (now.getMonth() + 1).toString().padStart(2, "0"),
  };
}

/**
 * Check if R2 storage is configured for a tenant
 */
export async function isR2ConfiguredForTenant(tenantId: string | null): Promise<boolean> {
  const status = await getStorageStatus(tenantId);
  return status.configured;
}

export function getCategoryConfig(category: UploadCategory): CategoryConfig | undefined {
  return CATEGORY_CONFIGS[category];
}

export function validateCategory(category: string): category is UploadCategory {
  return category in CATEGORY_CONFIGS;
}

export function validateFile(
  category: UploadCategory,
  contentType: string,
  size: number
): ValidationResult {
  const config = CATEGORY_CONFIGS[category];
  if (!config) {
    return { valid: false, error: `Invalid upload category: ${category}`, code: "INVALID_CATEGORY" };
  }

  if (!config.allowedMimeTypes.includes(contentType)) {
    return {
      valid: false,
      error: `File type "${contentType}" is not allowed for ${category}. Allowed: ${config.allowedMimeTypes.join(", ")}`,
      code: "INVALID_FILE_TYPE",
    };
  }

  if (size > config.maxSizeBytes) {
    const maxMB = (config.maxSizeBytes / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds maximum of ${maxMB}MB for ${category}`,
      code: "FILE_TOO_LARGE",
    };
  }

  return { valid: true };
}

export function generateS3Key(
  category: UploadCategory,
  filename: string,
  context: PresignContext
): string {
  const uuid = crypto.randomUUID();
  const sanitized = sanitizeFilename(filename);
  const { year, month } = getDatePrefix();

  switch (category) {
    case "global-branding-logo":
      return `global/branding/logo/${year}/${month}/${uuid}-${sanitized}`;
    case "global-branding-icon":
      return `global/branding/icon/${year}/${month}/${uuid}-${sanitized}`;
    case "global-branding-favicon":
      return `global/branding/favicon/${year}/${month}/${uuid}-${sanitized}`;

    case "tenant-branding-logo":
      if (!context.tenantId) throw new Error("tenantId required for tenant branding");
      return `tenants/${context.tenantId}/branding/logo/${year}/${month}/${uuid}-${sanitized}`;
    case "tenant-branding-icon":
      if (!context.tenantId) throw new Error("tenantId required for tenant branding");
      return `tenants/${context.tenantId}/branding/icon/${year}/${month}/${uuid}-${sanitized}`;
    case "tenant-branding-favicon":
      if (!context.tenantId) throw new Error("tenantId required for tenant branding");
      return `tenants/${context.tenantId}/branding/favicon/${year}/${month}/${uuid}-${sanitized}`;

    case "user-avatar":
      if (!context.userId) throw new Error("userId required for avatar");
      if (context.tenantId) {
        return `tenants/${context.tenantId}/users/${context.userId}/avatar/${year}/${month}/${uuid}-${sanitized}`;
      }
      return `system/users/${context.userId}/avatar/${year}/${month}/${uuid}-${sanitized}`;

    case "task-attachment":
      if (!context.tenantId) throw new Error("tenantId required for task attachment");
      if (!context.projectId) throw new Error("projectId required for task attachment");
      if (!context.taskId) throw new Error("taskId required for task attachment");
      return `tenants/${context.tenantId}/projects/${context.projectId}/tasks/${context.taskId}/attachments/${year}/${month}/${uuid}-${sanitized}`;

    default:
      throw new Error(`Unknown category: ${category}`);
  }
}

export function getFileUrl(key: string, config?: S3Config): string {
  const bucket = config?.bucketName;
  if (!bucket) {
    throw new StorageNotConfiguredError("R2 bucket name not configured");
  }
  
  // For Cloudflare R2, use the public URL if configured
  // R2 requires either:
  // 1. Public bucket access via r2.dev subdomain (e.g., https://pub-xxxx.r2.dev)
  // 2. Custom domain attached to bucket (e.g., https://files.example.com)
  if (config?.publicUrl) {
    // Remove trailing slash if present for consistent URL building
    const baseUrl = config.publicUrl.replace(/\/$/, "");
    return `${baseUrl}/${key}`;
  }
  
  // Fallback: Use endpoint with bucket path style
  if (config?.endpoint) {
    return `${config.endpoint}/${bucket}/${key}`;
  }
  
  throw new StorageNotConfiguredError("R2 public URL or endpoint not configured");
}

export async function createPresignedUpload(
  category: UploadCategory,
  filename: string,
  contentType: string,
  size: number,
  context: PresignContext
): Promise<PresignResult> {
  const validation = validateFile(category, contentType, size);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storageProvider = await getStorageProvider(context.tenantId || null);
  const client = createS3ClientFromConfig(storageProvider.config);
  const bucket = storageProvider.config.bucketName;

  const key = generateS3Key(category, filename, context);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  const fileUrl = getFileUrl(key, storageProvider.config);

  return {
    uploadUrl,
    fileUrl,
    key,
    expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
  };
}

/**
 * Upload a file directly to storage (server-side proxy upload)
 * This bypasses CORS restrictions by uploading from the server
 */
export async function uploadToStorage(
  category: UploadCategory,
  filename: string,
  contentType: string,
  buffer: Buffer,
  context: PresignContext
): Promise<{ fileUrl: string; key: string }> {
  const validation = validateFile(category, contentType, buffer.length);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const storageProvider = await getStorageProvider(context.tenantId || null);
  const client = createS3ClientFromConfig(storageProvider.config);
  const bucket = storageProvider.config.bucketName;

  const key = generateS3Key(category, filename, context);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });

  await client.send(command);
  
  const fileUrl = getFileUrl(key, storageProvider.config);

  return { fileUrl, key };
}

export { CATEGORY_CONFIGS, PRESIGN_EXPIRES_SECONDS };
