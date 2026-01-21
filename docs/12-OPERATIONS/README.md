# Operations

**Status:** Current  
**Last Updated:** January 2026

This section covers system operations, monitoring, and maintenance.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [MONITORING.md](./MONITORING.md) | System monitoring |
| [BACKUPS.md](./BACKUPS.md) | Backup strategies |
| [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) | DR procedures |
| [SCALING.md](./SCALING.md) | Scaling considerations |
| [MAINTENANCE.md](./MAINTENANCE.md) | Maintenance tasks |

---

## System Health

### Health Check Endpoint

```
GET /api/health
```

### Super Admin System Status

Access via `/super-admin/status`:

- Database connectivity and latency
- S3/Mailgun integration status
- WebSocket connection status
- Tenant health metrics

---

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| API Response Time | Average endpoint latency | > 500ms |
| Database Connections | Active pool connections | > 80% |
| Error Rate | 5xx errors / total | > 1% |
| Active Timers | Running time trackers | N/A |

### Logging

Application logs include:
- Request ID for correlation
- Tenant context
- User actions
- Error stack traces

---

## Backups

### Database Backups

Railway/Neon provide automatic backups:
- Point-in-time recovery
- Daily snapshots
- 7-day retention

### Manual Backup

```bash
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql
```

---

## Maintenance Scripts

### Data Backfill

```bash
# Backfill missing tenant IDs
BACKFILL_TENANT_IDS_ALLOWED=true node server/scripts/backfill_tenant_ids.ts
```

### Data Purge

```bash
# Delete all application data (use with extreme caution)
PURGE_APP_DATA_ALLOWED=true PURGE_APP_DATA_CONFIRM=CONFIRM node server/scripts/purge_app_data.ts
```

---

## Routine Maintenance

### Weekly

- [ ] Review error logs
- [ ] Check disk usage
- [ ] Verify backup completion

### Monthly

- [ ] Database vacuum
- [ ] Review slow queries
- [ ] Update dependencies

### Quarterly

- [ ] Security audit
- [ ] Performance review
- [ ] Disaster recovery test

---

## Related Sections

- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Deployment setup
- [07-SECURITY](../07-SECURITY/) - Security operations
- [14-TROUBLESHOOTING](../14-TROUBLESHOOTING/) - Issue resolution
