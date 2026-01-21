# Integrations

**Status:** Current  
**Last Updated:** January 2026

This section covers third-party service integrations.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [MAILGUN.md](./MAILGUN.md) | Email integration |
| [S3.md](./S3.md) | File storage |
| [STRIPE.md](./STRIPE.md) | Payment integration |
| [GOOGLE_OAUTH.md](./GOOGLE_OAUTH.md) | Google authentication |
| [CUSTOM_INTEGRATIONS.md](./CUSTOM_INTEGRATIONS.md) | Adding new integrations |

---

## Integration Overview

MyWorkDay supports both global and per-tenant integrations:

| Integration | Global | Per-Tenant |
|-------------|--------|------------|
| Email (Mailgun) | ✓ | ✓ |
| Storage (S3/R2) | ✓ | ✓ |
| Payments (Stripe) | ✓ | - |
| Auth (Google OAuth) | ✓ | - |

---

## Mailgun

### Configuration

**Global (Environment Variables):**
```env
MAILGUN_API_KEY=key-xxx
MAILGUN_DOMAIN=mg.example.com
```

**Per-Tenant (Settings > Integrations):**
- API Key (encrypted)
- Domain
- From address

### Features

- Transactional emails (invites, resets)
- Email outbox logging
- Test email functionality
- Delivery status tracking

---

## S3/R2 Storage

### Configuration

```env
S3_ENDPOINT=https://xxx.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=xxx
S3_SECRET_ACCESS_KEY=xxx
S3_BUCKET_NAME=myworkday
S3_REGION=auto
```

### Upload Categories

| Category | Access | Max Size |
|----------|--------|----------|
| global-branding-* | Super Admin | 5MB |
| tenant-branding-* | Tenant Admin | 5MB |
| user-avatar | Authenticated | 2MB |
| task-attachment | Authenticated | 10MB |

---

## Stripe

### Configuration

```env
STRIPE_SECRET_KEY=sk_xxx
STRIPE_PUBLISHABLE_KEY=pk_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

### Features

- Tenant billing management
- Subscription plans
- Usage-based billing

---

## Google OAuth

### Configuration

```env
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx
```

### Features

- Login with Google
- Auto-link verified emails
- First user bootstrap

---

## Secret Management

Integration secrets are encrypted with AES-256-GCM:

```bash
# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Set `APP_ENCRYPTION_KEY` environment variable.

API responses mask secrets: `••••XXXX`

---

## Related Sections

- [01-GETTING-STARTED](../01-GETTING-STARTED/) - Environment setup
- [07-SECURITY](../07-SECURITY/) - Secret encryption
- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Production config
