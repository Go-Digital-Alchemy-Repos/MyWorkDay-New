import { useQuery } from "@tanstack/react-query";

export interface CrmFlags {
  client360: boolean;
  contacts: boolean;
  timeline: boolean;
  portal: boolean;
  files: boolean;
  approvals: boolean;
  clientMessaging: boolean;
}

const ALL_OFF: CrmFlags = {
  client360: false,
  contacts: false,
  timeline: false,
  portal: false,
  files: false,
  approvals: false,
  clientMessaging: false,
};

export function useCrmFlags(): CrmFlags {
  const { data } = useQuery<CrmFlags>({
    queryKey: ["/api/crm/flags"],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return data ?? ALL_OFF;
}

export function useAnyCrmEnabled(): boolean {
  const flags = useCrmFlags();
  return Object.values(flags).some(Boolean);
}
