/**
 * @module client/src/components/ui/error-message
 * @description User-friendly error display component with admin-only technical details.
 * 
 * Features:
 * - User-friendly error messages for all users
 * - Collapsible technical details section for admins only
 * - Request ID display for support correlation
 * - Consistent styling with the application design
 */

import { useState } from "react";
import { AlertCircle, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { parseApiError, getErrorMessage, type ParsedApiError } from "@/lib/parseApiError";
import { ApiError } from "@/lib/queryClient";

interface ErrorMessageProps {
  error: unknown;
  title?: string;
  className?: string;
  showDetails?: boolean;
}

/**
 * Check if user is an admin (admin, super_admin, or super_user role)
 */
function isAdmin(role?: string): boolean {
  return role === "admin" || role === "super_admin" || role === "super_user";
}

/**
 * Extract request ID from various error types
 */
function extractRequestId(error: unknown): string | null {
  if (error instanceof ApiError) {
    return error.requestId;
  }
  
  const parsed = parseApiError(error);
  return parsed.requestId || null;
}

/**
 * ErrorMessage Component
 * 
 * Displays a user-friendly error message with optional technical details
 * visible only to admin users.
 */
export function ErrorMessage({ error, title, className, showDetails = true }: ErrorMessageProps) {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  
  const parsedError = parseApiError(error);
  const userFriendlyMessage = getErrorMessage(parsedError);
  const requestId = extractRequestId(error);
  const canViewDetails = showDetails && isAdmin(user?.role);
  
  const handleCopyRequestId = async () => {
    if (requestId) {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Alert variant="destructive" className={className} data-testid="error-message">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle data-testid="error-title">
        {title || "Error"}
      </AlertTitle>
      <AlertDescription className="mt-2" data-testid="error-description">
        <p>{userFriendlyMessage}</p>
        
        {canViewDetails && requestId && (
          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-auto p-0 text-xs font-normal text-muted-foreground hover:text-foreground"
              data-testid="button-toggle-details"
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Hide details
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Show details
                </>
              )}
            </Button>
            
            {isExpanded && (
              <div className="mt-2 p-2 bg-destructive/10 rounded text-xs font-mono space-y-1" data-testid="error-details">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Request ID:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-foreground">{requestId}</code>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 w-5 p-0"
                      onClick={handleCopyRequestId}
                      data-testid="button-copy-request-id"
                    >
                      {copied ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
                
                {parsedError.code && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Error Code:</span>
                    <code className="text-foreground">{parsedError.code}</code>
                  </div>
                )}
                
                {parsedError.status && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <code className="text-foreground">{parsedError.status}</code>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

/**
 * InlineError Component
 * 
 * Compact inline error display for forms and smaller UI elements.
 * Shows request ID only for admins.
 */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  const { user } = useAuth();
  const parsedError = parseApiError(error);
  const userFriendlyMessage = getErrorMessage(parsedError);
  const requestId = extractRequestId(error);
  const canViewDetails = isAdmin(user?.role);

  return (
    <div className={`text-destructive text-sm ${className || ""}`} data-testid="inline-error">
      <span>{userFriendlyMessage}</span>
      {canViewDetails && requestId && (
        <span className="ml-2 text-xs text-muted-foreground font-mono">
          (Ref: {requestId.slice(0, 8)})
        </span>
      )}
    </div>
  );
}

/**
 * useErrorDisplay Hook
 * 
 * Provides error parsing and display utilities.
 */
export function useErrorDisplay(error: unknown): {
  message: string;
  requestId: string | null;
  canViewDetails: boolean;
  parsedError: ParsedApiError;
} {
  const { user } = useAuth();
  const parsedError = parseApiError(error);
  
  return {
    message: getErrorMessage(parsedError),
    requestId: extractRequestId(error),
    canViewDetails: isAdmin(user?.role),
    parsedError,
  };
}
