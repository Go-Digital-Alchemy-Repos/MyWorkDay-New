import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, UserPlus, Shield } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import { Separator } from "@/components/ui/separator";

interface BootstrapStatus {
  bootstrapRequired: boolean;
}

interface GoogleAuthStatus {
  enabled: boolean;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showBootstrap, setShowBootstrap] = useState(false);
  const [bootstrapRequired, setBootstrapRequired] = useState(false);
  const [isCheckingBootstrap, setIsCheckingBootstrap] = useState(true);
  const [googleAuthEnabled, setGoogleAuthEnabled] = useState(false);
  const { login } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Handle error messages from OAuth callback redirects
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const errorMessage = params.get("error");
    if (errorMessage) {
      toast({
        title: "Authentication failed",
        description: decodeURIComponent(errorMessage),
        variant: "destructive",
      });
      // Clear the error from URL without page reload
      window.history.replaceState({}, "", "/login");
    }
  }, [searchString, toast]);

  useEffect(() => {
    async function checkBootstrapStatus() {
      try {
        const response = await fetch("/api/v1/auth/bootstrap-status", {
          credentials: "include",
        });
        if (response.ok) {
          const data: BootstrapStatus = await response.json();
          setBootstrapRequired(data.bootstrapRequired);
        }
      } catch (error) {
        console.error("Failed to check bootstrap status:", error);
      } finally {
        setIsCheckingBootstrap(false);
      }
    }
    checkBootstrapStatus();
  }, []);

  useEffect(() => {
    async function checkGoogleAuthStatus() {
      try {
        const response = await fetch("/api/v1/auth/google/status", {
          credentials: "include",
        });
        if (response.ok) {
          const data: GoogleAuthStatus = await response.json();
          setGoogleAuthEnabled(data.enabled);
        }
      } catch (error) {
        console.error("Failed to check Google auth status:", error);
      }
    }
    checkGoogleAuthStatus();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing credentials",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success) {
      toast({
        title: "Welcome back!",
        description: "You have been logged in successfully",
      });
      setLocation("/");
    } else {
      toast({
        title: "Login failed",
        description: result.error || "Invalid credentials",
        variant: "destructive",
      });
    }
  };

  const handleBootstrapRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Missing information",
        description: "Please enter email and password",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/v1/auth/bootstrap-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, firstName, lastName }),
      });

      const data = await response.json();

      if (response.ok) {
        if (data.autoLoginFailed) {
          toast({
            title: "Account created",
            description: "Account created but auto-login failed. Please sign in manually.",
            variant: "default",
          });
          setShowBootstrap(false);
          setEmail("");
          setPassword("");
        } else {
          toast({
            title: "Account created!",
            description: data.message || "Super Admin account created successfully",
          });
          setLocation("/super-admin");
        }
      } else {
        const errorMessage = data.error?.message || data.message || "Registration failed";
        toast({
          title: "Registration failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Registration failed",
        description: "Network error. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingBootstrap) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">MyWorkDay</CardTitle>
          <CardDescription className="text-center">
            {showBootstrap 
              ? "Create the first admin account to get started"
              : "Enter your credentials to access your workspace"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {showBootstrap ? (
            <form onSubmit={handleBootstrapRegister} className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg mb-4">
                <Shield className="h-5 w-5 text-primary" />
                <p className="text-sm text-muted-foreground">
                  This account will have full Super Admin access.
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-firstName"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Doe"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-lastName"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-email-bootstrap"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isSubmitting}
                  data-testid="input-password-bootstrap"
                />
              </div>
              
              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
                data-testid="button-bootstrap-register"
              >
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {isSubmitting ? "Creating account..." : "Create Admin Account"}
              </Button>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setShowBootstrap(false)}
                disabled={isSubmitting}
                data-testid="button-back-to-login"
              >
                Back to login
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              {googleAuthEnabled && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      window.location.href = "/api/v1/auth/google";
                    }}
                    disabled={isSubmitting}
                    data-testid="button-google-login"
                  >
                    <SiGoogle className="mr-2 h-4 w-4" />
                    Continue with Google
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <Separator className="w-full" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">
                        Or continue with email
                      </span>
                    </div>
                  </div>
                </>
              )}
              
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-email"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <a
                      href="/auth/forgot-password"
                      className="text-xs text-muted-foreground hover:text-primary hover:underline"
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isSubmitting}
                    data-testid="input-password"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={isSubmitting}
                  data-testid="button-login"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <LogIn className="mr-2 h-4 w-4" />
                  )}
                  {isSubmitting ? "Signing in..." : "Sign in"}
                </Button>
              </form>
              
              {bootstrapRequired && (
                <div className="pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowBootstrap(true)}
                    disabled={isSubmitting}
                    data-testid="button-create-first-admin"
                  >
                    <Shield className="mr-2 h-4 w-4" />
                    Create first admin account
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
