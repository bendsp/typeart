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

// Define color filter types
type ColorFilter =
  | "original" // Original image colors
  | "vintage" // Sepia-toned old photograph look
  | "monochrome" // Black and white
  | "inverted" // Inverted colors
  | "pastel" // Soft pastel colors
  | "matrix" // Green on black Matrix style
  | "hell" // Hell style (fiery reds and oranges)
  | "blueprint" // Technical drawing blue and white
  | "@basedanarki vision (heat)" // Heat map visualization style
  | "rainbow" // Old neon effect with rainbow colors
  | "glitch" // Digital glitch effect
  | "cyberpunk" // Two-tone cyberpunk gradient
  | "retrowave"; // Bold retro color scheme

// Define background color type
type BackgroundColor = "black" | "white" | "custom";

interface AsciiCanvasProps {
  initialImage?: string | null;
  initialSize?: number;
  initialColorFilter?: ColorFilter;
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

// Utility function to convert HSL to RGB
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (h >= 0 && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (h >= 60 && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (h >= 180 && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (h >= 240 && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (h >= 300 && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

// Convert image to ASCII art and render on the canvas
const drawAscii = (
  image: HTMLImageElement,
  size: number,
  colorFilter: ColorFilter,
  characterSet: string,
  outputCanvas: HTMLCanvasElement,
  options: AsciiRenderOptions = { brightness: 0, contrast: 0, invert: false },
  backgroundColor: BackgroundColor | string = "black" // Allow string to accept custom colors
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

  // Set canvas background based on backgroundColor
  outputCtx.fillStyle = backgroundColor; // This will work with both named colors and hex values
  outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

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

      // Apply color filter
      switch (colorFilter) {
        case "original":
          // Original colors from image
          outputCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          break;
        case "monochrome":
          // Black and white
          const gray = Math.round(brightness);
          outputCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
          break;
        case "vintage":
          // Vintage sepia tone
          const sepiaR = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
          const sepiaG = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
          const sepiaB = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
          outputCtx.fillStyle = `rgb(${sepiaR}, ${sepiaG}, ${sepiaB})`;
          break;
        case "inverted":
          // Inverted colors
          outputCtx.fillStyle = `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
          break;
        case "matrix":
          // Matrix green (brighter for brighter pixels)
          const intensity = Math.round(brightness);
          outputCtx.fillStyle = `rgb(0, ${Math.min(255, intensity * 1.5)}, 0)`;
          break;
        case "hell":
          // Hell style (fiery reds and oranges)
          const hellBrightness = brightness / 255;
          if (hellBrightness > 0.7) {
            // Bright areas: yellow to white
            outputCtx.fillStyle = `rgb(255, ${Math.round(
              200 + hellBrightness * 55
            )}, ${Math.round(50 + hellBrightness * 50)})`;
          } else if (hellBrightness > 0.4) {
            // Mid tones: orange to yellow
            outputCtx.fillStyle = `rgb(255, ${Math.round(
              50 + hellBrightness * 150
            )}, 0)`;
          } else {
            // Dark areas: deep red to orange
            outputCtx.fillStyle = `rgb(${Math.round(
              120 + hellBrightness * 135
            )}, ${Math.round(hellBrightness * 50)}, 0)`;
          }
          break;
        case "blueprint":
          // Blueprint technical drawing style
          const bpBrightness = brightness / 255;
          const bpValue = Math.round(210 + bpBrightness * 45); // Bright lines on blue background
          outputCtx.fillStyle = `rgb(${bpValue * bpBrightness}, ${
            bpValue * bpBrightness
          }, ${100 + bpBrightness * 155})`;
          break;
        case "@basedanarki vision (heat)":
          // Adjusted Thermal imaging heat map
          const heatLevel = brightness / 255;
          if (heatLevel > 0.75) {
            // Hottest: white to yellow
            outputCtx.fillStyle = `rgb(255, 255, ${Math.round(
              heatLevel * 255
            )})`;
          } else if (heatLevel > 0.5) {
            // Hot: yellow to red
            outputCtx.fillStyle = `rgb(255, ${
              Math.round(heatLevel * 510) - 255
            }, 0)`;
          } else if (heatLevel > 0.25) {
            // Warm: red to purple
            outputCtx.fillStyle = `rgb(${
              Math.round(heatLevel * 510) - 127
            }, 0, ${Math.round((1 - heatLevel) * 255)})`;
          } else {
            // Cool: purple to blue/black
            outputCtx.fillStyle = `rgb(0, 0, ${
              Math.round(heatLevel * 510) - 127
            })`;
          }
          break;
        case "rainbow":
          // Old neon effect with full rainbow variation
          const rainbowIntensity = brightness / 255;
          const hue = (x / width) * 360; // Full hue range
          const [rainbowR, rainbowG, rainbowB] = hslToRgb(
            hue,
            1,
            rainbowIntensity
          );
          outputCtx.fillStyle = `rgb(${rainbowR}, ${rainbowG}, ${rainbowB})`;
          break;
        case "glitch":
          // Enhanced Digital glitch effect - more distortion, less noise
          let glitchR = r;
          let glitchG = g;
          let glitchB = b;

          // Stronger channel shifting
          const shiftAmount = 70; // Increased from 50

          // Horizontal line distortion - offset pixels horizontally
          const horizontalOffset = Math.floor(Math.random() * 7) - 3; // -3 to +3 pixel shift
          if (horizontalOffset !== 0 && Math.random() > 0.7) {
            // Get color from offset position when possible
            const offsetX = Math.max(
              0,
              Math.min(width - 1, x + horizontalOffset)
            );
            const offsetIdx = (y * width + offsetX) * 4;
            glitchR = imageData[offsetIdx];
            glitchG = imageData[offsetIdx + 1];
            glitchB = imageData[offsetIdx + 2];
          }

          // Channel shifting with more extreme values
          if (Math.random() > 0.6) {
            glitchR = Math.max(
              0,
              Math.min(255, glitchR + (Math.random() * 2 - 1) * shiftAmount)
            );
          }
          if (Math.random() > 0.6) {
            glitchG = Math.max(
              0,
              Math.min(255, glitchG + (Math.random() * 2 - 1) * shiftAmount)
            );
          }
          if (Math.random() > 0.6) {
            glitchB = Math.max(
              0,
              Math.min(255, glitchB + (Math.random() * 2 - 1) * shiftAmount)
            );
          }

          // Channel bleeding - one channel leaks into others
          if (Math.random() > 0.85) {
            const dominantChannel = Math.floor(Math.random() * 3);
            if (dominantChannel === 0) {
              glitchG = Math.max(0, Math.min(255, glitchR * 0.7));
              glitchB = Math.max(0, Math.min(255, glitchR * 0.3));
            } else if (dominantChannel === 1) {
              glitchR = Math.max(0, Math.min(255, glitchG * 0.3));
              glitchB = Math.max(0, Math.min(255, glitchG * 0.7));
            } else {
              glitchR = Math.max(0, Math.min(255, glitchB * 0.5));
              glitchG = Math.max(0, Math.min(255, glitchB * 0.5));
            }
          }

          // Occasional color channel swapping (less frequent)
          if (Math.random() > 0.92) {
            [glitchR, glitchG, glitchB] = [glitchB, glitchR, glitchG];
          }

          // Complete signal loss (black/white) - reduced frequency
          if (Math.random() > 0.97) {
            const lossVal = Math.random() > 0.5 ? 255 : 0;
            glitchR = glitchG = glitchB = lossVal;
          }

          outputCtx.fillStyle = `rgb(${glitchR}, ${glitchG}, ${glitchB})`;
          break;
        case "pastel":
          // Soft pastel colors
          const pastelR = Math.round(r * 0.7 + 77);
          const pastelG = Math.round(g * 0.7 + 77);
          const pastelB = Math.round(b * 0.7 + 77);
          outputCtx.fillStyle = `rgb(${pastelR}, ${pastelG}, ${pastelB})`;
          break;
        case "cyberpunk":
          // Cyberpunk gradient based on brightness (renamed from duotone)
          const cyberpunkFactor = brightness / 255;
          // Primary color (highlights): Teal (#00C2BA)
          const primaryR = 0;
          const primaryG = 194;
          const primaryB = 186;
          // Secondary color (shadows): Deep Purple (#2A0057)
          const secondaryR = 42;
          const secondaryG = 0;
          const secondaryB = 87;

          // Mix the two colors based on brightness
          const cyberpunkR = Math.round(
            secondaryR + (primaryR - secondaryR) * cyberpunkFactor
          );
          const cyberpunkG = Math.round(
            secondaryG + (primaryG - secondaryG) * cyberpunkFactor
          );
          const cyberpunkB = Math.round(
            secondaryB + (primaryB - secondaryB) * cyberpunkFactor
          );

          outputCtx.fillStyle = `rgb(${cyberpunkR}, ${cyberpunkG}, ${cyberpunkB})`;
          break;
        case "retrowave":
          // Retrowave color scheme
          const retrowaveFactor = brightness / 255;
          let retroR, retroG, retroB;

          if (retrowaveFactor > 0.8) {
            // Highlights: Bright cyan
            retroR = 80;
            retroG = 235;
            retroB = 255;
          } else if (retrowaveFactor > 0.5) {
            // Mid-tones: Purple/Pink
            retroR = 220;
            retroG = 50;
            retroB = 220;
          } else if (retrowaveFactor > 0.2) {
            // Shadow mid-tones: Deep blue
            retroR = 30;
            retroG = 20;
            retroB = 180;
          } else {
            // Deep shadows: Almost black with hint of purple
            retroR = 10;
            retroG = 5;
            retroB = 40;
          }

          outputCtx.fillStyle = `rgb(${retroR}, ${retroG}, ${retroB})`;
          break;
      }

      outputCtx.fillText(char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
    }
  }

  // Add CRT pattern effect
  const applyCRTPattern = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number
  ) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        if (x % 2 === 0) {
          data[idx] *= 0.9; // Slightly dim every other pixel for CRT effect
          data[idx + 1] *= 0.9;
          data[idx + 2] *= 0.9;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  // Apply CRT pattern after drawing
  applyCRTPattern(outputCtx, width * CHAR_WIDTH, height * CHAR_HEIGHT);

  // Clean up
  tempCanvas.remove();
};

// AsciiCanvas component renders ASCII art from an image and supports zoom & pan
const AsciiCanvas: React.FC<AsciiCanvasProps> = ({
  initialImage = null,
  initialSize = 200,
  initialColorFilter = "original",
  initialCharacterSet = "default",
  onError,
}) => {
  // Internal state management - no need for external setters
  const [image, setImage] = useState<string | null>(initialImage);
  const [size, setSize] = useState(initialSize);
  const [colorFilter, setColorFilter] =
    useState<ColorFilter>(initialColorFilter);
  const [characterSet, setCharacterSet] =
    useState<CharacterSet>(initialCharacterSet);
  const [backgroundColor, setBackgroundColor] =
    useState<BackgroundColor>("black");
  const [customBgColor, setCustomBgColor] = useState<string>("#333333");
  const [bgModalOpen, setBgModalOpen] = useState(false);

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

  // Get the actual background color value based on the selected type
  const getBackgroundColorValue = useCallback(
    (bgType: BackgroundColor): string => {
      switch (bgType) {
        case "custom":
          return customBgColor;
        default:
          return bgType;
      }
    },
    [customBgColor]
  );

  // Export the ASCII art as an image with the selected size and filename
  const exportAsImage = useCallback(
    async (sizeScale: number, filename: string, format: ExportFormat) => {
      if (!canvasRef.current) return;

      try {
        const originalCanvas = canvasRef.current;
        const originalWidth = originalCanvas.width;
        const originalHeight = originalCanvas.height;

        // Calculate export dimensions, preserving aspect ratio
        const exportWidth = originalWidth * sizeScale;
        const exportHeight = originalHeight * sizeScale;

        // Create a new canvas for the export
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;

        // Get context and set background
        const exportCtx = exportCanvas.getContext("2d");
        if (!exportCtx) return;

        // Get the actual background color for both named and custom colors
        const actualColor =
          backgroundColor === "custom" ? customBgColor : backgroundColor;
        exportCtx.fillStyle = actualColor;
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
    [onError, backgroundColor, customBgColor]
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

    // Pass the actual color value, not just the type
    const actualBackgroundColor =
      backgroundColor === "custom" ? customBgColor : backgroundColor;

    drawAscii(
      imageRef.current,
      size,
      colorFilter,
      asciiChars,
      canvasRef.current,
      renderOptions,
      actualBackgroundColor
    );
  }, [
    size,
    colorFilter,
    asciiChars,
    renderOptions,
    backgroundColor,
    customBgColor,
  ]);

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

  // Add temporary states for sliders
  const [tempSize, setTempSize] = useState(initialSize);
  const [tempBrightness, setTempBrightness] = useState(0);
  const [tempContrast, setTempContrast] = useState(0);

  // Debounced update functions
  const debouncedUpdateSize = useMemo(
    () => debounce((value: number) => setSize(value), 150),
    []
  );

  const debouncedUpdateRenderOptions = useMemo(
    () =>
      debounce((options: Partial<AsciiRenderOptions>) => {
        setRenderOptions((prev) => ({
          ...prev,
          ...options,
        }));
      }, 150),
    []
  );

  // Handle slider changes
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setTempSize(value);
    debouncedUpdateSize(value);
  };

  const handleBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTempBrightness(value);
    debouncedUpdateRenderOptions({ brightness: value });
  };

  const handleContrastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTempContrast(value);
    debouncedUpdateRenderOptions({ contrast: value });
  };

  // Update temp states when actual values change
  useEffect(() => {
    setTempSize(size);
  }, [size]);

  useEffect(() => {
    setTempBrightness(renderOptions.brightness);
    setTempContrast(renderOptions.contrast);
  }, [renderOptions.brightness, renderOptions.contrast]);

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

  // Redraw canvas on background color change
  useEffect(() => {
    if (imageRef.current && canvasRef.current && !loading) {
      renderAsciiArt();
    }
  }, [backgroundColor, customBgColor, renderAsciiArt, loading]);

  // Background color modal component with improved UI
  const BackgroundColorModal = () => {
    if (!bgModalOpen) return null;

    // Local state for color picker to prevent immediate updates while selecting
    const [tempCustomColor, setTempCustomColor] = useState(customBgColor);

    const applyCustomColor = () => {
      setCustomBgColor(tempCustomColor);
      setBackgroundColor("custom");
      setBgModalOpen(false);
    };

    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
        onClick={() => setBgModalOpen(false)}
      >
        <div
          className="bg-gray-800 rounded-lg p-5 shadow-lg max-w-sm w-full text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-medium mb-4">Background Color</h3>
          <div className="space-y-3">
            {/* Standard color options */}
            <div className="flex space-x-3 mb-4">
              <button
                className={`flex-1 py-2 px-3 rounded-md flex items-center justify-center ${
                  backgroundColor === "black"
                    ? "bg-blue-600 ring-2 ring-blue-400"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                onClick={() => {
                  setBackgroundColor("black");
                  setBgModalOpen(false);
                }}
              >
                <div className="w-4 h-4 bg-black border border-gray-500 rounded-full mr-2"></div>
                <span>Black</span>
              </button>

              <button
                className={`flex-1 py-2 px-3 rounded-md flex items-center justify-center ${
                  backgroundColor === "white"
                    ? "bg-blue-600 ring-2 ring-blue-400"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                onClick={() => {
                  setBackgroundColor("white");
                  setBgModalOpen(false);
                }}
              >
                <div className="w-4 h-4 bg-white border border-gray-500 rounded-full mr-2"></div>
                <span>White</span>
              </button>
            </div>

            {/* Custom color section */}
            <div
              className={`p-4 rounded-md ${
                backgroundColor === "custom"
                  ? "bg-gray-700 ring-2 ring-blue-500"
                  : "bg-gray-700"
              }`}
            >
              <div className="flex items-center mb-3">
                <div
                  className="w-8 h-8 rounded-full border-2 border-white mr-3"
                  style={{ backgroundColor: tempCustomColor }}
                ></div>
                <span className="font-medium">Custom Color</span>
              </div>

              <div className="bg-gray-900 p-3 rounded-md">
                <input
                  type="color"
                  value={tempCustomColor}
                  onChange={(e) => setTempCustomColor(e.target.value)}
                  className="w-full h-10 cursor-pointer rounded mb-3"
                />
                <div className="text-xs text-gray-400 mb-1">
                  Hex: {tempCustomColor}
                </div>
                <button
                  onClick={applyCustomColor}
                  className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white py-2 px-3 rounded-md font-medium transition-colors"
                >
                  Apply Custom Color
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button
              className="bg-gray-700 hover:bg-gray-600 text-white py-1.5 px-3 rounded"
              onClick={() => setBgModalOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

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

              {/* Color Filter Dropdown - Updated with removed options */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Filter:</label>
                <select
                  value={colorFilter}
                  onChange={(e) =>
                    setColorFilter(e.target.value as ColorFilter)
                  }
                  className="bg-gray-800 text-white rounded border border-gray-700 text-xs p-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="original">Original</option>
                  <option value="monochrome">Black & White</option>
                  <option value="vintage">Vintage</option>
                  <option value="inverted">Inverted</option>
                  <option value="pastel">Pastel</option>
                  <option value="matrix">Matrix</option>
                  <option value="cyberpunk">Cyberpunk</option>
                  <option value="hell">Hell</option>
                  <option value="blueprint">Blueprint</option>
                  <option value="retrowave">Retrowave</option>
                  <option value="@basedanarki vision (heat)">
                    @basedanarki vision (heat)
                  </option>
                  <option value="rainbow">Rainbow</option>
                  <option value="glitch">Glitch</option>
                </select>
              </div>
            </div>

            {/* Right section: All sliders grouped */}
            <div className="space-y-2">
              {/* Size Slider - updated to use temp state */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Size:</label>
                <input
                  type="range"
                  min="100"
                  max="500"
                  step="5"
                  value={tempSize}
                  onChange={handleSizeChange}
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                />
                <span className="text-gray-400 text-xs w-10">{tempSize}</span>
              </div>

              {/* Brightness - updated to use temp state */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">
                  Brightness:
                </label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={tempBrightness}
                  onChange={handleBrightnessChange}
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                  aria-label="Adjust brightness"
                />
                <span className="text-gray-400 text-xs w-10">
                  {tempBrightness}
                </span>
              </div>

              {/* Contrast - updated to use temp state */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Contrast:</label>
                <input
                  type="range"
                  min="-100"
                  max="100"
                  value={tempContrast}
                  onChange={handleContrastChange}
                  onMouseUp={returnFocusToCanvas}
                  onTouchEnd={returnFocusToCanvas}
                  className="flex-1 h-4"
                  aria-label="Adjust contrast"
                />
                <span className="text-gray-400 text-xs w-10">
                  {tempContrast}
                </span>
              </div>
            </div>

            {/* Background color button - updated design */}
            <div className="flex items-center space-x-1">
              <label className="text-gray-400 text-xs w-16">Background:</label>
              <button
                onClick={() => setBgModalOpen(true)}
                className="flex-1 p-1.5 bg-gray-800 hover:bg-gray-700 text-white rounded border border-gray-700 text-xs flex items-center justify-between transition-colors"
              >
                <span>
                  {backgroundColor === "custom"
                    ? "Custom"
                    : backgroundColor.charAt(0).toUpperCase() +
                      backgroundColor.slice(1)}
                </span>
                <div
                  className="w-4 h-4 rounded-full border border-gray-500"
                  style={
                    backgroundColor === "custom"
                      ? { backgroundColor: customBgColor }
                      : { backgroundColor }
                  }
                ></div>
              </button>
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

      {/* Background color modal */}
      <BackgroundColorModal />

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
