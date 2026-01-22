import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, Users, FileText, Palette, Settings, Shield, Save, Mail, HardDrive, Check, X, 
  Plus, Link, Copy, MoreHorizontal, UserCheck, UserX, Clock, AlertCircle, KeyRound, Image,
  TestTube, Eye, EyeOff, Trash2, RefreshCw, Send, CreditCard, Archive, Globe
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  stripe: boolean;
  encryptionConfigured: boolean;
  ssoGoogle?: boolean;
  ssoGithub?: boolean;
}

interface SsoGoogleSettings {
  status: "configured" | "not_configured";
  enabled: boolean;
  config: {
    clientId: string | null;
    redirectUri: string | null;
    source: "database" | "environment" | "none";
  } | null;
  secretMasked: {
    clientSecretMasked: string | null;
  } | null;
  lastTestedAt: string | null;
}

interface SsoGithubSettings {
  status: "configured" | "not_configured";
  enabled: boolean;
  config: {
    clientId: string | null;
    redirectUri: string | null;
    source: "database" | "environment" | "none";
  } | null;
  secretMasked: {
    clientSecretMasked: string | null;
  } | null;
  lastTestedAt: string | null;
}

interface MailgunSettings {
  status: "configured" | "not_configured";
  config: {
    domain: string | null;
    fromEmail: string | null;
    region: string | null;
  } | null;
  secretMasked: {
    apiKeyMasked: string | null;
    signingKeyMasked: string | null;
  } | null;
  lastTestedAt: string | null;
}

interface S3Settings {
  status: "configured" | "not_configured";
  config: {
    region: string | null;
    bucketName: string | null;
    publicBaseUrl: string | null;
    cloudfrontUrl: string | null;
  } | null;
  secretMasked: {
    accessKeyIdMasked: string | null;
    secretAccessKeyMasked: string | null;
  } | null;
  lastTestedAt: string | null;
}

interface StripeSettings {
  status: "configured" | "not_configured";
  config: {
    publishableKey: string | null;
    defaultCurrency: string | null;
  } | null;
  secretMasked: {
    secretKeyMasked: string | null;
    webhookSecretMasked: string | null;
  } | null;
  lastTestedAt: string | null;
}

interface InviteResponse {
  inviteUrl: string;
  expiresAt: string;
  tokenMasked: string;
  emailSent?: boolean;
  mailgunConfigured?: boolean;
}

interface Agreement {
  id: string;
  tenantId: string;
  tenantName: string;
  title: string;
  body: string;
  version: number;
  status: "draft" | "active" | "archived";
  effectiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Tenant {
  id: string;
  name: string;
}

interface SignerInfo {
  userId: string;
  email: string;
  name: string;
  isActive: boolean;
  status: "signed" | "pending";
  signedAt: string | null;
  signedVersion: number | null;
}

function AgreementsManagementTab({ 
  agreementStatus, 
  agreementsLoading 
}: { 
  agreementStatus: TenantAgreementStatus[];
  agreementsLoading: boolean;
}) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [signersDrawerOpen, setSignersDrawerOpen] = useState(false);
  const [viewingSignersFor, setViewingSignersFor] = useState<Agreement | null>(null);
  const [form, setForm] = useState({ tenantId: "", title: "", body: "" });
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [actionAgreement, setActionAgreement] = useState<Agreement | null>(null);

  const { data: tenantsData } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/v1/super/tenants/list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/super/tenants", { credentials: "include" });
      const data = await res.json();
      return data.tenants?.map((t: any) => ({ id: t.id, name: t.name })) || [];
    },
  });

  const { data: agreementsData, isLoading: loadingAgreements, refetch: refetchAgreements } = useQuery<{ agreements: Agreement[]; total: number }>({
    queryKey: ["/api/v1/super/agreements", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/v1/super/agreements${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const { data: signersData, isLoading: loadingSigners } = useQuery<{ signers: SignerInfo[]; stats: { total: number; signed: number; pending: number } }>({
    queryKey: ["/api/v1/super/agreements", viewingSignersFor?.id, "signers"],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/agreements/${viewingSignersFor?.id}/signers`, { credentials: "include" });
      return res.json();
    },
    enabled: !!viewingSignersFor,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { tenantId: string; title: string; body: string }) => {
      return apiRequest("POST", "/api/v1/super/agreements", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements/tenants-summary"] });
      toast({ title: "Agreement draft created" });
      setDrawerOpen(false);
      setForm({ tenantId: "", title: "", body: "" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create agreement", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { title?: string; body?: string } }) => {
      return apiRequest("PATCH", `/api/v1/super/agreements/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements"] });
      toast({ title: "Agreement updated" });
      setDrawerOpen(false);
      setSelectedAgreement(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to update agreement", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/super/agreements/${id}/publish`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements/tenants-summary"] });
      toast({ title: "Agreement published", description: "Users will need to accept the new terms." });
      setConfirmPublishOpen(false);
      setActionAgreement(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to publish agreement", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/super/agreements/${id}/archive`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements/tenants-summary"] });
      toast({ title: "Agreement archived" });
      setConfirmArchiveOpen(false);
      setActionAgreement(null);
    },
    onError: (error: any) => {
      toast({ title: "Failed to archive agreement", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/super/agreements/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/agreements"] });
      toast({ title: "Draft deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete draft", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenCreate = () => {
    setSelectedAgreement(null);
    setForm({ tenantId: "", title: "", body: "" });
    setDrawerOpen(true);
  };

  const handleOpenEdit = (agreement: Agreement) => {
    setSelectedAgreement(agreement);
    setForm({ tenantId: agreement.tenantId, title: agreement.title, body: agreement.body });
    setDrawerOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({ title: "Title and body are required", variant: "destructive" });
      return;
    }
    if (selectedAgreement) {
      updateMutation.mutate({ id: selectedAgreement.id, data: { title: form.title, body: form.body } });
    } else {
      if (!form.tenantId) {
        toast({ title: "Please select a scope", variant: "destructive" });
        return;
      }
      // Convert "__all_tenants__" sentinel value to null for global default
      const submitForm = {
        ...form,
        tenantId: form.tenantId === "__all_tenants__" ? null : form.tenantId,
      };
      createMutation.mutate(submitForm);
    }
  };

  const handleViewSigners = (agreement: Agreement) => {
    setViewingSignersFor(agreement);
    setSignersDrawerOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-600"><Check className="h-3 w-3 mr-1" />Active</Badge>;
      case "draft":
        return <Badge variant="outline" className="border-amber-600 text-amber-600"><FileText className="h-3 w-3 mr-1" />Draft</Badge>;
      case "archived":
        return <Badge variant="secondary"><Archive className="h-3 w-3 mr-1" />Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const agreements = agreementsData?.agreements || [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle>SaaS Agreements</CardTitle>
            <CardDescription>Create, manage, and publish agreements for tenants</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]" data-testid="select-agreement-status-filter">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleOpenCreate} data-testid="button-create-agreement">
              <Plus className="h-4 w-4 mr-2" />
              New Agreement
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingAgreements ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agreements.length > 0 ? (
            <div className="space-y-3">
              {agreements.map((agreement) => (
                <div key={agreement.id} className="flex items-center justify-between p-4 border rounded-lg" data-testid={`agreement-row-${agreement.id}`}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{agreement.title}</span>
                      <span className="text-sm text-muted-foreground">v{agreement.version}</span>
                      {getStatusBadge(agreement.status)}
                      {(agreement as any).scope === "global" && (
                        <Badge variant="outline" className="text-xs"><Globe className="h-3 w-3 mr-1" />Default</Badge>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {agreement.tenantName} • Updated {new Date(agreement.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {agreement.status === "active" && (
                      <Button variant="outline" size="sm" onClick={() => handleViewSigners(agreement)} data-testid={`button-view-signers-${agreement.id}`}>
                        <Users className="h-4 w-4 mr-1" />
                        Signers
                      </Button>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`button-agreement-actions-${agreement.id}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {agreement.status === "draft" && (
                          <>
                            <DropdownMenuItem onClick={() => handleOpenEdit(agreement)}>
                              <FileText className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => { setActionAgreement(agreement); setConfirmPublishOpen(true); }}>
                              <Send className="h-4 w-4 mr-2" />
                              Publish
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => deleteMutation.mutate(agreement.id)} className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                        {agreement.status === "active" && (
                          <DropdownMenuItem onClick={() => { setActionAgreement(agreement); setConfirmArchiveOpen(true); }}>
                            <Archive className="h-4 w-4 mr-2" />
                            Archive (Disable)
                          </DropdownMenuItem>
                        )}
                        {agreement.status === "archived" && (
                          <DropdownMenuItem onClick={() => handleViewSigners(agreement)}>
                            <Users className="h-4 w-4 mr-2" />
                            View Signers
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No Agreements</h3>
              <p className="text-sm text-muted-foreground mb-4">Create your first SaaS agreement for tenants</p>
              <Button onClick={handleOpenCreate} data-testid="button-create-first-agreement">
                <Plus className="h-4 w-4 mr-2" />
                Create Agreement
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Compliance Overview</CardTitle>
          <CardDescription>Agreement status across all tenants</CardDescription>
        </CardHeader>
        <CardContent>
          {agreementsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agreementStatus.length > 0 ? (
            <div className="space-y-3">
              {agreementStatus.map((tenant) => (
                <div key={tenant.tenantId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{tenant.tenantName}</div>
                    <div className="text-sm text-muted-foreground">
                      {tenant.hasActiveAgreement 
                        ? `v${tenant.currentVersion} • ${tenant.acceptedCount}/${tenant.totalUsers} accepted`
                        : "No active agreement"
                      }
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {tenant.hasActiveAgreement ? (
                      <Badge variant="default"><Check className="h-3 w-3 mr-1" />Active</Badge>
                    ) : (
                      <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Missing</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">No tenants found</div>
          )}
        </CardContent>
      </Card>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="sm:max-w-xl w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedAgreement ? "Edit Agreement" : "Create Agreement"}</SheetTitle>
            <SheetDescription>
              {selectedAgreement ? "Update the agreement content" : "Create a new SaaS agreement for all tenants or a specific tenant"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {!selectedAgreement && (
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={form.tenantId} onValueChange={(v) => setForm({ ...form, tenantId: v })}>
                  <SelectTrigger data-testid="select-agreement-tenant">
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all_tenants__">All Tenants (Global Default)</SelectItem>
                    {tenantsData?.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {form.tenantId === "__all_tenants__" 
                    ? "This agreement will apply to all tenants that don't have a specific agreement." 
                    : form.tenantId 
                      ? "This agreement will apply only to the selected tenant." 
                      : "Select a scope for this agreement."}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Terms of Service"
                data-testid="input-agreement-title"
              />
            </div>
            <div className="space-y-2">
              <Label>Agreement Content</Label>
              <textarea
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Enter agreement content..."
                className="w-full min-h-[300px] p-3 border rounded-md font-mono text-sm resize-y"
                data-testid="textarea-agreement-body"
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setDrawerOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save-agreement">
                {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                <Save className="h-4 w-4 mr-2" />
                {selectedAgreement ? "Update" : "Save Draft"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={signersDrawerOpen} onOpenChange={setSignersDrawerOpen}>
        <SheetContent className="sm:max-w-lg w-full overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Agreement Signers</SheetTitle>
            <SheetDescription>
              {viewingSignersFor?.title} v{viewingSignersFor?.version} - {viewingSignersFor?.tenantName}
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            {loadingSigners ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : signersData ? (
              <div className="space-y-4">
                <div className="flex justify-between text-sm p-3 bg-muted rounded-lg">
                  <span><UserCheck className="h-4 w-4 inline mr-1" />{signersData.stats.signed} signed</span>
                  <span><AlertCircle className="h-4 w-4 inline mr-1" />{signersData.stats.pending} pending</span>
                  <span><Users className="h-4 w-4 inline mr-1" />{signersData.stats.total} total</span>
                </div>
                <div className="space-y-2">
                  {signersData.signers.map((signer) => (
                    <div key={signer.userId} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <div className="font-medium">{signer.name}</div>
                        <div className="text-sm text-muted-foreground">{signer.email}</div>
                      </div>
                      <div>
                        {signer.status === "signed" ? (
                          <Badge variant="default"><Check className="h-3 w-3 mr-1" />Signed</Badge>
                        ) : (
                          <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              Publishing this agreement will require all users in {actionAgreement?.tenantName} to accept the new terms before continuing. Any previous active agreement will be archived.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => actionAgreement && publishMutation.mutate(actionAgreement.id)}>
              Publish Agreement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchiveOpen} onOpenChange={setConfirmArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Agreement?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving this agreement will disable enforcement. Users in {actionAgreement?.tenantName} will no longer be required to accept terms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => actionAgreement && archiveMutation.mutate(actionAgreement.id)}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
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
  
  const [passwordDrawerOpen, setPasswordDrawerOpen] = useState(false);
  const [adminToProvision, setAdminToProvision] = useState<PlatformAdmin | null>(null);
  const [passwordMethod, setPasswordMethod] = useState<"SET_PASSWORD" | "RESET_LINK">("SET_PASSWORD");
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmPassword: "",
    mustChangeOnNextLogin: true,
    sendEmail: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [generatedResetUrl, setGeneratedResetUrl] = useState<string | null>(null);
  
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

  const { data: mailgunSettings, isLoading: mailgunLoading } = useQuery<MailgunSettings>({
    queryKey: ["/api/v1/super/integrations/mailgun"],
    enabled: activeTab === "integrations",
  });

  const { data: s3Settings, isLoading: s3Loading } = useQuery<S3Settings>({
    queryKey: ["/api/v1/super/integrations/s3"],
    enabled: activeTab === "integrations",
  });

  const { data: stripeSettings, isLoading: stripeLoading } = useQuery<StripeSettings>({
    queryKey: ["/api/v1/super/integrations/stripe"],
    enabled: activeTab === "integrations",
  });

  const { data: ssoGoogleSettings, isLoading: ssoGoogleLoading } = useQuery<SsoGoogleSettings>({
    queryKey: ["/api/v1/system/integrations/sso/google"],
    enabled: activeTab === "integrations",
  });

  const { data: ssoGithubSettings, isLoading: ssoGithubLoading } = useQuery<SsoGithubSettings>({
    queryKey: ["/api/v1/system/integrations/sso/github"],
    enabled: activeTab === "integrations",
  });

  const [mailgunForm, setMailgunForm] = useState({
    domain: "",
    fromEmail: "",
    region: "US" as "US" | "EU",
    apiKey: "",
    signingKey: "",
  });

  const [s3Form, setS3Form] = useState({
    region: "",
    bucketName: "",
    publicBaseUrl: "",
    cloudfrontUrl: "",
    accessKeyId: "",
    secretAccessKey: "",
  });

  const [stripeForm, setStripeForm] = useState({
    publishableKey: "",
    secretKey: "",
    webhookSecret: "",
    defaultCurrency: "usd",
  });
  const [invoiceSettingsForm, setInvoiceSettingsForm] = useState({
    businessDisplayName: "",
    invoiceSupportEmail: "",
    invoiceFooterText: "",
    invoiceDefaultCurrency: "usd",
    taxIdLabel: "",
    taxIdValue: "",
    invoicePrefix: "",
  });

  const [showMailgunApiKey, setShowMailgunApiKey] = useState(false);
  const [showMailgunSigningKey, setShowMailgunSigningKey] = useState(false);
  const [showS3AccessKey, setShowS3AccessKey] = useState(false);
  const [showS3SecretKey, setShowS3SecretKey] = useState(false);
  const [showStripeSecretKey, setShowStripeSecretKey] = useState(false);
  const [showStripeWebhookSecret, setShowStripeWebhookSecret] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [testEmailDialogOpen, setTestEmailDialogOpen] = useState(false);

  const [ssoGoogleForm, setSsoGoogleForm] = useState({
    enabled: false,
    clientId: "",
    clientSecret: "",
    redirectUri: "",
  });
  const [showGoogleClientSecret, setShowGoogleClientSecret] = useState(false);

  const [ssoGithubForm, setSsoGithubForm] = useState({
    enabled: false,
    clientId: "",
    clientSecret: "",
    redirectUri: "",
  });
  const [showGithubClientSecret, setShowGithubClientSecret] = useState(false);
  const [ssoGoogleDirty, setSsoGoogleDirty] = useState(false);
  const [ssoGithubDirty, setSsoGithubDirty] = useState(false);

  useEffect(() => {
    if (ssoGoogleSettings && !ssoGoogleDirty) {
      setSsoGoogleForm({
        enabled: ssoGoogleSettings.enabled || false,
        clientId: ssoGoogleSettings.config?.clientId || "",
        clientSecret: "",
        redirectUri: ssoGoogleSettings.config?.redirectUri || "",
      });
    }
  }, [ssoGoogleSettings, ssoGoogleDirty]);

  useEffect(() => {
    if (ssoGithubSettings && !ssoGithubDirty) {
      setSsoGithubForm({
        enabled: ssoGithubSettings.enabled || false,
        clientId: ssoGithubSettings.config?.clientId || "",
        clientSecret: "",
        redirectUri: ssoGithubSettings.config?.redirectUri || "",
      });
    }
  }, [ssoGithubSettings, ssoGithubDirty]);

  const saveMailgunMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/super/integrations/mailgun", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/mailgun"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Mailgun settings saved successfully" });
      setMailgunForm(prev => ({ ...prev, apiKey: "", signingKey: "" }));
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save Mailgun settings", description: parsed.message, variant: "destructive" });
    },
  });

  const saveS3Mutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/super/integrations/s3", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/s3"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "S3 settings saved successfully" });
      setS3Form(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save S3 settings", description: parsed.message, variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/super/integrations/mailgun/test", {});
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/mailgun"] });
      if (data.success) {
        toast({ title: "Mailgun test successful", description: data.message });
      } else {
        toast({ title: "Mailgun test failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Mailgun test failed", description: parsed.message, variant: "destructive" });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async (toEmail: string) => {
      const response = await apiRequest("POST", "/api/v1/super/integrations/mailgun/send-test-email", { toEmail });
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      if (data.success) {
        toast({ title: "Test email sent", description: data.message });
        setTestEmailDialogOpen(false);
        setTestEmailAddress("");
      } else {
        toast({ title: "Failed to send test email", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to send test email", description: parsed.message, variant: "destructive" });
    },
  });

  const testS3Mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/super/integrations/s3/test", {});
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/s3"] });
      if (data.success) {
        toast({ title: "S3 test successful", description: data.message });
      } else {
        toast({ title: "S3 test failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "S3 test failed", description: parsed.message, variant: "destructive" });
    },
  });

  const clearMailgunSecretMutation = useMutation({
    mutationFn: async (secretName: string) => {
      return apiRequest("DELETE", `/api/v1/super/integrations/mailgun/secret/${secretName}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/mailgun"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Secret cleared successfully" });
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to clear secret", description: parsed.message, variant: "destructive" });
    },
  });

  const clearS3SecretMutation = useMutation({
    mutationFn: async (secretName: string) => {
      return apiRequest("DELETE", `/api/v1/super/integrations/s3/secret/${secretName}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/s3"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Secret cleared successfully" });
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to clear secret", description: parsed.message, variant: "destructive" });
    },
  });

  const saveStripeMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/super/integrations/stripe", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/stripe"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Stripe settings saved successfully" });
      setStripeForm(prev => ({ ...prev, secretKey: "", webhookSecret: "" }));
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save Stripe settings", description: parsed.message, variant: "destructive" });
    },
  });

  const testStripeMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/super/integrations/stripe/test", {});
      return response.json();
    },
    onSuccess: (data: { ok: boolean; error?: { code: string; message: string } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/stripe"] });
      if (data.ok) {
        toast({ title: "Stripe connection successful" });
      } else {
        toast({ title: "Stripe test failed", description: data.error?.message || "Unknown error", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Stripe test failed", description: parsed.message, variant: "destructive" });
    },
  });

  const clearStripeSecretMutation = useMutation({
    mutationFn: async (secretName: string) => {
      return apiRequest("DELETE", `/api/v1/super/integrations/stripe/secret/${secretName}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/stripe"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Secret cleared successfully" });
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to clear secret", description: parsed.message, variant: "destructive" });
    },
  });

  const saveSsoGoogleMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/system/integrations/sso/google", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/sso/google"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Google SSO settings saved successfully" });
      setSsoGoogleForm(prev => ({ ...prev, clientSecret: "" }));
      setSsoGoogleDirty(false);
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save Google SSO settings", description: parsed.message, variant: "destructive" });
    },
  });

  const testSsoGoogleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/system/integrations/sso/google/test", {});
      return response.json();
    },
    onSuccess: (data: { ok: boolean; error?: { code: string; message: string } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/sso/google"] });
      if (data.ok) {
        toast({ title: "Google SSO configuration valid" });
      } else {
        toast({ title: "Google SSO test failed", description: data.error?.message || "Unknown error", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Google SSO test failed", description: parsed.message, variant: "destructive" });
    },
  });

  const saveSsoGithubMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/system/integrations/sso/github", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/sso/github"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "GitHub SSO settings saved successfully" });
      setSsoGithubForm(prev => ({ ...prev, clientSecret: "" }));
      setSsoGithubDirty(false);
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save GitHub SSO settings", description: parsed.message, variant: "destructive" });
    },
  });

  const testSsoGithubMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/system/integrations/sso/github/test", {});
      return response.json();
    },
    onSuccess: (data: { ok: boolean; error?: { code: string; message: string } }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/sso/github"] });
      if (data.ok) {
        toast({ title: "GitHub SSO configuration valid" });
      } else {
        toast({ title: "GitHub SSO test failed", description: data.error?.message || "Unknown error", variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "GitHub SSO test failed", description: parsed.message, variant: "destructive" });
    },
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

  const provisionAdminMutation = useMutation({
    mutationFn: async ({ id, method, password, mustChangeOnNextLogin, sendEmail }: { 
      id: string; 
      method: "SET_PASSWORD" | "RESET_LINK";
      password?: string;
      mustChangeOnNextLogin: boolean;
      sendEmail: boolean;
    }) => {
      const response = await apiRequest("POST", `/api/v1/super/admins/${id}/provision`, { 
        method,
        password,
        mustChangeOnNextLogin,
        activateNow: true,
        sendEmail,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/admins"] });
      if (data.method === "SET_PASSWORD") {
        toast({ title: "Password set successfully" });
        setPasswordDrawerOpen(false);
        resetPasswordForm();
      } else if (data.method === "RESET_LINK") {
        setGeneratedResetUrl(data.resetUrl);
        toast({ title: "Password reset link generated" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to provision admin", description: parsed.message, variant: "destructive" });
    },
  });

  const resetPasswordForm = () => {
    setPasswordForm({
      password: "",
      confirmPassword: "",
      mustChangeOnNextLogin: true,
      sendEmail: false,
    });
    setShowPassword(false);
    setGeneratedResetUrl(null);
    setAdminToProvision(null);
  };

  const handleOpenPasswordDrawer = (admin: PlatformAdmin, method: "SET_PASSWORD" | "RESET_LINK") => {
    setAdminToProvision(admin);
    setPasswordMethod(method);
    resetPasswordForm();
    setPasswordDrawerOpen(true);
  };

  const handleProvisionAdmin = () => {
    if (!adminToProvision) return;
    
    if (passwordMethod === "SET_PASSWORD") {
      if (!passwordForm.password) {
        toast({ title: "Please enter a password", variant: "destructive" });
        return;
      }
      if (passwordForm.password.length < 8) {
        toast({ title: "Password must be at least 8 characters", variant: "destructive" });
        return;
      }
      if (passwordForm.password !== passwordForm.confirmPassword) {
        toast({ title: "Passwords do not match", variant: "destructive" });
        return;
      }
    }
    
    provisionAdminMutation.mutate({
      id: adminToProvision.id,
      method: passwordMethod,
      password: passwordMethod === "SET_PASSWORD" ? passwordForm.password : undefined,
      mustChangeOnNextLogin: passwordForm.mustChangeOnNextLogin,
      sendEmail: passwordForm.sendEmail,
    });
  };

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
            <TabsTrigger value="invoice-settings" data-testid="tab-invoice-settings">
              <CreditCard className="h-4 w-4 mr-2" />
              Invoice Settings
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
                                  <DropdownMenuItem onClick={() => handleOpenPasswordDrawer(admin, "SET_PASSWORD")} data-testid={`button-set-password-${admin.id}`}>
                                    <KeyRound className="h-4 w-4 mr-2" />
                                    Set Password
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpenPasswordDrawer(admin, "RESET_LINK")} data-testid={`button-send-reset-link-${admin.id}`}>
                                    <Link className="h-4 w-4 mr-2" />
                                    Generate Reset Link
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleGenerateInvite(admin)} data-testid={`button-generate-link-${admin.id}`}>
                                    <Link className="h-4 w-4 mr-2" />
                                    Generate Invite Link
                                  </DropdownMenuItem>
                                  {integrationStatus?.mailgun && (
                                    <DropdownMenuItem onClick={() => handleGenerateInvite(admin, true)} data-testid={`button-send-email-${admin.id}`}>
                                      <Send className="h-4 w-4 mr-2" />
                                      Send Invite Email
                                    </DropdownMenuItem>
                                  )}
                                </>
                              )}
                              {admin.isActive && admin.passwordSet && (
                                <DropdownMenuItem onClick={() => handleOpenPasswordDrawer(admin, "RESET_LINK")} data-testid={`button-reset-password-${admin.id}`}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  Reset Password
                                </DropdownMenuItem>
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
            <AgreementsManagementTab 
              agreementStatus={agreementStatus}
              agreementsLoading={agreementsLoading}
            />
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
            <div className="space-y-6">
              {/* Encryption Warning Banner */}
              {!integrationsLoading && integrationStatus && !integrationStatus.encryptionConfigured && (
                <Card className="border-yellow-500/50 bg-yellow-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                          Encryption Not Configured
                        </p>
                        <p className="text-sm text-yellow-700 dark:text-yellow-300">
                          API keys and secrets cannot be saved until the APP_ENCRYPTION_KEY environment variable is set. 
                          Generate a 32-byte base64 key and add it to your deployment environment.
                        </p>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 font-mono mt-2">
                          Generate key: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Integration Status Overview */}
              <Card>
                <CardHeader>
                  <CardTitle>Platform Integrations</CardTitle>
                  <CardDescription>Configure global integrations for the entire platform</CardDescription>
                </CardHeader>
                <CardContent>
                  {integrationsLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Mailgun</span>
                        <Badge variant={integrationStatus?.mailgun ? "default" : "secondary"} className="ml-2">
                          {integrationStatus?.mailgun ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">S3 Storage</span>
                        <Badge variant={integrationStatus?.s3 ? "default" : "secondary"} className="ml-2">
                          {integrationStatus?.s3 ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Stripe</span>
                        <Badge variant={integrationStatus?.stripe ? "default" : "secondary"} className="ml-2">
                          {integrationStatus?.stripe ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Google SSO</span>
                        <Badge variant={ssoGoogleSettings?.enabled ? "default" : "secondary"} className="ml-2">
                          {ssoGoogleSettings?.enabled ? "Enabled" : ssoGoogleSettings?.status === "configured" ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 p-3 border rounded-lg">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">GitHub SSO</span>
                        <Badge variant={ssoGithubSettings?.enabled ? "default" : "secondary"} className="ml-2">
                          {ssoGithubSettings?.enabled ? "Enabled" : ssoGithubSettings?.status === "configured" ? "Configured" : "Not Configured"}
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Mailgun Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5" />
                        Mailgun Configuration
                      </CardTitle>
                      <CardDescription>Configure global email delivery service</CardDescription>
                    </div>
                    {mailgunSettings?.lastTestedAt && (
                      <div className="text-xs text-muted-foreground">
                        Last tested: {new Date(mailgunSettings.lastTestedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {mailgunLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="mailgun-domain">Domain</Label>
                          <Input
                            id="mailgun-domain"
                            value={mailgunForm.domain || mailgunSettings?.config?.domain || ""}
                            onChange={(e) => setMailgunForm({ ...mailgunForm, domain: e.target.value })}
                            placeholder="mg.example.com"
                            data-testid="input-mailgun-domain"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="mailgun-from-email">From Email</Label>
                          <Input
                            id="mailgun-from-email"
                            type="email"
                            value={mailgunForm.fromEmail || mailgunSettings?.config?.fromEmail || ""}
                            onChange={(e) => setMailgunForm({ ...mailgunForm, fromEmail: e.target.value })}
                            placeholder="noreply@example.com"
                            data-testid="input-mailgun-from-email"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mailgun-region">Region</Label>
                        <Select
                          value={mailgunForm.region || mailgunSettings?.config?.region || "US"}
                          onValueChange={(value: "US" | "EU") => setMailgunForm({ ...mailgunForm, region: value })}
                        >
                          <SelectTrigger id="mailgun-region" data-testid="select-mailgun-region">
                            <SelectValue placeholder="Select region" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="US">US (api.mailgun.net)</SelectItem>
                            <SelectItem value="EU">EU (api.eu.mailgun.net)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mailgun-api-key">API Key</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="mailgun-api-key"
                              type={showMailgunApiKey ? "text" : "password"}
                              value={mailgunForm.apiKey}
                              onChange={(e) => setMailgunForm({ ...mailgunForm, apiKey: e.target.value })}
                              placeholder={mailgunSettings?.secretMasked?.apiKeyMasked || "Enter API key"}
                              data-testid="input-mailgun-api-key"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowMailgunApiKey(!showMailgunApiKey)}
                            >
                              {showMailgunApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {mailgunSettings?.secretMasked?.apiKeyMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearMailgunSecretMutation.mutate("apiKey")}
                              disabled={clearMailgunSecretMutation.isPending}
                              title="Clear API Key"
                              data-testid="button-clear-mailgun-api-key"
                            >
                              {clearMailgunSecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {mailgunSettings?.secretMasked?.apiKeyMasked && !mailgunForm.apiKey && (
                          <p className="text-xs text-muted-foreground">
                            Current: {mailgunSettings.secretMasked.apiKeyMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="mailgun-signing-key">Signing Key (Optional)</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="mailgun-signing-key"
                              type={showMailgunSigningKey ? "text" : "password"}
                              value={mailgunForm.signingKey}
                              onChange={(e) => setMailgunForm({ ...mailgunForm, signingKey: e.target.value })}
                              placeholder={mailgunSettings?.secretMasked?.signingKeyMasked || "Enter signing key (optional)"}
                              data-testid="input-mailgun-signing-key"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowMailgunSigningKey(!showMailgunSigningKey)}
                            >
                              {showMailgunSigningKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {mailgunSettings?.secretMasked?.signingKeyMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearMailgunSecretMutation.mutate("signingKey")}
                              disabled={clearMailgunSecretMutation.isPending}
                              title="Clear Signing Key"
                              data-testid="button-clear-mailgun-signing-key"
                            >
                              {clearMailgunSecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {mailgunSettings?.secretMasked?.signingKeyMasked && !mailgunForm.signingKey && (
                          <p className="text-xs text-muted-foreground">
                            Current: {mailgunSettings.secretMasked.signingKeyMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testMailgunMutation.mutate()}
                          disabled={testMailgunMutation.isPending || !integrationStatus?.mailgun}
                          data-testid="button-test-mailgun"
                        >
                          {testMailgunMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setTestEmailDialogOpen(true)}
                          disabled={sendTestEmailMutation.isPending || !integrationStatus?.mailgun}
                          data-testid="button-send-test-email"
                        >
                          {sendTestEmailMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          Send Test Email
                        </Button>
                        <Button
                          onClick={() => {
                            const data: any = {};
                            if (mailgunForm.domain) data.domain = mailgunForm.domain;
                            else if (mailgunSettings?.config?.domain) data.domain = mailgunSettings.config.domain;
                            if (mailgunForm.fromEmail) data.fromEmail = mailgunForm.fromEmail;
                            else if (mailgunSettings?.config?.fromEmail) data.fromEmail = mailgunSettings.config.fromEmail;
                            data.region = mailgunForm.region || mailgunSettings?.config?.region || "US";
                            if (mailgunForm.apiKey) data.apiKey = mailgunForm.apiKey;
                            if (mailgunForm.signingKey) data.signingKey = mailgunForm.signingKey;
                            saveMailgunMutation.mutate(data);
                          }}
                          disabled={saveMailgunMutation.isPending}
                          data-testid="button-save-mailgun"
                        >
                          {saveMailgunMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save Mailgun Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* S3 Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <HardDrive className="h-5 w-5" />
                        S3 Storage Configuration
                      </CardTitle>
                      <CardDescription>Configure global file storage service</CardDescription>
                    </div>
                    {s3Settings?.lastTestedAt && (
                      <div className="text-xs text-muted-foreground">
                        Last tested: {new Date(s3Settings.lastTestedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {s3Loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="s3-region">Region</Label>
                          <Input
                            id="s3-region"
                            value={s3Form.region || s3Settings?.config?.region || ""}
                            onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                            placeholder="us-east-1"
                            data-testid="input-s3-region"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="s3-bucket">Bucket Name</Label>
                          <Input
                            id="s3-bucket"
                            value={s3Form.bucketName || s3Settings?.config?.bucketName || ""}
                            onChange={(e) => setS3Form({ ...s3Form, bucketName: e.target.value })}
                            placeholder="my-app-bucket"
                            data-testid="input-s3-bucket"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="s3-public-url">Public Base URL (Optional)</Label>
                          <Input
                            id="s3-public-url"
                            value={s3Form.publicBaseUrl || s3Settings?.config?.publicBaseUrl || ""}
                            onChange={(e) => setS3Form({ ...s3Form, publicBaseUrl: e.target.value })}
                            placeholder="https://bucket.s3.amazonaws.com"
                            data-testid="input-s3-public-url"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="s3-cloudfront-url">CloudFront URL (Optional)</Label>
                          <Input
                            id="s3-cloudfront-url"
                            value={s3Form.cloudfrontUrl || s3Settings?.config?.cloudfrontUrl || ""}
                            onChange={(e) => setS3Form({ ...s3Form, cloudfrontUrl: e.target.value })}
                            placeholder="https://d123abc.cloudfront.net"
                            data-testid="input-s3-cloudfront-url"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="s3-access-key">Access Key ID</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="s3-access-key"
                              type={showS3AccessKey ? "text" : "password"}
                              value={s3Form.accessKeyId}
                              onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                              placeholder={s3Settings?.secretMasked?.accessKeyIdMasked || "Enter Access Key ID"}
                              data-testid="input-s3-access-key"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowS3AccessKey(!showS3AccessKey)}
                            >
                              {showS3AccessKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {s3Settings?.secretMasked?.accessKeyIdMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearS3SecretMutation.mutate("accessKeyId")}
                              disabled={clearS3SecretMutation.isPending}
                              title="Clear Access Key"
                              data-testid="button-clear-s3-access-key"
                            >
                              {clearS3SecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {s3Settings?.secretMasked?.accessKeyIdMasked && !s3Form.accessKeyId && (
                          <p className="text-xs text-muted-foreground">
                            Current: {s3Settings.secretMasked.accessKeyIdMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="s3-secret-key">Secret Access Key</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="s3-secret-key"
                              type={showS3SecretKey ? "text" : "password"}
                              value={s3Form.secretAccessKey}
                              onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                              placeholder={s3Settings?.secretMasked?.secretAccessKeyMasked || "Enter Secret Access Key"}
                              data-testid="input-s3-secret-key"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowS3SecretKey(!showS3SecretKey)}
                            >
                              {showS3SecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {s3Settings?.secretMasked?.secretAccessKeyMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearS3SecretMutation.mutate("secretAccessKey")}
                              disabled={clearS3SecretMutation.isPending}
                              title="Clear Secret Key"
                              data-testid="button-clear-s3-secret-key"
                            >
                              {clearS3SecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {s3Settings?.secretMasked?.secretAccessKeyMasked && !s3Form.secretAccessKey && (
                          <p className="text-xs text-muted-foreground">
                            Current: {s3Settings.secretMasked.secretAccessKeyMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testS3Mutation.mutate()}
                          disabled={testS3Mutation.isPending || !integrationStatus?.s3}
                          data-testid="button-test-s3"
                        >
                          {testS3Mutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          onClick={() => {
                            const data: any = {};
                            if (s3Form.region) data.region = s3Form.region;
                            else if (s3Settings?.config?.region) data.region = s3Settings.config.region;
                            if (s3Form.bucketName) data.bucketName = s3Form.bucketName;
                            else if (s3Settings?.config?.bucketName) data.bucketName = s3Settings.config.bucketName;
                            if (s3Form.publicBaseUrl !== undefined) data.publicBaseUrl = s3Form.publicBaseUrl || s3Settings?.config?.publicBaseUrl || "";
                            if (s3Form.cloudfrontUrl !== undefined) data.cloudfrontUrl = s3Form.cloudfrontUrl || s3Settings?.config?.cloudfrontUrl || "";
                            if (s3Form.accessKeyId) data.accessKeyId = s3Form.accessKeyId;
                            if (s3Form.secretAccessKey) data.secretAccessKey = s3Form.secretAccessKey;
                            saveS3Mutation.mutate(data);
                          }}
                          disabled={saveS3Mutation.isPending}
                          data-testid="button-save-s3"
                        >
                          {saveS3Mutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save S3 Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stripe Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Stripe Configuration
                      </CardTitle>
                      <CardDescription>Configure global billing and payment processing</CardDescription>
                    </div>
                    {stripeSettings?.lastTestedAt && (
                      <div className="text-xs text-muted-foreground">
                        Last tested: {new Date(stripeSettings.lastTestedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {stripeLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="stripe-publishable-key">Publishable Key</Label>
                          <Input
                            id="stripe-publishable-key"
                            value={stripeForm.publishableKey || stripeSettings?.config?.publishableKey || ""}
                            onChange={(e) => setStripeForm({ ...stripeForm, publishableKey: e.target.value })}
                            placeholder="pk_test_..."
                            data-testid="input-stripe-publishable-key"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="stripe-default-currency">Default Currency</Label>
                          <Select
                            value={stripeForm.defaultCurrency || stripeSettings?.config?.defaultCurrency || "usd"}
                            onValueChange={(value) => setStripeForm({ ...stripeForm, defaultCurrency: value })}
                          >
                            <SelectTrigger id="stripe-default-currency" data-testid="select-stripe-currency">
                              <SelectValue placeholder="Select currency" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="usd">USD - US Dollar</SelectItem>
                              <SelectItem value="eur">EUR - Euro</SelectItem>
                              <SelectItem value="gbp">GBP - British Pound</SelectItem>
                              <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
                              <SelectItem value="aud">AUD - Australian Dollar</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="stripe-secret-key">Secret Key</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="stripe-secret-key"
                              type={showStripeSecretKey ? "text" : "password"}
                              value={stripeForm.secretKey}
                              onChange={(e) => setStripeForm({ ...stripeForm, secretKey: e.target.value })}
                              placeholder={stripeSettings?.secretMasked?.secretKeyMasked || "sk_test_..."}
                              data-testid="input-stripe-secret-key"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowStripeSecretKey(!showStripeSecretKey)}
                            >
                              {showStripeSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {stripeSettings?.secretMasked?.secretKeyMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearStripeSecretMutation.mutate("secretKey")}
                              disabled={clearStripeSecretMutation.isPending}
                              title="Clear Secret Key"
                              data-testid="button-clear-stripe-secret-key"
                            >
                              {clearStripeSecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {stripeSettings?.secretMasked?.secretKeyMasked && !stripeForm.secretKey && (
                          <p className="text-xs text-muted-foreground">
                            Current: {stripeSettings.secretMasked.secretKeyMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="stripe-webhook-secret">Webhook Signing Secret</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="stripe-webhook-secret"
                              type={showStripeWebhookSecret ? "text" : "password"}
                              value={stripeForm.webhookSecret}
                              onChange={(e) => setStripeForm({ ...stripeForm, webhookSecret: e.target.value })}
                              placeholder={stripeSettings?.secretMasked?.webhookSecretMasked || "whsec_..."}
                              data-testid="input-stripe-webhook-secret"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowStripeWebhookSecret(!showStripeWebhookSecret)}
                            >
                              {showStripeWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          {stripeSettings?.secretMasked?.webhookSecretMasked && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => clearStripeSecretMutation.mutate("webhookSecret")}
                              disabled={clearStripeSecretMutation.isPending}
                              title="Clear Webhook Secret"
                              data-testid="button-clear-stripe-webhook-secret"
                            >
                              {clearStripeSecretMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                        {stripeSettings?.secretMasked?.webhookSecretMasked && !stripeForm.webhookSecret && (
                          <p className="text-xs text-muted-foreground">
                            Current: {stripeSettings.secretMasked.webhookSecretMasked} (enter new value to replace)
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap justify-end gap-2 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => testStripeMutation.mutate()}
                          disabled={testStripeMutation.isPending || !integrationStatus?.stripe}
                          data-testid="button-test-stripe"
                        >
                          {testStripeMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          onClick={() => {
                            const data: any = {};
                            if (stripeForm.publishableKey) data.publishableKey = stripeForm.publishableKey;
                            else if (stripeSettings?.config?.publishableKey) data.publishableKey = stripeSettings.config.publishableKey;
                            data.defaultCurrency = stripeForm.defaultCurrency || stripeSettings?.config?.defaultCurrency || "usd";
                            if (stripeForm.secretKey) data.secretKey = stripeForm.secretKey;
                            if (stripeForm.webhookSecret) data.webhookSecret = stripeForm.webhookSecret;
                            saveStripeMutation.mutate(data);
                          }}
                          disabled={saveStripeMutation.isPending}
                          data-testid="button-save-stripe"
                        >
                          {saveStripeMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save Stripe Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* SSO Providers Configuration */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Globe className="h-5 w-5" />
                        SSO Providers
                      </CardTitle>
                      <CardDescription>Configure single sign-on providers for platform authentication</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Google SSO */}
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg">
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-medium">Google SSO</h4>
                            <p className="text-sm text-muted-foreground">Allow users to sign in with their Google account</p>
                          </div>
                        </div>
                        <Badge variant={ssoGoogleSettings?.status === "configured" ? "default" : "secondary"}>
                          {ssoGoogleSettings?.status === "configured" ? (ssoGoogleSettings?.enabled ? "Enabled" : "Configured") : "Not Configured"}
                        </Badge>
                      </div>

                      {ssoGoogleLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {ssoGoogleSettings?.config?.source === "environment" && (
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                Currently using environment variables. Save new settings to override with database configuration.
                              </p>
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="google-sso-enabled"
                              checked={ssoGoogleForm.enabled}
                              onCheckedChange={(checked) => { setSsoGoogleForm({ ...ssoGoogleForm, enabled: !!checked }); setSsoGoogleDirty(true); }}
                              data-testid="checkbox-google-sso-enabled"
                            />
                            <Label htmlFor="google-sso-enabled" className="font-normal">Enable Google SSO</Label>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="google-client-id">Client ID</Label>
                              <Input
                                id="google-client-id"
                                value={ssoGoogleForm.clientId}
                                onChange={(e) => { setSsoGoogleForm({ ...ssoGoogleForm, clientId: e.target.value }); setSsoGoogleDirty(true); }}
                                placeholder="Enter Google Client ID"
                                data-testid="input-google-client-id"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="google-redirect-uri">Redirect URI (read-only)</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="google-redirect-uri"
                                  value={ssoGoogleForm.redirectUri}
                                  readOnly
                                  className="bg-muted"
                                  data-testid="input-google-redirect-uri"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(ssoGoogleForm.redirectUri);
                                    toast({ title: "Copied to clipboard" });
                                  }}
                                  data-testid="button-copy-google-redirect"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">Add this URL to your Google OAuth credentials</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="google-client-secret">Client Secret</Label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  id="google-client-secret"
                                  type={showGoogleClientSecret ? "text" : "password"}
                                  value={ssoGoogleForm.clientSecret}
                                  onChange={(e) => { setSsoGoogleForm({ ...ssoGoogleForm, clientSecret: e.target.value }); setSsoGoogleDirty(true); }}
                                  placeholder={ssoGoogleSettings?.secretMasked?.clientSecretMasked || "Enter Client Secret"}
                                  data-testid="input-google-client-secret"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full"
                                  onClick={() => setShowGoogleClientSecret(!showGoogleClientSecret)}
                                >
                                  {showGoogleClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => testSsoGoogleMutation.mutate()}
                              disabled={testSsoGoogleMutation.isPending || ssoGoogleSettings?.status !== "configured"}
                              data-testid="button-test-google-sso"
                            >
                              {testSsoGoogleMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4 mr-2" />
                              )}
                              Test Configuration
                            </Button>
                            <Button
                              onClick={() => {
                                const data: any = {
                                  enabled: ssoGoogleForm.enabled,
                                  clientId: ssoGoogleForm.clientId,
                                };
                                if (ssoGoogleForm.clientSecret) data.clientSecret = ssoGoogleForm.clientSecret;
                                saveSsoGoogleMutation.mutate(data);
                              }}
                              disabled={saveSsoGoogleMutation.isPending}
                              data-testid="button-save-google-sso"
                            >
                              {saveSsoGoogleMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-2" />
                              )}
                              Save Google SSO
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* GitHub SSO */}
                    <div className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-muted rounded-lg">
                            <svg className="h-5 w-5" viewBox="0 0 24 24">
                              <path fill="currentColor" d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                            </svg>
                          </div>
                          <div>
                            <h4 className="font-medium">GitHub SSO</h4>
                            <p className="text-sm text-muted-foreground">Allow users to sign in with their GitHub account</p>
                          </div>
                        </div>
                        <Badge variant={ssoGithubSettings?.status === "configured" ? "default" : "secondary"}>
                          {ssoGithubSettings?.status === "configured" ? (ssoGithubSettings?.enabled ? "Enabled" : "Configured") : "Not Configured"}
                        </Badge>
                      </div>

                      {ssoGithubLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {ssoGithubSettings?.config?.source === "environment" && (
                            <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                Currently using environment variables. Save new settings to override with database configuration.
                              </p>
                            </div>
                          )}

                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="github-sso-enabled"
                              checked={ssoGithubForm.enabled}
                              onCheckedChange={(checked) => { setSsoGithubForm({ ...ssoGithubForm, enabled: !!checked }); setSsoGithubDirty(true); }}
                              data-testid="checkbox-github-sso-enabled"
                            />
                            <Label htmlFor="github-sso-enabled" className="font-normal">Enable GitHub SSO</Label>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="github-client-id">Client ID</Label>
                              <Input
                                id="github-client-id"
                                value={ssoGithubForm.clientId}
                                onChange={(e) => { setSsoGithubForm({ ...ssoGithubForm, clientId: e.target.value }); setSsoGithubDirty(true); }}
                                placeholder="Enter GitHub Client ID"
                                data-testid="input-github-client-id"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="github-redirect-uri">Redirect URI (read-only)</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="github-redirect-uri"
                                  value={ssoGithubForm.redirectUri}
                                  readOnly
                                  className="bg-muted"
                                  data-testid="input-github-redirect-uri"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  onClick={() => {
                                    navigator.clipboard.writeText(ssoGithubForm.redirectUri);
                                    toast({ title: "Copied to clipboard" });
                                  }}
                                  data-testid="button-copy-github-redirect"
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">Add this URL to your GitHub OAuth App settings</p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="github-client-secret">Client Secret</Label>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Input
                                  id="github-client-secret"
                                  type={showGithubClientSecret ? "text" : "password"}
                                  value={ssoGithubForm.clientSecret}
                                  onChange={(e) => { setSsoGithubForm({ ...ssoGithubForm, clientSecret: e.target.value }); setSsoGithubDirty(true); }}
                                  placeholder={ssoGithubSettings?.secretMasked?.clientSecretMasked || "Enter Client Secret"}
                                  data-testid="input-github-client-secret"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute right-0 top-0 h-full"
                                  onClick={() => setShowGithubClientSecret(!showGithubClientSecret)}
                                >
                                  {showGithubClientSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              onClick={() => testSsoGithubMutation.mutate()}
                              disabled={testSsoGithubMutation.isPending || ssoGithubSettings?.status !== "configured"}
                              data-testid="button-test-github-sso"
                            >
                              {testSsoGithubMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <TestTube className="h-4 w-4 mr-2" />
                              )}
                              Test Configuration
                            </Button>
                            <Button
                              onClick={() => {
                                const data: any = {
                                  enabled: ssoGithubForm.enabled,
                                  clientId: ssoGithubForm.clientId,
                                };
                                if (ssoGithubForm.clientSecret) data.clientSecret = ssoGithubForm.clientSecret;
                                saveSsoGithubMutation.mutate(data);
                              }}
                              disabled={saveSsoGithubMutation.isPending}
                              data-testid="button-save-github-sso"
                            >
                              {saveSsoGithubMutation.isPending ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <Save className="h-4 w-4 mr-2" />
                              )}
                              Save GitHub SSO
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="invoice-settings">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Invoice Settings
                </CardTitle>
                <CardDescription>
                  Configure business information for invoices and billing. These settings will be used for future subscription and invoice customization.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="bg-muted/50 border rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    These settings are placeholders for future subscription and invoice features. Configure your business details now for when billing is fully implemented.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="business-display-name">Business Display Name</Label>
                    <Input
                      id="business-display-name"
                      value={invoiceSettingsForm.businessDisplayName}
                      onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, businessDisplayName: e.target.value })}
                      placeholder="Your Company Name"
                      data-testid="input-invoice-business-name"
                    />
                    <p className="text-xs text-muted-foreground">Name displayed on invoices and billing documents</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice-support-email">Support Email</Label>
                    <Input
                      id="invoice-support-email"
                      type="email"
                      value={invoiceSettingsForm.invoiceSupportEmail}
                      onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoiceSupportEmail: e.target.value })}
                      placeholder="billing@yourcompany.com"
                      data-testid="input-invoice-support-email"
                    />
                    <p className="text-xs text-muted-foreground">Email for billing inquiries</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invoice-footer-text">Invoice Footer Text</Label>
                  <Input
                    id="invoice-footer-text"
                    value={invoiceSettingsForm.invoiceFooterText}
                    onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoiceFooterText: e.target.value })}
                    placeholder="Thank you for your business!"
                    data-testid="input-invoice-footer"
                  />
                  <p className="text-xs text-muted-foreground">Custom message displayed at the bottom of invoices</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invoice-default-currency">Default Currency</Label>
                    <Select
                      value={invoiceSettingsForm.invoiceDefaultCurrency}
                      onValueChange={(value) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoiceDefaultCurrency: value })}
                    >
                      <SelectTrigger id="invoice-default-currency" data-testid="select-invoice-currency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="usd">USD - US Dollar</SelectItem>
                        <SelectItem value="eur">EUR - Euro</SelectItem>
                        <SelectItem value="gbp">GBP - British Pound</SelectItem>
                        <SelectItem value="cad">CAD - Canadian Dollar</SelectItem>
                        <SelectItem value="aud">AUD - Australian Dollar</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoice-prefix">Invoice Prefix (Optional)</Label>
                    <Input
                      id="invoice-prefix"
                      value={invoiceSettingsForm.invoicePrefix}
                      onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, invoicePrefix: e.target.value })}
                      placeholder="INV-"
                      data-testid="input-invoice-prefix"
                    />
                    <p className="text-xs text-muted-foreground">Prefix for invoice numbers (e.g., INV-001)</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tax-id-label">Tax ID Label (Optional)</Label>
                    <Input
                      id="tax-id-label"
                      value={invoiceSettingsForm.taxIdLabel}
                      onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, taxIdLabel: e.target.value })}
                      placeholder="VAT Number, EIN, GST, etc."
                      data-testid="input-tax-id-label"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tax-id-value">Tax ID Value (Optional)</Label>
                    <Input
                      id="tax-id-value"
                      value={invoiceSettingsForm.taxIdValue}
                      onChange={(e) => setInvoiceSettingsForm({ ...invoiceSettingsForm, taxIdValue: e.target.value })}
                      placeholder="Your tax identification number"
                      data-testid="input-tax-id-value"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-4">
                  <Button
                    disabled
                    data-testid="button-save-invoice-settings"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save Invoice Settings (Coming Soon)
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Test Email Dialog */}
          <AlertDialog open={testEmailDialogOpen} onOpenChange={setTestEmailDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Send Test Email</AlertDialogTitle>
                <AlertDialogDescription>
                  Enter an email address to receive a test email from the global Mailgun configuration.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Label htmlFor="test-email-address">Email Address</Label>
                <Input
                  id="test-email-address"
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="test@example.com"
                  data-testid="input-test-email-address"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    sendTestEmailMutation.mutate(testEmailAddress);
                  }}
                  disabled={!testEmailAddress || sendTestEmailMutation.isPending}
                >
                  {sendTestEmailMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Send Email
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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

      {/* Password Management Drawer */}
      <Sheet open={passwordDrawerOpen} onOpenChange={(open) => {
        if (!open) {
          resetPasswordForm();
          setPasswordDrawerOpen(false);
        }
      }}>
        <SheetContent className="w-full sm:max-w-xl" data-testid="drawer-password-management">
          <SheetHeader>
            <SheetTitle>
              {passwordMethod === "SET_PASSWORD" ? "Set Password" : "Reset Password"}
            </SheetTitle>
            <SheetDescription>
              {passwordMethod === "SET_PASSWORD" 
                ? `Set an initial password for ${adminToProvision?.email}`
                : `Generate a password reset link for ${adminToProvision?.email}`
              }
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            {passwordMethod === "SET_PASSWORD" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={passwordForm.password}
                      onChange={(e) => setPasswordForm({ ...passwordForm, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                      data-testid="input-password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-0 top-0 h-full"
                      onClick={() => setShowPassword(!showPassword)}
                      data-testid="button-toggle-password"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    placeholder="Re-enter password"
                    data-testid="input-confirm-password"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="mustChange"
                    checked={passwordForm.mustChangeOnNextLogin}
                    onCheckedChange={(checked) => setPasswordForm({ ...passwordForm, mustChangeOnNextLogin: checked === true })}
                    data-testid="checkbox-must-change"
                  />
                  <Label htmlFor="mustChange" className="text-sm font-normal cursor-pointer">
                    Require password change on next login
                  </Label>
                </div>
              </>
            ) : (
              <>
                <div className="rounded-lg border p-4 bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    A password reset link will be generated. You can either share the link directly or have an email sent to the admin.
                  </p>
                </div>
                {integrationStatus?.mailgun && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="sendEmail"
                      checked={passwordForm.sendEmail}
                      onCheckedChange={(checked) => setPasswordForm({ ...passwordForm, sendEmail: checked === true })}
                      data-testid="checkbox-send-email"
                    />
                    <Label htmlFor="sendEmail" className="text-sm font-normal cursor-pointer">
                      Send password reset email
                    </Label>
                  </div>
                )}
                {generatedResetUrl && (
                  <div className="space-y-2">
                    <Label>Password Reset Link</Label>
                    <div className="flex items-center gap-2">
                      <Input 
                        value={generatedResetUrl} 
                        readOnly 
                        className="font-mono text-sm"
                        data-testid="input-reset-url"
                      />
                      <Button 
                        size="icon" 
                        variant="outline" 
                        onClick={() => {
                          navigator.clipboard.writeText(generatedResetUrl);
                          toast({ title: "Link copied to clipboard" });
                        }}
                        data-testid="button-copy-reset-link"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      This link expires in 24 hours.
                    </p>
                  </div>
                )}
              </>
            )}
            <div className="flex gap-3 pt-4">
              {!generatedResetUrl && (
                <Button 
                  onClick={handleProvisionAdmin} 
                  disabled={provisionAdminMutation.isPending}
                  className="flex-1"
                  data-testid="button-provision-admin"
                >
                  {provisionAdminMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : passwordMethod === "SET_PASSWORD" ? (
                    <KeyRound className="h-4 w-4 mr-2" />
                  ) : (
                    <Mail className="h-4 w-4 mr-2" />
                  )}
                  {passwordMethod === "SET_PASSWORD" ? "Set Password" : "Generate Reset Link"}
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => {
                  resetPasswordForm();
                  setPasswordDrawerOpen(false);
                }}
                className={generatedResetUrl ? "flex-1" : ""}
              >
                {generatedResetUrl ? "Done" : "Cancel"}
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
