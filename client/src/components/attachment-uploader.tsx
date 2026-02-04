import { useState, useCallback, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  Paperclip, 
  Upload, 
  X, 
  FileText, 
  Image, 
  File, 
  Download, 
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { TaskAttachmentWithUser } from "@shared/schema";

interface AttachmentUploaderProps {
  taskId: string;
  projectId: string;
}

interface UploadingFile {
  id: string;
  name: string;
  status: "uploading" | "completing" | "error";
  error?: string;
}

interface AttachmentConfig {
  configured: boolean;
  maxFileSizeBytes: number;
  allowedMimeTypes: string[];
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) {
    return Image;
  }
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) {
    return FileText;
  }
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ATTACHMENT_MAX_DIMENSION = 2000;
const ATTACHMENT_WEBP_QUALITY = 0.85;

async function compressImageIfNeeded(file: File): Promise<{ file: File; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    return { file, mimeType: file.type };
  }
  
  if (file.type === "image/svg+xml" || file.type === "image/x-icon" || file.type === "image/vnd.microsoft.icon") {
    return { file, mimeType: file.type };
  }
  
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.width;
      let height = img.height;
      
      if (width <= ATTACHMENT_MAX_DIMENSION && height <= ATTACHMENT_MAX_DIMENSION) {
        if (file.type === "image/webp" || file.type === "image/png" || file.type === "image/gif") {
          resolve({ file, mimeType: file.type });
          return;
        }
      }
      
      if (width > ATTACHMENT_MAX_DIMENSION || height > ATTACHMENT_MAX_DIMENSION) {
        const scale = Math.min(ATTACHMENT_MAX_DIMENSION / width, ATTACHMENT_MAX_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        resolve({ file, mimeType: file.type });
        return;
      }
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, width, height);
      
      let outputType = "image/webp";
      let quality: number | undefined = ATTACHMENT_WEBP_QUALITY;
      
      if (file.type === "image/png" || file.type === "image/gif") {
        outputType = "image/png";
        quality = undefined;
      }
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const ext = outputType === "image/webp" ? ".webp" : ".png";
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const compressedFile = new window.File([blob], baseName + ext, { type: outputType });
            console.log(`[attachment] Compressed ${file.name}: ${(file.size / 1024).toFixed(1)}KB → ${(blob.size / 1024).toFixed(1)}KB`);
            resolve({ file: compressedFile, mimeType: outputType });
          } else {
            resolve({ file, mimeType: file.type });
          }
        },
        outputType,
        quality
      );
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ file, mimeType: file.type });
    };
    
    img.src = url;
  });
}

export function AttachmentUploader({ taskId, projectId }: AttachmentUploaderProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFiles, setUploadingFiles] = useState<UploadingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const { data: config } = useQuery<AttachmentConfig>({
    queryKey: ["/api/attachments/config"],
  });

  const { data: attachments = [], isLoading } = useQuery<TaskAttachmentWithUser[]>({
    queryKey: ["/api/projects", projectId, "tasks", taskId, "attachments"],
    enabled: !!taskId && !!projectId,
  });

  const uploadFile = useCallback(async (file: File) => {
    const uploadId = crypto.randomUUID();
    
    setUploadingFiles(prev => [...prev, { 
      id: uploadId, 
      name: file.name, 
      status: "uploading" 
    }]);

    try {
      const { file: processedFile, mimeType } = await compressImageIfNeeded(file);
      
      const presignResponse = await apiRequest(
        "POST",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/presign`,
        {
          fileName: processedFile.name,
          mimeType: mimeType || "application/octet-stream",
          fileSizeBytes: processedFile.size,
        }
      );

      const { attachment, upload } = await presignResponse.json();

      const s3Response = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: processedFile,
      });

      if (!s3Response.ok) {
        throw new Error("Failed to upload file to storage");
      }

      setUploadingFiles(prev => 
        prev.map(f => f.id === uploadId ? { ...f, status: "completing" } : f)
      );

      await apiRequest(
        "POST",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachment.id}/complete`,
        {}
      );

      setUploadingFiles(prev => prev.filter(f => f.id !== uploadId));
      
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", projectId, "tasks", taskId, "attachments"] 
      });

      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      
      setUploadingFiles(prev => 
        prev.map(f => f.id === uploadId ? { 
          ...f, 
          status: "error", 
          error: error.message || "Upload failed" 
        } : f)
      );

      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  }, [taskId, projectId, toast]);

  const handleFileSelect = useCallback((files: FileList | null) => {
    if (!files || !config?.configured) return;
    
    Array.from(files).forEach(file => {
      if (file.size > config.maxFileSizeBytes) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the maximum file size of ${formatFileSize(config.maxFileSizeBytes)}.`,
          variant: "destructive",
        });
        return;
      }

      const mimeType = file.type || "application/octet-stream";
      if (!config.allowedMimeTypes.includes(mimeType)) {
        toast({
          title: "File type not allowed",
          description: `${file.name} has an unsupported file type.`,
          variant: "destructive",
        });
        return;
      }

      uploadFile(file);
    });
  }, [config, uploadFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const downloadMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      const response = await apiRequest(
        "GET",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}/download`
      );
      return response.json();
    },
    onSuccess: (data: { url: string }) => {
      window.open(data.url, "_blank");
    },
    onError: () => {
      toast({
        title: "Download failed",
        description: "Failed to generate download link. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) => {
      return apiRequest(
        "DELETE",
        `/api/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ["/api/projects", projectId, "tasks", taskId, "attachments"] 
      });
      toast({
        title: "Attachment deleted",
        description: "The attachment has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Failed to delete attachment. Please try again.",
        variant: "destructive",
      });
    },
  });

  const removeUploadingFile = useCallback((id: string) => {
    setUploadingFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  if (!config?.configured) {
    return (
      <div className="mt-4 p-3 border rounded-md bg-muted/50">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <AlertCircle className="h-4 w-4" />
          <span>File attachments are not configured.</span>
        </div>
      </div>
    );
  }

  const completedAttachments = attachments.filter(a => a.uploadStatus === "complete");

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Attachments</span>
      </div>

      <div
        className={`border-2 border-dashed rounded-lg p-4 transition-colors ${
          isDragOver 
            ? "border-primary bg-primary/5" 
            : "border-muted-foreground/20 hover:border-muted-foreground/40"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        data-testid="dropzone-attachments"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files)}
          data-testid="input-file-attachments"
        />
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            <span>Drop files here or </span>
            <button
              type="button"
              className="text-primary hover:underline cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              data-testid="button-attach-file"
            >
              browse
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Max {formatFileSize(config.maxFileSizeBytes)} per file
          </p>
        </div>
      </div>

      {uploadingFiles.length > 0 && (
        <div className="space-y-2">
          {uploadingFiles.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-2 p-2 bg-muted/50 rounded-md"
            >
              {file.status === "error" ? (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              )}
              <span className="text-sm truncate flex-1">{file.name}</span>
              {file.status === "uploading" && (
                <span className="text-xs text-muted-foreground">Uploading...</span>
              )}
              {file.status === "completing" && (
                <span className="text-xs text-muted-foreground">Completing...</span>
              )}
              {file.status === "error" && (
                <>
                  <span className="text-xs text-destructive">{file.error}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => removeUploadingFile(file.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : completedAttachments.length > 0 ? (
        <div className="space-y-2">
          {completedAttachments.map((attachment) => {
            const FileIcon = getFileIcon(attachment.mimeType);
            return (
              <div
                key={attachment.id}
                className="flex items-center gap-2 p-2 bg-muted/30 rounded-md group"
                data-testid={`attachment-item-${attachment.id}`}
              >
                <FileIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{attachment.originalFileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(attachment.fileSizeBytes)}
                    {attachment.uploadedByUser && ` • ${attachment.uploadedByUser.name}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => downloadMutation.mutate(attachment.id)}
                    disabled={downloadMutation.isPending}
                    data-testid={`button-download-${attachment.id}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(attachment.id)}
                    disabled={deleteMutation.isPending}
                    data-testid={`button-delete-${attachment.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-2">
          No attachments yet
        </p>
      )}
    </div>
  );
}
