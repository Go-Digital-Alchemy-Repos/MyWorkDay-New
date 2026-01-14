import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, Save, Send, Archive, FileText, Users, CheckCircle2, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Agreement {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  version: number;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

interface AgreementState {
  active: Agreement | null;
  draft: Agreement | null;
  hasAnyAgreements: boolean;
}

interface AgreementStats {
  totalUsers: number;
  acceptedCount: number;
  pendingCount: number;
  acceptanceRate: number;
  agreementVersion: number;
}

export function AgreementTab() {
  const { toast } = useToast();
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const { data: agreementState, isLoading } = useQuery<AgreementState>({
    queryKey: ["/api/v1/tenant/agreement"],
    refetchOnWindowFocus: false,
  });

  const { data: stats } = useQuery<AgreementStats>({
    queryKey: ["/api/v1/tenant/agreement/stats"],
    enabled: !!agreementState?.active,
    refetchOnWindowFocus: false,
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (data: { title: string; body: string }) => {
      const res = await apiRequest("POST", "/api/v1/tenant/agreement/draft", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement"] });
      toast({ title: "Draft saved", description: "Your agreement draft has been saved." });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async (data: { title?: string; body?: string }) => {
      const res = await apiRequest("PATCH", "/api/v1/tenant/agreement/draft", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement"] });
      toast({ title: "Draft updated", description: "Your agreement draft has been updated." });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/tenant/agreement/publish", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement/stats"] });
      toast({ 
        title: "Agreement published", 
        description: "Users will be required to accept the new terms before continuing." 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const unpublishMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/v1/tenant/agreement/unpublish", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/agreement/stats"] });
      toast({ 
        title: "Agreement unpublished", 
        description: "Users will no longer be required to accept terms." 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const startEditing = () => {
    const source = agreementState?.draft || agreementState?.active;
    setDraftTitle(source?.title || "Terms of Service");
    setDraftBody(source?.body || "");
    setIsEditing(true);
  };

  const handleSave = () => {
    if (agreementState?.draft) {
      updateDraftMutation.mutate({ title: draftTitle, body: draftBody });
    } else {
      saveDraftMutation.mutate({ title: draftTitle, body: draftBody });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = agreementState?.active;
  const draft = agreementState?.draft;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            SaaS Agreement
          </CardTitle>
          <CardDescription>
            Manage terms and conditions that users must accept before using the application.
            When you publish a new version, all users will be required to accept the updated terms.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {active && stats && (
            <div className="rounded-lg border p-4 bg-muted/30">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="default" className="bg-green-600">Active</Badge>
                  <span className="font-medium">{active.title}</span>
                  <span className="text-sm text-muted-foreground">v{active.version}</span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={unpublishMutation.isPending}
                      data-testid="button-unpublish-agreement"
                    >
                      {unpublishMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Archive className="h-4 w-4 mr-2" />
                      )}
                      Disable Enforcement
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disable Agreement Enforcement?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Users will no longer be required to accept terms before using the application.
                        You can re-enable enforcement by publishing a new version.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => unpublishMutation.mutate()}>
                        Disable
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{stats.totalUsers} total users</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm">{stats.acceptedCount} accepted</span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm">{stats.pendingCount} pending</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Acceptance Rate</span>
                  <span>{stats.acceptanceRate.toFixed(0)}%</span>
                </div>
                <Progress value={stats.acceptanceRate} className="h-2" />
              </div>

              <div className="mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-2">Current Agreement Content:</p>
                <div className="bg-background rounded border p-3 max-h-40 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">{active.body}</pre>
                </div>
              </div>
            </div>
          )}

          {!active && !draft && !isEditing && (
            <div className="text-center py-8 rounded-lg border-2 border-dashed">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No Agreement Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create a terms of service agreement that users must accept
              </p>
              <Button onClick={startEditing} data-testid="button-create-agreement">
                Create Agreement
              </Button>
            </div>
          )}

          {draft && !isEditing && (
            <div className="rounded-lg border p-4 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="border-amber-600 text-amber-600">Draft</Badge>
                  <span className="font-medium">{draft.title}</span>
                  <span className="text-sm text-muted-foreground">v{draft.version}</span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={startEditing}
                    data-testid="button-edit-draft"
                  >
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button 
                        size="sm"
                        disabled={publishMutation.isPending}
                        data-testid="button-publish-agreement"
                      >
                        {publishMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Send className="h-4 w-4 mr-2" />
                        )}
                        Publish
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Publish Agreement?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Publishing this agreement will require all users to accept the new terms 
                          before they can continue using the application. This action creates a new 
                          version that supersedes any previous agreement.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => publishMutation.mutate()}>
                          Publish Agreement
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              <div className="bg-background rounded border p-3 max-h-40 overflow-y-auto">
                <pre className="text-sm whitespace-pre-wrap font-sans">{draft.body}</pre>
              </div>
            </div>
          )}

          {isEditing && (
            <div className="space-y-4 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {draft ? "Edit Draft" : active ? "Create New Version" : "Create Agreement"}
                </h3>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsEditing(false)}
                    data-testid="button-cancel-edit"
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={handleSave}
                    disabled={saveDraftMutation.isPending || updateDraftMutation.isPending || !draftTitle.trim() || !draftBody.trim()}
                    data-testid="button-save-draft"
                  >
                    {(saveDraftMutation.isPending || updateDraftMutation.isPending) ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Draft
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="agreement-title">Title</Label>
                <Input
                  id="agreement-title"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                  placeholder="Terms of Service"
                  data-testid="input-agreement-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="agreement-body">Agreement Content</Label>
                <Textarea
                  id="agreement-body"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Enter your terms and conditions here..."
                  className="min-h-[300px] font-mono text-sm"
                  data-testid="input-agreement-body"
                />
                <p className="text-xs text-muted-foreground">
                  This content will be displayed to users when they are required to accept the agreement.
                </p>
              </div>
            </div>
          )}

          {(active || draft) && !isEditing && (
            <div className="flex justify-end">
              <Button 
                variant="outline" 
                onClick={startEditing}
                data-testid="button-new-version"
              >
                {draft ? "Edit Draft" : "Create New Version"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
