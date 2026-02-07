import { Component, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

function reportErrorToBackend(error: Error, context: Record<string, unknown> = {}) {
  try {
    const payload = {
      message: error.message,
      name: error.name,
      stack: error.stack?.slice(0, 4000),
      url: window.location.href,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      ...context,
    };
    fetch("/api/v1/system/errors/frontend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {});
  } catch {
    // Never let error reporting break the app
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    if (event.error) {
      reportErrorToBackend(event.error, { source: "window.onerror" });
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason instanceof Error
      ? event.reason
      : new Error(String(event.reason));
    reportErrorToBackend(error, { source: "unhandledrejection" });
  });
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, errorInfo);
    reportErrorToBackend(error, {
      source: "ErrorBoundary",
      componentStack: errorInfo.componentStack?.slice(0, 2000),
    });
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex flex-col items-center justify-center text-center py-12 px-4"
          data-testid="error-boundary"
        >
          <div className="mb-4 text-destructive">
            <AlertCircle className="h-12 w-12" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            {this.state.error?.message || "An unexpected error occurred while rendering this section."}
          </p>
          <Button variant="outline" onClick={this.handleReset} data-testid="button-error-boundary-retry">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
