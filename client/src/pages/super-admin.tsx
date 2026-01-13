import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Building2, Plus, Edit2, Shield, CheckCircle, XCircle, UserPlus, Clock, Copy, AlertTriangle, Loader2 } from "lucide-react";
import type { Tenant } from "@shared/schema";

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
  message: string;
}

export default function SuperAdminPage() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [invitingTenant, setInvitingTenant] = useState<Tenant | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  const { data: tenants = [], isLoading } = useQuery<TenantWithDetails[]>({
    queryKey: ["/api/v1/super/tenants-detail"],
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
    mutationFn: async ({ tenantId, email, firstName, lastName }: { tenantId: string; email: string; firstName?: string; lastName?: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/invite-admin`, { email, firstName, lastName });
      return res.json() as Promise<InviteResponse>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setLastInviteUrl(data.inviteUrl);
      toast({ title: "Invitation sent", description: `Invite link created for ${data.invitation.email}` });
    },
    onError: (error: any) => {
      toast({ title: "Failed to send invitation", description: error.message, variant: "destructive" });
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
      lastName: lastName || undefined 
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">Super Admin</h1>
            <p className="text-sm text-muted-foreground">Manage all tenants in the system</p>
          </div>
        </div>
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
                      Sending...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Send Invitation
                    </>
                  )}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
