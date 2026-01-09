import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { User } from "@shared/schema";

interface AvatarGroupProps {
  users: Partial<User>[];
  max?: number;
  size?: "sm" | "default";
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AvatarGroup({ users, max = 3, size = "default" }: AvatarGroupProps) {
  const displayUsers = users.slice(0, max);
  const remaining = users.length - max;

  const avatarSize = size === "sm" ? "h-6 w-6" : "h-8 w-8";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  return (
    <div className="flex -space-x-2" data-testid="avatar-group">
      {displayUsers.map((user, index) => (
        <Tooltip key={user.id || index}>
          <TooltipTrigger asChild>
            <Avatar
              className={cn(
                avatarSize,
                "border-2 border-background ring-0"
              )}
            >
              {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name || ""} />}
              <AvatarFallback className={cn("bg-primary/10 text-primary", textSize)}>
                {getInitials(user.name || "U")}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{user.name || "Unknown"}</p>
          </TooltipContent>
        </Tooltip>
      ))}
      {remaining > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Avatar className={cn(avatarSize, "border-2 border-background")}>
              <AvatarFallback className={cn("bg-muted text-muted-foreground", textSize)}>
                +{remaining}
              </AvatarFallback>
            </Avatar>
          </TooltipTrigger>
          <TooltipContent>
            <p>{remaining} more</p>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
