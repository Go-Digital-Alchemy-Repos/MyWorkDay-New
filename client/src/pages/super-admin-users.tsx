import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { 
  Loader2, Shield, Save, Mail, Plus, Link, Copy, MoreHorizontal, 
  UserCheck, UserX, Clock, AlertCircle, KeyRound, Eye, EyeOff, Trash2, Send,
  Search, Building2, Users, ChevronLeft, ChevronRight, Activity, Edit
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
}

interface InviteResponse {
  inviteUrl: string;
  emailSent?: boolean;
}

interface AppUser {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  isPendingInvite?: boolean;
  needsPassword?: boolean;
  expiresAt?: string;
  avatarUrl: string | null;
  tenantId: string | null;
  tenantName: string | null;
  tenantStatus: string | null;
  createdAt: string;
  updatedAt: string | null;
  hasPendingInvite: boolean;
}

interface AppUsersResponse {
  users: AppUser[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface TenantOption {
  id: string;
  name: string;
  status: string;
}

interface UserActivity {
  userId: string;
  activityCount30Days: number;
  taskCount: number;
  commentCount: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entityType: string;
    entityId: string | null;
    metadata: any;
    createdAt: string;
  }>;
}

export default function SuperAdminUsers() {
  const { user } = useAuth();
  const { toast } = useToast();

  // Tab state
  const [activeTab, setActiveTab] = useState("platform-admins");

  // Platform Admins state
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

  // App User Manager state
  const [appUserSearch, setAppUserSearch] = useState("");
  const [appUserTenantFilter, setAppUserTenantFilter] = useState("all");
  const [appUserStatusFilter, setAppUserStatusFilter] = useState("all");
  const [appUserRoleFilter, setAppUserRoleFilter] = useState("all");
  const [appUserPage, setAppUserPage] = useState(1);
  const [selectedAppUser, setSelectedAppUser] = useState<AppUser | null>(null);
  const [appUserDrawerOpen, setAppUserDrawerOpen] = useState(false);
  const [appUserPasswordDrawerOpen, setAppUserPasswordDrawerOpen] = useState(false);
  const [appUserPassword, setAppUserPassword] = useState("");
  const [appUserConfirmPassword, setAppUserConfirmPassword] = useState("");
  const [appUserMustChange, setAppUserMustChange] = useState(true);
  const [showAppUserPassword, setShowAppUserPassword] = useState(false);
  const [appUserToDelete, setAppUserToDelete] = useState<AppUser | null>(null);
  const [generatedAppUserInviteUrl, setGeneratedAppUserInviteUrl] = useState<string | null>(null);
  
  // Edit App User state
  const [appUserEditDrawerOpen, setAppUserEditDrawerOpen] = useState(false);
  const [appUserEditForm, setAppUserEditForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    role: "employee" as "admin" | "employee",
  });
  
  // Password reset link state
  const [appUserResetLinkDrawerOpen, setAppUserResetLinkDrawerOpen] = useState(false);
  const [generatedAppUserResetUrl, setGeneratedAppUserResetUrl] = useState<string | null>(null);
  const [appUserResetSendEmail, setAppUserResetSendEmail] = useState(false);

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: platformAdmins = [], isLoading: adminsLoading, refetch: refetchAdmins } = useQuery<PlatformAdmin[]>({
    queryKey: ["/api/v1/super/admins"],
  });

  const { data: integrationStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/v1/super/integrations/status"],
  });

  // Build query params for app users
  const appUserParams = new URLSearchParams();
  if (appUserSearch) appUserParams.set("search", appUserSearch);
  if (appUserTenantFilter !== "all") appUserParams.set("tenantId", appUserTenantFilter);
  if (appUserStatusFilter !== "all") appUserParams.set("status", appUserStatusFilter);
  if (appUserRoleFilter !== "all") appUserParams.set("role", appUserRoleFilter);
  appUserParams.set("page", appUserPage.toString());
  appUserParams.set("pageSize", "25");
  const appUserQueryString = appUserParams.toString();

  // App Users query - uses default fetcher with array-segment keys for proper cache invalidation
  const { data: appUsersData, isLoading: appUsersLoading } = useQuery<AppUsersResponse>({
    queryKey: ["/api/v1/super/users", `?${appUserQueryString}`],
    enabled: activeTab === "app-users",
  });

  // Tenants list for filter dropdown
  const { data: tenantsList = [] } = useQuery<TenantOption[]>({
    queryKey: ["/api/v1/super/tenants"],
    enabled: activeTab === "app-users",
  });

  // User activity query - only enabled when drawer is open and user selected
  // Uses array segments for proper cache management
  const { data: userActivity, isLoading: activityLoading } = useQuery<UserActivity>({
    queryKey: ["/api/v1/super/users", selectedAppUser?.id, "activity"],
    enabled: appUserDrawerOpen && !!selectedAppUser,
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

  // App User Management mutations
  const updateAppUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest("PATCH", `/api/v1/super/users/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserDrawerOpen(false);
      setSelectedAppUser(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to update user", variant: "destructive" });
    },
  });

  const setAppUserPasswordMutation = useMutation({
    mutationFn: async ({ id, password, mustChangeOnNextLogin }: { id: string; password: string; mustChangeOnNextLogin: boolean }) => {
      return apiRequest("POST", `/api/v1/super/users/${id}/set-password`, { password, mustChangeOnNextLogin });
    },
    onSuccess: () => {
      toast({ title: "Password set successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserPasswordDrawerOpen(false);
      setAppUserPassword("");
      setAppUserConfirmPassword("");
      setAppUserMustChange(true);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to set password", variant: "destructive" });
    },
  });

  const deleteAppUserMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/super/users/${id}`);
    },
    onSuccess: () => {
      toast({ title: "User deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserToDelete(null);
      setAppUserDrawerOpen(false);
      setSelectedAppUser(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete user", variant: "destructive" });
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/v1/super/invitations/${id}/resend`);
    },
    onSuccess: (data: any) => {
      setGeneratedAppUserInviteUrl(data.inviteUrl);
      toast({ title: "Invitation link regenerated" });
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to regenerate invitation", variant: "destructive" });
    },
  });

  const deleteInvitationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/v1/super/invitations/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Invitation deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserDrawerOpen(false);
      setSelectedAppUser(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to delete invitation", variant: "destructive" });
    },
  });

  const activateInvitationMutation = useMutation({
    mutationFn: async ({ id, password, mustChangeOnNextLogin }: { id: string; password: string; mustChangeOnNextLogin: boolean }) => {
      return apiRequest("POST", `/api/v1/super/invitations/${id}/activate`, { password, mustChangeOnNextLogin });
    },
    onSuccess: () => {
      toast({ title: "User activated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserPasswordDrawerOpen(false);
      setAppUserPassword("");
      setAppUserConfirmPassword("");
      setAppUserMustChange(true);
      setAppUserDrawerOpen(false);
      setSelectedAppUser(null);
    },
    onError: (error: any) => {
      toast({ title: error.message || "Failed to activate user", variant: "destructive" });
    },
  });

  // Edit app user mutation
  const editAppUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { firstName?: string; lastName?: string; email?: string; role?: string } }) => {
      return apiRequest("PATCH", `/api/v1/super/users/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "User updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
      setAppUserEditDrawerOpen(false);
      setAppUserDrawerOpen(false);
      setSelectedAppUser(null);
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to update user", description: parsed.message, variant: "destructive" });
    },
  });

  // Generate password reset link mutation
  const generateAppUserResetLinkMutation = useMutation({
    mutationFn: async ({ id, sendEmail }: { id: string; sendEmail: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/users/${id}/generate-reset-link`, { sendEmail });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.resetUrl) {
        setGeneratedAppUserResetUrl(data.resetUrl);
        if (data.emailSent) {
          toast({ title: "Password reset email sent" });
        } else {
          toast({ title: "Password reset link generated" });
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/users"] });
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to generate reset link", description: parsed.message, variant: "destructive" });
    },
  });

  const handleSetAppUserPassword = () => {
    if (!selectedAppUser) return;
    if (appUserPassword.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    if (appUserPassword !== appUserConfirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (selectedAppUser.isPendingInvite) {
      activateInvitationMutation.mutate({ id: selectedAppUser.id, password: appUserPassword, mustChangeOnNextLogin: appUserMustChange });
    } else {
      setAppUserPasswordMutation.mutate({ id: selectedAppUser.id, password: appUserPassword, mustChangeOnNextLogin: appUserMustChange });
    }
  };

  // Open edit drawer with user's current data
  const handleOpenEditAppUser = (appUser: AppUser) => {
    setAppUserEditForm({
      firstName: appUser.firstName || "",
      lastName: appUser.lastName || "",
      email: appUser.email || "",
      role: (appUser.role === "admin" ? "admin" : "employee") as "admin" | "employee",
    });
    setAppUserEditDrawerOpen(true);
  };

  // Submit edit app user form
  const handleEditAppUser = () => {
    if (!selectedAppUser) return;
    if (!appUserEditForm.email) {
      toast({ title: "Email is required", variant: "destructive" });
      return;
    }
    editAppUserMutation.mutate({
      id: selectedAppUser.id,
      data: {
        firstName: appUserEditForm.firstName || undefined,
        lastName: appUserEditForm.lastName || undefined,
        email: appUserEditForm.email,
        role: appUserEditForm.role,
      },
    });
  };

  // Open reset link drawer
  const handleOpenResetLinkDrawer = (appUser: AppUser) => {
    setGeneratedAppUserResetUrl(null);
    setAppUserResetSendEmail(false);
    setAppUserResetLinkDrawerOpen(true);
  };

  // Generate reset link
  const handleGenerateAppUserResetLink = () => {
    if (!selectedAppUser) return;
    generateAppUserResetLinkMutation.mutate({
      id: selectedAppUser.id,
      sendEmail: appUserResetSendEmail,
    });
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

  // Helper function to get initials for avatar
  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email.substring(0, 2).toUpperCase();
  };

  // Helper function to format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    return new Date(dateStr).toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      year: "numeric" 
    });
  };

  // Handle app user selection
  const handleViewAppUser = (appUser: AppUser) => {
    setSelectedAppUser(appUser);
    setAppUserDrawerOpen(true);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">User Manager</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">
          Manage platform administrators and application users across all tenants
        </p>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mb-4" data-testid="user-manager-tabs">
            <TabsTrigger value="platform-admins" data-testid="tab-platform-admins">
              <Shield className="h-4 w-4 mr-2" />
              Platform Administrators
            </TabsTrigger>
            <TabsTrigger value="app-users" data-testid="tab-app-users">
              <Users className="h-4 w-4 mr-2" />
              App User Manager
            </TabsTrigger>
          </TabsList>

          <TabsContent value="platform-admins" className="flex-1 overflow-auto mt-0">
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
          </TabsContent>

          <TabsContent value="app-users" className="flex-1 overflow-auto mt-0">
            <Card className="h-full flex flex-col">
              <CardHeader className="shrink-0">
                <div className="flex flex-col gap-4">
                  <div>
                    <CardTitle>App User Manager</CardTitle>
                    <CardDescription>View and manage users across all tenants</CardDescription>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by name or email..."
                        value={appUserSearch}
                        onChange={(e) => {
                          setAppUserSearch(e.target.value);
                          setAppUserPage(1);
                        }}
                        className="pl-9"
                        data-testid="input-app-user-search"
                      />
                    </div>
                    <Select value={appUserTenantFilter} onValueChange={(v) => { setAppUserTenantFilter(v); setAppUserPage(1); }}>
                      <SelectTrigger className="w-[180px]" data-testid="select-tenant-filter">
                        <Building2 className="h-4 w-4 mr-2" />
                        <SelectValue placeholder="All Tenants" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tenants</SelectItem>
                        {tenantsList.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={appUserStatusFilter} onValueChange={(v) => { setAppUserStatusFilter(v); setAppUserPage(1); }}>
                      <SelectTrigger className="w-[160px]" data-testid="select-status-filter">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="pending">Pending Invite</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={appUserRoleFilter} onValueChange={(v) => { setAppUserRoleFilter(v); setAppUserPage(1); }}>
                      <SelectTrigger className="w-[130px]" data-testid="select-role-filter">
                        <SelectValue placeholder="All Roles" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Roles</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="employee">Employee</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {appUsersLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : appUsersData?.users && appUsersData.users.length > 0 ? (
                  <div className="space-y-2">
                    {appUsersData.users.map((appUser) => (
                      <div 
                        key={appUser.id} 
                        className="flex items-center justify-between p-3 border rounded-lg hover-elevate cursor-pointer"
                        onClick={() => handleViewAppUser(appUser)}
                        data-testid={`app-user-row-${appUser.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={appUser.avatarUrl || undefined} />
                            <AvatarFallback>{getInitials(appUser.name || `${appUser.firstName || ""} ${appUser.lastName || ""}`.trim() || null, appUser.email)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">
                              {appUser.firstName && appUser.lastName ? `${appUser.firstName} ${appUser.lastName}` : appUser.name || appUser.email}
                            </div>
                            <div className="text-xs text-muted-foreground">{appUser.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {appUser.tenantName && (
                            <Badge variant="outline" className="text-xs">
                              <Building2 className="h-3 w-3 mr-1" />
                              {appUser.tenantName}
                            </Badge>
                          )}
                          <Badge variant={appUser.role === "admin" ? "default" : "secondary"} className="text-xs">
                            {appUser.role}
                          </Badge>
                          {appUser.isPendingInvite ? (
                            <Badge variant="outline" className="text-xs">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending Invite
                            </Badge>
                          ) : appUser.needsPassword ? (
                            <Badge variant="outline" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Needs Password
                            </Badge>
                          ) : (
                            <Badge variant={appUser.isActive ? "default" : "secondary"} className="text-xs">
                              {appUser.isActive ? <UserCheck className="h-3 w-3 mr-1" /> : <UserX className="h-3 w-3 mr-1" />}
                              {appUser.isActive ? "Active" : "Inactive"}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No users found matching your filters
                  </div>
                )}
              </CardContent>
              {appUsersData && appUsersData.totalPages > 1 && (
                <div className="flex items-center justify-between p-4 border-t shrink-0">
                  <div className="text-sm text-muted-foreground">
                    Showing {((appUserPage - 1) * 25) + 1} - {Math.min(appUserPage * 25, appUsersData.total)} of {appUsersData.total} users
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setAppUserPage(p => Math.max(1, p - 1))}
                      disabled={appUserPage <= 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">Page {appUserPage} of {appUsersData.totalPages}</span>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setAppUserPage(p => Math.min(appUsersData.totalPages, p + 1))}
                      disabled={appUserPage >= appUsersData.totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* App User Detail Drawer */}
      <Sheet open={appUserDrawerOpen} onOpenChange={(open) => {
        setAppUserDrawerOpen(open);
        if (!open) setSelectedAppUser(null);
      }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto" data-testid="drawer-app-user">
          <SheetHeader>
            <SheetTitle>User Details</SheetTitle>
            <SheetDescription>View user information and activity</SheetDescription>
          </SheetHeader>
          {selectedAppUser && (
            <div className="space-y-6 py-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={selectedAppUser.avatarUrl || undefined} />
                  <AvatarFallback className="text-lg">{getInitials(selectedAppUser.name || `${selectedAppUser.firstName || ""} ${selectedAppUser.lastName || ""}`.trim() || null, selectedAppUser.email)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-semibold text-lg">
                    {selectedAppUser.firstName && selectedAppUser.lastName ? `${selectedAppUser.firstName} ${selectedAppUser.lastName}` : selectedAppUser.name || selectedAppUser.email}
                  </div>
                  <div className="text-sm text-muted-foreground">{selectedAppUser.email}</div>
                  <div className="flex gap-2 mt-2">
                    {selectedAppUser.isPendingInvite ? (
                      <Badge variant="outline">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending Invite
                      </Badge>
                    ) : selectedAppUser.needsPassword ? (
                      <Badge variant="outline">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Needs Password
                      </Badge>
                    ) : (
                      <Badge variant={selectedAppUser.isActive ? "default" : "secondary"}>
                        {selectedAppUser.isActive ? "Active" : "Inactive"}
                      </Badge>
                    )}
                    <Badge variant="outline">{selectedAppUser.role}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Tenant</Label>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedAppUser.tenantName || "No tenant"}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Created</Label>
                  <div className="text-sm">{formatDate(selectedAppUser.createdAt)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Updated</Label>
                  <div className="text-sm">{formatDate(selectedAppUser.updatedAt)}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Invite Status</Label>
                  <div className="text-sm">
                    {selectedAppUser.hasPendingInvite ? (
                      <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />Pending</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Management Actions */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="h-4 w-4" />
                  <h4 className="font-medium">Actions</h4>
                </div>
                <div className="space-y-2">
                  {selectedAppUser.isPendingInvite ? (
                    <>
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => {
                          setAppUserPasswordDrawerOpen(true);
                          setGeneratedAppUserInviteUrl(null);
                        }}
                        data-testid="button-activate-user"
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Activate User & Set Password
                      </Button>
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => resendInvitationMutation.mutate(selectedAppUser.id)}
                        disabled={resendInvitationMutation.isPending}
                        data-testid="button-resend-invitation"
                      >
                        {resendInvitationMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                        Regenerate Invite Link
                      </Button>
                      {generatedAppUserInviteUrl && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                          <Input 
                            value={generatedAppUserInviteUrl} 
                            readOnly 
                            className="text-xs"
                            data-testid="input-invite-url"
                          />
                          <Button 
                            size="icon" 
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(generatedAppUserInviteUrl);
                              toast({ title: "Link copied to clipboard" });
                            }}
                            data-testid="button-copy-invite-url"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      <Button 
                        className="w-full justify-start text-destructive" 
                        variant="outline"
                        onClick={() => setAppUserToDelete(selectedAppUser)}
                        data-testid="button-delete-invitation"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Invitation
                      </Button>
                    </>
                  ) : (
                    <>
                      {/* Edit User Button */}
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => handleOpenEditAppUser(selectedAppUser)}
                        data-testid="button-edit-user"
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Edit User
                      </Button>
                      
                      {/* Password Management */}
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => setAppUserPasswordDrawerOpen(true)}
                        data-testid="button-change-password"
                      >
                        <KeyRound className="h-4 w-4 mr-2" />
                        {selectedAppUser.needsPassword ? "Set Password" : "Change Password"}
                      </Button>
                      <Button 
                        className="w-full justify-start" 
                        variant="outline"
                        onClick={() => handleOpenResetLinkDrawer(selectedAppUser)}
                        data-testid="button-generate-reset-link"
                      >
                        <Link className="h-4 w-4 mr-2" />
                        Generate Password Reset Link
                      </Button>
                      
                      {selectedAppUser.isActive ? (
                        <Button 
                          className="w-full justify-start" 
                          variant="outline"
                          onClick={() => updateAppUserMutation.mutate({ id: selectedAppUser.id, data: { isActive: false } })}
                          disabled={updateAppUserMutation.isPending}
                          data-testid="button-deactivate-user"
                        >
                          {updateAppUserMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserX className="h-4 w-4 mr-2" />}
                          Deactivate User
                        </Button>
                      ) : (
                        <Button 
                          className="w-full justify-start" 
                          variant="outline"
                          onClick={() => updateAppUserMutation.mutate({ id: selectedAppUser.id, data: { isActive: true } })}
                          disabled={updateAppUserMutation.isPending}
                          data-testid="button-activate-user"
                        >
                          {updateAppUserMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserCheck className="h-4 w-4 mr-2" />}
                          Activate User
                        </Button>
                      )}
                      <Button 
                        className="w-full justify-start text-destructive" 
                        variant="outline"
                        onClick={() => setAppUserToDelete(selectedAppUser)}
                        data-testid="button-delete-user"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete User
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Activity Summary */}
              <div className="border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="h-4 w-4" />
                  <h4 className="font-medium">Activity Summary</h4>
                </div>
                {selectedAppUser.isPendingInvite ? (
                  <div className="text-sm text-muted-foreground">User has not yet accepted their invitation</div>
                ) : activityLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : userActivity ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-semibold">{userActivity.activityCount30Days}</div>
                        <div className="text-xs text-muted-foreground">Actions (30d)</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-semibold">{userActivity.taskCount}</div>
                        <div className="text-xs text-muted-foreground">Tasks Assigned</div>
                      </div>
                      <div className="text-center p-3 bg-muted/50 rounded-lg">
                        <div className="text-2xl font-semibold">{userActivity.commentCount}</div>
                        <div className="text-xs text-muted-foreground">Comments</div>
                      </div>
                    </div>
                    {userActivity.recentActivity.length > 0 && (
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Recent Activity</Label>
                        <ScrollArea className="h-[150px]">
                          <div className="space-y-2">
                            {userActivity.recentActivity.map((activity) => (
                              <div key={activity.id} className="text-xs p-2 bg-muted/30 rounded flex justify-between">
                                <span>{activity.action} {activity.entityType}</span>
                                <span className="text-muted-foreground">{formatDate(activity.createdAt)}</span>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">No activity data available</div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* App User Password Drawer */}
      <Sheet open={appUserPasswordDrawerOpen} onOpenChange={(open) => {
        setAppUserPasswordDrawerOpen(open);
        if (!open) {
          setAppUserPassword("");
          setAppUserConfirmPassword("");
          setAppUserMustChange(true);
          setGeneratedAppUserInviteUrl(null);
        }
      }}>
        <SheetContent className="w-full sm:max-w-md" data-testid="drawer-app-user-password">
          <SheetHeader>
            <SheetTitle>
              {selectedAppUser?.isPendingInvite 
                ? "Activate User" 
                : selectedAppUser?.needsPassword 
                  ? "Set Password" 
                  : "Change Password"
              }
            </SheetTitle>
            <SheetDescription>
              {selectedAppUser?.isPendingInvite 
                ? "Set a password to activate this user without requiring them to accept the invitation"
                : selectedAppUser?.needsPassword
                  ? "Set a new password for this user"
                  : "Manually change this user's password"
              }
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 py-6">
            <div className="space-y-2">
              <Label htmlFor="appUserPassword">Password</Label>
              <div className="relative">
                <Input
                  id="appUserPassword"
                  type={showAppUserPassword ? "text" : "password"}
                  value={appUserPassword}
                  onChange={(e) => setAppUserPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  data-testid="input-app-user-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  onClick={() => setShowAppUserPassword(!showAppUserPassword)}
                  data-testid="button-toggle-app-user-password"
                >
                  {showAppUserPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appUserConfirmPassword">Confirm Password</Label>
              <Input
                id="appUserConfirmPassword"
                type={showAppUserPassword ? "text" : "password"}
                value={appUserConfirmPassword}
                onChange={(e) => setAppUserConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                data-testid="input-app-user-confirm-password"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="appUserMustChange"
                checked={appUserMustChange}
                onCheckedChange={(checked) => setAppUserMustChange(checked === true)}
                data-testid="checkbox-app-user-must-change"
              />
              <Label htmlFor="appUserMustChange" className="text-sm font-normal cursor-pointer">
                Require password change on next login
              </Label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleSetAppUserPassword}
                disabled={setAppUserPasswordMutation.isPending || activateInvitationMutation.isPending}
                className="flex-1"
                data-testid="button-confirm-set-password"
              >
                {(setAppUserPasswordMutation.isPending || activateInvitationMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4 mr-2" />
                )}
                {selectedAppUser?.isPendingInvite 
                  ? "Activate User" 
                  : selectedAppUser?.needsPassword 
                    ? "Set Password" 
                    : "Change Password"
                }
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setAppUserPasswordDrawerOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete App User Confirmation Dialog */}
      <AlertDialog open={!!appUserToDelete} onOpenChange={(open) => !open && setAppUserToDelete(null)}>
        <AlertDialogContent data-testid="dialog-delete-app-user">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {appUserToDelete?.isPendingInvite ? "Delete Invitation" : "Permanently Delete User"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {appUserToDelete?.isPendingInvite ? (
                <>Are you sure you want to delete the pending invitation for <strong>{appUserToDelete?.email}</strong>? This action cannot be undone.</>
              ) : (
                <>Are you sure you want to permanently delete <strong>{appUserToDelete?.email}</strong>? This will remove all data associated with this user and cannot be undone.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteAppUserMutation.isPending || deleteInvitationMutation.isPending}
              data-testid="button-cancel-delete-app-user"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                if (!appUserToDelete) return;
                if (appUserToDelete.isPendingInvite) {
                  deleteInvitationMutation.mutate(appUserToDelete.id);
                } else {
                  deleteAppUserMutation.mutate(appUserToDelete.id);
                }
              }}
              disabled={deleteAppUserMutation.isPending || deleteInvitationMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-app-user"
            >
              {(deleteAppUserMutation.isPending || deleteInvitationMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                appUserToDelete?.isPendingInvite ? "Delete Invitation" : "Delete User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                        className="text-sm"
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
                className="text-sm"
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

      {/* Edit App User Drawer */}
      <Sheet open={appUserEditDrawerOpen} onOpenChange={(open) => {
        setAppUserEditDrawerOpen(open);
        if (!open) {
          setAppUserEditForm({ firstName: "", lastName: "", email: "", role: "employee" });
        }
      }}>
        <SheetContent className="w-full sm:max-w-xl" data-testid="drawer-edit-app-user">
          <SheetHeader>
            <SheetTitle>Edit User</SheetTitle>
            <SheetDescription>Update user information</SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="space-y-2">
              <Label htmlFor="editAppUserFirstName">First Name</Label>
              <Input
                id="editAppUserFirstName"
                value={appUserEditForm.firstName}
                onChange={(e) => setAppUserEditForm({ ...appUserEditForm, firstName: e.target.value })}
                placeholder="John"
                data-testid="input-edit-app-user-first-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAppUserLastName">Last Name</Label>
              <Input
                id="editAppUserLastName"
                value={appUserEditForm.lastName}
                onChange={(e) => setAppUserEditForm({ ...appUserEditForm, lastName: e.target.value })}
                placeholder="Doe"
                data-testid="input-edit-app-user-last-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAppUserEmail">Email</Label>
              <Input
                id="editAppUserEmail"
                type="email"
                value={appUserEditForm.email}
                onChange={(e) => setAppUserEditForm({ ...appUserEditForm, email: e.target.value })}
                placeholder="user@example.com"
                data-testid="input-edit-app-user-email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editAppUserRole">Role</Label>
              <Select
                value={appUserEditForm.role}
                onValueChange={(value) => setAppUserEditForm({ ...appUserEditForm, role: value as "admin" | "employee" })}
              >
                <SelectTrigger id="editAppUserRole" data-testid="select-edit-app-user-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={handleEditAppUser} 
                disabled={editAppUserMutation.isPending}
                className="flex-1"
                data-testid="button-save-app-user"
              >
                {editAppUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
              <Button variant="outline" onClick={() => setAppUserEditDrawerOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Generate Password Reset Link Drawer */}
      <Sheet open={appUserResetLinkDrawerOpen} onOpenChange={(open) => {
        setAppUserResetLinkDrawerOpen(open);
        if (!open) {
          setGeneratedAppUserResetUrl(null);
          setAppUserResetSendEmail(false);
        }
      }}>
        <SheetContent className="w-full sm:max-w-xl" data-testid="drawer-app-user-reset-link">
          <SheetHeader>
            <SheetTitle>Generate Password Reset Link</SheetTitle>
            <SheetDescription>
              Create a password reset link for {selectedAppUser?.email}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 py-6">
            <div className="rounded-lg border p-4 bg-muted/50">
              <p className="text-sm text-muted-foreground">
                A password reset link will be generated. You can share the link directly with the user or optionally send an email.
              </p>
            </div>
            
            {integrationStatus?.mailgun && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="appUserResetSendEmail"
                  checked={appUserResetSendEmail}
                  onCheckedChange={(checked) => setAppUserResetSendEmail(checked === true)}
                  data-testid="checkbox-reset-send-email"
                />
                <Label htmlFor="appUserResetSendEmail" className="text-sm font-normal cursor-pointer">
                  Send password reset email
                </Label>
              </div>
            )}
            
            {generatedAppUserResetUrl && (
              <div className="space-y-2">
                <Label>Password Reset Link</Label>
                <div className="flex items-center gap-2">
                  <Input 
                    value={generatedAppUserResetUrl} 
                    readOnly 
                    className="text-sm"
                    data-testid="input-app-user-reset-url"
                  />
                  <Button 
                    size="icon" 
                    variant="outline" 
                    onClick={() => {
                      navigator.clipboard.writeText(generatedAppUserResetUrl);
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
            
            <div className="flex gap-3 pt-4">
              {!generatedAppUserResetUrl && (
                <Button 
                  onClick={handleGenerateAppUserResetLink} 
                  disabled={generateAppUserResetLinkMutation.isPending}
                  className="flex-1"
                  data-testid="button-generate-reset"
                >
                  {generateAppUserResetLinkMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Link className="h-4 w-4 mr-2" />
                  )}
                  Generate Reset Link
                </Button>
              )}
              <Button 
                variant="outline" 
                onClick={() => setAppUserResetLinkDrawerOpen(false)}
                className={generatedAppUserResetUrl ? "flex-1" : ""}
              >
                {generatedAppUserResetUrl ? "Done" : "Cancel"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
