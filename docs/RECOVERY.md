# Recovery Guide

This document provides instructions for recovering the application and database to a known good state.

---

## Pre-Refinement Recovery Point

Before starting the refinement roadmap work, create a recovery point:

### 1. Create Git Tag (Manual Step)

Run this command in your shell:

```bash
git tag pre-refinement-roadmap-20260114
git push origin pre-refinement-roadmap-20260114
```

Or create a branch:

```bash
git checkout -b backup/pre-refinement-20260114
git push origin backup/pre-refinement-20260114
git checkout main
```

### 2. Verify Tag/Branch Created

```bash
git tag -l | grep pre-refinement
# or
git branch -a | grep backup
```

---

## Database Backup Strategy

### Replit PostgreSQL (Neon-backed)

Replit provides automatic point-in-time restore for production databases:

1. **Access Database Pane** - Open your Replit workspace and navigate to the Database tab
2. **Point-in-Time Restore** - Use the restore feature to recover to a specific earlier state
3. **7-Day Retention** - Deleted databases can be recovered within 7 days via support

**To backup before major changes:**
- Use the Rollback feature in the Agent tab
- Select "Database" under "Additional rollback options"
- This creates a checkpoint of both code and database state

### Manual Database Export (Recommended Before Major Changes)

```bash
# Export current database state
pg_dump $DATABASE_URL > backup_20260114.sql

# Store the backup file securely
```

### Railway PostgreSQL

If using Railway for production:

1. **Dashboard Backups** - Railway provides automatic daily backups
2. **Manual Snapshots** - Create snapshots via Railway dashboard before major changes
3. **Export** - Use `pg_dump` to export data manually

---

## Rollback Procedures

### Code Rollback to Tag/Branch

**Option 1: Checkout the tag**
```bash
git checkout pre-refinement-roadmap-20260114
```

**Option 2: Revert to the tag on main**
```bash
git checkout main
git reset --hard pre-refinement-roadmap-20260114
git push --force origin main  # CAUTION: Force push
```

**Option 3: Use Replit Checkpoints**
- Open the Agent tab in Replit
- Click "View Checkpoints" 
- Select the checkpoint before refinement changes
- Click "Restore"

### Database Rollback

**Replit Database:**
1. Open the Agent tab
2. Click "View Checkpoints"
3. Select "Database" in "Additional rollback options"
4. Choose the checkpoint to restore to
5. Confirm the restore

**Manual Restore from SQL Backup:**
```bash
# WARNING: This will overwrite current data
psql $DATABASE_URL < backup_20260114.sql
```

**Railway Database:**
1. Go to Railway dashboard
2. Select your PostgreSQL service
3. Navigate to Backups tab
4. Select the backup to restore
5. Confirm restoration

---

## Recovery Checklist

Before starting any major changes:

- [ ] Git tag/branch created for code recovery
- [ ] Database backup taken (pg_dump or dashboard snapshot)
- [ ] Backup file stored securely (if manual export)
- [ ] Tested that application works at current state
- [ ] Noted current test pass count for comparison

After recovery:

- [ ] Application starts without errors
- [ ] Database connections working
- [ ] Tests pass at expected rate
- [ ] Critical features verified working

---

## Emergency Contacts

- **Replit Support** - For database recovery issues, contact Replit support
- **Railway Support** - For Railway deployment issues

---

## Related Documentation

- [Replit Rollback Feature](https://docs.replit.com/) - Code and database checkpoints
- [Railway Backups](https://docs.railway.app/) - Database backup and restore
- [PostgreSQL pg_dump](https://www.postgresql.org/docs/current/app-pgdump.html) - Manual backup utility

---

*Created: January 14, 2026*
*Last Updated: January 14, 2026*
