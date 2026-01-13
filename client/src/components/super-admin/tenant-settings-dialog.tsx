import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Palette, HardDrive, Save, Loader2, TestTube, Eye, EyeOff, Mail, Lock, Check, X, ImageIcon, Type } from "lucide-react";
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

interface IntegrationSummary {
  provider: string;
  status: IntegrationStatus;
  secretConfigured: boolean;
  lastTestedAt: string | null;
}

interface MailgunConfig {
  domain?: string;
  fromEmail?: string;
  replyTo?: string;
  apiKey?: string;
}

interface S3Config {
  bucketName?: string;
  region?: string;
  keyPrefixTemplate?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

function StatusBadge({ status }: { status: IntegrationStatus }) {
  if (status === "configured") {
    return (
      <Badge variant="default" className="bg-green-600">
        <Check className="h-3 w-3 mr-1" />
        Configured
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge variant="destructive">
        <X className="h-3 w-3 mr-1" />
        Error
      </Badge>
    );
  }
  return <Badge variant="secondary">Not Configured</Badge>;
}

interface TenantSettingsDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenantSettingsDialog({ tenant, open, onOpenChange }: TenantSettingsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("branding");
  const [brandingData, setBrandingData] = useState<TenantSettings>({});
  const [mailgunData, setMailgunData] = useState<MailgunConfig>({});
  const [s3Data, setS3Data] = useState<S3Config>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  const { data: settingsResponse, isLoading: settingsLoading } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open,
  });

  const { data: integrationsResponse } = useQuery<{ integrations: IntegrationSummary[] }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "integrations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/integrations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "integrations",
  });

  const { data: mailgunIntegration } = useQuery<any>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "integrations", "mailgun"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/integrations/mailgun`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "integrations",
  });

  const { data: s3Integration } = useQuery<any>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "integrations", "s3"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/integrations/s3`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "integrations",
  });

  useEffect(() => {
    if (settingsResponse?.tenantSettings) {
      setBrandingData(settingsResponse.tenantSettings);
    }
  }, [settingsResponse]);

  useEffect(() => {
    if (mailgunIntegration?.publicConfig) {
      setMailgunData({
        domain: mailgunIntegration.publicConfig.domain || "",
        fromEmail: mailgunIntegration.publicConfig.fromEmail || "",
        replyTo: mailgunIntegration.publicConfig.replyTo || "",
      });
    }
  }, [mailgunIntegration]);

  useEffect(() => {
    if (s3Integration?.publicConfig) {
      setS3Data({
        bucketName: s3Integration.publicConfig.bucketName || "",
        region: s3Integration.publicConfig.region || "",
        keyPrefixTemplate: s3Integration.publicConfig.keyPrefixTemplate || "",
      });
    }
  }, [s3Integration]);

  useEffect(() => {
    if (!open) {
      setBrandingData({});
      setMailgunData({});
      setS3Data({});
      setShowApiKey(false);
      setShowSecretKey(false);
    }
  }, [open]);

  const saveBrandingMutation = useMutation({
    mutationFn: async (settings: Partial<TenantSettings>) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${tenant?.id}/settings`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Branding settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const saveMailgunMutation = useMutation({
    mutationFn: async (data: MailgunConfig) => {
      return apiRequest("PUT", `/api/v1/super/tenants/${tenant?.id}/integrations/mailgun`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "integrations"] });
      toast({ title: "Mailgun configuration saved" });
      setMailgunData(prev => ({ ...prev, apiKey: "" }));
    },
    onError: () => {
      toast({ title: "Failed to save Mailgun configuration", variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/integrations/mailgun/test`);
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "Mailgun test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test Mailgun", variant: "destructive" });
    },
  });

  const saveS3Mutation = useMutation({
    mutationFn: async (data: S3Config) => {
      return apiRequest("PUT", `/api/v1/super/tenants/${tenant?.id}/integrations/s3`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "integrations"] });
      toast({ title: "S3 configuration saved" });
      setS3Data(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
    },
    onError: () => {
      toast({ title: "Failed to save S3 configuration", variant: "destructive" });
    },
  });

  const testS3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/integrations/s3/test`);
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "S3 test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test S3", variant: "destructive" });
    },
  });

  const handleBrandingChange = (field: keyof TenantSettings, value: string | boolean | null) => {
    setBrandingData((prev) => ({ ...prev, [field]: value || null }));
  };

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    saveBrandingMutation.mutate(brandingData);
  };

  const handleSaveMailgun = (e: React.FormEvent) => {
    e.preventDefault();
    saveMailgunMutation.mutate(mailgunData);
  };

  const handleSaveS3 = (e: React.FormEvent) => {
    e.preventDefault();
    saveS3Mutation.mutate(s3Data);
  };

  const getIntegrationStatus = (provider: string): IntegrationStatus => {
    const integration = integrationsResponse?.integrations?.find(i => i.provider === provider);
    return integration?.status || "not_configured";
  };

  if (!tenant) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Tenant Settings: {tenant.name}
          </DialogTitle>
          <DialogDescription>
            Configure branding and integrations for this tenant
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="branding" className="flex items-center gap-2">
              <Palette className="h-4 w-4" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="integrations" className="flex items-center gap-2">
              <HardDrive className="h-4 w-4" />
              Integrations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="branding" className="mt-4 space-y-4">
            {settingsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <form onSubmit={handleSaveBranding} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Display Name</Label>
                    <Input
                      id="displayName"
                      value={brandingData.displayName || ""}
                      onChange={(e) => handleBrandingChange("displayName", e.target.value)}
                      data-testid="input-tenant-display-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="appName">App Name</Label>
                    <Input
                      id="appName"
                      value={brandingData.appName || ""}
                      onChange={(e) => handleBrandingChange("appName", e.target.value)}
                      data-testid="input-tenant-app-name"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="logoUrl">Logo URL</Label>
                    <Input
                      id="logoUrl"
                      type="url"
                      value={brandingData.logoUrl || ""}
                      onChange={(e) => handleBrandingChange("logoUrl", e.target.value)}
                      data-testid="input-tenant-logo-url"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="faviconUrl">Favicon URL</Label>
                    <Input
                      id="faviconUrl"
                      type="url"
                      value={brandingData.faviconUrl || ""}
                      onChange={(e) => handleBrandingChange("faviconUrl", e.target.value)}
                      data-testid="input-tenant-favicon-url"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        placeholder="#3b82f6"
                        value={brandingData.primaryColor || ""}
                        onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="color"
                        value={brandingData.primaryColor || "#3b82f6"}
                        onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                        className="w-10 p-1 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="secondaryColor">Secondary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="secondaryColor"
                        placeholder="#64748b"
                        value={brandingData.secondaryColor || ""}
                        onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="color"
                        value={brandingData.secondaryColor || "#64748b"}
                        onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                        className="w-10 p-1 h-9"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accentColor">Accent Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="accentColor"
                        placeholder="#10b981"
                        value={brandingData.accentColor || ""}
                        onChange={(e) => handleBrandingChange("accentColor", e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        type="color"
                        value={brandingData.accentColor || "#10b981"}
                        onChange={(e) => handleBrandingChange("accentColor", e.target.value)}
                        className="w-10 p-1 h-9"
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={brandingData.supportEmail || ""}
                    onChange={(e) => handleBrandingChange("supportEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loginMessage">Login Message</Label>
                  <Textarea
                    id="loginMessage"
                    value={brandingData.loginMessage || ""}
                    onChange={(e) => handleBrandingChange("loginMessage", e.target.value)}
                    className="min-h-[60px] resize-none"
                  />
                </div>
                <div className="flex items-center justify-between border-t pt-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="whiteLabelEnabled"
                        checked={brandingData.whiteLabelEnabled || false}
                        onCheckedChange={(checked) => handleBrandingChange("whiteLabelEnabled", checked)}
                      />
                      <Label htmlFor="whiteLabelEnabled" className="text-sm">White Label</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        id="hideVendorBranding"
                        checked={brandingData.hideVendorBranding || false}
                        onCheckedChange={(checked) => handleBrandingChange("hideVendorBranding", checked)}
                      />
                      <Label htmlFor="hideVendorBranding" className="text-sm">Hide Vendor</Label>
                    </div>
                  </div>
                  <Button type="submit" disabled={saveBrandingMutation.isPending} data-testid="button-save-tenant-branding">
                    {saveBrandingMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </>
                    )}
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>

          <TabsContent value="integrations" className="mt-4 space-y-4">
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">Mailgun</CardTitle>
                  </div>
                  <StatusBadge status={getIntegrationStatus("mailgun")} />
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveMailgun} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mg-domain" className="text-xs">Domain</Label>
                      <Input
                        id="mg-domain"
                        placeholder="mg.example.com"
                        value={mailgunData.domain || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, domain: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mg-from" className="text-xs">From Email</Label>
                      <Input
                        id="mg-from"
                        type="email"
                        placeholder="noreply@example.com"
                        value={mailgunData.fromEmail || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, fromEmail: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mg-reply" className="text-xs">Reply-To</Label>
                      <Input
                        id="mg-reply"
                        type="email"
                        value={mailgunData.replyTo || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, replyTo: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mg-key" className="text-xs">
                        API Key
                        {mailgunIntegration?.secretConfigured && (
                          <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />
                        )}
                      </Label>
                      <div className="relative">
                        <Input
                          id="mg-key"
                          type={showApiKey ? "text" : "password"}
                          placeholder={mailgunIntegration?.secretConfigured ? "••••••••" : "key-xxx..."}
                          value={mailgunData.apiKey || ""}
                          onChange={(e) => setMailgunData(prev => ({ ...prev, apiKey: e.target.value }))}
                          className="h-8 pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-8 w-8"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testMailgunMutation.mutate()}
                      disabled={testMailgunMutation.isPending || getIntegrationStatus("mailgun") === "not_configured"}
                    >
                      {testMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                      Test
                    </Button>
                    <Button type="submit" size="sm" disabled={saveMailgunMutation.isPending}>
                      {saveMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">S3 Storage</CardTitle>
                  </div>
                  <StatusBadge status={getIntegrationStatus("s3")} />
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveS3} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="s3-bucket" className="text-xs">Bucket Name</Label>
                      <Input
                        id="s3-bucket"
                        placeholder="my-bucket"
                        value={s3Data.bucketName || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, bucketName: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="s3-region" className="text-xs">Region</Label>
                      <Input
                        id="s3-region"
                        placeholder="us-east-1"
                        value={s3Data.region || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, region: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="s3-prefix" className="text-xs">Key Prefix</Label>
                    <Input
                      id="s3-prefix"
                      placeholder="tenants/{tenantId}/"
                      value={s3Data.keyPrefixTemplate || ""}
                      onChange={(e) => setS3Data(prev => ({ ...prev, keyPrefixTemplate: e.target.value }))}
                      className="h-8"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="s3-access" className="text-xs">
                        Access Key ID
                        {s3Integration?.secretConfigured && (
                          <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />
                        )}
                      </Label>
                      <Input
                        id="s3-access"
                        placeholder={s3Integration?.secretConfigured ? "••••••••" : "AKIA..."}
                        value={s3Data.accessKeyId || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, accessKeyId: e.target.value }))}
                        className="h-8"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="s3-secret" className="text-xs">Secret Access Key</Label>
                      <div className="relative">
                        <Input
                          id="s3-secret"
                          type={showSecretKey ? "text" : "password"}
                          placeholder={s3Integration?.secretConfigured ? "••••••••" : "Secret..."}
                          value={s3Data.secretAccessKey || ""}
                          onChange={(e) => setS3Data(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                          className="h-8 pr-8"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-8 w-8"
                          onClick={() => setShowSecretKey(!showSecretKey)}
                        >
                          {showSecretKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testS3Mutation.mutate()}
                      disabled={testS3Mutation.isPending || getIntegrationStatus("s3") === "not_configured"}
                    >
                      {testS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                      Test
                    </Button>
                    <Button type="submit" size="sm" disabled={saveS3Mutation.isPending}>
                      {saveS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
