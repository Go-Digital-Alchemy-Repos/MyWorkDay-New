# Getting Started

**Status:** Current  
**Last Updated:** January 2026

This section covers everything you need to get MyWorkDay running locally and deployed to production.

---

## Documents in This Section

| Document | Description |
|----------|-------------|
| [QUICK_START.md](./QUICK_START.md) | 5-minute setup guide for local development |
| [INSTALLATION.md](./INSTALLATION.md) | Detailed installation instructions |
| [ENVIRONMENT_VARIABLES.md](./ENVIRONMENT_VARIABLES.md) | Complete environment variable reference |
| [FIRST_DEPLOY.md](./FIRST_DEPLOY.md) | First Railway deployment guide |

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL database
- Git

### 1. Clone and Install

```bash
git clone <repository-url>
cd myworkday
npm install
```

### 2. Configure Environment

Create a `.env` file with minimum required variables:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/myworkday
SESSION_SECRET=your-random-secret-here
```

### 3. Setup Database

```bash
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:5000` - the first user to register becomes Super Admin.

---

## Next Steps

- **[Environment Variables](./ENVIRONMENT_VARIABLES.md)** - Configure all options
- **[First Deploy](./FIRST_DEPLOY.md)** - Deploy to Railway
- **[Architecture Overview](../02-ARCHITECTURE/SYSTEM_OVERVIEW.md)** - Understand the system

---

## Related Sections

- [02-ARCHITECTURE](../02-ARCHITECTURE/) - System design and database schema
- [10-DEPLOYMENT](../10-DEPLOYMENT/) - Production deployment guides
- [14-TROUBLESHOOTING](../14-TROUBLESHOOTING/) - Common issues and solutions
