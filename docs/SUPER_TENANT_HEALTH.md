# Super Admin Tenant Health Tools

This document describes the data health and remediation tools available to Super Admins for maintaining tenant data integrity.

## Overview

Multi-tenant applications require strict data isolation. Occasionally, data may become "orphaned" - rows that lack a proper `tenantId` association. This can occur due to:
- Migration scripts that failed to backfill tenant IDs
- Legacy data created before multi-tenancy was enforced
- Bugs in data creation flows

The Orphan Fix Wizard provides a safe, audited way to detect and remediate these issues.

## Orphan Detection

### Endpoint
```
GET /api/v1/super/health/orphans
```

### Access Control
- Requires `super_user` role

### Response
```json
{
  "totalOrphans": 15,
  "tablesWithOrphans": 3,
  "tables": [
    {
      "table": "tasks",
      "count": 10,
      "sampleIds": [
        { "id": "uuid-1", "display": "Task Name" }
      ],
      "recommendedAction": "quarantine"
    }
  ],
  "quarantineTenant": {
    "exists": true,
    "id": "quarantine-tenant-uuid",
    "status": "suspended"
  }
}
```

### Tables Scanned
The following tables are checked for orphan rows (missing `tenantId`):
- `clients`
- `projects`
- `tasks`
- `teams`
- `users`
- `workspaces`
- `time_entries`
- `active_timers`
- `invitations`
- `subtasks`
- `task_attachments`

## Orphan Remediation

### Endpoint
```
POST /api/v1/super/health/orphans/fix
```

### Access Control
- Requires `super_user` role

### Request Body
```json
{
  "dryRun": true,
  "confirmText": "FIX_ORPHANS"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `dryRun` | boolean | Yes | If `true`, simulates the fix without making changes |
| `confirmText` | string | No* | Must be `"FIX_ORPHANS"` when `dryRun=false` |

*Required when `dryRun=false`

### Response
```json
{
  "dryRun": false,
  "quarantineTenantId": "uuid",
  "quarantineCreated": false,
  "totalFixed": 15,
  "totalWouldFix": 15,
  "results": [
    {
      "table": "tasks",
      "action": "fixed",
      "countBefore": 10,
      "countFixed": 10
    }
  ]
}
```

## Quarantine Tenant

Orphaned rows are moved to a special "quarantine" tenant rather than deleted:

| Property | Value |
|----------|-------|
| Slug | `quarantine` |
| Status | `SUSPENDED` (cannot be logged into) |
| Purpose | Holds orphaned data for manual review |

### Creation
The quarantine tenant is created automatically on first fix operation if it doesn't exist. An audit event is logged when this occurs.

## Safety Features

### Confirmation Guard
The fix endpoint requires explicit confirmation:
- `dryRun=true` can be called without confirmation
- `dryRun=false` requires `confirmText="FIX_ORPHANS"`

### Transactional Writes
All orphan fixes are performed within a database transaction. If any table update fails, the entire operation is rolled back.

### Audit Trail
All operations are logged to the audit system:
- `orphan_fix_started`: When a fix operation begins
- `orphan_fix_completed`: When fix completes successfully
- `quarantine_tenant_created`: When the quarantine tenant is created

## UI Location

The Orphan Fix Wizard is accessible at:
**Super Admin Dashboard → System Status → Orphan Fix Wizard**

### Workflow
1. Click "Scan" to detect orphans
2. Review orphan counts and sample IDs per table
3. Click "Preview Fix (Dry Run)" to see what would change
4. Type `FIX_ORPHANS` to enable execution
5. Click "Execute Fix" to apply changes

## Related Documentation

- [Data Integrity Checks](./DATA_INTEGRITY.md) - Other integrity validation tools
- [Tenancy Enforcement](./TENANCY_ENFORCEMENT.md) - Multi-tenancy enforcement modes
- [Audit System](./AUDIT_SYSTEM.md) - Audit event logging
