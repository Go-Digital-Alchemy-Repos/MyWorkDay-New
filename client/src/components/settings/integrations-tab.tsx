import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Mail, Cloud, Save, Loader2, CheckCircle2, XCircle, 
  AlertTriangle, TestTube, Eye, EyeOff, RefreshCw, Webhook, Send
} from "lucide-react";
import { SiSlack, SiZapier, SiGooglecalendar } from "react-icons/si";

interface SecretMaskedInfo {
  apiKeyMasked?: string | null;
  accessKeyIdMasked?: string | null;
  secretAccessKeyMasked?: string | null;
}

interface Integration {
  provider: string;
  status: "not_configured" | "configured" | "error";
  publicConfig: Record<string, any> | null;
  secretConfigured: boolean;
  lastTestedAt: string | null;
  secretMasked?: SecretMaskedInfo;
}

interface IntegrationsListResponse {
  integrations: Integration[];
}

export function IntegrationsTab() {
  const { toast } = useToast();
  const [showMailgunKey, setShowMailgunKey] = useState(false);
  const [showS3Keys, setShowS3Keys] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState("");
  const [showTestEmailDialog, setShowTestEmailDialog] = useState(false);

  const [mailgunForm, setMailgunForm] = useState({
    domain: "",
    fromEmail: "",
    replyTo: "",
    apiKey: "",
  });

  const [s3Form, setS3Form] = useState({
    bucketName: "",
    region: "",
    keyPrefixTemplate: "",
    accessKeyId: "",
    secretAccessKey: "",
  });

  const { data, isLoading, error, refetch } = useQuery<IntegrationsListResponse>({
    queryKey: ["/api/v1/tenant/integrations"],
  });

  const mailgunIntegration = data?.integrations?.find(i => i.provider === "mailgun");
  const s3Integration = data?.integrations?.find(i => i.provider === "s3");

  useEffect(() => {
    if (mailgunIntegration?.publicConfig) {
      setMailgunForm({
        domain: mailgunIntegration.publicConfig.domain || "",
        fromEmail: mailgunIntegration.publicConfig.fromEmail || "",
        replyTo: mailgunIntegration.publicConfig.replyTo || "",
        apiKey: "",
      });
    }
    if (s3Integration?.publicConfig) {
      setS3Form({
        bucketName: s3Integration.publicConfig.bucketName || "",
        region: s3Integration.publicConfig.region || "",
        keyPrefixTemplate: s3Integration.publicConfig.keyPrefixTemplate || "",
        accessKeyId: "",
        secretAccessKey: "",
      });
    }
  }, [mailgunIntegration, s3Integration]);

  const saveMailgunMutation = useMutation({
    mutationFn: async (formData: typeof mailgunForm) => {
      const payload: any = {
        domain: formData.domain || undefined,
        fromEmail: formData.fromEmail || undefined,
        replyTo: formData.replyTo || undefined,
      };
      if (formData.apiKey) {
        payload.apiKey = formData.apiKey;
      }
      return apiRequest("PUT", "/api/v1/tenant/integrations/mailgun", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      setMailgunForm(prev => ({ ...prev, apiKey: "" }));
      toast({ title: "Mailgun settings saved successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to save Mailgun settings";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/tenant/integrations/mailgun/test", {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      if (response.success) {
        toast({ title: "Mailgun test successful" });
      } else {
        toast({ title: response.message || "Mailgun test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test Mailgun", variant: "destructive" });
    },
  });

  const sendTestEmailMutation = useMutation({
    mutationFn: async (toEmail: string) => {
      return apiRequest("POST", "/api/v1/tenant/integrations/mailgun/send-test-email", { toEmail });
    },
    onSuccess: () => {
      setShowTestEmailDialog(false);
      setTestEmailAddress("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      toast({ title: "Test email sent successfully", description: "Check your inbox for the test email." });
    },
    onError: (err: any) => {
      const errorMessage = err?.data?.error?.message || err?.message || "Unknown error";
      toast({ 
        title: "Failed to send test email", 
        description: errorMessage, 
        variant: "destructive" 
      });
    },
  });

  const saveS3Mutation = useMutation({
    mutationFn: async (formData: typeof s3Form) => {
      const payload: any = {
        bucketName: formData.bucketName || undefined,
        region: formData.region || undefined,
        keyPrefixTemplate: formData.keyPrefixTemplate || undefined,
      };
      if (formData.accessKeyId) {
        payload.accessKeyId = formData.accessKeyId;
      }
      if (formData.secretAccessKey) {
        payload.secretAccessKey = formData.secretAccessKey;
      }
      return apiRequest("PUT", "/api/v1/tenant/integrations/s3", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      setS3Form(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
      toast({ title: "S3 settings saved successfully" });
    },
    onError: (err: any) => {
      const message = err?.message || "Failed to save S3 settings";
      toast({ title: message, variant: "destructive" });
    },
  });

  const testS3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/v1/tenant/integrations/s3/test", {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/integrations"] });
      if (response.success) {
        toast({ title: "S3 test successful" });
      } else {
        toast({ title: response.message || "S3 test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test S3", variant: "destructive" });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "configured":
        return (
          <Badge variant="default" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Configured
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Error
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Not Configured
          </Badge>
        );
    }
  };

  const futureIntegrations = [
    {
      name: "Slack",
      description: "Get notifications in Slack channels",
      icon: SiSlack,
      status: "coming-soon",
    },
    {
      name: "Zapier",
      description: "Connect with 5,000+ apps",
      icon: SiZapier,
      status: "coming-soon",
    },
    {
      name: "Google Calendar",
      description: "Sync tasks with your calendar",
      icon: SiGooglecalendar,
      status: "coming-soon",
    },
    {
      name: "Webhooks",
      description: "Send events to external systems",
      icon: Webhook,
      status: "coming-soon",
    },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-muted-foreground mb-4">Failed to load integrations.</p>
            <Button variant="outline" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Mailgun Email Integration</CardTitle>
            </div>
            {getStatusBadge(mailgunIntegration?.status || "not_configured")}
          </div>
          <CardDescription>
            Configure Mailgun to send emails from your domain
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mailgun-domain">Domain</Label>
              <Input
                id="mailgun-domain"
                placeholder="mg.yourdomain.com"
                value={mailgunForm.domain}
                onChange={(e) => setMailgunForm({ ...mailgunForm, domain: e.target.value })}
                data-testid="input-mailgun-domain"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailgun-fromEmail">From Email</Label>
              <Input
                id="mailgun-fromEmail"
                type="email"
                placeholder="noreply@yourdomain.com"
                value={mailgunForm.fromEmail}
                onChange={(e) => setMailgunForm({ ...mailgunForm, fromEmail: e.target.value })}
                data-testid="input-mailgun-from-email"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mailgun-replyTo">Reply-To Email (Optional)</Label>
              <Input
                id="mailgun-replyTo"
                type="email"
                placeholder="support@yourdomain.com"
                value={mailgunForm.replyTo}
                onChange={(e) => setMailgunForm({ ...mailgunForm, replyTo: e.target.value })}
                data-testid="input-mailgun-reply-to"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mailgun-apiKey">
                API Key {mailgunIntegration?.secretMasked?.apiKeyMasked && (
                  <span className="text-muted-foreground font-normal">({mailgunIntegration.secretMasked.apiKeyMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="mailgun-apiKey"
                  type={showMailgunKey ? "text" : "password"}
                  placeholder={mailgunIntegration?.secretConfigured ? "Enter new key to replace" : "Enter API key"}
                  value={mailgunForm.apiKey}
                  onChange={(e) => setMailgunForm({ ...mailgunForm, apiKey: e.target.value })}
                  data-testid="input-mailgun-api-key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowMailgunKey(!showMailgunKey)}
                >
                  {showMailgunKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep existing key
              </p>
            </div>
          </div>

          {mailgunIntegration?.lastTestedAt && (
            <p className="text-xs text-muted-foreground">
              Last tested: {new Date(mailgunIntegration.lastTestedAt).toLocaleString()}
            </p>
          )}

          <div className="flex justify-end gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() => testMailgunMutation.mutate()}
              disabled={testMailgunMutation.isPending || mailgunIntegration?.status !== "configured"}
              data-testid="button-test-mailgun"
            >
              {testMailgunMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowTestEmailDialog(true)}
              disabled={mailgunIntegration?.status !== "configured"}
              data-testid="button-send-test-email"
            >
              <Send className="h-4 w-4 mr-2" />
              Send Test Email
            </Button>
            <Button
              type="button"
              onClick={() => saveMailgunMutation.mutate(mailgunForm)}
              disabled={saveMailgunMutation.isPending}
              data-testid="button-save-mailgun"
            >
              {saveMailgunMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Mailgun
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showTestEmailDialog} onOpenChange={setShowTestEmailDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email to verify your Mailgun configuration is working correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="test-email-address">Recipient Email Address</Label>
              <Input
                id="test-email-address"
                type="email"
                placeholder="you@example.com"
                value={testEmailAddress}
                onChange={(e) => setTestEmailAddress(e.target.value)}
                data-testid="input-test-email-address"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowTestEmailDialog(false);
                setTestEmailAddress("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => sendTestEmailMutation.mutate(testEmailAddress)}
              disabled={sendTestEmailMutation.isPending || !testEmailAddress || !testEmailAddress.includes("@")}
              data-testid="button-confirm-send-test-email"
            >
              {sendTestEmailMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">S3 Storage Integration</CardTitle>
            </div>
            {getStatusBadge(s3Integration?.status || "not_configured")}
          </div>
          <CardDescription>
            Configure S3-compatible storage for file uploads
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s3-bucket">Bucket Name</Label>
              <Input
                id="s3-bucket"
                placeholder="my-bucket"
                value={s3Form.bucketName}
                onChange={(e) => setS3Form({ ...s3Form, bucketName: e.target.value })}
                data-testid="input-s3-bucket"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s3-region">Region</Label>
              <Input
                id="s3-region"
                placeholder="us-east-1"
                value={s3Form.region}
                onChange={(e) => setS3Form({ ...s3Form, region: e.target.value })}
                data-testid="input-s3-region"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s3-prefix">Key Prefix Template</Label>
            <Input
              id="s3-prefix"
              placeholder="tenants/{tenantId}/"
              value={s3Form.keyPrefixTemplate}
              onChange={(e) => setS3Form({ ...s3Form, keyPrefixTemplate: e.target.value })}
              data-testid="input-s3-prefix"
            />
            <p className="text-xs text-muted-foreground">
              Prefix for all uploaded files. Use {"{tenantId}"} as placeholder.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="s3-accessKey">
                Access Key ID {s3Integration?.secretMasked?.accessKeyIdMasked && (
                  <span className="text-muted-foreground font-normal">({s3Integration.secretMasked.accessKeyIdMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="s3-accessKey"
                  type={showS3Keys ? "text" : "password"}
                  placeholder={s3Integration?.secretConfigured ? "Enter new key to replace" : "Enter access key"}
                  value={s3Form.accessKeyId}
                  onChange={(e) => setS3Form({ ...s3Form, accessKeyId: e.target.value })}
                  data-testid="input-s3-access-key"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="s3-secretKey">
                Secret Access Key {s3Integration?.secretMasked?.secretAccessKeyMasked && (
                  <span className="text-muted-foreground font-normal">({s3Integration.secretMasked.secretAccessKeyMasked})</span>
                )}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="s3-secretKey"
                  type={showS3Keys ? "text" : "password"}
                  placeholder={s3Integration?.secretConfigured ? "Enter new key to replace" : "Enter secret key"}
                  value={s3Form.secretAccessKey}
                  onChange={(e) => setS3Form({ ...s3Form, secretAccessKey: e.target.value })}
                  data-testid="input-s3-secret-key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowS3Keys(!showS3Keys)}
                >
                  {showS3Keys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Leave blank to keep existing credentials
              </p>
            </div>
          </div>

          {s3Integration?.lastTestedAt && (
            <p className="text-xs text-muted-foreground">
              Last tested: {new Date(s3Integration.lastTestedAt).toLocaleString()}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testS3Mutation.mutate()}
              disabled={testS3Mutation.isPending || s3Integration?.status !== "configured"}
              data-testid="button-test-s3"
            >
              {testS3Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={() => saveS3Mutation.mutate(s3Form)}
              disabled={saveS3Mutation.isPending}
              data-testid="button-save-s3"
            >
              {saveS3Mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save S3
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Coming Soon</CardTitle>
          <CardDescription>Future integrations we're working on</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {futureIntegrations.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-4 p-4 rounded-lg border border-dashed opacity-60"
              >
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <integration.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <div className="font-medium">{integration.name}</div>
                  <div className="text-sm text-muted-foreground">{integration.description}</div>
                </div>
                <Badge variant="outline">Coming Soon</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
