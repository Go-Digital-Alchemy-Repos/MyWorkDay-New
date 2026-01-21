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
import { apiRequest, ApiError } from "@/lib/queryClient";
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
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  
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
  // NOTE: The endpoint gets tenant from session/headers, NOT from URL path
  // The effectiveTenantId is only for cache keying to refetch when tenant changes
  const { 
    data: tenantContext, 
    isLoading, 
    isError, 
    error,
    refetch 
  } = useQuery<TenantContext>({
    queryKey: [`/api/v1/tenant/context?_t=${effectiveTenantId}`],
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
  
  // Error state with detailed diagnostics
  if (isError) {
    // Extract detailed error information
    let errorMessage = "Failed to load tenant context";
    let errorStatus: number | null = null;
    let requestId: string | null = null;
    let rawBody: string | null = null;
    
    if (error instanceof ApiError) {
      errorMessage = error.message;
      errorStatus = error.status;
      requestId = error.requestId;
      rawBody = error.body;
      
      // Detect HTML response (404/routing issue)
      if (rawBody?.includes("<!DOCTYPE") || rawBody?.includes("<html")) {
        errorMessage = "Server returned HTML instead of JSON. This usually means the API endpoint doesn't exist or there's a routing issue.";
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return (
      <div 
        className="flex flex-col items-center justify-center h-full gap-4 p-8"
        data-testid="tenant-context-error"
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <div className="text-center max-w-lg">
          <h2 className="text-lg font-semibold">Unable to Load Tenant</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {errorMessage}
          </p>
          {errorStatus && (
            <p className="text-xs text-muted-foreground mt-2">
              Status: {errorStatus} {requestId && `| Request ID: ${requestId}`}
            </p>
          )}
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
        
        {/* Expandable error details */}
        {(rawBody || effectiveTenantId) && (
          <div className="w-full max-w-lg">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowErrorDetails(!showErrorDetails)}
              className="text-xs text-muted-foreground"
              data-testid="button-toggle-error-details"
            >
              {showErrorDetails ? "Hide Details" : "Show Details"}
            </Button>
            
            {showErrorDetails && (
              <div className="mt-2 p-3 bg-muted rounded-md text-left space-y-1">
                <p className="text-xs font-mono break-all">
                  <strong>Effective Tenant ID:</strong> {effectiveTenantId || "none"}
                </p>
                <p className="text-xs font-mono break-all">
                  <strong>App Mode:</strong> {appMode}
                </p>
                <p className="text-xs font-mono break-all">
                  <strong>Is Impersonating:</strong> {String(isImpersonating)}
                </p>
                {errorStatus === 403 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    A 403 error typically means your user account is not properly 
                    associated with this tenant. Contact your administrator to 
                    verify your account setup.
                  </p>
                )}
                {rawBody && !rawBody.includes("<!DOCTYPE") && (
                  <p className="text-xs font-mono break-all mt-1">
                    <strong>Response:</strong> {rawBody.slice(0, 500)}
                  </p>
                )}
                {rawBody?.includes("<!DOCTYPE") && (
                  <p className="text-xs text-destructive mt-1">
                    Server returned HTML page instead of JSON API response.
                    Check server logs for the actual error.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
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
