# Troubleshooting

**Status:** Current  
**Last Updated:** January 2026

This section covers common issues and their solutions.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [COMMON_ERRORS.md](./COMMON_ERRORS.md) | Common errors and solutions |
| [TENANT_ISSUES.md](./TENANT_ISSUES.md) | Tenant-specific issues |
| [AUTH_ISSUES.md](./AUTH_ISSUES.md) | Authentication problems |
| [DATABASE_ISSUES.md](./DATABASE_ISSUES.md) | Database problems |
| [DEPLOYMENT_ISSUES.md](./DEPLOYMENT_ISSUES.md) | Deployment problems |
| [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) | Known bugs and limitations |

---

## Quick Diagnostics

### Check Application Health

```bash
curl https://your-app.railway.app/api/health
```

### Check Database Connection

```bash
psql $DATABASE_URL -c "SELECT 1"
```

### Check Logs

Access Railway logs or use:
```bash
railway logs
```

---

## Common Errors

### "No tenant context"

**Cause**: Request missing tenant context

**Solutions**:
1. Ensure user is assigned to a tenant
2. Super admins: Use `X-Tenant-Id` header
3. Check `TENANCY_ENFORCEMENT` mode

### "Session expired"

**Cause**: Session cookie expired or invalid

**Solutions**:
1. Clear cookies and re-login
2. Check `SESSION_SECRET` hasn't changed
3. Verify session store connectivity

### "Rate limited"

**Cause**: Too many requests from IP/email

**Solutions**:
1. Wait for rate limit window to expire
2. Check rate limit configuration
3. Contact admin for IP whitelist

### "Agreement required"

**Cause**: User hasn't accepted current SaaS agreement

**Solutions**:
1. Redirect to `/accept-terms`
2. Check agreement status via API
3. Verify agreement is active

---

## Authentication Issues

### Can't Login

1. Verify email/password are correct
2. Check if account is locked (rate limiting)
3. Verify `mustChangePasswordOnNextLogin` flag
4. Check session store connectivity

### Google OAuth Fails

1. Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
2. Check redirect URI configuration
3. Verify domain in Google Console

### Password Reset Not Working

1. Check Mailgun configuration
2. Verify email outbox for status
3. Check token expiration (1 hour)

---

## Database Issues

### Connection Failed

1. Verify `DATABASE_URL` format
2. Check PostgreSQL is running
3. Verify network/firewall rules
4. Check connection pool limits

### Migration Failed

1. Review migration SQL for errors
2. Check for conflicting schema
3. Rollback and retry with fixes

### Slow Queries

1. Check for missing indexes
2. Use `EXPLAIN ANALYZE`
3. Review N+1 query patterns

---

## Deployment Issues

### App Won't Start

1. Check build logs for errors
2. Verify all environment variables set
3. Check for port conflicts
4. Review health check endpoint

### CSS/Assets Not Loading

1. Clear browser cache
2. Check Vite build output
3. Verify static file serving

---

## Getting Help

1. Check this troubleshooting section
2. Search existing issues
3. Review application logs
4. Contact development team

---

## Related Sections

- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Deployment configuration
- [12-OPERATIONS](../12-OPERATIONS/) - System monitoring
- [07-SECURITY](../07-SECURITY/) - Security configuration
