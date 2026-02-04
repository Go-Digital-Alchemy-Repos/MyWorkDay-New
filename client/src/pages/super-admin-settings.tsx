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
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, Users, FileText, Palette, Settings, Shield, Save, Mail, HardDrive, Check, X, 
  Plus, Link, Copy, MoreHorizontal, UserCheck, UserX, Clock, AlertCircle, KeyRound, Image,
  TestTube, Eye, EyeOff, Trash2, RefreshCw, Send, CreditCard, Archive, Globe, Cloud, Sparkles, Bot,
  AlertTriangle, CheckCircle
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { ColorPicker } from "@/components/ui/color-picker";
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
import { RichTextEditor } from "@/components/richtext";

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
  r2: boolean;
  stripe: boolean;
  encryptionConfigured: boolean;
  ssoGoogle?: boolean;
}

interface SsoGoogleSettings {
  status: "configured" | "not_configured";
  enabled: boolean;
  clientId: string | null;
  redirectUri: string | null;
  config?: {
    source?: "database" | "environment" | "none";
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

interface R2Settings {
  provider: string;
  status: "configured" | "not_configured" | "error";
  publicConfig: {
    bucketName: string | null;
    accountId: string | null;
    endpoint: string | null;
    keyPrefixTemplate: string | null;
    publicUrl: string | null;
  } | null;
  secretConfigured: boolean;
  secretMasked: {
    accessKeyIdMasked: string | null;
    secretAccessKeyMasked: string | null;
  } | null;
  lastTestedAt: string | null;
  isSystemDefault: boolean;
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
                <div 
                  key={agreement.id} 
                  className="flex items-center justify-between p-4 border rounded-lg cursor-pointer hover-elevate" 
                  data-testid={`agreement-row-${agreement.id}`}
                  onClick={() => handleOpenEdit(agreement)}
                >
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
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                        <DropdownMenuItem onClick={() => handleOpenEdit(agreement)}>
                          <FileText className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {agreement.status === "draft" && (
                          <>
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
            <SheetTitle>{selectedAgreement ? "Agreement Details" : "Create Agreement"}</SheetTitle>
            <SheetDescription>
              {selectedAgreement 
                ? `${selectedAgreement.tenantName} • Version ${selectedAgreement.version}` 
                : "Create a new SaaS agreement for all tenants or a specific tenant"}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-4">
            {selectedAgreement && (
              <div className="flex items-center gap-2">
                {getStatusBadge(selectedAgreement.status)}
                {(selectedAgreement as any).scope === "global" && (
                  <Badge variant="outline" className="text-xs"><Globe className="h-3 w-3 mr-1" />Default</Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Updated {new Date(selectedAgreement.updatedAt).toLocaleDateString()}
                </span>
              </div>
            )}
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
              <RichTextEditor
                value={form.body}
                onChange={(value) => setForm({ ...form, body: value })}
                placeholder="Enter agreement content..."
                minHeight="300px"
                showAlignment={true}
                data-testid="richtext-agreement-body"
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

interface AIConfig {
  enabled: boolean;
  provider: string;
  model: string;
  maxTokens: number;
  temperature: string;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  lastTestedAt: string | null;
  configError: string | null;
  isOperational: boolean;
}

function AIIntegrationTab() {
  const { toast } = useToast();
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [form, setForm] = useState({
    enabled: false,
    provider: "openai",
    model: "gpt-4o-mini",
    maxTokens: 2000,
    temperature: "0.7",
  });

  const { data: aiConfig, isLoading: loadingConfig, refetch } = useQuery<AIConfig>({
    queryKey: ["/api/v1/super/ai/config"],
    queryFn: async () => {
      const res = await fetch("/api/v1/super/ai/config", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch AI configuration");
      return res.json();
    },
  });

  useEffect(() => {
    if (aiConfig) {
      setForm({
        enabled: aiConfig.enabled,
        provider: aiConfig.provider,
        model: aiConfig.model,
        maxTokens: aiConfig.maxTokens,
        temperature: aiConfig.temperature,
      });
    }
  }, [aiConfig]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<AIConfig & { apiKey?: string }>) => {
      return apiRequest("PUT", "/api/v1/super/ai/config", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/ai/config"] });
      toast({ title: "AI configuration updated" });
      setApiKeyInput("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to update AI configuration", description: error.message, variant: "destructive" });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/v1/super/ai/test", { 
        method: "POST", 
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ["/api/v1/super/ai/config"] });
        toast({ title: "Connection successful", description: `Model: ${data.model}` });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Connection test failed", description: error.message, variant: "destructive" });
    },
  });

  const removeApiKeyMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", "/api/v1/super/ai/api-key");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/ai/config"] });
      toast({ title: "API key removed" });
      setConfirmRemoveOpen(false);
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove API key", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    const data: any = { ...form };
    if (apiKeyInput.trim()) {
      data.apiKey = apiKeyInput.trim();
    }
    updateConfigMutation.mutate(data);
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const availableModels = [
    { value: "gpt-4o-mini", label: "GPT-4o Mini (Cost-effective)" },
    { value: "gpt-4o", label: "GPT-4o (Best quality)" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Fastest)" },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Integration Settings
          </CardTitle>
          <CardDescription>
            Configure ChatGPT/OpenAI integration for AI-powered features across all tenants. These features include task breakdown suggestions and project planning assistance.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {aiConfig?.configError && (
            <div className="flex items-start gap-3 p-4 border border-destructive/50 rounded-lg bg-destructive/5">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <div className="font-medium text-destructive">Configuration Error</div>
                <div className="text-sm text-destructive/80">
                  {aiConfig.configError}
                </div>
              </div>
            </div>
          )}

          {aiConfig?.hasApiKey && aiConfig?.isOperational && (
            <div className="flex items-center gap-2 p-4 border border-green-500/50 rounded-lg bg-green-500/5">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div className="text-sm text-green-700 dark:text-green-400">
                AI integration is configured and operational
              </div>
            </div>
          )}

          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <div>
                <div className="font-medium">Enable AI Features</div>
                <div className="text-sm text-muted-foreground">
                  Turn on AI-powered suggestions for task breakdowns and project planning
                </div>
              </div>
            </div>
            <Checkbox
              checked={form.enabled}
              onCheckedChange={(checked) => setForm({ ...form, enabled: !!checked })}
              data-testid="checkbox-ai-enabled"
            />
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ai-api-key">OpenAI API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="ai-api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKeyInput}
                    onChange={(e) => setApiKeyInput(e.target.value)}
                    placeholder={aiConfig?.hasApiKey ? "••••••••••••••••" : "sk-..."}
                    data-testid="input-ai-api-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                {aiConfig?.hasApiKey && (
                  <Button
                    variant="outline"
                    onClick={() => setConfirmRemoveOpen(true)}
                    data-testid="button-remove-api-key"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                )}
              </div>
              {aiConfig?.hasApiKey && (
                <p className="text-xs text-muted-foreground">
                  Current key: {aiConfig.apiKeyMasked}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <a 
                  href="https://platform.openai.com/api-keys" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  OpenAI Platform
                </a>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ai-model">Model</Label>
                <Select
                  value={form.model}
                  onValueChange={(value) => setForm({ ...form, model: value })}
                >
                  <SelectTrigger id="ai-model" data-testid="select-ai-model">
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  GPT-4o Mini is recommended for a balance of quality and cost
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ai-max-tokens">Max Tokens</Label>
                <Input
                  id="ai-max-tokens"
                  type="number"
                  min={100}
                  max={8000}
                  value={form.maxTokens}
                  onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 2000 })}
                  data-testid="input-ai-max-tokens"
                />
                <p className="text-xs text-muted-foreground">
                  Maximum response length (100-8000)
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ai-temperature">Temperature</Label>
              <Select
                value={form.temperature}
                onValueChange={(value) => setForm({ ...form, temperature: value })}
              >
                <SelectTrigger id="ai-temperature" data-testid="select-ai-temperature">
                  <SelectValue placeholder="Select temperature" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.3">0.3 - More focused and deterministic</SelectItem>
                  <SelectItem value="0.5">0.5 - Balanced</SelectItem>
                  <SelectItem value="0.7">0.7 - More creative (recommended)</SelectItem>
                  <SelectItem value="1.0">1.0 - Most creative</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Higher values produce more varied responses
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={updateConfigMutation.isPending}
              data-testid="button-save-ai-config"
            >
              {updateConfigMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Save Configuration
            </Button>
            <Button
              variant="outline"
              onClick={() => testConnectionMutation.mutate()}
              disabled={!aiConfig?.hasApiKey || testConnectionMutation.isPending}
              data-testid="button-test-ai-connection"
            >
              {testConnectionMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <TestTube className="h-4 w-4 mr-2" />
              Test Connection
            </Button>
          </div>

          {aiConfig?.lastTestedAt && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              Last tested: {new Date(aiConfig.lastTestedAt).toLocaleString()}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Available AI Features</CardTitle>
          <CardDescription>
            These features will be available to all tenants when AI is enabled
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">Task Breakdown Suggestions</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI can suggest subtasks for complex tasks, helping users break down their work into manageable pieces.
              </p>
            </div>
            <div className="p-4 border rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium">Project Planning Assistance</span>
              </div>
              <p className="text-sm text-muted-foreground">
                AI can generate project plans with phases and tasks based on project descriptions.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the OpenAI API key and disable AI features. You can add a new key at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeApiKeyMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeApiKeyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove Key
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
  const [activeTab, setActiveTab] = useState("agreements");
  const [brandingForm, setBrandingForm] = useState<Partial<SystemSettings>>({});
  
  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: systemSettings, isLoading: settingsLoading } = useQuery<SystemSettings>({
    queryKey: ["/api/v1/super/system-settings"],
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

  const { data: r2Settings, isLoading: r2Loading } = useQuery<R2Settings>({
    queryKey: ["/api/v1/system/integrations/r2"],
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

  const [mailgunForm, setMailgunForm] = useState({
    domain: "",
    fromEmail: "",
    region: "US" as "US" | "EU",
    apiKey: "",
    signingKey: "",
  });

  const [r2Form, setR2Form] = useState({
    bucketName: "",
    accountId: "",
    keyPrefixTemplate: "",
    publicUrl: "",
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
  const [showR2AccessKey, setShowR2AccessKey] = useState(false);
  const [showR2SecretKey, setShowR2SecretKey] = useState(false);
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

  const [ssoGoogleDirty, setSsoGoogleDirty] = useState(false);
  const [r2Dirty, setR2Dirty] = useState(false);

  useEffect(() => {
    if (r2Settings && !r2Dirty) {
      setR2Form({
        bucketName: r2Settings.publicConfig?.bucketName || "",
        accountId: r2Settings.publicConfig?.accountId || "",
        keyPrefixTemplate: r2Settings.publicConfig?.keyPrefixTemplate || "",
        publicUrl: r2Settings.publicConfig?.publicUrl || "",
        accessKeyId: "",
        secretAccessKey: "",
      });
    }
  }, [r2Settings, r2Dirty]);

  useEffect(() => {
    if (ssoGoogleSettings && !ssoGoogleDirty) {
      const apiRedirectUri = ssoGoogleSettings.redirectUri || "";
      const clientRedirectUri = `${window.location.origin}/api/v1/auth/google/callback`;
      const useClientUri = !apiRedirectUri || apiRedirectUri.includes("localhost");
      setSsoGoogleForm({
        enabled: ssoGoogleSettings.enabled || false,
        clientId: ssoGoogleSettings.clientId || "",
        clientSecret: "",
        redirectUri: useClientUri ? clientRedirectUri : apiRedirectUri,
      });
    }
  }, [ssoGoogleSettings, ssoGoogleDirty]);

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

  const saveR2Mutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("PUT", "/api/v1/system/integrations/r2", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/r2"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/integrations/status"] });
      toast({ title: "Cloudflare R2 settings saved successfully" });
      setR2Form(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to save R2 settings", description: parsed.message, variant: "destructive" });
    },
  });

  const testR2Mutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/system/integrations/r2/test", {});
      return response.json();
    },
    onSuccess: (data: { success: boolean; message: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/system/integrations/r2"] });
      if (data.success) {
        toast({ title: "R2 test successful", description: data.message });
      } else {
        toast({ title: "R2 test failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "R2 test failed", description: parsed.message, variant: "destructive" });
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
            <TabsTrigger value="ai-integration" data-testid="tab-ai-integration">
              <Sparkles className="h-4 w-4 mr-2" />
              AI Integration
            </TabsTrigger>
          </TabsList>

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
                      <ColorPicker
                        label="Primary Color"
                        value={brandingForm.defaultPrimaryColor || systemSettings?.defaultPrimaryColor || "#83ba3b"}
                        defaultValue="#83ba3b"
                        onChange={(value) => setBrandingForm({ ...brandingForm, defaultPrimaryColor: value })}
                        data-testid="input-primary-color"
                      />
                      <ColorPicker
                        label="Secondary Color"
                        value={brandingForm.defaultSecondaryColor || systemSettings?.defaultSecondaryColor || "#64748B"}
                        defaultValue="#64748B"
                        onChange={(value) => setBrandingForm({ ...brandingForm, defaultSecondaryColor: value })}
                        data-testid="input-secondary-color"
                      />
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
                          enableCropping
                          cropShape="rect"
                          cropAspectRatio={4}
                        />
                        <S3Dropzone
                          category="global-branding-icon"
                          label="Default Icon"
                          description="Square icon for compact spaces (max 512KB)"
                          valueUrl={brandingForm.defaultIconUrl !== undefined ? brandingForm.defaultIconUrl : systemSettings?.defaultIconUrl}
                          onUploaded={(fileUrl) => setBrandingForm({ ...brandingForm, defaultIconUrl: fileUrl })}
                          onRemoved={() => setBrandingForm({ ...brandingForm, defaultIconUrl: null })}
                          enableCropping
                          cropShape="rect"
                          cropAspectRatio={1}
                        />
                        <S3Dropzone
                          category="global-branding-favicon"
                          label="Default Favicon"
                          description="Browser tab icon (max 512KB)"
                          valueUrl={brandingForm.defaultFaviconUrl !== undefined ? brandingForm.defaultFaviconUrl : systemSettings?.defaultFaviconUrl}
                          onUploaded={(fileUrl) => setBrandingForm({ ...brandingForm, defaultFaviconUrl: fileUrl })}
                          onRemoved={() => setBrandingForm({ ...brandingForm, defaultFaviconUrl: null })}
                          enableCropping
                          cropShape="rect"
                          cropAspectRatio={1}
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
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
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
                      <a 
                        href="#section-mailgun" 
                        className="flex items-center gap-2 p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById("section-mailgun")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        data-testid="link-mailgun-section"
                      >
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Mailgun</span>
                        <Badge variant={integrationStatus?.mailgun ? "default" : "secondary"} className="ml-2">
                          {integrationStatus?.mailgun ? "Configured" : "Not Configured"}
                        </Badge>
                      </a>
                      <a 
                        href="#section-r2" 
                        className="flex items-center gap-2 p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById("section-r2")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        data-testid="link-r2-section"
                      >
                        <Cloud className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">R2 Storage</span>
                        <Badge variant={r2Settings?.status === "configured" ? "default" : "secondary"} className="ml-2">
                          {r2Settings?.status === "configured" ? "Configured" : "Not Configured"}
                        </Badge>
                      </a>
                      <a 
                        href="#section-stripe" 
                        className="flex items-center gap-2 p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById("section-stripe")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        data-testid="link-stripe-section"
                      >
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Stripe</span>
                        <Badge variant={integrationStatus?.stripe ? "default" : "secondary"} className="ml-2">
                          {integrationStatus?.stripe ? "Configured" : "Not Configured"}
                        </Badge>
                      </a>
                      <a 
                        href="#section-google-sso" 
                        className="flex items-center gap-2 p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById("section-google-sso")?.scrollIntoView({ behavior: "smooth" });
                        }}
                        data-testid="link-google-sso-section"
                      >
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Google SSO</span>
                        <Badge variant={ssoGoogleSettings?.enabled ? "default" : "secondary"} className="ml-2">
                          {ssoGoogleSettings?.enabled ? "Enabled" : ssoGoogleSettings?.status === "configured" ? "Configured" : "Not Configured"}
                        </Badge>
                      </a>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Mailgun Configuration */}
              <Card id="section-mailgun">
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

              {/* Cloudflare R2 Configuration (Preferred Default) */}
              <Card id="section-r2">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Cloud className="h-5 w-5" />
                        Cloudflare R2 Storage
                        <Badge variant="default" className="ml-2">Preferred</Badge>
                      </CardTitle>
                      <CardDescription>
                        Configure Cloudflare R2 as the default system-wide file storage (S3-compatible)
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {r2Settings?.status === "configured" ? (
                        <Badge variant="default">Configured</Badge>
                      ) : (
                        <Badge variant="outline">Not Configured</Badge>
                      )}
                      {r2Settings?.lastTestedAt && (
                        <span className="text-xs text-muted-foreground">
                          Tested: {new Date(r2Settings.lastTestedAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {r2Loading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="r2-account-id">Cloudflare Account ID</Label>
                          <Input
                            id="r2-account-id"
                            value={r2Form.accountId}
                            onChange={(e) => {
                              setR2Dirty(true);
                              setR2Form({ ...r2Form, accountId: e.target.value });
                            }}
                            placeholder="your-cloudflare-account-id"
                            data-testid="input-r2-account-id"
                          />
                          <p className="text-xs text-muted-foreground">
                            Find this in your Cloudflare Dashboard under R2 &gt; Overview
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="r2-bucket">Bucket Name</Label>
                          <Input
                            id="r2-bucket"
                            value={r2Form.bucketName}
                            onChange={(e) => {
                              setR2Dirty(true);
                              setR2Form({ ...r2Form, bucketName: e.target.value });
                            }}
                            placeholder="my-r2-bucket"
                            data-testid="input-r2-bucket"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="r2-key-prefix">Key Prefix Template (Optional)</Label>
                        <Input
                          id="r2-key-prefix"
                          value={r2Form.keyPrefixTemplate}
                          onChange={(e) => {
                            setR2Dirty(true);
                            setR2Form({ ...r2Form, keyPrefixTemplate: e.target.value });
                          }}
                          placeholder="uploads/{tenantId}/"
                          data-testid="input-r2-key-prefix"
                        />
                        <p className="text-xs text-muted-foreground">
                          Use {"{tenantId}"} as a placeholder for tenant isolation
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="r2-public-url">Public Access URL</Label>
                        <Input
                          id="r2-public-url"
                          value={r2Form.publicUrl}
                          onChange={(e) => {
                            setR2Dirty(true);
                            setR2Form({ ...r2Form, publicUrl: e.target.value });
                          }}
                          placeholder="https://pub-xxx.r2.dev or https://files.example.com"
                          data-testid="input-r2-public-url"
                        />
                        <p className="text-xs text-muted-foreground">
                          The public URL for accessing uploaded files. Use your R2 r2.dev subdomain or a custom domain.
                        </p>
                      </div>

                      <Separator />

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="r2-access-key">
                            Access Key ID
                            {r2Settings?.secretMasked?.accessKeyIdMasked && (
                              <span className="ml-2 text-muted-foreground font-normal text-xs">
                                ({r2Settings.secretMasked.accessKeyIdMasked})
                              </span>
                            )}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="r2-access-key"
                              type={showR2AccessKey ? "text" : "password"}
                              value={r2Form.accessKeyId}
                              onChange={(e) => {
                                setR2Dirty(true);
                                setR2Form({ ...r2Form, accessKeyId: e.target.value });
                              }}
                              placeholder={r2Settings?.secretConfigured ? "Enter new key to replace" : "Enter access key"}
                              data-testid="input-r2-access-key"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setShowR2AccessKey(!showR2AccessKey)}
                            >
                              {showR2AccessKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="r2-secret-key">
                            Secret Access Key
                            {r2Settings?.secretMasked?.secretAccessKeyMasked && (
                              <span className="ml-2 text-muted-foreground font-normal text-xs">
                                ({r2Settings.secretMasked.secretAccessKeyMasked})
                              </span>
                            )}
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="r2-secret-key"
                              type={showR2SecretKey ? "text" : "password"}
                              value={r2Form.secretAccessKey}
                              onChange={(e) => {
                                setR2Dirty(true);
                                setR2Form({ ...r2Form, secretAccessKey: e.target.value });
                              }}
                              placeholder={r2Settings?.secretConfigured ? "Enter new key to replace" : "Enter secret key"}
                              data-testid="input-r2-secret-key"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setShowR2SecretKey(!showR2SecretKey)}
                            >
                              {showR2SecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Generate API tokens in Cloudflare Dashboard &gt; R2 &gt; Manage R2 API Tokens
                          </p>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 flex-wrap pt-2">
                        <Button
                          variant="outline"
                          onClick={() => testR2Mutation.mutate()}
                          disabled={testR2Mutation.isPending || r2Settings?.status !== "configured"}
                          data-testid="button-test-r2"
                        >
                          {testR2Mutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <TestTube className="h-4 w-4 mr-2" />
                          )}
                          Test Connection
                        </Button>
                        <Button
                          onClick={() => {
                            const data: any = {};
                            if (r2Form.bucketName) data.bucketName = r2Form.bucketName;
                            if (r2Form.accountId) data.accountId = r2Form.accountId;
                            if (r2Form.keyPrefixTemplate) data.keyPrefixTemplate = r2Form.keyPrefixTemplate;
                            if (r2Form.publicUrl) data.publicUrl = r2Form.publicUrl;
                            if (r2Form.accessKeyId) data.accessKeyId = r2Form.accessKeyId;
                            if (r2Form.secretAccessKey) data.secretAccessKey = r2Form.secretAccessKey;
                            saveR2Mutation.mutate(data);
                            setR2Dirty(false);
                          }}
                          disabled={saveR2Mutation.isPending}
                          data-testid="button-save-r2"
                        >
                          {saveR2Mutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save R2 Settings
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Stripe Configuration */}
              <Card id="section-stripe">
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
                    <div id="section-google-sso" className="border rounded-lg p-4 space-y-4">
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

          <TabsContent value="ai-integration">
            <AIIntegrationTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
