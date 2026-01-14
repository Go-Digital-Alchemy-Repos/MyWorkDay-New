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
import { Loader2, Activity, Database, Wifi, HardDrive, Mail, CheckCircle, XCircle, AlertCircle, RefreshCw, Building2, Wrench, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  activeTenantCount: number;
  warningStats: {
    last24Hours: number;
    last7Days: number;
    total: number;
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
            <Card>
              <CardHeader>
                <CardTitle>Debug Tools</CardTitle>
                <CardDescription>Safe diagnostic operations for system maintenance</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 border rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-medium">Recompute Tenant Health</div>
                      <div className="text-sm text-muted-foreground">Recalculate health metrics for all tenants</div>
                    </div>
                    <Button 
                      variant="outline"
                      onClick={() => setConfirmDialog({
                        action: "recompute-health",
                        title: "Recompute Tenant Health",
                        description: "This will recalculate health metrics for all tenants. Type CONFIRM to proceed."
                      })}
                      data-testid="button-recompute-health"
                    >
                      Run
                    </Button>
                  </div>
                  <div className="p-4 border rounded-lg flex items-center justify-between">
                    <div>
                      <div className="font-medium">Validate Tenant Isolation</div>
                      <div className="text-sm text-muted-foreground">Check for cross-tenant data leaks</div>
                    </div>
                    <Button 
                      variant="outline"
                      onClick={() => setConfirmDialog({
                        action: "validate-isolation",
                        title: "Validate Tenant Isolation",
                        description: "This will run isolation checks across all tenants. Type CONFIRM to proceed."
                      })}
                      data-testid="button-validate-isolation"
                    >
                      Run
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
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
