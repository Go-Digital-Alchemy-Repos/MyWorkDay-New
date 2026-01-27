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
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { TenantContextGate } from "@/components/tenant-context-gate";
import { AuthProvider, useAuth } from "@/lib/auth";
import { UserMenu } from "@/components/user-menu";
import { TenantThemeProvider } from "@/lib/tenant-theme-loader";
import { useAppMode } from "@/hooks/useAppMode";
import { useToast } from "@/hooks/use-toast";
import { setLastAttemptedTenantUrl, isTenantRoute } from "@/lib/tenant-url-storage";
import { CommandPalette } from "@/components/command-palette";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import MyTasks from "@/pages/my-tasks";
import ProjectsDashboard from "@/pages/projects-dashboard";
import ProjectPage from "@/pages/project";
import ClientsPage from "@/pages/clients";
import ClientDetailPage from "@/pages/client-detail";
import LoginPage from "@/pages/login";
import SettingsPage from "@/pages/settings";
import SuperAdminPage from "@/pages/super-admin";
import SuperAdminDashboardPage from "@/pages/super-admin-dashboard";
import SuperAdminSettingsPage from "@/pages/super-admin-settings";
import SuperAdminStatusPage from "@/pages/super-admin-status";
import SuperAdminDocsPage from "@/pages/super-admin-docs";
import SuperChatMonitoringPage from "@/pages/super-chat-monitoring";
import SuperAdminUsersPage from "@/pages/super-admin-users";
import TenantOnboardingPage from "@/pages/tenant-onboarding";
import AccountPage from "@/pages/account";
import UserManagerPage from "@/pages/user-manager";
import UserProfilePage from "@/pages/user-profile";
import AcceptTermsPage from "@/pages/accept-terms";
import PlatformInvitePage from "@/pages/platform-invite";
import AcceptInvitePage from "@/pages/accept-invite";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import ChatPage from "@/pages/chat";
import ReportsPage from "@/pages/reports";
import CalendarPage from "@/pages/calendar";
import MyTimePage from "@/pages/my-time";
import MyCalendarPage from "@/pages/my-calendar";
import ClientPortalDashboard from "@/pages/client-portal-dashboard";
import ClientPortalProjects from "@/pages/client-portal-projects";
import ClientPortalTasks from "@/pages/client-portal-tasks";
import ClientPortalProjectDetail from "@/pages/client-portal-project-detail";
import { ClientPortalSidebar } from "@/components/client-portal-sidebar";
import { ClientPortalMobileNav } from "@/components/client-portal-mobile-nav";
import { Loader2, MessageCircle } from "lucide-react";
import { useEffect } from "react";
import { GlobalActiveTimer } from "@/features/timer";
import { ChatDrawerProvider, useChatDrawer } from "@/contexts/chat-drawer-context";
import { GlobalChatDrawer } from "@/components/global-chat-drawer";
import { Button } from "@/components/ui/button";
import { NotificationCenter } from "@/components/notification-center";
import { MobileNavBar } from "@/components/mobile-nav-bar";
import { useIsMobile } from "@/hooks/use-mobile";

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

/**
 * TenantRouteGuard
 * 
 * Guards tenant routes and handles:
 * 1. Authentication check
 * 2. Super user in super mode - stores last attempted URL, shows toast, redirects to tenant selector
 * 3. Otherwise renders the component
 * 
 * Note: Does NOT wrap with TenantContextGate - that's done at layout level
 * Note: Redirects to /super-admin which is the tenant selector equivalent in this app
 */
function TenantRouteGuard({ component: Component }: { component: React.ComponentType }) {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.role === "super_user" && appMode === "super") {
      // Store the attempted tenant URL before redirecting
      if (isTenantRoute(location)) {
        setLastAttemptedTenantUrl(location);
      }
      toast({
        title: "Tenant access required",
        description: "Switch to a tenant to access this page.",
      });
      setLocation("/super-admin/dashboard");
    }
  }, [isLoading, isAuthenticated, user?.role, appMode, toast, setLocation, location]);

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
    // Store URL before redirecting (fallback if effect didn't run)
    if (isTenantRoute(location)) {
      setLastAttemptedTenantUrl(location);
    }
    return <Redirect to="/super-admin/dashboard" />;
  }

  return <Component />;
}

function ClientPortalRouteGuard({ component: Component }: { component: React.ComponentType }) {
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

  if (user?.role !== "client") {
    return <Redirect to="/" />;
  }

  return <Component />;
}

function ClientPortalRouter() {
  return (
    <Switch>
      <Route path="/portal">
        {() => <ClientPortalRouteGuard component={ClientPortalDashboard} />}
      </Route>
      <Route path="/portal/projects">
        {() => <ClientPortalRouteGuard component={ClientPortalProjects} />}
      </Route>
      <Route path="/portal/projects/:id">
        {() => <ClientPortalRouteGuard component={ClientPortalProjectDetail} />}
      </Route>
      <Route path="/portal/tasks">
        {() => <ClientPortalRouteGuard component={ClientPortalTasks} />}
      </Route>
      <Route path="/portal/chat">
        {() => <ClientPortalRouteGuard component={ChatPage} />}
      </Route>
      <Route>
        {() => <Redirect to="/portal" />}
      </Route>
    </Switch>
  );
}

function SuperAdminRouter() {
  return (
    <Switch>
      {/* Dashboard is the default landing page for super admins */}
      <Route path="/super-admin/dashboard">
        {() => <SuperRouteGuard component={SuperAdminDashboardPage} />}
      </Route>
      {/* Tenants management page */}
      <Route path="/super-admin/tenants">
        {() => <SuperRouteGuard component={SuperAdminPage} />}
      </Route>
      {/* Legacy route: redirect old reports URL to dashboard */}
      <Route path="/super-admin/reports">
        {() => <Redirect to="/super-admin/dashboard" />}
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
      <Route path="/super-admin/chat">
        {() => <SuperRouteGuard component={SuperChatMonitoringPage} />}
      </Route>
      <Route path="/super-admin/users">
        {() => <SuperRouteGuard component={SuperAdminUsersPage} />}
      </Route>
      {/* Default: redirect /super-admin to dashboard */}
      <Route path="/super-admin">
        {() => <Redirect to="/super-admin/dashboard" />}
      </Route>
      <Route>
        {() => <Redirect to="/super-admin/dashboard" />}
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
        {() => <Redirect to={`/my-time${window.location.search}`} />}
      </Route>
      <Route path="/calendar">
        {() => <TenantRouteGuard component={CalendarPage} />}
      </Route>
      <Route path="/my-time">
        {() => <TenantRouteGuard component={MyTimePage} />}
      </Route>
      <Route path="/my-calendar">
        {() => <TenantRouteGuard component={MyCalendarPage} />}
      </Route>
      <Route path="/chat">
        {() => <TenantRouteGuard component={ChatPage} />}
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
      <Route path="/user-manager">
        {() => <TenantRouteGuard component={UserManagerPage} />}
      </Route>
      <Route path="/reports">
        {() => <TenantRouteGuard component={ReportsPage} />}
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
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <NotificationCenter />
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

function ChatToggleButton() {
  const { toggleDrawer } = useChatDrawer();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleDrawer}
      data-testid="button-open-chat"
      title="Open Chat"
    >
      <MessageCircle className="h-4 w-4" />
    </Button>
  );
}

function TenantLayout() {
  const { isImpersonating } = useAppMode();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();
  
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ChatDrawerProvider>
      <SidebarProvider style={style as React.CSSProperties}>
        <TenantContextGate>
          <CommandPalette
            onNewTask={() => setLocation("/my-tasks")}
            onNewProject={() => setLocation("/projects")}
            onStartTimer={() => setLocation("/my-time")}
          />
          <div className={`flex flex-col h-screen w-full ${isImpersonating ? "ring-2 ring-amber-500 ring-inset" : ""}`}>
            {/* Tenant impersonation banner (Act as Tenant mode) */}
            <ImpersonationBanner />
            <div className="flex flex-1 overflow-hidden">
              <TenantSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className={`flex items-center justify-between h-12 px-2 md:px-4 border-b shrink-0 ${isImpersonating ? "border-amber-400 bg-amber-50/30 dark:bg-amber-900/10" : "border-border bg-background"}`}>
                  <div className="flex items-center gap-1 md:gap-2">
                    <SidebarTrigger data-testid="button-sidebar-toggle" className="hidden md:flex" />
                    {isImpersonating && (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 rounded hidden md:inline" data-testid="badge-impersonating">
                        TENANT IMPERSONATION
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 md:gap-2">
                    <GlobalActiveTimer />
                    <ChatToggleButton />
                    <NotificationCenter />
                    <ThemeToggle className="hidden md:flex" />
                    <UserMenu />
                  </div>
                </header>
                <main className={`flex-1 overflow-hidden ${isMobile ? "pb-16" : ""}`}>
                  <TenantRouter />
                </main>
              </div>
            </div>
          </div>
          {isMobile && <MobileNavBar />}
          <GlobalChatDrawer />
        </TenantContextGate>
      </SidebarProvider>
    </ChatDrawerProvider>
  );
}

function ClientPortalLayout() {
  const isMobile = useIsMobile();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <ClientPortalSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between h-12 px-2 md:px-4 border-b border-border bg-background shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="hidden md:flex" />
            </div>
            <div className="flex items-center gap-1 md:gap-2">
              <NotificationCenter />
              <ThemeToggle className="hidden md:flex" />
              <UserMenu />
            </div>
          </header>
          <main className={`flex-1 overflow-hidden ${isMobile ? "pb-16" : ""}`}>
            <ClientPortalRouter />
          </main>
        </div>
      </div>
      {isMobile && <ClientPortalMobileNav />}
    </SidebarProvider>
  );
}

function AppLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const { appMode } = useAppMode();
  const [location] = useLocation();

  if (location === "/login" || location === "/tenant-onboarding" || location === "/accept-terms" || location.startsWith("/auth/platform-invite") || location.startsWith("/accept-invite/") || location.startsWith("/auth/forgot-password") || location.startsWith("/auth/reset-password")) {
    return (
      <Switch>
        <Route path="/login" component={LoginPage} />
        <Route path="/tenant-onboarding">
          {() => <ProtectedRoute component={TenantOnboardingPage} />}
        </Route>
        <Route path="/accept-terms">
          {() => <ProtectedRoute component={AcceptTermsPage} />}
        </Route>
        <Route path="/auth/platform-invite" component={PlatformInvitePage} />
        <Route path="/accept-invite/:token" component={AcceptInvitePage} />
        <Route path="/auth/forgot-password" component={ForgotPasswordPage} />
        <Route path="/auth/reset-password" component={ResetPasswordPage} />
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
  const isClientUser = user?.role === "client";
  const isSuperRoute = location.startsWith("/super-admin");
  const isPortalRoute = location.startsWith("/portal");

  // Client users go to client portal
  if (isClientUser) {
    if (!isPortalRoute) {
      return <Redirect to="/portal" />;
    }
    return <ClientPortalLayout />;
  }

  // Non-client users shouldn't access portal
  if (isPortalRoute && !isClientUser) {
    return <Redirect to="/" />;
  }

  if (isSuperUser && appMode === "super") {
    if (!isSuperRoute) {
      return <Redirect to="/super-admin/dashboard" />;
    }
    return <SuperLayout />;
  }

  if (isSuperRoute && (!isSuperUser || appMode === "tenant")) {
    return <Redirect to="/" />;
  }

  return <TenantLayout />;
}

function UserImpersonationWrapper({ children }: { children: React.ReactNode }) {
  const { userImpersonation } = useAuth();
  
  if (userImpersonation?.isImpersonating) {
    return (
      <div className="flex flex-col h-screen">
        <ImpersonationBanner userImpersonation={userImpersonation} />
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <TenantThemeProvider>
              <UserImpersonationWrapper>
                <AppLayout />
              </UserImpersonationWrapper>
            </TenantThemeProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
