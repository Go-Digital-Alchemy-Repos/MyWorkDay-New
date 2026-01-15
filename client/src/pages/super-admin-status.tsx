import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Loader2, Activity, Database, Wifi, HardDrive, Mail, CheckCircle, XCircle, AlertCircle, RefreshCw, Building2, Wrench, ExternalLink, Search, Trash2, Archive, ArrowRight, Shield, FileWarning, Copy, ChevronLeft, ChevronRight, KeyRound, Globe, Server, Lock, Info } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface HealthCheck {
  database: { status: "healthy" | "unhealthy" | "unknown"; latencyMs?: number };
  websocket: { status: "healthy" | "unhealthy" | "unknown"; connections?: number };
  s3: { status: "healthy" | "unhealthy" | "not_configured" };
  mailgun: { status: "healthy" | "unhealthy" | "not_configured" };
  app: { version?: string; uptime?: number; environment?: string };
}

interface TenancyHealth {
  currentMode: string;
  totalMissing: number;
  totalQuarantined: number;
  activeTenantCount: number;
  missingByTable: Record<string, number>;
  quarantinedByTable: Record<string, number>;
  hasQuarantineTenant: boolean;
  warningStats: {
    last24Hours: number;
    last7Days: number;
    total: number;
  };
}

interface QuarantineSummary {
  hasQuarantineTenant: boolean;
  quarantineTenantId?: string;
  counts: Record<string, number>;
  message?: string;
}

interface QuarantineListResponse {
  rows: any[];
  total: number;
  page: number;
  limit: number;
  table: string;
}

interface TenantIdScan {
  missing: Record<string, number>;
  totalMissing: number;
  quarantineTenantId: string | null;
  backfillAllowed: boolean;
  notes: string[];
}

interface BackfillResult {
  mode: string;
  updated: Record<string, number>;
  quarantined: Record<string, number>;
  ambiguousSamples: Record<string, string[]>;
  quarantineTenantId?: string;
}

interface IntegrityIssue {
  code: string;
  severity: "info" | "warn" | "blocker";
  count: number;
  sampleIds: string[];
  description: string;
}

interface IntegrityChecksResponse {
  issues: IntegrityIssue[];
  totalIssues: number;
  blockerCount: number;
  warnCount: number;
  infoCount: number;
  timestamp: string;
}

interface DebugConfig {
  flags: {
    SUPER_DEBUG_DELETE_ALLOWED: boolean;
    SUPER_DEBUG_ACTIONS_ALLOWED: boolean;
    BACKFILL_TENANT_IDS_ALLOWED: boolean;
    TENANCY_ENFORCEMENT: string;
  };
  confirmPhrases: Record<string, string>;
}

interface OrphanTableResult {
  table: string;
  count: number;
  sampleIds: Array<{ id: string; display: string }>;
  recommendedAction: string;
}

interface OrphanDetectionResult {
  totalOrphans: number;
  tablesWithOrphans: number;
  tables: OrphanTableResult[];
  quarantineTenant: {
    id?: string;
    name?: string;
    exists: boolean;
  };
}

interface OrphanFixResult {
  dryRun: boolean;
  quarantineTenantId: string | null;
  quarantineCreated: boolean;
  totalFixed: number;
  totalWouldFix: number;
  results: Array<{
    table: string;
    action: string;
    countBefore: number;
    countFixed: number;
    targetTenantId: string | null;
  }>;
}

interface TenantPickerItem {
  id: string;
  name: string;
  status: string;
}

interface AuthDiagnosticsData {
  authType: string;
  overallStatus: "healthy" | "warning" | "error";
  cookies: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax" | "none" | "strict";
    domainConfigured: boolean;
    maxAgeDays: number;
  };
  cors: {
    credentialsEnabled: boolean;
    allowedOriginConfigured: boolean;
  };
  proxy: {
    trustProxyEnabled: boolean;
  };
  session: {
    enabled: boolean;
    storeType: "memory" | "pg" | "redis" | "none";
    secretConfigured: boolean;
  };
  runtime: {
    nodeEnv: string;
    isRailway: boolean;
    databaseConfigured: boolean;
  };
  issues: string[];
  warnings: string[];
  commonFixes: Array<{ condition: string; tip: string }>;
  lastAuthCheck: string;
}

interface StatusSummary {
  ok: boolean;
  requestId: string;
  timestamp: string;
  checks: {
    db: {
      status: "ok" | "failed";
      latencyMs: number;
      error?: string;
    };
    migrations: {
      version: string | null;
      available: boolean;
    };
    s3: {
      configured: boolean;
      presign: "ok" | "failed" | "not_tested";
      error?: string;
    };
    mailgun: {
      configured: boolean;
    };
    auth: {
      cookieSecure: boolean;
      cookieHttpOnly: boolean;
      cookieSameSite: string;
      trustProxy: boolean;
      sessionSecretSet: boolean;
      environment: string;
    };
    orphanCounts: {
      totalMissing: number;
      totalQuarantined: number;
      byTable: Record<string, number>;
      error?: string;
    };
  };
}

function StatusIcon({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />;
    case "not_configured":
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    default:
      return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
  }
}

function StatusBadge({ status }: { status: "healthy" | "unhealthy" | "unknown" | "not_configured" }) {
  const variants: Record<string, "default" | "destructive" | "outline" | "secondary"> = {
    healthy: "default",
    unhealthy: "destructive",
    not_configured: "outline",
    unknown: "secondary",
  };
  return <Badge variant={variants[status] || "secondary"}>{status.replace("_", " ")}</Badge>;
}

function DiagnosticIcon({ ok }: { ok: boolean }) {
  return ok 
    ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
    : <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
}

function WarningIcon() {
  return <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />;
}

function AuthDiagnosticsPanel() {
  const { toast } = useToast();
  
  const { data: authData, isLoading, error, refetch } = useQuery<AuthDiagnosticsData>({
    queryKey: ["/api/v1/super/status/auth-diagnostics"],
  });
  
  const copyDiagnostics = () => {
    if (!authData) return;
    const summary = JSON.stringify(authData, null, 2);
    navigator.clipboard.writeText(summary);
    toast({ title: "Copied to clipboard", description: "Diagnostics summary copied" });
  };
  
  if (error) {
    const requestId = (error as any)?.requestId || "unknown";
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-500 flex items-center gap-2">
            <XCircle className="h-5 w-5" />
            Auth Diagnostics Error
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-2">
            Failed to load auth diagnostics. This may indicate a configuration issue.
          </p>
          <p className="text-sm text-muted-foreground">Request ID: {requestId}</p>
          <Button variant="outline" onClick={() => refetch()} className="mt-4" data-testid="button-retry-auth-diagnostics">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading || !authData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  const statusColors = {
    healthy: "bg-green-100 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300",
    warning: "bg-yellow-100 border-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-300",
    error: "bg-red-100 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300",
  };
  
  const statusMessages = {
    healthy: "Cookie-based auth appears healthy",
    warning: "Potential misconfiguration detected",
    error: "Auth misconfiguration – login may fail",
  };
  
  const statusIcons = {
    healthy: <CheckCircle className="h-5 w-5" />,
    warning: <AlertCircle className="h-5 w-5" />,
    error: <XCircle className="h-5 w-5" />,
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start gap-4 flex-wrap">
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border ${statusColors[authData.overallStatus]}`}>
          {statusIcons[authData.overallStatus]}
          <span className="font-medium">{statusMessages[authData.overallStatus]}</span>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh-auth">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" onClick={copyDiagnostics} data-testid="button-copy-diagnostics">
            <Copy className="h-4 w-4 mr-2" />
            Copy Summary
          </Button>
        </div>
      </div>
      
      {authData.issues.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center gap-2">
              <XCircle className="h-4 w-4" />
              Critical Issues
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {authData.issues.map((issue, i) => (
                <li key={i} className="text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  {issue}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      {authData.warnings.length > 0 && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-yellow-600 dark:text-yellow-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {authData.warnings.map((warning, i) => (
                <li key={i} className="text-sm text-yellow-700 dark:text-yellow-300 flex items-start gap-2">
                  <span className="shrink-0 mt-0.5">•</span>
                  {warning}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Auth Mode</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Type</span>
              <Badge variant="outline">{authData.authType}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Session Store</span>
              <Badge variant="outline">{authData.session.storeType}</Badge>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Cookie Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">HttpOnly</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cookies.httpOnly} />
                <span className="text-sm">{authData.cookies.httpOnly ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Secure</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cookies.secure || authData.runtime.nodeEnv !== "production"} />
                <span className="text-sm">{authData.cookies.secure ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">SameSite</span>
              <Badge variant="outline">{authData.cookies.sameSite}</Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Max Age</span>
              <span className="text-sm">{authData.cookies.maxAgeDays} days</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">CORS Configuration</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Credentials Enabled</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.cors.credentialsEnabled} />
                <span className="text-sm">{authData.cors.credentialsEnabled ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Origin Configured</span>
              <div className="flex items-center gap-1">
                {authData.cors.allowedOriginConfigured ? (
                  <DiagnosticIcon ok={true} />
                ) : (
                  <WarningIcon />
                )}
                <span className="text-sm">{authData.cors.allowedOriginConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Server className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Proxy / Railway</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Trust Proxy</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.proxy.trustProxyEnabled} />
                <span className="text-sm">{authData.proxy.trustProxyEnabled ? "Enabled" : "Disabled"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Environment</span>
              <Badge variant={authData.runtime.nodeEnv === "production" ? "default" : "outline"}>
                {authData.runtime.nodeEnv}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Railway</span>
              <span className="text-sm">{authData.runtime.isRailway ? "Detected" : "No"}</span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-sm font-medium">Session Store</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Session Enabled</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.session.enabled} />
                <span className="text-sm">{authData.session.enabled ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Secret Configured</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.session.secretConfigured} />
                <span className="text-sm">{authData.session.secretConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground">Database Connected</span>
              <div className="flex items-center gap-1">
                <DiagnosticIcon ok={authData.runtime.databaseConfigured} />
                <span className="text-sm">{authData.runtime.databaseConfigured ? "Yes" : "No"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {authData.commonFixes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Info className="h-4 w-4" />
              Common Fixes
            </CardTitle>
            <CardDescription>
              Troubleshooting tips based on your configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {authData.commonFixes.map((fix, i) => (
                <li key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <span className="text-sm">{fix.tip}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      <div className="text-xs text-muted-foreground text-right">
        Last checked: {new Date(authData.lastAuthCheck).toLocaleString()}
      </div>
    </div>
  );
}

function DebugToolsPanel() {
  const { toast } = useToast();
  const [selectedTable, setSelectedTable] = useState<string>("projects");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [assignDialog, setAssignDialog] = useState<{ row: any; table: string } | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{ row: any; table: string } | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState("");
  const [backfillResult, setBackfillResult] = useState<BackfillResult | null>(null);
  const [orphanFixConfirmText, setOrphanFixConfirmText] = useState("");
  const [orphanFixResult, setOrphanFixResult] = useState<OrphanFixResult | null>(null);

  const { data: debugConfig, isLoading: configLoading } = useQuery<DebugConfig>({
    queryKey: ["/api/v1/super/debug/config"],
  });

  const { data: quarantineSummary, isLoading: summaryLoading, refetch: refetchSummary } = useQuery<QuarantineSummary>({
    queryKey: ["/api/v1/super/debug/quarantine/summary"],
  });

  const { data: quarantineList, isLoading: listLoading, refetch: refetchList } = useQuery<QuarantineListResponse>({
    queryKey: ["/api/v1/super/debug/quarantine/list", selectedTable, currentPage, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({
        table: selectedTable,
        page: currentPage.toString(),
        limit: "20",
      });
      if (searchQuery) params.set("q", searchQuery);
      const res = await fetch(`/api/v1/super/debug/quarantine/list?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch quarantine list");
      return res.json();
    },
  });

  const { data: tenantIdScan, isLoading: scanLoading, refetch: refetchScan } = useQuery<TenantIdScan>({
    queryKey: ["/api/v1/super/debug/tenantid/scan"],
  });

  const { data: integrityChecks, isLoading: integrityLoading, refetch: refetchIntegrity } = useQuery<IntegrityChecksResponse>({
    queryKey: ["/api/v1/super/debug/integrity/checks"],
  });

  const { data: orphanDetection, isLoading: orphanLoading, refetch: refetchOrphans } = useQuery<OrphanDetectionResult>({
    queryKey: ["/api/v1/super/health/orphans"],
  });

  const { data: tenantsList } = useQuery<TenantPickerItem[]>({
    queryKey: ["/api/v1/super/tenants/picker"],
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { table: string; id: string; assignTo: any }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/assign", data);
    },
    onSuccess: () => {
      toast({ title: "Row assigned successfully" });
      refetchSummary();
      refetchList();
      setAssignDialog(null);
      setSelectedTenantId("");
      setSelectedWorkspaceId("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to assign", description: error.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (data: { table: string; id: string }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/archive", data);
    },
    onSuccess: (data: any) => {
      toast({ title: data.message || "Action completed" });
      refetchSummary();
      refetchList();
    },
    onError: (error: any) => {
      toast({ title: "Failed to archive", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (data: { table: string; id: string; confirmPhrase: string }) => {
      return apiRequest("POST", "/api/v1/super/debug/quarantine/delete", data, {
        "X-Confirm-Delete": "DELETE_QUARANTINED_ROW",
      });
    },
    onSuccess: () => {
      toast({ title: "Row deleted permanently" });
      refetchSummary();
      refetchList();
      setDeleteDialog(null);
      setConfirmPhrase("");
    },
    onError: (error: any) => {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async (mode: "dry_run" | "apply") => {
      const headers: Record<string, string> = {};
      if (mode === "apply") {
        headers["X-Confirm-Backfill"] = "APPLY_TENANTID_BACKFILL";
      }
      return apiRequest("POST", `/api/v1/super/debug/tenantid/backfill?mode=${mode}`, {}, headers);
    },
    onSuccess: (data: BackfillResult) => {
      setBackfillResult(data);
      toast({ title: `Backfill ${data.mode === "apply" ? "applied" : "simulated"} successfully` });
      refetchScan();
      refetchSummary();
    },
    onError: (error: any) => {
      toast({ title: "Backfill failed", description: error.message, variant: "destructive" });
    },
  });

  const orphanFixMutation = useMutation({
    mutationFn: async (params: { dryRun: boolean; confirmText?: string }) => {
      const res = await apiRequest("POST", "/api/v1/super/health/orphans/fix", params);
      return res.json();
    },
    onSuccess: (data: OrphanFixResult) => {
      setOrphanFixResult(data);
      if (data.dryRun) {
        toast({ title: "Dry run complete", description: `Would fix ${data.totalWouldFix} orphan rows` });
      } else {
        toast({ title: "Orphans fixed", description: `Fixed ${data.totalFixed} rows to quarantine tenant` });
        refetchOrphans();
        refetchSummary();
      }
      setOrphanFixConfirmText("");
    },
    onError: (error: any) => {
      toast({ title: "Orphan fix failed", description: error.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const totalPages = quarantineList ? Math.ceil(quarantineList.total / 20) : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Debug Configuration
              </CardTitle>
              <CardDescription>Environment flags and confirmation phrases</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {configLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : debugConfig ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Environment Flags</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delete Allowed:</span>
                    <Badge variant={debugConfig.flags.SUPER_DEBUG_DELETE_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.SUPER_DEBUG_DELETE_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Debug Actions:</span>
                    <Badge variant={debugConfig.flags.SUPER_DEBUG_ACTIONS_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.SUPER_DEBUG_ACTIONS_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Backfill Allowed:</span>
                    <Badge variant={debugConfig.flags.BACKFILL_TENANT_IDS_ALLOWED ? "default" : "secondary"}>
                      {debugConfig.flags.BACKFILL_TENANT_IDS_ALLOWED ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tenancy Mode:</span>
                    <Badge variant="outline">{debugConfig.flags.TENANCY_ENFORCEMENT}</Badge>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Required Confirmation Phrases</h4>
                <div className="space-y-1 text-sm font-mono">
                  {Object.entries(debugConfig.confirmPhrases).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center gap-2">
                      <span className="text-muted-foreground capitalize">{key}:</span>
                      <code className="bg-muted px-2 py-1 rounded text-xs">{value}</code>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={["quarantine"]} className="space-y-4">
        <AccordionItem value="quarantine" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              <span className="font-semibold">Quarantine Manager</span>
              {quarantineSummary && (
                <Badge variant="secondary" className="ml-2">
                  {Object.values(quarantineSummary.counts).reduce((a, b) => a + b, 0)} rows
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            {summaryLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : quarantineSummary ? (
              <div className="space-y-4">
                {!quarantineSummary.hasQuarantineTenant ? (
                  <div className="p-4 border rounded-lg bg-muted/50 text-center">
                    <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-muted-foreground">{quarantineSummary.message}</p>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-2 md:grid-cols-4">
                      {Object.entries(quarantineSummary.counts).map(([table, count]) => (
                        <div 
                          key={table} 
                          className={`p-3 border rounded-lg cursor-pointer transition-colors ${selectedTable === table ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}
                          onClick={() => { setSelectedTable(table); setCurrentPage(1); }}
                          data-testid={`quarantine-table-${table}`}
                        >
                          <div className="text-sm text-muted-foreground capitalize">{table}</div>
                          <div className="text-2xl font-bold">{count}</div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`Search ${selectedTable}...`}
                          value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                          className="pl-10"
                          data-testid="input-quarantine-search"
                        />
                      </div>
                      <Button variant="outline" onClick={() => refetchList()} data-testid="button-refresh-quarantine">
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>

                    {listLoading ? (
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    ) : quarantineList && quarantineList.rows.length > 0 ? (
                      <div className="space-y-2">
                        <ScrollArea className="h-[300px] border rounded-lg">
                          <div className="p-2 space-y-2">
                            {quarantineList.rows.map((row) => (
                              <div key={row.id} className="p-3 border rounded-lg flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {row.name || row.title || row.email || row.id}
                                  </div>
                                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                                    <span className="font-mono">{row.id.slice(0, 8)}...</span>
                                    {row.createdAt && (
                                      <span>Created: {new Date(row.createdAt).toLocaleDateString()}</span>
                                    )}
                                    {row.status && <Badge variant="outline" className="text-xs">{row.status}</Badge>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setAssignDialog({ row, table: selectedTable })}
                                    data-testid={`button-assign-${row.id}`}
                                  >
                                    <ArrowRight className="h-3 w-3 mr-1" />
                                    Assign
                                  </Button>
                                  {selectedTable === "users" && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => archiveMutation.mutate({ table: selectedTable, id: row.id })}
                                      disabled={archiveMutation.isPending}
                                      data-testid={`button-archive-${row.id}`}
                                    >
                                      <Archive className="h-3 w-3" />
                                    </Button>
                                  )}
                                  {debugConfig?.flags.SUPER_DEBUG_DELETE_ALLOWED && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() => setDeleteDialog({ row, table: selectedTable })}
                                      data-testid={`button-delete-${row.id}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                        
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              Page {currentPage} of {totalPages} ({quarantineList.total} total)
                            </span>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        No quarantined {selectedTable} found
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : null}
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="backfill" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              <span className="font-semibold">TenantId Backfill Tools</span>
              {tenantIdScan && tenantIdScan.totalMissing > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {tenantIdScan.totalMissing} missing
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Missing TenantId Scan</h4>
                <Button variant="outline" size="sm" onClick={() => refetchScan()} disabled={scanLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${scanLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {scanLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : tenantIdScan ? (
                <>
                  <div className="grid gap-2 md:grid-cols-5">
                    {Object.entries(tenantIdScan.missing).map(([table, count]) => (
                      <div key={table} className="p-3 border rounded-lg">
                        <div className="text-sm text-muted-foreground capitalize">{table}</div>
                        <div className={`text-xl font-bold ${Number(count) > 0 ? "text-destructive" : "text-green-600"}`}>
                          {count}
                        </div>
                      </div>
                    ))}
                  </div>

                  {tenantIdScan.notes.length > 0 && (
                    <div className="p-3 border rounded-lg bg-muted/50 space-y-1">
                      {tenantIdScan.notes.map((note, i) => (
                        <p key={i} className="text-sm text-muted-foreground">{note}</p>
                      ))}
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => backfillMutation.mutate("dry_run")}
                      disabled={backfillMutation.isPending}
                      data-testid="button-backfill-dryrun"
                    >
                      {backfillMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Dry Run
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => backfillMutation.mutate("apply")}
                      disabled={backfillMutation.isPending || !tenantIdScan.backfillAllowed}
                      data-testid="button-backfill-apply"
                    >
                      {backfillMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Apply Backfill
                    </Button>
                    {!tenantIdScan.backfillAllowed && (
                      <span className="text-sm text-muted-foreground">
                        Set BACKFILL_TENANT_IDS_ALLOWED=true to enable
                      </span>
                    )}
                  </div>

                  {backfillResult && (
                    <div className="p-4 border rounded-lg space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                          Backfill Result ({backfillResult.mode === "apply" ? "Applied" : "Dry Run"})
                        </h4>
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(JSON.stringify(backfillResult, null, 2))}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <div>
                          <div className="text-sm font-medium text-green-600">Updated</div>
                          <div className="text-sm space-y-1">
                            {Object.entries(backfillResult.updated).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-yellow-600">Quarantined</div>
                          <div className="text-sm space-y-1">
                            {Object.entries(backfillResult.quarantined).map(([table, count]) => (
                              <div key={table} className="flex justify-between">
                                <span className="capitalize">{table}:</span>
                                <span>{count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="integrity" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <FileWarning className="h-5 w-5" />
              <span className="font-semibold">Data Integrity Checks</span>
              {integrityChecks && integrityChecks.totalIssues > 0 && (
                <Badge variant={integrityChecks.blockerCount > 0 ? "destructive" : "secondary"} className="ml-2">
                  {integrityChecks.totalIssues} issues
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Read-only checks for cross-tenant mismatches and data issues
                </p>
                <Button variant="outline" size="sm" onClick={() => refetchIntegrity()} disabled={integrityLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${integrityLoading ? "animate-spin" : ""}`} />
                  Run Checks
                </Button>
              </div>

              {integrityLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : integrityChecks ? (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Blockers</div>
                      <div className={`text-xl font-bold ${integrityChecks.blockerCount > 0 ? "text-destructive" : "text-green-600"}`}>
                        {integrityChecks.blockerCount}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Warnings</div>
                      <div className={`text-xl font-bold ${integrityChecks.warnCount > 0 ? "text-yellow-600" : "text-green-600"}`}>
                        {integrityChecks.warnCount}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Info</div>
                      <div className="text-xl font-bold">{integrityChecks.infoCount}</div>
                    </div>
                  </div>

                  {integrityChecks.issues.length > 0 ? (
                    <div className="space-y-2">
                      {integrityChecks.issues.map((issue, i) => (
                        <div key={i} className="p-3 border rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <code className="text-sm font-medium">{issue.code}</code>
                            <Badge variant={issue.severity === "blocker" ? "destructive" : issue.severity === "warn" ? "secondary" : "outline"}>
                              {issue.severity} ({issue.count})
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{issue.description}</p>
                          {issue.sampleIds.length > 0 && (
                            <div className="mt-2 text-xs font-mono text-muted-foreground">
                              Sample IDs: {issue.sampleIds.slice(0, 3).join(", ")}
                              {issue.sampleIds.length > 3 && "..."}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-green-600">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                      No integrity issues found
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground text-right">
                    Last checked: {new Date(integrityChecks.timestamp).toLocaleString()}
                  </div>
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="orphan-fix" className="border rounded-lg">
          <AccordionTrigger className="px-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5" />
              <span className="font-semibold">Orphan Fix Wizard</span>
              {orphanDetection && orphanDetection.totalOrphans > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {orphanDetection.totalOrphans} orphans
                </Badge>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Detect and quarantine rows missing tenantId
                </p>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchOrphans()} 
                  disabled={orphanLoading}
                  data-testid="button-refresh-orphans"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${orphanLoading ? "animate-spin" : ""}`} />
                  Scan
                </Button>
              </div>

              {orphanLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : orphanDetection ? (
                <>
                  <div className="grid gap-2 md:grid-cols-3">
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Total Orphans</div>
                      <div className={`text-xl font-bold ${orphanDetection.totalOrphans > 0 ? "text-destructive" : "text-green-600"}`}>
                        {orphanDetection.totalOrphans}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Tables With Orphans</div>
                      <div className={`text-xl font-bold ${orphanDetection.tablesWithOrphans > 0 ? "text-yellow-600" : "text-green-600"}`}>
                        {orphanDetection.tablesWithOrphans}
                      </div>
                    </div>
                    <div className="p-3 border rounded-lg">
                      <div className="text-sm text-muted-foreground">Quarantine Tenant</div>
                      <div className="text-sm font-medium">
                        {orphanDetection.quarantineTenant.exists ? (
                          <span className="text-green-600">Exists</span>
                        ) : (
                          <span className="text-muted-foreground">Will be created</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {orphanDetection.totalOrphans > 0 && (
                    <>
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Orphans by Table</h4>
                        <div className="grid gap-2 md:grid-cols-4">
                          {orphanDetection.tables
                            .filter(t => t.count > 0)
                            .map(tableResult => (
                              <div key={tableResult.table} className="p-2 border rounded-lg">
                                <div className="flex justify-between items-center">
                                  <span className="text-sm capitalize">{tableResult.table}</span>
                                  <Badge variant="secondary">{tableResult.count}</Badge>
                                </div>
                                {tableResult.sampleIds.length > 0 && (
                                  <div className="mt-1 text-xs text-muted-foreground truncate">
                                    {tableResult.sampleIds.slice(0, 2).map(s => s.display).join(", ")}
                                    {tableResult.sampleIds.length > 2 && "..."}
                                  </div>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>

                      <Separator />

                      <div className="space-y-3">
                        <div className="flex items-center gap-4">
                          <Button
                            variant="outline"
                            onClick={() => orphanFixMutation.mutate({ dryRun: true })}
                            disabled={orphanFixMutation.isPending}
                            data-testid="button-orphan-dryrun"
                          >
                            {orphanFixMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Preview Fix (Dry Run)
                          </Button>
                        </div>

                        {orphanFixResult && orphanFixResult.dryRun && (
                          <div className="p-4 border rounded-lg bg-muted/50 space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Dry Run Preview</h4>
                              <Badge variant="outline">Would fix {orphanFixResult.totalWouldFix} rows</Badge>
                            </div>
                            <div className="grid gap-2 md:grid-cols-3">
                              {orphanFixResult.results
                                .filter(r => r.action === "would_fix")
                                .map(r => (
                                  <div key={r.table} className="text-sm flex justify-between">
                                    <span className="capitalize">{r.table}:</span>
                                    <span>{r.countBefore}</span>
                                  </div>
                                ))}
                            </div>

                            <Separator />

                            <div className="space-y-2">
                              <Label htmlFor="orphan-confirm">Type FIX_ORPHANS to execute</Label>
                              <div className="flex gap-2">
                                <Input
                                  id="orphan-confirm"
                                  value={orphanFixConfirmText}
                                  onChange={(e) => setOrphanFixConfirmText(e.target.value)}
                                  placeholder="FIX_ORPHANS"
                                  className="max-w-xs"
                                  data-testid="input-orphan-confirm"
                                />
                                <Button
                                  onClick={() => orphanFixMutation.mutate({ dryRun: false, confirmText: orphanFixConfirmText })}
                                  disabled={orphanFixConfirmText !== "FIX_ORPHANS" || orphanFixMutation.isPending}
                                  data-testid="button-orphan-execute"
                                >
                                  {orphanFixMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                  Execute Fix
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}

                        {orphanFixResult && !orphanFixResult.dryRun && (
                          <div className="p-4 border rounded-lg border-green-500/50 bg-green-50 dark:bg-green-950/20 space-y-2">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <h4 className="font-medium text-green-800 dark:text-green-300">Fix Applied</h4>
                            </div>
                            <p className="text-sm text-green-700 dark:text-green-400">
                              Moved {orphanFixResult.totalFixed} rows to quarantine tenant
                              {orphanFixResult.quarantineCreated && " (created new quarantine tenant)"}
                            </p>
                            <div className="text-xs text-muted-foreground">
                              Quarantine Tenant ID: {orphanFixResult.quarantineTenantId}
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  {orphanDetection.totalOrphans === 0 && (
                    <div className="text-center py-8 text-green-600">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2" />
                      No orphan rows found
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={!!assignDialog} onOpenChange={() => { setAssignDialog(null); setSelectedTenantId(""); setSelectedWorkspaceId(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Tenant</DialogTitle>
            <DialogDescription>
              Move this {assignDialog?.table?.slice(0, -1)} out of quarantine to a valid tenant
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Target Tenant</Label>
              <Select value={selectedTenantId} onValueChange={setSelectedTenantId}>
                <SelectTrigger data-testid="select-target-tenant">
                  <SelectValue placeholder="Select tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenantsList?.filter(t => t.status === "active").map((tenant) => (
                    <SelectItem key={tenant.id} value={tenant.id}>{tenant.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialog(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (assignDialog && selectedTenantId) {
                  assignMutation.mutate({
                    table: assignDialog.table,
                    id: assignDialog.row.id,
                    assignTo: { tenantId: selectedTenantId },
                  });
                }
              }}
              disabled={!selectedTenantId || assignMutation.isPending}
              data-testid="button-confirm-assign"
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Assign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteDialog} onOpenChange={() => { setDeleteDialog(null); setConfirmPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Permanently Delete</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Type the confirmation phrase to delete this {deleteDialog?.table?.slice(0, -1)}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 border rounded-lg bg-muted/50">
              <div className="font-medium">{deleteDialog?.row?.name || deleteDialog?.row?.title || deleteDialog?.row?.email}</div>
              <div className="text-xs font-mono text-muted-foreground">{deleteDialog?.row?.id}</div>
            </div>
            <div className="space-y-2">
              <Label>Type DELETE_QUARANTINED_ROW to confirm</Label>
              <Input
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="DELETE_QUARANTINED_ROW"
                data-testid="input-delete-confirm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleteDialog && confirmPhrase === "DELETE_QUARANTINED_ROW") {
                  deleteMutation.mutate({
                    table: deleteDialog.table,
                    id: deleteDialog.row.id,
                    confirmPhrase,
                  });
                }
              }}
              disabled={confirmPhrase !== "DELETE_QUARANTINED_ROW" || deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SuperEmailLog {
  id: string;
  tenantId: string | null;
  messageType: string;
  toEmail: string;
  subject: string;
  status: string;
  providerMessageId: string | null;
  lastError: string | null;
  requestId: string | null;
  resendCount: number | null;
  createdAt: string;
}

interface SuperEmailStats {
  total: number;
  sent: number;
  failed: number;
  queued: number;
  last24Hours: number;
  last7Days: number;
}

function SuperEmailLogsPanel() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [tenantFilter, setTenantFilter] = useState<string>("");
  const [page, setPage] = useState(0);
  const limit = 20;

  const buildQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (typeFilter !== "all") params.set("messageType", typeFilter);
    if (tenantFilter) params.set("tenantId", tenantFilter);
    params.set("limit", limit.toString());
    params.set("offset", (page * limit).toString());
    return params.toString();
  };

  const statsQuery = useQuery<{ ok: boolean; data: SuperEmailStats }>({
    queryKey: ["/api/v1/super/email-logs/stats", tenantFilter],
    queryFn: async () => {
      const url = tenantFilter 
        ? `/api/v1/super/email-logs/stats?tenantId=${tenantFilter}`
        : "/api/v1/super/email-logs/stats";
      const res = await fetch(url, { credentials: "include" });
      return res.json();
    },
  });

  const logsQuery = useQuery<{ ok: boolean; data: SuperEmailLog[]; total: number }>({
    queryKey: ["/api/v1/super/email-logs", statusFilter, typeFilter, tenantFilter, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/super/email-logs?${buildQueryString()}`, { credentials: "include" });
      return res.json();
    },
  });

  const resendMutation = useMutation({
    mutationFn: async (emailId: string) => {
      return apiRequest("POST", `/api/v1/super/email-logs/${emailId}/resend`);
    },
    onSuccess: () => {
      toast({ title: "Email queued for resend" });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to resend",
        description: error.message || "Could not resend email",
        variant: "destructive",
      });
    },
  });

  const stats = statsQuery.data?.data;
  const logs = logsQuery.data?.data || [];
  const total = logsQuery.data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const canResend = (email: SuperEmailLog) => {
    const resendableTypes = ["invitation", "forgot_password"];
    return email.status === "failed" && resendableTypes.includes(email.messageType) && (email.resendCount || 0) < 3;
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs"] });
    queryClient.invalidateQueries({ queryKey: ["/api/v1/super/email-logs/stats"] });
  };

  const MESSAGE_TYPE_LABELS: Record<string, string> = {
    invitation: "Invitation",
    mention_notification: "Mention",
    forgot_password: "Password Reset",
    test_email: "Test Email",
    other: "Other",
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Emails</CardDescription>
            <CardTitle className="text-2xl">{stats?.total ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sent</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats?.sent ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl text-red-600">{stats?.failed ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last 24 Hours</CardDescription>
            <CardTitle className="text-2xl">{stats?.last24Hours ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                All Email Logs
              </CardTitle>
              <CardDescription>Cross-tenant email history and resend controls</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-super-email-logs">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-row gap-4 mb-4 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40" data-testid="select-super-status-filter">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="queued">Queued</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48" data-testid="select-super-type-filter">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="invitation">Invitation</SelectItem>
                <SelectItem value="mention_notification">Mention</SelectItem>
                <SelectItem value="forgot_password">Password Reset</SelectItem>
                <SelectItem value="test_email">Test Email</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Tenant ID filter..."
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className="w-64"
              data-testid="input-tenant-filter"
            />
          </div>

          {logsQuery.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No email logs found</p>
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-left font-medium">Type</th>
                      <th className="px-4 py-3 text-left font-medium">Tenant</th>
                      <th className="px-4 py-3 text-left font-medium">Recipient</th>
                      <th className="px-4 py-3 text-left font-medium">Subject</th>
                      <th className="px-4 py-3 text-left font-medium">Sent At</th>
                      <th className="px-4 py-3 w-24 text-left font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((email) => (
                      <tr key={email.id} className="border-t" data-testid={`row-super-email-${email.id}`}>
                        <td className="px-4 py-3">
                          <Badge
                            className={
                              email.status === "sent"
                                ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                : email.status === "failed"
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300"
                            }
                          >
                            {email.status === "sent" && <CheckCircle className="h-3 w-3 mr-1" />}
                            {email.status === "failed" && <XCircle className="h-3 w-3 mr-1" />}
                            {email.status === "queued" && <Loader2 className="h-3 w-3 mr-1" />}
                            {email.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{MESSAGE_TYPE_LABELS[email.messageType] || email.messageType}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs truncate max-w-[100px] block">{email.tenantId || "-"}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs">{email.toEmail}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="truncate max-w-[200px] block">{email.subject}</span>
                          {email.lastError && (
                            <span className="text-xs text-red-500 block mt-1 truncate max-w-[200px]">{email.lastError}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(email.createdAt)}</td>
                        <td className="px-4 py-3">
                          {canResend(email) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => resendMutation.mutate(email.id)}
                              disabled={resendMutation.isPending}
                              data-testid={`button-super-resend-${email.id}`}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                  Showing {page * limit + 1} - {Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    data-testid="button-super-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => p + 1)}
                    disabled={page >= totalPages - 1}
                    data-testid="button-super-next-page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function SuperAdminStatusPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("health");
  const [confirmDialog, setConfirmDialog] = useState<{ action: string; title: string; description: string } | null>(null);
  const [confirmPhrase, setConfirmPhrase] = useState("");

  if (user?.role !== "super_user") {
    return <Redirect to="/" />;
  }

  const { data: healthData, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthCheck>({
    queryKey: ["/api/v1/super/status/health"],
    refetchInterval: 30000,
  });

  const { data: statusSummary, isLoading: statusLoading, refetch: refetchStatus } = useQuery<StatusSummary>({
    queryKey: ["/api/v1/super/status/summary"],
    enabled: activeTab === "health",
  });

  const { data: tenancyHealth, isLoading: tenancyLoading, refetch: refetchTenancy } = useQuery<TenancyHealth>({
    queryKey: ["/api/v1/super/tenancy/health"],
    enabled: activeTab === "tenant-health",
  });

  const runCheckMutation = useMutation({
    mutationFn: async (checkType: string) => {
      return apiRequest("POST", `/api/v1/super/status/checks/${checkType}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/super/status/health"] });
      toast({ title: "Check completed successfully" });
      setConfirmDialog(null);
      setConfirmPhrase("");
    },
    onError: (error: any) => {
      toast({ title: "Check failed", description: error.message, variant: "destructive" });
    },
  });

  const handleDebugAction = (action: string) => {
    if (confirmPhrase !== "CONFIRM") {
      toast({ title: "Please type CONFIRM to proceed", variant: "destructive" });
      return;
    }
    runCheckMutation.mutate(action);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-6 border-b shrink-0">
        <h1 className="text-2xl font-bold">System Status</h1>
        <p className="text-muted-foreground mt-1">Health checks, logs, and debugging tools</p>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6" data-testid="status-tabs">
            <TabsTrigger value="health" data-testid="tab-health">
              <Activity className="h-4 w-4 mr-2" />
              System Health
            </TabsTrigger>
            <TabsTrigger value="tenant-health" data-testid="tab-tenant-health">
              <Building2 className="h-4 w-4 mr-2" />
              Tenant Health
            </TabsTrigger>
            <TabsTrigger value="logs" data-testid="tab-logs">
              <ExternalLink className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="debug" data-testid="tab-debug">
              <Wrench className="h-4 w-4 mr-2" />
              Debug Tools
            </TabsTrigger>
            <TabsTrigger value="auth" data-testid="tab-auth">
              <KeyRound className="h-4 w-4 mr-2" />
              Auth Diagnostics
            </TabsTrigger>
            <TabsTrigger value="email" data-testid="tab-email">
              <Mail className="h-4 w-4 mr-2" />
              Email Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="health">
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => refetchHealth()}
                  disabled={healthLoading}
                  data-testid="button-refresh-health"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${healthLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>
              
              {healthLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : healthData ? (
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Database</CardTitle>
                      </div>
                      <StatusIcon status={healthData.database.status} />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={healthData.database.status} />
                        {healthData.database.latencyMs && (
                          <span className="text-sm text-muted-foreground">
                            {healthData.database.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Wifi className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">WebSocket</CardTitle>
                      </div>
                      <StatusIcon status={healthData.websocket.status} />
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        <StatusBadge status={healthData.websocket.status} />
                        {healthData.websocket.connections !== undefined && (
                          <span className="text-sm text-muted-foreground">
                            {healthData.websocket.connections} connections
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <HardDrive className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">S3 Storage</CardTitle>
                      </div>
                      <StatusIcon status={healthData.s3.status} />
                    </CardHeader>
                    <CardContent>
                      <StatusBadge status={healthData.s3.status} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                      <div className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-sm font-medium">Mailgun</CardTitle>
                      </div>
                      <StatusIcon status={healthData.mailgun.status} />
                    </CardHeader>
                    <CardContent>
                      <StatusBadge status={healthData.mailgun.status} />
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  Unable to fetch health status
                </div>
              )}

              {healthData?.app && (
                <Card>
                  <CardHeader>
                    <CardTitle>Application Info</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <div className="text-sm text-muted-foreground">Version</div>
                        <div className="font-medium">{healthData.app.version || "Unknown"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Environment</div>
                        <div className="font-medium">{healthData.app.environment || "development"}</div>
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">Uptime</div>
                        <div className="font-medium">
                          {healthData.app.uptime 
                            ? `${Math.floor(healthData.app.uptime / 3600)}h ${Math.floor((healthData.app.uptime % 3600) / 60)}m`
                            : "Unknown"
                          }
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <div>
                    <CardTitle>Detailed Status Summary</CardTitle>
                    <CardDescription>
                      Comprehensive system diagnostics including migrations, presign tests, and orphan counts
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => refetchStatus()}
                    disabled={statusLoading}
                    data-testid="button-refresh-status-summary"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${statusLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent>
                  {statusLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : statusSummary ? (
                    <div className="space-y-6">
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3" data-testid="status-summary-grid">
                        <div className="p-4 border rounded-lg" data-testid="status-card-db">
                          <div className="flex items-center gap-2 mb-2">
                            <Database className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Database</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge 
                              variant={statusSummary.checks.db.status === "ok" ? "default" : "destructive"}
                              data-testid="badge-db-status"
                            >
                              {statusSummary.checks.db.status}
                            </Badge>
                            <span className="text-sm text-muted-foreground" data-testid="text-db-latency">
                              {statusSummary.checks.db.latencyMs}ms
                            </span>
                          </div>
                          {statusSummary.checks.db.error && (
                            <p className="text-xs text-destructive mt-2" data-testid="text-db-error">{statusSummary.checks.db.error}</p>
                          )}
                        </div>

                        <div className="p-4 border rounded-lg" data-testid="status-card-migrations">
                          <div className="flex items-center gap-2 mb-2">
                            <Server className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Migrations</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <Badge 
                              variant={statusSummary.checks.migrations.available ? "default" : "secondary"}
                              data-testid="badge-migrations-status"
                            >
                              {statusSummary.checks.migrations.available ? "Available" : "Unknown"}
                            </Badge>
                            <span className="text-xs text-muted-foreground" data-testid="text-migrations-version">
                              {statusSummary.checks.migrations.version || "N/A"}
                            </span>
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg" data-testid="status-card-s3">
                          <div className="flex items-center gap-2 mb-2">
                            <HardDrive className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">S3 Storage</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant={statusSummary.checks.s3.configured ? "default" : "secondary"}
                              data-testid="badge-s3-configured"
                            >
                              {statusSummary.checks.s3.configured ? "Configured" : "Not Configured"}
                            </Badge>
                            {statusSummary.checks.s3.configured && (
                              <Badge 
                                variant={statusSummary.checks.s3.presign === "ok" ? "default" : "destructive"}
                                data-testid="badge-s3-presign"
                              >
                                Presign: {statusSummary.checks.s3.presign}
                              </Badge>
                            )}
                          </div>
                          {statusSummary.checks.s3.error && (
                            <p className="text-xs text-destructive mt-2" data-testid="text-s3-error">{statusSummary.checks.s3.error}</p>
                          )}
                        </div>

                        <div className="p-4 border rounded-lg" data-testid="status-card-mailgun">
                          <div className="flex items-center gap-2 mb-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Mailgun</span>
                          </div>
                          <Badge 
                            variant={statusSummary.checks.mailgun.configured ? "default" : "secondary"}
                            data-testid="badge-mailgun-configured"
                          >
                            {statusSummary.checks.mailgun.configured ? "Configured" : "Not Configured"}
                          </Badge>
                        </div>

                        <div className="p-4 border rounded-lg" data-testid="status-card-auth">
                          <div className="flex items-center gap-2 mb-2">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Auth Config</span>
                          </div>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Environment</span>
                              <span className="font-medium" data-testid="text-auth-environment">{statusSummary.checks.auth.environment}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Cookie Secure</span>
                              <Badge 
                                variant={statusSummary.checks.auth.cookieSecure ? "default" : "secondary"} 
                                className="text-xs"
                                data-testid="badge-auth-cookie-secure"
                              >
                                {statusSummary.checks.auth.cookieSecure ? "Yes" : "No"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-muted-foreground">Session Secret</span>
                              <Badge 
                                variant={statusSummary.checks.auth.sessionSecretSet ? "default" : "destructive"} 
                                className="text-xs"
                                data-testid="badge-auth-session-secret"
                              >
                                {statusSummary.checks.auth.sessionSecretSet ? "Set" : "Not Set"}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        <div className="p-4 border rounded-lg" data-testid="status-card-orphans">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">Orphan Records</span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Missing TenantID</span>
                              <Badge 
                                variant={statusSummary.checks.orphanCounts.totalMissing > 0 ? "destructive" : "default"}
                                data-testid="badge-orphan-count"
                              >
                                {statusSummary.checks.orphanCounts.totalMissing}
                              </Badge>
                            </div>
                            {statusSummary.checks.orphanCounts.totalMissing > 0 && (
                              <details className="text-xs" data-testid="details-orphan-breakdown">
                                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                  View by table
                                </summary>
                                <div className="mt-2 space-y-1 pl-2 border-l">
                                  {Object.entries(statusSummary.checks.orphanCounts.byTable)
                                    .filter(([, count]) => count > 0)
                                    .map(([table, count]) => (
                                      <div key={table} className="flex justify-between" data-testid={`text-orphan-table-${table}`}>
                                        <span>{table}</span>
                                        <span className="font-medium">{count}</span>
                                      </div>
                                    ))
                                  }
                                </div>
                              </details>
                            )}
                          </div>
                          {statusSummary.checks.orphanCounts.error && (
                            <p className="text-xs text-destructive mt-2" data-testid="text-orphan-error">{statusSummary.checks.orphanCounts.error}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-4" data-testid="status-summary-footer">
                        <span data-testid="text-status-timestamp">Last checked: {new Date(statusSummary.timestamp).toLocaleString()}</span>
                        <span data-testid="text-status-request-id">Request ID: {statusSummary.requestId}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      Unable to fetch status summary
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="tenant-health">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Tenant Health Overview</CardTitle>
                  <CardDescription>Multi-tenancy system status and warnings</CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  onClick={() => refetchTenancy()}
                  disabled={tenancyLoading}
                  data-testid="button-refresh-tenancy"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${tenancyLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </CardHeader>
              <CardContent>
                {tenancyLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tenancyHealth ? (
                  <div className="space-y-6">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Tenancy Mode</div>
                        <div className="text-xl font-bold">{tenancyHealth.currentMode}</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Active Tenants</div>
                        <div className="text-xl font-bold">{tenancyHealth.activeTenantCount}</div>
                      </div>
                      <div className="p-4 border rounded-lg">
                        <div className="text-sm text-muted-foreground">Missing Tenant IDs</div>
                        <div className="text-xl font-bold">{tenancyHealth.totalMissing}</div>
                      </div>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <div className="text-sm font-medium mb-3">Warning Statistics</div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <div className="text-sm text-muted-foreground">Last 24 Hours</div>
                          <div className="font-medium">{tenancyHealth.warningStats.last24Hours}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Last 7 Days</div>
                          <div className="font-medium">{tenancyHealth.warningStats.last7Days}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Total</div>
                          <div className="font-medium">{tenancyHealth.warningStats.total}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Unable to fetch tenant health status
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Application Logs</CardTitle>
                <CardDescription>View application logs for debugging and monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <ExternalLink className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">External Logging</h3>
                  <p className="text-muted-foreground mb-4">
                    Application logs are available through your hosting provider's dashboard.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For Railway deployments, access logs via the Railway dashboard under your project's "Logs" tab.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="debug">
            <DebugToolsPanel />
          </TabsContent>

          <TabsContent value="auth">
            <AuthDiagnosticsPanel />
          </TabsContent>

          <TabsContent value="email">
            <SuperEmailLogsPanel />
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog?.title}</DialogTitle>
            <DialogDescription>{confirmDialog?.description}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="confirm-phrase">Type CONFIRM to proceed</Label>
              <Input
                id="confirm-phrase"
                value={confirmPhrase}
                onChange={(e) => setConfirmPhrase(e.target.value)}
                placeholder="CONFIRM"
                data-testid="input-confirm-phrase"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmDialog(null); setConfirmPhrase(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleDebugAction(confirmDialog?.action || "")}
              disabled={confirmPhrase !== "CONFIRM" || runCheckMutation.isPending}
              data-testid="button-confirm-action"
            >
              {runCheckMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Execute
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
