"use client";
import React from "react";

interface SettingsPanelProps {
  setImage: (image: string | null) => void;
  size: number;
  setSize: (size: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  useColor: boolean;
  setUseColor: (useColor: boolean) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  setImage,
  size,
  setSize,
  zoom,
  setZoom,
  useColor,
  setUseColor,
}) => {
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => setImage(e.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="w-1/4 bg-gray-900 text-white p-4 overflow-auto">
      <h2 className="text-xl font-bold">Settings</h2>

      {/* Image Upload */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-400">
          Upload Image
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="mt-1 p-2 w-full text-black bg-white rounded"
        />
      </div>

      {/* Size Slider */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-400">Size</label>
        <input
          type="range"
          min="50"
          max="500"
          value={size}
          onChange={(e) => setSize(Number(e.target.value))}
          className="w-full mt-1"
        />
        <p className="text-sm text-gray-400">{size}px</p>
      </div>

      {/* Zoom Slider */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-400">Zoom</label>
        <input
          type="range"
          min="0.1"
          max="3"
          step="0.1"
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full mt-1"
        />
        <p className="text-sm text-gray-400">{zoom}x</p>
      </div>

      {/* Color Toggle */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-400">
          Use Color
        </label>
        <input
          type="checkbox"
          checked={useColor}
          onChange={() => setUseColor(!useColor)}
          className="mt-1"
        />
      </div>
    </div>
  );
};

export default SettingsPanel;
