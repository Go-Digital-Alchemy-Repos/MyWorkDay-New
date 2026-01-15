/**
 * Last Attempted Tenant URL Storage
 * 
 * This module manages the storage of the last attempted tenant URL in sessionStorage.
 * Used to restore navigation after a super admin selects a tenant.
 * 
 * Rules:
 * - Stored in sessionStorage (resets per session)
 * - Only stores internal paths (starts with "/")
 * - Never stores super routes ("/super-admin" or "/super/")
 * - Cleared after successful navigation or on exit impersonation
 */

const LAST_ATTEMPTED_TENANT_URL_KEY = "last_attempted_tenant_url_v1";

/**
 * Tenant route prefixes - routes that require tenant context
 */
export const TENANT_ROUTE_PREFIXES = [
  "/",
  "/my-tasks",
  "/projects",
  "/clients",
  "/time-tracking",
  "/settings",
  "/account",
  "/profile",
] as const;

/**
 * Check if a path is a tenant route (requires tenant context)
 */
export function isTenantRoute(path: string): boolean {
  // Explicitly exclude super routes
  if (path.startsWith("/super-admin") || path.startsWith("/super/")) {
    return false;
  }
  // Exclude auth/login routes
  if (path.startsWith("/login") || path.startsWith("/auth/") || path.startsWith("/tenant-onboarding") || path.startsWith("/accept-terms")) {
    return false;
  }
  // Check against known tenant prefixes
  return TENANT_ROUTE_PREFIXES.some(prefix => {
    if (prefix === "/") {
      return path === "/" || path.startsWith("/?");
    }
    return path.startsWith(prefix);
  });
}

/**
 * Validate that a URL is safe to restore (internal path only)
 */
export function isValidRestoreUrl(url: string): boolean {
  // Must start with "/"
  if (!url.startsWith("/")) {
    return false;
  }
  // Must not be an absolute URL (no protocol)
  if (url.includes("://")) {
    return false;
  }
  // Must not be a super route
  if (url.startsWith("/super-admin") || url.startsWith("/super/")) {
    return false;
  }
  // Must not contain credentials or sensitive patterns
  if (url.includes("@") || url.includes("\\")) {
    return false;
  }
  return true;
}

/**
 * Store the last attempted tenant URL
 */
export function setLastAttemptedTenantUrl(url: string): void {
  if (!isValidRestoreUrl(url)) {
    console.warn("[tenant-url-storage] Refusing to store invalid URL:", url);
    return;
  }
  try {
    sessionStorage.setItem(LAST_ATTEMPTED_TENANT_URL_KEY, url);
  } catch (e) {
    console.warn("[tenant-url-storage] Failed to store URL:", e);
  }
}

/**
 * Get the last attempted tenant URL
 */
export function getLastAttemptedTenantUrl(): string | null {
  try {
    return sessionStorage.getItem(LAST_ATTEMPTED_TENANT_URL_KEY);
  } catch (e) {
    console.warn("[tenant-url-storage] Failed to retrieve URL:", e);
    return null;
  }
}

/**
 * Clear the last attempted tenant URL
 */
export function clearLastAttemptedTenantUrl(): void {
  try {
    sessionStorage.removeItem(LAST_ATTEMPTED_TENANT_URL_KEY);
  } catch (e) {
    console.warn("[tenant-url-storage] Failed to clear URL:", e);
  }
}

/**
 * Get and validate the stored URL for restoration
 * Returns null if URL is invalid or should not be restored
 */
export function getValidRestoreUrl(currentPath: string): string | null {
  const storedUrl = getLastAttemptedTenantUrl();
  if (!storedUrl) {
    return null;
  }
  
  // Validate stored URL
  if (!isValidRestoreUrl(storedUrl)) {
    clearLastAttemptedTenantUrl();
    return null;
  }
  
  // Prevent redirect loop - if already at the stored URL
  if (storedUrl === currentPath) {
    clearLastAttemptedTenantUrl();
    return null;
  }
  
  return storedUrl;
}
