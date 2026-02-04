/**
 * Cloudflare R2 Storage Module (S3-compatible API)
 * 
 * This module provides storage operations using Cloudflare R2 as the exclusive storage provider.
 * Uses S3-compatible API via AWS SDK for R2 operations.
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import mime from "mime-types";
import { getStorageProvider, createS3ClientFromConfig, StorageNotConfiguredError, type S3Config } from "./storage/getStorageProvider";

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/x-zip-compressed",
];

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25MB
const PRESIGN_EXPIRES_SECONDS = parseInt(process.env.R2_PRESIGN_EXPIRES_SECONDS || "300", 10);
const DOWNLOAD_EXPIRES_SECONDS = parseInt(process.env.R2_DOWNLOAD_EXPIRES_SECONDS || "300", 10);

// Cached storage config for synchronous functions (refreshed on first call)
let cachedStorageConfig: S3Config | null = null;
let cachedS3Client: S3Client | null = null;

/**
 * Initialize storage config (must be called before synchronous storage operations)
 */
async function initStorageConfig(tenantId: string | null = null): Promise<{ client: S3Client; config: S3Config }> {
  try {
    const provider = await getStorageProvider(tenantId);
    cachedStorageConfig = provider.config;
    cachedS3Client = createS3ClientFromConfig(provider.config);
    return { client: cachedS3Client, config: cachedStorageConfig };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw error;
    }
    throw new Error(`Failed to initialize R2 storage: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function getKeyPrefix(): string {
  return "project-attachments";
}

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(/[/\\:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 200);
}

export function generateStorageKey(
  projectId: string,
  taskId: string,
  attachmentId: string,
  fileName: string
): string {
  const prefix = getKeyPrefix();
  const sanitized = sanitizeFileName(fileName);
  return `${prefix}/${projectId}/tasks/${taskId}/${attachmentId}-${sanitized}`;
}

export function validateFile(mimeType: string, fileSizeBytes: number): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: `File type "${mimeType}" is not allowed. Allowed types: images, PDFs, documents, spreadsheets, text files, and zip archives.` 
    };
  }
  
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    return { 
      valid: false, 
      error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB` 
    };
  }
  
  return { valid: true };
}

/**
 * Check if Cloudflare R2 storage is configured via environment variables.
 * This is the exclusive storage check - AWS S3 is no longer supported.
 * @deprecated Use isR2Configured() for clarity. This export is kept for backward compatibility.
 */
export function isS3Configured(): boolean {
  return isR2Configured();
}

/**
 * Check if Cloudflare R2 storage is configured via environment variables.
 */
export function isR2Configured(): boolean {
  return !!(
    process.env.CF_R2_ACCOUNT_ID &&
    process.env.CF_R2_ACCESS_KEY_ID &&
    process.env.CF_R2_SECRET_ACCESS_KEY &&
    process.env.CF_R2_BUCKET_NAME
  );
}

/**
 * Test R2 presign functionality for health checks.
 * @deprecated Use testR2Presign() for clarity. This export is kept for backward compatibility.
 */
export async function testS3Presign(): Promise<{ ok: boolean; error?: string }> {
  return testR2Presign();
}

/**
 * Test R2 presign functionality for health checks.
 */
export async function testR2Presign(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { client, config } = await initStorageConfig(null);
    
    const testKey = `__health-check__/presign-test-${Date.now()}.txt`;
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: testKey,
      ContentType: "text/plain",
    });
    
    const url = await getSignedUrl(client, command, { expiresIn: 60 });
    
    if (!url || !url.startsWith("https://")) {
      return { ok: false, error: "Generated URL is invalid" };
    }
    
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Presign test failed" };
  }
}

export async function createPresignedUploadUrl(
  storageKey: string,
  mimeType: string,
  tenantId: string | null = null
): Promise<{ url: string; method: string; headers: Record<string, string> }> {
  const { client, config } = await initStorageConfig(tenantId);
  
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: storageKey,
    ContentType: mimeType,
  });
  
  const url = await getSignedUrl(client, command, { expiresIn: PRESIGN_EXPIRES_SECONDS });
  
  return {
    url,
    method: "PUT",
    headers: {
      "Content-Type": mimeType,
    },
  };
}

export async function createPresignedDownloadUrl(storageKey: string, tenantId: string | null = null): Promise<string> {
  const { client, config } = await initStorageConfig(tenantId);
  
  const command = new GetObjectCommand({
    Bucket: config.bucketName,
    Key: storageKey,
  });
  
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRES_SECONDS });
}

export async function deleteS3Object(storageKey: string, tenantId: string | null = null): Promise<void> {
  const { client, config } = await initStorageConfig(tenantId);
  
  const command = new DeleteObjectCommand({
    Bucket: config.bucketName,
    Key: storageKey,
  });
  
  await client.send(command);
}

export async function checkObjectExists(storageKey: string, tenantId: string | null = null): Promise<boolean> {
  const { client, config } = await initStorageConfig(tenantId);
  
  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucketName,
      Key: storageKey,
    });
    await client.send(command);
    return true;
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
}

export function getMimeType(fileName: string): string {
  return mime.lookup(fileName) || "application/octet-stream";
}

// Brand asset allowed MIME types
const BRAND_ASSET_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

// Avatar allowed MIME types
const AVATAR_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

const BRAND_ASSET_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const AVATAR_MAX_SIZE = 2 * 1024 * 1024; // 2MB

export function validateBrandAsset(mimeType: string, fileSizeBytes: number): { valid: boolean; error?: string } {
  if (!BRAND_ASSET_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: `File type "${mimeType}" is not allowed. Allowed types: PNG, JPG, WebP, SVG, ICO.` 
    };
  }
  
  if (fileSizeBytes > BRAND_ASSET_MAX_SIZE) {
    return { 
      valid: false, 
      error: `File size exceeds maximum allowed size of ${BRAND_ASSET_MAX_SIZE / (1024 * 1024)}MB` 
    };
  }
  
  return { valid: true };
}

export function validateAvatar(mimeType: string, fileSizeBytes: number): { valid: boolean; error?: string } {
  if (!AVATAR_MIME_TYPES.includes(mimeType)) {
    return { 
      valid: false, 
      error: `File type "${mimeType}" is not allowed. Allowed types: PNG, JPG, WebP, GIF.` 
    };
  }
  
  if (fileSizeBytes > AVATAR_MAX_SIZE) {
    return { 
      valid: false, 
      error: `File size exceeds maximum allowed size of ${AVATAR_MAX_SIZE / (1024 * 1024)}MB` 
    };
  }
  
  return { valid: true };
}

export function generateBrandAssetKey(
  tenantId: string,
  assetType: "logo" | "icon" | "favicon",
  fileName: string
): string {
  const uuid = crypto.randomUUID();
  const sanitized = sanitizeFileName(fileName);
  return `tenants/${tenantId}/branding/${assetType}/${uuid}-${sanitized}`;
}

export function generateAvatarKey(
  tenantId: string | null,
  userId: string,
  fileName: string
): string {
  const uuid = crypto.randomUUID();
  const sanitized = sanitizeFileName(fileName);
  if (tenantId) {
    return `tenants/${tenantId}/users/${userId}/avatar/${uuid}-${sanitized}`;
  }
  return `system/users/${userId}/avatar/${uuid}-${sanitized}`;
}

export async function uploadToS3(
  buffer: Buffer,
  storageKey: string,
  mimeType: string,
  tenantId: string | null = null
): Promise<string> {
  const { client, config } = await initStorageConfig(tenantId);
  
  const command = new PutObjectCommand({
    Bucket: config.bucketName,
    Key: storageKey,
    Body: buffer,
    ContentType: mimeType,
  });
  
  await client.send(command);
  
  // Return the R2 URL (use public URL if available, otherwise endpoint)
  if (config.publicUrl) {
    const baseUrl = config.publicUrl.replace(/\/$/, "");
    return `${baseUrl}/${storageKey}`;
  }
  if (config.endpoint) {
    return `${config.endpoint}/${config.bucketName}/${storageKey}`;
  }
  // Fallback
  return `${storageKey}`;
}

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, BRAND_ASSET_MIME_TYPES, AVATAR_MIME_TYPES };
