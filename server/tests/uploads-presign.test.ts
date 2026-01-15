import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import session from "express-session";
import {
  UploadCategory,
  validateFile,
  getCategoryConfig,
} from "../services/uploads/s3UploadService";

describe("S3 Upload Service - File Validation", () => {
  describe("validateFile", () => {
    it("should accept valid image for global-branding-logo", () => {
      const result = validateFile("global-branding-logo", "image/png", 500000);
      expect(result.valid).toBe(true);
    });

    it("should reject oversized file for global-branding-logo", () => {
      const result = validateFile(
        "global-branding-logo",
        "image/png",
        3 * 1024 * 1024
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum");
    });

    it("should reject invalid mime type for global-branding-logo", () => {
      const result = validateFile("global-branding-logo", "video/mp4", 500000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File type");
    });

    it("should accept valid favicon", () => {
      const result = validateFile(
        "global-branding-favicon",
        "image/x-icon",
        100000
      );
      expect(result.valid).toBe(true);
    });

    it("should accept valid user avatar", () => {
      const result = validateFile("user-avatar", "image/jpeg", 1500000);
      expect(result.valid).toBe(true);
    });

    it("should reject gif for branding logo", () => {
      const result = validateFile("global-branding-logo", "image/gif", 100000);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File type");
    });

    it("should accept gif for user avatar", () => {
      const result = validateFile("user-avatar", "image/gif", 100000);
      expect(result.valid).toBe(true);
    });

    it("should accept pdf for task attachments", () => {
      const result = validateFile(
        "task-attachment",
        "application/pdf",
        5 * 1024 * 1024
      );
      expect(result.valid).toBe(true);
    });

    it("should reject executable for task attachments", () => {
      const result = validateFile(
        "task-attachment",
        "application/x-msdownload",
        1000
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("File type");
    });

    it("should reject oversized task attachment", () => {
      const result = validateFile(
        "task-attachment",
        "application/pdf",
        30 * 1024 * 1024
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds maximum");
    });
  });

  describe("getCategoryConfig", () => {
    it("should return correct config for global-branding-logo", () => {
      const config = getCategoryConfig("global-branding-logo");
      expect(config).toBeDefined();
      expect(config!.requiresSuperUser).toBe(true);
      expect(config!.requiresTenantAdmin).toBe(false);
      expect(config!.requiresTenantId).toBe(false);
      expect(config!.maxSizeBytes).toBe(2 * 1024 * 1024);
    });

    it("should return correct config for tenant-branding-logo", () => {
      const config = getCategoryConfig("tenant-branding-logo");
      expect(config).toBeDefined();
      expect(config!.requiresSuperUser).toBe(false);
      expect(config!.requiresTenantAdmin).toBe(true);
      expect(config!.requiresTenantId).toBe(true);
    });

    it("should return correct config for user-avatar", () => {
      const config = getCategoryConfig("user-avatar");
      expect(config).toBeDefined();
      expect(config!.requiresSuperUser).toBe(false);
      expect(config!.requiresTenantAdmin).toBe(false);
      expect(config!.requiresUserId).toBe(true);
    });

    it("should return correct config for task-attachment", () => {
      const config = getCategoryConfig("task-attachment");
      expect(config).toBeDefined();
      expect(config!.requiresTaskContext).toBe(true);
      expect(config!.requiresTenantId).toBe(true);
      expect(config!.maxSizeBytes).toBe(25 * 1024 * 1024);
    });
  });
});

describe("S3 Upload Service - Permission Matrix", () => {
  const categories: UploadCategory[] = [
    "global-branding-logo",
    "global-branding-icon",
    "global-branding-favicon",
    "tenant-branding-logo",
    "tenant-branding-icon",
    "tenant-branding-favicon",
    "user-avatar",
    "task-attachment",
  ];

  it("should have all categories defined", () => {
    for (const category of categories) {
      const config = getCategoryConfig(category);
      expect(config).toBeDefined();
      expect(config!.allowedMimeTypes).toBeInstanceOf(Array);
      expect(config!.maxSizeBytes).toBeGreaterThan(0);
    }
  });

  it("global branding categories require super user", () => {
    const globalCategories: UploadCategory[] = [
      "global-branding-logo",
      "global-branding-icon",
      "global-branding-favicon",
    ];
    for (const category of globalCategories) {
      const config = getCategoryConfig(category);
      expect(config).toBeDefined();
      expect(config!.requiresSuperUser).toBe(true);
      expect(config!.requiresTenantId).toBe(false);
    }
  });

  it("tenant branding categories require tenant admin", () => {
    const tenantCategories: UploadCategory[] = [
      "tenant-branding-logo",
      "tenant-branding-icon",
      "tenant-branding-favicon",
    ];
    for (const category of tenantCategories) {
      const config = getCategoryConfig(category);
      expect(config).toBeDefined();
      expect(config!.requiresTenantAdmin).toBe(true);
      expect(config!.requiresTenantId).toBe(true);
    }
  });
});
