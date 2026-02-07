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

/**
 * Custom error class that includes request ID for correlation.
 * This allows UI components to display the request ID for support purposes.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly body: string;

  constructor(status: number, body: string, requestId: string | null) {
    super(`${status}: ${body}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.requestId = requestId;
  }
}

/**
 * Check if response is JSON based on content-type header.
 * Guards against parsing HTML as JSON which causes "Unexpected token <" errors.
 */
function isJsonResponse(res: Response): boolean {
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json");
}

/**
 * Handle 401 Unauthorized - redirect to login with session expired message.
 * Only handles cases where we're NOT already on the login page.
 */
function handle401Redirect(): void {
  if (window.location.pathname !== "/login") {
    // Store message in sessionStorage for login page to display
    sessionStorage.setItem("authMessage", "Session expired. Please log in again.");
    window.location.href = "/login";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    if (await handleAgreementRequired(res)) {
      throw new Error("Agreement acceptance required");
    }
    
    // Handle 401 with clean redirect
    if (res.status === 401) {
      handle401Redirect();
      throw new ApiError(401, "Session expired", res.headers.get("X-Request-Id"));
    }
    
    // Guard against non-JSON responses (HTML error pages, etc.)
    if (!isJsonResponse(res)) {
      const rawText = await res.text();
      const requestId = res.headers.get("X-Request-Id");
      
      // Detect HTML responses
      if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
        throw new ApiError(
          res.status, 
          `Server returned HTML instead of JSON (status ${res.status}). This usually indicates a routing issue.`,
          requestId
        );
      }
      
      throw new ApiError(res.status, rawText || res.statusText, requestId);
    }
    
    const text = (await res.text()) || res.statusText;
    const requestId = res.headers.get("X-Request-Id");
    throw new ApiError(res.status, text, requestId);
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
  customHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = {
    ...buildHeaders(data),
    ...customHeaders,
  };
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * Build a URL from a query key.
 * 
 * Handles two formats:
 * 1. Simple string: ["/api/path"] -> "/api/path"
 * 2. With query params: ["/api/path", { key: value }] -> "/api/path?key=value"
 * 
 * Objects in the query key are converted to URL query parameters.
 * String segments are joined with "/".
 */
function buildUrlFromQueryKey(queryKey: readonly unknown[]): string {
  const pathParts: string[] = [];
  let queryParams: URLSearchParams | null = null;

  for (const segment of queryKey) {
    if (typeof segment === "string") {
      // Detect accidentally stringified objects (e.g., template literal with object)
      if (segment.includes("[object Object]")) {
        const stack = new Error().stack;
        console.error(
          "[queryClient] BUG DETECTED: [object Object] in query key path.\n" +
          "This means an object was passed instead of a string ID.\n" +
          "Query key:", JSON.stringify(queryKey), "\n" +
          "Stack trace:", stack
        );
        // In development, throw to catch the bug immediately
        if (import.meta.env.DEV) {
          throw new Error(
            `Invalid query key: path segment contains [object Object]. ` +
            `Pass the ID property (.id) instead of the whole object. ` +
            `Query key: ${JSON.stringify(queryKey)}`
          );
        }
      }
      pathParts.push(segment);
    } else if (typeof segment === "object" && segment !== null) {
      queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(segment)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
    }
  }

  let url = pathParts.join("/");
  if (queryParams && queryParams.toString()) {
    url += (url.includes("?") ? "&" : "?") + queryParams.toString();
  }
  return url;
}

export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = buildUrlFromQueryKey(queryKey);
    const res = await fetch(url, {
      credentials: "include",
      headers: buildHeaders(),
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (await handleAgreementRequired(res)) {
      throw new Error("Agreement acceptance required");
    }

    // throwIfResNotOk handles 401 redirect internally
    await throwIfResNotOk(res);
    
    // Guard against non-JSON responses before parsing
    if (!isJsonResponse(res)) {
      const rawText = await res.text();
      const requestId = res.headers.get("X-Request-Id");
      
      if (rawText.includes("<!DOCTYPE") || rawText.includes("<html")) {
        throw new ApiError(
          res.status,
          `Server returned HTML instead of JSON (status ${res.status}). This usually indicates a routing issue.`,
          requestId
        );
      }
      
      throw new ApiError(res.status, `Unexpected response format: ${rawText.slice(0, 100)}`, requestId);
    }
    
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
          return false;
        }
        return failureCount < 2;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 8000),
    },
    mutations: {
      retry: false,
    },
  },
});

export const STALE_TIMES = {
  realtime: 10_000,
  fast: 30_000,
  standard: 60_000,
  slow: 5 * 60_000,
  static: Infinity,
} as const;

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
