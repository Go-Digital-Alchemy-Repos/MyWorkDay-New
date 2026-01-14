# Bootstrap Super Admin Guide

This document explains how to create the first Super Admin account in production when no users exist.

## Overview

MyWorkDay supports two methods for creating the initial Super Admin:

1. **Web Bootstrap** - Use the login page UI (recommended for most deployments)
2. **Seed Script** - Use a CLI script with environment variables (for automated deployments)

## Method 1: Web Bootstrap (Recommended)

When no users exist in the database, the login page displays a "Create first admin account" button.

### Steps

1. Navigate to `/login` in your browser
2. If no users exist, you'll see a "Create first admin account" button
3. Click it to show the registration form
4. Enter:
   - First Name
   - Last Name
   - Email (this will be your login)
   - Password (minimum 8 characters)
5. Click "Create Admin Account"
6. You'll be logged in automatically and redirected to the Super Admin dashboard

### Security Notes

- This UI only appears when the database has zero users
- Once any user exists, the bootstrap option disappears permanently
- The first account created is automatically assigned the `super_user` role

## Method 2: Seed Script (CLI)

For automated deployments or when you can't access the web UI, use the seed script.

### Prerequisites

- Access to the server environment (e.g., Railway one-off command, SSH)
- Database connection configured via `DATABASE_URL`

### Required Environment Variables

| Variable | Description |
|----------|-------------|
| `SEED_SUPER_ADMIN_ALLOWED` | Must be set to `true` to run the script |
| `SEED_SUPER_ADMIN_EMAIL` | Email for the super admin account |
| `SEED_SUPER_ADMIN_PASSWORD` | Password (minimum 8 characters) |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEED_SUPER_ADMIN_FIRSTNAME` | "Super" | First name |
| `SEED_SUPER_ADMIN_LASTNAME` | "Admin" | Last name |

### Running the Script

**Locally:**
```bash
SEED_SUPER_ADMIN_ALLOWED=true \
SEED_SUPER_ADMIN_EMAIL=admin@example.com \
SEED_SUPER_ADMIN_PASSWORD=securepassword123 \
npx tsx server/scripts/seed_super_admin.ts
```

**Railway One-Off Command:**
```bash
# In Railway dashboard, go to your service → Settings → one-off commands
# Or use the Railway CLI:

railway run --service=<service-name> -- \
  SEED_SUPER_ADMIN_ALLOWED=true \
  SEED_SUPER_ADMIN_EMAIL=admin@example.com \
  SEED_SUPER_ADMIN_PASSWORD=securepassword123 \
  npx tsx server/scripts/seed_super_admin.ts
```

### Safety Guards

The seed script enforces strict safety rules:

1. **Environment Flag Required** - Won't run without `SEED_SUPER_ADMIN_ALLOWED=true`
2. **No Existing Super Admin** - Refuses if any `super_user` already exists
3. **No Auto-Promotion** - Refuses if email exists with a different role (won't auto-promote)
4. **Password Not Logged** - Only the user ID and email are logged, never the password

### Example Output

```
[seed-super-admin] Starting (requestId: abc123...)
[seed-super-admin] SUCCESS: Super admin created
[seed-super-admin] User ID: usr_xxxx
[seed-super-admin] Email: admin@example.com
[seed-super-admin] You can now login at /login
```

## Railway Environment Checklist

When deploying to Railway, ensure these environment variables are configured:

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | PostgreSQL connection string (auto-set by Railway) |
| `SESSION_SECRET` | Yes | Secure random string for session encryption |
| `NODE_ENV` | Recommended | Set to `production` for secure cookies |
| `COOKIE_DOMAIN` | Optional | Only needed for custom domains |

### Cookie Configuration for Production

The app automatically configures cookies for production:

- `httpOnly: true` - Prevents XSS attacks
- `secure: true` - Only sent over HTTPS (when `NODE_ENV=production`)
- `sameSite: "lax"` - CSRF protection while allowing same-site navigation
- `trust proxy: 1` - Correctly handles Railway's reverse proxy

## Troubleshooting

### "Login twice" symptom

If you need to log in twice for the session to work:

1. Check that `trust proxy` is enabled (it is by default)
2. Verify `NODE_ENV=production` is set in Railway
3. Check browser devtools for `Set-Cookie` header in login response
4. Ensure all fetch calls include `credentials: "include"`

### Cookie not being set

1. Open browser devtools → Network tab
2. Look at the login response headers
3. Verify `Set-Cookie: connect.sid=...` is present
4. Check for `Secure` flag (requires HTTPS in production)

### Session expires immediately

1. Verify `SESSION_SECRET` is set (not using dev fallback)
2. Check that the PostgreSQL session table exists (`user_sessions`)
3. Verify database connection is stable

## Auth Diagnostics Endpoint

Super Admins can check auth configuration via:

```
GET /api/v1/super/status/auth-diagnostics
```

Returns:
```json
{
  "cookie": {
    "httpOnly": true,
    "secure": true,
    "sameSite": "lax",
    "maxAge": "30 days"
  },
  "trustProxyEnabled": true,
  "corsCredentialsEnabled": true,
  "sessionStoreType": "PostgreSQL (connect-pg-simple)",
  "environment": {
    "SESSION_SECRET_SET": true,
    "NODE_ENV": "production",
    "DATABASE_URL_SET": true
  },
  "recommendations": []
}
```

## Verification Steps

After creating the Super Admin:

1. **Login works once** - Single login should authenticate you
2. **Session persists** - Refreshing the page keeps you logged in
3. **`/api/auth/me` returns user** - Check devtools for correct response
4. **Bootstrap UI disappears** - Login page no longer shows "Create first admin"

## Related Documentation

- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - API error codes and handling
- [PERFORMANCE_NOTES.md](./PERFORMANCE_NOTES.md) - Query optimization details
