import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { parseApiError, isAgreementError } from "./parseApiError";

/**
 * Handle agreement-required responses by redirecting to accept-terms page.
 * Checks both standard envelope (error.details.redirectTo) and legacy (redirectTo) formats.
 */
async function handleAgreementRequired(res: Response): Promise<boolean> {
  if (res.status === 451) {
    try {
      const data = await res.clone().json();
      const parsed = parseApiError(data);
      
      if (isAgreementError(parsed)) {
        // Check for redirect in both envelope and legacy formats
        const redirectTo = 
          (parsed.details as { redirectTo?: string })?.redirectTo ||
          data.redirectTo ||
          "/accept-terms";
        
        if (window.location.pathname !== redirectTo) {
          window.location.href = redirectTo;
        }
        return true;
      }
    } catch {
      // Fallback redirect if we can't parse the response
      if (window.location.pathname !== "/accept-terms") {
        window.location.href = "/accept-terms";
      }
      return true;
    }
  }
  return false;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (await handleAgreementRequired(res)) {
      throw new Error("Agreement acceptance required");
    }
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// Storage keys for super user acting-as-tenant functionality
const ACTING_TENANT_ID_KEY = "actingTenantId";
const IS_SUPER_USER_KEY = "isSuperUser";

// Helper to get the acting tenant ID for super users
export function getActingTenantId(): string | null {
  // Only return the tenant ID if user is verified as super user
  const isSuperUser = localStorage.getItem(IS_SUPER_USER_KEY) === "true";
  if (!isSuperUser) {
    // Clear stale data if user is not super user
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
    return null;
  }
  return localStorage.getItem(ACTING_TENANT_ID_KEY);
}

// Helper to set the acting tenant ID for super users (only works for verified super users)
export function setActingTenantId(tenantId: string | null): void {
  if (tenantId) {
    localStorage.setItem(ACTING_TENANT_ID_KEY, tenantId);
  } else {
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
  }
}

// Helper to set super user flag (called by auth when user logs in)
export function setSuperUserFlag(isSuperUser: boolean): void {
  if (isSuperUser) {
    localStorage.setItem(IS_SUPER_USER_KEY, "true");
  } else {
    // Clear both flags when user is not super user
    localStorage.removeItem(IS_SUPER_USER_KEY);
    localStorage.removeItem(ACTING_TENANT_ID_KEY);
  }
}

// Helper to clear all acting-as state (called on logout/login)
export function clearActingAsState(): void {
  localStorage.removeItem(ACTING_TENANT_ID_KEY);
  localStorage.removeItem(IS_SUPER_USER_KEY);
}

// Build headers including X-Tenant-Id if acting as tenant (with super user verification)
function buildHeaders(data?: unknown): HeadersInit {
  const headers: HeadersInit = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  // Only add X-Tenant-Id header if user is verified as super user
  const actingTenantId = getActingTenantId();
  if (actingTenantId) {
    headers["X-Tenant-Id"] = actingTenantId;
  }
  
  return headers;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: buildHeaders(data),
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: buildHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (await handleAgreementRequired(res)) {
      throw new Error("Agreement acceptance required");
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Tenant-scoped query key prefixes.
 * These queries contain tenant-specific data and must be cleared on mode transitions.
 * 
 * IMPORTANT: This list must be comprehensive. Any tenant-specific API endpoint
 * should have its prefix listed here to ensure proper cache isolation.
 * 
 * Note: This is a best-effort prefix-based approach. For guaranteed isolation,
 * consider implementing tenantId namespacing in query keys (e.g., ["tenant", tenantId, "/api/..."]).
 */
export const TENANT_SCOPED_QUERY_PREFIXES = [
  "/api/projects",
  "/api/clients",
  "/api/teams",
  "/api/workspaces",
  "/api/tasks",
  "/api/time-entries",
  "/api/user",
  "/api/auth/me",
  "/api/v1/projects",
  "/api/v1/tenant",
  "/api/v1/workspaces",
  "/api/v1/tasks",
  "/api/v1/clients",
  "/api/v1/teams",
  "/api/v1/time",
  "/api/v1/analytics",
  "/api/v1/forecast",
  "/api/v1/workload",
  "/api/activities",
  "/api/comments",
  "/api/tags",
  "/api/sections",
  "/api/attachments",
] as const;

/**
 * Super-scoped query key prefixes.
 * These queries contain super admin data and should be preserved during tenant mode.
 */
export const SUPER_SCOPED_QUERY_PREFIXES = [
  "/api/v1/super",
] as const;

/**
 * Clear all tenant-scoped caches when switching between tenants or exiting impersonation.
 * This ensures no stale tenant data is visible after mode transitions.
 */
export function clearTenantScopedCaches(): void {
  queryClient.cancelQueries();
  
  TENANT_SCOPED_QUERY_PREFIXES.forEach(prefix => {
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith(prefix);
      },
    });
  });
}

/**
 * Clear super-scoped caches when entering tenant mode.
 * Typically not needed, but useful for complete isolation.
 */
export function clearSuperScopedCaches(): void {
  SUPER_SCOPED_QUERY_PREFIXES.forEach(prefix => {
    queryClient.removeQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith(prefix);
      },
    });
  });
}

/**
 * Validate that a tenant ID exists in the system.
 * Used to prevent impersonation of non-existent tenants.
 */
export async function validateTenantExists(tenantId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/v1/super/tenants/${tenantId}`, {
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}
