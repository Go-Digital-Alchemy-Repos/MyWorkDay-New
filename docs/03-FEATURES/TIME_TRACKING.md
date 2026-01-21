# Time Tracking

**Status:** Current  
**Last Updated:** January 2026  
**Related Docs:** [API Reference](../04-API/), [Database Schema](../08-DATABASE/)

---

## Overview

MyWorkDay includes a comprehensive time tracking system with:
- Active timer with start/pause/resume/stop
- Manual time entry creation
- Client/Project/Task/Subtask association
- Cross-tab synchronization
- Persistent timer display in header

---

## Components

### GlobalActiveTimer

Displayed in the header when a timer is running:

```
┌──────────────────────────────────────────┐
│  [Logo]  MyWorkDay    ⏱ 01:23:45  [▶||] │
└──────────────────────────────────────────┘
```

Features:
- Persistent across all pages
- Real-time elapsed time display
- Pause/resume controls
- Click to expand details
- Cross-tab synchronization

### Time Tracking Page

Located at `/time-tracking`:

```
┌─────────────────────────────────────────────────┐
│ Time Tracking                    [+ Start Timer]│
├─────────────────────────────────────────────────┤
│ Today: 4h 32m                                   │
│ This Week: 28h 15m                              │
├─────────────────────────────────────────────────┤
│ Time Entries                                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ Project A > Task 1           2:30   [Edit]  │ │
│ │ Project B > Task 2           1:45   [Edit]  │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## Timer Operations

### Starting a Timer

```typescript
POST /api/timer/start
{
  "taskId": "uuid",      // Optional
  "description": "..."   // Optional
}
```

**Behavior:**
- Only one timer can run per user (enforced by unique index)
- Returns 409 with `TIMER_ALREADY_RUNNING` if timer exists
- Timer persists across sessions

### Pausing/Resuming

```typescript
POST /api/timer/pause
POST /api/timer/resume
```

**Behavior:**
- Optimistic UI updates with rollback on failure
- Pause stores accumulated duration
- Resume continues from paused state

### Stopping a Timer

```typescript
POST /api/timer/stop
{
  "taskId": "uuid",      // Optional (can be set at stop)
  "clientId": "uuid",    // Optional
  "description": "..."   // Optional
}
```

**Behavior:**
- Creates time entry in database
- Clears active timer
- Broadcasts update to other tabs

---

## Cross-Tab Synchronization

Timer state is synchronized across browser tabs using BroadcastChannel:

```typescript
const channel = new BroadcastChannel("active-timer-sync");

// Broadcast timer update
channel.postMessage({ type: "timer-updated" });

// Listen for updates
channel.onmessage = (event) => {
  if (event.data.type === "timer-updated") {
    refetchTimer();
  }
};
```

Fallback for older browsers uses `localStorage` events.

---

## Timer Reliability

### Periodic Refetch

Timer state is refetched periodically to ensure convergence:
- Running timer: every 30 seconds
- Paused timer: every 60 seconds

### Recovery Toast

On app boot, if a timer is running, a recovery toast is shown:

```
┌──────────────────────────────────────┐
│ ⏱ Timer recovered                    │
│ You have a timer running: 01:23:45   │
└──────────────────────────────────────┘
```

Uses `sessionStorage` to show once per timer per session.

### Error Handling

- Timer mutations preserve state on failure
- 409 errors show "timer already running" message
- Network errors don't clear timer state

---

## Cascading Selection

Time entries use cascading dropdowns:

```
Client → Project → Task → Subtask
```

**Behavior:**
- Selecting Client filters Projects to that client
- Selecting Project enables Task dropdown
- If Task has subtasks, Subtask dropdown appears
- Changing parent clears children

**Final assignment:**
```typescript
const finalTaskId = subtaskId || taskId;
```

---

## Database Schema

### active_timers

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| userId | uuid | User (unique index) |
| tenantId | uuid | Tenant |
| taskId | uuid | Associated task (optional) |
| clientId | uuid | Associated client (optional) |
| startedAt | timestamp | Timer start time |
| pausedAt | timestamp | Pause time (null if running) |
| accumulatedSeconds | integer | Time before current pause |
| status | enum | running, paused |
| description | text | Timer description |

### time_entries

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| userId | uuid | User |
| tenantId | uuid | Tenant |
| taskId | uuid | Associated task |
| clientId | uuid | Associated client |
| startTime | timestamp | Entry start |
| endTime | timestamp | Entry end |
| durationMinutes | integer | Duration in minutes |
| description | text | Entry description |
| scope | enum | task, subtask, direct |

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/timer/current` | Get active timer |
| POST | `/api/timer/start` | Start new timer |
| POST | `/api/timer/pause` | Pause timer |
| POST | `/api/timer/resume` | Resume timer |
| POST | `/api/timer/stop` | Stop and save entry |
| GET | `/api/time-entries` | List time entries |
| POST | `/api/time-entries` | Create manual entry |
| PATCH | `/api/time-entries/:id` | Update entry |
| DELETE | `/api/time-entries/:id` | Delete entry |

---

## Related Sections

- [04-API](../04-API/) - Full API reference
- [05-FRONTEND](../05-FRONTEND/) - Component docs
- [08-DATABASE](../08-DATABASE/) - Schema reference
