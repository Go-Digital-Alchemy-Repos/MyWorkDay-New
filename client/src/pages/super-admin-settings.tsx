import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2, Users, FileText, Palette, Settings, Shield, Save, Mail, HardDrive, Check, X } from "lucide-react";

interface SystemSettings {
  id: number;
  defaultAppName: string | null;
  defaultLogoUrl: string | null;
  defaultFaviconUrl: string | null;
  defaultPrimaryColor: string | null;
  defaultSecondaryColor: string | null;
  supportEmail: string | null;
  platformVersion: string | null;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
}

interface PlatformAdmin {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TenantAgreementStatus {
  tenantId: string;
  tenantName: string;
  hasActiveAgreement: boolean;
  currentVersion: string | null;
  effectiveDate: string | null;
  acceptedCount: number;
  totalUsers: number;
}

interface IntegrationStatus {
  mailgun: boolean;
  s3: boolean;
}

export default function SuperAdminSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("admins");
  const [brandingForm, setBrandingForm] = useState<Partial<SystemSettings>>({});

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: systemSettings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ["/api/v1/super/system-settings"],
  });

  const { data: platformAdmins = [], isLoading: adminsLoading } = useQuery<PlatformAdmin[]>({
    queryKey: ["/api/v1/super/admins"],
    enabled: activeTab === "admins",
  });

  const { data: agreementStatus = [], isLoading: agreementsLoading } = useQuery<TenantAgreementStatus[]>({
    queryKey: ["/api/v1/super/agreements/tenants-summary"],
    enabled: activeTab === "agreements",
  });

  const { data: integrationStatus, isLoading: integrationsLoading } = useQuery<IntegrationStatus>({
    queryKey: ["/api/v1/super/integrations/status"],
    enabled: activeTab === "integrations",
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: Partial<SystemSettings>) => {
      return apiRequest("PATCH", "/api/v1/super/system-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/system-settings"] });
      toast({ title: "Settings updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update settings", description: error.message, variant: "destructive" });
    },
  });

  const handleSaveBranding = () => {
    updateSettingsMutation.mutate(brandingForm);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-muted-foreground mt-1">Platform-wide configuration and administration</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="settings-tabs">
            <TabsTrigger value="admins" data-testid="tab-admins">
              <Users className="h-4 w-4 mr-2" />
              Platform Admins
            </TabsTrigger>
            <TabsTrigger value="agreements" data-testid="tab-agreements">
              <FileText className="h-4 w-4 mr-2" />
              Agreements
            </TabsTrigger>
            <TabsTrigger value="branding" data-testid="tab-branding">
              <Palette className="h-4 w-4 mr-2" />
              Global Branding
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <Settings className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="admins">
            <Card>
              <CardHeader>
                <CardTitle>Platform Administrators</CardTitle>
                <CardDescription>Manage super user accounts with full platform access</CardDescription>
              </CardHeader>
              <CardContent>
                {adminsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : platformAdmins.length > 0 ? (
                  <div className="space-y-4">
                    {platformAdmins.map((admin) => (
                      <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{admin.name || admin.email}</div>
                            <div className="text-sm text-muted-foreground">{admin.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={admin.isActive ? "default" : "secondary"}>
                            {admin.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No platform administrators found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="agreements">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Agreement Status</CardTitle>
                <CardDescription>Overview of SaaS agreement compliance across tenants</CardDescription>
              </CardHeader>
              <CardContent>
                {agreementsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : agreementStatus.length > 0 ? (
                  <div className="space-y-4">
                    {agreementStatus.map((tenant) => (
                      <div key={tenant.tenantId} className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                          <div className="font-medium">{tenant.tenantName}</div>
                          <div className="text-sm text-muted-foreground">
                            {tenant.hasActiveAgreement 
                              ? `Version ${tenant.currentVersion} • ${tenant.acceptedCount}/${tenant.totalUsers} accepted`
                              : "No active agreement"
                            }
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {tenant.hasActiveAgreement ? (
                            <Badge variant="default">
                              <Check className="h-3 w-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <X className="h-3 w-3 mr-1" />
                              Missing
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tenants found
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding">
            <Card>
              <CardHeader>
                <CardTitle>Global Branding Defaults</CardTitle>
                <CardDescription>Platform-wide defaults used when tenants haven't configured their own branding</CardDescription>
              </CardHeader>
              <CardContent>
                {settingsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="defaultAppName">Default App Name</Label>
                        <Input
                          id="defaultAppName"
                          placeholder="MyWorkDay"
                          defaultValue={systemSettings?.defaultAppName || ""}
                          onChange={(e) => setBrandingForm({ ...brandingForm, defaultAppName: e.target.value })}
                          data-testid="input-default-app-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="supportEmail">Support Email</Label>
                        <Input
                          id="supportEmail"
                          type="email"
                          placeholder="support@example.com"
                          defaultValue={systemSettings?.supportEmail || ""}
                          onChange={(e) => setBrandingForm({ ...brandingForm, supportEmail: e.target.value })}
                          data-testid="input-support-email"
                        />
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="defaultPrimaryColor">Primary Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="defaultPrimaryColor"
                            placeholder="#3B82F6"
                            defaultValue={systemSettings?.defaultPrimaryColor || ""}
                            onChange={(e) => setBrandingForm({ ...brandingForm, defaultPrimaryColor: e.target.value })}
                            data-testid="input-primary-color"
                          />
                          <div 
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: brandingForm.defaultPrimaryColor || systemSettings?.defaultPrimaryColor || "#3B82F6" }}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="defaultSecondaryColor">Secondary Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="defaultSecondaryColor"
                            placeholder="#64748B"
                            defaultValue={systemSettings?.defaultSecondaryColor || ""}
                            onChange={(e) => setBrandingForm({ ...brandingForm, defaultSecondaryColor: e.target.value })}
                            data-testid="input-secondary-color"
                          />
                          <div 
                            className="w-10 h-10 rounded border"
                            style={{ backgroundColor: brandingForm.defaultSecondaryColor || systemSettings?.defaultSecondaryColor || "#64748B" }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button 
                        onClick={handleSaveBranding}
                        disabled={updateSettingsMutation.isPending}
                        data-testid="button-save-branding"
                      >
                        {updateSettingsMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integrations">
            <Card>
              <CardHeader>
                <CardTitle>Platform Integrations</CardTitle>
                <CardDescription>Global integration configuration status</CardDescription>
              </CardHeader>
              <CardContent>
                {integrationsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">Mailgun</div>
                          <div className="text-sm text-muted-foreground">Email delivery service</div>
                        </div>
                      </div>
                      <Badge variant={integrationStatus?.mailgun ? "default" : "secondary"}>
                        {integrationStatus?.mailgun ? "Configured" : "Not Configured"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <div className="font-medium">S3 Storage</div>
                          <div className="text-sm text-muted-foreground">File storage service</div>
                        </div>
                      </div>
                      <Badge variant={integrationStatus?.s3 ? "default" : "secondary"}>
                        {integrationStatus?.s3 ? "Configured" : "Not Configured"}
                      </Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
