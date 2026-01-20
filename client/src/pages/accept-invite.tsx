import { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Building2, CheckCircle, XCircle, AlertTriangle, Eye, EyeOff, Users } from "lucide-react";
import { parseApiError } from "@/lib/parseApiError";

interface InviteValidateResponse {
  ok: boolean;
  emailMasked: string;
  email: string;
  tenantName: string;
  workspaceName: string;
  role: string;
  expiresAt: string;
}

interface InviteAcceptResponse {
  ok: boolean;
  success: boolean;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
  };
  message: string;
  autoLoginFailed?: boolean;
}

export default function AcceptInvitePage() {
  const [, setLocation] = useLocation();
  const params = useParams<{ token: string }>();
  const { toast } = useToast();
  const [token, setToken] = useState<string | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    const tokenFromUrl = params.token || null;
    setToken(tokenFromUrl);
  }, [params.token]);

  const { data: inviteData, isLoading: validating, error: validateError } = useQuery<InviteValidateResponse>({
    queryKey: ["/api/v1/public/invites/validate", token],
    queryFn: async () => {
      const response = await fetch(`/api/v1/public/invites/validate?token=${token}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || data.error?.message || "Failed to validate invite");
      }
      return response.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async (data: { token: string; password: string; firstName?: string; lastName?: string }) => {
      const response = await apiRequest("POST", "/api/v1/public/invites/accept", data);
      return response.json() as Promise<InviteAcceptResponse>;
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      if (data.autoLoginFailed) {
        setLocation("/login");
      } else {
        setLocation("/");
      }
    },
    onError: (error: any) => {
      const parsed = parseApiError(error);
      toast({ title: "Failed to activate account", description: parsed.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    
    if (!token) {
      toast({ title: "Invalid invite link", variant: "destructive" });
      return;
    }
    
    acceptMutation.mutate({ 
      token, 
      password,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
    });
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Invalid Invite Link</h2>
                <p className="text-muted-foreground mt-1">The invite link is missing or invalid.</p>
              </div>
              <Button variant="outline" onClick={() => setLocation("/login")} data-testid="button-go-login">
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying invite link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (validateError) {
    const errorMessage = validateError instanceof Error ? validateError.message : "Failed to validate invite";
    const errorData = (validateError as any)?.data;
    const errorCode = errorData?.code || "";
    const isExpired = errorCode === "TOKEN_EXPIRED" || errorMessage.includes("expired");
    const isUsed = errorCode === "TOKEN_ALREADY_USED" || errorMessage.includes("already been used");
    const isRevoked = errorCode === "TOKEN_REVOKED" || errorMessage.includes("revoked");
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center gap-4">
              <div className={`h-12 w-12 rounded-full flex items-center justify-center ${
                isExpired || isUsed || isRevoked ? "bg-amber-500/10" : "bg-destructive/10"
              }`}>
                {isExpired || isUsed || isRevoked ? (
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                ) : (
                  <XCircle className="h-6 w-6 text-destructive" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold">
                  {isExpired ? "Invite Expired" : isUsed ? "Invite Already Used" : isRevoked ? "Invite Revoked" : "Invalid Invite"}
                </h2>
                <p className="text-muted-foreground mt-1">{errorMessage}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Please contact your administrator for a new invite link.
                </p>
              </div>
              <Button variant="outline" onClick={() => setLocation("/login")} data-testid="button-go-login-error">
                Go to Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>You've Been Invited</CardTitle>
          <CardDescription>
            Join {inviteData?.tenantName} as {inviteData?.role === "admin" ? "an Administrator" : "a Team Member"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded-lg border border-muted p-4 bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Organization</div>
                  <div className="font-medium">{inviteData?.tenantName}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Workspace</div>
                  <div className="font-medium">{inviteData?.workspaceName}</div>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Your Email</div>
                <div className="font-medium">{inviteData?.email}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  data-testid="input-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  data-testid="input-last-name"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Set Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter a strong password"
                  className="pr-10"
                  data-testid="input-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  className="pr-10"
                  data-testid="input-confirm-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <Button 
              type="submit" 
              className="w-full" 
              disabled={acceptMutation.isPending || !password || !confirmPassword}
              data-testid="button-accept-invite"
            >
              {acceptMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Accept Invite & Set Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
