# Reference

**Status:** Current  
**Last Updated:** January 2026

This section contains complete reference documentation.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [GLOSSARY.md](./GLOSSARY.md) | Terms and definitions |
| [API_REFERENCE.md](./API_REFERENCE.md) | Complete API reference |
| [COMPONENT_REFERENCE.md](./COMPONENT_REFERENCE.md) | React component catalog |
| [SCHEMA_REFERENCE.md](./SCHEMA_REFERENCE.md) | Database schema reference |
| [ENV_VARS_REFERENCE.md](./ENV_VARS_REFERENCE.md) | All environment variables |
| [CLI_COMMANDS.md](./CLI_COMMANDS.md) | Useful commands |

---

## Glossary

| Term | Definition |
|------|------------|
| **Tenant** | An organization using the platform |
| **Super User** | Platform administrator |
| **Tenant Admin** | Tenant organization administrator |
| **Employee** | Regular tenant user |
| **Workspace** | Container for projects within a tenant |
| **Impersonation** | Super user viewing app as tenant user |
| **White Label** | Custom branding per tenant |

---

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session signing secret |
| `APP_ENCRYPTION_KEY` | 32-byte base64 encryption key |

### Production

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Set to `production` |
| `TRUST_PROXY` | Set to `true` for reverse proxy |

### Optional Integrations

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `MAILGUN_API_KEY` | Global email |
| `MAILGUN_DOMAIN` | Global email domain |
| `S3_*` | S3/R2 storage |
| `STRIPE_*` | Stripe payments |

### Debug Flags

| Variable | Description |
|----------|-------------|
| `MAILGUN_DEBUG` | Enable Mailgun logging |
| `SUPER_DEBUG_DELETE_ALLOWED` | Enable data deletion |
| `BACKFILL_TENANT_IDS_ALLOWED` | Enable backfill scripts |
| `SUPER_USER_PROVISION_DEBUG` | Enable provisioning logs |

---

## CLI Commands

### Development

```bash
npm run dev              # Start development server
npm run db:push          # Push schema changes
npm run db:studio        # Open Drizzle Studio
npm test                 # Run tests
```

### Production

```bash
npm run build            # Build for production
npm start                # Start production server
npx drizzle-kit generate # Generate migrations
npx drizzle-kit migrate  # Apply migrations
```

### Maintenance

```bash
# Backfill tenant IDs
BACKFILL_TENANT_IDS_ALLOWED=true node server/scripts/backfill_tenant_ids.ts

# Seed super admin
node server/scripts/seed_super_admin.ts
```

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `UNAUTHORIZED` | 401 | Authentication required |
| `FORBIDDEN` | 403 | Permission denied |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource conflict |
| `TIMER_ALREADY_RUNNING` | 409 | Active timer exists |
| `AGREEMENT_REQUIRED` | 451 | SaaS agreement not accepted |
| `RATE_LIMITED` | 429 | Too many requests |

---

## Related Sections

- [04-API](../04-API/) - API documentation
- [08-DATABASE](../08-DATABASE/) - Database schema
- [01-GETTING-STARTED](../01-GETTING-STARTED/) - Setup guide
