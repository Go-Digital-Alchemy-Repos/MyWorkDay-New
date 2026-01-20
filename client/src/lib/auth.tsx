import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import { type User, UserRole } from "@shared/schema";
import { clearActingAsState, setSuperUserFlag } from "./queryClient";

interface UserImpersonationData {
  isImpersonating: boolean;
  impersonatedUser: {
    id: string;
    email: string;
    role: string;
  };
  impersonatedTenant: {
    id: string;
    name: string;
  };
  originalSuperUser: {
    id: string;
    email: string;
  };
  startedAt: string;
}

interface AuthContextType {
  user: Omit<User, "passwordHash"> | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  userImpersonation: UserImpersonationData | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; user?: Omit<User, "passwordHash"> }>;
  logout: () => Promise<void>;
  refetch: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Omit<User, "passwordHash"> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userImpersonation, setUserImpersonation] = useState<UserImpersonationData | null>(null);
  const [, setLocation] = useLocation();

  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        // Set user impersonation state from session
        setUserImpersonation(data.impersonation || null);
        // Set super user flag when session is restored
        setSuperUserFlag(data.user?.role === UserRole.SUPER_USER);
      } else {
        setUser(null);
        setUserImpersonation(null);
        // Clear super user state when not authenticated
        clearActingAsState();
      }
    } catch {
      setUser(null);
      setUserImpersonation(null);
      // Clear super user state on error
      clearActingAsState();
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const login = async (email: string, password: string) => {
    try {
      // Clear any acting tenant state from previous session
      clearActingAsState();
      
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok && data.user) {
        // Set user state immediately
        setUser(data.user);
        
        // Verify session is established by re-fetching from /me
        // This ensures the cookie is properly set before navigation
        const meResponse = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (meResponse.ok) {
          const meData = await meResponse.json();
          setUser(meData.user);
          setUserImpersonation(meData.impersonation || null);
          setIsLoading(false);
          // Set super user flag based on user role
          setSuperUserFlag(meData.user?.role === UserRole.SUPER_USER);
        }
        
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      // Clear acting tenant state to prevent it from being used by next user
      clearActingAsState();
      setUser(null);
      setUserImpersonation(null);
      setLocation("/login");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        userImpersonation,
        login,
        logout,
        refetch: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
