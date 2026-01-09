import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagBadgeProps {
  name: string;
  color?: string | null;
  onRemove?: () => void;
  size?: "sm" | "default";
}

export function TagBadge({ name, color, onRemove, size = "default" }: TagBadgeProps) {
  const bgColor = color || "#6B7280";

  return (
    <Badge
      variant="secondary"
      className={cn(
        "gap-1 border-0 font-normal",
        size === "sm" && "px-1.5 py-0 text-[10px]"
      )}
      style={{
        backgroundColor: `${bgColor}20`,
        color: bgColor,
      }}
      data-testid={`badge-tag-${name.toLowerCase().replace(/\s/g, "-")}`}
    >
      <span>{name}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
          data-testid={`button-remove-tag-${name.toLowerCase().replace(/\s/g, "-")}`}
        >
          <X className={cn("h-3 w-3", size === "sm" && "h-2.5 w-2.5")} />
        </button>
      )}
    </Badge>
  );
}
