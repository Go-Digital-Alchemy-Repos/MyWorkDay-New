import { Circle, Clock, AlertCircle, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Status = "todo" | "in_progress" | "blocked" | "done";

const statusConfig: Record<Status, { icon: React.ElementType; label: string; className: string }> = {
  todo: {
    icon: Circle,
    label: "To Do",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  in_progress: {
    icon: Clock,
    label: "In Progress",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  blocked: {
    icon: AlertCircle,
    label: "Blocked",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
  done: {
    icon: CheckCircle2,
    label: "Done",
    className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
};

interface StatusBadgeProps {
  status: Status;
  showLabel?: boolean;
  size?: "sm" | "default";
}

export function StatusBadge({ status, showLabel = true, size = "default" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        config.className,
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid={`badge-status-${status}`}
    >
      <Icon className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}
