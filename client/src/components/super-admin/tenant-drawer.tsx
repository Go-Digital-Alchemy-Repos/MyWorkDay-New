import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { FullScreenDrawer, FullScreenDrawerFooter } from "@/components/ui/full-screen-drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Building2, 
  Users, 
  Palette, 
  HardDrive, 
  FileText, 
  Settings, 
  Save, 
  Loader2, 
  Check, 
  X, 
  Mail,
  Clock,
  CheckCircle,
  AlertTriangle,
  PlayCircle,
  PauseCircle,
  Power,
  Copy,
  UserPlus,
  Briefcase,
  ExternalLink,
  MessageSquare,
  Activity,
  Send,
  Upload,
  FileSpreadsheet,
  Heart,
  FolderKanban,
  Search,
  Plus
} from "lucide-react";
import { CsvImportPanel, type ParsedRow, type ImportResult } from "@/components/common/csv-import-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface TenantWithDetails extends Tenant {
  settings?: TenantSettings | null;
  userCount?: number;
  primaryWorkspaceId?: string;
  primaryWorkspace?: {
    id: string;
    name: string;
  };
}

interface Workspace {
  id: string;
  name: string;
  tenantId: string | null;
  isPrimary: boolean | null;
}

interface TenantNote {
  id: string;
  tenantId: string;
  authorUserId: string;
  body: string;
  category: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
}

interface TenantClient {
  id: string;
  companyName: string;
  industry: string | null;
  status: string;
  createdAt: string;
}

interface TenantProject {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  status: string;
  color: string | null;
  createdAt: string;
}

interface TenantAuditEvent {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  eventType: string;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface TenantHealth {
  tenantId: string;
  status: string;
  primaryWorkspaceExists: boolean;
  primaryWorkspace: Workspace | null;
  users: {
    total: number;
    byRole: Record<string, number>;
  };
  agreement: {
    hasActiveAgreement: boolean;
    version: number | null;
    title: string | null;
  };
  integrations: {
    mailgunConfigured: boolean;
  };
  branding: {
    displayName: string | null;
    whiteLabelEnabled: boolean;
    logoConfigured: boolean;
  };
  warnings: string[];
  canEnableStrict: boolean;
}

interface TenantClient {
  id: string;
  tenantId: string;
  workspaceId: string;
  companyName: string;
  displayName?: string;
  industry?: string;
  website?: string;
  phone?: string;
  email?: string;
  status: string;
  createdAt: string;
}

interface TenantProject {
  id: string;
  tenantId: string;
  workspaceId: string;
  clientId?: string;
  name: string;
  description?: string;
  status: string;
  color?: string;
  createdAt: string;
  clientName?: string;
}

interface TenantDrawerProps {
  tenant: TenantWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantUpdated?: () => void;
}

type OnboardingStep = "workspace" | "branding" | "email" | "users" | "activate";

interface OnboardingProgress {
  workspace: boolean;
  branding: boolean;
  email: boolean;
  users: boolean;
  activated: boolean;
}

function getStatusBadge(status: string) {
  if (status === "active") {
    return (
      <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
        <CheckCircle className="h-3 w-3 mr-1" />
        Active
      </Badge>
    );
  } else if (status === "suspended") {
    return (
      <Badge variant="destructive">
        <AlertTriangle className="h-3 w-3 mr-1" />
        Suspended
      </Badge>
    );
  } else {
    return (
      <Badge variant="secondary">
        <Clock className="h-3 w-3 mr-1" />
        Pending Onboarding
      </Badge>
    );
  }
}

/**
 * TenantDrawer - Full-screen drawer for managing tenant details
 * 
 * STATE FLOW:
 * - activeTab: Controls which tab is visible, persisted to localStorage for tab retention
 * - confirmDialog: Manages confirmation dialogs for destructive actions (suspend/deactivate/reactivate)
 * - hasUnsavedChanges: Tracks if tenant name has been modified (triggers save prompt on close)
 * 
 * DATA LOADING:
 * - Each tab has its own useQuery hook with `enabled` condition based on activeTab
 * - This lazy-loads data only when the user switches to that tab
 * - All queries include credentials: "include" for session auth
 * 
 * CONFIRMATION FLOW:
 * - Destructive actions (suspend/deactivate/reactivate) require user confirmation
 * - ConfirmDialog shows tenant name to prevent accidental actions on wrong tenant
 */
export function TenantDrawer({ tenant, open, onOpenChange, onTenantUpdated }: TenantDrawerProps) {
  const { toast } = useToast();
  
  // Tab state with localStorage persistence scoped by tenant ID
  // This allows users to return to the same tab when reopening the drawer for the same tenant
  const getStorageKey = (tenantId: string) => `tenantDrawerTab_${tenantId}`;
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && tenant?.id) {
      return localStorage.getItem(getStorageKey(tenant.id)) || "overview";
    }
    return "overview";
  });
  
  // Form state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");
  const [csvData, setCsvData] = useState<Array<{ email: string; firstName?: string; lastName?: string; role?: string }>>([]);
  const [sendInviteEmails, setSendInviteEmails] = useState(false);
  const [bulkImportResults, setBulkImportResults] = useState<Array<{ email: string; success: boolean; inviteUrl?: string; emailSent?: boolean; error?: string }>>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [autoCreateClients, setAutoCreateClients] = useState(false);
  const [selectedProjectForTasks, setSelectedProjectForTasks] = useState<TenantProject | null>(null);
  const [showTaskImportPanel, setShowTaskImportPanel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Confirmation dialog state for destructive actions
  // action: null = closed, "suspend" | "activate" | "reactivate" = which action to confirm
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "suspend" | "activate" | "reactivate" | null;
    title: string;
    description: string;
  }>({ open: false, action: null, title: "", description: "" });

  // Reset form state when tenant changes, restore persisted tab for this tenant
  useEffect(() => {
    if (tenant) {
      setEditedName(tenant.name);
      setHasUnsavedChanges(false);
      // Load persisted tab for this specific tenant, or default to overview
      const storedTab = localStorage.getItem(getStorageKey(tenant.id));
      setActiveTab(storedTab || "overview");
    }
  }, [tenant?.id]);

  // Persist active tab to localStorage when it changes
  useEffect(() => {
    if (tenant?.id && activeTab) {
      localStorage.setItem(getStorageKey(tenant.id), activeTab);
    }
  }, [activeTab, tenant?.id]);

  // Scroll to top when switching tabs
  // The drawer's scrollable container is the parent with overflow-y-auto
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // Find the drawer's scrollable body container and scroll to top
    const drawerContent = document.querySelector('[data-testid="full-screen-drawer"] > div.overflow-y-auto');
    if (drawerContent) {
      drawerContent.scrollTop = 0;
    }
  };

  const { data: workspaces = [], isLoading: workspacesLoading } = useQuery<Workspace[]>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "workspaces"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/workspaces`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "workspaces",
  });

  const { data: settingsResponse } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open,
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<TenantHealth>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "health"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/health`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && (activeTab === "overview" || activeTab === "notes"),
  });

  const { data: notesResponse, isLoading: notesLoading } = useQuery<{ notes: TenantNote[] }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "notes"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/notes`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "notes",
  });

  const { data: auditResponse, isLoading: auditLoading } = useQuery<{ events: TenantAuditEvent[] }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/audit?limit=50`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "notes",
  });

  const { data: clientsResponse, isLoading: clientsLoading } = useQuery<{ clients: TenantClient[] }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "clients", clientSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/clients?search=${encodeURIComponent(clientSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "clients",
  });

  const { data: projectsResponse, isLoading: projectsLoading } = useQuery<{ projects: TenantProject[] }>({
    queryKey: ["/api/v1/super/tenants", tenant?.id, "projects", projectSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${tenant?.id}/projects?search=${encodeURIComponent(projectSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!tenant && open && activeTab === "projects",
  });

  const bulkClientsImportMutation = useMutation({
    mutationFn: async (clientsData: ParsedRow[]) => {
      const clients = clientsData.map(row => ({
        companyName: row.companyName || "",
        industry: row.industry,
        website: row.website,
        phone: row.phone,
        address1: row.address1,
        address2: row.address2,
        city: row.city,
        state: row.state,
        zip: row.zip,
        country: row.country,
        notes: row.notes,
        primaryContactEmail: row.primaryContactEmail,
        primaryContactFirstName: row.primaryContactFirstName,
        primaryContactLastName: row.primaryContactLastName,
      }));
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/clients/bulk`, { clients });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const bulkProjectsImportMutation = useMutation({
    mutationFn: async (data: { projects: ParsedRow[]; options: { autoCreateMissingClients: boolean } }) => {
      const projects = data.projects.map(row => ({
        projectName: row.projectName || "",
        clientCompanyName: row.clientCompanyName,
        clientId: row.clientId,
        workspaceName: row.workspaceName,
        description: row.description,
        status: row.status,
        startDate: row.startDate,
        dueDate: row.dueDate,
        color: row.color,
      }));
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/projects/bulk`, { 
        projects, 
        options: data.options 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const seedWelcomeProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/seed/welcome-project`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "created") {
        toast({ title: "Welcome project created", description: `Created ${data.created.tasks} tasks and ${data.created.subtasks} subtasks` });
      } else if (data.status === "skipped") {
        toast({ title: "Already exists", description: data.reason, variant: "default" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create welcome project", description: error.message, variant: "destructive" });
    },
  });

  const applyTaskTemplateMutation = useMutation({
    mutationFn: async ({ projectId, templateKey }: { projectId: string; templateKey: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/projects/${projectId}/seed/task-template`, { templateKey });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "applied") {
        toast({ title: "Template applied", description: `Created ${data.created.sections} sections, ${data.created.tasks} tasks` });
      } else {
        toast({ title: "Template skipped", description: data.reason, variant: "default" });
      }
      setSelectedProjectForTasks(null);
      setSelectedTemplate("");
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply template", description: error.message, variant: "destructive" });
    },
  });

  const bulkTasksImportMutation = useMutation({
    mutationFn: async ({ projectId, rows, options }: { projectId: string; rows: ParsedRow[]; options: { createMissingSections: boolean; allowUnknownAssignees: boolean } }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/projects/${projectId}/tasks/bulk`, { rows, options });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Tasks imported", description: `Created ${data.createdTasks} tasks, ${data.createdSubtasks} subtasks, ${data.errors} errors` });
      setShowTaskImportPanel(false);
      setSelectedProjectForTasks(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to import tasks", description: error.message, variant: "destructive" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string }) => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "notes"] });
      setNewNoteBody("");
      toast({ title: "Note added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (data: { users: typeof csvData; sendInvite: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/import-users`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setBulkImportResults(data.results || []);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "audit"] });
      toast({ 
        title: "Bulk import complete", 
        description: `${data.successCount} imported, ${data.failCount} failed` 
      });
    },
    onError: (error: any) => {
      toast({ title: "Bulk import failed", description: error.message, variant: "destructive" });
    },
  });

  const updateTenantMutation = useMutation({
    mutationFn: async (data: { name?: string; status?: string }) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${tenant?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setHasUnsavedChanges(false);
      toast({ title: "Tenant updated successfully" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "health"] });
      toast({ 
        title: "Tenant activated", 
        description: `"${tenant?.name}" is now active and accessible to users.` 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to activate tenant", 
        description: message, 
        variant: "destructive" 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenant?.id, "health"] });
      toast({ 
        title: "Tenant suspended", 
        description: `"${tenant?.name}" has been suspended. Users cannot access the platform.` 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to suspend tenant", 
        description: message, 
        variant: "destructive" 
      });
      setConfirmDialog({ open: false, action: null, title: "", description: "" });
    },
  });

  // Helper to open confirmation dialog for status changes
  const openConfirmDialog = (action: "suspend" | "activate" | "reactivate") => {
    const configs = {
      suspend: {
        title: "Suspend Tenant",
        description: `Are you sure you want to suspend "${tenant?.name}"? Users will lose access to the platform until the tenant is reactivated.`,
      },
      activate: {
        title: "Activate Tenant",
        description: `Are you sure you want to activate "${tenant?.name}"? This will make the tenant live and allow users to access the platform.`,
      },
      reactivate: {
        title: "Reactivate Tenant",
        description: `Are you sure you want to reactivate "${tenant?.name}"? Users will regain access to the platform.`,
      },
    };
    setConfirmDialog({ open: true, action, ...configs[action] });
  };

  // Execute the confirmed action
  const handleConfirmAction = () => {
    if (confirmDialog.action === "suspend") {
      suspendMutation.mutate();
    } else if (confirmDialog.action === "activate" || confirmDialog.action === "reactivate") {
      activateMutation.mutate();
    }
  };

  const inviteAdminMutation = useMutation({
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenant?.id}/invite-admin`, data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      setLastInviteUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ 
        title: "Invitation created", 
        description: `Invite link generated for ${variables.email}. Copy and share with the administrator.` 
      });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to invite admin", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  const handleNameChange = (value: string) => {
    setEditedName(value);
    setHasUnsavedChanges(value !== tenant?.name);
  };

  const handleSaveName = () => {
    if (editedName !== tenant?.name) {
      updateTenantMutation.mutate({ name: editedName });
    }
  };

  const handleInviteAdmin = () => {
    if (!inviteEmail) return;
    inviteAdminMutation.mutate({
      email: inviteEmail,
      firstName: inviteFirstName || undefined,
      lastName: inviteLastName || undefined,
      inviteType: "link",
    });
  };

  const copyInviteUrl = () => {
    if (lastInviteUrl) {
      navigator.clipboard.writeText(lastInviteUrl);
      toast({ title: "Copied", description: "Invite URL copied to clipboard" });
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        toast({ title: "Invalid CSV", description: "CSV must have a header row and at least one data row", variant: "destructive" });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const emailIndex = headers.indexOf('email');
      const firstNameIndex = headers.indexOf('firstname') >= 0 ? headers.indexOf('firstname') : headers.indexOf('first_name');
      const lastNameIndex = headers.indexOf('lastname') >= 0 ? headers.indexOf('lastname') : headers.indexOf('last_name');
      const roleIndex = headers.indexOf('role');

      if (emailIndex === -1) {
        toast({ title: "Invalid CSV", description: "CSV must have an 'email' column", variant: "destructive" });
        return;
      }

      const parsedUsers: Array<{ email: string; firstName?: string; lastName?: string; role?: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
        const email = values[emailIndex];
        if (!email || !email.includes('@')) continue;

        parsedUsers.push({
          email,
          firstName: firstNameIndex >= 0 ? values[firstNameIndex] : undefined,
          lastName: lastNameIndex >= 0 ? values[lastNameIndex] : undefined,
          role: roleIndex >= 0 && ['admin', 'employee'].includes(values[roleIndex]?.toLowerCase()) 
            ? values[roleIndex].toLowerCase() as 'admin' | 'employee'
            : 'employee',
        });
      }

      setCsvData(parsedUsers);
      setBulkImportResults([]);
      toast({ title: "CSV parsed", description: `${parsedUsers.length} users found` });
    };
    reader.readAsText(file);
  };

  const handleBulkImport = () => {
    if (csvData.length === 0) return;
    bulkImportMutation.mutate({ users: csvData, sendInvite: sendInviteEmails });
  };

  const copyAllInviteUrls = () => {
    const urls = bulkImportResults.filter(r => r.success && r.inviteUrl).map(r => `${r.email}: ${r.inviteUrl}`).join('\n');
    navigator.clipboard.writeText(urls);
    toast({ title: "Copied", description: "All invite URLs copied to clipboard" });
  };

  if (!tenant) return null;

  const onboardingProgress: OnboardingProgress = {
    workspace: true,
    branding: !!settingsResponse?.tenantSettings?.logoUrl,
    email: false,
    users: (tenant.userCount || 0) > 0,
    activated: tenant.status === "active",
  };

  const completedSteps = Object.values(onboardingProgress).filter(Boolean).length;
  const totalSteps = Object.keys(onboardingProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={tenant.settings?.displayName || tenant.name}
      description={`/${tenant.slug}`}
      hasUnsavedChanges={hasUnsavedChanges}
      width="2xl"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {getStatusBadge(tenant.status)}
          <div className="flex items-center gap-2">
            {tenant.status === "inactive" && (
              <Button 
                size="sm" 
                onClick={() => openConfirmDialog("activate")}
                disabled={activateMutation.isPending}
                data-testid="button-activate-tenant"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Activate
              </Button>
            )}
            {tenant.status === "active" && (
              <Button 
                size="sm" 
                variant="outline"
                onClick={() => openConfirmDialog("suspend")}
                disabled={suspendMutation.isPending}
                data-testid="button-suspend-tenant"
              >
                <PauseCircle className="h-4 w-4 mr-2" />
                Suspend
              </Button>
            )}
            {tenant.status === "suspended" && (
              <Button 
                size="sm" 
                onClick={() => openConfirmDialog("reactivate")}
                disabled={activateMutation.isPending}
                data-testid="button-reactivate-tenant"
              >
                <Power className="h-4 w-4 mr-2" />
                Reactivate
              </Button>
            )}
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-8">
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Building2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquare className="h-4 w-4 mr-2" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="clients" data-testid="tab-clients">
              <Briefcase className="h-4 w-4 mr-2" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-projects">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="onboarding" data-testid="tab-onboarding">
              <Settings className="h-4 w-4 mr-2" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="workspaces" data-testid="tab-workspaces">
              <HardDrive className="h-4 w-4 mr-2" />
              Workspaces
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="branding" data-testid="tab-branding">
              <Palette className="h-4 w-4 mr-2" />
              Branding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant-name">Organization Name</Label>
                  <div className="flex gap-2">
                    <Input
                      id="tenant-name"
                      value={editedName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      data-testid="input-tenant-name"
                    />
                    {hasUnsavedChanges && (
                      <Button 
                        onClick={handleSaveName} 
                        disabled={updateTenantMutation.isPending}
                        data-testid="button-save-name"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>URL Slug</Label>
                  <div className="text-sm text-muted-foreground">/{tenant.slug}</div>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Users</div>
                    <div className="text-2xl font-semibold">{tenant.userCount || 0}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Created</div>
                    <div className="text-sm">{new Date(tenant.createdAt!).toLocaleDateString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {tenant.status === "inactive" && (
              <Card className="border-amber-500/20 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    Onboarding Progress
                  </CardTitle>
                  <CardDescription>Complete the setup to activate this tenant</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{completedSteps} of {totalSteps} steps completed</span>
                      <span>{progressPercent}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-amber-500 transition-all duration-300" 
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4"
                      onClick={() => setActiveTab("onboarding")}
                      data-testid="button-continue-onboarding"
                    >
                      Continue Onboarding
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Heart className="h-4 w-4" />
                  Health Summary
                </CardTitle>
                <CardDescription>Quick status overview of tenant configuration</CardDescription>
              </CardHeader>
              <CardContent>
                {healthLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : healthData ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        {healthData.primaryWorkspaceExists ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-sm">Primary Workspace</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {healthData.users.total > 0 ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-sm">{healthData.users.total} Users</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {healthData.integrations.mailgunConfigured ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-sm">Email Integration</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {healthData.branding.logoConfigured ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                        )}
                        <span className="text-sm">Logo Configured</span>
                      </div>
                    </div>
                    {healthData.warnings.length > 0 && (
                      <div className="pt-2 border-t space-y-1">
                        <div className="text-sm font-medium text-amber-600">Warnings:</div>
                        {healthData.warnings.map((warning, i) => (
                          <div key={i} className="text-sm text-muted-foreground flex items-center gap-2">
                            <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                            {warning}
                          </div>
                        ))}
                      </div>
                    )}
                    {healthData.canEnableStrict && (
                      <div className="pt-2 border-t">
                        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Ready for Strict Tenancy
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Failed to load health data</div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Internal Notes
                </CardTitle>
                <CardDescription>Private notes visible only to super admins</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Select value={newNoteCategory} onValueChange={setNewNoteCategory}>
                      <SelectTrigger className="w-32" data-testid="select-note-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Add a note..."
                      value={newNoteBody}
                      onChange={(e) => setNewNoteBody(e.target.value)}
                      className="flex-1"
                      data-testid="input-new-note"
                    />
                    <Button
                      onClick={() => createNoteMutation.mutate({ body: newNoteBody, category: newNoteCategory })}
                      disabled={!newNoteBody.trim() || createNoteMutation.isPending}
                      data-testid="button-add-note"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      Add
                    </Button>
                  </div>
                </div>

                {notesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : notesResponse?.notes && notesResponse.notes.length > 0 ? (
                  <div className="space-y-3">
                    {notesResponse.notes.map((note) => (
                      <div key={note.id} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {note.category}
                            </Badge>
                            <span className="text-sm font-medium">{note.author?.name || "Unknown"}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {new Date(note.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm">{note.body}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No notes yet. Add a note above.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Audit Timeline
                </CardTitle>
                <CardDescription>Recent actions and events for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : auditResponse?.events && auditResponse.events.length > 0 ? (
                  <div className="space-y-3">
                    {auditResponse.events.map((event) => (
                      <div key={event.id} className="flex items-start gap-3 border-l-2 border-muted pl-3 pb-3">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs font-mono">
                              {event.eventType.replace(/_/g, " ")}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(event.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm">{event.message}</p>
                          {event.actor && (
                            <div className="text-xs text-muted-foreground">
                              by {event.actor.name || event.actor.email}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-sm text-muted-foreground">
                    No audit events recorded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Clients</CardTitle>
                    <CardDescription>Manage client companies for this tenant</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search clients..."
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-client-search"
                    />
                  </div>
                </div>

                {clientsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : clientsResponse?.clients && clientsResponse.clients.length > 0 ? (
                  <div className="border rounded-md max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background border-b">
                        <tr>
                          <th className="text-left p-2">Company Name</th>
                          <th className="text-left p-2">Industry</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Created</th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientsResponse.clients.map((client) => (
                          <tr key={client.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="p-2 font-medium">{client.companyName}</td>
                            <td className="p-2 text-muted-foreground">{client.industry || "-"}</td>
                            <td className="p-2">
                              <Badge variant={client.status === "active" ? "default" : "secondary"}>
                                {client.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-muted-foreground text-xs">
                              {new Date(client.createdAt).toLocaleDateString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No clients found. Import clients below to get started.
                  </div>
                )}
              </CardContent>
            </Card>

            <CsvImportPanel
              title="Bulk Import Clients"
              description="Import multiple clients from a CSV file"
              columns={[
                { key: "companyName", label: "Company Name", required: true },
                { key: "industry", label: "Industry" },
                { key: "website", label: "Website" },
                { key: "phone", label: "Phone" },
                { key: "address1", label: "Address 1" },
                { key: "address2", label: "Address 2" },
                { key: "city", label: "City" },
                { key: "state", label: "State" },
                { key: "zip", label: "Zip" },
                { key: "country", label: "Country" },
                { key: "notes", label: "Notes" },
                { key: "primaryContactEmail", label: "Contact Email" },
                { key: "primaryContactFirstName", label: "Contact First Name" },
                { key: "primaryContactLastName", label: "Contact Last Name" },
              ]}
              templateFilename="clients_template.csv"
              onImport={async (rows) => {
                const result = await bulkClientsImportMutation.mutateAsync(rows);
                return {
                  created: result.created,
                  skipped: result.skipped,
                  errors: result.errors,
                  results: result.results.map((r: any) => ({
                    name: r.companyName,
                    status: r.status,
                    reason: r.reason,
                    id: r.clientId,
                  })),
                };
              }}
              isImporting={bulkClientsImportMutation.isPending}
              nameField="companyName"
            />
          </TabsContent>

          <TabsContent value="projects" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Projects</CardTitle>
                    <CardDescription>Manage projects for this tenant</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search projects..."
                      value={projectSearch}
                      onChange={(e) => setProjectSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-project-search"
                    />
                  </div>
                </div>

                {projectsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : projectsResponse?.projects && projectsResponse.projects.length > 0 ? (
                  <div className="border rounded-md max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-background border-b">
                        <tr>
                          <th className="text-left p-2">Project Name</th>
                          <th className="text-left p-2">Client</th>
                          <th className="text-left p-2">Status</th>
                          <th className="text-left p-2">Created</th>
                          <th className="text-left p-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectsResponse.projects.map((project) => (
                          <tr key={project.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-sm" 
                                  style={{ backgroundColor: project.color || "#3B82F6" }} 
                                />
                                <span className="font-medium">{project.name}</span>
                              </div>
                            </td>
                            <td className="p-2 text-muted-foreground">{project.clientName || "-"}</td>
                            <td className="p-2">
                              <Badge variant={project.status === "active" ? "default" : "secondary"}>
                                {project.status}
                              </Badge>
                            </td>
                            <td className="p-2 text-muted-foreground text-xs">
                              {new Date(project.createdAt).toLocaleDateString()}
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedProjectForTasks(project);
                                    setShowTaskImportPanel(false);
                                  }}
                                  data-testid={`button-template-${project.id}`}
                                >
                                  <FileText className="h-3 w-3 mr-1" />
                                  Template
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setSelectedProjectForTasks(project);
                                    setShowTaskImportPanel(true);
                                  }}
                                  data-testid={`button-import-tasks-${project.id}`}
                                >
                                  <Upload className="h-3 w-3 mr-1" />
                                  Import
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No projects found. Import projects below to get started.
                  </div>
                )}
              </CardContent>
            </Card>

            <CsvImportPanel
              title="Bulk Import Projects"
              description="Import multiple projects from a CSV file"
              columns={[
                { key: "projectName", label: "Project Name", required: true },
                { key: "clientCompanyName", label: "Client Company Name" },
                { key: "description", label: "Description" },
                { key: "status", label: "Status" },
                { key: "color", label: "Color" },
                { key: "startDate", label: "Start Date" },
                { key: "dueDate", label: "Due Date" },
              ]}
              templateFilename="projects_template.csv"
              onImport={async (rows, options) => {
                const result = await bulkProjectsImportMutation.mutateAsync({
                  projects: rows,
                  options: { autoCreateMissingClients: options.autoCreateMissingClients || false },
                });
                return {
                  created: result.created,
                  skipped: result.skipped,
                  errors: result.errors,
                  results: result.results.map((r: any) => ({
                    name: r.projectName,
                    status: r.status,
                    reason: r.reason,
                    id: r.projectId,
                  })),
                };
              }}
              isImporting={bulkProjectsImportMutation.isPending}
              options={[
                { key: "autoCreateMissingClients", label: "Auto-create missing clients", defaultValue: false },
              ]}
              nameField="projectName"
            />

            {selectedProjectForTasks && !showTaskImportPanel && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Apply Task Template</CardTitle>
                      <CardDescription>
                        Apply a template to "{selectedProjectForTasks.name}" to create sections and tasks
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedProjectForTasks(null)}
                      data-testid="button-close-template-panel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { key: "client_onboarding", name: "Client Onboarding", description: "Kickoff, Discovery, and Delivery phases" },
                      { key: "website_build", name: "Website Build", description: "Planning, Design, Development, and Launch" },
                      { key: "general_setup", name: "General Setup", description: "Basic To Do, In Progress, Review, Done workflow" },
                    ].map((template) => (
                      <div
                        key={template.key}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          selectedTemplate === template.key ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"
                        }`}
                        onClick={() => setSelectedTemplate(template.key)}
                        data-testid={`template-option-${template.key}`}
                      >
                        <div className="font-medium text-sm">{template.name}</div>
                        <div className="text-xs text-muted-foreground mt-1">{template.description}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedProjectForTasks(null);
                        setSelectedTemplate("");
                      }}
                      data-testid="button-cancel-template"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedTemplate && selectedProjectForTasks) {
                          applyTaskTemplateMutation.mutate({
                            projectId: selectedProjectForTasks.id,
                            templateKey: selectedTemplate,
                          });
                        }
                      }}
                      disabled={!selectedTemplate || applyTaskTemplateMutation.isPending}
                      data-testid="button-apply-template"
                    >
                      {applyTaskTemplateMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Apply Template
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedProjectForTasks && showTaskImportPanel && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">Bulk Import Tasks</CardTitle>
                      <CardDescription>
                        Import tasks from CSV into "{selectedProjectForTasks.name}"
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedProjectForTasks(null);
                        setShowTaskImportPanel(false);
                      }}
                      data-testid="button-close-task-import-panel"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <CsvImportPanel
                    title=""
                    description=""
                    columns={[
                      { key: "sectionName", label: "Section Name", required: true },
                      { key: "taskTitle", label: "Task Title", required: true },
                      { key: "description", label: "Description" },
                      { key: "status", label: "Status" },
                      { key: "priority", label: "Priority" },
                      { key: "dueDate", label: "Due Date (YYYY-MM-DD)" },
                      { key: "assigneeEmails", label: "Assignee Emails (comma-separated)" },
                      { key: "parentTaskTitle", label: "Parent Task Title (for subtasks)" },
                    ]}
                    templateFilename="tasks_template.csv"
                    onImport={async (rows, options) => {
                      const result = await bulkTasksImportMutation.mutateAsync({
                        projectId: selectedProjectForTasks.id,
                        rows,
                        options: {
                          createMissingSections: options.createMissingSections !== false,
                          allowUnknownAssignees: options.allowUnknownAssignees || false,
                        },
                      });
                      return {
                        created: result.createdTasks + result.createdSubtasks,
                        skipped: result.skipped,
                        errors: result.errors,
                        results: result.results.map((r: any) => ({
                          name: rows[r.rowIndex]?.taskTitle || `Row ${r.rowIndex}`,
                          status: r.status,
                          reason: r.reason,
                          id: r.taskId || r.parentTaskId,
                        })),
                      };
                    }}
                    isImporting={bulkTasksImportMutation.isPending}
                    options={[
                      { key: "createMissingSections", label: "Create missing sections", defaultValue: true },
                      { key: "allowUnknownAssignees", label: "Allow unknown assignees", defaultValue: false },
                    ]}
                    nameField="taskTitle"
                  />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Setup Wizard</CardTitle>
                <CardDescription>Follow these steps to fully configure the tenant</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <OnboardingStepItem
                    step={1}
                    title="Primary Workspace Created"
                    description="A primary workspace was automatically created"
                    completed={onboardingProgress.workspace}
                    active={false}
                  />
                  <OnboardingStepItem
                    step={2}
                    title="Configure Branding"
                    description="Set up logo, colors, and white-label options"
                    completed={onboardingProgress.branding}
                    active={!onboardingProgress.branding}
                    action={() => setActiveTab("branding")}
                  />
                  <OnboardingStepItem
                    step={3}
                    title="Invite Administrators"
                    description="Invite tenant administrators to manage the organization"
                    completed={onboardingProgress.users}
                    active={onboardingProgress.branding && !onboardingProgress.users}
                    action={() => setActiveTab("users")}
                  />
                  <OnboardingStepItem
                    step={4}
                    title="Activate Tenant"
                    description="Make the tenant live for users to access"
                    completed={onboardingProgress.activated}
                    active={!onboardingProgress.activated}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Data Setup</CardTitle>
                <CardDescription>Quickly seed starter data to help the tenant get started</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">Create Welcome Project</div>
                    <div className="text-sm text-muted-foreground">
                      Seeds a starter project with sections and sample tasks to demonstrate workflow
                    </div>
                  </div>
                  <Button
                    onClick={() => seedWelcomeProjectMutation.mutate()}
                    disabled={seedWelcomeProjectMutation.isPending}
                    data-testid="button-seed-welcome-project"
                  >
                    {seedWelcomeProjectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="h-4 w-4 mr-2" />
                    )}
                    Create Welcome Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workspaces" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Workspaces
                </CardTitle>
                <CardDescription>Workspaces belonging to this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                {workspacesLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : workspaces.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No workspaces found
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`workspace-row-${workspace.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <Briefcase className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="font-medium">{workspace.name}</div>
                            <div className="text-xs text-muted-foreground">{workspace.id}</div>
                          </div>
                        </div>
                        {workspace.isPrimary && (
                          <Badge variant="secondary">Primary</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite Administrator
                </CardTitle>
                <CardDescription>Invite a tenant admin to manage this organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="invite-first-name">First Name</Label>
                    <Input
                      id="invite-first-name"
                      value={inviteFirstName}
                      onChange={(e) => setInviteFirstName(e.target.value)}
                      placeholder="John"
                      data-testid="input-invite-first-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invite-last-name">Last Name</Label>
                    <Input
                      id="invite-last-name"
                      value={inviteLastName}
                      onChange={(e) => setInviteLastName(e.target.value)}
                      placeholder="Doe"
                      data-testid="input-invite-last-name"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invite-email">Email Address</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="admin@example.com"
                    data-testid="input-invite-email"
                  />
                </div>
                <Button 
                  onClick={handleInviteAdmin}
                  disabled={!inviteEmail || inviteAdminMutation.isPending}
                  data-testid="button-invite-admin"
                >
                  {inviteAdminMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create Invite Link
                    </>
                  )}
                </Button>

                {lastInviteUrl && (
                  <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Check className="h-4 w-4 text-green-600" />
                        <span className="text-sm text-green-700">Invitation created</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={copyInviteUrl} data-testid="button-copy-invite">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Link
                      </Button>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground font-mono truncate">
                      {lastInviteUrl}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Users</CardTitle>
                <CardDescription>
                  {tenant.userCount || 0} user{(tenant.userCount || 0) === 1 ? '' : 's'} in this tenant
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  User list coming soon
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Bulk CSV Import
                </CardTitle>
                <CardDescription>Import multiple users at once from a CSV file</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="csv-upload">Upload CSV File</Label>
                  <div className="flex gap-2">
                    <Input
                      id="csv-upload"
                      type="file"
                      accept=".csv"
                      onChange={handleCsvFileChange}
                      className="flex-1"
                      data-testid="input-csv-upload"
                    />
                    {csvData.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setCsvData([]); setBulkImportResults([]); }}
                        data-testid="button-clear-csv"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Required columns: email. Optional: firstName, lastName, role (admin/employee)
                  </p>
                </div>

                {csvData.length > 0 && (
                  <div className="space-y-3">
                    <div className="border rounded-md max-h-40 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background border-b">
                          <tr>
                            <th className="text-left p-2">Email</th>
                            <th className="text-left p-2">Name</th>
                            <th className="text-left p-2">Role</th>
                          </tr>
                        </thead>
                        <tbody>
                          {csvData.slice(0, 10).map((user, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2 font-mono text-xs">{user.email}</td>
                              <td className="p-2">{[user.firstName, user.lastName].filter(Boolean).join(' ') || '-'}</td>
                              <td className="p-2">
                                <Badge variant="secondary" className="text-xs">{user.role || 'employee'}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {csvData.length > 10 && (
                        <div className="p-2 text-center text-xs text-muted-foreground border-t">
                          ...and {csvData.length - 10} more
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={sendInviteEmails}
                          onChange={(e) => setSendInviteEmails(e.target.checked)}
                          className="rounded"
                          data-testid="checkbox-send-invite-emails"
                        />
                        Send invite emails (requires Mailgun)
                      </label>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={handleBulkImport}
                        disabled={bulkImportMutation.isPending}
                        data-testid="button-bulk-import"
                      >
                        {bulkImportMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Import {csvData.length} Users
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {bulkImportResults.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">Import Results</div>
                      <Button size="sm" variant="outline" onClick={copyAllInviteUrls} data-testid="button-copy-all-urls">
                        <Copy className="h-4 w-4 mr-2" />
                        Copy All URLs
                      </Button>
                    </div>
                    <div className="border rounded-md max-h-48 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-background border-b">
                          <tr>
                            <th className="text-left p-2">Email</th>
                            <th className="text-left p-2">Status</th>
                            <th className="text-left p-2">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {bulkImportResults.map((result, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2 font-mono text-xs">{result.email}</td>
                              <td className="p-2">
                                {result.success ? (
                                  <div className="flex items-center gap-1">
                                    <CheckCircle className="h-3 w-3 text-green-500" />
                                    <span className="text-green-600 text-xs">Success</span>
                                    {result.emailSent && (
                                      <Badge variant="secondary" className="text-xs ml-1">Emailed</Badge>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3 text-red-500" />
                                    <span className="text-red-600 text-xs">{result.error}</span>
                                  </div>
                                )}
                              </td>
                              <td className="p-2">
                                {result.success && result.inviteUrl && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2"
                                    onClick={() => {
                                      navigator.clipboard.writeText(result.inviteUrl!);
                                      toast({ title: "Copied", description: "Invite URL copied" });
                                    }}
                                    data-testid={`button-copy-url-${i}`}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="branding" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">White Label Settings</CardTitle>
                <CardDescription>Configure branding and appearance for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  Branding configuration coming soon.
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="ml-2"
                    onClick={() => onOpenChange(false)}
                    data-testid="button-use-settings-dialog"
                  >
                    Use existing settings dialog
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog for destructive actions (suspend/activate/reactivate) */}
      <AlertDialog 
        open={confirmDialog.open} 
        onOpenChange={(open) => {
          if (!open) {
            setConfirmDialog({ open: false, action: null, title: "", description: "" });
          }
        }}
      >
        <AlertDialogContent data-testid="confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle data-testid="confirm-dialog-title">
              {confirmDialog.title}
            </AlertDialogTitle>
            <AlertDialogDescription data-testid="confirm-dialog-description">
              {confirmDialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={activateMutation.isPending || suspendMutation.isPending}
              data-testid="confirm-dialog-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={activateMutation.isPending || suspendMutation.isPending}
              className={confirmDialog.action === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              data-testid="confirm-dialog-confirm"
            >
              {(activateMutation.isPending || suspendMutation.isPending) ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                confirmDialog.action === "suspend" ? "Suspend Tenant" :
                confirmDialog.action === "activate" ? "Activate Tenant" :
                "Reactivate Tenant"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullScreenDrawer>
  );
}

interface OnboardingStepItemProps {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  active: boolean;
  action?: () => void;
}

function OnboardingStepItem({ step, title, description, completed, active, action }: OnboardingStepItemProps) {
  return (
    <div 
      className={`flex items-start gap-4 p-3 rounded-lg border ${
        completed ? "bg-green-500/5 border-green-500/20" : 
        active ? "bg-primary/5 border-primary/20" : 
        "opacity-60"
      }`}
      data-testid={`onboarding-step-${step}`}
    >
      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
        completed ? "bg-green-500 text-white" : 
        active ? "bg-primary text-primary-foreground" : 
        "bg-secondary text-muted-foreground"
      }`}>
        {completed ? <Check className="h-4 w-4" /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{title}</div>
        <div className="text-sm text-muted-foreground">{description}</div>
      </div>
      {active && action && (
        <Button size="sm" variant="outline" onClick={action} data-testid={`button-step-${step}-action`}>
          Configure
        </Button>
      )}
    </div>
  );
}

/**
 * TabLoadingSkeleton - Consistent loading skeleton for tab content
 * Used to show a placeholder while tab data is being fetched
 */
function TabLoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48 mt-1" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
