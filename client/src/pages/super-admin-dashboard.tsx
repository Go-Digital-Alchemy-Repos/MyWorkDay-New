/**
 * Super Admin Dashboard
 * 
 * Purpose: Default landing page for super admins showing platform-wide analytics.
 * 
 * This page contains the Global Reports content (previously at /super-admin/reports).
 * Super admins are redirected here after login when not impersonating a tenant.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Building2, FolderKanban, Users, CheckSquare, Clock, AlertTriangle, TrendingUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";

interface TenantsSummary {
  total: number;
  active: number;
  inactive: number;
  suspended: number;
  missingAgreement: number;
  missingBranding: number;
  missingAdminUser: number;
  recentlyCreated: number;
}

interface ProjectsSummary {
  total: number;
  active: number;
  archived: number;
  withOverdueTasks: number;
  topTenantsByProjects: Array<{ tenantId: string; tenantName: string; projectCount: number }>;
}

interface UsersSummary {
  total: number;
  byRole: {
    super_user: number;
    admin: number;
    employee: number;
    client: number;
  };
  activeUsers: number;
  pendingInvites: number;
}

interface TasksSummary {
  total: number;
  byStatus: {
    todo: number;
    in_progress: number;
    blocked: number;
    done: number;
  };
  overdue: number;
  dueToday: number;
  upcoming: number;
  unassigned: number;
}

interface TimeSummary {
  totalMinutesThisWeek: number;
  totalMinutesThisMonth: number;
  topTenantsByHours: Array<{ tenantId: string; tenantName: string; totalMinutes: number }>;
  topUsersByHours: Array<{ userId: string; userName: string; totalMinutes: number }>;
}

function StatCard({ title, value, subtitle, icon: Icon }: { title: string; value: number | string; subtitle?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

export default function SuperAdminDashboardPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("tenants");

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: tenantsSummary, isLoading: tenantsLoading } = useQuery<TenantsSummary>({
    queryKey: ["/api/v1/super/reports/tenants-summary"],
    enabled: activeTab === "tenants",
  });

  const { data: projectsSummary, isLoading: projectsLoading } = useQuery<ProjectsSummary>({
    queryKey: ["/api/v1/super/reports/projects-summary"],
    enabled: activeTab === "projects",
  });

  const { data: usersSummary, isLoading: usersLoading } = useQuery<UsersSummary>({
    queryKey: ["/api/v1/super/reports/users-summary"],
    enabled: activeTab === "users",
  });

  const { data: tasksSummary, isLoading: tasksLoading } = useQuery<TasksSummary>({
    queryKey: ["/api/v1/super/reports/tasks-summary"],
    enabled: activeTab === "tasks",
  });

  const { data: timeSummary, isLoading: timeLoading } = useQuery<TimeSummary>({
    queryKey: ["/api/v1/super/reports/time-summary"],
    enabled: activeTab === "time",
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-bold" data-testid="heading-dashboard">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Cross-tenant analytics and platform overview</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="dashboard-tabs">
            <TabsTrigger value="tenants" data-testid="tab-tenants">
              <Building2 className="h-4 w-4 mr-2" />
              Tenants
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-projects">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              Tasks
            </TabsTrigger>
            <TabsTrigger value="time" data-testid="tab-time">
              <Clock className="h-4 w-4 mr-2" />
              Time Tracking
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tenants">
            {tenantsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tenantsSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Tenants" value={tenantsSummary.total} icon={Building2} />
                  <StatCard title="Active" value={tenantsSummary.active} subtitle={`${tenantsSummary.inactive} inactive, ${tenantsSummary.suspended} suspended`} icon={TrendingUp} />
                  <StatCard title="Missing Agreement" value={tenantsSummary.missingAgreement} icon={AlertTriangle} />
                  <StatCard title="Recently Created" value={tenantsSummary.recentlyCreated} subtitle="Last 7 days" icon={Building2} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration Status</CardTitle>
                    <CardDescription>Tenants missing critical configuration</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Agreement</span>
                        <Badge variant={tenantsSummary.missingAgreement > 0 ? "destructive" : "secondary"}>
                          {tenantsSummary.missingAgreement}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Branding</span>
                        <Badge variant={tenantsSummary.missingBranding > 0 ? "outline" : "secondary"}>
                          {tenantsSummary.missingBranding}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Missing Admin User</span>
                        <Badge variant={tenantsSummary.missingAdminUser > 0 ? "destructive" : "secondary"}>
                          {tenantsSummary.missingAdminUser}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No tenant data available</div>
            )}
          </TabsContent>

          <TabsContent value="projects">
            {projectsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : projectsSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Projects" value={projectsSummary.total} icon={FolderKanban} />
                  <StatCard title="Active" value={projectsSummary.active} icon={TrendingUp} />
                  <StatCard title="Archived" value={projectsSummary.archived} icon={FolderKanban} />
                  <StatCard title="With Overdue Tasks" value={projectsSummary.withOverdueTasks} icon={AlertTriangle} />
                </div>
                {projectsSummary.topTenantsByProjects?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Tenants by Projects</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {projectsSummary.topTenantsByProjects.map((tenant, index) => (
                          <div key={tenant.tenantId} className="flex items-center justify-between">
                            <span className="text-sm">{index + 1}. {tenant.tenantName}</span>
                            <Badge variant="secondary">{tenant.projectCount} projects</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No project data available</div>
            )}
          </TabsContent>

          <TabsContent value="users">
            {usersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : usersSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Users" value={usersSummary.total} icon={Users} />
                  <StatCard title="Active Users" value={usersSummary.activeUsers} icon={TrendingUp} />
                  <StatCard title="Pending Invites" value={usersSummary.pendingInvites} icon={Users} />
                  <StatCard title="Platform Admins" value={usersSummary.byRole.super_user} icon={Users} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Users by Role</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Super Users</span>
                        <Badge variant="secondary">{usersSummary.byRole.super_user}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Tenant Admins</span>
                        <Badge variant="secondary">{usersSummary.byRole.admin}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Employees</span>
                        <Badge variant="secondary">{usersSummary.byRole.employee}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Clients</span>
                        <Badge variant="secondary">{usersSummary.byRole.client}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No user data available</div>
            )}
          </TabsContent>

          <TabsContent value="tasks">
            {tasksLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tasksSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard title="Total Tasks" value={tasksSummary.total} icon={CheckSquare} />
                  <StatCard title="Overdue" value={tasksSummary.overdue} icon={AlertTriangle} />
                  <StatCard title="Due Today" value={tasksSummary.dueToday} icon={Clock} />
                  <StatCard title="Unassigned" value={tasksSummary.unassigned} icon={Users} />
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Tasks by Status</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">To Do</span>
                        <Badge variant="secondary">{tasksSummary.byStatus.todo}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">In Progress</span>
                        <Badge variant="secondary">{tasksSummary.byStatus.in_progress}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Blocked</span>
                        <Badge variant="destructive">{tasksSummary.byStatus.blocked}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Done</span>
                        <Badge variant="secondary">{tasksSummary.byStatus.done}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No task data available</div>
            )}
          </TabsContent>

          <TabsContent value="time">
            {timeLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : timeSummary ? (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <StatCard 
                    title="This Week" 
                    value={`${Math.round(timeSummary.totalMinutesThisWeek / 60)}h`} 
                    subtitle={`${timeSummary.totalMinutesThisWeek} minutes`}
                    icon={Clock} 
                  />
                  <StatCard 
                    title="This Month" 
                    value={`${Math.round(timeSummary.totalMinutesThisMonth / 60)}h`} 
                    subtitle={`${timeSummary.totalMinutesThisMonth} minutes`}
                    icon={Clock} 
                  />
                </div>
                {timeSummary.topTenantsByHours?.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Top Tenants by Hours</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {timeSummary.topTenantsByHours.map((tenant, index) => (
                          <div key={tenant.tenantId} className="flex items-center justify-between">
                            <span className="text-sm">{index + 1}. {tenant.tenantName}</span>
                            <Badge variant="secondary">{Math.round(tenant.totalMinutes / 60)}h</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">No time tracking data available</div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
