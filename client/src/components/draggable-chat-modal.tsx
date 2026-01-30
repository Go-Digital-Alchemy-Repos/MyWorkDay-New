import { useState, useRef, useEffect, useCallback, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X, Minus, Maximize2, Minimize2, GripVertical } from "lucide-react";

interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface DraggableChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  headerContent?: ReactNode;
  className?: string;
}

const STORAGE_KEY = "chat-modal-state";
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 520;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;

interface ModalState {
  position: Position;
  size: Size;
  isMinimized: boolean;
  isMaximized: boolean;
}

function getDefaultPosition(): Position {
  if (typeof window === "undefined") return { x: 100, y: 100 };
  return {
    x: window.innerWidth - DEFAULT_WIDTH - 24,
    y: window.innerHeight - DEFAULT_HEIGHT - 24,
  };
}

interface PersistedModalState {
  position: Position;
  size: Size;
}

function loadModalState(): ModalState {
  const defaultState: ModalState = {
    position: getDefaultPosition(),
    size: { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT },
    isMinimized: false,
    isMaximized: false,
  };

  if (typeof window === "undefined") {
    return defaultState;
  }
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: PersistedModalState = JSON.parse(stored);
      let position = { ...parsed.position };
      let size = { ...parsed.size };
      
      if (position.x < 0) position.x = 20;
      if (position.y < 0) position.y = 20;
      if (position.x > window.innerWidth - 100) {
        position.x = window.innerWidth - DEFAULT_WIDTH - 24;
      }
      if (position.y > window.innerHeight - 100) {
        position.y = window.innerHeight - DEFAULT_HEIGHT - 24;
      }
      if (size.width < MIN_WIDTH) size.width = DEFAULT_WIDTH;
      if (size.height < MIN_HEIGHT) size.height = DEFAULT_HEIGHT;
      if (size.width > window.innerWidth) size.width = window.innerWidth - 48;
      if (size.height > window.innerHeight) size.height = window.innerHeight - 48;
      
      return {
        position,
        size,
        isMinimized: false,
        isMaximized: false,
      };
    }
  } catch (e) {
    console.warn("Failed to load chat modal state:", e);
  }
  
  return defaultState;
}

function saveModalState(state: ModalState) {
  try {
    const toSave: PersistedModalState = {
      position: state.position,
      size: state.size,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn("Failed to save chat modal state:", e);
  }
}

export function DraggableChatModal({
  isOpen,
  onClose,
  title,
  children,
  headerContent,
  className,
}: DraggableChatModalProps) {
  const [state, setState] = useState<ModalState>(loadModalState);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveModalState(state);
  }, [state]);

  useEffect(() => {
    const handleWindowResize = () => {
      setState((prev) => {
        const newX = Math.min(prev.position.x, window.innerWidth - 100);
        const newY = Math.min(prev.position.y, window.innerHeight - 100);
        if (newX !== prev.position.x || newY !== prev.position.y) {
          return { ...prev, position: { x: Math.max(0, newX), y: Math.max(0, newY) } };
        }
        return prev;
      });
    };
    
    window.addEventListener("resize", handleWindowResize);
    return () => window.removeEventListener("resize", handleWindowResize);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (state.isMaximized) return;
    
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("[data-no-drag]")) {
      return;
    }
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - state.position.x,
      y: e.clientY - state.position.y,
    });
    e.preventDefault();
  }, [state.position, state.isMaximized]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (state.isMaximized || state.isMinimized) return;
    
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: state.size.width,
      height: state.size.height,
    });
    e.preventDefault();
    e.stopPropagation();
  }, [state.isMaximized, state.isMinimized, state.size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 100));
        const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 50));
        setState((prev) => ({ ...prev, position: { x: newX, y: newY } }));
      }
      
      if (isResizing && resizeStart) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const newWidth = Math.max(MIN_WIDTH, resizeStart.width + deltaX);
        const newHeight = Math.max(MIN_HEIGHT, resizeStart.height + deltaY);
        setState((prev) => ({ ...prev, size: { width: newWidth, height: newHeight } }));
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setResizeStart(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isResizing, dragOffset, resizeStart]);

  const toggleMinimize = useCallback(() => {
    setState((prev) => ({ ...prev, isMinimized: !prev.isMinimized, isMaximized: false }));
  }, []);

  const toggleMaximize = useCallback(() => {
    setState((prev) => ({ ...prev, isMaximized: !prev.isMaximized, isMinimized: false }));
  }, []);

  if (!isOpen) return null;

  const modalStyle: React.CSSProperties = state.isMaximized
    ? {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        height: "100%",
        zIndex: 50,
      }
    : {
        position: "fixed",
        top: state.position.y,
        left: state.position.x,
        width: state.size.width,
        height: state.isMinimized ? "auto" : state.size.height,
        zIndex: 50,
      };

  return (
    <div
      ref={modalRef}
      style={modalStyle}
      className={cn(
        "flex flex-col bg-card/95 dark:bg-accent/95 backdrop-blur-sm border border-border rounded-lg shadow-2xl overflow-hidden",
        isDragging && "cursor-grabbing select-none",
        className
      )}
      data-testid="chat-modal"
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 px-3 py-2 bg-muted/50 border-b border-border",
          !state.isMaximized && "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="font-medium text-sm truncate">{title}</div>
        </div>
        
        <div className="flex items-center gap-1 shrink-0" data-no-drag>
          {headerContent}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMinimize}
            data-testid="button-chat-minimize"
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleMaximize}
            data-testid="button-chat-maximize"
          >
            {state.isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            data-testid="button-chat-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!state.isMinimized && (
        <div className="flex-1 overflow-hidden relative">
          {children}
          
          {!state.isMaximized && (
            <div
              className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
              onMouseDown={handleResizeMouseDown}
              data-testid="chat-resize-handle"
            >
              <svg
                className="w-full h-full text-muted-foreground"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                <path d="M14 14H10V10L14 14ZM14 10H12V8L14 10ZM14 6H14V4L14 6Z" />
              </svg>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
