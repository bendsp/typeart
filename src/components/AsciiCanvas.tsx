"use client";
import React, { useEffect, useRef, useState } from "react";

const CHAR_WIDTH = 6;
const CHAR_HEIGHT = 12;
const CHAR_ASPECT_RATIO = CHAR_WIDTH / CHAR_HEIGHT;
const ASCII_CHARS =
  "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ";

interface AsciiCanvasProps {
  image: string | null;
  size: number;
  useColor: boolean;
}

// Convert image to ASCII art and render on the canvas
const drawAscii = (
  image: HTMLImageElement,
  size: number,
  useColor: boolean,
  outputCanvas: HTMLCanvasElement
) => {
  const aspectRatio = image.width / image.height;
  const width = size;
  const height = Math.floor((size / aspectRatio) * CHAR_ASPECT_RATIO);

  const tempCanvas = document.createElement("canvas");
  const ctx = tempCanvas.getContext("2d");
  if (!ctx) return;
  tempCanvas.width = width;
  tempCanvas.height = height;
  ctx.drawImage(image, 0, 0, width, height);
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
        (brightness / 255) * (ASCII_CHARS.length - 1)
      );
      const char = ASCII_CHARS[charIndex];
      outputCtx.fillStyle = useColor ? `rgb(${r}, ${g}, ${b})` : "white";
      outputCtx.fillText(char, x * CHAR_WIDTH, y * CHAR_HEIGHT);
    }
  }
};

// AsciiCanvas component renders ASCII art from an image and supports zoom & pan
const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ image, size, useColor }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Load image and render ASCII art
  useEffect(() => {
    if (image) {
      requestAnimationFrame(() => {
        const img = new Image();
        img.src = image;
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          if (canvasRef.current)
            drawAscii(img, size, useColor, canvasRef.current);
        };
      });
    }
  }, [image, size, useColor]);

  // Handle zoom and pan on wheel event
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (!containerRef.current || !canvasRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const canvasIntrinsicWidth = canvasRef.current.width;
      const canvasIntrinsicHeight = canvasRef.current.height;
      const centeredX = (containerRect.width - canvasIntrinsicWidth) / 2;
      const centeredY = (containerRect.height - canvasIntrinsicHeight) / 2;
      const localCursorX =
        e.clientX - containerRect.left - centeredX - offset.x;
      const localCursorY = e.clientY - containerRect.top - centeredY - offset.y;
      const newScale = Math.max(0.1, Math.min(5, scale - e.deltaY * 0.01));
      setOffset({
        x: offset.x + (1 - newScale / scale) * localCursorX,
        y: offset.y + (1 - newScale / scale) * localCursorY,
      });
      setScale(newScale);
    } else {
      e.preventDefault();
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Start panning on mouse down
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  // Handle panning movement on mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  // End panning on mouse up
  const handleMouseUp = () => setIsPanning(false);

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

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center bg-gray-800 text-white p-8 overflow-hidden"
      style={{
        touchAction: "none",
        width: "100%",
        height: "100vh",
        display: "flex",
        cursor: isPanning ? "grabbing" : "grab",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: "top left",
        }}
      />
    </div>
  );
};

export default AsciiCanvas;
