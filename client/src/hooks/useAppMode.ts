/**
 * useAppMode Hook
 * 
 * Provides centralized app mode state management for super/tenant mode switching.
 * 
 * Rules:
 * - If user.role == "super_user" AND effectiveTenantId is null => appMode="super"
 * - If effectiveTenantId exists => appMode="tenant" AND isImpersonating=true
 * - If user.role != "super_user" => appMode="tenant" AND isImpersonating=false
 * 
 * Cache Strategy:
 * - On entering tenant mode: clear tenant-scoped caches to prevent stale data
 * - On exiting tenant mode: clear tenant-scoped caches and reset to super context
 * - Auth/session state is preserved across transitions
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { 
  getActingTenantId, 
  setActingTenantId, 
  clearTenantScopedCaches,
  validateTenantExists,
  queryClient,
} from "@/lib/queryClient";
import { UserRole } from "@shared/schema";

export type AppMode = "super" | "tenant";

interface ImpersonationState {
  tenantId: string;
  tenantName: string;
}

interface AppModeHook {
  appMode: AppMode;
  isSuper: boolean;
  isImpersonating: boolean;
  effectiveTenantId: string | null;
  effectiveTenantName: string | null;
  isModeTransitioning: boolean;
  startImpersonation: (tenantId: string, tenantName: string) => void;
  stopImpersonation: () => void;
}

const ACTING_TENANT_NAME_KEY = "actingTenantName";

export function useAppMode(): AppModeHook {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperUser = user?.role === UserRole.SUPER_USER;
  const [isModeTransitioning, setIsModeTransitioning] = useState(false);
  const validationInProgress = useRef(false);
  
  const [impersonation, setImpersonation] = useState<ImpersonationState | null>(() => {
    if (typeof window === "undefined") return null;
    const tenantId = getActingTenantId();
    const tenantName = localStorage.getItem(ACTING_TENANT_NAME_KEY);
    if (tenantId && tenantName) {
      return { tenantId, tenantName };
    }
    return null;
  });

  // Validate stored impersonation state on mount and user change
  useEffect(() => {
    const tenantId = getActingTenantId();
    const tenantName = localStorage.getItem(ACTING_TENANT_NAME_KEY);
    
    if (tenantId && tenantName && isSuperUser) {
      // Validate that the stored tenant still exists
      if (!validationInProgress.current) {
        validationInProgress.current = true;
        validateTenantExists(tenantId).then(exists => {
          validationInProgress.current = false;
          if (exists) {
            setImpersonation({ tenantId, tenantName });
          } else {
            // Tenant no longer exists or not accessible - force exit with user notification
            console.warn(`[useAppMode] Stored tenant ${tenantId} is not accessible, forcing exit`);
            setActingTenantId(null);
            localStorage.removeItem(ACTING_TENANT_NAME_KEY);
            setImpersonation(null);
            clearTenantScopedCaches();
            
            // Notify user and redirect to tenant list
            toast({
              title: "Tenant no longer available",
              description: "The previously selected tenant is no longer accessible. Returning to tenant list.",
              variant: "destructive",
            });
            
            // Use window.location for redirect since this hook may be used outside Router context
            if (window.location.pathname !== "/super-admin") {
              window.location.href = "/super-admin";
            }
          }
        });
      }
    } else if (!isSuperUser) {
      // Non-super users should never have impersonation state
      if (impersonation) {
        setActingTenantId(null);
        localStorage.removeItem(ACTING_TENANT_NAME_KEY);
        setImpersonation(null);
      }
    } else {
      setImpersonation(null);
    }
  }, [user, isSuperUser, toast]);

  const startImpersonation = useCallback((tenantId: string, tenantName: string) => {
    setIsModeTransitioning(true);
    
    // Clear tenant caches before switching
    clearTenantScopedCaches();
    
    // Set new impersonation state
    setActingTenantId(tenantId);
    localStorage.setItem(ACTING_TENANT_NAME_KEY, tenantName);
    setImpersonation({ tenantId, tenantName });
    
    // Allow UI to settle before completing transition
    setTimeout(() => setIsModeTransitioning(false), 100);
  }, []);

  const stopImpersonation = useCallback(() => {
    setIsModeTransitioning(true);
    
    // Clear tenant caches when exiting
    clearTenantScopedCaches();
    
    // Clear impersonation state
    setActingTenantId(null);
    localStorage.removeItem(ACTING_TENANT_NAME_KEY);
    setImpersonation(null);
    
    // Refetch super-critical queries
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants"] });
    
    // Allow UI to settle before completing transition
    setTimeout(() => setIsModeTransitioning(false), 100);
  }, []);

  const isImpersonating = isSuperUser && impersonation !== null;
  const appMode: AppMode = (isSuperUser && !isImpersonating) ? "super" : "tenant";

  return {
    appMode,
    isSuper: isSuperUser,
    isImpersonating,
    effectiveTenantId: impersonation?.tenantId || null,
    effectiveTenantName: impersonation?.tenantName || null,
    isModeTransitioning,
    startImpersonation,
    stopImpersonation,
  };
}
