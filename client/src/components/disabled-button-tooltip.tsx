import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import type { ComponentProps, ReactNode } from "react";

interface DisabledButtonTooltipProps extends Omit<ComponentProps<typeof Button>, 'disabled'> {
  reason: string;
  children: ReactNode;
}

export function DisabledButtonTooltip({ reason, children, ...buttonProps }: DisabledButtonTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-block" data-testid="disabled-button-wrapper">
          <Button {...buttonProps} disabled className="pointer-events-none">
            {children}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-sm">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
}
