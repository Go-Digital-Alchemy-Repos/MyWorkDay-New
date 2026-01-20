import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAppMode } from "@/hooks/useAppMode";
import { useLocation } from "wouter";
import { AlertTriangle, X, Building2, Loader2, Settings, User, LogOut } from "lucide-react";
import { apiRequest, clearTenantScopedCaches, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { clearLastAttemptedTenantUrl } from "@/lib/tenant-url-storage";

interface UserImpersonationData {
  isImpersonating: boolean;
  impersonatedUser: {
    id: string;
    email: string;
    role: string;
  };
  impersonatedTenant: {
    id: string;
    name: string;
  };
  originalSuperUser: {
    id: string;
    email: string;
  };
  startedAt: string;
}

interface ImpersonationBannerProps {
  userImpersonation?: UserImpersonationData | null;
}

export function ImpersonationBanner({ userImpersonation }: ImpersonationBannerProps) {
  const { isImpersonating, effectiveTenantName, stopImpersonation, effectiveTenantId } = useAppMode();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [isExiting, setIsExiting] = useState(false);
  const [isExitingUserImpersonation, setIsExitingUserImpersonation] = useState(false);

  useEffect(() => {
    if (isImpersonating && effectiveTenantName) {
      const originalTitle = document.title.replace(/^\[Tenant: .*?\]\s*/, "");
      document.title = `[Tenant: ${effectiveTenantName}] ${originalTitle}`;
      return () => {
        document.title = originalTitle;
      };
    }
  }, [isImpersonating, effectiveTenantName, location]);

  useEffect(() => {
    if (userImpersonation?.isImpersonating) {
      const originalTitle = document.title.replace(/^\[User: .*?\]\s*/, "");
      document.title = `[User: ${userImpersonation.impersonatedUser.email}] ${originalTitle}`;
      return () => {
        document.title = originalTitle;
      };
    }
  }, [userImpersonation]);

  const handleExitTenantImpersonation = async () => {
    setIsExiting(true);
    try {
      await apiRequest("POST", "/api/v1/super/impersonate/stop", {});
    } catch (error) {
      // Continue with exit even if API call fails
    }
    clearLastAttemptedTenantUrl();
    clearTenantScopedCaches();
    stopImpersonation();
    window.location.href = "/super-admin/tenants";
  };

  const handleExitUserImpersonation = async () => {
    setIsExitingUserImpersonation(true);
    try {
      await apiRequest("POST", "/api/v1/super/impersonation/exit", {});
      toast({ 
        title: "Impersonation ended", 
        description: "Returning to Super Admin view..." 
      });
      queryClient.clear();
      setTimeout(() => {
        window.location.href = "/super-admin/dashboard";
      }, 300);
    } catch (error) {
      toast({ 
        title: "Failed to exit impersonation", 
        variant: "destructive" 
      });
      setIsExitingUserImpersonation(false);
    }
  };

  const handleOpenTenantSettings = () => {
    setLocation("/settings");
  };

  // User impersonation banner takes priority
  if (userImpersonation?.isImpersonating) {
    return (
      <div 
        className="sticky top-0 z-50 flex items-center justify-between gap-4 bg-orange-500 dark:bg-orange-600 px-4 py-2 text-white shadow-md"
        data-testid="user-impersonation-banner"
      >
        <div className="flex items-center gap-3">
          <User className="h-4 w-4 shrink-0 animate-pulse" />
          <div className="flex items-center gap-2 text-sm font-medium">
            <span>Impersonating User:</span>
            <span className="font-semibold">{userImpersonation.impersonatedUser.email}</span>
            <span className="text-orange-200">({userImpersonation.impersonatedUser.role})</span>
          </div>
          <div className="flex items-center gap-2 border-l border-orange-400 pl-4">
            <Building2 className="h-4 w-4" />
            <span>Tenant:</span>
            <span className="font-semibold">{userImpersonation.impersonatedTenant.name}</span>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExitUserImpersonation}
          disabled={isExitingUserImpersonation}
          className="bg-white text-orange-600 hover:bg-orange-50"
          data-testid="button-exit-user-impersonation"
        >
          {isExitingUserImpersonation ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Exiting...
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4 mr-1" />
              Exit to Super Admin
            </>
          )}
        </Button>
      </div>
    );
  }

  // Tenant impersonation banner
  if (!isImpersonating) return null;

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
          onClick={handleExitTenantImpersonation}
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
