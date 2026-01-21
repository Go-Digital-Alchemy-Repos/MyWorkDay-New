# API Reference

**Status:** Current  
**Last Updated:** January 2026

This section documents all API endpoints, conventions, and error handling.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [AUTHENTICATION_ENDPOINTS.md](./AUTHENTICATION_ENDPOINTS.md) | `/api/auth/*` endpoints |
| [TENANT_ENDPOINTS.md](./TENANT_ENDPOINTS.md) | `/api/v1/*` tenant-scoped endpoints |
| [SUPER_ADMIN_ENDPOINTS.md](./SUPER_ADMIN_ENDPOINTS.md) | `/api/v1/super/*` endpoints |
| [WEBHOOKS.md](./WEBHOOKS.md) | Webhook endpoints |
| [ERROR_CODES.md](./ERROR_CODES.md) | Standard error codes |
| [REQUEST_VALIDATION.md](./REQUEST_VALIDATION.md) | Zod schemas and validation |
| [RATE_LIMITING.md](./RATE_LIMITING.md) | Rate limit policies |

---

## API Conventions

### Base URLs

| Environment | Base URL |
|-------------|----------|
| Development | `http://localhost:5000/api` |
| Production | `https://your-app.railway.app/api` |

### Authentication

All authenticated endpoints require a valid session cookie. Sessions are created via:

```
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "..." }
```

### Request Headers

| Header | Required | Description |
|--------|----------|-------------|
| `Content-Type` | Yes | `application/json` for POST/PATCH |
| `X-Tenant-Id` | Super Admin only | Override tenant context |
| `X-Request-Id` | No | Client-provided request correlation |

### Response Format

**Success Response:**
```json
{
  "data": { ... },
  "meta": { "total": 100, "page": 1 }
}
```

**Error Response:**
```json
{
  "error": "Validation failed",
  "code": "VALIDATION_ERROR",
  "requestId": "req_abc123",
  "details": { "field": "email", "message": "Invalid email format" }
}
```

---

## Endpoint Groups

### Authentication (`/api/auth/*`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/login` | Public | User login |
| POST | `/logout` | Auth | User logout |
| GET | `/me` | Auth | Get current user |
| POST | `/register` | Public | Register (first user = Super Admin) |
| POST | `/forgot-password` | Public | Request password reset |
| POST | `/reset-password` | Public | Reset password with token |

### Core Resources (`/api/*`)

| Resource | Endpoints | Auth | Description |
|----------|-----------|------|-------------|
| `/workspaces` | GET, POST, PATCH | Auth | Workspace management |
| `/teams` | GET, POST, PATCH, DELETE | Auth | Team management |
| `/projects` | GET, POST, PATCH, DELETE | Auth | Project management |
| `/tasks` | GET, POST, PATCH, DELETE | Auth | Task management |
| `/clients` | GET, POST, PATCH, DELETE | Auth | Client CRM |
| `/time-entries` | GET, POST, PATCH, DELETE | Auth | Time entries |
| `/timer` | GET, POST, PATCH | Auth | Active timer |

### Super Admin (`/api/v1/super/*`)

| Resource | Auth | Description |
|----------|------|-------------|
| `/tenants` | Super | Tenant CRUD |
| `/tenants/:id/users` | Super | Tenant user management |
| `/tenants/:id/settings` | Super | Tenant settings |
| `/reports/*` | Super | Global reports |
| `/system/*` | Super | System status and health |

### Tenant Admin (`/api/v1/tenant/*`)

| Resource | Auth | Description |
|----------|------|-------------|
| `/onboarding/*` | Admin | Onboarding wizard |
| `/branding` | Admin | White-label settings |
| `/integrations/*` | Admin | Integration configuration |

---

## Authentication Levels

| Level | Middleware | Description |
|-------|------------|-------------|
| Public | None | No authentication required |
| Auth | `requireAuth` | Any authenticated user |
| Admin | `requireTenantAdmin` | Tenant admin or super user |
| Super | `requireSuperUser` | Super user only |

---

## Tenant Scoping

Most endpoints are tenant-scoped, meaning data is automatically filtered to the user's tenant:

- **Scoped**: Data filtered by `req.tenant.effectiveTenantId`
- **Global**: Super users access data across all tenants
- **None**: Not tenant-specific (auth endpoints)

Super users can override tenant context using the `X-Tenant-Id` header.

---

## Common Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max records to return (default: 50) |
| `offset` | number | Skip N records (pagination) |
| `search` | string | Text search filter |
| `sort` | string | Sort field and direction |
| `status` | string | Filter by status |
| `workspaceId` | uuid | Filter by workspace |

---

## Related Sections

- [06-BACKEND](../06-BACKEND/) - Middleware and services
- [07-SECURITY](../07-SECURITY/) - Authorization details
- [15-REFERENCE](../15-REFERENCE/) - Complete endpoint reference
