import { cn } from "@/lib/utils";
import { LucideIcon, Plus, Search, MessageSquare, FileText, Users, FolderOpen, Clock, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type EmptyStateVariant = "default" | "compact" | "inline";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: "default" | "outline" | "ghost";
}

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  variant?: EmptyStateVariant;
  className?: string;
  "data-testid"?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  variant = "default",
  className,
  "data-testid": testId,
}: EmptyStateProps) {
  if (variant === "inline") {
    return (
      <div 
        className={cn(
          "flex items-center gap-3 py-4 px-4 text-muted-foreground",
          className
        )}
        data-testid={testId}
      >
        {Icon && <Icon className="h-5 w-5 shrink-0" />}
        <span className="text-sm">{title}</span>
        {action && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={action.onClick}
            className="ml-auto"
            data-testid="button-empty-state-action"
          >
            {action.icon && <action.icon className="h-4 w-4 mr-1" />}
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div 
        className={cn(
          "flex flex-col items-center justify-center py-8 px-4 text-center",
          className
        )}
        data-testid={testId}
      >
        {Icon && (
          <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-3">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
        )}
        <p className="text-sm font-medium mb-1">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground max-w-xs mb-4">
            {description}
          </p>
        )}
        {action && (
          <Button 
            size="sm"
            variant={action.variant || "default"}
            onClick={action.onClick} 
            data-testid="button-empty-state-action"
          >
            {action.icon && <action.icon className="h-4 w-4 mr-1" />}
            {action.label}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
      data-testid={testId}
    >
      {Icon && (
        <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted mb-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-md mb-6">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button 
              variant={action.variant || "default"}
              onClick={action.onClick} 
              data-testid="button-empty-state-action"
            >
              {action.icon && <action.icon className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button 
              variant={secondaryAction.variant || "outline"}
              onClick={secondaryAction.onClick}
              data-testid="button-empty-state-secondary"
            >
              {secondaryAction.icon && <secondaryAction.icon className="h-4 w-4 mr-2" />}
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// Pre-built empty states for common use cases

interface PresetEmptyStateProps {
  onAction?: () => void;
  className?: string;
}

export function EmptyTasks({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FileText}
      title="No tasks yet"
      description="Create your first task to start tracking your work and staying organized."
      action={onAction ? {
        label: "Create Task",
        onClick: onAction,
        icon: Plus,
      } : undefined}
      className={className}
      data-testid="empty-state-tasks"
    />
  );
}

export function EmptyProjects({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={FolderOpen}
      title="No projects yet"
      description="Projects help you organize related tasks and track progress toward your goals."
      action={onAction ? {
        label: "Create Project",
        onClick: onAction,
        icon: Plus,
      } : undefined}
      className={className}
      data-testid="empty-state-projects"
    />
  );
}

export function EmptyClients({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Users}
      title="No clients yet"
      description="Add clients to organize projects and track work across different accounts."
      action={onAction ? {
        label: "Add Client",
        onClick: onAction,
        icon: Plus,
      } : undefined}
      className={className}
      data-testid="empty-state-clients"
    />
  );
}

export function EmptyChat({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={MessageSquare}
      title="No messages yet"
      description="Start the conversation! Send a message to begin collaborating with your team."
      action={onAction ? {
        label: "Send Message",
        onClick: onAction,
      } : undefined}
      className={className}
      data-testid="empty-state-chat"
    />
  );
}

export function EmptyReports({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={BarChart3}
      title="No data to display"
      description="Reports will appear here once you have tasks and time entries to analyze."
      action={onAction ? {
        label: "View All Reports",
        onClick: onAction,
      } : undefined}
      className={className}
      data-testid="empty-state-reports"
    />
  );
}

export function EmptyTimeEntries({ onAction, className }: PresetEmptyStateProps) {
  return (
    <EmptyState
      icon={Clock}
      title="No time entries"
      description="Track your time to see where your hours go and improve productivity."
      action={onAction ? {
        label: "Log Time",
        onClick: onAction,
        icon: Plus,
      } : undefined}
      className={className}
      data-testid="empty-state-time"
    />
  );
}

export function EmptySearchResults({ 
  query, 
  onClear, 
  className 
}: { 
  query?: string; 
  onClear?: () => void; 
  className?: string;
}) {
  return (
    <EmptyState
      icon={Search}
      title="No results found"
      description={query 
        ? `No items match "${query}". Try adjusting your search or filters.`
        : "Try adjusting your search or filters to find what you're looking for."
      }
      action={onClear ? {
        label: "Clear Search",
        onClick: onClear,
        variant: "outline",
      } : undefined}
      className={className}
      data-testid="empty-state-search"
    />
  );
}

export function EmptyFilteredResults({ 
  onClear, 
  className 
}: { 
  onClear?: () => void; 
  className?: string;
}) {
  return (
    <EmptyState
      icon={Search}
      title="No matching items"
      description="No items match your current filters. Try adjusting or clearing filters."
      action={onClear ? {
        label: "Clear Filters",
        onClick: onClear,
        variant: "outline",
      } : undefined}
      className={className}
      data-testid="empty-state-filtered"
    />
  );
}
