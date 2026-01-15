import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { User, Mail, Shield, Users, Save, Loader2, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

function getRoleLabel(role: string) {
  switch (role) {
    case "admin": return "Administrator";
    case "super_user": return "Super Admin";
    case "client": return "Client";
    default: return "Employee";
  }
}

function getRoleIcon(role: string) {
  switch (role) {
    case "admin":
    case "super_user":
      return <Shield className="h-4 w-4" />;
    case "client":
      return <Users className="h-4 w-4" />;
    default:
      return <User className="h-4 w-4" />;
  }
}

export default function UserProfilePage() {
  const { user, refetch } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string }) => {
      return apiRequest("PATCH", "/api/users/me", data);
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Profile updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update profile", variant: "destructive" });
    },
  });

  const updateAvatarMutation = useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      return apiRequest("PATCH", "/api/users/me", { avatarUrl });
    },
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
    },
    onError: () => {
      toast({ title: "Failed to update avatar", variant: "destructive" });
    },
  });

  const handleAvatarUploaded = (fileUrl: string) => {
    updateAvatarMutation.mutate(fileUrl);
    toast({ title: "Avatar uploaded successfully" });
  };

  const handleAvatarRemove = () => {
    updateAvatarMutation.mutate(null);
    toast({ title: "Avatar removed" });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  if (!user) {
    return null;
  }

  const initials = user.firstName && user.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <ScrollArea className="h-full">
      <div className="container max-w-3xl py-8 px-6">
        <div className="mb-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/")}
            className="mb-4 -ml-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-2xl font-semibold mb-2">My Profile</h1>
          <p className="text-muted-foreground">
            Manage your personal information and profile picture
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Profile Picture</CardTitle>
              <CardDescription>
                Upload a photo to personalize your account
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="flex-shrink-0">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>
                <div className="flex-1 w-full max-w-xs">
                  <S3Dropzone
                    category="user-avatar"
                    label="Profile Picture"
                    description="PNG, JPG, WebP or GIF. Max 2MB."
                    valueUrl={user.avatarUrl}
                    onUploaded={handleAvatarUploaded}
                    onRemoved={handleAvatarRemove}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Information</CardTitle>
                <CardDescription>
                  Your name and contact details
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={formData.firstName}
                      onChange={(e) => setFormData(prev => ({ ...prev, firstName: e.target.value }))}
                      placeholder="John"
                      data-testid="input-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={formData.lastName}
                      onChange={(e) => setFormData(prev => ({ ...prev, lastName: e.target.value }))}
                      placeholder="Doe"
                      data-testid="input-last-name"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Email Address</Label>
                  <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{user.email}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Contact your administrator to change your email address
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-muted-foreground">Role</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      {getRoleIcon(user.role)}
                      {getRoleLabel(user.role)}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  <Button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="min-w-[140px]"
                    data-testid="button-save-profile"
                  >
                    {updateProfileMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </div>
    </ScrollArea>
  );
}
