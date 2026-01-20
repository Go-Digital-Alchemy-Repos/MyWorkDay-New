import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Building2, Save, Loader2, Calendar, CheckCircle2, Copy, Check } from "lucide-react";

function TenantIdCopy({ tenantId }: { tenantId?: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    if (!tenantId) return;
    try {
      await navigator.clipboard.writeText(tenantId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers or non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = tenantId;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        console.error("Failed to copy tenant ID");
      }
      document.body.removeChild(textArea);
    }
  };

  if (!tenantId) {
    return <div className="text-sm text-muted-foreground">-</div>;
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <code 
          className="flex-1 px-3 py-2 bg-muted rounded-md text-sm font-mono truncate"
          data-testid="text-tenant-id"
        >
          {tenantId}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={copyToClipboard}
          data-testid="button-copy-tenant-id"
        >
          {copied ? (
            <><Check className="h-4 w-4 mr-1" /> Copied</>
          ) : (
            <><Copy className="h-4 w-4 mr-1" /> Copy</>
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Use this ID when contacting support or integrating with external services.
      </p>
    </div>
  );
}

interface TenantInfo {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
    onboardedAt: string | null;
    ownerUserId: string | null;
  };
  tenantSettings: {
    displayName?: string;
    supportEmail?: string;
  } | null;
}

export function ProfileTab() {
  const [formData, setFormData] = useState({
    displayName: "",
    supportEmail: "",
  });
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();

  const { data, isLoading, error } = useQuery<TenantInfo>({
    queryKey: ["/api/v1/tenant/me"],
  });

  useEffect(() => {
    if (data && !isInitialized) {
      setFormData({
        displayName: data.tenantSettings?.displayName || data.tenant.name || "",
        supportEmail: data.tenantSettings?.supportEmail || "",
      });
      setIsInitialized(true);
    }
  }, [data, isInitialized]);

  const saveMutation = useMutation({
    mutationFn: async (settings: { displayName?: string; supportEmail?: string }) => {
      return apiRequest("PATCH", "/api/v1/tenant/settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/settings"] });
      toast({ title: "Profile settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "active": return "default";
      case "suspended": return "secondary";
      case "inactive": return "outline";
      default: return "secondary";
    }
  };

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
          <p className="text-center text-muted-foreground">Failed to load profile settings.</p>
        </CardContent>
      </Card>
    );
  }

  const tenant = data?.tenant;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Organization Profile</CardTitle>
          </div>
          <CardDescription>
            Basic information about your organization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Organization Name</Label>
              <Input
                id="displayName"
                placeholder="Your Organization"
                value={formData.displayName}
                onChange={(e) => handleChange("displayName", e.target.value)}
                data-testid="input-org-display-name"
              />
              <p className="text-xs text-muted-foreground">Shown in navigation and emails</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="supportEmail">Support Email</Label>
              <Input
                id="supportEmail"
                type="email"
                placeholder="support@yourcompany.com"
                value={formData.supportEmail}
                onChange={(e) => handleChange("supportEmail", e.target.value)}
                data-testid="input-support-email"
              />
              <p className="text-xs text-muted-foreground">Contact email for support inquiries</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Account Status</CardTitle>
          <CardDescription>
            Read-only information about your tenant account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2">
                <Badge variant={getStatusBadgeVariant(tenant?.status || "inactive")}>
                  {tenant?.status || "Unknown"}
                </Badge>
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label className="text-muted-foreground">Organization ID</Label>
              <TenantIdCopy tenantId={tenant?.id} />
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Slug</Label>
              <div className="text-sm font-mono">
                {tenant?.slug || "-"}
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label className="text-muted-foreground text-xs">Onboarded At</Label>
                <div className="text-sm font-medium">
                  {tenant?.onboardedAt 
                    ? new Date(tenant.onboardedAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : "Not yet onboarded"
                  }
                </div>
              </div>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label className="text-muted-foreground text-xs">Account Type</Label>
                <div className="text-sm font-medium">
                  {tenant?.status === "active" ? "Active Tenant" : "Pending Setup"}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          className="min-w-[140px]"
          data-testid="button-save-profile"
        >
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
