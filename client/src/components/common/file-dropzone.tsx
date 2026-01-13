import { useState, useRef, useCallback } from "react";
import { Upload, X, Loader2, AlertCircle, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileDropzoneProps {
  onUpload: (file: File) => Promise<string>;
  onRemove?: () => Promise<void>;
  currentUrl?: string | null;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
  previewType?: "image" | "icon" | "favicon";
  className?: string;
  disabled?: boolean;
}

export function FileDropzone({
  onUpload,
  onRemove,
  currentUrl,
  accept = "image/png,image/jpeg,image/webp",
  maxSizeMB = 5,
  label = "Upload File",
  hint,
  previewType = "image",
  className,
  disabled = false,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): string | null => {
    const acceptedTypes = accept.split(",").map(t => t.trim());
    if (!acceptedTypes.includes(file.type)) {
      return `Invalid file type. Accepted: ${acceptedTypes.join(", ")}`;
    }
    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      return `File too large. Maximum size: ${maxSizeMB}MB`;
    }
    return null;
  };

  const handleFile = async (file: File) => {
    setError(null);
    
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const localPreview = URL.createObjectURL(file);
      setPreviewUrl(localPreview);
      
      await onUpload(file);
      
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setPreviewUrl(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (disabled) return;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    
    setIsRemoving(true);
    setError(null);
    try {
      await onRemove();
    } catch (err: any) {
      setError(err.message || "Failed to remove");
    } finally {
      setIsRemoving(false);
    }
  };

  const displayUrl = previewUrl || currentUrl;
  const hasImage = !!displayUrl;

  const getPreviewSize = () => {
    switch (previewType) {
      case "favicon":
        return "h-8 w-8";
      case "icon":
        return "h-16 w-16";
      default:
        return "max-h-20 max-w-full";
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled || isUploading}
        data-testid="input-file-upload"
      />

      {hasImage ? (
        <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
          <div className="flex-shrink-0">
            <img
              src={displayUrl}
              alt="Preview"
              className={cn("object-contain rounded", getPreviewSize())}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">
              {isUploading ? "Uploading..." : "Current image"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || isUploading || isRemoving}
              data-testid="button-change-image"
            >
              Change
            </Button>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleRemove}
                disabled={disabled || isUploading || isRemoving}
                data-testid="button-remove-image"
              >
                {isRemoving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div
          onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-md cursor-pointer transition-colors",
            isDragging && "border-primary bg-primary/5",
            !isDragging && "border-muted-foreground/25 hover:border-muted-foreground/50",
            (disabled || isUploading) && "opacity-50 cursor-not-allowed"
          )}
          data-testid="dropzone-area"
        >
          {isUploading ? (
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          ) : (
            <div className="flex flex-col items-center gap-1">
              <div className="p-2 rounded-full bg-muted">
                <Upload className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">
                Drag and drop or click to upload
              </p>
              {hint && (
                <p className="text-xs text-muted-foreground">{hint}</p>
              )}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
