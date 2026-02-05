/**
 * Presence Indicator Component
 * 
 * Displays online/idle/offline status with a Slack-style indicator.
 * - Green filled circle: online
 * - Amber/yellow filled circle: idle
 * - Hollow gray ring: offline
 * 
 * Optionally shows tooltip with status and last seen time.
 */

import { cn } from "@/lib/utils";
import { useUserPresence } from "@/hooks/use-presence";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface PresenceIndicatorProps {
  userId: string;
  size?: "sm" | "md" | "lg";
  showTooltip?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "h-2 w-2",
  md: "h-2.5 w-2.5",
  lg: "h-3 w-3",
};

function getStatusClasses(status: 'online' | 'idle' | 'offline'): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'idle':
      return 'bg-amber-400';
    case 'offline':
      return 'bg-transparent border-2 border-muted-foreground/50';
  }
}

function getTooltipText(status: 'online' | 'idle' | 'offline', lastSeenAt: Date | null): string {
  switch (status) {
    case 'online':
      return 'Online';
    case 'idle':
      return 'Idle';
    case 'offline':
      return lastSeenAt
        ? `Last seen ${formatDistanceToNow(lastSeenAt, { addSuffix: true })}`
        : 'Offline';
  }
}

export function PresenceIndicator({
  userId,
  size = "md",
  showTooltip = true,
  className,
}: PresenceIndicatorProps) {
  const { status, lastSeenAt } = useUserPresence(userId);

  const indicator = (
    <span
      className={cn(
        "inline-block rounded-full flex-shrink-0",
        sizeClasses[size],
        getStatusClasses(status),
        className
      )}
      data-testid={`presence-indicator-${userId}`}
      data-status={status}
    />
  );

  if (!showTooltip) {
    return indicator;
  }

  const tooltipText = getTooltipText(status, lastSeenAt);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Presence indicator that overlays on an avatar
 * Positioned at bottom-right corner
 */
interface AvatarPresenceIndicatorProps extends PresenceIndicatorProps {
  avatarSize?: number;
}

function getAvatarStatusClasses(status: 'online' | 'idle' | 'offline'): string {
  switch (status) {
    case 'online':
      return 'bg-green-500';
    case 'idle':
      return 'bg-amber-400';
    case 'offline':
      return 'bg-muted-foreground/30';
  }
}

export function AvatarPresenceIndicator({
  userId,
  size = "sm",
  showTooltip = true,
  avatarSize = 32,
  className,
}: AvatarPresenceIndicatorProps) {
  const { status, lastSeenAt } = useUserPresence(userId);

  // Calculate position based on avatar size
  const offsetClasses = avatarSize <= 24 
    ? "-bottom-0.5 -right-0.5" 
    : avatarSize <= 32 
      ? "-bottom-0.5 -right-0.5"
      : "-bottom-1 -right-1";

  const indicator = (
    <span
      className={cn(
        "absolute inline-block rounded-full border-2 border-background flex-shrink-0",
        sizeClasses[size],
        offsetClasses,
        getAvatarStatusClasses(status),
        className
      )}
      data-testid={`avatar-presence-${userId}`}
      data-status={status}
    />
  );

  if (!showTooltip) {
    return indicator;
  }

  const tooltipText = getTooltipText(status, lastSeenAt);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {indicator}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        <p>{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
