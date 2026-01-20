/**
 * TenantContextGate Component
 * 
 * Blocks tenant route rendering until:
 * 1. effectiveTenantId exists
 * 2. Tenant context is confirmed loaded via API validation
 * 3. Shows loading spinner while waiting
 * 4. Shows error state with Retry + Exit Tenant Mode on failure
 * 
 * After tenant context loads successfully:
 * - Checks for lastAttemptedTenantUrl in sessionStorage
 * - If exists and valid, navigates to that URL and clears storage
 * - Prevents navigation to super routes or external URLs
 */

import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAppMode } from "@/hooks/useAppMode";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, AlertCircle, RefreshCw, LogOut } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  getValidRestoreUrl, 
  clearLastAttemptedTenantUrl 
} from "@/lib/tenant-url-storage";

interface TenantContextGateProps {
  children: React.ReactNode;
}

interface TenantContext {
  tenantId: string;
  displayName: string;
  status: string;
}

export function TenantContextGate({ children }: TenantContextGateProps) {
  const { effectiveTenantId, isImpersonating, stopImpersonation, appMode, isSuper } = useAppMode();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const hasRestoredUrl = useRef(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // Debug logging for tenant context issues
  if (import.meta.env.DEV || import.meta.env.VITE_DEBUG_AUTH === "true") {
    console.log("[TenantContextGate] State:", {
      effectiveTenantId,
      isImpersonating,
      appMode,
      isSuper,
      location,
    });
  }
  
  // Fetch tenant context to validate tenant access
  // Uses /context endpoint which works for all tenant users (not just admins)
  const { 
    data: tenantContext, 
    isLoading, 
    isError, 
    error,
    refetch 
  } = useQuery<TenantContext>({
    queryKey: ["/api/v1/tenant/context", effectiveTenantId],
    enabled: !!effectiveTenantId,
    retry: 2,
    staleTime: 30000,
  });
  
  // Determine if tenant context is loaded and valid
  const tenantContextLoaded = !isLoading && !isError && !!tenantContext?.tenantId;
  const contextMatchesEffective = tenantContext?.tenantId === effectiveTenantId;
  const isContextValid = tenantContextLoaded && contextMatchesEffective;
  
  // Handle URL restoration after tenant context loads
  useEffect(() => {
    if (isContextValid && !hasRestoredUrl.current) {
      hasRestoredUrl.current = true;
      
      const restoreUrl = getValidRestoreUrl(location);
      if (restoreUrl) {
        clearLastAttemptedTenantUrl();
        // Small delay to ensure UI is stable
        setTimeout(() => {
          setLocation(restoreUrl);
        }, 50);
      }
    }
  }, [isContextValid, location, setLocation]);
  
  // Handle authorization errors (403/451) - clear stored URL and notify
  useEffect(() => {
    if (isError && error) {
      const storedUrl = getValidRestoreUrl(location);
      if (storedUrl) {
        // Clear the stored URL on auth failure
        clearLastAttemptedTenantUrl();
        toast({
          title: "Cannot access page",
          description: "You don't have permission to access the requested page.",
          variant: "destructive",
        });
      }
    }
  }, [isError, error, location, toast]);
  
  // Reset restoration flag when tenant changes
  useEffect(() => {
    hasRestoredUrl.current = false;
  }, [effectiveTenantId]);
  
  const handleExitTenantMode = async () => {
    setIsExiting(true);
    try {
      if (isImpersonating) {
        await apiRequest("POST", "/api/v1/super/impersonate/stop", {});
      }
      clearLastAttemptedTenantUrl();
      stopImpersonation();
      setLocation("/super-admin");
      toast({
        title: "Exited tenant mode",
        description: "You are back in Super Admin mode",
      });
    } catch (e) {
      clearLastAttemptedTenantUrl();
      stopImpersonation();
      setLocation("/super-admin");
    } finally {
      setIsExiting(false);
    }
  };
  
  // No tenant ID - could be super user without selection OR regular user without tenant assignment
  if (!effectiveTenantId) {
    // For super users, show tenant selector option
    if (isSuper) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">No Tenant Selected</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Please select a tenant to access this page.
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => setLocation("/super-admin")}
            data-testid="button-go-to-tenant-selector"
          >
            Go to Tenant Selector
          </Button>
        </div>
      );
    }
    
    // For regular users without tenant - this indicates a configuration issue
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Account Not Configured</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Your account is not associated with an organization. 
            Please contact your administrator to complete your account setup.
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => setLocation("/login")}
          data-testid="button-go-to-login"
        >
          Return to Login
        </Button>
      </div>
    );
  }
  
  // Loading state
  if (isLoading) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-full gap-3"
        data-testid="tenant-context-loading"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading tenant context...</p>
      </div>
    );
  }
  
  // Error state
  if (isError) {
    const errorMessage = error instanceof Error ? error.message : "Failed to load tenant context";
    return (
      <div 
        className="flex flex-col items-center justify-center h-full gap-4 p-8"
        data-testid="tenant-context-error"
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center">
          <h2 className="text-lg font-semibold">Unable to Load Tenant</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {errorMessage}
          </p>
        </div>
        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => refetch()}
            data-testid="button-retry-tenant-context"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
          {isImpersonating && (
            <Button 
              variant="secondary" 
              onClick={handleExitTenantMode}
              disabled={isExiting}
              data-testid="button-exit-tenant-mode"
            >
              {isExiting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 mr-2" />
              )}
              Exit Tenant Mode
            </Button>
          )}
        </div>
      </div>
    );
  }
  
  // Context mismatch - tenant ID in context doesn't match effective tenant ID
  if (!contextMatchesEffective) {
    return (
      <div 
        className="flex flex-col items-center justify-center h-full gap-3"
        data-testid="tenant-context-mismatch"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Switching tenant context...</p>
      </div>
    );
  }
  
  // Context loaded and valid - render children
  return <>{children}</>;
}
