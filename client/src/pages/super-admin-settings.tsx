import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, Users, FileText, Palette, Settings, Shield, Save, Mail, HardDrive, Check, X, 
  Plus, Link, Copy, MoreHorizontal, UserCheck, UserX, Clock, AlertCircle, KeyRound, Image
} from "lucide-react";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { parseApiError } from "@/lib/parseApiError";

interface SystemSettings {
  id: number;
  defaultAppName: string | null;
  defaultLogoUrl: string | null;
  defaultIconUrl: string | null;
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
  hasPendingInvite?: boolean;
  inviteExpiresAt?: string | null;
  passwordSet?: boolean;
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

interface InviteResponse {
  inviteUrl: string;
  expiresAt: string;
  tokenMasked: string;
  emailSent?: boolean;
  mailgunConfigured?: boolean;
}

export default function SuperAdminSettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("admins");
  const [brandingForm, setBrandingForm] = useState<Partial<SystemSettings>>({});
  
  const [newAdminDrawerOpen, setNewAdminDrawerOpen] = useState(false);
  const [editAdminDrawerOpen, setEditAdminDrawerOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<PlatformAdmin | null>(null);
  const [inviteLinkDialogOpen, setInviteLinkDialogOpen] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [adminToDeactivate, setAdminToDeactivate] = useState<PlatformAdmin | null>(null);
  
  const [newAdminForm, setNewAdminForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
  });
  
  const [editAdminForm, setEditAdminForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    isActive: true,
  });

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: systemSettings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ["/api/v1/super/system-settings"],
  });

  const { data: platformAdmins = [], isLoading: adminsLoading, refetch: refetchAdmins } = useQuery<PlatformAdmin[]>({
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

  const createAdminMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string }) => {
      return apiRequest("POST", "/api/v1/super/admins", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/admins"] });
      toast({ title: "Platform admin created successfully" });
      setNewAdminDrawerOpen(false);
      setNewAdminForm({ email: "", firstName: "", lastName: "" });
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to create admin", description: parsed.message, variant: "destructive" });
    },
  });

  const updateAdminMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<PlatformAdmin> }) => {
      return apiRequest("PATCH", `/api/v1/super/admins/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/admins"] });
      toast({ title: "Platform admin updated successfully" });
      setEditAdminDrawerOpen(false);
      setSelectedAdmin(null);
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to update admin", description: parsed.message, variant: "destructive" });
    },
  });

  const generateInviteMutation = useMutation({
    mutationFn: async ({ id, sendEmail }: { id: string; sendEmail: boolean }) => {
      const response = await apiRequest("POST", `/api/v1/super/admins/${id}/invite`, { 
        expiresInDays: 7,
        sendEmail 
      });
      return response.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      setGeneratedInviteUrl(data.inviteUrl);
      setInviteLinkDialogOpen(true);
      if (data.emailSent) {
        toast({ title: "Invite email sent successfully" });
      }
      refetchAdmins();
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to generate invite", description: parsed.message, variant: "destructive" });
    },
  });

  const handleSaveBranding = () => {
    updateSettingsMutation.mutate(brandingForm);
  };

  const handleCreateAdmin = () => {
    if (!newAdminForm.email || !newAdminForm.firstName || !newAdminForm.lastName) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    createAdminMutation.mutate(newAdminForm);
  };

  const handleUpdateAdmin = () => {
    if (!selectedAdmin) return;
    updateAdminMutation.mutate({
      id: selectedAdmin.id,
      data: {
        email: editAdminForm.email,
        firstName: editAdminForm.firstName,
        lastName: editAdminForm.lastName,
        isActive: editAdminForm.isActive,
      },
    });
  };

  const handleEditAdmin = (admin: PlatformAdmin) => {
    setSelectedAdmin(admin);
    setEditAdminForm({
      email: admin.email,
      firstName: admin.firstName || "",
      lastName: admin.lastName || "",
      isActive: admin.isActive,
    });
    setEditAdminDrawerOpen(true);
  };

  const handleGenerateInvite = (admin: PlatformAdmin, sendEmail: boolean = false) => {
    generateInviteMutation.mutate({ id: admin.id, sendEmail });
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      toast({ title: "Invite link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleDeactivateAdmin = (admin: PlatformAdmin) => {
    setAdminToDeactivate(admin);
    setDeactivateDialogOpen(true);
  };

  const confirmDeactivate = () => {
    if (!adminToDeactivate) return;
    updateAdminMutation.mutate({
      id: adminToDeactivate.id,
      data: { isActive: false },
    });
    setDeactivateDialogOpen(false);
    setAdminToDeactivate(null);
  };

  const handleReactivateAdmin = (admin: PlatformAdmin) => {
    updateAdminMutation.mutate({
      id: admin.id,
      data: { isActive: true },
    });
  };

  const getAdminStatusBadge = (admin: PlatformAdmin) => {
    if (!admin.isActive) {
      return <Badge variant="secondary"><UserX className="h-3 w-3 mr-1" />Deactivated</Badge>;
    }
    if (!admin.passwordSet) {
      if (admin.hasPendingInvite) {
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Invite Pending</Badge>;
      }
      return <Badge variant="outline"><AlertCircle className="h-3 w-3 mr-1" />Needs Invite</Badge>;
    }
    return <Badge variant="default"><UserCheck className="h-3 w-3 mr-1" />Active</Badge>;
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
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div>
                  <CardTitle>Platform Administrators</CardTitle>
                  <CardDescription>Manage super user accounts with full platform access</CardDescription>
                </div>
                <Button onClick={() => setNewAdminDrawerOpen(true)} data-testid="button-new-admin">
                  <Plus className="h-4 w-4 mr-2" />
                  New Platform Admin
                </Button>
              </CardHeader>
              <CardContent>
                {adminsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : platformAdmins.length > 0 ? (
                  <div className="space-y-3">
                    {platformAdmins.map((admin) => (
                      <div key={admin.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`admin-row-${admin.id}`}>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Shield className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <div className="font-medium">{admin.firstName && admin.lastName ? `${admin.firstName} ${admin.lastName}` : admin.name || admin.email}</div>
                            <div className="text-sm text-muted-foreground">{admin.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {getAdminStatusBadge(admin)}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-admin-actions-${admin.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEditAdmin(admin)} data-testid={`button-edit-admin-${admin.id}`}>
                                <Settings className="h-4 w-4 mr-2" />
                                Edit Details
                              </DropdownMenuItem>
                              {admin.isActive && !admin.passwordSet && (
                                <>
                                  <DropdownMenuItem onClick={() => handleGenerateInvite(admin)} data-testid={`button-generate-link-${admin.id}`}>
                                    <Link className="h-4 w-4 mr-2" />
                                    Generate Invite Link
                                  </DropdownMenuItem>
                                  {integrationStatus?.mailgun && (
                                    <DropdownMenuItem onClick={() => handleGenerateInvite(admin, true)} data-testid={`button-send-email-${admin.id}`}>
                                      <Mail className="h-4 w-4 mr-2" />
                                      Send Invite Email
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              {admin.isActive ? (
                                <DropdownMenuItem 
                                  onClick={() => handleDeactivateAdmin(admin)}
                                  className="text-destructive"
                                  data-testid={`button-deactivate-${admin.id}`}
                                >
                                  <UserX className="h-4 w-4 mr-2" />
                                  Deactivate
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onClick={() => handleReactivateAdmin(admin)} data-testid={`button-reactivate-${admin.id}`}>
                                  <UserCheck className="h-4 w-4 mr-2" />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
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
                    
                    <div className="border-t pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Image className="h-5 w-5 text-muted-foreground" />
                        <h3 className="font-medium">Branding Assets</h3>
                      </div>
                      <div className="grid gap-6 md:grid-cols-3">
                        <S3Dropzone
                          category="global-branding-logo"
                          label="Default Logo"
                          description="Full logo for headers and login pages (max 2MB)"
                          valueUrl={brandingForm.defaultLogoUrl !== undefined ? brandingForm.defaultLogoUrl : systemSettings?.defaultLogoUrl}
                          onUploaded={(fileUrl) => setBrandingForm({ ...brandingForm, defaultLogoUrl: fileUrl })}
                          onRemoved={() => setBrandingForm({ ...brandingForm, defaultLogoUrl: null })}
                        />
                        <S3Dropzone
                          category="global-branding-icon"
                          label="Default Icon"
                          description="Square icon for compact spaces (max 512KB)"
                          valueUrl={brandingForm.defaultIconUrl !== undefined ? brandingForm.defaultIconUrl : systemSettings?.defaultIconUrl}
                          onUploaded={(fileUrl) => setBrandingForm({ ...brandingForm, defaultIconUrl: fileUrl })}
                          onRemoved={() => setBrandingForm({ ...brandingForm, defaultIconUrl: null })}
                        />
                        <S3Dropzone
                          category="global-branding-favicon"
                          label="Default Favicon"
                          description="Browser tab icon (max 512KB)"
                          valueUrl={brandingForm.defaultFaviconUrl !== undefined ? brandingForm.defaultFaviconUrl : systemSettings?.defaultFaviconUrl}
                          onUploaded={(fileUrl) => setBrandingForm({ ...brandingForm, defaultFaviconUrl: fileUrl })}
                          onRemoved={() => setBrandingForm({ ...brandingForm, defaultFaviconUrl: null })}
                        />
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

      {/* New Platform Admin Drawer */}
      <Sheet open={newAdminDrawerOpen} onOpenChange={setNewAdminDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl" data-testid="drawer-new-admin">
          <SheetHeader>
            <SheetTitle>New Platform Admin</SheetTitle>
            <SheetDescription>Create a new super user account with full platform access</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="newFirstName">First Name</Label>
              <Input
                id="newFirstName"
                value={newAdminForm.firstName}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, firstName: e.target.value })}
                placeholder="John"
                data-testid="input-new-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newLastName">Last Name</Label>
              <Input
                id="newLastName"
                value={newAdminForm.lastName}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, lastName: e.target.value })}
                placeholder="Doe"
                data-testid="input-new-last-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newEmail">Email</Label>
              <Input
                id="newEmail"
                type="email"
                value={newAdminForm.email}
                onChange={(e) => setNewAdminForm({ ...newAdminForm, email: e.target.value })}
                placeholder="admin@example.com"
                data-testid="input-new-email"
              />
            </div>
            <div className="rounded-lg border border-muted p-4 bg-muted/20">
              <div className="flex items-start gap-3">
                <KeyRound className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">No password required</p>
                  <p>After creating this admin, you'll need to generate an invite link for them to set their password.</p>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleCreateAdmin} 
                disabled={createAdminMutation.isPending}
                className="flex-1"
                data-testid="button-create-admin"
              >
                {createAdminMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-2" />
                )}
                Create Admin
              </Button>
              <Button variant="outline" onClick={() => setNewAdminDrawerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit Platform Admin Drawer */}
      <Sheet open={editAdminDrawerOpen} onOpenChange={setEditAdminDrawerOpen}>
        <SheetContent className="w-full sm:max-w-xl" data-testid="drawer-edit-admin">
          <SheetHeader>
            <SheetTitle>Edit Platform Admin</SheetTitle>
            <SheetDescription>Update administrator details</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="editFirstName">First Name</Label>
              <Input
                id="editFirstName"
                value={editAdminForm.firstName}
                onChange={(e) => setEditAdminForm({ ...editAdminForm, firstName: e.target.value })}
                data-testid="input-edit-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editLastName">Last Name</Label>
              <Input
                id="editLastName"
                value={editAdminForm.lastName}
                onChange={(e) => setEditAdminForm({ ...editAdminForm, lastName: e.target.value })}
                data-testid="input-edit-last-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={editAdminForm.email}
                onChange={(e) => setEditAdminForm({ ...editAdminForm, email: e.target.value })}
                data-testid="input-edit-email"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleUpdateAdmin} 
                disabled={updateAdminMutation.isPending}
                className="flex-1"
                data-testid="button-update-admin"
              >
                {updateAdminMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setEditAdminDrawerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Invite Link Dialog */}
      <AlertDialog open={inviteLinkDialogOpen} onOpenChange={setInviteLinkDialogOpen}>
        <AlertDialogContent data-testid="dialog-invite-link">
          <AlertDialogHeader>
            <AlertDialogTitle>Invite Link Generated</AlertDialogTitle>
            <AlertDialogDescription>
              Share this link with the administrator to set their password and activate their account.
              The link expires in 7 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-4">
            <div className="flex items-center gap-2">
              <Input 
                value={generatedInviteUrl || ""} 
                readOnly 
                className="font-mono text-sm"
                data-testid="input-invite-url"
              />
              <Button size="icon" variant="outline" onClick={handleCopyInviteLink} data-testid="button-copy-link">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setInviteLinkDialogOpen(false)} data-testid="button-close-invite-dialog">
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
        <AlertDialogContent data-testid="dialog-deactivate">
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Platform Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate {adminToDeactivate?.email}? They will no longer be able to access the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-deactivate">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-deactivate"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
