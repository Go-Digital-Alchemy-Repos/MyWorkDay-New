import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppMode } from "@/hooks/useAppMode";
import { useLocation } from "wouter";
import { AlertTriangle, X, Building2, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { clearLastAttemptedTenantUrl } from "@/lib/tenant-url-storage";

export function ImpersonationBanner() {
  const { isImpersonating, effectiveTenantName, stopImpersonation } = useAppMode();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isExiting, setIsExiting] = useState(false);

  if (!isImpersonating) return null;

  const handleExit = async () => {
    setIsExiting(true);
    try {
      await apiRequest("POST", "/api/v1/super/impersonate/stop", {});
      // Clear stored tenant URL on exit impersonation
      clearLastAttemptedTenantUrl();
      stopImpersonation();
      setLocation("/super-admin");
      toast({
        title: "Exited tenant mode",
        description: "You are back in Super Admin mode",
      });
    } catch (error) {
      clearLastAttemptedTenantUrl();
      stopImpersonation();
      setLocation("/super-admin");
    } finally {
      setIsExiting(false);
    }
  };

  return (
    <div 
      className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-amber-500 dark:bg-amber-600 px-4 py-2 text-amber-950 dark:text-amber-50"
      data-testid="impersonation-banner"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <div className="flex items-center gap-2 text-sm font-medium">
          <Building2 className="h-4 w-4" />
          <span>Acting as Tenant:</span>
          <span className="font-semibold">{effectiveTenantName}</span>
        </div>
      </div>
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
            Exit Tenant Mode
          </>
        )}
      </Button>
    </div>
  );
}
