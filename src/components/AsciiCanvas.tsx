"use client";
import React, { useEffect, useRef, useState } from "react";

interface AsciiCanvasProps {
  image: string | null;
  size: number;
  useColor: boolean;
}

const AsciiCanvas: React.FC<AsciiCanvasProps> = ({ image, size, useColor }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (image) {
      requestAnimationFrame(() => convertImageToAscii(image));
    }
  }, [image, size, useColor]);

  const convertImageToAscii = async (imageSrc: string) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = imageSrc;
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const aspectRatio = img.width / img.height;
      const charAspectRatio = 6 / 12;

      let width = size;
      let height = Math.floor((size / aspectRatio) * charAspectRatio);

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height).data;
      const chars =
        "$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ";
      const outputCanvas = canvasRef.current;
      if (!outputCanvas) return;
      const outputCtx = outputCanvas.getContext("2d");
      if (!outputCtx) return;

      const charWidth = 6;
      const charHeight = 12;
      outputCanvas.width = width * charWidth;
      outputCanvas.height = height * charHeight;

      outputCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
      outputCtx.font = `${charHeight}px monospace`;
      outputCtx.textBaseline = "top";

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = imageData[idx];
          const g = imageData[idx + 1];
          const b = imageData[idx + 2];
          const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
          const charIndex = Math.floor((brightness / 255) * (chars.length - 1));
          const char = chars[charIndex];

          if (useColor) {
            outputCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
          } else {
            outputCtx.fillStyle = "white";
          }
          outputCtx.fillText(char, x * charWidth, y * charHeight);
        }
      }
    };
  };

  // Handle zooming from cursor
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      // Zoom branch
      e.preventDefault();
      if (!containerRef.current || !canvasRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      // Use the intrinsic canvas dimensions (set during ascii conversion)
      const canvasIntrinsicWidth = canvasRef.current.width;
      const canvasIntrinsicHeight = canvasRef.current.height;
      // Compute the canvas's untransformed centered position within the container
      const centeredX = (containerRect.width - canvasIntrinsicWidth) / 2;
      const centeredY = (containerRect.height - canvasIntrinsicHeight) / 2;

      // Compute the cursor's position relative to the canvas's original top-left (before transform)
      const localCursorX =
        e.clientX - containerRect.left - centeredX - offset.x;
      const localCursorY = e.clientY - containerRect.top - centeredY - offset.y;

      const newScale = Math.max(0.5, Math.min(3, scale - e.deltaY * 0.01));

      // Adjust offset so that the point under the cursor remains fixed
      setOffset({
        x: offset.x + (1 - newScale / scale) * localCursorX,
        y: offset.y + (1 - newScale / scale) * localCursorY,
      });

      setScale(newScale);
    } else {
      // Two-finger panning
      e.preventDefault();
      setOffset((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  // Handle panning
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsPanning(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    container.addEventListener("wheel", handleNativeWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleNativeWheel);
    };
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
