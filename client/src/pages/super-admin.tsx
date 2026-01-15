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
import { queryClient, apiRequest, setActingTenantId, getActingTenantId } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Building2, Plus, Edit2, Shield, CheckCircle, XCircle, UserPlus, Clock, Copy, AlertTriangle, Loader2, Activity, Database, RefreshCw, Play, Settings, Upload, Users, Download, PlayCircle, PauseCircle, Power, ExternalLink, Mail, FileText, Check } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { TenantDrawer } from "@/components/super-admin/tenant-drawer";
import type { Tenant } from "@shared/schema";

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
  persistenceEnabled: boolean;
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

interface CSVUser {
  email: string;
  firstName?: string;
  lastName?: string;
  role?: "admin" | "employee";
}

interface ImportResult {
  email: string;
  firstName?: string;
  lastName?: string;
  role: string;
  success: boolean;
  inviteUrl?: string;
  error?: string;
}

interface ImportResponse {
  message: string;
  totalProcessed: number;
  successCount: number;
  failCount: number;
  results: ImportResult[];
}

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [invitingTenant, setInvitingTenant] = useState<Tenant | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [inviteType, setInviteType] = useState<"link" | "email">("link");
  const [activeTab, setActiveTab] = useState("tenants");
  const [importingTenant, setImportingTenant] = useState<Tenant | null>(null);
  const [csvUsers, setCsvUsers] = useState<CSVUser[]>([]);
  const [importResults, setImportResults] = useState<ImportResponse | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "activate" | "suspend" | "deactivate"; tenant: Tenant } | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithDetails | null>(null);
  const [, setLocation] = useLocation();

  const { data: tenants = [], isLoading } = useQuery<TenantWithDetails[]>({
    queryKey: ["/api/v1/super/tenants-detail"],
  });

  const { data: healthData, isLoading: healthLoading, isError: healthError, error: healthErrorDetails, refetch: refetchHealth } = useQuery<TenancyHealthResponse>({
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

  const importUsersMutation = useMutation({
    mutationFn: async ({ tenantId, users }: { tenantId: string; users: CSVUser[] }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/import-users`, { users });
      return res.json() as Promise<ImportResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setImportResults(data);
      toast({ 
        title: "Import complete", 
        description: `${data.successCount} of ${data.totalProcessed} users imported successfully` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const activateTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenantId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setConfirmAction(null);
      toast({ title: "Tenant activated", description: "The tenant is now active and users can access the app" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to activate tenant", description: error.message, variant: "destructive" });
    },
  });

  const suspendTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenantId}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setConfirmAction(null);
      toast({ title: "Tenant suspended", description: "The tenant has been suspended" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to suspend tenant", description: error.message, variant: "destructive" });
    },
  });

  const deactivateTenantMutation = useMutation({
    mutationFn: async (tenantId: string) => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenantId}/deactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setConfirmAction(null);
      toast({ title: "Tenant deactivated", description: "The tenant has been set to inactive" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to deactivate tenant", description: error.message, variant: "destructive" });
    },
  });

  const handleActAsTenant = (tenant: Tenant) => {
    setActingTenantId(tenant.id);
    toast({ 
      title: "Acting as tenant", 
      description: `You are now acting as "${tenant.name}". All actions will be scoped to this tenant.` 
    });
    setLocation("/dashboard");
  };

  const handleStopActingAsTenant = () => {
    setActingTenantId(null);
    toast({ title: "Stopped acting as tenant", description: "You are no longer acting as a specific tenant" });
    queryClient.invalidateQueries();
  };

  const parseCSV = (csvText: string): CSVUser[] => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return [];
    
    const headerLine = lines[0].toLowerCase();
    const headers = headerLine.split(",").map(h => h.trim().replace(/"/g, ""));
    
    const emailIndex = headers.findIndex(h => h === "email" || h === "e-mail" || h === "emailaddress");
    const firstNameIndex = headers.findIndex(h => h === "firstname" || h === "first_name" || h === "first name" || h === "first");
    const lastNameIndex = headers.findIndex(h => h === "lastname" || h === "last_name" || h === "last name" || h === "last");
    const roleIndex = headers.findIndex(h => h === "role");
    
    if (emailIndex === -1) return [];
    
    const users: CSVUser[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
      const email = values[emailIndex];
      if (!email || !email.includes("@")) continue;
      
      const user: CSVUser = { email };
      if (firstNameIndex !== -1 && values[firstNameIndex]) user.firstName = values[firstNameIndex];
      if (lastNameIndex !== -1 && values[lastNameIndex]) user.lastName = values[lastNameIndex];
      if (roleIndex !== -1 && values[roleIndex]) {
        const role = values[roleIndex].toLowerCase();
        if (role === "admin" || role === "employee") user.role = role;
      }
      users.push(user);
    }
    return users;
  };

  const handleCSVFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const users = parseCSV(text);
      setCsvUsers(users);
      if (users.length === 0) {
        toast({ title: "Invalid CSV", description: "Could not find any valid email addresses in the CSV file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
  };

  const handleImportUsers = () => {
    if (!importingTenant || csvUsers.length === 0) return;
    importUsersMutation.mutate({ tenantId: importingTenant.id, users: csvUsers });
  };

  const copyAllInviteLinks = () => {
    if (!importResults) return;
    const successfulLinks = importResults.results
      .filter(r => r.success && r.inviteUrl)
      .map(r => `${r.email}: ${r.inviteUrl}`)
      .join("\n");
    navigator.clipboard.writeText(successfulLinks);
    toast({ title: "Copied!", description: "All invite links copied to clipboard" });
  };

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
                  <div 
                    className="flex items-center gap-4 cursor-pointer"
                    onClick={() => setSelectedTenant(tenant)}
                    data-testid={`button-select-tenant-${tenant.id}`}
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium hover:underline">{tenant.settings?.displayName || tenant.name}</div>
                      <div className="text-sm text-muted-foreground">/{tenant.slug}</div>
                      {tenant.userCount !== undefined && tenant.userCount > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {tenant.userCount} user{tenant.userCount === 1 ? '' : 's'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {getStatusBadge(tenant)}
                    
                    {/* Act as Tenant button */}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleActAsTenant(tenant)}
                      data-testid={`button-act-as-tenant-${tenant.id}`}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Act as Tenant
                    </Button>
                    
                    {/* Status action buttons */}
                    {tenant.status === "inactive" && (
                      <>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => setConfirmAction({ type: "activate", tenant })}
                          data-testid={`button-activate-tenant-${tenant.id}`}
                        >
                          <PlayCircle className="h-4 w-4 mr-2" />
                          Activate
                        </Button>
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
                      </>
                    )}
                    
                    {tenant.status === "active" && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "suspend", tenant })}
                          data-testid={`button-suspend-tenant-${tenant.id}`}
                        >
                          <PauseCircle className="h-4 w-4 mr-2" />
                          Suspend
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirmAction({ type: "deactivate", tenant })}
                          data-testid={`button-deactivate-tenant-${tenant.id}`}
                        >
                          <Power className="h-4 w-4 mr-2" />
                          Deactivate
                        </Button>
                      </>
                    )}
                    
                    {tenant.status === "suspended" && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => setConfirmAction({ type: "activate", tenant })}
                        data-testid={`button-reactivate-tenant-${tenant.id}`}
                      >
                        <PlayCircle className="h-4 w-4 mr-2" />
                        Reactivate
                      </Button>
                    )}
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setImportingTenant(tenant);
                        setCsvUsers([]);
                        setImportResults(null);
                      }}
                      data-testid={`button-import-users-${tenant.id}`}
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Import CSV
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        localStorage.setItem(`tenantDrawerTab_${tenant.id}`, "branding");
                        setSelectedTenant(tenant);
                      }}
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

      <Dialog open={!!importingTenant} onOpenChange={(open) => { if (!open) { setImportingTenant(null); setCsvUsers([]); setImportResults(null); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Import Users via CSV
            </DialogTitle>
            <DialogDescription>
              Bulk import users into {importingTenant?.name}. Upload a CSV file with columns: email, firstName, lastName, role (admin/employee).
            </DialogDescription>
          </DialogHeader>
          
          {importResults ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg border ${importResults.failCount === 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-yellow-500/10 border-yellow-500/20'}`}>
                <p className="text-sm font-medium mb-1">
                  {importResults.successCount === importResults.totalProcessed 
                    ? "All users imported successfully!" 
                    : `${importResults.successCount} of ${importResults.totalProcessed} imported`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {importResults.failCount > 0 && `${importResults.failCount} failed (see errors below)`}
                </p>
              </div>
              
              <div className="flex justify-between items-center">
                <Label>Import Results</Label>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={copyAllInviteLinks}
                  disabled={importResults.successCount === 0}
                  data-testid="button-copy-all-links"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Links
                </Button>
              </div>
              
              <div className="max-h-64 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResults.results.map((result, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2 font-mono text-xs">{result.email}</td>
                        <td className="p-2 text-xs">{result.firstName} {result.lastName}</td>
                        <td className="p-2">
                          {result.success ? (
                            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                              <Check className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-500/10 text-red-600 border-red-500/20">
                              <X className="h-3 w-3 mr-1" />
                              {result.error || "Failed"}
                            </Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {result.inviteUrl && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(result.inviteUrl!);
                                toast({ title: "Copied!", description: "Invite link copied to clipboard" });
                              }}
                              data-testid={`button-copy-link-${idx}`}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <DialogFooter>
                <Button onClick={() => { setImportingTenant(null); setCsvUsers([]); setImportResults(null); }} data-testid="button-done-import">
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <Label htmlFor="csv-file" className="cursor-pointer">
                  <span className="text-sm font-medium">Click to upload CSV file</span>
                  <br />
                  <span className="text-xs text-muted-foreground">or drag and drop</span>
                </Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVFileChange}
                  data-testid="input-csv-file"
                />
              </div>
              
              <div className="text-xs text-muted-foreground p-3 bg-muted rounded-lg">
                <p className="font-medium mb-1">CSV Format:</p>
                <code className="block">email,firstName,lastName,role</code>
                <code className="block">john@example.com,John,Doe,employee</code>
                <code className="block">jane@example.com,Jane,Smith,admin</code>
              </div>
              
              {csvUsers.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Preview ({csvUsers.length} users found)</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setCsvUsers([])}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="max-h-40 overflow-y-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-muted sticky top-0">
                        <tr>
                          <th className="text-left p-2">Email</th>
                          <th className="text-left p-2">First Name</th>
                          <th className="text-left p-2">Last Name</th>
                          <th className="text-left p-2">Role</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvUsers.slice(0, 10).map((user, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2 font-mono text-xs">{user.email}</td>
                            <td className="p-2 text-xs">{user.firstName || "-"}</td>
                            <td className="p-2 text-xs">{user.lastName || "-"}</td>
                            <td className="p-2">
                              <Badge variant="outline" className="text-xs">
                                {user.role || "employee"}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                        {csvUsers.length > 10 && (
                          <tr className="border-t">
                            <td colSpan={4} className="p-2 text-center text-xs text-muted-foreground">
                              ...and {csvUsers.length - 10} more
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setImportingTenant(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImportUsers} 
                  disabled={csvUsers.length === 0 || importUsersMutation.isPending}
                  data-testid="button-import-users"
                >
                  {importUsersMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import {csvUsers.length} User{csvUsers.length !== 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
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
                  {!healthData.persistenceEnabled && (
                    <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-600 dark:text-amber-400">
                      Warning persistence is disabled. Set TENANCY_WARN_PERSIST=true to enable persistent warning storage.
                      Statistics shown are from in-memory counters only.
                    </div>
                  )}
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
          ) : healthError ? (
            <Card>
              <CardContent className="py-8">
                <div className="text-center">
                  <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-4" />
                  <div className="text-destructive font-medium mb-2">Failed to load health data</div>
                  <div className="text-sm text-muted-foreground mb-4">
                    {healthErrorDetails instanceof Error 
                      ? healthErrorDetails.message 
                      : "Unknown error occurred"}
                  </div>
                  <Button variant="outline" onClick={() => refetchHealth()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No health data available. Click refresh to load.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog for Activate/Suspend/Deactivate */}
      <Dialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmAction?.type === "activate" && "Activate Tenant"}
              {confirmAction?.type === "suspend" && "Suspend Tenant"}
              {confirmAction?.type === "deactivate" && "Deactivate Tenant"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction?.type === "activate" && (
                <>
                  Are you sure you want to activate <strong>{confirmAction.tenant.name}</strong>?
                  <br /><br />
                  This will allow all tenant users to access the application immediately.
                  Onboarding is not required when activated by super admin.
                </>
              )}
              {confirmAction?.type === "suspend" && (
                <>
                  Are you sure you want to suspend <strong>{confirmAction?.tenant.name}</strong>?
                  <br /><br />
                  This will block all tenant users from accessing the application.
                  Super admins can still access the tenant.
                </>
              )}
              {confirmAction?.type === "deactivate" && (
                <>
                  Are you sure you want to deactivate <strong>{confirmAction?.tenant.name}</strong>?
                  <br /><br />
                  This will set the tenant back to inactive status. Users will need to complete onboarding
                  or be re-activated by a super admin.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction?.type === "suspend" || confirmAction?.type === "deactivate" ? "destructive" : "default"}
              onClick={() => {
                if (!confirmAction) return;
                if (confirmAction.type === "activate") {
                  activateTenantMutation.mutate(confirmAction.tenant.id);
                } else if (confirmAction.type === "suspend") {
                  suspendTenantMutation.mutate(confirmAction.tenant.id);
                } else if (confirmAction.type === "deactivate") {
                  deactivateTenantMutation.mutate(confirmAction.tenant.id);
                }
              }}
              disabled={activateTenantMutation.isPending || suspendTenantMutation.isPending || deactivateTenantMutation.isPending}
              data-testid={`button-confirm-${confirmAction?.type}`}
            >
              {(activateTenantMutation.isPending || suspendTenantMutation.isPending || deactivateTenantMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {confirmAction?.type === "activate" && "Activate"}
              {confirmAction?.type === "suspend" && "Suspend"}
              {confirmAction?.type === "deactivate" && "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Banner when acting as a tenant */}
      {getActingTenantId() && (
        <div className="fixed bottom-4 right-4 bg-primary text-primary-foreground px-4 py-2 rounded-lg shadow-lg flex items-center gap-3 z-50">
          <span className="text-sm">Acting as tenant</span>
          <Button 
            size="sm" 
            variant="secondary"
            onClick={handleStopActingAsTenant}
            data-testid="button-stop-acting-as-tenant"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Stop
          </Button>
        </div>
      )}

      {/* Tenant Detail Drawer */}
      <TenantDrawer
        tenant={selectedTenant}
        open={!!selectedTenant}
        onOpenChange={(open) => !open && setSelectedTenant(null)}
        onTenantUpdated={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
        }}
      />
    </div>
  );
}
