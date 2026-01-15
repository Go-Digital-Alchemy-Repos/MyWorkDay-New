import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { 
  CreditCard, 
  ExternalLink, 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Download,
  Mail,
  Save
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface BillingInfo {
  billingEmail: string | null;
  hasPaymentMethod: boolean;
  stripeCustomerIdPresent: boolean;
  billingStatus: string;
  invoicesEnabled: boolean;
}

interface Invoice {
  id: string;
  number: string | null;
  date: string | null;
  dueDate: string | null;
  amount: number;
  amountPaid: number;
  currency: string;
  status: string | null;
  hostedInvoiceUrl: string | null;
  invoicePdfUrl: string | null;
  description: string | null;
}

export function BillingTab() {
  const { toast } = useToast();
  const [billingEmail, setBillingEmail] = useState("");
  const [isEditingEmail, setIsEditingEmail] = useState(false);

  const { data: billingInfo, isLoading: billingLoading } = useQuery<BillingInfo>({
    queryKey: ["/api/v1/tenant/billing"],
  });

  const { data: invoicesData, isLoading: invoicesLoading } = useQuery<{ invoices: Invoice[]; hasMore: boolean }>({
    queryKey: ["/api/v1/tenant/billing/invoices"],
    enabled: billingInfo?.stripeCustomerIdPresent ?? false,
  });

  const initializeBillingMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/tenant/billing/initialize", {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/billing"] });
      toast({ title: "Billing initialized successfully" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to initialize billing", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const openPortalMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/v1/tenant/billing/portal-session", {});
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to open billing portal", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const updateEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("PATCH", "/api/v1/tenant/billing/email", { billingEmail: email });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v1/tenant/billing"] });
      setIsEditingEmail(false);
      toast({ title: "Billing email updated" });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to update email", 
        description: error.message || "An error occurred",
        variant: "destructive" 
      });
    },
  });

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "paid":
        return <Badge variant="default">Paid</Badge>;
      case "open":
        return <Badge variant="secondary">Open</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "void":
        return <Badge variant="secondary">Void</Badge>;
      case "uncollectible":
        return <Badge variant="destructive">Uncollectible</Badge>;
      default:
        return <Badge variant="outline">{status || "Unknown"}</Badge>;
    }
  };

  const getBillingStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="gap-1"><CheckCircle className="h-3 w-3" /> Active</Badge>;
      case "past_due":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Past Due</Badge>;
      case "canceled":
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="outline">Not Set Up</Badge>;
    }
  };

  if (billingLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Billing Overview
          </CardTitle>
          <CardDescription>
            Manage your payment methods, view invoices, and update billing information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!billingInfo?.stripeCustomerIdPresent ? (
            <div className="text-center py-8 space-y-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <h3 className="font-medium">Billing Not Initialized</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Initialize billing to manage payment methods and view invoices.
                </p>
              </div>
              <Button
                onClick={() => initializeBillingMutation.mutate()}
                disabled={initializeBillingMutation.isPending}
                data-testid="button-initialize-billing"
              >
                {initializeBillingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4 mr-2" />
                )}
                Initialize Billing
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Billing Status</div>
                  <div className="font-medium">
                    {getBillingStatusBadge(billingInfo.billingStatus)}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Payment Method</div>
                  <div className="font-medium">
                    {billingInfo.hasPaymentMethod ? (
                      <Badge variant="default" className="gap-1">
                        <CheckCircle className="h-3 w-3" /> On File
                      </Badge>
                    ) : (
                      <Badge variant="outline">None</Badge>
                    )}
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Invoices</div>
                  <div className="font-medium">
                    {billingInfo.invoicesEnabled ? (
                      <Badge variant="default">Enabled</Badge>
                    ) : (
                      <Badge variant="outline">Disabled</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="billing-email">Billing Email</Label>
                {isEditingEmail ? (
                  <div className="flex gap-2">
                    <Input
                      id="billing-email"
                      type="email"
                      value={billingEmail}
                      onChange={(e) => setBillingEmail(e.target.value)}
                      placeholder="billing@example.com"
                      data-testid="input-billing-email"
                    />
                    <Button
                      onClick={() => updateEmailMutation.mutate(billingEmail)}
                      disabled={updateEmailMutation.isPending}
                      data-testid="button-save-billing-email"
                    >
                      {updateEmailMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingEmail(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 p-2 border rounded-md bg-muted/50">
                      {billingInfo.billingEmail || "Not set"}
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        setBillingEmail(billingInfo.billingEmail || "");
                        setIsEditingEmail(true);
                      }}
                      data-testid="button-edit-billing-email"
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => openPortalMutation.mutate()}
                  disabled={openPortalMutation.isPending}
                  data-testid="button-manage-billing"
                >
                  {openPortalMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Manage Billing
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {billingInfo?.stripeCustomerIdPresent && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Recent Invoices
            </CardTitle>
            <CardDescription>
              View and download your recent invoices
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoicesLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !invoicesData?.invoices?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No invoices yet
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoicesData.invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">
                        {invoice.number || invoice.id.slice(0, 12)}
                      </TableCell>
                      <TableCell>{formatDate(invoice.date)}</TableCell>
                      <TableCell>
                        {formatCurrency(invoice.amount, invoice.currency)}
                      </TableCell>
                      <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {invoice.hostedInvoiceUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              data-testid={`button-view-invoice-${invoice.id}`}
                            >
                              <a href={invoice.hostedInvoiceUrl} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                          {invoice.invoicePdfUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              data-testid={`button-download-invoice-${invoice.id}`}
                            >
                              <a href={invoice.invoicePdfUrl} target="_blank" rel="noopener noreferrer">
                                <Download className="h-4 w-4" />
                              </a>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
