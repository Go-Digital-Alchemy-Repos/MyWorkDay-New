import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Building2, Palette, Plug } from "lucide-react";
import { ProfileTab } from "@/components/settings/profile-tab";
import { BrandingTab } from "@/components/settings/branding-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";

export default function AccountPage() {
  const [location, setLocation] = useLocation();
  const { user, isLoading } = useAuth();

  const isAdmin = user?.role === "admin";
  const isSuperUser = user?.role === "super_user";

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin && !isSuperUser) {
    return <Redirect to="/" />;
  }

  const currentTab = location.includes("/account/") 
    ? location.split("/account/")[1] 
    : "profile";

  const handleTabChange = (value: string) => {
    setLocation(`/account/${value}`);
  };

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-5xl py-8 px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold mb-2">Account Settings</h1>
          <p className="text-muted-foreground">
            Manage your organization profile, branding, integrations, and team members
          </p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile" className="gap-2" data-testid="tab-profile">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="branding" className="gap-2" data-testid="tab-branding">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">White Label</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2" data-testid="tab-integrations">
              <Plug className="h-4 w-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="mt-6">
            <ProfileTab />
          </TabsContent>

          <TabsContent value="branding" className="mt-6">
            <BrandingTab />
          </TabsContent>

          <TabsContent value="integrations" className="mt-6">
            <IntegrationsTab />
          </TabsContent>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
