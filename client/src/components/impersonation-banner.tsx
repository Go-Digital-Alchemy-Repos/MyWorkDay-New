import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAppMode } from "@/hooks/useAppMode";
import { useLocation } from "wouter";
import { AlertTriangle, X, Building2, Loader2, Settings } from "lucide-react";
import { apiRequest, clearTenantScopedCaches } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { clearLastAttemptedTenantUrl } from "@/lib/tenant-url-storage";

export function ImpersonationBanner() {
  const { isImpersonating, effectiveTenantName, stopImpersonation, effectiveTenantId } = useAppMode();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (isImpersonating && effectiveTenantName) {
      const originalTitle = document.title.replace(/^\[Tenant: .*?\]\s*/, "");
      document.title = `[Tenant: ${effectiveTenantName}] ${originalTitle}`;
      return () => {
        document.title = originalTitle;
      };
    }
  }, [isImpersonating, effectiveTenantName, location]);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    setIsExiting(true);
    try {
      await apiRequest("POST", "/api/v1/super/impersonate/stop", {});
    } catch (error) {
    } finally {
      clearLastAttemptedTenantUrl();
      clearTenantScopedCaches();
      stopImpersonation();
      setLocation("/super-admin/tenants");
      toast({
        title: "Exited tenant mode",
        description: "You are back in Super Admin mode",
      });
      setIsExiting(false);
    }
  };

  const handleOpenTenantSettings = () => {
    setLocation("/settings");
  };

  return (
    <div 
      className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-amber-500 dark:bg-amber-600 px-4 py-2 text-amber-950 dark:text-amber-50 shadow-md"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0 animate-pulse" />
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="h-4 w-4" />
          <span>Acting as Tenant:</span>
          <span className="font-semibold">{effectiveTenantName}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleOpenTenantSettings}
          className="bg-white/20 border-amber-700 text-amber-950 dark:text-amber-50 hover:bg-white/30"
          data-testid="button-open-tenant-settings"
        >
          <Settings className="h-4 w-4 mr-1" />
          Open Tenant Settings
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExit}
          disabled={isExiting}
          className="bg-white/20 border-amber-700 text-amber-950 dark:text-amber-50 hover:bg-white/30"
          data-testid="button-exit-impersonation"
        >
          {isExiting ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Exiting...
            </>
          ) : (
            <>
              <X className="h-4 w-4 mr-1" />
              Exit
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
