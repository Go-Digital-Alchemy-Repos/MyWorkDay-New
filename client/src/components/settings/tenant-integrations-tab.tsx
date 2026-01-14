import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Mail, HardDrive, Check, X, Lock, Save, Loader2, TestTube, Eye, EyeOff } from "lucide-react";

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
  return (
    <Badge variant="secondary">
      Not Configured
    </Badge>
  );
}

export function TenantIntegrationsTab() {
  const { toast } = useToast();
  
  const [mailgunData, setMailgunData] = useState<MailgunConfig>({});
  const [s3Data, setS3Data] = useState<S3Config>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);
  const [mailgunInitialized, setMailgunInitialized] = useState(false);
  const [s3Initialized, setS3Initialized] = useState(false);

  const { data: integrations, isLoading } = useQuery<{ integrations: IntegrationSummary[] }>({
    queryKey: ["/api/v1/tenant/integrations"],
  });

  const { data: mailgunIntegration } = useQuery<any>({
    queryKey: ["/api/v1/tenant/integrations", "mailgun"],
    queryFn: async () => {
      const res = await fetch("/api/v1/tenant/integrations/mailgun", { credentials: "include" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch Mailgun integration");
      }
      return res.json();
    },
  });

  const { data: s3Integration } = useQuery<any>({
    queryKey: ["/api/v1/tenant/integrations", "s3"],
    queryFn: async () => {
      const res = await fetch("/api/v1/tenant/integrations/s3", { credentials: "include" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to fetch S3 integration");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (mailgunIntegration?.publicConfig && !mailgunInitialized) {
      setMailgunData({
        domain: mailgunIntegration.publicConfig.domain || "",
        fromEmail: mailgunIntegration.publicConfig.fromEmail || "",
        replyTo: mailgunIntegration.publicConfig.replyTo || "",
      });
      setMailgunInitialized(true);
    }
  }, [mailgunIntegration, mailgunInitialized]);

  useEffect(() => {
    if (s3Integration?.publicConfig && !s3Initialized) {
      setS3Data({
        bucketName: s3Integration.publicConfig.bucketName || "",
        region: s3Integration.publicConfig.region || "",
        keyPrefixTemplate: s3Integration.publicConfig.keyPrefixTemplate || "",
      });
      setS3Initialized(true);
    }
  }, [s3Integration, s3Initialized]);

  const saveMailgunMutation = useMutation({
    mutationFn: async (data: MailgunConfig) => {
      return apiRequest("PUT", "/api/v1/tenant/integrations/mailgun", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations", "mailgun"] });
      toast({ title: "Mailgun configuration saved" });
      setMailgunData(prev => ({ ...prev, apiKey: "" }));
    },
    onError: (error: any) => {
      const message = error?.error?.message || "Failed to save Mailgun configuration";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/tenant/integrations/mailgun/test");
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "Mailgun test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
    },
    onError: () => {
      toast({ title: "Failed to test Mailgun", variant: "destructive" });
    },
  });

  const saveS3Mutation = useMutation({
    mutationFn: async (data: S3Config) => {
      return apiRequest("PUT", "/api/v1/tenant/integrations/s3", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations", "s3"] });
      toast({ title: "S3 configuration saved" });
      setS3Data(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
    },
    onError: (error: any) => {
      const message = error?.error?.message || "Failed to save S3 configuration";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testS3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/tenant/integrations/s3/test");
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "S3 test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
    },
    onError: () => {
      toast({ title: "Failed to test S3", variant: "destructive" });
    },
  });

  const handleSaveMailgun = (e: React.FormEvent) => {
    e.preventDefault();
    saveMailgunMutation.mutate(mailgunData);
  };

  const handleSaveS3 = (e: React.FormEvent) => {
    e.preventDefault();
    saveS3Mutation.mutate(s3Data);
  };

  const getIntegrationStatus = (provider: string): IntegrationStatus => {
    const integration = integrations?.integrations?.find(i => i.provider === provider);
    return integration?.status || "not_configured";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Mailgun Email Service</CardTitle>
            </div>
            <StatusBadge status={getIntegrationStatus("mailgun")} />
          </div>
          <CardDescription>
            Configure your own Mailgun account for sending emails from your tenant
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveMailgun} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mailgun-domain">Domain</Label>
                <Input
                  id="mailgun-domain"
                  placeholder="mg.yourdomain.com"
                  value={mailgunData.domain || ""}
                  onChange={(e) => setMailgunData(prev => ({ ...prev, domain: e.target.value }))}
                  data-testid="input-mailgun-domain"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-from">From Email</Label>
                <Input
                  id="mailgun-from"
                  type="email"
                  placeholder="noreply@yourdomain.com"
                  value={mailgunData.fromEmail || ""}
                  onChange={(e) => setMailgunData(prev => ({ ...prev, fromEmail: e.target.value }))}
                  data-testid="input-mailgun-from"
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mailgun-reply">Reply-To Email</Label>
                <Input
                  id="mailgun-reply"
                  type="email"
                  placeholder="support@yourdomain.com"
                  value={mailgunData.replyTo || ""}
                  onChange={(e) => setMailgunData(prev => ({ ...prev, replyTo: e.target.value }))}
                  data-testid="input-mailgun-reply"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mailgun-api-key">
                  API Key
                  {mailgunIntegration?.secretConfigured && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 inline mr-1" />
                      Configured
                    </span>
                  )}
                </Label>
                <div className="relative">
                  <Input
                    id="mailgun-api-key"
                    type={showApiKey ? "text" : "password"}
                    placeholder={mailgunIntegration?.secretConfigured ? "••••••••" : "key-xxx..."}
                    value={mailgunData.apiKey || ""}
                    onChange={(e) => setMailgunData(prev => ({ ...prev, apiKey: e.target.value }))}
                    data-testid="input-mailgun-api-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Leave blank to keep existing key</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => testMailgunMutation.mutate()}
                disabled={testMailgunMutation.isPending || getIntegrationStatus("mailgun") === "not_configured"}
                data-testid="button-test-mailgun"
              >
                {testMailgunMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test
                  </>
                )}
              </Button>
              <Button
                type="submit"
                disabled={saveMailgunMutation.isPending}
                data-testid="button-save-mailgun"
              >
                {saveMailgunMutation.isPending ? (
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">S3 Storage</CardTitle>
            </div>
            <StatusBadge status={getIntegrationStatus("s3")} />
          </div>
          <CardDescription>
            Configure your own AWS S3 bucket for file storage
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveS3} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-bucket">Bucket Name</Label>
                <Input
                  id="s3-bucket"
                  placeholder="my-company-files"
                  value={s3Data.bucketName || ""}
                  onChange={(e) => setS3Data(prev => ({ ...prev, bucketName: e.target.value }))}
                  data-testid="input-s3-bucket"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-region">Region</Label>
                <Input
                  id="s3-region"
                  placeholder="us-east-1"
                  value={s3Data.region || ""}
                  onChange={(e) => setS3Data(prev => ({ ...prev, region: e.target.value }))}
                  data-testid="input-s3-region"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s3-prefix">Key Prefix Template</Label>
              <Input
                id="s3-prefix"
                placeholder="tenants/{tenantId}/"
                value={s3Data.keyPrefixTemplate || ""}
                onChange={(e) => setS3Data(prev => ({ ...prev, keyPrefixTemplate: e.target.value }))}
                data-testid="input-s3-prefix"
              />
              <p className="text-xs text-muted-foreground">Path prefix for all uploaded files</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="s3-access-key">
                  Access Key ID
                  {s3Integration?.secretConfigured && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      <Lock className="h-3 w-3 inline mr-1" />
                      Configured
                    </span>
                  )}
                </Label>
                <Input
                  id="s3-access-key"
                  placeholder={s3Integration?.secretConfigured ? "••••••••" : "AKIA..."}
                  value={s3Data.accessKeyId || ""}
                  onChange={(e) => setS3Data(prev => ({ ...prev, accessKeyId: e.target.value }))}
                  data-testid="input-s3-access-key"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="s3-secret-key">Secret Access Key</Label>
                <div className="relative">
                  <Input
                    id="s3-secret-key"
                    type={showSecretKey ? "text" : "password"}
                    placeholder={s3Integration?.secretConfigured ? "••••••••" : "Your secret key..."}
                    value={s3Data.secretAccessKey || ""}
                    onChange={(e) => setS3Data(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                    data-testid="input-s3-secret-key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowSecretKey(!showSecretKey)}
                  >
                    {showSecretKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Leave blank to keep existing credentials</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => testS3Mutation.mutate()}
                disabled={testS3Mutation.isPending || getIntegrationStatus("s3") === "not_configured"}
                data-testid="button-test-s3"
              >
                {testS3Mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <TestTube className="h-4 w-4 mr-2" />
                    Test
                  </>
                )}
              </Button>
              <Button
                type="submit"
                disabled={saveS3Mutation.isPending}
                data-testid="button-save-s3"
              >
                {saveS3Mutation.isPending ? (
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
        </CardContent>
      </Card>
    </div>
  );
}
