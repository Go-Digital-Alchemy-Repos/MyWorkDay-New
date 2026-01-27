import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

interface FeatureStatus {
  enabled: boolean;
  reason?: string;
  checkedAt: string;
}

interface FeaturesResponse {
  features: {
    chat: FeatureStatus;
    notifications: FeatureStatus;
    errorLogging: FeatureStatus;
    timeTracking: FeatureStatus;
    clientNotes: FeatureStatus;
    clientDocuments: FeatureStatus;
  };
  recommendations: string[];
  timestamp: string;
}

interface FeaturesContextType {
  features: FeaturesResponse["features"] | null;
  recommendations: string[];
  isLoading: boolean;
  hasDisabledFeatures: boolean;
  isFeatureEnabled: (feature: keyof FeaturesResponse["features"]) => boolean;
}

const FeaturesContext = createContext<FeaturesContextType | null>(null);

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [hasChecked, setHasChecked] = useState(false);

  const { data, isLoading } = useQuery<FeaturesResponse>({
    queryKey: ["/api/v1/system/features"],
    enabled: isAuthenticated && !hasChecked,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (data) {
      setHasChecked(true);
    }
  }, [data]);

  const features = data?.features ?? null;
  const recommendations = data?.recommendations ?? [];

  const hasDisabledFeatures = features
    ? Object.values(features).some((f) => !f.enabled)
    : false;

  const isFeatureEnabled = (feature: keyof FeaturesResponse["features"]): boolean => {
    if (!features) return true;
    return features[feature]?.enabled ?? true;
  };

  return (
    <FeaturesContext.Provider
      value={{
        features,
        recommendations,
        isLoading,
        hasDisabledFeatures,
        isFeatureEnabled,
      }}
    >
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  const context = useContext(FeaturesContext);
  if (!context) {
    throw new Error("useFeatures must be used within a FeaturesProvider");
  }
  return context;
}

export function useFeatureEnabled(feature: keyof FeaturesResponse["features"]): boolean {
  const { isFeatureEnabled } = useFeatures();
  return isFeatureEnabled(feature);
}
