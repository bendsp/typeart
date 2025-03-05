"use client";
import React, { useEffect, useRef } from "react";

interface AsciiCanvasProps {
  image: string | null;
  size: number;
  zoom: number;
  useColor: boolean;
}

const AsciiCanvas: React.FC<AsciiCanvasProps> = ({
  image,
  size,
  zoom,
  useColor,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
      const charWidth = 6;
      const charHeight = 12;
      const charAspectRatio = charWidth / charHeight;

      let width = size;
      let height = Math.floor((size / aspectRatio) * charAspectRatio); // Adjust height based on character aspect

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

  return (
    <div className="flex-1 flex items-center justify-center bg-gray-800 text-white p-4 overflow-auto">
      <canvas
        ref={canvasRef}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
      />
    </div>
  );
};

export default AsciiCanvas;
