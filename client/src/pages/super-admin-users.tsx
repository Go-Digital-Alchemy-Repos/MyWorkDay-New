import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, Shield, Save, Mail, Plus, Link, Copy, MoreHorizontal, 
  UserCheck, UserX, Clock, AlertCircle, KeyRound, Eye, EyeOff, Trash2, Send
} from "lucide-react";
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
import { Settings } from "lucide-react";

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

interface IntegrationStatus {
  mailgun: boolean;
  s3: boolean;
  stripe: boolean;
  encryptionConfigured: boolean;
  ssoGoogle?: boolean;
  ssoGithub?: boolean;
}

interface InviteResponse {
  inviteUrl: string;
  emailSent?: boolean;
}

export default function SuperAdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [newAdminDrawerOpen, setNewAdminDrawerOpen] = useState(false);
  const [editAdminDrawerOpen, setEditAdminDrawerOpen] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<PlatformAdmin | null>(null);
  const [inviteLinkDialogOpen, setInviteLinkDialogOpen] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState<string | null>(null);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [adminToDeactivate, setAdminToDeactivate] = useState<PlatformAdmin | null>(null);
  const [adminToDelete, setAdminToDelete] = useState<PlatformAdmin | null>(null);
  
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

  const { data: platformAdmins = [], isLoading: adminsLoading, refetch: refetchAdmins } = useQuery<PlatformAdmin[]>({
    queryKey: ["/api/v1/super/admins"],
  });

  const { data: integrationStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/v1/super/integrations/status"],
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

  const deleteAdminMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/admins/${id}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/admins"] });
      toast({ title: "Platform admin deleted", description: data.message || "The admin has been permanently deleted." });
      setAdminToDelete(null);
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to delete admin", description: parsed.message, variant: "destructive" });
      setAdminToDelete(null);
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
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">User Manager</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Manage platform administrators with full system access
        </p>
      </div>

      <div className="flex-1 overflow-auto p-6">
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
                            <>
                              <DropdownMenuItem onClick={() => handleReactivateAdmin(admin)} data-testid={`button-reactivate-${admin.id}`}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Reactivate
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => setAdminToDelete(admin)}
                                className="text-destructive"
                                data-testid={`button-delete-admin-${admin.id}`}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Permanently Delete
                              </DropdownMenuItem>
                            </>
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

      {/* Delete Admin Confirmation Dialog */}
      <AlertDialog open={!!adminToDelete} onOpenChange={(open) => !open && setAdminToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-admin">
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Platform Admin</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{adminToDelete?.email}</strong>? 
              This action cannot be undone and will remove all data associated with this admin account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteAdminMutation.isPending}
              data-testid="button-cancel-delete-admin"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => adminToDelete && deleteAdminMutation.mutate(adminToDelete.id)}
              disabled={deleteAdminMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-admin"
            >
              {deleteAdminMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Admin"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
