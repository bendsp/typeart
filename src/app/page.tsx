"use client";
import React from "react";
import AsciiCanvas from "@/components/AsciiCanvas";

export default function Home() {
  return (
    <div
      className="flex flex-col h-screen"
      style={{ overscrollBehavior: "none" }}
    >
      <AsciiCanvas initialSize={300} initialUseColor={true} />
    </div>
  );
}
