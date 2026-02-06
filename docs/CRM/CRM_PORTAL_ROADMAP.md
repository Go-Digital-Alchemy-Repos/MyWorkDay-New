# CRM & Client Portal Roadmap

> **Status**: Planning  
> **Last Updated**: 2026-02-06  
> **Feature Flags**: All features default to OFF until implementation is complete

---

## Overview

This roadmap outlines the expansion of MyWorkDay's client management capabilities into a full CRM and Client Collaboration platform. The system will provide a centralized "Customer 360" view for internal teams and a self-service Client Portal for external stakeholders.

All features are gated behind environment-driven feature flags (defaulting to `false`) so they can be enabled incrementally without disrupting existing functionality.

---

## 1. Customer 360 Client Profile

**Flag**: `CRM_CLIENT_360_ENABLED`

A unified client detail page with tabbed sections providing a complete picture of each client relationship.

### Tabs

| Tab | Description |
|-----|-------------|
| **Overview** | Company info, primary contact, lifetime value, account health score |
| **Contacts** | People associated with the client (see Section 2) |
| **Projects** | All projects linked to this client with status/budget summary |
| **Activity** | Unified timeline of all interactions (see Section 3) |
| **Notes** | Rich-text notes with categories and version history (existing feature, enhanced) |
| **Follow-ups** | Scheduled actions and pipeline tracking (see Section 5) |
| **Documents** | Files and deliverables (existing feature, enhanced) |
| **Financials** | Budget utilization, invoicing summary, profitability (see Section 10) |

### Data Model Considerations
- Extend existing `clients` table with CRM-specific fields (health score, lifecycle stage, source)
- New `client_contacts` table for multiple contacts per client
- New `client_interactions` table for activity timeline

---

## 2. Contacts Management

**Flag**: `CRM_CONTACTS_ENABLED`

Manage multiple contacts per client with role tracking and communication preferences.

### Features
- Add/edit/archive contacts per client
- Contact roles (primary, billing, technical, executive)
- Contact communication preferences (email, phone, portal)
- Contact activity log
- Bulk import via CSV
- Contact search across all clients

### Data Model
- `client_contacts` table: name, email, phone, role, title, notes, isPrimary, isActive
- Link table for contact-to-project associations

---

## 3. Activity Timeline

**Flag**: `CRM_TIMELINE_ENABLED`

A unified, chronological feed of all interactions with a client, aggregating events from across the platform.

### Event Sources
- Task status changes on client projects
- Comments and @mentions related to client work
- Notes created/updated
- Documents uploaded
- Time entries logged
- Follow-up completions
- Client portal interactions
- Chat messages (if client messaging enabled)
- Email communications (future)

### Features
- Filterable by event type, date range, user
- Pinnable important events
- Manual interaction logging (phone calls, meetings)
- Export timeline to PDF/CSV

---

## 4. Notes (Enhanced)

**Flag**: Part of `CRM_CLIENT_360_ENABLED` (existing feature enhancement)

Building on the existing client notes system with CRM-specific enhancements.

### Enhancements
- Note templates (meeting notes, call summary, status update)
- Linked follow-ups from notes
- @mention team members in notes
- Note sharing with client portal users (selective)
- Version diff viewer

---

## 5. Follow-ups & Pipeline

**Flag**: `CRM_CLIENT_360_ENABLED`

Track scheduled follow-up actions and manage client relationship pipeline stages.

### Follow-ups
- Create follow-up actions with due dates and assignees
- Recurring follow-ups (weekly check-in, monthly review)
- Follow-up reminders via notifications
- Link follow-ups to notes, contacts, or projects
- Overdue follow-up dashboard

### Pipeline
- Configurable pipeline stages (Lead, Proposal, Active, At-Risk, Churned)
- Drag-and-drop pipeline board view
- Stage transition history
- Win/loss tracking with reasons
- Pipeline value forecasting

---

## 6. Client Portal Dashboard

**Flag**: `CRM_PORTAL_ENABLED`

Enhanced self-service portal for client-role users with a comprehensive dashboard.

### Dashboard Widgets
- Active projects summary with status indicators
- Pending approvals count
- Recent deliverables
- Upcoming deadlines
- Unread messages
- Quick actions (approve, comment, upload)

### Enhancements over Current Portal
- Customizable widget layout
- Client-specific branding (logo, colors)
- Notification preferences
- Document download center

---

## 7. Client Messaging

**Flag**: `CRM_CLIENT_MESSAGING_ENABLED`

Secure messaging channel between internal team members and client portal users.

### Features
- Dedicated client conversation threads
- Internal-only vs. client-visible message toggle
- File attachments in messages
- @mention support
- Read receipts
- Message search
- Notification integration
- Auto-archive after inactivity period

### Integration Points
- Activity timeline events
- Client portal notification badge
- Email fallback for offline clients

---

## 8. Files & Deliverables Library

**Flag**: `CRM_FILES_ENABLED`

Centralized file management for client deliverables with version tracking and approval workflows.

### Features
- Organized folder structure per project/client
- Version history per file
- File categories (deliverable, reference, contract, invoice)
- Bulk upload with drag-and-drop
- Preview support (images, PDFs)
- Download tracking (who downloaded, when)
- Expiring share links for external access
- Storage quota management per tenant

### Integration with Cloudflare R2
- Leverages existing R2 storage infrastructure
- Presigned URLs for secure access
- Automatic compression for images

---

## 9. Review & Approve Workflows

**Flag**: `CRM_APPROVALS_ENABLED`

Structured approval workflows for deliverables and milestones.

### Features
- Create approval requests linked to files or milestones
- Multi-step approval chains (sequential or parallel)
- Approve / Request Changes / Reject actions
- Approval comments and annotations
- Deadline-based auto-escalation
- Approval history and audit trail
- Client portal approval interface

### Workflow Configuration
- Template-based approval flows
- Configurable approver roles
- Auto-notification on status changes
- SLA tracking for approval turnaround

---

## 10. Profitability Summaries (Admin)

**Flag**: Part of `CRM_CLIENT_360_ENABLED`

Financial overview for administrators showing client and project profitability.

### Metrics
- Revenue per client (if billing integrated)
- Cost per client (time entries x hourly rates)
- Profit margin by client/project
- Budget utilization percentage
- Billable vs. non-billable hours ratio
- Monthly/quarterly trend charts

### Reports
- Client profitability ranking
- Project profitability comparison
- Team cost allocation
- Budget burn-down charts
- Export to CSV/PDF

---

## Feature Flag Reference

| Flag | Default | Scope | Controls |
|------|---------|-------|----------|
| `CRM_CLIENT_360_ENABLED` | `false` | Tenant Admin | Customer 360 profile, notes enhancements, follow-ups, pipeline, profitability |
| `CRM_CONTACTS_ENABLED` | `false` | Tenant Admin | Contacts management per client |
| `CRM_TIMELINE_ENABLED` | `false` | Tenant Admin | Unified activity timeline |
| `CRM_PORTAL_ENABLED` | `false` | Client Portal | Enhanced client portal dashboard |
| `CRM_FILES_ENABLED` | `false` | Tenant Admin | Files & deliverables library |
| `CRM_APPROVALS_ENABLED` | `false` | Tenant Admin + Portal | Review & approve workflows |
| `CRM_CLIENT_MESSAGING_ENABLED` | `false` | Tenant Admin + Portal | Client messaging system |

---

## Implementation Phases

### Phase A: Foundation (Current)
- Feature flags infrastructure
- Navigation placeholders
- Roadmap documentation

### Phase B: Customer 360 Core
- Enhanced client profile page with tabs
- Contacts management
- Activity timeline aggregation
- Notes enhancements

### Phase C: Pipeline & Follow-ups
- Follow-up action system
- Pipeline stages and board view
- Pipeline reporting

### Phase D: Client Portal Enhancement
- Portal dashboard redesign
- Client messaging
- Files & deliverables library

### Phase E: Approvals & Financials
- Review & approve workflows
- Profitability summaries
- Advanced reporting

---

## Dependencies

- Existing `clients` table and client management routes
- Existing `client_notes` and `client_documents` features
- Existing client portal authentication and routing
- Cloudflare R2 storage infrastructure
- Socket.IO real-time infrastructure (for messaging)
- Notification system (for follow-ups and approvals)

---

## Non-Goals (Out of Scope)

- Full email integration (CRM email sync)
- Marketing automation
- Lead scoring algorithms
- Third-party CRM import/export (Salesforce, HubSpot)
- Mobile-native client portal app
