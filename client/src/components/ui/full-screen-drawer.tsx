"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog"

interface FullScreenDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  hasUnsavedChanges?: boolean
  onConfirmClose?: () => void
  side?: "left" | "right"
  width?: "md" | "lg" | "xl" | "2xl" | "full"
}

const widthClasses = {
  md: "w-full sm:max-w-md",
  lg: "w-full sm:max-w-lg",
  xl: "w-full sm:max-w-xl",
  "2xl": "w-full sm:max-w-2xl",
  full: "w-full sm:max-w-[90vw]",
}

export function FullScreenDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  hasUnsavedChanges = false,
  onConfirmClose,
  side = "right",
  width = "xl",
}: FullScreenDrawerProps) {
  const [showDiscardDialog, setShowDiscardDialog] = React.useState(false)

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && hasUnsavedChanges) {
      setShowDiscardDialog(true)
    } else {
      onOpenChange(newOpen)
    }
  }

  const handleConfirmDiscard = () => {
    setShowDiscardDialog(false)
    onConfirmClose?.()
    onOpenChange(false)
  }

  const handleCancelDiscard = () => {
    setShowDiscardDialog(false)
  }

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault()
        handleOpenChange(false)
      }
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [open, hasUnsavedChanges])

  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden"
    } else {
      document.body.style.overflow = ""
    }
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  const slideDirection = side === "right" 
    ? "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
    : "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"

  const positionClass = side === "right" ? "right-0" : "left-0"
  const borderClass = side === "right" ? "border-l" : "border-r"

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            className={cn(
              "fixed inset-y-0 z-50 flex h-full flex-col bg-background shadow-xl",
              "transition-transform duration-300 ease-in-out",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              slideDirection,
              positionClass,
              borderClass,
              widthClasses[width]
            )}
            data-testid="full-screen-drawer"
          >
            <div className="flex items-center justify-between border-b px-6 py-4 shrink-0">
              <div className="space-y-1">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  {title}
                </DialogPrimitive.Title>
                {description && (
                  <DialogPrimitive.Description className="text-sm text-muted-foreground">
                    {description}
                  </DialogPrimitive.Description>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenChange(false)}
                data-testid="button-close-drawer"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6">
              {children}
            </div>

            {footer && (
              <div className="border-t px-6 py-4 shrink-0 bg-background">
                {footer}
              </div>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to discard them?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelDiscard}>
              Keep editing
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

interface FullScreenDrawerFooterProps {
  onCancel: () => void
  onSave: () => void
  isLoading?: boolean
  saveLabel?: string
  cancelLabel?: string
  saveDisabled?: boolean
}

export function FullScreenDrawerFooter({
  onCancel,
  onSave,
  isLoading = false,
  saveLabel = "Save",
  cancelLabel = "Cancel",
  saveDisabled = false,
}: FullScreenDrawerFooterProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Button
        type="button"
        variant="ghost"
        onClick={onCancel}
        disabled={isLoading}
        data-testid="button-drawer-cancel"
      >
        {cancelLabel}
      </Button>
      <Button
        type="submit"
        onClick={onSave}
        disabled={isLoading || saveDisabled}
        data-testid="button-drawer-save"
      >
        {isLoading ? "Saving..." : saveLabel}
      </Button>
    </div>
  )
}
