# MyWorkDay Documentation

**Status:** Current  
**Last Updated:** January 2026

Welcome to the MyWorkDay documentation hub. MyWorkDay is a multi-tenant SaaS project management application with comprehensive features for project tracking, time management, client CRM, and team collaboration.

---

## Quick Navigation

| Category | Description |
|----------|-------------|
| [01-GETTING-STARTED](./01-GETTING-STARTED/) | Installation, environment setup, first deployment |
| [02-ARCHITECTURE](./02-ARCHITECTURE/) | System design, tech stack, database schema |
| [03-FEATURES](./03-FEATURES/) | Feature guides for all major modules |
| [04-API](./04-API/) | Complete API endpoint reference |
| [05-FRONTEND](./05-FRONTEND/) | React components, state management, routing |
| [06-BACKEND](./06-BACKEND/) | Express middleware, services, error handling |
| [07-SECURITY](./07-SECURITY/) | Tenant isolation, authentication, authorization |
| [08-DATABASE](./08-DATABASE/) | Schema reference, migrations, queries |
| [09-TESTING](./09-TESTING/) | Unit, integration, and E2E testing guides |
| [10-DEPLOYMENT](./10-DEPLOYMENT/) | Railway deployment, production setup |
| [11-DEVELOPMENT](./11-DEVELOPMENT/) | Coding standards, debugging, adding features |
| [12-OPERATIONS](./12-OPERATIONS/) | Monitoring, backups, maintenance |
| [13-INTEGRATIONS](./13-INTEGRATIONS/) | Mailgun, S3, Stripe, Google OAuth |
| [14-TROUBLESHOOTING](./14-TROUBLESHOOTING/) | Common errors and solutions |
| [15-REFERENCE](./15-REFERENCE/) | Glossary, complete API reference, CLI commands |
| [16-CHANGELOG](./16-CHANGELOG/) | Version history, migration guides |

---

## Quick Start

### For New Developers

1. **[Quick Start Guide](./01-GETTING-STARTED/QUICK_START.md)** - Get running in 5 minutes
2. **[Environment Variables](./01-GETTING-STARTED/ENVIRONMENT_VARIABLES.md)** - Required configuration
3. **[Architecture Overview](./02-ARCHITECTURE/SYSTEM_OVERVIEW.md)** - Understand the system

### For Feature Development

1. **[Project Structure](./02-ARCHITECTURE/PROJECT_STRUCTURE.md)** - File organization
2. **[Adding Features](./11-DEVELOPMENT/ADDING_FEATURES.md)** - How to add new features
3. **[API Conventions](./04-API/README.md)** - API design patterns

### For Deployment

1. **[Railway Deployment](./10-DEPLOYMENT/RAILWAY.md)** - Production deployment guide
2. **[Environment Setup](./10-DEPLOYMENT/ENVIRONMENT_SETUP.md)** - Production configuration
3. **[Troubleshooting](./14-TROUBLESHOOTING/DEPLOYMENT_ISSUES.md)** - Common deployment issues

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Express.js, TypeScript, Drizzle ORM |
| Database | PostgreSQL (Neon) |
| Real-time | Socket.IO |
| Deployment | Railway |

---

## Key Features

### Core Modules
- **Project Management** - Workspaces, projects, kanban boards, tasks, subtasks
- **Time Tracking** - Stopwatch timer, manual entries, reports
- **Client CRM** - Client management with 17+ fields, contacts, portal invitations
- **Team Collaboration** - Teams, multi-assignee tasks, comments

### Multi-Tenancy
- **Tenant Isolation** - Complete data separation between tenants
- **White Label Branding** - Custom logos, colors, app names per tenant
- **Super Admin Dashboard** - Global tenant management, reports, system health

### Integrations
- **Email** - Mailgun integration for transactional emails
- **Storage** - S3-compatible file uploads
- **Payments** - Stripe billing (optional)
- **Authentication** - Google OAuth (optional)

---

## Documentation Standards

All documentation follows these conventions:

- **Status Labels**: Current, Outdated, Draft
- **Last Updated**: Date of last significant update
- **Related Docs**: Links to related documents
- **Code Examples**: Practical, copy-paste-ready examples

---

## Contributing to Documentation

1. Keep documents focused on a single topic
2. Include practical code examples
3. Update the "Last Updated" date
4. Link to related documentation
5. Test all code examples before committing

---

## Legacy Documentation

The following documents from the previous structure are being migrated:

| Legacy File | New Location |
|-------------|--------------|
| ARCHITECTURE_OVERVIEW.md | 02-ARCHITECTURE/SYSTEM_OVERVIEW.md |
| ENDPOINTS.md | 04-API/API_REFERENCE.md |
| FEATURE_INVENTORY.md | 03-FEATURES/README.md |
| SECURITY_TENANCY.md | 07-SECURITY/TENANT_ISOLATION.md |
| DEPLOYMENT_RAILWAY.md | 10-DEPLOYMENT/RAILWAY.md |
| ENVIRONMENT_VARIABLES.md | 01-GETTING-STARTED/ENVIRONMENT_VARIABLES.md |

---

*For questions or issues, contact the development team.*
