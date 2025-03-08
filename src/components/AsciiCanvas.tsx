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

const CHAR_WIDTH = 6;
const CHAR_HEIGHT = 12;
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
  const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
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
  outputCanvas.width = width * CHAR_WIDTH;
  outputCanvas.height = height * CHAR_HEIGHT;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) return;

  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
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

  const [scale, setScale] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [canPan, setCanPan] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const lastPanPosition = useRef({ x: 0, y: 0 });

  const [renderOptions, setRenderOptions] = useState<AsciiRenderOptions>({
    brightness: 0,
    contrast: 0,
    invert: false,
  });

  // Get the selected character set
  const asciiChars = useMemo(
    () => ASCII_PRESETS[characterSet] || DEFAULT_ASCII_CHARS,
    [characterSet]
  );

  // Add a ref for the main container to manage focus
  const mainContainerRef = useRef<HTMLDivElement | null>(null);

  // Check if canvas is larger than viewport and calculate canPan without directly setting state
  const checkCanPan = useCallback(() => {
    if (!canvasRef.current || !viewportRef.current) return false;

    const canvas = canvasRef.current;
    const viewport = viewportRef.current;

    // Calculate if the scaled canvas is larger than the viewport
    const scaledWidth = canvas.width * scale;
    const scaledHeight = canvas.height * scale;
    const viewportWidth = viewport.clientWidth;
    const viewportHeight = viewport.clientHeight;

    return scaledWidth > viewportWidth || scaledHeight > viewportHeight;
  }, [scale]);

  // Reset view to original position and scale
  const resetView = useCallback(() => {
    setScale(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

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

  // Export the ASCII art as an image
  const exportAsImage = useCallback(() => {
    if (!canvasRef.current) return;

    try {
      const link = document.createElement("a");
      link.download = "ascii-art.png";
      link.href = canvasRef.current.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Failed to export image:", err);
      if (onError && err instanceof Error) {
        onError(err);
      }
    }
  }, [onError]);

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

  // Calculate constrained pan values without directly setting state
  const getConstrainedPan = useCallback(
    (panX: number, panY: number) => {
      if (!canvasRef.current || !viewportRef.current || !canPan) {
        return { x: panX, y: panY };
      }

      const canvas = canvasRef.current;
      const viewport = viewportRef.current;

      const scaledWidth = canvas.width * scale;
      const scaledHeight = canvas.height * scale;
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;

      // Calculate maximum allowed pan in each direction
      // This keeps at least 20% of the canvas visible
      const maxPanX = (scaledWidth - viewportWidth) / 2 + scaledWidth * 0.2;
      const maxPanY = (scaledHeight - viewportHeight) / 2 + scaledHeight * 0.2;

      return {
        x: Math.max(-maxPanX, Math.min(maxPanX, panX)),
        y: Math.max(-maxPanY, Math.min(maxPanY, panY)),
      };
    },
    [canPan, scale]
  );

  // Combined effect to update canPan and constrain offsets when needed
  useEffect(() => {
    // Skip if refs aren't ready yet
    if (!canvasRef.current || !viewportRef.current) return;

    // Check if we can pan
    const shouldCanPan = checkCanPan();

    // Only update if there's a change to avoid re-render loops
    if (shouldCanPan !== canPan) {
      setCanPan(shouldCanPan);
    }

    // If we can't pan, reset offset to center
    if (!shouldCanPan && (panOffset.x !== 0 || panOffset.y !== 0)) {
      setPanOffset({ x: 0, y: 0 });
    }
    // If we can pan, ensure we're within constraints
    else if (shouldCanPan) {
      const constrained = getConstrainedPan(panOffset.x, panOffset.y);
      if (constrained.x !== panOffset.x || constrained.y !== panOffset.y) {
        setPanOffset(constrained);
      }
    }
  }, [scale, panOffset, canPan, checkCanPan, getConstrainedPan]);

  // Simple zoom functionality - now with fixed 10 percentage point change
  const handleZoom = useCallback(
    (zoomIn: boolean) => {
      // Change by exactly 10 percentage points (0.1 absolute change)
      const zoomChange = zoomIn ? 0.1 : -0.1;
      const newScale = Math.max(0.1, Math.min(5, scale + zoomChange));

      // Only update scale - the effect above will handle recalculating canPan
      setScale(newScale);
    },
    [scale]
  );

  // Handle wheel event for zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom based on direction
        handleZoom(e.deltaY < 0);
      } else if (canPan) {
        // Only pan if we're allowed to
        const newPanOffset = {
          x: panOffset.x - e.deltaX,
          y: panOffset.y - e.deltaY,
        };

        // Apply constraints
        const constrained = getConstrainedPan(newPanOffset.x, newPanOffset.y);
        setPanOffset(constrained);
      }
    },
    [handleZoom, canPan, panOffset, getConstrainedPan]
  );

  // Start panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!canPan) return;
      setIsPanning(true);
      lastPanPosition.current = { x: e.clientX, y: e.clientY };
    },
    [canPan]
  );

  // Handle panning movement
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning || !canPan) return;

      const dx = e.clientX - lastPanPosition.current.x;
      const dy = e.clientY - lastPanPosition.current.y;

      const newPanOffset = {
        x: panOffset.x + dx,
        y: panOffset.y + dy,
      };

      // Apply constraints
      const constrained = getConstrainedPan(newPanOffset.x, newPanOffset.y);
      setPanOffset(constrained);

      lastPanPosition.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning, canPan, panOffset, getConstrainedPan]
  );

  // End panning
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handle keyboard navigation
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
          if (canPan) {
            const newY = panOffset.y + PAN_STEP;
            const constrained = getConstrainedPan(panOffset.x, newY);
            setPanOffset(constrained);
          }
          e.preventDefault();
          break;
        case "ArrowDown":
          if (canPan) {
            const newY = panOffset.y - PAN_STEP;
            const constrained = getConstrainedPan(panOffset.x, newY);
            setPanOffset(constrained);
          }
          e.preventDefault();
          break;
        case "ArrowLeft":
          if (canPan) {
            const newX = panOffset.x + PAN_STEP;
            const constrained = getConstrainedPan(newX, panOffset.y);
            setPanOffset(constrained);
          }
          e.preventDefault();
          break;
        case "ArrowRight":
          if (canPan) {
            const newX = panOffset.x - PAN_STEP;
            const constrained = getConstrainedPan(newX, panOffset.y);
            setPanOffset(constrained);
          }
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
    [resetView, handleZoom, canPan, panOffset, getConstrainedPan]
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

  // Handle touch events for mobile support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!canPan) return;
      if (e.touches.length === 1) {
        setIsPanning(true);
        lastPanPosition.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    },
    [canPan]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPanning || !canPan || e.touches.length !== 1) return;

      const dx = e.touches[0].clientX - lastPanPosition.current.x;
      const dy = e.touches[0].clientY - lastPanPosition.current.y;

      const newPanOffset = {
        x: panOffset.x + dx,
        y: panOffset.y + dy,
      };

      // Apply constraints
      const constrained = getConstrainedPan(newPanOffset.x, newPanOffset.y);
      setPanOffset(constrained);

      lastPanPosition.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };

      e.preventDefault();
    },
    [isPanning, canPan, panOffset, getConstrainedPan]
  );

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
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
                {Math.round(scale * 100)}%
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
                  onClick={handleControlClick(exportAsImage)}
                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs flex-1"
                  title="Export as PNG"
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

      {/* Main Canvas Container */}
      <div
        ref={viewportRef}
        className="flex-1 bg-gray-800 text-white overflow-hidden relative outline-none focus:outline-none focus:ring-0"
        style={{
          touchAction: "none",
          cursor:
            canPan && isPanning ? "grabbing" : canPan ? "grab" : "default",
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
        aria-label="ASCII art canvas. Use arrow keys to pan when zoomed in, + and - to zoom, 0 to reset view."
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
              <p className="text-lg">Loading...</p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="bg-red-600 text-white p-4 rounded-lg shadow-lg max-w-md">
              <h3 className="text-lg mb-1">Error</h3>
              <p className="font-medium">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100"
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

        {/* Attribution box */}
        <div className="absolute bottom-3 left-3 bg-black bg-opacity-70 text-white p-1.5 rounded text-xs">
          <a
            href="https://github.com/bendsp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white hover:text-blue-300 transition-colors flex items-center"
          >
            <span>Ben Desprets </span>
            <svg
              className="ml-1 w-3 h-3"
              fill="currentColor"
              viewBox="0 0 16 16"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </div>

        {/* Keyboard instructions */}
        <div className="absolute bottom-3 right-3 bg-black bg-opacity-70 text-white p-1.5 rounded text-xs">
          <p>+/-: Zoom | 0: Reset {canPan && "| Drag: Pan"}</p>
        </div>
      </div>
    </div>
  );
};

export default AsciiCanvas;
