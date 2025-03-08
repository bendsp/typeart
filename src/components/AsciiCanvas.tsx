"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// Custom debounce implementation to avoid lodash dependency
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

const CHAR_WIDTH = 12;
const CHAR_HEIGHT = 24;
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;

// Default character set, from darkest to lightest
const DEFAULT_ASCII_CHARS =
  "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

// Alternative character sets
const ASCII_PRESETS = {
  default: DEFAULT_ASCII_CHARS,
  simple: "@%#*+=-:. ",
  blocks: "█▓▒░ ",
};

type CharacterSet = keyof typeof ASCII_PRESETS;

interface AsciiCanvasProps {
  initialImage?: string | null;
  initialSize?: number;
  initialUseColor?: boolean;
  initialCharacterSet?: CharacterSet;
  onError?: (error: Error) => void;
}

interface AsciiRenderOptions {
  brightness: number;
  contrast: number;
  invert: boolean;
}

// Define export size options
interface ExportSize {
  name: string;
  scale: number;
}

const EXPORT_SIZES: ExportSize[] = [
  { name: "small", scale: 0.15 },
  { name: "medium", scale: 0.25 },
  { name: "large", scale: 0.5 },
];

// Define export formats
interface ExportFormat {
  extension: string;
  mimeType: string;
  label: string;
}

const EXPORT_FORMATS: ExportFormat[] = [
  { extension: "png", mimeType: "image/png", label: "PNG (Sharp)" },
  { extension: "jpg", mimeType: "image/jpeg", label: "JPG (Smaller)" },
  { extension: "webp", mimeType: "image/webp", label: "WebP (lmao)" },
];

// Convert image to ASCII art and render on the canvas
const drawAscii = (
  image: HTMLImageElement,
  size: number,
  useColor: boolean,
  characterSet: string,
  outputCanvas: HTMLCanvasElement,
  options: AsciiRenderOptions = { brightness: 0, contrast: 0, invert: false }
) => {
  const aspectRatio = image.width / image.height;
  const width = size;
  const height = Math.floor((size / aspectRatio) * CHAR_ASPECT_RATIO);

  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d", {
    willReadFrequently: true,
    alpha: false,
  });
  if (!ctx) return;

  tempCanvas.width = width;
  tempCanvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  // Apply contrast and brightness adjustments
  if (options.contrast !== 0 || options.brightness !== 0 || options.invert) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const factor =
      (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));

    for (let i = 0; i < data.length; i += 4) {
      if (options.contrast !== 0 || options.brightness !== 0) {
        // Apply contrast and brightness
        data[i] = Math.max(
          0,
          Math.min(255, factor * (data[i] - 128) + 128 + options.brightness)
        );
        data[i + 1] = Math.max(
          0,
          Math.min(255, factor * (data[i + 1] - 128) + 128 + options.brightness)
        );
        data[i + 2] = Math.max(
          0,
          Math.min(255, factor * (data[i + 2] - 128) + 128 + options.brightness)
        );
      }

      // Apply invert if needed (make sure it works regardless of brightness/contrast)
      if (options.invert) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height).data;

  // Double the canvas size for higher resolution
  outputCanvas.width = width * CHAR_WIDTH;
  outputCanvas.height = height * CHAR_HEIGHT;

  // Get context with high quality settings
  const outputCtx = outputCanvas.getContext("2d", {
    alpha: false,
  }) as CanvasRenderingContext2D;

  if (!outputCtx) return;

  // Disable image smoothing for crisp text
  outputCtx.imageSmoothingEnabled = false;
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

  // Use a crisp font rendering
  outputCtx.font = `bold ${CHAR_HEIGHT}px monospace`;
  outputCtx.textBaseline = "top";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx],
        g = imageData[idx + 1],
        b = imageData[idx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
      const charIndex = Math.floor(
        (brightness / 255) * (characterSet.length - 1)
      );
      const char = characterSet[charIndex];

      // Ensure minimum contrast for text
      if (useColor) {
        // Calculate luminance to ensure text is visible
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // Apply color with contrast adjustment if needed
        outputCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      } else {
        outputCtx.fillStyle = "white";
      }

      outputCtx.fillText(char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
    }
  }

  // Clean up
  tempCanvas.remove();
};

// AsciiCanvas component renders ASCII art from an image and supports zoom & pan
const AsciiCanvas: React.FC<AsciiCanvasProps> = ({
  initialImage = null,
  initialSize = 200,
  initialUseColor = true,
  initialCharacterSet = "default",
  onError,
}) => {
  // Internal state management - no need for external setters
  const [image, setImage] = useState<string | null>(initialImage);
  const [size, setSize] = useState(initialSize);
  const [useColor, setUseColor] = useState(initialUseColor);
  const [characterSet, setCharacterSet] =
    useState<CharacterSet>(initialCharacterSet);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Add a ref for the main container to manage focus
  const mainContainerRef = useRef<HTMLDivElement | null>(null);

  // Add a zoom multiplier to compensate for larger character size
  // This scales the actual zoom without changing the displayed percentage
  const ZOOM_MULTIPLIER = 0.15; // Adjust this value as needed (0.25 = 1/4 of the displayed zoom)

  const [scale, setScale] = useState(1 * ZOOM_MULTIPLIER);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const lastPanPosition = useRef({ x: 0, y: 0 });

  const [renderOptions, setRenderOptions] = useState<AsciiRenderOptions>({
    brightness: 0,
    contrast: 0,
    invert: false,
  });

  // Add export dialog state
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSize, setExportSize] = useState<ExportSize>(EXPORT_SIZES[1]); // Medium by default
  const [exportFilename, setExportFilename] = useState("typeArt");
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    EXPORT_FORMATS[0]
  ); // PNG by default

  // For calculating and storing export resolutions
  const [exportResolutions, setExportResolutions] = useState<
    Record<string, string>
  >({});

  // Get the selected character set
  const asciiChars = useMemo(
    () => ASCII_PRESETS[characterSet] || DEFAULT_ASCII_CHARS,
    [characterSet]
  );

  // Reset view to original position and scale
  const resetView = useCallback(() => {
    setScale(1 * ZOOM_MULTIPLIER);
    setPanOffset({ x: 0, y: 0 });
  }, [ZOOM_MULTIPLIER]);

  // Handle image upload
  const handleImageUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => setImage(e.target?.result as string);
        reader.readAsDataURL(file);
      }
    },
    []
  );

  // Calculate export resolutions based on current canvas dimensions
  const calculateExportResolutions = useCallback(() => {
    if (!canvasRef.current) return {};

    const canvasWidth = canvasRef.current.width;
    const canvasHeight = canvasRef.current.height;

    const resolutions: Record<string, string> = {};

    EXPORT_SIZES.forEach((size) => {
      const width = Math.round(canvasWidth * size.scale);
      const height = Math.round(canvasHeight * size.scale);
      resolutions[size.name] = `${width}×${height}`;
    });

    return resolutions;
  }, []);

  // Export the ASCII art as an image with the selected size and filename
  const exportAsImage = useCallback(
    (sizeScale: number, filename: string, format: ExportFormat) => {
      if (!canvasRef.current) return;

      try {
        // Create a temporary canvas for the export with reduced resolution
        const exportCanvas = document.createElement("canvas");
        const originalCanvas = canvasRef.current;

        // Use the selected size scale
        const exportWidth = Math.floor(originalCanvas.width * sizeScale);
        const exportHeight = Math.floor(originalCanvas.height * sizeScale);

        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;

        // Get context and set black background
        const exportCtx = exportCanvas.getContext("2d", { alpha: false });
        if (!exportCtx) return;

        // Fill with black background
        exportCtx.fillStyle = "black";
        exportCtx.fillRect(0, 0, exportWidth, exportHeight);

        // Draw the original canvas content onto the export canvas
        exportCtx.drawImage(originalCanvas, 0, 0, exportWidth, exportHeight);

        // Create download link with compression
        const link = document.createElement("a");
        link.download = `${filename}.${format.extension}`;

        // Use appropriate quality based on format
        const quality = format.extension === "png" ? 0.8 : 0.9;
        link.href = exportCanvas.toDataURL(format.mimeType, quality);
        link.click();

        // Clean up
        exportCanvas.remove();
      } catch (err) {
        console.error("Failed to export image:", err);
        if (onError && err instanceof Error) {
          onError(err);
        }
      }
    },
    [onError]
  );

  // Handle export button click - show dialog instead of exporting directly
  const handleExportClick = useCallback(() => {
    // Only allow export if an image is loaded
    if (!image) return;

    setExportResolutions(calculateExportResolutions());
    setShowExportDialog(true);
  }, [calculateExportResolutions, image]);

  // Handle export confirmation from dialog
  const handleExportConfirm = useCallback(() => {
    exportAsImage(exportSize.scale, exportFilename, exportFormat);
    setShowExportDialog(false);
  }, [exportAsImage, exportSize.scale, exportFilename, exportFormat]);

  // Handle export dialog close
  const handleExportCancel = useCallback(() => {
    setShowExportDialog(false);
  }, []);

  // Export the ASCII art as text
  const exportAsText = useCallback(() => {
    if (!canvasRef.current || !imageRef.current) return;

    try {
      const aspectRatio = imageRef.current.width / imageRef.current.height;
      const width = size;
      const height = Math.floor((size / aspectRatio) * CHAR_ASPECT_RATIO);

      const tempCanvas = document.createElement("canvas");
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return;

      tempCanvas.width = width;
      tempCanvas.height = height;
      ctx.drawImage(imageRef.current, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height).data;

      let asciiText = "";

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = imageData[idx],
            g = imageData[idx + 1],
            b = imageData[idx + 2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          const charIndex = Math.floor(
            (brightness / 255) * (asciiChars.length - 1)
          );
          asciiText += asciiChars[charIndex];
        }
        asciiText += "\n";
      }

      // Copy to clipboard and offer download
      navigator.clipboard.writeText(asciiText).then(() => {
        alert("ASCII text copied to clipboard!");

        // Also offer as download
        const blob = new Blob([asciiText], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = "ascii-art.txt";
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
      });

      tempCanvas.remove();
    } catch (err) {
      console.error("Failed to export text:", err);
      if (onError && err instanceof Error) {
        onError(err);
      }
    }
  }, [size, asciiChars, onError]);

  // Render the ASCII art with current options
  const renderAsciiArt = useCallback(() => {
    if (!imageRef.current || !canvasRef.current) return;
    drawAscii(
      imageRef.current,
      size,
      useColor,
      asciiChars,
      canvasRef.current,
      renderOptions
    );
  }, [size, useColor, asciiChars, renderOptions]);

  // Load image and render ASCII art
  useEffect(() => {
    if (image) {
      setLoading(true);
      setError(null);

      const img = new Image();
      img.crossOrigin = "Anonymous";

      img.onload = () => {
        imageRef.current = img;
        renderAsciiArt();
        setLoading(false);
      };

      img.onerror = (e) => {
        const errorMsg = "Failed to load image";
        setError(errorMsg);
        setLoading(false);
        console.error(errorMsg, e);
        if (onError) onError(new Error(errorMsg));
      };

      img.src = image;
    }
  }, [image, renderAsciiArt, onError]);

  // Re-render when options change
  useEffect(() => {
    if (imageRef.current && canvasRef.current) {
      renderAsciiArt();
    }
  }, [renderOptions, renderAsciiArt]);

  // Add a flag/detector for mobile devices
  const isMobileDevice = useRef(
    typeof window !== "undefined" &&
      (navigator.maxTouchPoints > 0 ||
        /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent))
  ).current;

  // Simple zoom functionality with consistent 10% increments across all platforms
  const handleZoom = useCallback(
    (zoomIn: boolean) => {
      // Use 10% increment for all platforms
      const zoomChange = zoomIn ? 0.1 : -0.1;

      // Apply the multiplier to the actual scale but not to the min/max checks
      // Set minimum scale to 0.01 (1%) for mobile devices and 0.05 (5%) for desktop
      const minScale = isMobileDevice ? 0.01 : 0.05;
      const newScale =
        Math.max(minScale, Math.min(5, scale / ZOOM_MULTIPLIER + zoomChange)) *
        ZOOM_MULTIPLIER;

      // Only update scale
      setScale(newScale);
    },
    [scale, ZOOM_MULTIPLIER, isMobileDevice]
  );

  // Handle wheel event for zoom and pan with consistent 10% increment
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Use standard 10% zoom increment for all platforms
        const zoomDelta = 0.1; // 10% change per wheel tick
        const zoomIn = e.deltaY < 0;

        const zoomChange = zoomIn ? zoomDelta : -zoomDelta;
        // Set minimum scale to 0.01 (1%) for mobile devices and 0.05 (5%) for desktop
        const minScale = isMobileDevice ? 0.01 : 0.05;
        const newScale =
          Math.max(
            minScale,
            Math.min(5, scale / ZOOM_MULTIPLIER + zoomChange)
          ) * ZOOM_MULTIPLIER;

        setScale(newScale);
      } else {
        // Pan without canPan check - always enable panning
        const newOffsetX = panOffset.x - e.deltaX;
        const newOffsetY = panOffset.y - e.deltaY;

        // No need to check canPan, but still apply constraints if needed
        setPanOffset({
          x: newOffsetX,
          y: newOffsetY,
        });
      }
    },
    [panOffset, scale, ZOOM_MULTIPLIER, isMobileDevice]
  );

  // Start panning on mouse down - remove canPan check
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Always enable panning
    setIsPanning(true);
    lastPanPosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle panning movement - remove canPan check
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;

      const dx = e.clientX - lastPanPosition.current.x;
      const dy = e.clientY - lastPanPosition.current.y;

      // No canPan check needed
      setPanOffset((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));

      lastPanPosition.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning]
  );

  // End panning
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle keyboard navigation - remove canPan checks
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        !viewportRef.current ||
        !viewportRef.current.contains(document.activeElement)
      ) {
        return;
      }

      const PAN_STEP = 20;

      switch (e.key) {
        case "ArrowUp":
          // Always allow panning
          setPanOffset((prev) => ({ ...prev, y: prev.y + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowDown":
          // Always allow panning
          setPanOffset((prev) => ({ ...prev, y: prev.y - PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowLeft":
          // Always allow panning
          setPanOffset((prev) => ({ ...prev, x: prev.x + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowRight":
          // Always allow panning
          setPanOffset((prev) => ({ ...prev, x: prev.x - PAN_STEP }));
          e.preventDefault();
          break;
        case "+":
        case "=":
          handleZoom(true); // Zoom in
          e.preventDefault();
          break;
        case "-":
        case "_":
          handleZoom(false); // Zoom out
          e.preventDefault();
          break;
        case "0":
          resetView();
          e.preventDefault();
          break;
      }
    },
    [resetView, handleZoom]
  );

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent native zoom on viewport wheel event
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleNativeWheel);
  }, []);

  // Additional state and refs for pinch-to-zoom
  const [touchDistance, setTouchDistance] = useState<number | null>(null);
  const lastTouchDistance = useRef<number | null>(null);

  // Calculate distance between two touch points
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Get center point between two touches
  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;

    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);

  // Handle touch events - support pinch-to-zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        // Single touch - start panning
        setIsPanning(true);
        lastPanPosition.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setTouchDistance(null);
      } else if (e.touches.length === 2) {
        // Two touches - start pinch-to-zoom
        setIsPanning(false);
        const distance = getTouchDistance(e.touches);
        setTouchDistance(distance);
        lastTouchDistance.current = distance;
      }
    },
    [getTouchDistance]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && isPanning) {
        // Handle panning with one finger
        const dx = e.touches[0].clientX - lastPanPosition.current.x;
        const dy = e.touches[0].clientY - lastPanPosition.current.y;

        setPanOffset((prev) => ({
          x: prev.x + dx,
          y: prev.y + dy,
        }));

        lastPanPosition.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      } else if (e.touches.length === 2) {
        // Handle pinch-to-zoom with two fingers
        const currentDistance = getTouchDistance(e.touches);
        const previousDistance = lastTouchDistance.current;

        if (currentDistance && previousDistance && previousDistance > 0) {
          // Calculate zoom based directly on the pinch distance ratio
          // This is much more responsive than using small fixed steps
          const distanceRatio = currentDistance / previousDistance;

          // Get center point of the pinch
          const center = getTouchCenter(e.touches);

          if (center) {
            // Calculate new scale with direct ratio scaling for more responsive feel
            // Allow zooming out to 1% (0.01) on mobile
            const newScale = Math.max(0.01, Math.min(5, scale * distanceRatio));

            // Apply scale change
            setScale(newScale);
          }
        }

        // Update last touch distance
        lastTouchDistance.current = currentDistance;
      }

      e.preventDefault();
    },
    [isPanning, getTouchDistance, getTouchCenter, scale]
  );

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setTouchDistance(null);
    lastTouchDistance.current = null;
  }, []);

  // Adjust brightness
  const handleBrightnessChange = useCallback((value: number) => {
    setRenderOptions((prev) => ({
      ...prev,
      brightness: value,
    }));
  }, []);

  // Adjust contrast
  const handleContrastChange = useCallback((value: number) => {
    setRenderOptions((prev) => ({
      ...prev,
      contrast: value,
    }));
  }, []);

  // Toggle invert
  const toggleInvert = useCallback(() => {
    setRenderOptions((prev) => ({
      ...prev,
      invert: !prev.invert,
    }));
  }, []);

  // Helper function to return focus to the canvas container
  const returnFocusToCanvas = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  }, []);

  // Wrap all control handlers to return focus to canvas
  const handleControlClick = useCallback(
    (callback: () => void) => {
      return (e: React.MouseEvent) => {
        // Prevent default to avoid losing focus
        e.preventDefault();
        // Execute the original callback
        callback();
        // Return focus to canvas
        setTimeout(returnFocusToCanvas, 0);
      };
    },
    [returnFocusToCanvas]
  );

  // Special handler for file input label that doesn't prevent default
  const handleFileInputClick = useCallback(() => {
    // Only schedule focus return, but don't prevent default behavior
    setTimeout(returnFocusToCanvas, 100); // Slightly longer timeout to allow file dialog to open
  }, [returnFocusToCanvas]);

  // Modified toggle controls to maintain focus
  const toggleControlsWithFocus = useCallback(() => {
    setControlsExpanded((prev) => !prev);
    setTimeout(returnFocusToCanvas, 0);
  }, [returnFocusToCanvas]);

  // Focus the canvas on mount
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  }, []);

  return (
    <div className="flex flex-col h-full w-full" ref={mainContainerRef}>
      {/* Minimized Control Bar - Increased size */}
      <div className="bg-gray-900 text-white py-3 px-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={handleControlClick(toggleControlsWithFocus)}
            className="bg-gray-700 hover:bg-gray-600 p-2 rounded"
            aria-label={
              controlsExpanded ? "Collapse controls" : "Expand controls"
            }
          >
            {controlsExpanded ? "▲" : "▼"}
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleControlClick(resetView)}
              className="bg-gray-700 hover:bg-gray-600 p-2 rounded text-sm"
              title="Reset View"
            >
              Reset
            </button>

            <div className="flex items-center bg-gray-800 rounded px-2 py-1">
              <button
                onClick={handleControlClick(() => handleZoom(false))}
                className="text-white p-0.5 text-lg hover:text-gray-300"
                aria-label="Zoom out by 10%"
              >
                −
              </button>
              <span className="mx-2 text-sm w-12 text-center">
                {/* Display the percentage without the multiplier */}
                {Math.round((scale / ZOOM_MULTIPLIER) * 100)}%
              </span>
              <button
                onClick={handleControlClick(() => handleZoom(true))}
                className="text-white p-0.5 text-lg hover:text-gray-300"
                aria-label="Zoom in by 10%"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* TypeArt Logo - Increased size */}
        <div className="absolute left-1/2 transform -translate-x-1/2 flex items-center">
          <div className="h-10 flex items-center">
            <img
              src="/typeArt-logo.png"
              alt="TypeArt"
              className="h-full object-contain"
              onError={(e) => {
                // Fallback if image doesn't load
                const target = e.target as HTMLImageElement;
                target.style.display = "none";
                const parent = target.parentElement;
                if (parent) {
                  const textLogo = document.createElement("div");
                  textLogo.className = "text-xl";
                  textLogo.innerHTML =
                    '<span class="text-green-400">t</span><span class="text-yellow-400">y</span><span class="text-red-400">p</span><span class="text-blue-400">e</span><span class="text-purple-400">A</span><span class="text-green-400">r</span><span class="text-yellow-400">t</span>';
                  parent.appendChild(textLogo);
                }
              }}
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Right side controls remain the same */}
        </div>
      </div>

      {/* Expanded Controls - Collapsible */}
      {controlsExpanded && (
        <div className="bg-gray-900 p-2 overflow-y-auto max-h-64 sm:max-h-48">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {/* Left section: Import/Export & Character Set */}
            <div className="space-y-2">
              <div className="flex space-x-2">
                <label
                  htmlFor="imageUpload"
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 cursor-pointer text-white rounded text-center text-xs flex-1"
                  onClick={handleFileInputClick}
                >
                  Upload Image
                </label>
                <button
                  onClick={handleControlClick(handleExportClick)}
                  className={`px-2 py-1 ${
                    image
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-gray-600 opacity-50 cursor-not-allowed"
                  } text-white rounded text-xs flex-1`}
                  title={image ? "Export as Image" : "Load an image first"}
                  disabled={!image}
                >
                  Export
                </button>
                <input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    handleImageUpload(e);
                    setTimeout(returnFocusToCanvas, 0);
                  }}
                  className="hidden"
                />
              </div>

              {/* Character Set */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Char Set:</label>
                <select
                  value={characterSet}
                  onChange={(e) => {
                    setCharacterSet(e.target.value as CharacterSet);
                    setTimeout(returnFocusToCanvas, 0);
                  }}
                  className="bg-gray-800 text-white rounded border border-gray-700 text-xs p-0.5 flex-1"
                  onBlur={returnFocusToCanvas}
                >
                  {Object.keys(ASCII_PRESETS).map((preset) => (
                    <option key={preset} value={preset}>
                      {preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggles: Color and Invert together */}
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <label className="text-gray-400 text-xs">Color:</label>
                  <div
                    className={`relative inline-block w-8 h-4 ${
                      useColor ? "bg-blue-600" : "bg-gray-600"
                    } rounded-full transition-colors cursor-pointer`}
                    onClick={handleControlClick(() => setUseColor(!useColor))}
                  >
                    <span
                      className={`block w-3 h-3 mt-0.5 ${
                        useColor ? "ml-4" : "ml-1"
                      } bg-white rounded-full transition-transform`}
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <label className="text-gray-400 text-xs">Invert:</label>
                  <div
                    className={`relative inline-block w-8 h-4 ${
                      renderOptions.invert ? "bg-blue-600" : "bg-gray-600"
                    } rounded-full transition-colors cursor-pointer`}
                    onClick={handleControlClick(toggleInvert)}
                  >
                    <span
                      className={`block w-3 h-3 mt-0.5 ${
                        renderOptions.invert ? "ml-4" : "ml-1"
                      } bg-white rounded-full transition-transform`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Right section: All sliders grouped */}
            <div className="space-y-2">
              {/* Size Slider - updated range to 100-500 */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Size:</label>
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="5"
                  value={size}
                  onChange={(e) => {
                    setSize(Number(e.target.value));
                    // No need to return focus for sliders as they don't take focus
                  }}
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                />
                <span className="text-gray-400 text-xs w-10">{size}</span>
              </div>

              {/* Brightness */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">
                  Brightness:
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={renderOptions.brightness}
                  onChange={(e) =>
                    handleBrightnessChange(parseInt(e.target.value))
                  }
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                  aria-label="Adjust brightness"
                />
                <span className="text-gray-400 text-xs w-10">
                  {renderOptions.brightness}
                </span>
              </div>

              {/* Contrast */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Contrast:</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={renderOptions.contrast}
                  onChange={(e) =>
                    handleContrastChange(parseInt(e.target.value))
                  }
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                  aria-label="Adjust contrast"
                />
                <span className="text-gray-400 text-xs w-10">
                  {renderOptions.contrast}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Export Dialog */}
      {showExportDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl max-w-md w-full">
            <h2 className="text-xl  mb-4">Export Options</h2>

            {/* Size Selection */}
            <div className="mb-4">
              <label className="block text-gray-300 mb-2">Image Size</label>
              <div className="grid grid-cols-3 gap-2">
                {EXPORT_SIZES.map((size) => (
                  <button
                    key={size.name}
                    className={`p-2 rounded ${
                      exportSize.name === size.name
                        ? "bg-blue-600 text-white"
                        : "bg-gray-700 text-gray-200 hover:bg-gray-600"
                    }`}
                    onClick={() => setExportSize(size)}
                  >
                    <div className="font-medium capitalize">{size.name}</div>
                    <div className="text-xs opacity-75">
                      {exportResolutions[size.name] || ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Filename Input and Format Selection */}
            <div className="mb-6">
              <label htmlFor="filename" className="block text-gray-300 mb-2">
                Filename
              </label>
              <div className="flex items-center">
                <input
                  id="filename"
                  type="text"
                  value={exportFilename}
                  onChange={(e) => setExportFilename(e.target.value)}
                  className="bg-gray-700 text-white p-2 rounded-l flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={exportFormat.extension}
                  onChange={(e) => {
                    const selectedFormat = EXPORT_FORMATS.find(
                      (format) => format.extension === e.target.value
                    );
                    if (selectedFormat) setExportFormat(selectedFormat);
                  }}
                  className="bg-gray-700 text-white p-2 rounded-r border-l border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {EXPORT_FORMATS.map((format) => (
                    <option key={format.extension} value={format.extension}>
                      .{format.extension}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                {exportFormat.label}
              </div>
            </div>

            {/* Dialog Buttons */}
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleExportCancel}
                className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleExportConfirm}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Container */}
      <div
        ref={viewportRef}
        className="flex-1 bg-gray-800 text-white overflow-hidden relative outline-none focus:outline-none focus:ring-0"
        style={{
          touchAction: "none",
          cursor: isPanning ? "grabbing" : "grab", // Always show grab cursor
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        tabIndex={0}
        aria-label="ASCII art canvas. Use arrow keys to pan, + and - to zoom, 0 to reset view."
        role="application"
      >
        {/* No image message */}
        {!image && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-gray-900 text-white p-4 rounded-lg shadow-lg max-w-xs text-center">
              <p className="">Upload an image to convert to ASCII art</p>
            </div>
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="bg-white text-black p-3 rounded-lg shadow-lg">
              <p className="text-lg ">Loading...</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg max-w-md">
              <h3 className="text-lg  mb-1">Error</h3>
              <p className="font-medium">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100 "
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Auto-centering canvas container */}
        <div className="absolute inset-0 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            style={{
              transform: `scale(${scale}) translate(${panOffset.x / scale}px, ${
                panOffset.y / scale
              }px)`,
              transformOrigin: "center center",
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default AsciiCanvas;
