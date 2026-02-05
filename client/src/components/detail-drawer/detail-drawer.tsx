import { useState, useEffect, useCallback, ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DetailTab {
  id: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface DetailDrawerProps {
  entityType: "task" | "project" | "client";
  entityId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerActions?: ReactNode;
  tabs: DetailTab[];
  defaultTab?: string;
  isLoading?: boolean;
  error?: Error | null;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
  width?: string;
}

function DetailDrawerSkeleton() {
  return (
    <div className="space-y-6 p-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}

function DetailDrawerError({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h3 className="text-lg font-semibold mb-2">Failed to load details</h3>
      <p className="text-sm text-muted-foreground mb-4">
        {error.message || "An unexpected error occurred"}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} data-testid="button-retry">
          Try Again
        </Button>
      )}
    </div>
  );
}

function DetailDrawerEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <AlertCircle className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export function DetailDrawer({
  entityType,
  entityId,
  open,
  onOpenChange,
  title,
  subtitle,
  headerActions,
  tabs,
  defaultTab,
  isLoading = false,
  error = null,
  isEmpty = false,
  emptyMessage = "No data available",
  className,
  width = "sm:max-w-[80vw] min-w-[600px]",
}: DetailDrawerProps) {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id || "overview");
  const [previousPath, setPreviousPath] = useState<string | null>(null);

  const urlParamKey = `${entityType}Id`;

  useEffect(() => {
    if (open && entityId) {
      const currentPath = window.location.pathname;
      const currentSearch = window.location.search;
      const params = new URLSearchParams(currentSearch);
      
      if (!params.has(urlParamKey)) {
        setPreviousPath(currentPath + currentSearch);
      }
      
      params.set(urlParamKey, entityId);
      const newUrl = `${currentPath}?${params.toString()}`;
      window.history.replaceState(null, "", newUrl);
    }
  }, [open, entityId, urlParamKey]);

  const handleClose = useCallback(() => {
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const params = new URLSearchParams(currentSearch);
    params.delete(urlParamKey);
    
    const newSearch = params.toString();
    const newUrl = newSearch ? `${currentPath}?${newSearch}` : currentPath;
    window.history.replaceState(null, "", newUrl);
    
    onOpenChange(false);
  }, [urlParamKey, onOpenChange]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlEntityId = params.get(urlParamKey);
    
    if (!open && urlEntityId && urlEntityId === entityId) {
      onOpenChange(true);
    }
  }, [search, urlParamKey, entityId, open, onOpenChange]);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    
    const currentPath = window.location.pathname;
    const currentSearch = window.location.search;
    const params = new URLSearchParams(currentSearch);
    params.set("tab", tabId);
    const newUrl = `${currentPath}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  };

  useEffect(() => {
    const params = new URLSearchParams(search);
    const urlTab = params.get("tab");
    if (urlTab && tabs.some(t => t.id === urlTab)) {
      setActiveTab(urlTab);
    }
  }, [search, tabs]);

  useEffect(() => {
    if (defaultTab && !tabs.some(t => t.id === activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab, tabs, activeTab]);

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent 
        className={cn("w-full overflow-y-auto", width, className)} 
        data-testid={`drawer-${entityType}-detail`}
      >
        {isLoading ? (
          <DetailDrawerSkeleton />
        ) : error ? (
          <DetailDrawerError error={error} />
        ) : isEmpty ? (
          <DetailDrawerEmpty message={emptyMessage} />
        ) : (
          <>
            <SheetHeader className="space-y-4 pb-4 border-b">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-xl truncate" data-testid={`text-${entityType}-title`}>
                    {title}
                  </SheetTitle>
                  {subtitle && (
                    <SheetDescription className="mt-1">
                      {subtitle}
                    </SheetDescription>
                  )}
                </div>
                {headerActions && (
                  <div className="flex items-center gap-2 shrink-0">
                    {headerActions}
                  </div>
                )}
              </div>
            </SheetHeader>

            <div className="mt-4">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="w-full justify-start" data-testid={`tabs-${entityType}`}>
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      disabled={tab.disabled}
                      className="gap-2"
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.icon}
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {tabs.map((tab) => (
                  <TabsContent key={tab.id} value={tab.id} className="mt-4">
                    {tab.content}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function useDetailDrawer(entityType: "task" | "project" | "client") {
  const search = useSearch();
  const urlParamKey = `${entityType}Id`;
  
  const getEntityIdFromUrl = useCallback(() => {
    const params = new URLSearchParams(search);
    return params.get(urlParamKey);
  }, [search, urlParamKey]);
  
  const [isOpen, setIsOpen] = useState(false);
  const [entityId, setEntityId] = useState<string | null>(null);
  
  useEffect(() => {
    const urlEntityId = getEntityIdFromUrl();
    if (urlEntityId) {
      setEntityId(urlEntityId);
      setIsOpen(true);
    }
  }, [getEntityIdFromUrl]);
  
  const openDrawer = useCallback((id: string) => {
    setEntityId(id);
    setIsOpen(true);
  }, []);
  
  const closeDrawer = useCallback(() => {
    setIsOpen(false);
    setEntityId(null);
  }, []);
  
  return {
    isOpen,
    entityId,
    openDrawer,
    closeDrawer,
    setIsOpen,
  };
}
