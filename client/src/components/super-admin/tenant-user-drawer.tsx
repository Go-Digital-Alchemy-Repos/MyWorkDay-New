import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FullScreenDrawer } from "@/components/ui/full-screen-drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  User, 
  Mail, 
  Shield, 
  Key, 
  Copy, 
  RefreshCw, 
  Send, 
  Clock, 
  CheckCircle,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  X,
  Lock,
  LogIn,
  ExternalLink,
  Trash2,
  Pencil,
  Save
} from "lucide-react";

interface TenantUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
}

interface TenantUserDrawerProps {
  open: boolean;
  onClose: () => void;
  tenantId: string;
  userId: string;
  tenantName?: string;
}

export function TenantUserDrawer({ open, onClose, tenantId, userId, tenantName }: TenantUserDrawerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [mustChangeOnNextLogin, setMustChangeOnNextLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmRegenerateInvite, setConfirmRegenerateInvite] = useState(false);
  const [confirmDeleteInvite, setConfirmDeleteInvite] = useState(false);
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [lastGeneratedUrl, setLastGeneratedUrl] = useState<string | null>(null);
  const [lastResetLinkUrl, setLastResetLinkUrl] = useState<string | null>(null);
  
  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<string>("");

  const { data: user, isLoading: userLoading } = useQuery<TenantUser>({
    queryKey: ["/api/v1/super/tenants", tenantId, "users", userId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/super/tenants/${tenantId}/users`, { credentials: "include" });
      const data = await response.json();
      return data.users?.find((u: TenantUser) => u.id === userId);
    },
    enabled: open && !!tenantId && !!userId,
  });

  const { data: invitationData, isLoading: invitationLoading, refetch: refetchInvitation } = useQuery<{
    invitation: Invitation | null;
    hasAcceptedInvitation: boolean;
  }>({
    queryKey: ["/api/v1/super/tenants", tenantId, "users", userId, "invitation"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenantId}/users/${userId}/invitation`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!tenantId && !!userId && activeTab === "invitation",
  });

  const regenerateInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/regenerate-invite`);
      return res.json();
    },
    onSuccess: (data) => {
      setLastGeneratedUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users", userId, "invitation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "invitations"] });
      toast({ title: "Invitation regenerated", description: "A new invite link has been created." });
    },
    onError: () => {
      toast({ title: "Failed to regenerate invitation", variant: "destructive" });
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/send-invite`);
      return res.json();
    },
    onSuccess: (data) => {
      setLastGeneratedUrl(data.inviteUrl);
      refetchInvitation();
      if (data.emailSent) {
        toast({ title: "Invitation sent", description: `Email sent to ${user?.email}` });
      } else {
        toast({ title: "Invitation created but email failed", description: "Copy the link manually.", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to send invitation", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/reset-password`, {
        password: newPassword,
        mustChangeOnNextLogin,
      });
    },
    onSuccess: () => {
      toast({ title: "Password reset successfully" });
      setNewPassword("");
      setShowResetPassword(false);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users"] });
    },
    onError: () => {
      toast({ title: "Failed to reset password", variant: "destructive" });
    },
  });

  const generateResetLinkMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/generate-reset-link`);
      return res.json();
    },
    onSuccess: async (data) => {
      setLastResetLinkUrl(data.resetUrl);
      try {
        await navigator.clipboard.writeText(data.resetUrl);
        toast({ 
          title: "Reset link generated and copied", 
          description: `Link expires at ${new Date(data.expiresAt).toLocaleString()}` 
        });
      } catch {
        toast({ 
          title: "Reset link generated", 
          description: "Link ready - use the copy button to copy it." 
        });
      }
    },
    onError: () => {
      toast({ title: "Failed to generate reset link", variant: "destructive" });
    },
  });

  const toggleUserActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/activate`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users"] });
      toast({ title: user?.isActive ? "User deactivated" : "User activated" });
    },
    onError: () => {
      toast({ title: "Failed to update user status", variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/${userId}/impersonate-login`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Impersonation started", 
        description: `Now viewing as ${data.impersonating.email}. You'll be redirected.` 
      });
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    },
    onError: (error: any) => {
      toast({ 
        title: "Impersonation failed", 
        description: error?.message || "Could not impersonate this user",
        variant: "destructive" 
      });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${tenantId}/invitations/${invitationId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users", userId, "invitation"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "invitations"] });
      toast({ title: "Invitation deleted", description: "The invitation record has been permanently removed." });
    },
    onError: () => {
      toast({ title: "Failed to delete invitation", variant: "destructive" });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async (data: { firstName?: string; lastName?: string; email?: string; role?: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/super/tenants/${tenantId}/users/${userId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users"] });
      toast({ title: "User updated successfully" });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update user", 
        description: error?.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  // Delete user permanently mutation
  const deleteUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${tenantId}/users/${userId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "users"] });
      toast({ title: "User deleted permanently", description: "The user and all associated data have been removed." });
      onClose();
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to delete user", 
        description: error?.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  // Initialize edit fields when user data loads
  useEffect(() => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditEmail(user.email || "");
      setEditRole(user.role || "employee");
    }
  }, [user]);

  useEffect(() => {
    if (!open) {
      setActiveTab("overview");
      setNewPassword("");
      setShowResetPassword(false);
      setConfirmDeleteInvite(false);
      setConfirmDeleteUser(false);
      setIsEditing(false);
      setLastGeneratedUrl(null);
      setLastResetLinkUrl(null);
    }
  }, [open]);

  const startEditing = () => {
    if (user) {
      setEditFirstName(user.firstName || "");
      setEditLastName(user.lastName || "");
      setEditEmail(user.email || "");
      setEditRole(user.role || "employee");
      setIsEditing(true);
    }
  };

  const saveUserChanges = () => {
    const updates: { firstName?: string; lastName?: string; email?: string; role?: string } = {};
    
    if (editFirstName !== (user?.firstName || "")) {
      updates.firstName = editFirstName;
    }
    if (editLastName !== (user?.lastName || "")) {
      updates.lastName = editLastName;
    }
    if (editEmail !== user?.email) {
      updates.email = editEmail;
    }
    if (editRole !== user?.role) {
      updates.role = editRole;
    }
    
    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes to save" });
      setIsEditing(false);
      return;
    }
    
    updateUserMutation.mutate(updates);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const getInvitationStatus = () => {
    if (!invitationData) return null;
    
    const { invitation, hasAcceptedInvitation } = invitationData;
    
    if (hasAcceptedInvitation) {
      return { status: "accepted", label: "Account Active", color: "bg-green-600" };
    }
    
    if (!invitation) {
      return { status: "none", label: "No Invitation", color: "bg-gray-500" };
    }
    
    const isExpired = new Date(invitation.expiresAt) < new Date();
    
    if (invitation.status === "revoked") {
      return { status: "revoked", label: "Revoked", color: "bg-red-600" };
    }
    
    if (isExpired) {
      return { status: "expired", label: "Expired", color: "bg-yellow-600" };
    }
    
    if (invitation.status === "pending") {
      return { status: "pending", label: "Pending", color: "bg-blue-600" };
    }
    
    return { status: invitation.status, label: invitation.status, color: "bg-gray-500" };
  };

  return (
    <>
      <FullScreenDrawer
        open={open}
        onOpenChange={(isOpen) => !isOpen && onClose()}
        title={user?.name || user?.email || "User Details"}
        description={`Manage user in ${tenantName || "tenant"}`}
      >
        <div className="p-6 space-y-6">
          {userLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : !user ? (
            <div className="text-center py-8 text-muted-foreground">User not found</div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview" data-testid="tab-user-overview">
                  <User className="h-4 w-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger value="invitation" data-testid="tab-user-invitation">
                  <Mail className="h-4 w-4 mr-2" />
                  Invitation
                </TabsTrigger>
                <TabsTrigger value="security" data-testid="tab-user-security">
                  <Shield className="h-4 w-4 mr-2" />
                  Security
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-base">User Information</CardTitle>
                    {!isEditing ? (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={startEditing}
                        data-testid="button-edit-user"
                      >
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    ) : (
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setIsEditing(false)}
                          data-testid="button-cancel-edit"
                        >
                          <X className="h-4 w-4 mr-2" />
                          Cancel
                        </Button>
                        <Button 
                          size="sm" 
                          onClick={saveUserChanges}
                          disabled={updateUserMutation.isPending}
                          data-testid="button-save-user"
                        >
                          {updateUserMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Save className="h-4 w-4 mr-2" />
                          )}
                          Save
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-2xl font-medium">
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold">{user.name || "No name set"}</h3>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    
                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-first-name">First Name</Label>
                          <Input
                            id="edit-first-name"
                            value={editFirstName}
                            onChange={(e) => setEditFirstName(e.target.value)}
                            placeholder="First name"
                            data-testid="input-edit-first-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-last-name">Last Name</Label>
                          <Input
                            id="edit-last-name"
                            value={editLastName}
                            onChange={(e) => setEditLastName(e.target.value)}
                            placeholder="Last name"
                            data-testid="input-edit-last-name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-email">Email</Label>
                          <Input
                            id="edit-email"
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="user@example.com"
                            data-testid="input-edit-email"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-role">Role</Label>
                          <Select value={editRole} onValueChange={setEditRole}>
                            <SelectTrigger id="edit-role" data-testid="select-edit-role">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="employee">Employee</SelectItem>
                              <SelectItem value="client">Client</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge className={user.isActive ? "bg-green-600 mt-1" : "bg-gray-500 mt-1"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Updated</Label>
                          <p className="font-medium">{new Date(user.updatedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div>
                          <Label className="text-xs text-muted-foreground">First Name</Label>
                          <p className="font-medium">{user.firstName || "-"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Name</Label>
                          <p className="font-medium">{user.lastName || "-"}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Role</Label>
                          <Badge variant="outline" className="mt-1">{user.role}</Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Status</Label>
                          <Badge className={user.isActive ? "bg-green-600 mt-1" : "bg-gray-500 mt-1"}>
                            {user.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Created</Label>
                          <p className="font-medium">{new Date(user.createdAt).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Last Updated</Label>
                          <p className="font-medium">{new Date(user.updatedAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Account Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">Account Status</p>
                        <p className="text-sm text-muted-foreground">
                          {user.isActive ? "User can log in and access the system" : "User is blocked from logging in"}
                        </p>
                      </div>
                      <Switch
                        checked={user.isActive}
                        onCheckedChange={(checked) => toggleUserActiveMutation.mutate(checked)}
                        disabled={toggleUserActiveMutation.isPending}
                        data-testid="switch-user-active"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between p-3 rounded-lg border">
                      <div>
                        <p className="font-medium">Impersonate User</p>
                        <p className="text-sm text-muted-foreground">
                          Log in as this user to see the app from their perspective
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => impersonateMutation.mutate()}
                        disabled={impersonateMutation.isPending || !user.isActive}
                        data-testid="button-impersonate-user"
                      >
                        {impersonateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <LogIn className="h-4 w-4 mr-2" />
                        )}
                        Impersonate
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="text-base text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Danger Zone
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-destructive/50">
                      <div>
                        <p className="font-medium">Delete User Permanently</p>
                        <p className="text-sm text-muted-foreground">
                          {user.isActive 
                            ? "User must be deactivated before deletion. Toggle status above first." 
                            : "Remove this user and all associated data. This cannot be undone."}
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        onClick={() => setConfirmDeleteUser(true)}
                        disabled={user.isActive || deleteUserMutation.isPending}
                        data-testid="button-delete-user"
                      >
                        {deleteUserMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Delete User
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="invitation" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Invitation Status</CardTitle>
                    <CardDescription>View and manage the user's invitation</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {invitationLoading ? (
                      <Skeleton className="h-20 w-full" />
                    ) : (
                      <div className="space-y-4">
                        {(() => {
                          const status = getInvitationStatus();
                          if (!status) return null;
                          
                          return (
                            <div className="flex items-center justify-between p-4 rounded-lg border">
                              <div className="flex items-center gap-3">
                                {status.status === "accepted" ? (
                                  <CheckCircle className="h-5 w-5 text-green-600" />
                                ) : status.status === "pending" ? (
                                  <Clock className="h-5 w-5 text-blue-600" />
                                ) : status.status === "expired" ? (
                                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                                ) : (
                                  <X className="h-5 w-5 text-gray-500" />
                                )}
                                <div>
                                  <p className="font-medium">Invitation Status</p>
                                  <Badge className={status.color}>{status.label}</Badge>
                                </div>
                              </div>
                              {invitationData?.invitation && (
                                <div className="text-right text-sm text-muted-foreground">
                                  <p>Created: {new Date(invitationData.invitation.createdAt).toLocaleDateString()}</p>
                                  <p>Expires: {new Date(invitationData.invitation.expiresAt).toLocaleDateString()}</p>
                                </div>
                              )}
                            </div>
                          );
                        })()}

                        {!invitationData?.hasAcceptedInvitation && (
                          <div className="space-y-3 pt-4">
                            <div className="flex gap-2 flex-wrap">
                              <Button
                                variant="outline"
                                onClick={() => setConfirmRegenerateInvite(true)}
                                disabled={regenerateInviteMutation.isPending}
                                data-testid="button-regenerate-invite"
                              >
                                {regenerateInviteMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Regenerate Link
                              </Button>
                              <Button
                                onClick={() => sendInviteMutation.mutate()}
                                disabled={sendInviteMutation.isPending}
                                data-testid="button-send-invite"
                              >
                                {sendInviteMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Send Invite Email
                              </Button>
                              {/* Show delete button for revoked or expired invitations */}
                              {invitationData?.invitation && (
                                invitationData.invitation.status === "revoked" || 
                                new Date(invitationData.invitation.expiresAt) < new Date()
                              ) && (
                                <Button
                                  variant="destructive"
                                  onClick={() => setConfirmDeleteInvite(true)}
                                  disabled={deleteInvitationMutation.isPending}
                                  data-testid="button-delete-invite"
                                >
                                  {deleteInvitationMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-4 w-4 mr-2" />
                                  )}
                                  Delete Invitation
                                </Button>
                              )}
                            </div>

                            {lastGeneratedUrl && (
                              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                    <span className="text-sm text-green-700 dark:text-green-400">Invite link generated</span>
                                  </div>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    onClick={() => copyToClipboard(lastGeneratedUrl)}
                                    data-testid="button-copy-invite-url"
                                  >
                                    <Copy className="h-4 w-4 mr-2" />
                                    Copy
                                  </Button>
                                </div>
                                <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                                  {lastGeneratedUrl}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Key className="h-4 w-4" />
                      Password Management
                    </CardTitle>
                    <CardDescription>Reset the user's password</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {!showResetPassword ? (
                      <Button
                        variant="outline"
                        onClick={() => setShowResetPassword(true)}
                        data-testid="button-show-reset-password"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Reset Password
                      </Button>
                    ) : (
                      <div className="space-y-4 p-4 rounded-lg border">
                        <div className="space-y-2">
                          <Label htmlFor="new-password">New Password</Label>
                          <div className="relative">
                            <Input
                              id="new-password"
                              type={showPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Minimum 8 characters"
                              className="pr-10"
                              data-testid="input-new-password"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full"
                              onClick={() => setShowPassword(!showPassword)}
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={mustChangeOnNextLogin}
                              onCheckedChange={setMustChangeOnNextLogin}
                              id="must-change"
                              data-testid="switch-must-change"
                            />
                            <Label htmlFor="must-change" className="text-sm">
                              Require password change on next login
                            </Label>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <Button
                            onClick={() => resetPasswordMutation.mutate()}
                            disabled={newPassword.length < 8 || resetPasswordMutation.isPending}
                            data-testid="button-confirm-reset-password"
                          >
                            {resetPasswordMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Key className="h-4 w-4 mr-2" />
                            )}
                            Reset Password
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setShowResetPassword(false);
                              setNewPassword("");
                            }}
                            data-testid="button-cancel-reset-password"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      Password Reset Link
                    </CardTitle>
                    <CardDescription>
                      Generate a password reset link that you can share with the user. This is useful when you don't want to set a temporary password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      variant="outline"
                      onClick={() => generateResetLinkMutation.mutate()}
                      disabled={generateResetLinkMutation.isPending}
                      data-testid="button-generate-reset-link"
                    >
                      {generateResetLinkMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Key className="h-4 w-4 mr-2" />
                      )}
                      Generate Reset Link
                    </Button>
                    
                    {lastResetLinkUrl && (
                      <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span className="text-sm text-green-700 dark:text-green-400">Reset link generated and copied</span>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => copyToClipboard(lastResetLinkUrl)}
                            data-testid="button-copy-reset-link"
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                          {lastResetLinkUrl}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Expires in 24 hours
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t">
          <Button variant="outline" onClick={onClose} data-testid="button-close-user-drawer">
            Close
          </Button>
        </div>
      </FullScreenDrawer>

      <AlertDialog open={confirmRegenerateInvite} onOpenChange={setConfirmRegenerateInvite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Invitation?</AlertDialogTitle>
            <AlertDialogDescription>
              This will invalidate any existing invitation link and create a new one. 
              The previous link will no longer work.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-regenerate">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                regenerateInviteMutation.mutate();
                setConfirmRegenerateInvite(false);
              }}
              data-testid="button-confirm-regenerate"
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteInvite} onOpenChange={setConfirmDeleteInvite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Invitation Permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the invitation record for this user. 
              This action cannot be undone. You can create a new invitation if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-invite">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                if (invitationData?.invitation?.id) {
                  deleteInvitationMutation.mutate(invitationData.invitation.id);
                }
                setConfirmDeleteInvite(false);
              }}
              data-testid="button-confirm-delete-invite"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDeleteUser} onOpenChange={setConfirmDeleteUser}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete User Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                This will permanently delete <strong>{user?.name || user?.email}</strong> and all their associated data including:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>Workspace memberships</li>
                <li>Team memberships</li>
                <li>Project memberships</li>
                <li>Task assignments</li>
                <li>Time entries</li>
                <li>Comments</li>
                <li>Activity logs</li>
              </ul>
              <p className="font-medium text-destructive mt-3">
                This action cannot be undone.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              className="bg-destructive text-destructive-foreground"
              onClick={() => {
                deleteUserMutation.mutate();
                setConfirmDeleteUser(false);
              }}
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete User
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
