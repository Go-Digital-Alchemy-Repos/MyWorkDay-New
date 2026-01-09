import { Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { format, isToday, isTomorrow, isPast, isThisWeek, addDays } from "date-fns";

interface DueDateBadgeProps {
  date: Date | string | null;
  size?: "sm" | "default";
}

export function DueDateBadge({ date, size = "default" }: DueDateBadgeProps) {
  if (!date) return null;

  const dateObj = typeof date === "string" ? new Date(date) : date;
  
  let label: string;
  let className: string;

  if (isPast(dateObj) && !isToday(dateObj)) {
    label = format(dateObj, "MMM d");
    className = "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  } else if (isToday(dateObj)) {
    label = "Today";
    className = "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
  } else if (isTomorrow(dateObj)) {
    label = "Tomorrow";
    className = "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300";
  } else if (isThisWeek(dateObj, { weekStartsOn: 1 })) {
    label = format(dateObj, "EEEE");
    className = "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300";
  } else {
    label = format(dateObj, "MMM d");
    className = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        className,
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      data-testid="badge-due-date"
    >
      <Calendar className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
      <span>{label}</span>
    </Badge>
  );
}
