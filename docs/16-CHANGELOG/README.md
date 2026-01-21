# Changelog

**Status:** Current  
**Last Updated:** January 2026

This section tracks version history and migration guides.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [CHANGELOG.md](./CHANGELOG.md) | Version history |
| [MIGRATION_GUIDES.md](./MIGRATION_GUIDES.md) | Version migration guides |
| [ROADMAP.md](./ROADMAP.md) | Future plans |

---

## Recent Changes

### January 2026

#### Timer Reliability Hardening
- Added cross-tab synchronization via BroadcastChannel
- Implemented periodic refetch (30s running, 60s paused)
- Added recovery toast on app boot for running timers
- Changed `/api/timer/start` to return 409 for duplicate timers
- Added optimistic mutations with rollback for pause/resume

#### Super Admin Enhancements
- User provisioning workflow with SET_PASSWORD and RESET_LINK methods
- User impersonation with proper session management
- Bulk CSV import for users, clients, projects, tasks
- Seed welcome project and task templates

#### Security Improvements
- Query cache cleared on logout to prevent data leakage
- AES-256-GCM encryption for integration secrets
- Rate limiting on auth endpoints
- SaaS agreement enforcement middleware

#### Multi-Tenancy
- Tenant drawer with comprehensive management UI
- Tenant onboarding 4-step wizard
- White-label branding per tenant
- Act-as-tenant mode for super admins

---

## Version History

| Version | Date | Highlights |
|---------|------|------------|
| Current | Jan 2026 | Timer reliability, user provisioning |
| Previous | Dec 2025 | Multi-tenancy, super admin suite |

---

## Migration Notes

### Breaking Changes

None currently documented.

### Upgrade Steps

1. Pull latest code
2. Run `npm install`
3. Generate and apply migrations
4. Restart application

---

## Roadmap

### Planned Features

- [ ] Mobile-responsive improvements
- [ ] Advanced reporting
- [ ] API webhooks
- [ ] Slack integration

### Under Consideration

- Native mobile app
- Offline support
- AI-powered task suggestions

---

## Related Sections

- [01-GETTING-STARTED](../01-GETTING-STARTED/) - Setup guide
- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Deployment
- [14-TROUBLESHOOTING](../14-TROUBLESHOOTING/) - Common issues
