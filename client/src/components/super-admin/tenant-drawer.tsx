import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ApiError } from "@/lib/queryClient";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Plus,
  TestTube,
  Eye,
  EyeOff,
  Lock,
  RefreshCw,
  Trash2,
  Edit2,
  Download,
  History
} from "lucide-react";
import { CsvImportPanel, type ParsedRow, type ImportResult, type CsvColumn } from "@/components/common/csv-import-panel";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TenantUserDrawer } from "./tenant-user-drawer";
import { ProvisionUserDrawer } from "./provision-user-drawer";
import { S3Dropzone } from "@/components/common/S3Dropzone";
import { RichTextEditor, RichTextViewer } from "@/components/ui/rich-text-editor";
import type { Tenant } from "@shared/schema";

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
  lastEditedByUserId?: string | null;
  body: string;
  category: string;
  createdAt: string;
  updatedAt?: string;
  author: {
    id: string;
    name: string;
    email: string;
  };
  versionCount?: number;
  hasVersions?: boolean;
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

/**
 * TenantDrawerProps - Props for the TenantDrawer component
 * 
 * MODE SWITCHING:
 * - mode="edit" (default): Tenant exists, show all tabs for managing tenant
 * - mode="create": No tenant yet, show wizard for creating new tenant
 * 
 * After creation in "create" mode:
 * - Drawer transitions to "edit" mode for the newly created tenant
 * - All tabs become available for further configuration
 * 
 * IDEMPOTENCY:
 * - Backend creates tenant + primary workspace + settings in a single transaction
 * - Retrying creation with same data will fail with 409 (slug conflict)
 * - Frontend handles transition to edit mode seamlessly
 */
interface TenantDrawerProps {
  tenant: TenantWithDetails | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTenantUpdated?: () => void;
  mode?: "create" | "edit";
  onTenantCreated?: (tenant: TenantWithDetails) => void;
}

type WizardStep = "basics" | "workspace" | "branding" | "integrations" | "invite" | "review";

const WIZARD_STEPS: { id: WizardStep; title: string; description: string }[] = [
  { id: "basics", title: "Tenant Basics", description: "Organization name and URL" },
  { id: "workspace", title: "Primary Workspace", description: "Auto-created workspace" },
  { id: "branding", title: "Branding", description: "Logo and colors (optional)" },
  { id: "integrations", title: "Integrations", description: "Email and storage (optional)" },
  { id: "invite", title: "Invite Admin", description: "Invite tenant administrator" },
  { id: "review", title: "Review & Finish", description: "Summary and completion" },
];

type OnboardingStep = "workspace" | "branding" | "email" | "users" | "activate";

interface OnboardingProgress {
  workspace: boolean;
  branding: boolean;
  email: boolean;
  users: boolean;
  activated: boolean;
}

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

function IntegrationStatusBadge({ status }: { status: IntegrationStatus }) {
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
  return <Badge variant="secondary">Not Configured</Badge>;
}

interface FixTenantIdsResult {
  message: string;
  fixed: number;
  tenantId: string;
  tenantName: string;
}

function FixTenantIdsCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<FixTenantIdsResult | null>(null);
  
  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/users/fix-tenant-ids`, {});
      return res.json() as Promise<FixTenantIdsResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.fixed > 0) {
        toast({
          title: "Users Fixed",
          description: `Fixed ${data.fixed} user(s) with missing tenant assignment.`,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/v1/super/tenants/${tenantId}/users`] });
      } else {
        toast({
          title: "No Issues Found",
          description: "All users already have correct tenant assignments.",
        });
      }
    },
    onError: async (error: any) => {
      let details = error.message || "Failed to fix tenant IDs";
      try {
        const errorData = error?.response ? await error.response.json() : null;
        if (errorData?.details) {
          details = `${errorData.error}: ${errorData.details}`;
        }
      } catch { /* ignore */ }
      toast({
        title: "Fix Failed",
        description: details,
        variant: "destructive",
      });
    },
  });
  
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              Fix User Tenant Assignments
            </h4>
            <p className="text-sm text-muted-foreground">
              Scan for users associated with {tenantName} who are missing their tenant assignment 
              and fix them automatically. Use this if users are getting "Unable to Load Tenant" errors.
            </p>
            {lastResult && (
              <p className="text-xs text-muted-foreground mt-2">
                Last run: Fixed {lastResult.fixed} user(s)
              </p>
            )}
          </div>
          <Button 
            variant="outline"
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending}
            data-testid="button-fix-tenant-ids"
          >
            {fixMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {fixMutation.isPending ? "Scanning..." : "Fix Tenant IDs"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface FixClientTenantIdsResult {
  success: boolean;
  fixed: number;
  errors: number;
  fixedClients: { id: string; companyName: string; action: string }[];
  errorDetails: { id: string; companyName: string; error: string }[];
  message: string;
}

function FixClientTenantIdsCard({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<FixClientTenantIdsResult | null>(null);
  
  const fixMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/clients/fix-tenant-ids`, {});
      return res.json() as Promise<FixClientTenantIdsResult>;
    },
    onSuccess: (data) => {
      setLastResult(data);
      if (data.fixed > 0) {
        toast({
          title: "Clients Fixed",
          description: `Fixed ${data.fixed} client(s) with missing tenant assignment.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", tenantId, "clients"] });
      } else {
        toast({
          title: "No Issues Found",
          description: "All clients already have correct tenant assignments.",
        });
      }
    },
    onError: async (error: any) => {
      let details = error.message || "Failed to fix client tenant IDs";
      try {
        const errorData = error?.response ? await error.response.json() : null;
        if (errorData?.details) {
          details = `${errorData.error}: ${errorData.details}`;
        }
      } catch { /* ignore */ }
      toast({
        title: "Fix Failed",
        description: details,
        variant: "destructive",
      });
    },
  });
  
  return (
    <Card className="border-amber-500/20 bg-amber-500/5">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h4 className="font-medium flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              Fix Client Tenant Assignments
            </h4>
            <p className="text-sm text-muted-foreground">
              Scan for clients that are missing their tenant assignment and fix them automatically. 
              Use this if clients created by super admin are not visible to tenant users.
            </p>
            {lastResult && (
              <p className="text-xs text-muted-foreground mt-2">
                Last run: Fixed {lastResult.fixed} client(s)
                {lastResult.fixedClients.length > 0 && (
                  <span className="block">
                    {lastResult.fixedClients.map(c => c.companyName).join(", ")}
                  </span>
                )}
              </p>
            )}
          </div>
          <Button 
            variant="outline"
            onClick={() => fixMutation.mutate()}
            disabled={fixMutation.isPending}
            data-testid="button-fix-client-tenant-ids"
          >
            {fixMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {fixMutation.isPending ? "Scanning..." : "Fix Client IDs"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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
 * 
 * MODE SWITCHING (create -> edit):
 * - In create mode, wizard guides through tenant creation steps
 * - After Step 1 (Basics), tenant is created with primary workspace auto-generated
 * - Drawer seamlessly transitions to edit mode with tenantId available
 * - Wizard continues with optional steps (branding, integrations, invite)
 */
export function TenantDrawer({ tenant, open, onOpenChange, onTenantUpdated, mode = "edit", onTenantCreated }: TenantDrawerProps) {
  const { toast } = useToast();
  
  // Create mode state - tracks whether we're in wizard flow
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">(mode);
  const [wizardStep, setWizardStep] = useState<WizardStep>("basics");
  const [createdTenant, setCreatedTenant] = useState<TenantWithDetails | null>(null);
  
  // Create form state
  const [createName, setCreateName] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Determine active tenant - either passed prop or newly created
  const activeTenant = tenant || createdTenant;
  
  // Reset create mode state when mode prop changes or drawer opens
  useEffect(() => {
    if (open) {
      setDrawerMode(mode);
      if (mode === "create") {
        setWizardStep("basics");
        setCreatedTenant(null);
        setCreateName("");
        setCreateSlug("");
        setCreateError(null);
      }
    }
  }, [open, mode]);
  
  // Helper to generate slug from name
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
  };
  
  // Create tenant mutation
  const createTenantMutation = useMutation({
    mutationFn: async (data: { name: string; slug: string }) => {
      const response = await apiRequest("POST", "/api/v1/super/tenants", data);
      return (await response.json()) as TenantWithDetails;
    },
    onSuccess: (newTenant) => {
      // Cache invalidation
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants"] });
      
      // Store created tenant and transition to workspace step
      // Note: We don't call onTenantCreated here - that happens when wizard finishes
      setCreatedTenant(newTenant);
      setWizardStep("workspace");
      setCreateError(null);
      
      toast({ 
        title: "Tenant created", 
        description: `${newTenant.name} has been created with primary workspace` 
      });
    },
    onError: (error: Error) => {
      // Extract requestId from ApiError for support correlation
      const requestId = error instanceof ApiError ? error.requestId : null;
      const errorMessage = error.message || "Failed to create tenant";
      
      // Show error with requestId for support
      const displayMessage = requestId 
        ? `${errorMessage}\n\nRequest ID: ${requestId}` 
        : errorMessage;
      
      setCreateError(displayMessage);
      toast({ 
        title: "Failed to create tenant", 
        description: requestId 
          ? `${errorMessage}. Request ID: ${requestId}` 
          : errorMessage, 
        variant: "destructive" 
      });
    },
  });
  
  // Handle create tenant form submission
  const handleCreateTenant = (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim() || !createSlug.trim()) {
      setCreateError("Name and slug are required");
      return;
    }
    createTenantMutation.mutate({ name: createName.trim(), slug: createSlug.trim() });
  };
  
  // Navigate wizard
  const goToStep = (step: WizardStep) => {
    setWizardStep(step);
  };
  
  const getStepIndex = (step: WizardStep) => WIZARD_STEPS.findIndex(s => s.id === step);
  const currentStepIndex = getStepIndex(wizardStep);
  
  const canGoNext = () => {
    if (wizardStep === "basics" && !createdTenant) return false;
    return currentStepIndex < WIZARD_STEPS.length - 1;
  };
  
  const canGoBack = () => currentStepIndex > 0 && wizardStep !== "basics";
  
  const goNext = () => {
    if (canGoNext()) {
      setWizardStep(WIZARD_STEPS[currentStepIndex + 1].id);
    }
  };
  
  const goBack = () => {
    if (canGoBack()) {
      setWizardStep(WIZARD_STEPS[currentStepIndex - 1].id);
    }
  };
  
  // Finish wizard - close create drawer and notify parent to open edit mode
  const finishWizard = () => {
    if (createdTenant) {
      toast({ title: "Setup complete", description: `${createdTenant.name} is ready to use` });
      // Close create drawer first
      onOpenChange(false);
      // Then notify parent with the created tenant so it can open edit mode
      onTenantCreated?.(createdTenant);
    } else {
      onOpenChange(false);
    }
  };
  
  // Tab state with localStorage persistence scoped by tenant ID
  // This allows users to return to the same tab when reopening the drawer for the same tenant
  const getStorageKey = (tenantId: string) => `tenantDrawerTab_${tenantId}`;
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window !== "undefined" && activeTenant?.id) {
      return localStorage.getItem(getStorageKey(activeTenant.id)) || "onboarding";
    }
    return "onboarding";
  });
  
  // Form state
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [editedSlug, setEditedSlug] = useState("");
  const [hasUnsavedSlugChanges, setHasUnsavedSlugChanges] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteFirstName, setInviteFirstName] = useState("");
  const [inviteLastName, setInviteLastName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "employee">("admin");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  
  // Manual user creation state
  const [manualUserMode, setManualUserMode] = useState(false);
  const [manualUserEmail, setManualUserEmail] = useState("");
  const [manualUserFirstName, setManualUserFirstName] = useState("");
  const [manualUserLastName, setManualUserLastName] = useState("");
  const [manualUserRole, setManualUserRole] = useState<"admin" | "employee">("employee");
  const [manualUserPassword, setManualUserPassword] = useState("");
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [newNoteBody, setNewNoteBody] = useState("");
  const [newNoteCategory, setNewNoteCategory] = useState("general");
  const [noteSearchQuery, setNoteSearchQuery] = useState("");
  const [noteFilterCategory, setNoteFilterCategory] = useState<string>("all");
  
  // Note edit and version history state
  const [editNoteDialogOpen, setEditNoteDialogOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<{ id: string; body: string; category: string } | null>(null);
  const [editNoteBody, setEditNoteBody] = useState("");
  const [editNoteCategory, setEditNoteCategory] = useState("general");
  const [versionHistoryDialogOpen, setVersionHistoryDialogOpen] = useState(false);
  const [versionHistoryNoteId, setVersionHistoryNoteId] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<Array<{ email: string; firstName?: string; lastName?: string; role?: string }>>([]);
  const [sendInviteEmails, setSendInviteEmails] = useState(false);
  const [bulkImportResults, setBulkImportResults] = useState<Array<{ email: string; success: boolean; inviteUrl?: string; emailSent?: boolean; error?: string }>>([]);
  const [clientSearch, setClientSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [autoCreateClients, setAutoCreateClients] = useState(false);
  const [selectedProjectForTasks, setSelectedProjectForTasks] = useState<TenantProject | null>(null);
  const [showTaskImportPanel, setShowTaskImportPanel] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  // Branding form state
  const [brandingData, setBrandingData] = useState<TenantSettings>({});
  
  // Integrations form state
  const [mailgunData, setMailgunData] = useState<MailgunConfig>({});
  const [s3Data, setS3Data] = useState<S3Config>({});
  const [showApiKey, setShowApiKey] = useState(false);
  const [showSecretKey, setShowSecretKey] = useState(false);

  // Confirmation dialog state for destructive actions
  // action: null = closed, "suspend" | "activate" | "reactivate" = which action to confirm
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: "suspend" | "activate" | "reactivate" | null;
    title: string;
    description: string;
  }>({ open: false, action: null, title: "", description: "" });
  
  // User drawer state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [provisionDrawerOpen, setProvisionDrawerOpen] = useState(false);
  
  // Workspace CRUD state
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingWorkspaceName, setEditingWorkspaceName] = useState("");
  
  // Client CRUD state
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  
  // Project CRUD state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectClientId, setNewProjectClientId] = useState<string>("");

  // Reset form state when tenant changes, restore persisted tab for this tenant
  useEffect(() => {
    if (activeTenant) {
      setEditedName(activeTenant.name);
      setEditedSlug(activeTenant.slug);
      setHasUnsavedChanges(false);
      setHasUnsavedSlugChanges(false);
      // Load persisted tab for this specific tenant, or default to onboarding
      const storedTab = localStorage.getItem(getStorageKey(activeTenant.id));
      setActiveTab(storedTab || "onboarding");
    }
  }, [activeTenant?.id]);

  // Persist active tab to localStorage when it changes
  useEffect(() => {
    if (activeTenant?.id && activeTab) {
      localStorage.setItem(getStorageKey(activeTenant.id), activeTab);
    }
  }, [activeTab, activeTenant?.id]);

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
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "workspaces"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/workspaces`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "workspaces",
  });

  const { data: settingsResponse } = useQuery<{ tenantSettings: TenantSettings | null }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "settings"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/settings`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open,
  });

  // System settings for inherited defaults
  interface SystemSettings {
    id: number;
    defaultAppName: string | null;
    defaultLogoUrl: string | null;
    defaultIconUrl: string | null;
    defaultFaviconUrl: string | null;
  }

  const { data: systemSettings } = useQuery<SystemSettings>({
    queryKey: ["/api/v1/super/system-settings"],
    enabled: open && activeTab === "branding",
  });

  const { data: healthData, isLoading: healthLoading } = useQuery<TenantHealth>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "health"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/health`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && (activeTab === "overview" || activeTab === "notes"),
  });

  const { data: notesData, isLoading: notesLoading } = useQuery<TenantNote[]>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "notes"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/notes`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "notes",
  });

  // Filter and search notes
  const filteredNotes = (notesData || []).filter((note) => {
    const matchesSearch = noteSearchQuery.trim() === "" || 
      note.body.toLowerCase().includes(noteSearchQuery.toLowerCase()) ||
      note.author?.name?.toLowerCase().includes(noteSearchQuery.toLowerCase());
    const matchesCategory = noteFilterCategory === "all" || note.category === noteFilterCategory;
    return matchesSearch && matchesCategory;
  });

  const { data: auditResponse, isLoading: auditLoading } = useQuery<{ events: TenantAuditEvent[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/audit?limit=50`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "notes",
  });

  const { data: clientsResponse, isLoading: clientsLoading } = useQuery<{ clients: TenantClient[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients", clientSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/clients?search=${encodeURIComponent(clientSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "clients",
  });

  // Also load clients for the projects tab (for client dropdown in create project form)
  const { data: allClientsResponse } = useQuery<{ clients: TenantClient[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients-all"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/clients`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "projects",
  });

  const { data: projectsResponse, isLoading: projectsLoading } = useQuery<{ projects: TenantProject[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "projects", projectSearch],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/projects?search=${encodeURIComponent(projectSearch)}`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "projects",
  });

  // Integrations queries (lazy-loaded when integrations tab is active)
  const { data: integrationsResponse } = useQuery<{ integrations: IntegrationSummary[] }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/integrations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "integrations",
  });

  const { data: mailgunIntegration } = useQuery<any>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations", "mailgun"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/integrations/mailgun`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "integrations",
  });

  const { data: s3Integration } = useQuery<any>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations", "s3"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/integrations/s3`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "integrations",
  });

  // Users and invitations queries
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

  interface TenantInvitation {
    id: string;
    email: string;
    role: string;
    status: string;
    expiresAt: string;
    createdAt: string;
    usedAt: string | null;
  }

  const { data: usersResponse, isLoading: usersLoading } = useQuery<{ users: TenantUser[]; total: number }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/users`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "users",
  });

  const { data: invitationsResponse, isLoading: invitationsLoading } = useQuery<{ invitations: TenantInvitation[]; total: number }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"],
    queryFn: () => fetch(`/api/v1/super/tenants/${activeTenant?.id}/invitations`, { credentials: "include" }).then(r => r.json()),
    enabled: !!activeTenant && open && activeTab === "users",
  });

  // Sync branding form data with fetched settings
  useEffect(() => {
    if (settingsResponse?.tenantSettings) {
      setBrandingData(settingsResponse.tenantSettings);
    }
  }, [settingsResponse]);

  // Sync mailgun form data with fetched integration
  useEffect(() => {
    if (mailgunIntegration?.publicConfig) {
      setMailgunData({
        domain: mailgunIntegration.publicConfig.domain || "",
        fromEmail: mailgunIntegration.publicConfig.fromEmail || "",
        replyTo: mailgunIntegration.publicConfig.replyTo || "",
      });
    }
  }, [mailgunIntegration]);

  // Sync S3 form data with fetched integration
  useEffect(() => {
    if (s3Integration?.publicConfig) {
      setS3Data({
        bucketName: s3Integration.publicConfig.bucketName || "",
        region: s3Integration.publicConfig.region || "",
        keyPrefixTemplate: s3Integration.publicConfig.keyPrefixTemplate || "",
      });
    }
  }, [s3Integration]);

  // Helper to get integration status
  const getIntegrationStatus = (provider: string): IntegrationStatus => {
    const integration = integrationsResponse?.integrations?.find(i => i.provider === provider);
    return integration?.status || "not_configured";
  };

  // Branding mutation
  const saveBrandingMutation = useMutation({
    mutationFn: async (settings: Partial<TenantSettings>) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant?.id}/settings`, settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      toast({ title: "Branding settings saved" });
    },
    onError: () => {
      toast({ title: "Failed to save settings", variant: "destructive" });
    },
  });

  // Mailgun mutation
  const saveMailgunMutation = useMutation({
    mutationFn: async (data: MailgunConfig) => {
      return apiRequest("PUT", `/api/v1/super/tenants/${activeTenant?.id}/integrations/mailgun`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations"] });
      toast({ title: "Mailgun configuration saved" });
      setMailgunData(prev => ({ ...prev, apiKey: "" }));
    },
    onError: () => {
      toast({ title: "Failed to save Mailgun configuration", variant: "destructive" });
    },
  });

  // Test Mailgun mutation
  const testMailgunMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/integrations/mailgun/test`);
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "Mailgun test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test Mailgun", variant: "destructive" });
    },
  });

  // S3 mutation
  const saveS3Mutation = useMutation({
    mutationFn: async (data: S3Config) => {
      return apiRequest("PUT", `/api/v1/super/tenants/${activeTenant?.id}/integrations/s3`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "integrations"] });
      toast({ title: "S3 configuration saved" });
      setS3Data(prev => ({ ...prev, accessKeyId: "", secretAccessKey: "" }));
    },
    onError: () => {
      toast({ title: "Failed to save S3 configuration", variant: "destructive" });
    },
  });

  // Test S3 mutation
  const testS3Mutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/integrations/s3/test`);
    },
    onSuccess: (response: any) => {
      if (response.success) {
        toast({ title: response.message || "S3 test successful" });
      } else {
        toast({ title: response.message || "Test failed", variant: "destructive" });
      }
    },
    onError: () => {
      toast({ title: "Failed to test S3", variant: "destructive" });
    },
  });

  // Branding form handlers
  const handleBrandingChange = (field: keyof TenantSettings, value: string | boolean | null) => {
    setBrandingData((prev) => ({ ...prev, [field]: value || null }));
  };

  const handleSaveBranding = (e: React.FormEvent) => {
    e.preventDefault();
    saveBrandingMutation.mutate(brandingData);
  };

  // Integration form handlers
  const handleSaveMailgun = (e: React.FormEvent) => {
    e.preventDefault();
    saveMailgunMutation.mutate(mailgunData);
  };

  const handleSaveS3 = (e: React.FormEvent) => {
    e.preventDefault();
    saveS3Mutation.mutate(s3Data);
  };

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
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/clients/bulk`, { clients });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
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
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/projects/bulk`, { 
        projects, 
        options: data.options 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const seedWelcomeProjectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/seed/welcome-project`, {});
      return res.json();
    },
    onSuccess: (data) => {
      if (data.status === "created") {
        toast({ title: "Welcome project created", description: `Created ${data.created.tasks} tasks and ${data.created.subtasks} subtasks` });
      } else if (data.status === "skipped") {
        toast({ title: "Already exists", description: data.reason, variant: "default" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create welcome project", description: error.message, variant: "destructive" });
    },
  });

  const applyTaskTemplateMutation = useMutation({
    mutationFn: async ({ projectId, templateKey }: { projectId: string; templateKey: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/projects/${projectId}/seed/task-template`, { templateKey });
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
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply template", description: error.message, variant: "destructive" });
    },
  });

  const bulkTasksImportMutation = useMutation({
    mutationFn: async ({ projectId, rows, options }: { projectId: string; rows: ParsedRow[]; options: { createMissingSections: boolean; allowUnknownAssignees: boolean } }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/projects/${projectId}/tasks/bulk`, { rows, options });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Tasks imported", description: `Created ${data.createdTasks} tasks, ${data.createdSubtasks} subtasks, ${data.errors} errors` });
      setShowTaskImportPanel(false);
      setSelectedProjectForTasks(null);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
    },
    onError: (error: any) => {
      toast({ title: "Failed to import tasks", description: error.message, variant: "destructive" });
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { body: string; category: string }) => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "notes"] });
      setNewNoteBody("");
      toast({ title: "Note added successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant?.id}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "notes"] });
      toast({ title: "Note deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete note", description: error.message, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async (data: { noteId: string; body: string; category: string }) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant?.id}/notes/${data.noteId}`, {
        body: data.body,
        category: data.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "notes"] });
      setEditNoteDialogOpen(false);
      setEditingNote(null);
      toast({ title: "Note updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update note", description: error.message, variant: "destructive" });
    },
  });

  // Query for note version history
  const { data: versionHistoryData, isLoading: versionHistoryLoading } = useQuery<{
    currentNote: any;
    versions: Array<{
      id: string;
      noteId: string;
      body: string;
      category: string;
      versionNumber: number;
      createdAt: string;
      editor: { id: string; firstName: string | null; lastName: string | null; email: string };
    }>;
    totalVersions: number;
  }>({
    queryKey: ["/api/v1/super/tenants", activeTenant?.id, "notes", versionHistoryNoteId, "versions"],
    enabled: !!activeTenant?.id && !!versionHistoryNoteId && versionHistoryDialogOpen,
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (data: { users: typeof csvData; sendInvite: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/import-users`, data);
      return res.json();
    },
    onSuccess: (data) => {
      setBulkImportResults(data.results || []);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "audit"] });
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
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      setHasUnsavedChanges(false);
      setHasUnsavedSlugChanges(false);
      toast({ title: "Tenant updated successfully" });
      onTenantUpdated?.();
    },
    onError: (error: any) => {
      toast({ title: "Failed to update tenant", description: error.message, variant: "destructive" });
    },
  });

  // Workspace CRUD mutations
  const createWorkspaceMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/workspaces`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "workspaces"] });
      setNewWorkspaceName("");
      toast({ title: "Workspace created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create workspace", description: error.message, variant: "destructive" });
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/v1/super/tenants/${activeTenant?.id}/workspaces/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "workspaces"] });
      setEditingWorkspaceId(null);
      toast({ title: "Workspace updated" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to update workspace", description: error.message, variant: "destructive" });
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant?.id}/workspaces/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "workspaces"] });
      toast({ title: "Workspace deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete workspace", description: error.message, variant: "destructive" });
    },
  });

  // Client CRUD mutations
  const createClientMutation = useMutation({
    mutationFn: async (companyName: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/clients`, { companyName });
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all client queries for this tenant (any search filter)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients-all"] });
      setNewClientName("");
      setShowCreateClient(false);
      toast({ title: "Client created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create client", description: error.message, variant: "destructive" });
    },
  });

  const deleteClientMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant?.id}/clients/${id}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete client");
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all client queries for this tenant (any search filter)
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "clients-all"] });
      toast({ title: "Client deleted" });
    },
    onError: (error: any) => {
      const message = error.message || "Failed to delete client";
      const description = message.includes("foreign key") || message.includes("constraint") || message.includes("referenced")
        ? "This client has projects or other data. Delete those first."
        : message;
      toast({ title: "Failed to delete client", description, variant: "destructive" });
    },
  });

  // Project CRUD mutations
  const createProjectMutation = useMutation({
    mutationFn: async ({ name, clientId }: { name: string; clientId?: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/projects`, { 
        name, 
        clientId: clientId || undefined 
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "projects", projectSearch] });
      setNewProjectName("");
      setNewProjectClientId("");
      setShowCreateProject(false);
      toast({ title: "Project created" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create project", description: error.message, variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant?.id}/projects/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "projects", projectSearch] });
      toast({ title: "Project deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete project", description: error.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "health"] });
      toast({ 
        title: "Tenant activated", 
        description: `"${activeTenant?.name}" is now active and accessible to users.` 
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
      return apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "health"] });
      toast({ 
        title: "Tenant suspended", 
        description: `"${activeTenant?.name}" has been suspended. Users cannot access the platform.` 
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
        description: `Are you sure you want to suspend "${activeTenant?.name}"? Users will lose access to the platform until the tenant is reactivated.`,
      },
      activate: {
        title: "Activate Tenant",
        description: `Are you sure you want to activate "${activeTenant?.name}"? This will make the tenant live and allow users to access the platform.`,
      },
      reactivate: {
        title: "Reactivate Tenant",
        description: `Are you sure you want to reactivate "${activeTenant?.name}"? Users will regain access to the platform.`,
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
    mutationFn: async (data: { email: string; firstName?: string; lastName?: string; role?: "admin" | "employee"; inviteType: "link" | "email" }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invite-admin`, data);
      return res.json();
    },
    onSuccess: (data, variables) => {
      setLastInviteUrl(data.inviteUrl);
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      toast({ 
        title: "Invitation created", 
        description: `Invite link generated for ${variables.email}. Copy and share with the user.` 
      });
      setInviteEmail("");
      setInviteFirstName("");
      setInviteLastName("");
      setInviteRole("admin");
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to create invitation", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  // Create a user directly (manual activation)
  const createManualUserMutation = useMutation({
    mutationFn: async (data: { email: string; firstName: string; lastName: string; role: "admin" | "employee"; password: string }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/users`, data);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants-detail"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"] });
      toast({ 
        title: "User created", 
        description: `${data.user.email} has been added to the tenant and can now log in.` 
      });
      setManualUserEmail("");
      setManualUserFirstName("");
      setManualUserLastName("");
      setManualUserPassword("");
      setManualUserRole("employee");
      setManualUserMode(false);
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to create user", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  // Activate/deactivate user mutation
  const toggleUserActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/users/${userId}/activate`, { isActive });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"] });
      toast({ 
        title: data.user.isActive ? "User activated" : "User deactivated", 
        description: `${data.user.email} has been ${data.user.isActive ? "activated" : "deactivated"}.` 
      });
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to update user", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  // Delete user mutation (only for suspended/inactive users)
  const [userToDelete, setUserToDelete] = useState<{ id: string; email: string; name: string } | null>(null);
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/v1/super/tenants/${activeTenant?.id}/users/${userId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"] });
      toast({ 
        title: "User deleted", 
        description: data.message || "The user has been permanently deleted." 
      });
      setUserToDelete(null);
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      const details = error?.details || "";
      toast({ 
        title: "Failed to delete user", 
        description: details || message, 
        variant: "destructive" 
      });
      setUserToDelete(null);
    },
  });

  // Revoke invitation mutation
  const revokeInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invitations/${invitationId}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      toast({ 
        title: "Invitation revoked", 
        description: "The invitation has been revoked and can no longer be used." 
      });
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ 
        title: "Failed to revoke invitation", 
        description: message, 
        variant: "destructive" 
      });
    },
  });

  // Resend invitation email mutation
  const resendInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invitations/${invitationId}/resend`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      if (data.emailSent) {
        toast({ title: "Invitation resent", description: "The invitation email has been sent successfully." });
      } else {
        toast({ 
          title: "Email failed", 
          description: "Link regenerated but email failed. Copy the link manually.", 
          variant: "destructive" 
        });
      }
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ title: "Failed to resend invitation", description: message, variant: "destructive" });
    },
  });

  // Activate invitation mutation (create user from invitation)
  const activateInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invitations/${invitationId}/activate`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"] });
      if (data.tempPassword) {
        toast({ 
          title: "User activated", 
          description: `${data.user?.email} activated. Temp password: ${data.tempPassword}` 
        });
        navigator.clipboard.writeText(data.tempPassword);
      } else {
        toast({ title: "User activated", description: `${data.user?.email} has been activated.` });
      }
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to activate invitation";
      toast({ title: "Activation failed", description: message, variant: "destructive" });
    },
  });

  // Activate all pending invitations mutation
  const activateAllInvitationsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invitations/activate-all`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "users"] });
      const activated = data.results?.filter((r: any) => r.status === "activated").length || 0;
      const alreadyExisted = data.results?.filter((r: any) => r.status === "already_exists").length || 0;
      const errors = data.errors?.length || 0;
      toast({ 
        title: "Bulk activation complete", 
        description: `Activated: ${activated}, Already existed: ${alreadyExisted}, Errors: ${errors}` 
      });
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to activate invitations";
      toast({ title: "Bulk activation failed", description: message, variant: "destructive" });
    },
  });

  // Regenerate invitation link mutation
  const regenerateInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await apiRequest("POST", `/api/v1/super/tenants/${activeTenant?.id}/invitations/${invitationId}/regenerate`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/tenants", activeTenant?.id, "invitations"] });
      toast({ title: "Link regenerated", description: "A new invitation link has been created." });
      if (data.inviteUrl) {
        navigator.clipboard.writeText(data.inviteUrl);
        toast({ title: "Link copied", description: "New invite link copied to clipboard." });
      }
    },
    onError: (error: any) => {
      const message = error?.message || "An unexpected error occurred. Please try again.";
      toast({ title: "Failed to regenerate link", description: message, variant: "destructive" });
    },
  });

  const handleNameChange = (value: string) => {
    setEditedName(value);
    setHasUnsavedChanges(value !== activeTenant?.name);
  };

  const handleSaveName = () => {
    if (editedName !== activeTenant?.name) {
      updateTenantMutation.mutate({ name: editedName });
    }
  };

  const handleSlugChange = (value: string) => {
    const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setEditedSlug(sanitized);
    setHasUnsavedSlugChanges(sanitized !== activeTenant?.slug);
  };

  const handleSaveSlug = () => {
    if (editedSlug !== activeTenant?.slug) {
      updateTenantMutation.mutate({ slug: editedSlug });
    }
  };

  const handleInviteAdmin = () => {
    if (!inviteEmail) return;
    inviteAdminMutation.mutate({
      email: inviteEmail,
      firstName: inviteFirstName || undefined,
      lastName: inviteLastName || undefined,
      role: inviteRole,
      inviteType: "link",
    });
  };

  const handleCreateManualUser = () => {
    if (!manualUserEmail || !manualUserFirstName || !manualUserLastName || !manualUserPassword) return;
    createManualUserMutation.mutate({
      email: manualUserEmail,
      firstName: manualUserFirstName,
      lastName: manualUserLastName,
      role: manualUserRole,
      password: manualUserPassword,
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

  // In create mode with wizard, show wizard UI
  // In edit mode, require a tenant to be present
  if (drawerMode === "edit" && !activeTenant) return null;

  const onboardingProgress: OnboardingProgress = activeTenant ? {
    workspace: true,
    branding: !!settingsResponse?.tenantSettings?.logoUrl,
    email: false,
    users: (activeTenant.userCount || 0) > 0,
    activated: activeTenant.status === "active",
  } : { workspace: false, branding: false, email: false, users: false, activated: false };

  const completedSteps = Object.values(onboardingProgress).filter(Boolean).length;
  const totalSteps = Object.keys(onboardingProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  // Render wizard for create mode
  if (drawerMode === "create" || (mode === "create" && !activeTenant)) {
    return (
      <FullScreenDrawer
        open={open}
        onOpenChange={onOpenChange}
        title={createdTenant ? createdTenant.name : "Create New Tenant"}
        description={createdTenant ? `/${createdTenant.slug}` : "Set up a new organization"}
        hasUnsavedChanges={false}
        width="3xl"
      >
        <div className="space-y-6">
          {/* Wizard Progress Stepper */}
          <div className="flex items-center justify-between px-2 py-4 bg-muted/30 rounded-lg">
            {WIZARD_STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex || (createdTenant && index === 0);
              const isCurrent = step.id === wizardStep;
              const isDisabled = index > 0 && !createdTenant;
              
              return (
                <div key={step.id} className="flex items-center flex-1">
                  <div 
                    className={`flex flex-col items-center flex-1 ${isDisabled ? 'opacity-40' : ''}`}
                    onClick={() => !isDisabled && index <= currentStepIndex && goToStep(step.id)}
                    role={!isDisabled ? "button" : undefined}
                    data-testid={`wizard-step-${step.id}`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isCompleted ? 'bg-green-500 text-white' :
                      isCurrent ? 'bg-primary text-primary-foreground' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
                    </div>
                    <div className={`text-xs mt-1 text-center ${isCurrent ? 'font-medium' : 'text-muted-foreground'}`}>
                      {step.title}
                    </div>
                  </div>
                  {index < WIZARD_STEPS.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-2 ${index < currentStepIndex ? 'bg-green-500' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step 1: Tenant Basics */}
          {wizardStep === "basics" && (
            <Card>
              <CardHeader>
                <CardTitle>Tenant Basics</CardTitle>
                <CardDescription>Enter the organization name and URL slug</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateTenant} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="create-name">Business Name *</Label>
                    <Input
                      id="create-name"
                      value={createName}
                      onChange={(e) => {
                        setCreateName(e.target.value);
                        setCreateSlug(generateSlug(e.target.value));
                      }}
                      placeholder="Acme Corporation"
                      data-testid="input-create-name"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      This will also be used as the primary workspace name
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="create-slug">URL Slug *</Label>
                    <Input
                      id="create-slug"
                      value={createSlug}
                      onChange={(e) => setCreateSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      placeholder="acme-corp"
                      data-testid="input-create-slug"
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Lowercase letters, numbers, and hyphens only
                    </p>
                  </div>
                  {createError && (
                    <div className="text-sm text-destructive flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      {createError}
                    </div>
                  )}
                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={createTenantMutation.isPending || !createName.trim() || !createSlug.trim()}
                      data-testid="button-create-tenant-wizard"
                    >
                      {createTenantMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          Create Tenant
                          <Check className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}

          {/* Step 2: Primary Workspace (auto-created) */}
          {wizardStep === "workspace" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Primary Workspace Created
                </CardTitle>
                <CardDescription>Your primary workspace has been automatically created</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <HardDrive className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium">{createdTenant.primaryWorkspace?.name || createdTenant.name}</div>
                      <div className="text-sm text-muted-foreground">Primary Workspace</div>
                    </div>
                    <Badge className="ml-auto bg-green-600">Primary</Badge>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  The workspace name matches the tenant business name exactly. You can create additional workspaces later.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Branding (optional) */}
          {wizardStep === "branding" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Branding (Optional)</CardTitle>
                <CardDescription>Configure display name and colors. You can skip this and configure later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wizard-display-name">Display Name</Label>
                  <Input
                    id="wizard-display-name"
                    value={brandingData.displayName || createdTenant.name}
                    onChange={(e) => setBrandingData(prev => ({ ...prev, displayName: e.target.value }))}
                    placeholder="Display name for the tenant"
                    data-testid="input-wizard-display-name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="wizard-primary-color">Primary Color</Label>
                    <Input
                      id="wizard-primary-color"
                      type="color"
                      value={brandingData.primaryColor || "#3b82f6"}
                      onChange={(e) => setBrandingData(prev => ({ ...prev, primaryColor: e.target.value }))}
                      data-testid="input-wizard-primary-color"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wizard-accent-color">Accent Color</Label>
                    <Input
                      id="wizard-accent-color"
                      type="color"
                      value={brandingData.accentColor || "#8b5cf6"}
                      onChange={(e) => setBrandingData(prev => ({ ...prev, accentColor: e.target.value }))}
                      data-testid="input-wizard-accent-color"
                    />
                  </div>
                </div>
                <Button 
                  onClick={() => saveBrandingMutation.mutate(brandingData)}
                  disabled={saveBrandingMutation.isPending}
                  variant="outline"
                  className="w-full"
                  data-testid="button-save-wizard-branding"
                >
                  {saveBrandingMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Save Branding
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Step 4: Integrations (optional) */}
          {wizardStep === "integrations" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Integrations (Optional)</CardTitle>
                <CardDescription>Configure email and storage. You can skip and configure later.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <Mail className="h-5 w-5" />
                    <div className="font-medium">Mailgun Email</div>
                    <IntegrationStatusBadge status={getIntegrationStatus("mailgun")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Email configuration can be done from the Integrations tab after setup.
                  </p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <HardDrive className="h-5 w-5" />
                    <div className="font-medium">S3 Storage</div>
                    <IntegrationStatusBadge status={getIntegrationStatus("s3")} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Storage configuration can be done from the Integrations tab after setup.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 5: Invite User (recommended) */}
          {wizardStep === "invite" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Invite User (Recommended)</CardTitle>
                <CardDescription>
                  Invite a user for this tenant. Invite acceptance is not required to finish setup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-email">Email Address *</Label>
                      <Input
                        id="wizard-invite-email"
                        type="email"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                        placeholder="user@example.com"
                        data-testid="input-wizard-invite-email"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-role">Role</Label>
                      <Select value={inviteRole} onValueChange={(v: "admin" | "employee") => setInviteRole(v)}>
                        <SelectTrigger id="wizard-invite-role" data-testid="select-wizard-invite-role">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="employee">Employee</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-first-name">First Name</Label>
                      <Input
                        id="wizard-invite-first-name"
                        value={inviteFirstName}
                        onChange={(e) => setInviteFirstName(e.target.value)}
                        placeholder="John"
                        data-testid="input-wizard-invite-first-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="wizard-invite-last-name">Last Name</Label>
                      <Input
                        id="wizard-invite-last-name"
                        value={inviteLastName}
                        onChange={(e) => setInviteLastName(e.target.value)}
                        placeholder="Doe"
                        data-testid="input-wizard-invite-last-name"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => inviteAdminMutation.mutate({ email: inviteEmail, firstName: inviteFirstName || undefined, lastName: inviteLastName || undefined, role: inviteRole, inviteType: "link" })}
                    disabled={inviteAdminMutation.isPending || !inviteEmail}
                    data-testid="button-wizard-send-invite"
                  >
                    {inviteAdminMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                    Generate Invite Link
                  </Button>
                </div>
                {lastInviteUrl && (
                  <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-green-700 dark:text-green-400">Invite link generated</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(lastInviteUrl);
                          toast({ title: "Copied", description: "Invite URL copied to clipboard" });
                        }}
                        data-testid="button-copy-wizard-invite"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 break-all">{lastInviteUrl}</p>
                  </div>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Invite acceptance is not required to complete setup. Tenant can be used immediately.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Step 6: Review & Finish */}
          {wizardStep === "review" && createdTenant && (
            <Card>
              <CardHeader>
                <CardTitle>Setup Complete</CardTitle>
                <CardDescription>Review your new tenant configuration</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">Tenant Created</div>
                        <div className="text-sm text-muted-foreground">{createdTenant.name}</div>
                      </div>
                    </div>
                    <Badge variant="secondary">/{createdTenant.slug}</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <div>
                        <div className="font-medium">Primary Workspace</div>
                        <div className="text-sm text-muted-foreground">{createdTenant.primaryWorkspace?.name || createdTenant.name}</div>
                      </div>
                    </div>
                    <Badge className="bg-green-600">Created</Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      {lastInviteUrl ? <CheckCircle className="h-5 w-5 text-green-500" /> : <Clock className="h-5 w-5 text-muted-foreground" />}
                      <div>
                        <div className="font-medium">Admin Invitation</div>
                        <div className="text-sm text-muted-foreground">{lastInviteUrl ? "Invite link generated" : "No invites sent"}</div>
                      </div>
                    </div>
                    <Badge variant={lastInviteUrl ? "default" : "secondary"}>
                      {lastInviteUrl ? "Pending" : "Skipped"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-amber-500" />
                      <div>
                        <div className="font-medium">Tenant Status</div>
                        <div className="text-sm text-muted-foreground">Ready to activate</div>
                      </div>
                    </div>
                    {getStatusBadge(createdTenant.status)}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Wizard Navigation */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={goBack}
              disabled={!canGoBack()}
              data-testid="button-wizard-back"
            >
              Back
            </Button>
            <div className="flex gap-2">
              {wizardStep !== "review" && createdTenant && (
                <Button
                  variant="ghost"
                  onClick={() => goToStep("review")}
                  data-testid="button-wizard-skip"
                >
                  Skip to Finish
                </Button>
              )}
              {wizardStep === "review" ? (
                <Button onClick={finishWizard} data-testid="button-wizard-finish">
                  <Check className="h-4 w-4 mr-2" />
                  Finish Setup
                </Button>
              ) : (
                <Button
                  onClick={goNext}
                  disabled={!canGoNext()}
                  data-testid="button-wizard-next"
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      </FullScreenDrawer>
    );
  }

  // Edit mode - activeTenant should exist at this point
  if (!activeTenant) {
    return null;
  }

  return (
    <FullScreenDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={activeTenant.settings?.displayName || activeTenant.name}
      description={`/${activeTenant.slug}`}
      hasUnsavedChanges={hasUnsavedChanges}
      width="3xl"
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          {getStatusBadge(activeTenant.status)}
          <div className="flex items-center gap-2">
            {activeTenant.status === "inactive" && (
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
            {activeTenant.status === "active" && (
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
            {activeTenant.status === "suspended" && (
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
          <TabsList className="grid w-full grid-cols-10">
            <TabsTrigger value="onboarding" data-testid="tab-onboarding">
              <Settings className="h-4 w-4 mr-2" />
              Setup
            </TabsTrigger>
            <TabsTrigger value="overview" data-testid="tab-overview">
              <Building2 className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="workspaces" data-testid="tab-workspaces">
              <HardDrive className="h-4 w-4 mr-2" />
              Workspaces
            </TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="h-4 w-4 mr-2" />
              Users
            </TabsTrigger>
            <TabsTrigger value="clients" data-testid="tab-clients">
              <Briefcase className="h-4 w-4 mr-2" />
              Clients
            </TabsTrigger>
            <TabsTrigger value="projects" data-testid="tab-projects">
              <FolderKanban className="h-4 w-4 mr-2" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="branding" data-testid="tab-branding">
              <Palette className="h-4 w-4 mr-2" />
              Branding
            </TabsTrigger>
            <TabsTrigger value="integrations" data-testid="tab-integrations">
              <HardDrive className="h-4 w-4 mr-2" />
              Integrations
            </TabsTrigger>
            <TabsTrigger value="data" data-testid="tab-data">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Data
            </TabsTrigger>
            <TabsTrigger value="notes" data-testid="tab-notes">
              <MessageSquare className="h-4 w-4 mr-2" />
              Notes
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
                  <Label htmlFor="tenant-slug">URL Slug</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center">
                      <span className="text-muted-foreground mr-1">/</span>
                      <Input
                        id="tenant-slug"
                        value={editedSlug}
                        onChange={(e) => handleSlugChange(e.target.value)}
                        placeholder="url-slug"
                        className="w-48"
                        data-testid="input-tenant-slug"
                      />
                    </div>
                    {hasUnsavedSlugChanges && (
                      <Button 
                        onClick={handleSaveSlug} 
                        disabled={updateTenantMutation.isPending || !editedSlug.trim()}
                        data-testid="button-save-slug"
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Save
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only lowercase letters, numbers, and hyphens allowed
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Users</div>
                    <div className="text-2xl font-semibold">{activeTenant.userCount || 0}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-sm text-muted-foreground">Created</div>
                    <div className="text-sm">{new Date(activeTenant.createdAt!).toLocaleDateString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company Details Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Company Details</CardTitle>
                <CardDescription>Additional organization information</CardDescription>
              </CardHeader>
              <CardContent>
                <form 
                  className="space-y-6"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    const updates: Record<string, string | null> = {};
                    
                    const fields = [
                      'legalName', 'industry', 'companySize', 'website', 'taxId', 
                      'foundedDate', 'description', 'addressLine1', 'addressLine2',
                      'city', 'state', 'postalCode', 'country', 'phoneNumber',
                      'primaryContactName', 'primaryContactEmail', 'primaryContactPhone', 'billingEmail'
                    ];
                    
                    fields.forEach(field => {
                      const value = formData.get(field) as string;
                      updates[field] = value || null;
                    });
                    
                    updateTenantMutation.mutate(updates);
                  }}
                >
                  {/* Company Information */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Company Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="legalName">Legal Name</Label>
                        <Input
                          id="legalName"
                          name="legalName"
                          defaultValue={(activeTenant as any).legalName || ""}
                          placeholder="Legal company name"
                          data-testid="input-legal-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="industry">Industry</Label>
                        <Input
                          id="industry"
                          name="industry"
                          defaultValue={(activeTenant as any).industry || ""}
                          placeholder="e.g. Technology, Healthcare"
                          data-testid="input-industry"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="companySize">Company Size</Label>
                        <Select name="companySize" defaultValue={(activeTenant as any).companySize || ""}>
                          <SelectTrigger data-testid="select-company-size">
                            <SelectValue placeholder="Select size" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1-10">1-10 employees</SelectItem>
                            <SelectItem value="11-50">11-50 employees</SelectItem>
                            <SelectItem value="51-200">51-200 employees</SelectItem>
                            <SelectItem value="201-500">201-500 employees</SelectItem>
                            <SelectItem value="501+">501+ employees</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="website">Website</Label>
                        <Input
                          id="website"
                          name="website"
                          type="url"
                          defaultValue={(activeTenant as any).website || ""}
                          placeholder="https://example.com"
                          data-testid="input-website"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="taxId">Tax ID</Label>
                        <Input
                          id="taxId"
                          name="taxId"
                          defaultValue={(activeTenant as any).taxId || ""}
                          placeholder="Tax identification number"
                          data-testid="input-tax-id"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="foundedDate">Founded Date</Label>
                        <Input
                          id="foundedDate"
                          name="foundedDate"
                          defaultValue={(activeTenant as any).foundedDate || ""}
                          placeholder="e.g. 2020"
                          data-testid="input-founded-date"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        name="description"
                        defaultValue={(activeTenant as any).description || ""}
                        placeholder="Brief description of the company"
                        rows={3}
                        data-testid="input-description"
                      />
                    </div>
                  </div>

                  {/* Address */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Address</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="addressLine1">Address Line 1</Label>
                        <Input
                          id="addressLine1"
                          name="addressLine1"
                          defaultValue={(activeTenant as any).addressLine1 || ""}
                          placeholder="Street address"
                          data-testid="input-address-1"
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="addressLine2">Address Line 2</Label>
                        <Input
                          id="addressLine2"
                          name="addressLine2"
                          defaultValue={(activeTenant as any).addressLine2 || ""}
                          placeholder="Suite, unit, building"
                          data-testid="input-address-2"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          name="city"
                          defaultValue={(activeTenant as any).city || ""}
                          placeholder="City"
                          data-testid="input-city"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="state">State / Province</Label>
                        <Input
                          id="state"
                          name="state"
                          defaultValue={(activeTenant as any).state || ""}
                          placeholder="State or province"
                          data-testid="input-state"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          defaultValue={(activeTenant as any).postalCode || ""}
                          placeholder="Zip / postal code"
                          data-testid="input-postal-code"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          name="country"
                          defaultValue={(activeTenant as any).country || ""}
                          placeholder="Country"
                          data-testid="input-country"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium">Contact Information</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber">Phone Number</Label>
                        <Input
                          id="phoneNumber"
                          name="phoneNumber"
                          defaultValue={(activeTenant as any).phoneNumber || ""}
                          placeholder="+1 (555) 000-0000"
                          data-testid="input-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="billingEmail">Billing Email</Label>
                        <Input
                          id="billingEmail"
                          name="billingEmail"
                          type="email"
                          defaultValue={(activeTenant as any).billingEmail || ""}
                          placeholder="billing@example.com"
                          data-testid="input-billing-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="primaryContactName">Primary Contact Name</Label>
                        <Input
                          id="primaryContactName"
                          name="primaryContactName"
                          defaultValue={(activeTenant as any).primaryContactName || ""}
                          placeholder="Full name"
                          data-testid="input-contact-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="primaryContactEmail">Primary Contact Email</Label>
                        <Input
                          id="primaryContactEmail"
                          name="primaryContactEmail"
                          type="email"
                          defaultValue={(activeTenant as any).primaryContactEmail || ""}
                          placeholder="contact@example.com"
                          data-testid="input-contact-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="primaryContactPhone">Primary Contact Phone</Label>
                        <Input
                          id="primaryContactPhone"
                          name="primaryContactPhone"
                          defaultValue={(activeTenant as any).primaryContactPhone || ""}
                          placeholder="+1 (555) 000-0000"
                          data-testid="input-contact-phone"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <Button 
                      type="submit" 
                      disabled={updateTenantMutation.isPending}
                      data-testid="button-save-company-details"
                    >
                      {updateTenantMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      <Save className="h-4 w-4 mr-2" />
                      Save Company Details
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {activeTenant.status === "inactive" && (
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

          <TabsContent value="data" className="space-y-6 mt-6">
            <DataImportExportTab tenantId={activeTenant.id} tenantSlug={activeTenant.slug} />
          </TabsContent>

          <TabsContent value="notes" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left Column - Add New Note */}
              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Add Note
                  </CardTitle>
                  <CardDescription>Create a new internal note for this tenant</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Category:</Label>
                    <Select value={newNoteCategory} onValueChange={setNewNoteCategory}>
                      <SelectTrigger className="w-36" data-testid="select-note-category">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="onboarding">Onboarding</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="accounts">Accounts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <RichTextEditor
                    value={newNoteBody}
                    onChange={setNewNoteBody}
                    placeholder="Add a note... Use the toolbar to format text, add links, etc."
                    minHeight="150px"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => createNoteMutation.mutate({ body: newNoteBody, category: newNoteCategory })}
                      disabled={!newNoteBody.trim() || newNoteBody === "<p></p>" || createNoteMutation.isPending}
                      data-testid="button-add-note"
                    >
                      {createNoteMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Add Note
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Right Column - Notes List */}
              <Card className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Notes History
                    {notesData && notesData.length > 0 && (
                      <Badge variant="secondary" className="ml-2">{notesData.length}</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>Private notes visible only to super admins</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4 flex-1">
                  {/* Search and Filter Controls */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search notes..."
                        value={noteSearchQuery}
                        onChange={(e) => setNoteSearchQuery(e.target.value)}
                        className="pl-9"
                        data-testid="input-search-notes"
                      />
                    </div>
                    <Select value={noteFilterCategory} onValueChange={setNoteFilterCategory}>
                      <SelectTrigger className="w-full sm:w-40" data-testid="select-filter-category">
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                        <SelectItem value="onboarding">Onboarding</SelectItem>
                        <SelectItem value="support">Support</SelectItem>
                        <SelectItem value="billing">Billing</SelectItem>
                        <SelectItem value="technical">Technical</SelectItem>
                        <SelectItem value="accounts">Accounts</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Notes List - Scrollable */}
                  <div className="flex-1 overflow-y-auto max-h-[500px] space-y-3 pr-1">
                    {notesLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredNotes.length > 0 ? (
                      filteredNotes.map((note) => (
                        <div 
                          key={note.id} 
                          className="border rounded-md p-4 space-y-3 bg-muted/30 hover-elevate" 
                          data-testid={`note-${note.id}`}
                        >
                          {/* Note Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold">{note.author?.name || "Unknown"}</span>
                                <Badge 
                                  variant="outline" 
                                  className="text-xs capitalize"
                                >
                                  {note.category}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>
                                  {new Date(note.createdAt).toLocaleDateString("en-US", {
                                    weekday: "short",
                                    year: "numeric",
                                    month: "short",
                                    day: "numeric",
                                  })}
                                  {" at "}
                                  {new Date(note.createdAt).toLocaleTimeString("en-US", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingNote({ id: note.id, body: note.body, category: note.category || "general" });
                                  setEditNoteBody(note.body);
                                  setEditNoteCategory(note.category || "general");
                                  setEditNoteDialogOpen(true);
                                }}
                                className="h-7 w-7 text-muted-foreground hover:text-primary"
                                data-testid={`button-edit-note-${note.id}`}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                              {note.hasVersions && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => {
                                    setVersionHistoryNoteId(note.id);
                                    setVersionHistoryDialogOpen(true);
                                  }}
                                  className="h-7 w-7 text-muted-foreground hover:text-primary"
                                  data-testid={`button-history-note-${note.id}`}
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                disabled={deleteNoteMutation.isPending}
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                data-testid={`button-delete-note-${note.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          {/* Note Content */}
                          <div className="border-t pt-3">
                            <RichTextViewer content={note.body} className="text-sm" />
                          </div>
                        </div>
                      ))
                    ) : notesData && notesData.length > 0 ? (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No notes match your search or filter.
                      </div>
                    ) : (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        No notes yet. Add a note to get started.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

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
            {/* Fix Client Tenant IDs - Data Remediation Tool */}
            {activeTenant?.id && (
              <FixClientTenantIdsCard tenantId={activeTenant.id} tenantName={activeTenant?.name || "this tenant"} />
            )}
            
            {/* Create Client */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Client
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Company name"
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    data-testid="input-new-client-name"
                  />
                  <Button
                    onClick={() => createClientMutation.mutate(newClientName)}
                    disabled={!newClientName.trim() || createClientMutation.isPending}
                    data-testid="button-create-client"
                  >
                    {createClientMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                          <th className="text-left p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {clientsResponse.clients.map((client) => (
                          <tr key={client.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`client-row-${client.id}`}>
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
                            <td className="p-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => deleteClientMutation.mutate(client.id)}
                                disabled={deleteClientMutation.isPending}
                                data-testid={`button-delete-client-${client.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No clients found. Create one above or import clients below.
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
            {/* Create Project */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Project
                </CardTitle>
                <CardDescription>
                  Create a new project for this tenant. Projects must be associated with a client.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project Name</label>
                    <Input
                      placeholder="Enter project name"
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      data-testid="input-new-project-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Client <span className="text-destructive">*</span></label>
                    <Select 
                      value={newProjectClientId} 
                      onValueChange={setNewProjectClientId}
                    >
                      <SelectTrigger data-testid="select-project-client">
                        <SelectValue placeholder="Select a client" />
                      </SelectTrigger>
                      <SelectContent>
                        {allClientsResponse?.clients?.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.companyName}
                          </SelectItem>
                        ))}
                        {(!allClientsResponse?.clients || allClientsResponse.clients.length === 0) && (
                          <SelectItem value="_no_clients" disabled>
                            No clients available - create a client first
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    onClick={() => {
                      createProjectMutation.mutate({ 
                        name: newProjectName, 
                        clientId: newProjectClientId || undefined 
                      });
                    }}
                    disabled={!newProjectName.trim() || !newProjectClientId || createProjectMutation.isPending}
                    data-testid="button-create-project"
                  >
                    {createProjectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Project
                  </Button>
                </div>
              </CardContent>
            </Card>

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
                          <tr key={project.id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`project-row-${project.id}`}>
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
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteProjectMutation.mutate(project.id)}
                                  disabled={deleteProjectMutation.isPending}
                                  data-testid={`button-delete-project-${project.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
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
                    No projects found. Create one above or import projects below.
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
            {/* Create Workspace */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Create Workspace
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    placeholder="Workspace name"
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    data-testid="input-new-workspace-name"
                  />
                  <Button
                    onClick={() => createWorkspaceMutation.mutate(newWorkspaceName)}
                    disabled={!newWorkspaceName.trim() || createWorkspaceMutation.isPending}
                    data-testid="button-create-workspace"
                  >
                    {createWorkspaceMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Workspaces List */}
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
                    No workspaces found. Create one above.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {workspaces.map((workspace) => (
                      <div
                        key={workspace.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`workspace-row-${workspace.id}`}
                      >
                        {editingWorkspaceId === workspace.id ? (
                          <div className="flex items-center gap-2 flex-1">
                            <Input
                              value={editingWorkspaceName}
                              onChange={(e) => setEditingWorkspaceName(e.target.value)}
                              className="flex-1"
                              data-testid={`input-edit-workspace-${workspace.id}`}
                            />
                            <Button
                              size="sm"
                              onClick={() => updateWorkspaceMutation.mutate({ id: workspace.id, name: editingWorkspaceName })}
                              disabled={updateWorkspaceMutation.isPending}
                              data-testid={`button-save-workspace-${workspace.id}`}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setEditingWorkspaceId(null)}
                              data-testid={`button-cancel-edit-workspace-${workspace.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3">
                              <Briefcase className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <div className="font-medium">{workspace.name}</div>
                                <div className="text-xs text-muted-foreground">{workspace.id}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {workspace.isPrimary && (
                                <Badge variant="secondary">Primary</Badge>
                              )}
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  setEditingWorkspaceId(workspace.id);
                                  setEditingWorkspaceName(workspace.name);
                                }}
                                data-testid={`button-edit-workspace-${workspace.id}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              {!workspace.isPrimary && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => deleteWorkspaceMutation.mutate(workspace.id)}
                                  disabled={deleteWorkspaceMutation.isPending}
                                  data-testid={`button-delete-workspace-${workspace.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users" className="space-y-6 mt-6">
            {/* Quick Provision Button */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium flex items-center gap-2">
                      <UserPlus className="h-4 w-4 text-primary" />
                      Provision User Access
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Create or update a user with immediate access - no invitation required
                    </p>
                  </div>
                  <Button 
                    onClick={() => setProvisionDrawerOpen(true)}
                    data-testid="button-provision-user"
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Provision User
                  </Button>
                </div>
              </CardContent>
            </Card>
            
            {/* Fix Tenant IDs - Data Remediation Tool */}
            {activeTenant?.id && (
              <FixTenantIdsCard tenantId={activeTenant.id} tenantName={activeTenant?.name || "this tenant"} />
            )}

            {/* Add User Card - Toggle between Invite and Manual Creation */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      {manualUserMode ? "Create User Manually" : "Invite User"}
                    </CardTitle>
                    <CardDescription>
                      {manualUserMode 
                        ? "Create a user account with a password for immediate access" 
                        : "Send an invitation link for self-registration"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Invite</span>
                    <Switch
                      checked={manualUserMode}
                      onCheckedChange={setManualUserMode}
                      data-testid="switch-manual-user-mode"
                    />
                    <span className="text-xs text-muted-foreground">Manual</span>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {manualUserMode ? (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="manual-first-name">First Name *</Label>
                        <Input
                          id="manual-first-name"
                          value={manualUserFirstName}
                          onChange={(e) => setManualUserFirstName(e.target.value)}
                          placeholder="John"
                          data-testid="input-manual-first-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manual-last-name">Last Name *</Label>
                        <Input
                          id="manual-last-name"
                          value={manualUserLastName}
                          onChange={(e) => setManualUserLastName(e.target.value)}
                          placeholder="Doe"
                          data-testid="input-manual-last-name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="manual-email">Email Address *</Label>
                        <Input
                          id="manual-email"
                          type="email"
                          value={manualUserEmail}
                          onChange={(e) => setManualUserEmail(e.target.value)}
                          placeholder="user@example.com"
                          data-testid="input-manual-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="manual-role">Role *</Label>
                        <Select value={manualUserRole} onValueChange={(v: "admin" | "employee") => setManualUserRole(v)}>
                          <SelectTrigger id="manual-role" data-testid="select-manual-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-password">Password *</Label>
                      <div className="relative">
                        <Input
                          id="manual-password"
                          type={showManualPassword ? "text" : "password"}
                          value={manualUserPassword}
                          onChange={(e) => setManualUserPassword(e.target.value)}
                          placeholder="Minimum 8 characters"
                          className="pr-10"
                          data-testid="input-manual-password"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-full"
                          onClick={() => setShowManualPassword(!showManualPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showManualPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">Password must be at least 8 characters</p>
                    </div>
                    <Button 
                      onClick={handleCreateManualUser}
                      disabled={!manualUserEmail || !manualUserFirstName || !manualUserLastName || !manualUserPassword || manualUserPassword.length < 8 || createManualUserMutation.isPending}
                      data-testid="button-create-manual-user"
                    >
                      {createManualUserMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Create User Account
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="invite-email">Email Address *</Label>
                        <Input
                          id="invite-email"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="user@example.com"
                          data-testid="input-invite-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="invite-role">Role</Label>
                        <Select value={inviteRole} onValueChange={(v: "admin" | "employee") => setInviteRole(v)}>
                          <SelectTrigger id="invite-role" data-testid="select-invite-role">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="employee">Employee</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                            <span className="text-sm text-green-700 dark:text-green-400">Invitation created</span>
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
                  </>
                )}
              </CardContent>
            </Card>

            {/* Current Users List */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Current Users</CardTitle>
                <CardDescription>
                  {usersResponse?.total || 0} user{(usersResponse?.total || 0) === 1 ? '' : 's'} in this tenant
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : !usersResponse?.users?.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No users yet. Create or invite users above.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {usersResponse.users.map(user => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`user-row-${user.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                            {user.firstName?.[0] || user.email[0].toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {user.name || user.email}
                              {!user.isActive && (
                                <Badge variant="secondary" className="text-xs">Inactive</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">{user.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">{user.role}</Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSelectedUserId(user.id)}
                            data-testid={`button-manage-user-${user.id}`}
                          >
                            <Settings className="h-3 w-3 mr-1" />
                            Manage
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleUserActiveMutation.mutate({ userId: user.id, isActive: !user.isActive })}
                            disabled={toggleUserActiveMutation.isPending}
                            title={user.isActive ? "Deactivate user" : "Activate user"}
                            data-testid={`button-toggle-user-${user.id}`}
                          >
                            {user.isActive ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                          </Button>
                          {!user.isActive && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setUserToDelete({ id: user.id, email: user.email, name: user.name || user.email })}
                              disabled={deleteUserMutation.isPending}
                              title="Permanently delete user"
                              data-testid={`button-delete-user-${user.id}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Invitations */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Pending Invitations</CardTitle>
                  <CardDescription>
                    {invitationsResponse?.invitations?.filter(i => i.status === "pending").length || 0} pending invitation(s)
                  </CardDescription>
                </div>
                {(invitationsResponse?.invitations?.filter(i => i.status === "pending").length || 0) > 0 && (
                  <Button
                    size="sm"
                    onClick={() => activateAllInvitationsMutation.mutate()}
                    disabled={activateAllInvitationsMutation.isPending}
                    data-testid="button-activate-all-invitations"
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    {activateAllInvitationsMutation.isPending ? "Activating..." : "Activate All"}
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {invitationsLoading ? (
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !invitationsResponse?.invitations?.length ? (
                  <div className="text-center py-6 text-muted-foreground text-sm">
                    No invitations sent yet.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {invitationsResponse.invitations.map(invitation => {
                      const isExpired = new Date(invitation.expiresAt) < new Date();
                      const isPending = invitation.status === "pending" && !isExpired;
                      return (
                        <div
                          key={invitation.id}
                          className="flex items-center justify-between p-3 rounded-lg border"
                          data-testid={`invitation-row-${invitation.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium text-sm">{invitation.email}</div>
                              <div className="text-xs text-muted-foreground">
                                Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">{invitation.role}</Badge>
                            {invitation.status === "accepted" ? (
                              <Badge className="bg-green-600 text-xs">Accepted</Badge>
                            ) : invitation.status === "revoked" ? (
                              <Badge variant="destructive" className="text-xs">Revoked</Badge>
                            ) : isExpired ? (
                              <>
                                <Badge variant="secondary" className="text-xs">Expired</Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => regenerateInvitationMutation.mutate(invitation.id)}
                                  disabled={regenerateInvitationMutation.isPending}
                                  title="Regenerate invitation link"
                                  data-testid={`button-regenerate-invitation-${invitation.id}`}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Badge className="text-xs">Pending</Badge>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => activateInvitationMutation.mutate(invitation.id)}
                                  disabled={activateInvitationMutation.isPending}
                                  title="Activate (create user account)"
                                  data-testid={`button-activate-invitation-${invitation.id}`}
                                >
                                  <UserPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => regenerateInvitationMutation.mutate(invitation.id)}
                                  disabled={regenerateInvitationMutation.isPending}
                                  title="Get invite link (regenerate & copy)"
                                  data-testid={`button-get-link-${invitation.id}`}
                                >
                                  <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => resendInvitationMutation.mutate(invitation.id)}
                                  disabled={resendInvitationMutation.isPending}
                                  title="Resend invitation email"
                                  data-testid={`button-resend-invitation-${invitation.id}`}
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => revokeInvitationMutation.mutate(invitation.id)}
                                  disabled={revokeInvitationMutation.isPending}
                                  title="Revoke invitation"
                                  data-testid={`button-revoke-invitation-${invitation.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
                <form onSubmit={handleSaveBranding} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="displayName">Display Name</Label>
                      <Input
                        id="displayName"
                        value={brandingData.displayName || ""}
                        onChange={(e) => handleBrandingChange("displayName", e.target.value)}
                        data-testid="input-tenant-display-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="appName">App Name</Label>
                      <Input
                        id="appName"
                        value={brandingData.appName || ""}
                        onChange={(e) => handleBrandingChange("appName", e.target.value)}
                        data-testid="input-tenant-app-name"
                      />
                    </div>
                  </div>
                  <div className="grid gap-6 sm:grid-cols-3">
                    <S3Dropzone
                      category="tenant-branding-logo"
                      label="Logo"
                      description="Full logo for headers (max 2MB, PNG or SVG)"
                      valueUrl={brandingData.logoUrl}
                      inheritedUrl={systemSettings?.defaultLogoUrl}
                      onUploaded={(fileUrl) => handleBrandingChange("logoUrl", fileUrl)}
                      onRemoved={() => handleBrandingChange("logoUrl", null)}
                    />
                    <S3Dropzone
                      category="tenant-branding-icon"
                      label="Icon"
                      description="Square icon for PWA (max 512KB, 192x192px)"
                      valueUrl={brandingData.iconUrl}
                      inheritedUrl={systemSettings?.defaultIconUrl}
                      onUploaded={(fileUrl) => handleBrandingChange("iconUrl", fileUrl)}
                      onRemoved={() => handleBrandingChange("iconUrl", null)}
                    />
                    <S3Dropzone
                      category="tenant-branding-favicon"
                      label="Favicon"
                      description="Browser tab icon (max 512KB, 32x32px)"
                      valueUrl={brandingData.faviconUrl}
                      inheritedUrl={systemSettings?.defaultFaviconUrl}
                      onUploaded={(fileUrl) => handleBrandingChange("faviconUrl", fileUrl)}
                      onRemoved={() => handleBrandingChange("faviconUrl", null)}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          placeholder="#3b82f6"
                          value={brandingData.primaryColor || ""}
                          onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={brandingData.primaryColor || "#3b82f6"}
                          onChange={(e) => handleBrandingChange("primaryColor", e.target.value)}
                          className="w-10 p-1 h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          placeholder="#64748b"
                          value={brandingData.secondaryColor || ""}
                          onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={brandingData.secondaryColor || "#64748b"}
                          onChange={(e) => handleBrandingChange("secondaryColor", e.target.value)}
                          className="w-10 p-1 h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="accentColor">Accent Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="accentColor"
                          placeholder="#10b981"
                          value={brandingData.accentColor || ""}
                          onChange={(e) => handleBrandingChange("accentColor", e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          type="color"
                          value={brandingData.accentColor || "#10b981"}
                          onChange={(e) => handleBrandingChange("accentColor", e.target.value)}
                          className="w-10 p-1 h-9"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="supportEmail">Support Email</Label>
                    <Input
                      id="supportEmail"
                      type="email"
                      value={brandingData.supportEmail || ""}
                      onChange={(e) => handleBrandingChange("supportEmail", e.target.value)}
                      data-testid="input-tenant-support-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="loginMessage">Login Message</Label>
                    <Textarea
                      id="loginMessage"
                      value={brandingData.loginMessage || ""}
                      onChange={(e) => handleBrandingChange("loginMessage", e.target.value)}
                      className="min-h-[60px] resize-none"
                      data-testid="input-tenant-login-message"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t pt-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Switch
                          id="whiteLabelEnabled"
                          checked={brandingData.whiteLabelEnabled || false}
                          onCheckedChange={(checked) => handleBrandingChange("whiteLabelEnabled", checked)}
                          data-testid="switch-white-label"
                        />
                        <Label htmlFor="whiteLabelEnabled" className="text-sm">White Label</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          id="hideVendorBranding"
                          checked={brandingData.hideVendorBranding || false}
                          onCheckedChange={(checked) => handleBrandingChange("hideVendorBranding", checked)}
                          data-testid="switch-hide-vendor"
                        />
                        <Label htmlFor="hideVendorBranding" className="text-sm">Hide Vendor</Label>
                      </div>
                    </div>
                    <Button type="submit" disabled={saveBrandingMutation.isPending} data-testid="button-save-tenant-branding">
                      {saveBrandingMutation.isPending ? (
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
          </TabsContent>

          <TabsContent value="integrations" className="space-y-6 mt-6">
            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">Mailgun</CardTitle>
                  </div>
                  <IntegrationStatusBadge status={getIntegrationStatus("mailgun")} />
                </div>
                <CardDescription>Configure email sending for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveMailgun} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mg-domain" className="text-xs">Domain</Label>
                      <Input
                        id="mg-domain"
                        placeholder="mg.example.com"
                        value={mailgunData.domain || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, domain: e.target.value }))}
                        className="h-8"
                        data-testid="input-mailgun-domain"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mg-from" className="text-xs">From Email</Label>
                      <Input
                        id="mg-from"
                        type="email"
                        placeholder="noreply@example.com"
                        value={mailgunData.fromEmail || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, fromEmail: e.target.value }))}
                        className="h-8"
                        data-testid="input-mailgun-from"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="mg-reply" className="text-xs">Reply-To</Label>
                      <Input
                        id="mg-reply"
                        type="email"
                        value={mailgunData.replyTo || ""}
                        onChange={(e) => setMailgunData(prev => ({ ...prev, replyTo: e.target.value }))}
                        className="h-8"
                        data-testid="input-mailgun-reply"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="mg-key" className="text-xs">
                        API Key
                        {mailgunIntegration?.secretConfigured && (
                          <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />
                        )}
                      </Label>
                      <div className="relative">
                        <Input
                          id="mg-key"
                          type={showApiKey ? "text" : "password"}
                          placeholder={mailgunIntegration?.secretConfigured ? "••••••••" : "key-xxx..."}
                          value={mailgunData.apiKey || ""}
                          onChange={(e) => setMailgunData(prev => ({ ...prev, apiKey: e.target.value }))}
                          className="h-8 pr-8"
                          data-testid="input-mailgun-key"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-8 w-8"
                          onClick={() => setShowApiKey(!showApiKey)}
                        >
                          {showApiKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testMailgunMutation.mutate()}
                      disabled={testMailgunMutation.isPending || getIntegrationStatus("mailgun") === "not_configured"}
                      data-testid="button-test-mailgun"
                    >
                      {testMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                      Test
                    </Button>
                    <Button type="submit" size="sm" disabled={saveMailgunMutation.isPending} data-testid="button-save-mailgun">
                      {saveMailgunMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HardDrive className="h-4 w-4 text-primary" />
                    <CardTitle className="text-base">S3 Storage</CardTitle>
                  </div>
                  <IntegrationStatusBadge status={getIntegrationStatus("s3")} />
                </div>
                <CardDescription>Configure file storage for this tenant</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveS3} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="s3-bucket" className="text-xs">Bucket Name</Label>
                      <Input
                        id="s3-bucket"
                        placeholder="my-bucket"
                        value={s3Data.bucketName || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, bucketName: e.target.value }))}
                        className="h-8"
                        data-testid="input-s3-bucket"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="s3-region" className="text-xs">Region</Label>
                      <Input
                        id="s3-region"
                        placeholder="us-east-1"
                        value={s3Data.region || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, region: e.target.value }))}
                        className="h-8"
                        data-testid="input-s3-region"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="s3-prefix" className="text-xs">Key Prefix</Label>
                    <Input
                      id="s3-prefix"
                      placeholder="tenants/{tenantId}/"
                      value={s3Data.keyPrefixTemplate || ""}
                      onChange={(e) => setS3Data(prev => ({ ...prev, keyPrefixTemplate: e.target.value }))}
                      className="h-8"
                      data-testid="input-s3-prefix"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor="s3-access" className="text-xs">
                        Access Key ID
                        {s3Integration?.secretConfigured && (
                          <Lock className="h-3 w-3 inline ml-1 text-muted-foreground" />
                        )}
                      </Label>
                      <Input
                        id="s3-access"
                        placeholder={s3Integration?.secretConfigured ? "••••••••" : "AKIA..."}
                        value={s3Data.accessKeyId || ""}
                        onChange={(e) => setS3Data(prev => ({ ...prev, accessKeyId: e.target.value }))}
                        className="h-8"
                        data-testid="input-s3-access"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="s3-secret" className="text-xs">Secret Access Key</Label>
                      <div className="relative">
                        <Input
                          id="s3-secret"
                          type={showSecretKey ? "text" : "password"}
                          placeholder={s3Integration?.secretConfigured ? "••••••••" : "Secret..."}
                          value={s3Data.secretAccessKey || ""}
                          onChange={(e) => setS3Data(prev => ({ ...prev, secretAccessKey: e.target.value }))}
                          className="h-8 pr-8"
                          data-testid="input-s3-secret"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-0 top-0 h-8 w-8"
                          onClick={() => setShowSecretKey(!showSecretKey)}
                        >
                          {showSecretKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testS3Mutation.mutate()}
                      disabled={testS3Mutation.isPending || getIntegrationStatus("s3") === "not_configured"}
                      data-testid="button-test-s3"
                    >
                      {testS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3 mr-1" />}
                      Test
                    </Button>
                    <Button type="submit" size="sm" disabled={saveS3Mutation.isPending} data-testid="button-save-s3">
                      {saveS3Mutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                      Save
                    </Button>
                  </div>
                </form>
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

      {/* Delete User Confirmation Dialog */}
      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete <strong>{userToDelete?.email}</strong>? 
              This action cannot be undone and will remove all data associated with this user, 
              including their task assignments, time entries, comments, and activity logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel 
              disabled={deleteUserMutation.isPending}
              data-testid="button-cancel-delete-user"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-user"
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete User"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* User Management Drawer */}
      {activeTenant && selectedUserId && (
        <TenantUserDrawer
          open={!!selectedUserId}
          onClose={() => setSelectedUserId(null)}
          tenantId={activeTenant.id}
          userId={selectedUserId}
          tenantName={activeTenant.name}
        />
      )}

      {/* Provision User Drawer */}
      {activeTenant && (
        <ProvisionUserDrawer
          open={provisionDrawerOpen}
          onClose={() => setProvisionDrawerOpen(false)}
          tenantId={activeTenant.id}
          tenantName={activeTenant.name}
        />
      )}

      {/* Edit Note Dialog */}
      <Dialog open={editNoteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEditNoteDialogOpen(false);
          setEditingNote(null);
        }
      }}>
        <DialogContent className="max-w-2xl" data-testid="dialog-edit-note">
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
            <DialogDescription>
              Make changes to this note. Previous versions will be saved in the history.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={editNoteCategory} onValueChange={setEditNoteCategory}>
                <SelectTrigger data-testid="select-edit-note-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="support">Support</SelectItem>
                  <SelectItem value="billing">Billing</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                  <SelectItem value="accounts">Accounts</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Content</Label>
              <RichTextEditor
                value={editNoteBody}
                onChange={setEditNoteBody}
                placeholder="Edit note content..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditNoteDialogOpen(false);
                setEditingNote(null);
              }}
              data-testid="button-cancel-edit-note"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingNote) {
                  updateNoteMutation.mutate({
                    noteId: editingNote.id,
                    body: editNoteBody,
                    category: editNoteCategory,
                  });
                }
              }}
              disabled={!editNoteBody.trim() || editNoteBody === "<p></p>" || updateNoteMutation.isPending}
              data-testid="button-save-note"
            >
              {updateNoteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={versionHistoryDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setVersionHistoryDialogOpen(false);
          setVersionHistoryNoteId(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh]" data-testid="dialog-version-history">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Note Version History
            </DialogTitle>
            <DialogDescription>
              View all previous versions of this note. Each edit creates a new version.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {versionHistoryLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : versionHistoryData?.versions && versionHistoryData.versions.length > 0 ? (
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {/* Current Version */}
                <div className="border rounded-md p-4 bg-primary/5 border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Current</Badge>
                      <Badge variant="outline" className="text-xs capitalize">
                        {versionHistoryData.currentNote?.category}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(versionHistoryData.currentNote?.updatedAt || versionHistoryData.currentNote?.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <RichTextViewer content={versionHistoryData.currentNote?.body} className="text-sm" />
                </div>

                {/* Previous Versions */}
                {versionHistoryData.versions.map((version) => (
                  <div key={version.id} className="border rounded-md p-4 bg-muted/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Version {version.versionNumber}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">
                          {version.category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          by {version.editor.firstName && version.editor.lastName 
                            ? `${version.editor.firstName} ${version.editor.lastName}` 
                            : version.editor.email}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <RichTextViewer content={version.body} className="text-sm" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No previous versions. This note has never been edited.
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setVersionHistoryDialogOpen(false);
                setVersionHistoryNoteId(null);
              }}
              data-testid="button-close-version-history"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

/**
 * DataImportExportTab - Import/export data for tenant provisioning
 * Supports clients, team members, and time entries
 */
function DataImportExportTab({ tenantId, tenantSlug }: { tenantId: string; tenantSlug: string }) {
  const { toast } = useToast();
  const [activeSection, setActiveSection] = useState<"clients" | "users" | "time-entries">("clients");
  const [isExporting, setIsExporting] = useState(false);
  
  const handleExport = async (type: "clients" | "users" | "time-entries") => {
    setIsExporting(true);
    try {
      const response = await fetch(`/api/v1/super/tenants/${tenantId}/export/${type}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tenantSlug}-${type}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({
        title: "Export Complete",
        description: `${type} exported successfully.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const clientColumns: CsvColumn[] = [
    { key: "companyName", label: "Company Name", required: true },
    { key: "displayName", label: "Display Name" },
    { key: "industry", label: "Industry" },
    { key: "website", label: "Website" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Notes" },
    { key: "addressLine1", label: "Address Line 1" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "postalCode", label: "Postal Code" },
    { key: "country", label: "Country" },
  ];

  const timeEntryColumns: CsvColumn[] = [
    { key: "userEmail", label: "User Email", required: true, aliases: ["email", "user"] },
    { key: "clientName", label: "Client Name", aliases: ["client"] },
    { key: "projectName", label: "Project Name", aliases: ["project"] },
    { key: "description", label: "Description", aliases: ["notes", "task"] },
    { key: "scope", label: "Scope", aliases: ["billable"] },
    { key: "startTime", label: "Start Time", required: true, aliases: ["start", "date", "startDate"] },
    { key: "endTime", label: "End Time", aliases: ["end", "endDate"] },
    { key: "durationSeconds", label: "Duration (seconds)", aliases: ["duration", "seconds", "time"] },
    { key: "isManual", label: "Is Manual", aliases: ["manual"] },
  ];

  const handleImportClients = async (rows: ParsedRow[], _options: Record<string, boolean>): Promise<{ created: number; skipped: number; errors: number; results: ImportResult[] }> => {
    const response = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/import/clients`, { rows });
    const data = await response.json();
    queryClient.invalidateQueries({ queryKey: [`/api/v1/super/tenants/${tenantId}/clients`] });
    return {
      created: data.created,
      skipped: data.skipped,
      errors: data.errors,
      results: data.results.map((r: { name: string; status: string; reason?: string }) => ({
        name: r.name,
        status: r.status as "created" | "skipped" | "error",
        reason: r.reason,
      })),
    };
  };

  const handleImportTimeEntries = async (rows: ParsedRow[], _options: Record<string, boolean>): Promise<{ created: number; skipped: number; errors: number; results: ImportResult[] }> => {
    const response = await apiRequest("POST", `/api/v1/super/tenants/${tenantId}/import/time-entries`, { rows });
    const data = await response.json();
    return {
      created: data.created,
      skipped: data.skipped,
      errors: data.errors,
      results: data.results.map((r: { name: string; status: string; reason?: string }) => ({
        name: r.name,
        status: r.status as "created" | "skipped" | "error",
        reason: r.reason,
      })),
    };
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Data Import & Export
          </CardTitle>
          <CardDescription>
            Import or export clients, team members, and time entries for bulk provisioning.
            Useful for migrating data from other applications like DA Time Tracker.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button
              variant={activeSection === "clients" ? "default" : "outline"}
              onClick={() => setActiveSection("clients")}
              data-testid="button-section-clients"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Clients
            </Button>
            <Button
              variant={activeSection === "users" ? "default" : "outline"}
              onClick={() => setActiveSection("users")}
              data-testid="button-section-users"
            >
              <Users className="h-4 w-4 mr-2" />
              Team Members
            </Button>
            <Button
              variant={activeSection === "time-entries" ? "default" : "outline"}
              onClick={() => setActiveSection("time-entries")}
              data-testid="button-section-time-entries"
            >
              <Clock className="h-4 w-4 mr-2" />
              Time Entries
            </Button>
          </div>
        </CardContent>
      </Card>

      {activeSection === "clients" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Export Clients</CardTitle>
              <CardDescription>Download all clients as a CSV file</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => handleExport("clients")} 
                disabled={isExporting}
                data-testid="button-export-clients"
              >
                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Clients
              </Button>
            </CardContent>
          </Card>

          <CsvImportPanel
            title="Import Clients"
            description="Upload a CSV file to import clients. Existing clients with matching company names will be skipped."
            columns={clientColumns}
            templateFilename={`${tenantSlug}-clients-template.csv`}
            onImport={handleImportClients}
            nameField="companyName"
          />
        </>
      )}

      {activeSection === "users" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Export Team Members</CardTitle>
              <CardDescription>Download all team members as a CSV file</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => handleExport("users")} 
                disabled={isExporting}
                data-testid="button-export-users"
              >
                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Team Members
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Import Team Members</CardTitle>
              <CardDescription>
                Use the bulk CSV import on the Users tab for importing team members with invitations.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Navigate to the Users tab and use the CSV Import feature there to import team members.
                This allows you to send invitation emails and configure roles.
              </p>
            </CardContent>
          </Card>
        </>
      )}

      {activeSection === "time-entries" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Export Time Entries</CardTitle>
              <CardDescription>Download all time tracking entries as a CSV file</CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => handleExport("time-entries")} 
                disabled={isExporting}
                data-testid="button-export-time-entries"
              >
                {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                Export Time Entries
              </Button>
            </CardContent>
          </Card>

          <CsvImportPanel
            title="Import Time Entries"
            description="Upload a CSV file to import time tracking entries from DA Time Tracker or other apps. Users must exist in the system (matched by email). Clients and projects are matched by name if they exist."
            columns={timeEntryColumns}
            templateFilename={`${tenantSlug}-time-entries-template.csv`}
            onImport={handleImportTimeEntries}
            nameField="userEmail"
          />
        </>
      )}
    </div>
  );
}

