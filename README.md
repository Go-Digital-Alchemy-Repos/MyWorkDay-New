# MyWorkDay

An Asana-inspired project management application with comprehensive multi-tenancy support.

## Features

- **Project Management**: Workspaces, teams, projects, tasks with subtasks
- **Multiple Views**: Board, list, and calendar views
- **Multi-Tenancy**: Complete tenant isolation with white-label branding
- **Time Tracking**: Timer-based tracking with reports and CSV export
- **CRM**: Client management with contacts and project linking
- **Real-time Updates**: Live collaboration via WebSocket
- **File Attachments**: S3-based file storage with per-tenant configuration
- **Role-Based Access**: Employee, admin, and super user roles

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **Real-time**: Socket.IO
- **Routing**: Wouter (frontend)
- **State**: TanStack Query (React Query v5)
- **Calendar**: FullCalendar

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database
- npm or yarn

### Environment Setup

Create `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required variables:

```env
DATABASE_URL=postgres://user:pass@localhost:5432/myworkday
SESSION_SECRET=your-secure-random-string
APP_ENCRYPTION_KEY=<32 bytes base64-encoded>
```

Generate `APP_ENCRYPTION_KEY` with: `openssl rand -base64 32`

### Installation

```bash
npm install
```

### Database Setup

```bash
npx drizzle-kit push
```

### Development

```bash
npm run dev
```

The application runs on `http://localhost:5000`.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
├── client/               # React frontend
│   ├── src/
│   │   ├── pages/       # Route components
│   │   ├── components/  # Reusable components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utilities
│   └── README.md
├── server/               # Express backend
│   ├── routes/          # API route handlers
│   ├── middleware/      # Express middleware
│   ├── services/        # Business logic
│   ├── realtime/        # Socket.IO
│   ├── tests/           # Backend tests
│   └── README.md
├── shared/               # Shared code
│   └── schema.ts        # Database schema & types
├── docs/                 # Documentation
│   ├── AUDIT_CHECKLIST.md
│   ├── ENDPOINTS.md
│   ├── DEPLOYMENT_RAILWAY.md
│   └── SECURITY_TENANCY.md
└── design_guidelines.md  # UI/UX guidelines
```

## Documentation

- [API Endpoints](docs/ENDPOINTS.md) - Complete API reference
- [Feature Inventory](docs/FEATURE_INVENTORY.md) - All features and modules
- [Architecture Overview](docs/ARCHITECTURE_OVERVIEW.md) - Tech stack and flows
- [Environment Variables](docs/ENVIRONMENT_VARIABLES.md) - All env vars reference
- [Deployment Guide](docs/DEPLOYMENT_RAILWAY.md) - Railway deployment
- [Security & Tenancy](docs/SECURITY_TENANCY.md) - Multi-tenant isolation
- [Regression Checklist](docs/REGRESSION_CHECKLIST.md) - Manual test plan
- [Audit Findings](docs/AUDIT_FINDINGS.md) - Latest audit report

## Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
```

## Key Features

### Multi-Tenancy

- Complete data isolation between tenants
- Per-tenant branding (logo, colors, custom domain)
- Per-tenant integrations (Mailgun, S3)
- Super admin dashboard for tenant management

### Task Management

- Projects with board/list/calendar views
- Drag-and-drop task reordering
- Subtasks with assignees and due dates
- Tags, comments, and activity logging
- Multi-assignee support
- Personal task sections

### Time Tracking

- Start/pause/resume timer
- Manual time entry creation
- Project-based time reports
- CSV export functionality

### Client Management

- Client profiles with contacts
- Project-client linking
- Client portal invitations

## Environment Variables

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session encryption key |
| `APP_ENCRYPTION_KEY` | Tenant secret encryption (32 bytes, base64-encoded) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `5000` |
| `NODE_ENV` | Environment | `development` |
| `TENANCY_ENFORCEMENT` | Tenant isolation | `off` |
| `S3_BUCKET` | Global S3 bucket | - |
| `S3_REGION` | AWS region | - |
| `S3_ACCESS_KEY_ID` | AWS access key | - |
| `S3_SECRET_ACCESS_KEY` | AWS secret key | - |

## Documentation Standard

When adding features, follow these documentation requirements:

1. **Update FEATURE_INVENTORY.md** - Add new features/endpoints
2. **Update ENVIRONMENT_VARIABLES.md** - Add new env vars
3. **Add module header comments** - Annotate key files with purpose and invariants
4. **Update relevant README** - If changing setup or configuration

See `/docs/DOCUMENTATION_POLICY.md` for full guidelines and `/docs/DOCS_CHECKLIST.md` for verification.

## Recovery & Backups

Before major changes, create a recovery point:

```bash
git tag pre-refinement-roadmap-YYYYMMDD
```

For database backups, use Replit's checkpoint feature or manual `pg_dump`.

See `/docs/RECOVERY.md` for full rollback and restore procedures.

## Contributing

1. Create feature branch
2. Make changes
3. Add tests if applicable
4. Follow documentation checklist
5. Submit pull request

## License

Proprietary - All rights reserved
