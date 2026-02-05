# QA Plan - MyWorkDay

## Overview
This document describes the QA process for the MyWorkDay application.

## How to Run the App

### Development Mode
```bash
npm run dev
```
Server runs on port 5000 with both frontend and backend.

### Build for Production
```bash
npm run build
npm start
```

## How to Run Tests

### Unit/Integration Tests
```bash
npx vitest run
```

**Note**: Stop the development workflow before running tests to avoid port conflicts.

### E2E Tests
E2E tests are run via the Replit Agent's `run_test` tool using Playwright.

## Required Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key

### Optional
- `CF_R2_ACCESS_KEY_ID` - Cloudflare R2 access key
- `CF_R2_SECRET_ACCESS_KEY` - Cloudflare R2 secret key
- `CF_R2_BUCKET_NAME` - R2 bucket name
- `CF_R2_ACCOUNT_ID` - R2 account ID
- `CF_R2_PUBLIC_URL` - R2 public URL
- `MAILGUN_API_KEY` - Mailgun API key for emails
- `MAILGUN_DOMAIN` - Mailgun domain

### Debug/Development
- `TENANCY_ENFORCEMENT` - Tenant isolation mode (off/soft/strict)
- `AUTO_MIGRATE` - Auto-apply migrations on startup
- `SUPER_DEBUG_DELETE_ALLOWED` - Enable debug delete operations
- `PURGE_APP_DATA_ALLOWED` - Enable data purge operations

## Smoke Test Checklist

### Server Health
- [ ] Server starts without errors
- [ ] Health endpoint responds (if implemented)
- [ ] Database connection successful
- [ ] Static files served correctly

### Authentication
- [ ] Login page loads
- [ ] Registration works (first user becomes Super Admin)
- [ ] Login/logout flow works
- [ ] Session persists across page refreshes

### Core Flows
- [ ] Dashboard loads after login
- [ ] Create client works
- [ ] Create project works
- [ ] Create task works
- [ ] Time tracking start/stop works
- [ ] Chat send/receive works

## Test Coverage Summary

| Area | Status | Notes |
|------|--------|-------|
| Tenancy Enforcement | ✅ Covered | 22+ tests |
| Bootstrap/Registration | ⚠️ Partial | FK cleanup issues |
| Platform Admins | ⚠️ Partial | FK cleanup issues |
| Auth RBAC | ✅ Covered | |
| Client CRUD | ❌ Needs tests | |
| Project CRUD | ❌ Needs tests | |
| Task CRUD | ⚠️ Basic | |
| Time Tracking | ❌ Needs tests | |
| Chat | ❌ Needs tests | |

## Known Test Infrastructure Issues

1. **FK Constraint Violations**: Tests fail during cleanup due to foreign key references
   - Affected tables: `subtask_assignees`, `platform_audit_events`
   - Fix: Improve test cleanup order to respect FK dependencies

2. **Port Conflicts**: Tests fail if development workflow is running
   - Cause: Tests import production server which binds to port 5000
   - Fix: Stop dev workflow before tests, or refactor test imports

## Last Updated
February 2026
