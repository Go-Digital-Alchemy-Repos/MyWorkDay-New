import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, CheckCircle2, Download, Printer, Info } from "lucide-react";

interface Agreement {
  id: string;
  title: string;
  body: string;
  version: number;
  effectiveAt?: string;
}

interface AgreementState {
  active: Agreement | null;
  draft: Agreement | null;
  hasAnyAgreement: boolean;
}

interface UserAcceptance {
  hasAccepted: boolean;
  acceptedAt: string | null;
  acceptedVersion: number | null;
  currentVersion: number | null;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function AgreementTab() {
  const { toast } = useToast();

  const { data: agreementState, isLoading } = useQuery<AgreementState>({
    queryKey: ["/api/v1/tenant/agreement"],
    refetchOnWindowFocus: false,
  });

  const { data: acceptance } = useQuery<UserAcceptance>({
    queryKey: ["/api/v1/me/agreement/status"],
    enabled: !!agreementState?.active,
    refetchOnWindowFocus: false,
  });

  const handlePrint = () => {
    const printWindow = window.open("", "_blank");
    if (printWindow && agreementState?.active) {
      const safeTitle = escapeHtml(agreementState.active.title);
      const safeBody = escapeHtml(agreementState.active.body);
      const effectiveDate = agreementState.active.effectiveAt 
        ? new Date(agreementState.active.effectiveAt).toLocaleDateString() 
        : 'N/A';
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${safeTitle} - v${agreementState.active.version}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            h1 { margin-bottom: 10px; }
            .meta { color: #666; margin-bottom: 30px; }
            .content { white-space: pre-wrap; line-height: 1.6; }
          </style>
        </head>
        <body>
          <h1>${safeTitle}</h1>
          <div class="meta">Version ${agreementState.active.version} • Effective ${effectiveDate}</div>
          <div class="content">${safeBody}</div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const handleDownload = () => {
    if (!agreementState?.active) return;
    const content = `${agreementState.active.title}\nVersion ${agreementState.active.version}\n\n${agreementState.active.body}`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agreement-v${agreementState.active.version}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Agreement downloaded" });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = agreementState?.active;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Your SaaS Agreement
          </CardTitle>
          <CardDescription>
            View the terms and conditions you have accepted
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {active ? (
            <>
              <div className="rounded-lg border p-4 bg-muted/30">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{active.title}</span>
                    <span className="text-sm text-muted-foreground">v{active.version}</span>
                    <Badge variant="default" className="bg-green-600">Active</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print-agreement">
                      <Printer className="h-4 w-4 mr-1" />
                      Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownload} data-testid="button-download-agreement">
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>

                {acceptance?.hasAccepted && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg mb-4">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <span className="text-sm font-medium text-green-800 dark:text-green-200">You accepted this agreement</span>
                      {acceptance.acceptedAt && (
                        <span className="text-sm text-green-600 dark:text-green-400 ml-2">
                          on {new Date(acceptance.acceptedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {active.effectiveAt && (
                  <div className="text-sm text-muted-foreground mb-4">
                    Effective since: {new Date(active.effectiveAt).toLocaleDateString()}
                  </div>
                )}

                <div className="bg-background rounded border p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap font-sans">{active.body}</pre>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800 dark:text-blue-200">
                  Agreement management is handled by your platform administrator. If you have questions about the terms, please contact your administrator.
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 rounded-lg border-2 border-dashed">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="font-medium mb-1">No Active Agreement</h3>
              <p className="text-sm text-muted-foreground">
                There is no active SaaS agreement for your organization at this time.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
