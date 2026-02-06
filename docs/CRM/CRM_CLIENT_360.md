# Client 360 View

## Overview
The Client 360 view (`/clients/:id/360`) provides a comprehensive, tabbed interface for managing all aspects of a client relationship. It is gated behind the `CRM_CLIENT_360_ENABLED` feature flag.

## Navigation
Access via:
- Client detail page header link (when flag enabled)
- Direct URL: `/clients/:clientId/360`

## Tabs

### Overview
Displays CRM summary cards and quick action buttons.

**Summary Cards:**
- Pipeline Status (lead/prospect/active/past/on_hold)
- Owner (assigned user)
- Next Follow-up date
- Open Projects count
- Open Tasks count
- Hours Tracked (total + billable)

**Quick Actions:**
- Add Project (links to client detail)
- Add Contact (navigates to Contacts tab)
- Add Note (navigates to Notes tab)
- Message Client (navigates to Messages tab, if enabled)
- Upload File (if files enabled)
- Request Approval (opens dialog, if approvals enabled)
- Invite to Portal (links to client detail, if portal enabled)

### Contacts
CRUD management of client contact persons.

**Features:**
- DataToolbar with search by name, email, or phone
- Add/Edit contact via slide-out drawer
- Mark contact as primary
- Delete with confirmation
- Fields: firstName, lastName, email, phone, title, isPrimary, notes

### Activity
Timeline of client-related activity events.

### Files
Document management with Cloudflare R2 storage.

**Features:**
- DataToolbar with search and client-visibility filter
- Upload files with category assignment
- Toggle client-visible flag
- Download files
- Delete with confirmation

### Notes
Rich text notes with author and timestamp tracking.

**Features:**
- TipTap-based rich text editor
- Notes feed sorted by creation date
- Author attribution

### Reports
Client profitability dashboard (admin-only).

**Features:**
- Summary cards: total hours, billable hours, non-billable hours, revenue estimate
- Stacked bar charts: hours by project, hours by employee (Recharts)
- Time entries table with CSV export
- Date range filtering

### Approvals (flag: `CRM_APPROVALS_ENABLED`)
Approval request management.

**Features:**
- DataToolbar with search and status filter (pending/approved/changes_requested)
- Create approval requests
- View approval status and client responses
- Filtered list with empty state messaging

### Messages (flag: `CRM_CLIENT_MESSAGING_ENABLED`)
Client-safe messaging.

**Features:**
- DataToolbar with search by subject or message body
- Conversation list with unread indicators
- Threaded message view
- Create new conversations
- Close conversations (makes them read-only)

## UX Details
- All tab content uses `animate-tab-in` CSS class for subtle 200ms fade-in transitions
- Respects `prefers-reduced-motion` media query
- DataToolbar provides consistent filtering across list tabs
- Empty states show contextual messaging for both empty data and filtered-no-results scenarios
