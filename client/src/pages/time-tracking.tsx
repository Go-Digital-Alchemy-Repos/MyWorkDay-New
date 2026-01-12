import { Clock } from "lucide-react";

export default function TimeTrackingPage() {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div>
          <h1 className="text-2xl font-semibold text-foreground" data-testid="text-time-tracking-title">
            Time Tracking
          </h1>
          <p className="text-sm text-muted-foreground">
            Track time spent on tasks and projects
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Clock className="h-16 w-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-1">
            Coming Soon
          </h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Time tracking functionality will be available in a future update.
            Track billable hours, generate reports, and manage timesheets.
          </p>
        </div>
      </div>
    </div>
  );
}
