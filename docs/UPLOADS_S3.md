# Unified S3 Upload Service

## Overview

The MyWorkDay application uses a unified S3 upload service that provides consistent file upload functionality across all features. The service enforces category-based validation, tenant isolation, and permission checks.

## Security Invariants

1. **Server-Side Key Generation**: S3 keys are ALWAYS generated server-side based on authenticated context
2. **Client Cannot Specify Keys**: Clients cannot specify arbitrary keys or tenant IDs
3. **Presigned URL Expiration**: Presigned URLs expire after 5 minutes
4. **File Validation**: File types and sizes are validated before presigning

## Upload Categories

| Category | Max Size | Allowed Types | Permissions Required |
|----------|----------|---------------|---------------------|
| `global-branding-logo` | 2MB | PNG, JPEG, WebP, SVG | Super User |
| `global-branding-icon` | 512KB | PNG, SVG, ICO | Super User |
| `global-branding-favicon` | 512KB | PNG, ICO, SVG | Super User |
| `tenant-branding-logo` | 2MB | PNG, JPEG, WebP, SVG | Tenant Admin |
| `tenant-branding-icon` | 512KB | PNG, SVG, ICO | Tenant Admin |
| `tenant-branding-favicon` | 512KB | PNG, ICO, SVG | Tenant Admin |
| `user-avatar` | 2MB | PNG, JPEG, WebP, GIF | Authenticated User |
| `task-attachment` | 25MB | PDF, DOC, XLS, CSV, Images, ZIP, TXT | Any Tenant User |

## S3 Key Structure

Keys are namespaced to prevent cross-tenant data access:

```
# Global branding assets (Super Admin only)
global/branding/{logo|icon|favicon}/{year}/{month}/{uuid}-{filename}

# Tenant branding assets
tenants/{tenantId}/branding/{logo|icon|favicon}/{year}/{month}/{uuid}-{filename}

# User avatars
tenants/{tenantId}/users/{userId}/avatar/{year}/{month}/{uuid}-{filename}
# OR for super users without tenant:
global/users/{userId}/avatar/{year}/{month}/{uuid}-{filename}

# Task attachments
tenants/{tenantId}/projects/{projectId}/tasks/{taskId}/attachments/{year}/{month}/{uuid}-{filename}
```

## API Endpoints

### Presign Upload URL

```
POST /api/v1/uploads/presign
```

**Request Body:**
```json
{
  "category": "user-avatar",
  "filename": "profile.jpg",
  "contentType": "image/jpeg",
  "size": 524288,
  "context": {
    "projectId": "optional-for-task-attachments",
    "taskId": "optional-for-task-attachments",
    "assetType": "logo|icon|favicon (for branding categories)"
  }
}
```

**Response:**
```json
{
  "uploadUrl": "https://bucket.s3.amazonaws.com/...",
  "fileUrl": "https://bucket.s3.amazonaws.com/tenants/123/...",
  "key": "tenants/123/users/456/avatar/2025/01/uuid-filename.jpg",
  "expiresInSeconds": 300
}
```

### Error Responses

| Code | Meaning |
|------|---------|
| 400 | Invalid category, missing fields, file validation failed |
| 401 | Not authenticated |
| 403 | Insufficient permissions for category |
| 503 | S3 not configured |

## Frontend Components

### S3Dropzone Component

A reusable dropzone component that handles the complete upload flow:

```tsx
import { S3Dropzone } from "@/components/common/S3Dropzone";

<S3Dropzone
  category="user-avatar"
  label="Profile Picture"
  description="PNG, JPG, WebP or GIF. Max 2MB."
  valueUrl={currentAvatarUrl}
  onUploaded={(fileUrl) => saveToDatabase(fileUrl)}
  onRemoved={() => clearFromDatabase()}
/>
```

**Props:**

| Prop | Type | Description |
|------|------|-------------|
| `category` | `UploadCategory` | Upload category for validation and key generation |
| `label` | `string` | Display label for the dropzone |
| `description` | `string` | Help text describing allowed formats |
| `valueUrl` | `string \| null` | Current file URL (for preview) |
| `inheritedUrl` | `string \| null` | Fallback URL if no custom value (for branding inheritance) |
| `onUploaded` | `(url: string) => void` | Callback when upload completes |
| `onRemoved` | `() => void` | Callback when file is removed |
| `projectId` | `string` | Required for task-attachment category |
| `taskId` | `string` | Required for task-attachment category |
| `previewType` | `"logo" \| "icon"` | Preview display style |

### useS3Upload Hook

Lower-level hook for custom upload implementations:

```tsx
import { useS3Upload } from "@/hooks/useS3Upload";

const { upload, isUploading, progress, error } = useS3Upload();

const handleUpload = async (file: File) => {
  const fileUrl = await upload({
    category: "user-avatar",
    file,
  });
  // Save fileUrl to database
};
```

## Branding Inheritance Model

Tenant branding implements an inheritance model:

1. If tenant has custom branding, use it
2. Otherwise, fall back to global system defaults
3. UI shows "Inherited from Global" badge when using defaults

```tsx
<S3Dropzone
  category="tenant-branding-logo"
  valueUrl={tenant.settings?.logoUrl}
  inheritedUrl={globalSettings?.defaultLogoUrl}
  onUploaded={saveTenantLogo}
  onRemoved={clearTenantLogo}
/>
```

## Task Attachments

Task attachments use a specialized flow that creates database records:

1. Client requests presigned URL via `/api/projects/{projectId}/tasks/{taskId}/attachments/presign`
2. Upload file to S3 using presigned URL
3. Complete upload via `/api/projects/{projectId}/tasks/{taskId}/attachments/{attachmentId}/complete`

This flow differs from the unified service because it creates an attachment record in the database with metadata.

The unified S3 service supports the `task-attachment` category for validation purposes, but the specialized attachment endpoints should be used for task attachments to ensure proper record management.

## Configuration

S3 uploads require the following environment variables:

```
S3_BUCKET_NAME=your-bucket
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA...
S3_SECRET_ACCESS_KEY=secret
S3_ENDPOINT_URL=https://s3.us-east-1.amazonaws.com (optional, for S3-compatible services)
```

For per-tenant S3 configuration, see the Tenant Integrations documentation.

## Testing

Unit tests for file validation and permission checks:

```bash
npx vitest run server/tests/uploads-presign.test.ts
```

Tests verify:
- File type validation per category
- File size limits per category
- Permission requirements (super user, tenant admin, etc.)
- Category configuration completeness
