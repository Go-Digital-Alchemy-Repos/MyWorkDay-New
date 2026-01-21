# Security

**Status:** Current  
**Last Updated:** January 2026

This section covers security architecture, multi-tenant isolation, and best practices.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [TENANT_ISOLATION.md](./TENANT_ISOLATION.md) | Multi-tenant security |
| [AUTHENTICATION.md](./AUTHENTICATION.md) | Auth security |
| [AUTHORIZATION.md](./AUTHORIZATION.md) | RBAC and permissions |
| [DATA_ENCRYPTION.md](./DATA_ENCRYPTION.md) | Encryption at rest |
| [RATE_LIMITING.md](./RATE_LIMITING.md) | Brute force protection |
| [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) | Pre-deployment security |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Security incident handling |

---

## Security Architecture Overview

### Multi-Tenancy Model

MyWorkDay uses **row-level tenant isolation**:

```
┌──────────────────────────────────────────────┐
│                  Database                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Tenant A │  │ Tenant B │  │ Tenant C │   │
│  │  Data    │  │  Data    │  │  Data    │   │
│  └──────────┘  └──────────┘  └──────────┘   │
│       │              │              │        │
│       └──────────────┼──────────────┘        │
│                      ▼                       │
│             tenantId Column                  │
└──────────────────────────────────────────────┘
```

Every data table includes a `tenantId` column, and all queries are automatically scoped.

### Role Hierarchy

```
Super User (super_user)
    │
    ├── Access all tenants
    ├── Impersonate users
    └── System configuration
    
Tenant Admin (admin)
    │
    ├── Tenant settings
    ├── User management
    └── Integrations
    
Employee (employee)
    │
    ├── Projects/Tasks
    ├── Time tracking
    └── Client access
```

---

## Authentication

### Session Security

- **Session Store**: PostgreSQL (connect-pg-simple)
- **Cookie Settings**: `httpOnly`, `secure` (production), `sameSite: lax`
- **Session Duration**: 24 hours

### Password Security

- **Hashing**: bcrypt with cost factor 12
- **Reset Tokens**: Cryptographically secure, 1-hour expiry
- **Force Change**: `mustChangePasswordOnNextLogin` flag

### OAuth

- **Google OAuth**: Optional, verified email auto-links accounts
- **First User Bootstrap**: First Google login creates Super Admin if no users

---

## Authorization

### Middleware Guards

```typescript
// Any authenticated user
requireAuth

// Tenant admin or higher
requireTenantAdmin

// Super user only
requireSuperUser

// Tenant context required
requireTenantContext
```

### Resource Access

All resources validate:
1. User is authenticated
2. User has appropriate role
3. Resource belongs to user's tenant (or user is super)

---

## Data Protection

### Encryption at Rest

Integration secrets are encrypted with AES-256-GCM:

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set `APP_ENCRYPTION_KEY` environment variable.

### API Response Masking

Secrets are masked in API responses:
```
"apiKey": "••••XXXX"  # Shows only last 4 characters
```

---

## Rate Limiting

### Protected Endpoints

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/auth/login` | 5 attempts | 15 minutes |
| `/api/auth/register` | 3 attempts | 1 hour |
| `/api/auth/forgot-password` | 3 attempts | 1 hour |
| `/api/v1/super/bootstrap` | 3 attempts | 1 hour |

### Implementation

Rate limiting uses both IP and email-based tracking to prevent brute-force attacks.

---

## Tenancy Enforcement Modes

| Mode | Behavior |
|------|----------|
| `off` | No enforcement (development only) |
| `soft` | Log warnings, allow requests |
| `strict` | Block requests without valid tenant |

Set via `TENANCY_ENFORCEMENT` environment variable.

---

## Security Checklist

Before deployment, verify:

- [ ] `SESSION_SECRET` is cryptographically random
- [ ] `APP_ENCRYPTION_KEY` is set for secret encryption
- [ ] `NODE_ENV=production` for secure cookies
- [ ] `TRUST_PROXY=true` for Railway/reverse proxy
- [ ] Rate limiting environment variables configured
- [ ] Database connection uses SSL
- [ ] No debug flags enabled in production

---

## Related Sections

- [06-BACKEND](../06-BACKEND/) - Middleware details
- [08-DATABASE](../08-DATABASE/) - Data schema
- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Production configuration
