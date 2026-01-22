# Chat Debugging Guide

This document describes how to enable and use chat diagnostics for troubleshooting chat issues.

## Overview

Chat debugging provides safe observability for diagnosing chat issues including:
- Socket disconnects and reconnection problems
- Duplicate message delivery
- Membership synchronization issues
- Message delivery failures

**Important**: Chat debugging only adds diagnostics - it does not change chat behavior.

## Enabling Chat Debug

### Environment Variable

Set the `CHAT_DEBUG` environment variable to enable diagnostics:

```bash
CHAT_DEBUG=true
```

### On Railway

1. Go to your Railway project dashboard
2. Navigate to **Variables** section
3. Add a new variable:
   - Key: `CHAT_DEBUG`
   - Value: `true`
4. Redeploy your application

### Local Development

Add to your `.env` file or set in your shell:

```bash
export CHAT_DEBUG=true
```

## Accessing Diagnostics

Chat diagnostics are available only to **Super Admin** users when `CHAT_DEBUG=true`.

### Super Admin Dashboard

1. Log in as a Super Admin
2. Navigate to **System Status** (or Settings → Status)
3. Click the **Chat Debug** tab

### Metrics Available

| Metric | Description |
|--------|-------------|
| Active Sockets | Number of currently connected WebSocket clients |
| Rooms Joined | Total number of chat room subscriptions |
| Messages (5m) | Messages sent in the last 5 minutes |
| Disconnects (5m) | Socket disconnections in the last 5 minutes |
| Last Errors | Recent error codes with counts |

### Event Types Tracked

| Event | Description |
|-------|-------------|
| `socket_connected` | Client established WebSocket connection |
| `socket_disconnected` | Client disconnected (includes reason) |
| `auth_session_missing` | Socket connected without valid session |
| `room_joined` | Client joined a chat room |
| `room_left` | Client left a chat room |
| `room_access_denied` | Client denied access to chat room |
| `message_send_attempt` | Message send initiated |
| `message_persisted` | Message saved to database |
| `message_broadcast` | Message emitted to room |
| `error` | General error occurred |

## Request ID Correlation

Every chat-related error includes a **Request ID** that can be used to trace issues in server logs.

### Finding Request ID

When a chat action fails:
1. The toast notification displays the Request ID
2. Copy the Request ID from the notification
3. Search server logs for this ID to find related events

### In Server Logs

Search for the request ID:

```bash
grep "requestId=abc123" logs/app.log
```

Or in Railway logs:
```
requestId=abc123
```

## Common Failure Patterns

### Disconnect Loops

**Symptoms**: 
- High disconnect count
- Users reporting frequent reconnections

**Diagnosis**:
1. Check `disconnectsLast5Min` metric
2. Look for `socket_disconnected` events
3. Note the `disconnectReason` field

**Common Causes**:
- Network instability
- Session cookie issues
- Proxy timeout settings

### Duplicate Joins

**Symptoms**:
- Same user joining room multiple times
- Duplicate messages appearing

**Diagnosis**:
1. Check events for same userId with multiple `room_joined` events
2. Look for timing patterns

**Common Causes**:
- Component re-renders causing multiple joins
- Socket reconnection without proper cleanup

### Membership Mismatch

**Symptoms**:
- User can't see messages they should
- "Not a member" errors

**Diagnosis**:
1. Check for `room_access_denied` events
2. Compare `tenantId` values
3. Look for `ACCESS_DENIED` error codes

**Common Causes**:
- Tenant context not properly set
- User removed from channel without notification
- Cache inconsistency

### Message Delivery Failure

**Symptoms**:
- Messages stuck in "pending" state
- "Failed to send" errors

**Diagnosis**:
1. Find `message_send_attempt` event
2. Check if `message_persisted` followed
3. Check if `message_broadcast` followed
4. Note the `requestId` for log correlation

**Common Causes**:
- Database write failure
- Validation error
- Network timeout

## Copying Diagnostics Snapshot

1. Go to **Chat Debug** tab
2. Click **Copy Snapshot** button
3. JSON snapshot is copied to clipboard

The snapshot includes:
- Current timestamp
- All metrics
- Last 50 events
- Active socket count

**Note**: The snapshot does not include message content or PII.

## Security Considerations

- Debug data is **only visible to Super Admins**
- When `CHAT_DEBUG=false`, endpoints return 404 (no information leaked)
- **Never log message bodies** - only IDs and metadata
- **Never log secrets** or authentication tokens
- Event data is ephemeral (in-memory only)

## API Endpoints

When `CHAT_DEBUG=true`, these endpoints are available:

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/super/debug/chat/status` | Check if debug is enabled |
| `GET /api/v1/super/debug/chat/metrics` | Get current metrics |
| `GET /api/v1/super/debug/chat/events?limit=200` | Get recent events |
| `GET /api/v1/super/debug/chat/sockets` | Get active socket list |

All endpoints require Super Admin authentication.

## Troubleshooting Checklist

- [ ] Is `CHAT_DEBUG=true` set in environment?
- [ ] Are you logged in as Super Admin?
- [ ] Check browser console for errors
- [ ] Check server logs with Request ID
- [ ] Review socket events timeline
- [ ] Check for tenant ID mismatches
- [ ] Verify session cookie is being sent
