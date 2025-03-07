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
  emoji: "🖤❤️🧡💛💚💙💜🤍",
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
  if (options.contrast !== 0 || options.brightness !== 0) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const factor =
      (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));

    for (let i = 0; i < data.length; i += 4) {
      // Apply contrast
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

      // Apply invert if needed
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
  outputCtx.font = `${CHAR_HEIGHT}px monospace`;
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
  initialSize = 150,
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const lastMousePos = useRef({ x: 0, y: 0 });
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

  // Reset view to original position and scale
  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
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

  // Debounced zoom handler for better performance
  const debouncedZoom = useCallback(
    debounce((newScale: number, cursorX: number, cursorY: number) => {
      setOffset((prev) => ({
        x: prev.x + (1 - newScale / scale) * cursorX,
        y: prev.y + (1 - newScale / scale) * cursorY,
      }));
      setScale(newScale);
    }, 5), // Reduced debounce time for more responsiveness
    [scale]
  );

  // Handle zoom with constraints - reduced sensitivity
  const handleZoom = useCallback(
    (delta: number, cursorX: number, cursorY: number) => {
      // Reduced multiplier from 0.05 to 0.02 for less aggressive zoom
      const newScale = Math.max(0.1, Math.min(5, scale - delta * 0.02));
      debouncedZoom(newScale, cursorX, cursorY);
    },
    [scale, debouncedZoom]
  );

  // Handle wheel event for zoom and pan
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (!containerRef.current || !canvasRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const canvasIntrinsicWidth = canvasRef.current.width;
      const canvasIntrinsicHeight = canvasRef.current.height;
      const centeredX = (containerRect.width - canvasIntrinsicWidth) / 2;
      const centeredY = (containerRect.height - canvasIntrinsicHeight) / 2;

      if (e.ctrlKey || e.metaKey) {
        // Zoom
        const localCursorX =
          e.clientX - containerRect.left - centeredX - offset.x;
        const localCursorY =
          e.clientY - containerRect.top - centeredY - offset.y;

        handleZoom(e.deltaY, localCursorX, localCursorY);
      } else {
        // Pan with boundaries
        const newOffsetX = offset.x - e.deltaX;
        const newOffsetY = offset.y - e.deltaY;

        // Calculate boundaries
        const maxPanX = canvasIntrinsicWidth * scale;
        const maxPanY = canvasIntrinsicHeight * scale;

        setOffset({
          x: Math.max(-maxPanX, Math.min(maxPanX, newOffsetX)),
          y: Math.max(-maxPanY, Math.min(maxPanY, newOffsetY)),
        });
      }
    },
    [offset, scale, handleZoom]
  );

  // Start panning on mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Handle panning movement on mouse move with boundaries
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning || !canvasRef.current) return;

      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;

      // Calculate boundaries
      const maxPanX = canvasRef.current.width * scale;
      const maxPanY = canvasRef.current.height * scale;

      setOffset((prev) => ({
        x: Math.max(-maxPanX, Math.min(maxPanX, prev.x + dx)),
        y: Math.max(-maxPanY, Math.min(maxPanY, prev.y + dy)),
      }));

      lastMousePos.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning, scale]
  );

  // End panning on mouse up
  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        !containerRef.current ||
        !containerRef.current.contains(document.activeElement)
      ) {
        return;
      }

      const PAN_STEP = 20;
      const ZOOM_STEP = 0.1;

      switch (e.key) {
        case "ArrowUp":
          setOffset((prev) => ({ ...prev, y: prev.y + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowDown":
          setOffset((prev) => ({ ...prev, y: prev.y - PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowLeft":
          setOffset((prev) => ({ ...prev, x: prev.x + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowRight":
          setOffset((prev) => ({ ...prev, x: prev.x - PAN_STEP }));
          e.preventDefault();
          break;
        case "+":
        case "=":
          setScale((prev) => Math.min(5, prev + ZOOM_STEP));
          e.preventDefault();
          break;
        case "-":
        case "_":
          setScale((prev) => Math.max(0.1, prev - ZOOM_STEP));
          e.preventDefault();
          break;
        case "0":
          resetView();
          e.preventDefault();
          break;
      }
    },
    [resetView]
  );

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevent native zoom on container wheel event
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleNativeWheel);
  }, []);

  // Handle touch events for mobile support
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        setIsPanning(true);
        lastMousePos.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    },
    []
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!isPanning || e.touches.length !== 1 || !canvasRef.current) return;

      const dx = e.touches[0].clientX - lastMousePos.current.x;
      const dy = e.touches[0].clientY - lastMousePos.current.y;

      // Calculate boundaries
      const maxPanX = canvasRef.current.width * scale;
      const maxPanY = canvasRef.current.height * scale;

      setOffset((prev) => ({
        x: Math.max(-maxPanX, Math.min(maxPanX, prev.x + dx)),
        y: Math.max(-maxPanY, Math.min(maxPanY, prev.y + dy)),
      }));

      lastMousePos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };

      e.preventDefault();
    },
    [isPanning, scale]
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

  // Toggle controls visibility
  const toggleControls = useCallback(() => {
    setControlsExpanded((prev) => !prev);
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Minimized Control Bar */}
      <div className="bg-gray-900 text-white p-2 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <button
            onClick={toggleControls}
            className="bg-gray-700 hover:bg-gray-600 p-1.5 rounded"
            aria-label={
              controlsExpanded ? "Collapse controls" : "Expand controls"
            }
          >
            {controlsExpanded ? "▲" : "▼"}
          </button>

          <div className="flex items-center">
            <button
              onClick={resetView}
              className="bg-gray-700 hover:bg-gray-600 p-1.5 rounded text-sm"
              title="Reset View"
            >
              Reset
            </button>
            <span className="mx-1.5 text-sm">{Math.round(scale * 100)}%</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportAsImage}
            className="bg-green-700 hover:bg-green-600 p-1.5 rounded text-xs sm:text-sm"
            title="Export as PNG"
          >
            PNG
          </button>
          <button
            onClick={exportAsText}
            className="bg-purple-700 hover:bg-purple-600 p-1.5 rounded text-xs sm:text-sm"
            title="Export as Text"
          >
            TXT
          </button>
        </div>
      </div>

      {/* Expanded Controls - Collapsible */}
      {controlsExpanded && (
        <div className="bg-gray-900 p-2 overflow-y-auto max-h-64 sm:max-h-48">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 text-sm">
            {/* Left section: Import/Export */}
            <div className="space-y-1">
              <div className="flex flex-col">
                <label
                  htmlFor="imageUpload"
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-700 cursor-pointer text-white rounded text-center text-xs"
                >
                  Upload Image
                </label>
                <input
                  id="imageUpload"
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>

              {/* Character Set */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs">Char Set:</label>
                <select
                  value={characterSet}
                  onChange={(e) =>
                    setCharacterSet(e.target.value as CharacterSet)
                  }
                  className="bg-gray-800 text-white rounded border border-gray-700 text-xs p-0.5 flex-1"
                >
                  {Object.keys(ASCII_PRESETS).map((preset) => (
                    <option key={preset} value={preset}>
                      {preset.charAt(0).toUpperCase() + preset.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Middle section: Image settings */}
            <div className="space-y-1">
              {/* Size Slider */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-12">Size:</label>
                <input
                  type="range"
                  min="50"
                  max="500"
                  step="5"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="flex-1 h-4"
                />
                <span className="text-gray-400 text-xs w-10">{size}</span>
              </div>

              {/* Use Color Toggle */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-12">Color:</label>
                <div
                  className={`relative inline-block w-8 h-4 ${
                    useColor ? "bg-blue-600" : "bg-gray-600"
                  } rounded-full transition-colors cursor-pointer`}
                  onClick={() => setUseColor(!useColor)}
                >
                  <span
                    className={`block w-3 h-3 mt-0.5 ${
                      useColor ? "ml-4" : "ml-1"
                    } bg-white rounded-full transition-transform`}
                  />
                </div>
              </div>
            </div>

            {/* Right section: Adjustments */}
            <div className="space-y-1">
              {/* Brightness */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-14">Bright:</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={renderOptions.brightness}
                  onChange={(e) =>
                    handleBrightnessChange(parseInt(e.target.value))
                  }
                  className="flex-1 h-4"
                  aria-label="Adjust brightness"
                />
                <span className="text-gray-400 text-xs w-8">
                  {renderOptions.brightness}
                </span>
              </div>

              {/* Contrast */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-14">Contrast:</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={renderOptions.contrast}
                  onChange={(e) =>
                    handleContrastChange(parseInt(e.target.value))
                  }
                  className="flex-1 h-4"
                  aria-label="Adjust contrast"
                />
                <span className="text-gray-400 text-xs w-8">
                  {renderOptions.contrast}
                </span>
              </div>

              {/* Invert */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-14">Invert:</label>
                <input
                  type="checkbox"
                  checked={renderOptions.invert}
                  onChange={toggleInvert}
                  className="h-3 w-3"
                  aria-label="Invert colors"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Container */}
      <div
        ref={containerRef}
        className="flex-1 bg-gray-800 text-white overflow-hidden relative"
        style={{
          touchAction: "none",
          cursor: isPanning ? "grabbing" : "grab",
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
              <p className="mb-4">Upload an image to convert to ASCII art</p>
              <label
                htmlFor="initialImageUpload"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded cursor-pointer"
              >
                Select Image
              </label>
              <input
                id="initialImageUpload"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
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
              <h3 className="text-lg font-bold mb-1">Error</h3>
              <p>{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 px-3 py-1 bg-white text-red-600 rounded hover:bg-gray-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Canvas with centered positioning */}
        <div className="absolute inset-0 flex items-center justify-center">
          <canvas
            ref={canvasRef}
            style={{
              transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
              transformOrigin: "center",
            }}
          />
        </div>

        {/* Zoom controls overlay */}
        <div className="absolute bottom-14 right-3 flex flex-col bg-black bg-opacity-70 rounded">
          <button
            onClick={() => handleZoom(-5, 0, 0)}
            className="text-white p-1.5 text-lg font-bold hover:bg-gray-700 rounded-t"
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => handleZoom(5, 0, 0)}
            className="text-white p-1.5 text-lg font-bold hover:bg-gray-700 rounded-b"
            aria-label="Zoom out"
          >
            −
          </button>
        </div>

        {/* Keyboard instructions */}
        <div className="absolute bottom-3 right-3 bg-black bg-opacity-70 text-white p-1.5 rounded text-xs">
          <p>Drag: Pan | +/-: Zoom | 0: Reset</p>
        </div>
      </div>
    </div>
  );
};

export default AsciiCanvas;
