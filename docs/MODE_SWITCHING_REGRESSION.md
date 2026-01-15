# Mode Switching Regression Checklist

Manual test cases for validating super/tenant mode switching behavior.

## Prerequisites

- Super admin user account
- At least one active tenant in the system
- Browser DevTools console open

---

## Test Cases

### 1. Basic Mode Switching

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1.1 | Log in as super admin | Should see Super Admin dashboard |
| 1.2 | Click on a tenant in the list | ImpersonationBanner appears, tenant data loads |
| 1.3 | Navigate to Projects page | Should see tenant's projects (not other tenants) |
| 1.4 | Click "Exit" on ImpersonationBanner | Returns to Super Admin dashboard |
| 1.5 | Check console for errors | No React warnings, no 404/403 errors |

### 2. Cache Isolation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 2.1 | As super admin, impersonate Tenant A | Tenant A data loads |
| 2.2 | Create a new project in Tenant A | Project appears in list |
| 2.3 | Exit impersonation | Returns to Super Admin |
| 2.4 | Impersonate Tenant B | Tenant B data loads, no Tenant A projects |
| 2.5 | Return to Tenant A | Tenant A projects visible again |

### 3. Deleted Tenant Recovery

| Step | Action | Expected Result |
|------|--------|-----------------|
| 3.1 | Impersonate a tenant | ImpersonationBanner shows |
| 3.2 | In another tab, delete that tenant | (via Super Admin) |
| 3.3 | Refresh the page | Should auto-exit to Super Admin |
| 3.4 | Check console | Should see warning about inaccessible tenant |

### 4. Deep Link Handling with URL Restoration

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4.1 | Log in as super admin (not impersonating) | Super Admin dashboard shows |
| 4.2 | Paste a tenant URL directly (e.g., `/projects/123`) | Should redirect to Super Admin with toast "Tenant access required" |
| 4.3 | Check sessionStorage for `last_attempted_tenant_url_v1` | Should contain `/projects/123` |
| 4.4 | Select a tenant from the list | After tenant context loads, should auto-navigate to `/projects/123` |
| 4.5 | Check sessionStorage again | Key should be cleared |
| 4.6 | Exit impersonation | Returns to Super Admin |
| 4.7 | Check sessionStorage | Key should remain cleared (cleared on exit) |

### 4b. Deep Link Safety

| Step | Action | Expected Result |
|------|--------|-----------------|
| 4b.1 | Manually set `sessionStorage.setItem('last_attempted_tenant_url_v1', 'https://evil.com')` | |
| 4b.2 | Select a tenant | Should NOT navigate to external URL |
| 4b.3 | Manually set `sessionStorage.setItem('last_attempted_tenant_url_v1', '/super-admin')` | |
| 4b.4 | Select a tenant | Should NOT navigate to super route |

### 5. Session Persistence

| Step | Action | Expected Result |
|------|--------|-----------------|
| 5.1 | Impersonate a tenant | ImpersonationBanner shows |
| 5.2 | Close browser completely | |
| 5.3 | Reopen browser and navigate to app | Should restore impersonation with validation |
| 5.4 | Check localStorage | Should have `actingTenantId` and `actingTenantName` |

### 6. Non-Super User Isolation

| Step | Action | Expected Result |
|------|--------|-----------------|
| 6.1 | Log in as regular tenant user | Should see tenant dashboard |
| 6.2 | Try to navigate to `/super-admin` | Should redirect to `/` |
| 6.3 | Check localStorage for `actingTenantId` | Should be empty/cleared |

---

## Console Checks

After each test, verify no console errors:
- No `Warning: Invalid hook call` errors
- No `React has detected a change in the order of Hooks` errors
- No `403 Forbidden` errors on expected routes
- No `404 Not Found` on tenant data queries

---

### 7. Tenant Context Gate

| Step | Action | Expected Result |
|------|--------|-----------------|
| 7.1 | Select a tenant from Super Admin | Should show loading spinner briefly |
| 7.2 | Observe main content area | Spinner shows "Loading tenant context..." |
| 7.3 | After load completes | Tenant dashboard renders |
| 7.4 | (Simulate error by blocking API) | Should show error state with "Retry" and "Exit Tenant Mode" |

---

## Known Edge Cases

1. **Multiple tabs**: Impersonation state is shared via localStorage
2. **Stale cache**: Switching tenants too quickly may show stale data briefly
3. **Network errors**: Tenant validation may fail, causing force exit
4. **Last attempted URL**: Stored in sessionStorage (per-tab), resets on browser close
5. **URL restoration timing**: Happens after tenant context loads, may have brief flash

---

*Last Updated: January 2026*
