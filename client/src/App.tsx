import { Switch, Route, useLocation, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SuperSidebar } from "@/components/super-sidebar";
import { TenantSidebar } from "@/components/tenant-sidebar";
import { TenantSwitcher } from "@/components/tenant-switcher";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { TenantThemeProvider } from "@/lib/tenant-theme-loader";
import { useAppMode } from "@/hooks/useAppMode";
import { useToast } from "@/hooks/use-toast";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import MyTasks from "@/pages/my-tasks";
import ProjectsDashboard from "@/pages/projects-dashboard";
import ProjectPage from "@/pages/project";
import ClientsPage from "@/pages/clients";
import ClientDetailPage from "@/pages/client-detail";
import TimeTrackingPage from "@/pages/time-tracking";
import LoginPage from "@/pages/login";
import SettingsPage from "@/pages/settings";
import SuperAdminPage from "@/pages/super-admin";
import SuperAdminReportsPage from "@/pages/super-admin-reports";
import SuperAdminSettingsPage from "@/pages/super-admin-settings";
import SuperAdminStatusPage from "@/pages/super-admin-status";
import SuperAdminDocsPage from "@/pages/super-admin-docs";
import TenantOnboardingPage from "@/pages/tenant-onboarding";
import AccountPage from "@/pages/account";
import UserProfilePage from "@/pages/user-profile";
import AcceptTermsPage from "@/pages/accept-terms";
import { Loader2 } from "lucide-react";
import { useEffect } from "react";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  return <Component />;
}

function SuperRouteGuard({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function TenantRouteGuard({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "super_user" && appMode === "super") {
      toast({
        title: "Tenant access required",
        description: "Switch to a tenant to access this page.",
      });
      setLocation("/super-admin");
    }
  }, [isLoading, isAuthenticated, user?.role, appMode, toast, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  if (user?.role === "super_user" && appMode === "super") {
    return <Redirect to="/super-admin" />;
  }

  return <Component />;
}

function SuperAdminRouter() {
  return (
    <Switch>
      <Route path="/super-admin">
        {() => <SuperRouteGuard component={SuperAdminPage} />}
      </Route>
      <Route path="/super-admin/reports">
        {() => <SuperRouteGuard component={SuperAdminReportsPage} />}
      </Route>
      <Route path="/super-admin/settings">
        {() => <SuperRouteGuard component={SuperAdminSettingsPage} />}
      </Route>
      <Route path="/super-admin/status">
        {() => <SuperRouteGuard component={SuperAdminStatusPage} />}
      </Route>
      <Route path="/super-admin/docs">
        {() => <SuperRouteGuard component={SuperAdminDocsPage} />}
      </Route>
      <Route>
        {() => <Redirect to="/super-admin" />}
      </Route>
    </Switch>
  );
}

function TenantRouter() {
  return (
    <Switch>
      <Route path="/">
        {() => <TenantRouteGuard component={Home} />}
      </Route>
      <Route path="/my-tasks">
        {() => <TenantRouteGuard component={MyTasks} />}
      </Route>
      <Route path="/projects">
        {() => <TenantRouteGuard component={ProjectsDashboard} />}
      </Route>
      <Route path="/projects/:id">
        {() => <TenantRouteGuard component={ProjectPage} />}
      </Route>
      <Route path="/clients">
        {() => <TenantRouteGuard component={ClientsPage} />}
      </Route>
      <Route path="/clients/:id">
        {() => <TenantRouteGuard component={ClientDetailPage} />}
      </Route>
      <Route path="/time-tracking">
        {() => <TenantRouteGuard component={TimeTrackingPage} />}
      </Route>
      <Route path="/settings">
        {() => <TenantRouteGuard component={SettingsPage} />}
      </Route>
      <Route path="/settings/:tab">
        {() => <TenantRouteGuard component={SettingsPage} />}
      </Route>
      <Route path="/account">
        {() => <TenantRouteGuard component={AccountPage} />}
      </Route>
      <Route path="/account/:tab">
        {() => <TenantRouteGuard component={AccountPage} />}
      </Route>
      <Route path="/profile">
        {() => <TenantRouteGuard component={UserProfilePage} />}
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function SuperLayout() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <SuperSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-14 px-4 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <TenantSwitcher />
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-hidden">
            <SuperAdminRouter />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function TenantLayout() {
  const { isImpersonating } = useAppMode();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex flex-col h-screen w-full">
        {isImpersonating && <ImpersonationBanner />}
        <div className="flex flex-1 overflow-hidden">
          <TenantSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <header className="flex items-center justify-between h-12 px-4 border-b border-border bg-background shrink-0">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <div className="flex items-center gap-2">
                <ThemeToggle />
                <UserMenu />
              </div>
            </header>
            <main className="flex-1 overflow-hidden">
              <TenantRouter />
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const [location] = useLocation();

  if (location === "/login" || location === "/tenant-onboarding" || location === "/accept-terms") {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/tenant-onboarding">
          {() => <ProtectedRoute component={TenantOnboardingPage} />}
        </Route>
        <Route path="/accept-terms">
          {() => <ProtectedRoute component={AcceptTermsPage} />}
        </Route>
      </Switch>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Redirect to="/login" />;
  }

  const isSuperUser = user?.role === "super_user";
  const isSuperRoute = location.startsWith("/super-admin");

  if (isSuperUser && appMode === "super") {
    if (!isSuperRoute) {
      return <Redirect to="/super-admin" />;
    }
    return <SuperLayout />;
  }

  if (isSuperRoute && (!isSuperUser || appMode === "tenant")) {
    return <Redirect to="/" />;
  }

  return <TenantLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <TenantThemeProvider>
              <AppLayout />
            </TenantThemeProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
