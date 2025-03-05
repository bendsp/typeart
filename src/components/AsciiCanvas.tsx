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

  // Handle zooming
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const newScale = Math.max(0.5, Math.min(3, scale - e.deltaY * 0.01));

      if (containerRef.current) {
        const { scrollLeft, scrollTop, clientWidth, clientHeight } =
          containerRef.current;
        const centerX = scrollLeft + clientWidth / 2;
        const centerY = scrollTop + clientHeight / 2;

        setScale(newScale);

        // Adjust scroll position to keep zoom centered
        requestAnimationFrame(() => {
          if (containerRef.current) {
            containerRef.current.scrollLeft =
              centerX * (newScale / scale) - clientWidth / 2;
            containerRef.current.scrollTop =
              centerY * (newScale / scale) - clientHeight / 2;
          }
        });
      } else {
        setScale(newScale);
      }
    }
  };

  // Prevent native pinch zooming
  useEffect(() => {
    const preventNativeZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    };
    window.addEventListener("wheel", preventNativeZoom, { passive: false });
    return () => {
      window.removeEventListener("wheel", preventNativeZoom);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="flex-1 flex items-center justify-center bg-gray-800 text-white p-4 overflow-auto"
      style={{
        touchAction: "none",
        width: "100%",
        height: "100vh",
        display: "flex",
      }}
      onWheel={handleWheel}
    >
      <div
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "center",
          margin: "auto",
        }}
      >
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
};

export default AsciiCanvas;
