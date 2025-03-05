"use client";
import React, { useState } from "react";
import SettingsPanel from "@/components/SettingsPannel";
import AsciiCanvas from "@/components/AsciiCanvas";

export default function Home() {
  const [image, setImage] = useState<string | null>(null);
  const [size, setSize] = useState<number>(200);
  const [zoom, setZoom] = useState<number>(1);
  const [useColor, setUseColor] = useState<boolean>(true);

  return (
    <div className="flex h-screen">
      {/* Left Panel (Settings) */}
      <SettingsPanel
        setImage={setImage}
        size={size}
        setSize={setSize}
        zoom={zoom}
        setZoom={setZoom}
        useColor={useColor}
        setUseColor={setUseColor}
      />

      {/* Right Panel (Canvas) */}
      <AsciiCanvas image={image} size={size} zoom={zoom} useColor={useColor} />
    </div>
  );
}
