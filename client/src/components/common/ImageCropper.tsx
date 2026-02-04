import { useState, useCallback } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ZoomIn, ZoomOut, RotateCcw, Check, X } from "lucide-react";

interface ImageCropperProps {
  imageSrc: string;
  open: boolean;
  onClose: () => void;
  onCropComplete: (croppedBlob: Blob, mimeType: string) => void;
  aspectRatio?: number;
  cropShape?: "rect" | "round";
  originalMimeType?: string;
}

// Avatar storage optimization constants
// Max dimension for avatar images to ensure efficient storage
const AVATAR_MAX_DIMENSION = 400;
// WebP quality for avatar compression (0.85 = good balance of quality and size)
const AVATAR_WEBP_QUALITY = 0.85;

async function createCroppedImage(
  imageSrc: string,
  pixelCrop: Area,
  mimeType: string = "image/png",
  maxDimension: number = AVATAR_MAX_DIMENSION
): Promise<{ blob: Blob; finalMimeType: string }> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("No 2d context");
  }

  // Calculate output dimensions - resize if larger than maxDimension
  let outputWidth = pixelCrop.width;
  let outputHeight = pixelCrop.height;
  
  if (outputWidth > maxDimension || outputHeight > maxDimension) {
    const scale = Math.min(maxDimension / outputWidth, maxDimension / outputHeight);
    outputWidth = Math.round(outputWidth * scale);
    outputHeight = Math.round(outputHeight * scale);
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Use high-quality image scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Determine output format:
  // - GIF → PNG (GIF not supported by canvas.toBlob for animation)
  // - PNG → PNG (preserve transparency)
  // - JPEG/WebP/others → WebP (better compression)
  let outputType: string;
  let quality: number | undefined;
  
  if (mimeType === "image/gif" || mimeType === "image/png") {
    // Keep PNG for transparency support
    outputType = "image/png";
    quality = undefined;
  } else {
    // Convert to WebP for better compression
    outputType = "image/webp";
    quality = AVATAR_WEBP_QUALITY;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({ blob, finalMimeType: outputType });
        } else {
          reject(new Error("Canvas is empty"));
        }
      },
      outputType,
      quality
    );
  });
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.crossOrigin = "anonymous";
    image.src = url;
  });
}

export function ImageCropper({
  imageSrc,
  open,
  onClose,
  onCropComplete,
  aspectRatio = 1,
  cropShape = "round",
  originalMimeType = "image/png",
}: ImageCropperProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropChange = useCallback((location: Point) => {
    setCrop(location);
  }, []);

  const onZoomChange = useCallback((newZoom: number) => {
    setZoom(newZoom);
  }, []);

  const onCropAreaComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedAreaPixels(croppedAreaPixels);
    },
    []
  );

  const handleReset = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  }, []);

  const handleSave = useCallback(async () => {
    if (!croppedAreaPixels) return;

    setIsProcessing(true);
    try {
      // createCroppedImage handles compression and format optimization:
      // - Resizes to max 400x400 for efficient storage
      // - Converts JPEG to WebP for better compression
      // - Keeps PNG for transparency support
      const { blob, finalMimeType } = await createCroppedImage(imageSrc, croppedAreaPixels, originalMimeType);
      onCropComplete(blob, finalMimeType);
      onClose();
    } catch (error) {
      console.error("Error cropping image:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [imageSrc, croppedAreaPixels, onCropComplete, onClose, originalMimeType]);

  const handleClose = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="dialog-image-cropper">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>

        <div className="relative w-full h-64 bg-muted rounded-lg overflow-hidden" data-testid="container-crop-area">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            cropShape={cropShape}
            showGrid={false}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={onCropAreaComplete}
          />
        </div>

        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-4">
            <ZoomOut className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <Slider
              value={[zoom]}
              min={1}
              max={3}
              step={0.1}
              onValueChange={(values) => setZoom(values[0])}
              className="flex-1"
              data-testid="slider-zoom"
            />
            <ZoomIn className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </div>

          <div className="flex justify-center">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleReset}
              data-testid="button-reset-crop"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset
            </Button>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isProcessing}
            data-testid="button-cancel-crop"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isProcessing || !croppedAreaPixels}
            data-testid="button-save-crop"
          >
            <Check className="h-4 w-4 mr-2" />
            {isProcessing ? "Processing..." : "Apply"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
