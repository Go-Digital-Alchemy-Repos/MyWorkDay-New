import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Priority = "low" | "medium" | "high" | "urgent";

const priorityConfig: Record<Priority, { icon: React.ElementType; label: string; className: string }> = {
  low: {
    icon: ArrowDown,
    label: "Low",
    className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  },
  medium: {
    icon: ArrowRight,
    label: "Medium",
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  high: {
    icon: ArrowUp,
    label: "High",
    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  },
  urgent: {
    icon: AlertTriangle,
    label: "Urgent",
    className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  },
};

interface PriorityBadgeProps {
  priority: Priority;
  showLabel?: boolean;
  size?: "sm" | "default";
}

export function PriorityBadge({ priority, showLabel = true, size = "default" }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  const Icon = config.icon;

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        config.className,
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid={`badge-priority-${priority}`}
    >
      <Icon className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );
}
