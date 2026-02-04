/**
 * Global Image Compression Pipeline
 * 
 * Provides consistent image processing across all upload paths.
 * Uses sharp for high-performance server-side image manipulation.
 * 
 * DESIGN DECISIONS:
 * - Avatar images: Max 400x400, WebP preferred (0.85 quality)
 * - Branding logos: Max 1200x400, preserve original format when possible
 * - Icons/favicons: Max 512x512, preserve format for ICO/SVG
 * - Task attachments: Max 2000x2000, moderate compression
 * 
 * FORMAT HANDLING:
 * - PNG: Preserved for transparency support
 * - JPEG: Converted to WebP for better compression
 * - WebP: Kept as WebP with quality optimization
 * - GIF: Converted to PNG (animation not supported)
 * - SVG: Passed through unchanged (vector format)
 * - ICO: Passed through unchanged (icon format)
 */

import sharp from "sharp";
import type { UploadCategory } from "./s3UploadService";

export interface ImageProcessingConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  preferWebP: boolean;
  preserveFormat: boolean;
}

export interface ProcessedImage {
  buffer: Buffer;
  mimeType: string;
  width: number;
  height: number;
  originalSize: number;
  processedSize: number;
}

const CATEGORY_IMAGE_CONFIGS: Partial<Record<UploadCategory, ImageProcessingConfig>> = {
  "user-avatar": {
    maxWidth: 400,
    maxHeight: 400,
    quality: 85,
    preferWebP: true,
    preserveFormat: false,
  },
  "global-branding-logo": {
    maxWidth: 1200,
    maxHeight: 400,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "tenant-branding-logo": {
    maxWidth: 1200,
    maxHeight: 400,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "global-branding-icon": {
    maxWidth: 512,
    maxHeight: 512,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "tenant-branding-icon": {
    maxWidth: 512,
    maxHeight: 512,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "global-branding-favicon": {
    maxWidth: 64,
    maxHeight: 64,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "tenant-branding-favicon": {
    maxWidth: 64,
    maxHeight: 64,
    quality: 90,
    preferWebP: false,
    preserveFormat: true,
  },
  "task-attachment": {
    maxWidth: 2000,
    maxHeight: 2000,
    quality: 85,
    preferWebP: true,
    preserveFormat: false,
  },
};

const PROCESSABLE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const PASSTHROUGH_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

export function shouldProcessImage(mimeType: string): boolean {
  return PROCESSABLE_MIME_TYPES.has(mimeType);
}

export function shouldPassthroughImage(mimeType: string): boolean {
  return PASSTHROUGH_MIME_TYPES.has(mimeType);
}

export function getImageConfig(category: UploadCategory): ImageProcessingConfig | null {
  return CATEGORY_IMAGE_CONFIGS[category] || null;
}

function determineOutputFormat(
  inputMimeType: string,
  config: ImageProcessingConfig
): { format: keyof sharp.FormatEnum; mimeType: string } {
  if (config.preserveFormat) {
    switch (inputMimeType) {
      case "image/jpeg":
        return { format: "jpeg", mimeType: "image/jpeg" };
      case "image/png":
        return { format: "png", mimeType: "image/png" };
      case "image/webp":
        return { format: "webp", mimeType: "image/webp" };
      case "image/gif":
        return { format: "png", mimeType: "image/png" };
      default:
        return { format: "png", mimeType: "image/png" };
    }
  }

  if (config.preferWebP) {
    if (inputMimeType === "image/png" || inputMimeType === "image/gif") {
      return { format: "png", mimeType: "image/png" };
    }
    return { format: "webp", mimeType: "image/webp" };
  }

  switch (inputMimeType) {
    case "image/jpeg":
      return { format: "jpeg", mimeType: "image/jpeg" };
    case "image/png":
      return { format: "png", mimeType: "image/png" };
    case "image/webp":
      return { format: "webp", mimeType: "image/webp" };
    case "image/gif":
      return { format: "png", mimeType: "image/png" };
    default:
      return { format: "png", mimeType: "image/png" };
  }
}

export async function processImage(
  buffer: Buffer,
  mimeType: string,
  category: UploadCategory
): Promise<ProcessedImage> {
  const config = getImageConfig(category);
  
  if (!config) {
    console.log(`[ImageProcessor] No config for category ${category}, passing through`);
    return {
      buffer,
      mimeType,
      width: 0,
      height: 0,
      originalSize: buffer.length,
      processedSize: buffer.length,
    };
  }

  if (shouldPassthroughImage(mimeType)) {
    console.log(`[ImageProcessor] Passthrough format: ${mimeType}`);
    return {
      buffer,
      mimeType,
      width: 0,
      height: 0,
      originalSize: buffer.length,
      processedSize: buffer.length,
    };
  }

  if (!shouldProcessImage(mimeType)) {
    console.log(`[ImageProcessor] Non-processable format: ${mimeType}`);
    return {
      buffer,
      mimeType,
      width: 0,
      height: 0,
      originalSize: buffer.length,
      processedSize: buffer.length,
    };
  }

  const originalSize = buffer.length;
  const { format, mimeType: outputMimeType } = determineOutputFormat(mimeType, config);

  try {
    let pipeline = sharp(buffer);
    const metadata = await pipeline.metadata();
    
    const inputWidth = metadata.width || 0;
    const inputHeight = metadata.height || 0;

    const needsResize = inputWidth > config.maxWidth || inputHeight > config.maxHeight;
    
    if (needsResize) {
      pipeline = pipeline.resize(config.maxWidth, config.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    let outputBuffer: Buffer;
    
    switch (format) {
      case "webp":
        outputBuffer = await pipeline.webp({ quality: config.quality }).toBuffer();
        break;
      case "jpeg":
        outputBuffer = await pipeline.jpeg({ quality: config.quality }).toBuffer();
        break;
      case "png":
        outputBuffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        break;
      default:
        outputBuffer = await pipeline.toBuffer();
    }

    const outputMetadata = await sharp(outputBuffer).metadata();

    console.log(
      `[ImageProcessor] ${category}: ${inputWidth}x${inputHeight} → ${outputMetadata.width}x${outputMetadata.height}, ` +
      `${(originalSize / 1024).toFixed(1)}KB → ${(outputBuffer.length / 1024).toFixed(1)}KB ` +
      `(${((1 - outputBuffer.length / originalSize) * 100).toFixed(0)}% reduction)`
    );

    return {
      buffer: outputBuffer,
      mimeType: outputMimeType,
      width: outputMetadata.width || 0,
      height: outputMetadata.height || 0,
      originalSize,
      processedSize: outputBuffer.length,
    };
  } catch (error) {
    console.error(`[ImageProcessor] Error processing ${category}:`, error);
    return {
      buffer,
      mimeType,
      width: 0,
      height: 0,
      originalSize,
      processedSize: originalSize,
    };
  }
}
