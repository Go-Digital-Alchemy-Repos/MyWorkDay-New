import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Palette, ImageIcon, Type, Save, Loader2 } from "lucide-react";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { useAuth } from "@/lib/auth";

interface SystemSettings {
  id: number;
  defaultAppName: string | null;
  defaultLogoUrl: string | null;
  defaultIconUrl: string | null;
  defaultFaviconUrl: string | null;
}

interface TenantSettings {
  displayName?: string;
  appName?: string | null;
  logoUrl?: string | null;
  iconUrl?: string | null;
  faviconUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  loginMessage?: string | null;
  supportEmail?: string | null;
  whiteLabelEnabled?: boolean;
  hideVendorBranding?: boolean;
}

export function BrandingTab() {
  const [formData, setFormData] = useState<TenantSettings>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data, isLoading, error } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/tenant/settings"],
  });

  const { data: systemSettings } = useQuery<SystemSettings>({
    queryKey: ["/api/v1/super/system-settings"],
    enabled: user?.role === "super_user" || user?.role === "admin",
  });

  useEffect(() => {
    if (data?.tenantSettings && !isInitialized) {
      setFormData(data.tenantSettings);
      setIsInitialized(true);
    }
  }, [data, isInitialized]);

  const saveMutation = useMutation({
    mutationFn: async (settings: Partial<TenantSettings>) => {
      return apiRequest("PATCH", "/api/v1/tenant/settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/settings"] });
      toast({ title: "Branding settings saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  const handleChange = (field: keyof TenantSettings, value: string | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value || null }));
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
          <p className="text-center text-muted-foreground">Failed to load branding settings.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Type className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Application Identity</CardTitle>
          </div>
          <CardDescription>
            Customize how your workspace appears to users
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                placeholder="Your Organization"
                value={formData.displayName || ""}
                onChange={(e) => handleChange("displayName", e.target.value)}
                data-testid="input-display-name"
              />
              <p className="text-xs text-muted-foreground">Shown in navigation and emails</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appName">App Name</Label>
              <Input
                id="appName"
                placeholder="MyWorkDay"
                value={formData.appName || ""}
                onChange={(e) => handleChange("appName", e.target.value)}
                data-testid="input-app-name"
              />
              <p className="text-xs text-muted-foreground">Override the default application name</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="supportEmail">Support Email</Label>
            <Input
              id="supportEmail"
              type="email"
              placeholder="support@yourcompany.com"
              value={formData.supportEmail || ""}
              onChange={(e) => handleChange("supportEmail", e.target.value)}
              data-testid="input-support-email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="loginMessage">Login Page Message</Label>
            <Textarea
              id="loginMessage"
              placeholder="Welcome to our project management platform..."
              value={formData.loginMessage || ""}
              onChange={(e) => handleChange("loginMessage", e.target.value)}
              className="min-h-[80px] resize-none"
              data-testid="textarea-login-message"
            />
            <p className="text-xs text-muted-foreground">Custom message shown on the login page</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Brand Assets</CardTitle>
          </div>
          <CardDescription>
            Upload your organization's logo, icon, and favicon
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-3">
            <S3Dropzone
              category="tenant-branding-logo"
              label="Logo"
              description="Full logo for headers (max 2MB, 200x50px PNG or SVG)"
              valueUrl={formData.logoUrl}
              inheritedUrl={systemSettings?.defaultLogoUrl}
              onUploaded={(fileUrl) => handleChange("logoUrl", fileUrl)}
              onRemoved={() => handleChange("logoUrl", null)}
            />
            <S3Dropzone
              category="tenant-branding-icon"
              label="Icon"
              description="Square icon for PWA (max 512KB, 192x192px)"
              valueUrl={formData.iconUrl}
              inheritedUrl={systemSettings?.defaultIconUrl}
              onUploaded={(fileUrl) => handleChange("iconUrl", fileUrl)}
              onRemoved={() => handleChange("iconUrl", null)}
            />
            <S3Dropzone
              category="tenant-branding-favicon"
              label="Favicon"
              description="Browser tab icon (max 512KB, 32x32px ICO or PNG)"
              valueUrl={formData.faviconUrl}
              inheritedUrl={systemSettings?.defaultFaviconUrl}
              onUploaded={(fileUrl) => handleChange("faviconUrl", fileUrl)}
              onRemoved={() => handleChange("faviconUrl", null)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Brand Colors</CardTitle>
          </div>
          <CardDescription>
            Customize the color scheme for your workspace
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="primaryColor">Primary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="primaryColor"
                  placeholder="#3b82f6"
                  value={formData.primaryColor || ""}
                  onChange={(e) => handleChange("primaryColor", e.target.value)}
                  className="flex-1"
                  data-testid="input-primary-color"
                />
                <Input
                  type="color"
                  value={formData.primaryColor || "#3b82f6"}
                  onChange={(e) => handleChange("primaryColor", e.target.value)}
                  className="w-12 p-1 h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondaryColor">Secondary Color</Label>
              <div className="flex gap-2">
                <Input
                  id="secondaryColor"
                  placeholder="#64748b"
                  value={formData.secondaryColor || ""}
                  onChange={(e) => handleChange("secondaryColor", e.target.value)}
                  className="flex-1"
                  data-testid="input-secondary-color"
                />
                <Input
                  type="color"
                  value={formData.secondaryColor || "#64748b"}
                  onChange={(e) => handleChange("secondaryColor", e.target.value)}
                  className="w-12 p-1 h-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex gap-2">
                <Input
                  id="accentColor"
                  placeholder="#10b981"
                  value={formData.accentColor || ""}
                  onChange={(e) => handleChange("accentColor", e.target.value)}
                  className="flex-1"
                  data-testid="input-accent-color"
                />
                <Input
                  type="color"
                  value={formData.accentColor || "#10b981"}
                  onChange={(e) => handleChange("accentColor", e.target.value)}
                  className="w-12 p-1 h-9"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">White Label Options</CardTitle>
          <CardDescription>
            Control branding visibility throughout the application
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enable White Label Mode</Label>
              <p className="text-xs text-muted-foreground">
                Apply custom branding throughout the application
              </p>
            </div>
            <Switch
              checked={formData.whiteLabelEnabled || false}
              onCheckedChange={(checked) => handleChange("whiteLabelEnabled", checked)}
              data-testid="switch-white-label"
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Hide Vendor Branding</Label>
              <p className="text-xs text-muted-foreground">
                Remove "Powered by MyWorkDay" text from the application
              </p>
            </div>
            <Switch
              checked={formData.hideVendorBranding || false}
              onCheckedChange={(checked) => handleChange("hideVendorBranding", checked)}
              data-testid="switch-hide-vendor"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={saveMutation.isPending}
          className="min-w-[140px]"
          data-testid="button-save-branding"
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
