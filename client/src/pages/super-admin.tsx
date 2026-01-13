import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Plus, Edit2, Shield, CheckCircle, XCircle, UserPlus, Clock, Copy, AlertTriangle, Loader2, Activity, Database, RefreshCw, Play, Settings, Palette, HardDrive, Save, TestTube, Eye, EyeOff, Mail, Lock, Check, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TenantSettingsDialog } from "@/components/super-admin/tenant-settings-dialog";
import type { Tenant } from "@shared/schema";

interface TenantSettings {
  displayName?: string;
  appName?: string | null;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  loginMessage?: string | null;
  supportEmail?: string | null;
  whiteLabelEnabled?: boolean;
  hideVendorBranding?: boolean;
}

type IntegrationStatus = "not_configured" | "configured" | "error";

interface TenancyHealthResponse {
  currentMode: string;
  missingTenantIds: Array<{
    table: string;
    missingTenantIdCount: number;
  }>;
  totalMissing: number;
  warningStats: {
    last24Hours: number;
    last7Days: number;
    total: number;
  };
  readinessCheck: {
    canEnableStrict: boolean;
    blockers: string[];
  };
  activeTenantCount: number;
}

interface TenantWithDetails extends Tenant {
  settings?: {
    displayName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    supportEmail: string | null;
  } | null;
  userCount?: number;
}

interface InviteResponse {
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    tenantId: string;
  };
  inviteUrl: string;
  inviteType: "link" | "email";
  emailSent: boolean;
  emailError: string | null;
  message: string;
}

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [invitingTenant, setInvitingTenant] = useState<Tenant | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteType, setInviteType] = useState<"link" | "email">("link");
  const [activeTab, setActiveTab] = useState("tenants");
  const [settingsTenant, setSettingsTenant] = useState<Tenant | null>(null);
  const [settingsTab, setSettingsTab] = useState("branding");

  const { data: tenants = [], isLoading } = useQuery<TenantWithDetails[]>({
    queryKey: ["/api/v1/super/tenants-detail"],
  });

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<TenancyHealthResponse>({
    queryKey: ["/api/v1/super/tenancy/health"],
    enabled: activeTab === "health",
  });

  const createTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      return apiRequest("POST", "/api/v1/super/tenants", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setIsCreateDialogOpen(false);
      toast({ title: "Tenant created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; status?: string } }) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setEditingTenant(null);
      toast({ title: "Tenant updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const inviteAdminMutation = useMutation({
    mutationFn: async ({ tenantId, email, firstName, lastName, inviteType }: { tenantId: string; email: string; firstName?: string; lastName?: string; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/invite-admin`, { email, firstName, lastName, inviteType });
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setLastInviteUrl(data.inviteUrl);
      if (variables.inviteType === "email") {
        if (data.emailSent) {
          toast({ title: "Email sent", description: `Invitation email sent to ${data.invitation.email}` });
        } else if (data.emailError) {
          toast({ 
            title: "Email not sent", 
            description: data.emailError, 
            variant: "destructive" 
          });
        }
      } else {
        toast({ title: "Invite link created", description: `Copy the link to share with ${data.invitation.email}` });
      }
    },
    onError: (error: any) => {
      toast({ title: "Failed to create invitation", description: error.message, variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const res = await fetch("/api/v1/super/tenancy/backfill", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Confirm-Backfill": "YES" 
        },
        credentials: "include",
        body: JSON.stringify({ dryRun }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      return res.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenancy/health"] });
      if (variables.dryRun) {
        toast({ 
          title: "Dry Run Complete", 
          description: `Would update ${data.results?.reduce((acc: number, r: any) => acc + r.wouldUpdate, 0) || 0} records` 
        });
      } else {
        toast({ 
          title: "Backfill Complete", 
          description: `Updated ${data.results?.reduce((acc: number, r: any) => acc + r.updated, 0) || 0} records` 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Backfill failed", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const slug = formData.get("slug") as string;
    createTenantMutation.mutate({ name, slug });
  };

  const handleUpdateTenant = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingTenant) return;
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const status = formData.get("status") as string;
    updateTenantMutation.mutate({ id: editingTenant.id, data: { name, status } });
  };

  const handleInviteAdmin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!invitingTenant) return;
    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    inviteAdminMutation.mutate({ 
      tenantId: invitingTenant.id, 
      email, 
      firstName: firstName || undefined, 
      lastName: lastName || undefined,
      inviteType 
    });
  };

  const copyInviteUrl = () => {
    if (lastInviteUrl) {
      navigator.clipboard.writeText(lastInviteUrl);
      toast({ title: "Copied", description: "Invite URL copied to clipboard" });
    }
  };

  const generateSlug = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };

  const getStatusBadge = (tenant: TenantWithDetails) => {
    if (tenant.status === "active") {
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle className="h-3 w-3 mr-1" />
          Active
        </Badge>
      );
    } else if (tenant.status === "suspended") {
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Suspended
        </Badge>
      );
    } else {
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" />
          Pending Onboarding
        </Badge>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Super Admin</h1>
          <p className="text-sm text-muted-foreground">Manage tenants and system health</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
          <TabsTrigger value="tenants" data-testid="tab-tenants">
            <Building2 className="h-4 w-4 mr-2" />
            Tenants
          </TabsTrigger>
          <TabsTrigger value="health" data-testid="tab-health">
            <Activity className="h-4 w-4 mr-2" />
            Tenancy Health
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="space-y-6 mt-6">
          <div className="flex justify-end">
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-create-tenant">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Tenant
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New Tenant</DialogTitle>
                  <DialogDescription>Add a new organization to the system</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleCreateTenant} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Organization Name</Label>
                    <Input
                      id="name"
                      name="name"
                      placeholder="Acme Corporation"
                      data-testid="input-tenant-name"
                      required
                      onChange={(e) => {
                        const slugInput = document.getElementById("slug") as HTMLInputElement;
                        if (slugInput) {
                          slugInput.value = generateSlug(e.target.value);
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                      id="slug"
                      name="slug"
                      placeholder="acme-corp"
                      data-testid="input-tenant-slug"
                      required
                      pattern="[a-z0-9-]+"
                    />
                    <p className="text-xs text-muted-foreground">Lowercase letters, numbers, and hyphens only</p>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createTenantMutation.isPending} data-testid="button-submit-tenant">
                      {createTenantMutation.isPending ? "Creating..." : "Create Tenant"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Tenants
          </CardTitle>
          <CardDescription>All organizations registered in the system</CardDescription>
        </CardHeader>
        <CardContent>
          {tenants.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No tenants found. Create your first tenant to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {tenants.map((tenant) => (
                <div
                  key={tenant.id}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover-elevate"
                  data-testid={`tenant-row-${tenant.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{tenant.settings?.displayName || tenant.name}</div>
                      <div className="text-sm text-muted-foreground">/{tenant.slug}</div>
                      {tenant.userCount !== undefined && tenant.userCount > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {tenant.userCount} user{tenant.userCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getStatusBadge(tenant)}
                    {tenant.status === "inactive" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setInvitingTenant(tenant);
                          setLastInviteUrl(null);
                          setInviteType("link");
                        }}
                        data-testid={`button-invite-admin-${tenant.id}`}
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite Admin
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setSettingsTenant(tenant)}
                      data-testid={`button-settings-tenant-${tenant.id}`}
                    >
                      <Settings className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditingTenant(tenant)}
                      data-testid={`button-edit-tenant-${tenant.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingTenant} onOpenChange={(open) => !open && setEditingTenant(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tenant</DialogTitle>
            <DialogDescription>Update tenant information</DialogDescription>
          </DialogHeader>
          {editingTenant && (
            <form onSubmit={handleUpdateTenant} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Organization Name</Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={editingTenant.name}
                  data-testid="input-edit-tenant-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select name="status" defaultValue={editingTenant.status}>
                  <SelectTrigger data-testid="select-tenant-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>Slug:</strong> {editingTenant.slug} (cannot be changed)
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditingTenant(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateTenantMutation.isPending} data-testid="button-update-tenant">
                  {updateTenantMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!invitingTenant} onOpenChange={(open) => { if (!open) { setInvitingTenant(null); setLastInviteUrl(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Tenant Admin</DialogTitle>
            <DialogDescription>
              Send an invitation to the admin who will manage {invitingTenant?.name}
            </DialogDescription>
          </DialogHeader>
          {lastInviteUrl ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-sm font-medium text-green-600 mb-2">Invitation Created Successfully!</p>
                <p className="text-sm text-muted-foreground mb-3">
                  Share this link with the tenant admin. The link will expire in 7 days.
                </p>
                <div className="flex gap-2">
                  <Input 
                    value={lastInviteUrl} 
                    readOnly 
                    className="text-xs font-mono"
                    data-testid="input-invite-url"
                  />
                  <Button size="icon" variant="outline" onClick={copyInviteUrl} data-testid="button-copy-invite-url">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setInvitingTenant(null); setLastInviteUrl(null); }} data-testid="button-done-invite">
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={handleInviteAdmin} className="space-y-4">
              <div className="space-y-2">
                <Label>Invite Method</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={inviteType === "link" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setInviteType("link")}
                    className="flex-1"
                    data-testid="button-invite-type-link"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Generate Link
                  </Button>
                  <Button
                    type="button"
                    variant={inviteType === "email" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setInviteType("email")}
                    className="flex-1"
                    data-testid="button-invite-type-email"
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Send Email
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {inviteType === "link" 
                    ? "Generate a link to copy and share manually" 
                    : "Send an email invitation (requires Mailgun to be configured)"}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  placeholder="admin@company.com"
                  data-testid="input-invite-email"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invite-firstName">First Name (optional)</Label>
                  <Input
                    id="invite-firstName"
                    name="firstName"
                    placeholder="John"
                    data-testid="input-invite-first-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-lastName">Last Name (optional)</Label>
                  <Input
                    id="invite-lastName"
                    name="lastName"
                    placeholder="Doe"
                    data-testid="input-invite-last-name"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setInvitingTenant(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviteAdminMutation.isPending} data-testid="button-send-invite">
                  {inviteAdminMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {inviteType === "email" ? "Sending..." : "Creating..."}
                    </>
                  ) : inviteType === "email" ? (
                    <>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Email
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Generate Link
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      </TabsContent>

      <TabsContent value="health" className="space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Tenancy Enforcement Health</h2>
              <p className="text-sm text-muted-foreground">Monitor tenant isolation readiness and data integrity</p>
            </div>
            <Button 
              variant="outline" 
              onClick={() => refetchHealth()}
              disabled={healthLoading}
              data-testid="button-refresh-health"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {healthLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : healthData ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Enforcement Mode
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={healthData.currentMode === 'strict' ? 'default' : healthData.currentMode === 'soft' ? 'secondary' : 'outline'}
                      className={healthData.currentMode === 'strict' ? 'bg-green-500/10 text-green-600 border-green-500/20' : ''}
                    >
                      {healthData.currentMode.toUpperCase()}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {healthData.currentMode === 'strict' 
                        ? 'Cross-tenant access blocked'
                        : healthData.currentMode === 'soft'
                          ? 'Logging violations'
                          : 'No enforcement'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {healthData.readinessCheck.canEnableStrict ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    )}
                    Strict Mode Readiness
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {healthData.readinessCheck.canEnableStrict ? (
                    <p className="text-sm text-green-600">Ready to enable strict enforcement</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-yellow-600">Not ready - resolve blockers first</p>
                      <ul className="text-xs text-muted-foreground list-disc list-inside">
                        {healthData.readinessCheck.blockers.map((blocker, i) => (
                          <li key={i}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Missing Tenant Assignments
                  </CardTitle>
                  <CardDescription>
                    Records without tenantId (must be 0 before enabling strict mode)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {healthData.totalMissing === 0 ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>All records have tenant assignments</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        {healthData.missingTenantIds.filter(m => m.missingTenantIdCount > 0).map((item) => (
                          <div key={item.table} className="flex items-center justify-between">
                            <span className="text-sm font-medium">{item.table}</span>
                            <div className="flex items-center gap-4">
                              <span className="text-sm text-muted-foreground">
                                {item.missingTenantIdCount} records
                              </span>
                              <Progress 
                                value={0} 
                                className="w-24 h-2" 
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between pt-4 border-t">
                        <span className="font-medium">Total: {healthData.totalMissing} records need backfill</span>
                        <div className="flex gap-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => backfillMutation.mutate({ dryRun: true })}
                            disabled={backfillMutation.isPending}
                            data-testid="button-dry-run-backfill"
                          >
                            {backfillMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                            Dry Run
                          </Button>
                          <Button 
                            size="sm"
                            onClick={() => backfillMutation.mutate({ dryRun: false })}
                            disabled={backfillMutation.isPending}
                            data-testid="button-run-backfill"
                          >
                            <Play className="h-4 w-4 mr-2" />
                            Run Backfill
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Warning Statistics
                  </CardTitle>
                  <CardDescription>
                    Tenancy violations detected in soft mode
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <div className="text-2xl font-bold">{healthData.warningStats.last24Hours}</div>
                      <div className="text-xs text-muted-foreground">Last 24 hours</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <div className="text-2xl font-bold">{healthData.warningStats.last7Days}</div>
                      <div className="text-xs text-muted-foreground">Last 7 days</div>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-muted/50">
                      <div className="text-2xl font-bold">{healthData.warningStats.total}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">System Info</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Active Tenants:</span>
                      <span className="ml-2 font-medium">{healthData.activeTenantCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Enforcement Mode:</span>
                      <span className="ml-2 font-mono text-xs bg-muted px-2 py-1 rounded">
                        TENANCY_ENFORCEMENT={healthData.currentMode}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Failed to load health data. Click refresh to try again.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <TenantSettingsDialog
        tenant={settingsTenant}
        open={!!settingsTenant}
        onOpenChange={(open) => !open && setSettingsTenant(null)}
      />
    </div>
  );
}
