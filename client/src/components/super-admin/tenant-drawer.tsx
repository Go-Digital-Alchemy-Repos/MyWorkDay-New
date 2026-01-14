import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  Building2, 
  Users, 
  Palette, 
  HardDrive, 
  FileText, 
  Settings, 
  Save, 
  Loader2, 
  Check, 
  X, 
  Mail,
  Clock,
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Power,
  Copy,
  UserPlus,
  Briefcase,
  ExternalLink
} from "lucide-react";
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

interface TenantWithDetails extends Tenant {
  settings?: TenantSettings | null;
  userCount?: number;
  primaryWorkspaceId?: string;
  primaryWorkspace?: {
    id: string;
    name: string;
  };
}

interface Workspace {
  id: string;
  name: string;
  tenantId: string | null;
  isPrimary: boolean | null;
}

interface TenantDrawerProps {
  tenant: TenantWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantUpdated?: () => void;
}

type OnboardingStep = "workspace" | "branding" | "email" | "users" | "activate";

interface OnboardingProgress {
  workspace: boolean;
  branding: boolean;
  email: boolean;
  users: boolean;
  activated: boolean;
}

function getStatusBadge(status: string) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </Badge>
    );
  } else if (status === "suspended") {
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
}

export function TenantDrawer({ tenant, open, onOpenChange, onTenantUpdated }: TenantDrawerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (tenant) {
      setEditedName(tenant.name);
      setHasUnsavedChanges(false);
    }
  }, [tenant]);

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "workspaces"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/workspaces`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "workspaces",
  });

  const { data: settingsResponse } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open,
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (data: { name?: string; status?: string }) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${tenant?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setHasUnsavedChanges(false);
      toast({ title: "Tenant updated successfully" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Tenant activated successfully" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to activate tenant", description: error.message, variant: "destructive" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Tenant suspended" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to suspend tenant", description: error.message, variant: "destructive" });
    },
  });

  const inviteAdminMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/invite-admin`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setLastInviteUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Invitation created", description: "Admin invitation created successfully" });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to invite admin", description: error.message, variant: "destructive" });
    },
  });

  const handleNameChange = (value: string) => {
    setEditedName(value);
    setHasUnsavedChanges(value !== tenant?.name);
  };

  const handleSaveName = () => {
    if (editedName !== tenant?.name) {
      updateTenantMutation.mutate({ name: editedName });
    }
  };

  const handleInviteAdmin = () => {
    if (!inviteEmail) return;
    inviteAdminMutation.mutate({
      email: inviteEmail,
      firstName: inviteFirstName || undefined,
      lastName: inviteLastName || undefined,
      inviteType: "link",
    });
  };

  const copyInviteUrl = () => {
    if (lastInviteUrl) {
      navigator.clipboard.writeText(lastInviteUrl);
      toast({ title: "Copied", description: "Invite URL copied to clipboard" });
    }
  };

  if (!tenant) return null;

  const onboardingProgress: OnboardingProgress = {
    workspace: true,
    branding: !!settingsResponse?.tenantSettings?.logoUrl,
    email: false,
    users: (tenant.userCount || 0) > 0,
    activated: tenant.status === "active",
  };

  const completedSteps = Object.values(onboardingProgress).filter(Boolean).length;
  const totalSteps = Object.keys(onboardingProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tenant.settings?.displayName || tenant.name}
      description={`/${tenant.slug}`}
      hasUnsavedChanges={hasUnsavedChanges}
      width="2xl"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {getStatusBadge(tenant.status)}
          <div className="flex items-center gap-2">
            {tenant.status === "inactive" && (
              <Button 
                size="sm" 
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
                data-testid="button-activate-tenant"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                {activateMutation.isPending ? "Activating..." : "Activate"}
              </Button>
            )}
            {tenant.status === "active" && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => suspendMutation.mutate()}
                disabled={suspendMutation.isPending}
                data-testid="button-suspend-tenant"
              >
                <PauseCircle className="h-4 w-4 mr-2" />
                Suspend
              </Button>
            )}
            {tenant.status === "suspended" && (
              <Button 
                size="sm" 
                onClick={() => activateMutation.mutate()}
                disabled={activateMutation.isPending}
                data-testid="button-reactivate-tenant"
              >
                <Power className="h-4 w-4 mr-2" />
                Reactivate
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Building2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="onboarding" data-testid="tab-onboarding">
              <Settings className="h-4 w-4 mr-2" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="workspaces" data-testid="tab-workspaces">
              <Briefcase className="h-4 w-4 mr-2" />
              Workspaces
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="branding" data-testid="tab-branding">
              <Palette className="h-4 w-4 mr-2" />
              Branding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">Organization Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="tenant-name"
                      value={editedName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      data-testid="input-tenant-name"
                    />
                    {hasUnsavedChanges && (
                      <Button 
                        onClick={handleSaveName} 
                        disabled={updateTenantMutation.isPending}
                        data-testid="button-save-name"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <div className="text-sm text-muted-foreground">/{tenant.slug}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Users</div>
                    <div className="text-2xl font-semibold">{tenant.userCount || 0}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Created</div>
                    <div className="text-sm">{new Date(tenant.createdAt!).toLocaleDateString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {tenant.status === "inactive" && (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Onboarding Progress
                  </CardTitle>
                  <CardDescription>Complete the setup to activate this tenant</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{completedSteps} of {totalSteps} steps completed</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-300" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => setActiveTab("onboarding")}
                      data-testid="button-continue-onboarding"
                    >
                      Continue Onboarding
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Setup Wizard</CardTitle>
                <CardDescription>Follow these steps to fully configure the tenant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <OnboardingStepItem
                    step={1}
                    title="Primary Workspace Created"
                    description="A primary workspace was automatically created"
                    completed={onboardingProgress.workspace}
                    active={false}
                  />
                  <OnboardingStepItem
                    step={2}
                    title="Configure Branding"
                    description="Set up logo, colors, and white-label options"
                    completed={onboardingProgress.branding}
                    active={!onboardingProgress.branding}
                    action={() => setActiveTab("branding")}
                  />
                  <OnboardingStepItem
                    step={3}
                    title="Invite Administrators"
                    description="Invite tenant administrators to manage the organization"
                    completed={onboardingProgress.users}
                    active={onboardingProgress.branding && !onboardingProgress.users}
                    action={() => setActiveTab("users")}
                  />
                  <OnboardingStepItem
                    step={4}
                    title="Activate Tenant"
                    description="Make the tenant live for users to access"
                    completed={onboardingProgress.activated}
                    active={!onboardingProgress.activated}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Workspaces
                </CardTitle>
                <CardDescription>Workspaces belonging to this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                {workspacesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No workspaces found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`workspace-row-${workspace.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{workspace.name}</div>
                            <div className="text-xs text-muted-foreground">{workspace.id}</div>
                          </div>
                        </div>
                        {workspace.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Administrator
                </CardTitle>
                <CardDescription>Invite a tenant admin to manage this organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-first-name">First Name</Label>
                    <Input
                      id="invite-first-name"
                      value={inviteFirstName}
                      onChange={(e) => setInviteFirstName(e.target.value)}
                      placeholder="John"
                      data-testid="input-invite-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-last-name">Last Name</Label>
                    <Input
                      id="invite-last-name"
                      value={inviteLastName}
                      onChange={(e) => setInviteLastName(e.target.value)}
                      placeholder="Doe"
                      data-testid="input-invite-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="admin@example.com"
                    data-testid="input-invite-email"
                  />
                </div>
                <Button 
                  onClick={handleInviteAdmin}
                  disabled={!inviteEmail || inviteAdminMutation.isPending}
                  data-testid="button-invite-admin"
                >
                  {inviteAdminMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Invite Link
                    </>
                  )}
                </Button>

                {lastInviteUrl && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700">Invitation created</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={copyInviteUrl} data-testid="button-copy-invite">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                      {lastInviteUrl}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Users</CardTitle>
                <CardDescription>
                  {tenant.userCount || 0} user{(tenant.userCount || 0) === 1 ? '' : 's'} in this tenant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  User list coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">White Label Settings</CardTitle>
                <CardDescription>Configure branding and appearance for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Branding configuration coming soon.
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="ml-2"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-use-settings-dialog"
                  >
                    Use existing settings dialog
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </FullScreenDrawer>
  );
}

interface OnboardingStepItemProps {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  active: boolean;
  action?: () => void;
}

function OnboardingStepItem({ step, title, description, completed, active, action }: OnboardingStepItemProps) {
  return (
    <div 
      className={`flex items-start gap-4 p-3 rounded-lg border ${
        completed ? "bg-green-500/5 border-green-500/20" : 
        active ? "bg-primary/5 border-primary/20" : 
        "opacity-60"
      }`}
      data-testid={`onboarding-step-${step}`}
    >
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        completed ? "bg-green-500 text-white" : 
        active ? "bg-primary text-primary-foreground" : 
        "bg-secondary text-muted-foreground"
      }`}>
        {completed ? <Check className="h-4 w-4" /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {active && action && (
        <Button size="sm" variant="outline" onClick={action} data-testid={`button-step-${step}-action`}>
          Configure
        </Button>
      )}
    </div>
  );
}
