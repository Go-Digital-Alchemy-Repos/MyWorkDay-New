import { useLocation, useRoute, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Building2, BarChart3, Puzzle, Settings as SettingsIcon, Palette, HardDrive, FileText, ClipboardList } from "lucide-react";
import { TeamTab } from "@/components/settings/team-tab";
import { WorkspacesTab } from "@/components/settings/workspaces-tab";
import { ReportsTab } from "@/components/settings/reports-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { BrandingTab } from "@/components/settings/branding-tab";
import { TenantIntegrationsTab } from "@/components/settings/tenant-integrations-tab";
import { AgreementTab } from "@/components/settings/agreement-tab";
import { WorkloadTab } from "@/components/settings/workload-tab";

const SETTINGS_TABS = [
  { id: "team", label: "Team", icon: Users },
  { id: "workspaces", label: "Workspaces", icon: Building2 },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "tenant-integrations", label: "Services", icon: HardDrive },
  { id: "agreement", label: "Agreement", icon: FileText },
  { id: "workload", label: "Workload", icon: ClipboardList },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "integrations", label: "Integrations", icon: Puzzle },
];

export default function SettingsPage() {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const [, params] = useRoute("/settings/:tab");

  // Only allow admin or super_user roles to access settings
  if (user?.role !== "admin" && user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const activeTab = params?.tab || "team";

  const handleTabChange = (value: string) => {
    setLocation(`/settings/${value}`);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-6xl mx-auto py-6 px-4">
        <div className="flex items-center gap-3 mb-6">
          <SettingsIcon className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Settings</h1>
            <p className="text-muted-foreground text-sm">
              Manage your workspace, team, and integrations
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-8 h-auto p-1">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="flex items-center gap-2 py-2.5"
                data-testid={`tab-settings-${tab.id}`}
              >
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="team" className="mt-6">
            <TeamTab />
          </TabsContent>

          <TabsContent value="workspaces" className="mt-6">
            <WorkspacesTab />
          </TabsContent>

          <TabsContent value="branding" className="mt-6">
            <BrandingTab />
          </TabsContent>

          <TabsContent value="tenant-integrations" className="mt-6">
            <TenantIntegrationsTab />
          </TabsContent>

          <TabsContent value="agreement" className="mt-6">
            <AgreementTab />
          </TabsContent>

          <TabsContent value="workload" className="mt-6">
            <WorkloadTab />
          </TabsContent>

          <TabsContent value="reports" className="mt-6">
            <ReportsTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
