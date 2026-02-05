import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { X, ArrowLeft } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface DetailDrawerTab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  content: React.ReactNode;
  badge?: string | number;
}

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
  tabs?: DetailDrawerTab[];
  defaultTab?: string;
  onTabChange?: (tabId: string) => void;
  footer?: React.ReactNode;
  side?: "left" | "right";
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "wide" | "full";
  hasUnsavedChanges?: boolean;
  onConfirmClose?: () => void;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
  "data-testid"?: string;
}

const sizeClasses = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-xl",
  "2xl": "sm:max-w-2xl",
  wide: "sm:max-w-[80vw] min-w-[600px]",
  full: "sm:max-w-[90vw]",
};

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  subtitle,
  headerActions,
  children,
  tabs,
  defaultTab,
  onTabChange,
  footer,
  side = "right",
  size = "lg",
  hasUnsavedChanges = false,
  onConfirmClose,
  onBack,
  backLabel,
  className,
  "data-testid": testId,
}: DetailDrawerProps) {
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activeTab, setActiveTab] = useState(defaultTab || tabs?.[0]?.id || "");

  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges) {
      setShowDiscardDialog(true);
    } else {
      onOpenChange(newOpen);
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false);
    onConfirmClose?.();
    onOpenChange(false);
  };

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onTabChange?.(tabId);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent 
          side={side} 
          className={cn(
            "flex flex-col p-0 overflow-hidden",
            sizeClasses[size],
            className
          )}
          data-testid={testId}
        >
          <SheetHeader className="px-6 py-4 border-b shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {onBack && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onBack}
                    className="mb-2 -ml-2 h-8 text-muted-foreground hover:text-foreground"
                    data-testid="button-drawer-back"
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    {backLabel || "Back"}
                  </Button>
                )}
                <div className="flex items-center gap-3">
                  {subtitle}
                  <div className="min-w-0">
                    <SheetTitle className="truncate">{title}</SheetTitle>
                    {description && (
                      <SheetDescription className="mt-1 line-clamp-2">
                        {description}
                      </SheetDescription>
                    )}
                  </div>
                </div>
              </div>
              {headerActions && (
                <div className="flex items-center gap-2 shrink-0">
                  {headerActions}
                </div>
              )}
            </div>
            
            {tabs && tabs.length > 0 && (
              <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-4">
                <TabsList className="w-full justify-start h-auto p-1 bg-muted/50">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.id}
                      value={tab.id}
                      className="flex items-center gap-2 data-[state=active]:bg-background"
                      data-testid={`tab-${tab.id}`}
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {tab.badge !== undefined && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-muted-foreground/20">
                          {tab.badge}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4">
              {tabs && tabs.length > 0 ? (
                <Tabs value={activeTab} className="w-full">
                  {tabs.map((tab) => (
                    <TabsContent 
                      key={tab.id} 
                      value={tab.id} 
                      className="mt-0 focus-visible:outline-none focus-visible:ring-0"
                    >
                      {tab.content}
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                children
              )}
            </div>
          </ScrollArea>

          {footer && (
            <div className="px-6 py-4 border-t bg-muted/30 shrink-0">
              {footer}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-discard">
              Keep Editing
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-discard"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
