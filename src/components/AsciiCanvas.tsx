"use client";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// A custom debounce implementation that delays function execution until after a specified wait time
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

// Alternative character sets with simpler names
const ASCII_PRESETS = {
  default: DEFAULT_ASCII_CHARS,
  simple: "@%#*+=-:. ",
  blocks: "█▓▒░ ",
};

type CharacterSet = keyof typeof ASCII_PRESETS;

// Add rendering mode type
type RenderMode = "ascii" | "emoji";

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

// Emoji mapping for different colors and brightness levels
interface EmojiMap {
  [key: string]: string[];
}

// Emoji categories by color and brightness (from dark to light)
const EMOJI_MAP: EmojiMap = {
  // Red emojis from dark to light
  red: ["🩸", "🍷", "🧣", "🚨", "🎈", "❤️", "🍎", "🍓", "🔴", "🔺"],

  // Green emojis from dark to light
  green: ["🫑", "🦖", "🎄", "🥦", "🫛", "🍀", "🥒", "🥝", "✅", "🟢"],

  // Blue emojis from dark to light
  blue: ["🦕", "🌀", "🧢", "🌊", "📘", "🦋", "🫐", "🔵", "💎", "🧊"],

  // Yellow emojis from dark to light
  yellow: ["🌙", "🐝", "🍯", "🌻", "⚠️", "🍌", "🌞", "⭐", "🔆", "🟡"],

  // Orange/brown emojis from dark to light
  orange: ["🦊", "🏀", "🍊", "🦁", "🍁", "🚧", "🌅", "🔶", "🟠", "☀️"],

  // Purple/pink emojis from dark to light
  purple: ["🍆", "🪻", "🔮", "📿", "🎭", "☂️", "👾", "🟣", "💜", "🪄"],

  // Gray scale from dark to light
  gray: ["🖤", "🌑", "🕶️", "🏴", "🐺", "🐘", "🪨", "⚙️", "🩶", "⚪"],
};

// Determines the closest matching emoji based on pixel color and brightness values
function findClosestColorEmoji(
  r: number,
  g: number,
  b: number,
  brightness: number
): string {
  const max = Math.max(r, g, b);
  let dominantColor: string;
  const threshold = 30;

  const brightnessIndex = Math.min(9, Math.floor(brightness / 25.5));

  if (r > 220 && g > 220 && b > 220) {
    return EMOJI_MAP.gray[9];
  }

  if (max < 30) {
    return EMOJI_MAP.gray[0];
  }

  if (
    Math.abs(r - g) < threshold &&
    Math.abs(r - b) < threshold &&
    Math.abs(g - b) < threshold
  ) {
    dominantColor = "gray";
  } else if (r > 180 && g > 180 && b < r - threshold && b < g - threshold) {
    dominantColor = "yellow";
  } else if (r === max && r > g + threshold && r > b + threshold) {
    dominantColor = "red";
  } else if (g === max && g > r + threshold && g > b + threshold) {
    dominantColor = "green";
  } else if (b === max && b > r + threshold && b > g + threshold) {
    dominantColor = "blue";
  } else if (r === max && g > r - threshold && g > b + threshold) {
    dominantColor = "orange";
  } else if (r === max && b === max && r > g + threshold) {
    dominantColor = "purple";
  } else {
    if (r === max) {
      if (g > b) dominantColor = "orange";
      else dominantColor = "purple";
    } else if (g === max) {
      if (r > b) dominantColor = "yellow";
      else dominantColor = "green";
    } else {
      dominantColor = "blue";
    }
  }

  return EMOJI_MAP[dominantColor][brightnessIndex];
}

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

// Converts HSL color values to RGB color space
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

// Renders an image as ASCII art or emoji art with various filters and effects
const drawAscii = (
  image: HTMLImageElement,
  size: number,
  colorFilter: ColorFilter,
  characterSet: string,
  outputCanvas: HTMLCanvasElement,
  options: AsciiRenderOptions = { brightness: 0, contrast: 0, invert: false },
  backgroundColor: BackgroundColor | string = "black",
  renderMode: RenderMode = "ascii"
) => {
  const aspectRatio = image.width / image.height;
  const emojiAspectRatio = 1.0;
  const effectiveAspectRatio =
    renderMode === "emoji" ? emojiAspectRatio : CHAR_ASPECT_RATIO;

  const width = size;
  const height = Math.floor((size / aspectRatio) * effectiveAspectRatio);

  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;

  tempCanvas.width = width;
  tempCanvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);

  if (options.contrast !== 0 || options.brightness !== 0 || options.invert) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const factor =
      (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));

    for (let i = 0; i < data.length; i += 4) {
      if (options.contrast !== 0 || options.brightness !== 0) {
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

      if (options.invert) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  const imageData = ctx.getImageData(0, 0, width, height).data;

  const cellWidth = renderMode === "emoji" ? 32 : CHAR_WIDTH;
  const cellHeight = renderMode === "emoji" ? 32 : CHAR_HEIGHT;

  outputCanvas.width = width * cellWidth;
  outputCanvas.height = height * cellHeight;

  const outputCtx = outputCanvas.getContext("2d", {
    alpha: false,
  }) as CanvasRenderingContext2D;

  if (!outputCtx) return;

  outputCtx.imageSmoothingEnabled = false;
  outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);

  outputCtx.fillStyle = backgroundColor;
  outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  if (renderMode === "emoji") {
    outputCtx.font = `${cellHeight - 2}px Arial`;
    outputCtx.textBaseline = "middle";
    outputCtx.textAlign = "center";
  } else {
    outputCtx.font = `bold ${cellHeight}px monospace`;
    outputCtx.textBaseline = "top";
    outputCtx.textAlign = "start";
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = imageData[idx],
        g = imageData[idx + 1],
        b = imageData[idx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      if (renderMode === "emoji") {
        let emoji: string;

        switch (colorFilter) {
          case "monochrome":
            const grayIndex = Math.min(9, Math.floor(brightness / 25.5));
            emoji = EMOJI_MAP.gray[grayIndex];
            break;

          case "inverted":
            const invertedBrightness = 255 - brightness;
            emoji = findClosestColorEmoji(
              255 - r,
              255 - g,
              255 - b,
              invertedBrightness
            );
            break;

          case "vintage":
            const sepiaR = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            const sepiaG = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            const sepiaB = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
            emoji = findClosestColorEmoji(
              sepiaR,
              sepiaG,
              sepiaB,
              0.299 * sepiaR + 0.587 * sepiaG + 0.114 * sepiaB
            );
            break;

          case "pastel":
            const pastelR = Math.min(255, r + (255 - r) * 0.5);
            const pastelG = Math.min(255, g + (255 - g) * 0.5);
            const pastelB = Math.min(255, b + (255 - b) * 0.5);
            emoji = findClosestColorEmoji(
              pastelR,
              pastelG,
              pastelB,
              0.299 * pastelR + 0.587 * pastelG + 0.114 * pastelB
            );
            break;

          case "matrix":
            const matrixIndex = Math.min(9, Math.floor(brightness / 25.5));
            emoji = EMOJI_MAP.green[matrixIndex];
            break;

          case "hell":
            const hellR = Math.min(255, r * 1.5);
            const hellG = Math.min(255, g * 0.7);
            const hellB = Math.min(255, b * 0.3);
            const hellBrightness =
              0.299 * hellR + 0.587 * hellG + 0.114 * hellB;

            if (hellBrightness > 128) {
              const orangeIndex = Math.min(
                9,
                Math.floor((hellBrightness - 128) / 12.75)
              );
              emoji = EMOJI_MAP.orange[orangeIndex];
            } else {
              const redIndex = Math.min(9, Math.floor(hellBrightness / 12.75));
              emoji = EMOJI_MAP.red[redIndex];
            }
            break;

          case "blueprint":
            const blueprintIndex = Math.min(9, Math.floor(brightness / 25.5));
            emoji = EMOJI_MAP.blue[blueprintIndex];
            break;

          case "@basedanarki vision (heat)":
            if (brightness > 192) {
              const yellowIndex = Math.min(
                9,
                5 + Math.floor((brightness - 192) / 12.75)
              );
              emoji = EMOJI_MAP.yellow[yellowIndex];
            } else if (brightness > 128) {
              const orangeIndex = Math.min(
                9,
                Math.floor((brightness - 128) / 12.75)
              );
              emoji = EMOJI_MAP.orange[orangeIndex];
            } else if (brightness > 64) {
              const purpleIndex = Math.min(
                9,
                Math.floor((brightness - 64) / 12.75)
              );
              emoji = EMOJI_MAP.purple[purpleIndex];
            } else {
              const blueIndex = Math.min(9, Math.floor(brightness / 12.75));
              emoji = EMOJI_MAP.blue[blueIndex];
            }
            break;

          case "rainbow":
            const rainbowPosition = Math.floor((x / width) * 6) % 6;
            let rainbowColor: string;

            switch (rainbowPosition) {
              case 0:
                rainbowColor = "red";
                break;
              case 1:
                rainbowColor = "orange";
                break;
              case 2:
                rainbowColor = "yellow";
                break;
              case 3:
                rainbowColor = "green";
                break;
              case 4:
                rainbowColor = "blue";
                break;
              case 5:
                rainbowColor = "purple";
                break;
              default:
                rainbowColor = "gray";
            }

            const rainbowIndex = Math.min(9, Math.floor(brightness / 25.5));
            emoji = EMOJI_MAP[rainbowColor][rainbowIndex];
            break;

          case "glitch":
            const glitchChance = Math.random();
            let glitchR = r,
              glitchG = g,
              glitchB = b;

            if (glitchChance > 0.9) {
              [glitchR, glitchG, glitchB] = [glitchB, glitchR, glitchG];
            } else if (glitchChance > 0.8) {
              glitchR = Math.max(
                0,
                Math.min(255, r + Math.floor(Math.random() * 100) - 50)
              );
              glitchG = Math.max(
                0,
                Math.min(255, g + Math.floor(Math.random() * 100) - 50)
              );
              glitchB = Math.max(
                0,
                Math.min(255, b + Math.floor(Math.random() * 100) - 50)
              );
            }

            emoji = findClosestColorEmoji(
              glitchR,
              glitchG,
              glitchB,
              0.299 * glitchR + 0.587 * glitchG + 0.114 * glitchB
            );
            break;

          case "cyberpunk":
            const cyberValue = brightness / 255;

            if (cyberValue > 0.7) {
              const blueIndex = Math.min(
                9,
                5 + Math.floor((cyberValue - 0.7) * 33.3)
              );
              emoji = EMOJI_MAP.blue[blueIndex];
            } else if (cyberValue > 0.3) {
              const purpleIndex = Math.min(
                9,
                Math.floor((cyberValue - 0.3) * 25)
              );
              emoji = EMOJI_MAP.purple[purpleIndex];
            } else {
              const blueIndex = Math.min(4, Math.floor(cyberValue * 16.7));
              emoji = EMOJI_MAP.blue[blueIndex];
            }
            break;

          case "retrowave":
            const retroY = y / height;
            let retroIndex;

            if (retroY < 0.4) {
              retroIndex = Math.min(9, Math.floor(brightness / 25.5));
              if (retroIndex > 5) {
                emoji = EMOJI_MAP.purple[retroIndex];
              } else {
                emoji = EMOJI_MAP.red[retroIndex + 4];
              }
            } else if (retroY < 0.7) {
              retroIndex = Math.min(9, Math.floor(brightness / 25.5));
              if (retroIndex > 6) {
                emoji = EMOJI_MAP.yellow[retroIndex];
              } else {
                emoji = EMOJI_MAP.orange[retroIndex + 3];
              }
            } else {
              retroIndex = Math.min(9, Math.floor(brightness / 25.5));
              if (brightness > 170) {
                emoji = EMOJI_MAP.purple[Math.min(9, retroIndex + 2)];
              } else {
                emoji = EMOJI_MAP.blue[Math.max(0, retroIndex - 2)];
              }
            }
            break;

          default:
            emoji = findClosestColorEmoji(r, g, b, brightness);
            break;
        }

        const centerX = x * cellWidth + cellWidth / 2;
        const centerY = y * cellHeight + cellHeight / 2;
        outputCtx.fillText(emoji, centerX, centerY);
      } else {
        const charIndex = Math.floor(
          (brightness / 255) * (characterSet.length - 1)
        );
        const char = characterSet[charIndex];

        switch (colorFilter) {
          case "original":
            outputCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            break;
          case "monochrome":
            const gray = Math.round(brightness);
            outputCtx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
            break;
          case "vintage":
            const sepiaR = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
            const sepiaG = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
            const sepiaB = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
            outputCtx.fillStyle = `rgb(${sepiaR}, ${sepiaG}, ${sepiaB})`;
            break;
          case "inverted":
            outputCtx.fillStyle = `rgb(${255 - r}, ${255 - g}, ${255 - b})`;
            break;
          case "matrix":
            const intensity = Math.round(brightness);
            outputCtx.fillStyle = `rgb(0, ${Math.min(
              255,
              intensity * 1.5
            )}, 0)`;
            break;
          case "hell":
            const hellBrightness = brightness / 255;
            if (hellBrightness > 0.7) {
              outputCtx.fillStyle = `rgb(255, ${Math.round(
                200 + hellBrightness * 55
              )}, ${Math.round(50 + hellBrightness * 50)})`;
            } else if (hellBrightness > 0.4) {
              outputCtx.fillStyle = `rgb(255, ${Math.round(
                50 + hellBrightness * 150
              )}, 0)`;
            } else {
              outputCtx.fillStyle = `rgb(${Math.round(
                120 + hellBrightness * 135
              )}, ${Math.round(hellBrightness * 50)}, 0)`;
            }
            break;
          case "blueprint":
            const bpBrightness = brightness / 255;
            const bpValue = Math.round(210 + bpBrightness * 45);
            outputCtx.fillStyle = `rgb(${bpValue * bpBrightness}, ${
              bpValue * bpBrightness
            }, ${100 + bpBrightness * 155})`;
            break;
          case "@basedanarki vision (heat)":
            const heatLevel = brightness / 255;
            if (heatLevel > 0.75) {
              outputCtx.fillStyle = `rgb(255, 255, ${Math.round(
                heatLevel * 255
              )})`;
            } else if (heatLevel > 0.5) {
              outputCtx.fillStyle = `rgb(255, ${
                Math.round(heatLevel * 510) - 255
              }, 0)`;
            } else if (heatLevel > 0.25) {
              outputCtx.fillStyle = `rgb(${
                Math.round(heatLevel * 510) - 127
              }, 0, ${Math.round((1 - heatLevel) * 255)})`;
            } else {
              outputCtx.fillStyle = `rgb(0, 0, ${
                Math.round(heatLevel * 510) - 127
              })`;
            }
            break;
          case "rainbow":
            const rainbowIntensity = brightness / 255;
            const hue = (x / width) * 360;
            const [rainbowR, rainbowG, rainbowB] = hslToRgb(
              hue,
              1,
              rainbowIntensity
            );
            outputCtx.fillStyle = `rgb(${rainbowR}, ${rainbowG}, ${rainbowB})`;
            break;
          case "glitch":
            let glitchR = r;
            let glitchG = g;
            let glitchB = b;

            const shiftAmount = 70;

            const horizontalOffset = Math.floor(Math.random() * 7) - 3;
            if (horizontalOffset !== 0 && Math.random() > 0.7) {
              const offsetX = Math.max(
                0,
                Math.min(width - 1, x + horizontalOffset)
              );
              const offsetIdx = (y * width + offsetX) * 4;
              glitchR = imageData[offsetIdx];
              glitchG = imageData[offsetIdx + 1];
              glitchB = imageData[offsetIdx + 2];
            }

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

            if (Math.random() > 0.92) {
              [glitchR, glitchG, glitchB] = [glitchB, glitchR, glitchG];
            }

            if (Math.random() > 0.97) {
              const lossVal = Math.random() > 0.5 ? 255 : 0;
              glitchR = glitchG = glitchB = lossVal;
            }

            outputCtx.fillStyle = `rgb(${glitchR}, ${glitchG}, ${glitchB})`;
            break;
          case "cyberpunk":
            const cyberpunkFactor = brightness / 255;
            const primaryR = 0;
            const primaryG = 194;
            const primaryB = 186;
            const secondaryR = 42;
            const secondaryG = 0;
            const secondaryB = 87;

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
            const retrowaveFactor = brightness / 255;
            let retroR, retroG, retroB;

            if (retrowaveFactor > 0.8) {
              retroR = 80;
              retroG = 235;
              retroB = 255;
            } else if (retrowaveFactor > 0.5) {
              retroR = 220;
              retroG = 50;
              retroB = 220;
            } else if (retrowaveFactor > 0.2) {
              retroR = 30;
              retroG = 20;
              retroB = 180;
            } else {
              retroR = 10;
              retroG = 5;
              retroB = 40;
            }

            outputCtx.fillStyle = `rgb(${retroR}, ${retroG}, ${retroB})`;
            break;
        }

        outputCtx.fillText(char, x * cellWidth, y * cellHeight);
      }
    }
  }

  if (colorFilter === "glitch" && renderMode === "ascii") {
    applyCRTPattern(outputCtx, outputCanvas.width, outputCanvas.height);
  }

  tempCanvas.remove();
};

// Applies a CRT scanline effect to the canvas
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
        data[idx] *= 0.9;
        data[idx + 1] *= 0.9;
        data[idx + 2] *= 0.9;
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);
};

// A React component that converts images to ASCII art or emoji art with various filters and effects
const AsciiCanvas: React.FC<AsciiCanvasProps> = ({
  initialImage = null,
  initialSize = 200,
  initialColorFilter = "original",
  initialCharacterSet = "default",
  onError,
}) => {
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
  const [renderMode, setRenderMode] = useState<RenderMode>("ascii");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const mainContainerRef = useRef<HTMLDivElement | null>(null);

  const ZOOM_MULTIPLIER = 0.15;

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

  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportSize, setExportSize] = useState<ExportSize>(EXPORT_SIZES[1]);
  const [exportFilename, setExportFilename] = useState("typeArt");
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    EXPORT_FORMATS[0]
  );

  const [exportResolutions, setExportResolutions] = useState<
    Record<string, string>
  >({});

  // Get the selected character set for ASCII rendering
  const asciiChars = useMemo(
    () => ASCII_PRESETS[characterSet] || DEFAULT_ASCII_CHARS,
    [characterSet]
  );

  // Resets the view to original position and scale
  const resetView = useCallback(() => {
    setScale(1 * ZOOM_MULTIPLIER);
    setPanOffset({ x: 0, y: 0 });
  }, [ZOOM_MULTIPLIER]);

  // Handles image file upload from user input
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

  // Calculates export resolutions based on current canvas dimensions
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

  // Returns the actual background color value based on the selected type
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

  // Exports the ASCII art as an image with the selected size and format
  const exportAsImage = useCallback(
    async (sizeScale: number, filename: string, format: ExportFormat) => {
      if (!canvasRef.current) return;

      try {
        const originalCanvas = canvasRef.current;
        const originalWidth = originalCanvas.width;
        const originalHeight = originalCanvas.height;

        const exportWidth = originalWidth * sizeScale;
        const exportHeight = originalHeight * sizeScale;

        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportHeight;

        const exportCtx = exportCanvas.getContext("2d");
        if (!exportCtx) return;

        const actualColor =
          backgroundColor === "custom" ? customBgColor : backgroundColor;
        exportCtx.fillStyle = actualColor;
        exportCtx.fillRect(0, 0, exportWidth, exportHeight);

        exportCtx.drawImage(originalCanvas, 0, 0, exportWidth, exportHeight);

        const link = document.createElement("a");
        link.download = `${filename}.${format.extension}`;

        const quality = format.extension === "png" ? 0.8 : 0.9;
        link.href = exportCanvas.toDataURL(format.mimeType, quality);
        link.click();

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

  // Shows the export dialog when export button is clicked
  const handleExportClick = useCallback(() => {
    if (!image) return;

    setExportResolutions(calculateExportResolutions());
    setShowExportDialog(true);
  }, [calculateExportResolutions, image]);

  // Handles export confirmation from the dialog
  const handleExportConfirm = useCallback(() => {
    exportAsImage(exportSize.scale, exportFilename, exportFormat);
    setShowExportDialog(false);
  }, [exportAsImage, exportSize.scale, exportFilename, exportFormat]);

  // Handles export dialog close
  const handleExportCancel = useCallback(() => {
    setShowExportDialog(false);
  }, []);

  // Exports the ASCII art as plain text
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

      navigator.clipboard.writeText(asciiText).then(() => {
        alert("ASCII text copied to clipboard!");

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

  // Renders the ASCII art with current options
  const renderAsciiArt = useCallback(() => {
    if (!imageRef.current || !canvasRef.current) return;

    const actualBackgroundColor =
      backgroundColor === "custom" ? customBgColor : backgroundColor;

    drawAscii(
      imageRef.current,
      size,
      colorFilter,
      asciiChars,
      canvasRef.current,
      renderOptions,
      actualBackgroundColor,
      renderMode
    );
  }, [
    size,
    colorFilter,
    asciiChars,
    renderOptions,
    backgroundColor,
    customBgColor,
    renderMode,
  ]);

  // Loads and processes the image when it changes
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

  // Re-renders when options change
  useEffect(() => {
    if (imageRef.current && canvasRef.current) {
      renderAsciiArt();
    }
  }, [renderOptions, renderAsciiArt]);

  // Detects if the device is mobile
  const isMobileDevice = useRef(
    typeof window !== "undefined" &&
      (navigator.maxTouchPoints > 0 ||
        /Android|iPhone|iPad|iPod|Windows Phone/i.test(navigator.userAgent))
  ).current;

  // Handles zoom in/out with consistent increments
  const handleZoom = useCallback(
    (zoomIn: boolean) => {
      const zoomChange = zoomIn ? 0.1 : -0.1;

      const minScale = isMobileDevice ? 0.01 : 0.05;
      const newScale =
        Math.max(minScale, Math.min(5, scale / ZOOM_MULTIPLIER + zoomChange)) *
        ZOOM_MULTIPLIER;

      setScale(newScale);
    },
    [scale, ZOOM_MULTIPLIER, isMobileDevice]
  );

  // Handles mouse wheel events for zoom and pan
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        const zoomDelta = 0.1;
        const zoomIn = e.deltaY < 0;

        const zoomChange = zoomIn ? zoomDelta : -zoomDelta;
        const minScale = isMobileDevice ? 0.01 : 0.05;
        const newScale =
          Math.max(
            minScale,
            Math.min(5, scale / ZOOM_MULTIPLIER + zoomChange)
          ) * ZOOM_MULTIPLIER;

        setScale(newScale);
      } else {
        const newOffsetX = panOffset.x - e.deltaX;
        const newOffsetY = panOffset.y - e.deltaY;

        setPanOffset({
          x: newOffsetX,
          y: newOffsetY,
        });
      }
    },
    [panOffset, scale, ZOOM_MULTIPLIER, isMobileDevice]
  );

  // Initiates panning on mouse down
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    setIsPanning(true);
    lastPanPosition.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Updates pan position during mouse movement
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;

      const dx = e.clientX - lastPanPosition.current.x;
      const dy = e.clientY - lastPanPosition.current.y;

      setPanOffset((prev) => ({
        x: prev.x + dx,
        y: prev.y + dy,
      }));

      lastPanPosition.current = { x: e.clientX, y: e.clientY };
    },
    [isPanning]
  );

  // Stops panning on mouse up
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Handles keyboard navigation for pan and zoom
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
          setPanOffset((prev) => ({ ...prev, y: prev.y + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowDown":
          setPanOffset((prev) => ({ ...prev, y: prev.y - PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowLeft":
          setPanOffset((prev) => ({ ...prev, x: prev.x + PAN_STEP }));
          e.preventDefault();
          break;
        case "ArrowRight":
          setPanOffset((prev) => ({ ...prev, x: prev.x - PAN_STEP }));
          e.preventDefault();
          break;
        case "+":
        case "=":
          handleZoom(true);
          e.preventDefault();
          break;
        case "-":
        case "_":
          handleZoom(false);
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

  // Sets up keyboard event listeners
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  // Prevents native zoom on viewport wheel events
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };

    viewport.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", handleNativeWheel);
  }, []);

  // Manages touch-based zoom and pan state
  const [touchDistance, setTouchDistance] = useState<number | null>(null);
  const lastTouchDistance = useRef<number | null>(null);

  // Calculates distance between two touch points
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;

    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Calculates center point between two touches
  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return null;

    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    };
  }, []);

  // Handles touch start events for pan and pinch-to-zoom
  const handleTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1) {
        setIsPanning(true);
        lastPanPosition.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
        setTouchDistance(null);
      } else if (e.touches.length === 2) {
        setIsPanning(false);
        const distance = getTouchDistance(e.touches);
        setTouchDistance(distance);
        lastTouchDistance.current = distance;
      }
    },
    [getTouchDistance]
  );

  // Handles touch move events for pan and pinch-to-zoom
  const handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (e.touches.length === 1 && isPanning) {
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
        const currentDistance = getTouchDistance(e.touches);
        const previousDistance = lastTouchDistance.current;

        if (currentDistance && previousDistance && previousDistance > 0) {
          const distanceRatio = currentDistance / previousDistance;

          const center = getTouchCenter(e.touches);

          if (center) {
            const newScale = Math.max(0.01, Math.min(5, scale * distanceRatio));

            setScale(newScale);
          }
        }

        lastTouchDistance.current = currentDistance;
      }

      e.preventDefault();
    },
    [isPanning, getTouchDistance, getTouchCenter, scale]
  );

  // Resets touch interaction states
  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    setTouchDistance(null);
    lastTouchDistance.current = null;
  }, []);

  // Manages temporary states for UI controls
  const [tempSize, setTempSize] = useState(initialSize);
  const [tempBrightness, setTempBrightness] = useState(0);
  const [tempContrast, setTempContrast] = useState(0);

  // Debounced update functions for performance
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

  // Handles size slider changes
  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setTempSize(value);
    debouncedUpdateSize(value);
  };

  // Handles brightness slider changes
  const handleBrightnessChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTempBrightness(value);
    debouncedUpdateRenderOptions({ brightness: value });
  };

  // Handles contrast slider changes
  const handleContrastChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTempContrast(value);
    debouncedUpdateRenderOptions({ contrast: value });
  };

  // Syncs temporary states with actual values
  useEffect(() => {
    setTempSize(size);
  }, [size]);

  useEffect(() => {
    setTempBrightness(renderOptions.brightness);
    setTempContrast(renderOptions.contrast);
  }, [renderOptions.brightness, renderOptions.contrast]);

  // Returns focus to the canvas container
  const returnFocusToCanvas = useCallback(() => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  }, []);

  // Wraps control handlers to maintain canvas focus
  const handleControlClick = useCallback(
    (callback: () => void) => {
      return (e: React.MouseEvent) => {
        e.preventDefault();
        callback();
        setTimeout(returnFocusToCanvas, 0);
      };
    },
    [returnFocusToCanvas]
  );

  // Handles file input focus management
  const handleFileInputClick = useCallback(() => {
    setTimeout(returnFocusToCanvas, 100);
  }, [returnFocusToCanvas]);

  // Toggles control panel visibility while maintaining focus
  const toggleControlsWithFocus = useCallback(() => {
    setControlsExpanded((prev) => !prev);
    setTimeout(returnFocusToCanvas, 0);
  }, [returnFocusToCanvas]);

  // Sets initial focus on canvas
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.focus();
    }
  }, []);

  // Updates canvas when background color changes
  useEffect(() => {
    if (imageRef.current && canvasRef.current && !loading) {
      renderAsciiArt();
    }
  }, [backgroundColor, customBgColor, renderAsciiArt, loading]);

  // Modal component for selecting and customizing background colors
  const BackgroundColorModal = () => {
    if (!bgModalOpen) return null;

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

  // Main component render with control panel, modals, and canvas viewport
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
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16 opacity-0">
                  Hidden:
                </label>
                <div className="flex-1 flex space-x-2">
                  <label
                    htmlFor="imageUpload"
                    className="flex-1 px-2 py-1.5 bg-blue-600 hover:bg-blue-700 cursor-pointer text-white rounded text-center text-xs"
                    onClick={handleFileInputClick}
                  >
                    Upload Image
                  </label>
                  <button
                    onClick={handleControlClick(handleExportClick)}
                    className={`flex-1 px-2 py-1.5 ${
                      image
                        ? "bg-green-600 hover:bg-green-700"
                        : "bg-gray-600 opacity-50 cursor-not-allowed"
                    } text-white rounded text-xs`}
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
              </div>

              {/* Render Mode Toggle */}
              <div className="flex items-center space-x-1">
                <label className="text-gray-400 text-xs w-16">Mode:</label>
                <div className="flex-1 flex rounded overflow-hidden border border-gray-700">
                  <button
                    onClick={() => {
                      setRenderMode("ascii");
                      setTimeout(returnFocusToCanvas, 0);
                    }}
                    className={`flex-1 text-xs py-1.5 px-2 transition-colors ${
                      renderMode === "ascii"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => {
                      setRenderMode("emoji");
                      setTimeout(returnFocusToCanvas, 0);
                    }}
                    className={`flex-1 text-xs py-1.5 px-2 transition-colors ${
                      renderMode === "emoji"
                        ? "bg-blue-600 text-white"
                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    }`}
                  >
                    Emoji 🎨
                  </button>
                </div>
              </div>

              {/* Character Set - only show when in ASCII mode with simplified options */}
              {renderMode === "ascii" && (
                <div className="flex items-center space-x-1">
                  <label className="text-gray-400 text-xs w-16">
                    Characters:
                  </label>
                  <select
                    value={characterSet}
                    onChange={(e) => {
                      setCharacterSet(e.target.value as CharacterSet);
                      setTimeout(returnFocusToCanvas, 0);
                    }}
                    className="bg-gray-800 text-white rounded border border-gray-700 text-xs p-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="default">Default</option>
                    <option value="simple">Simple</option>
                    <option value="blocks">Blocks</option>
                  </select>
                </div>
              )}

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
