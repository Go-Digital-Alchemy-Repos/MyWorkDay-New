import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import { useFeatures } from "@/contexts/features-context";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export function FeaturesBanner() {
  const { features, recommendations, hasDisabledFeatures } = useFeatures();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!hasDisabledFeatures || dismissed) {
    return null;
  }

  const disabledFeatures = features
    ? Object.entries(features)
        .filter(([, status]) => !status.enabled)
        .map(([name]) => name)
    : [];

  const isSuperUser = user?.role === "super_user";

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2" data-testid="features-banner">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            Some features are currently unavailable: {disabledFeatures.join(", ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isSuperUser && recommendations.length > 0 && (
            <span className="text-xs text-muted-foreground hidden md:block">
              {recommendations[0]}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setDismissed(true)}
            data-testid="button-dismiss-features-banner"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
