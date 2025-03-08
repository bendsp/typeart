"use client";
import React, { useEffect } from "react";
import AsciiCanvas from "@/components/AsciiCanvas";

export default function Home() {
  // Handle viewport height for mobile Safari
  useEffect(() => {
    // Function to update CSS variable with the window height
    const setViewportHeight = () => {
      // First we get the viewport height and multiply it by 1% to get a value for a vh unit
      const vh = window.innerHeight * 0.01;
      // Then we set the value in the --vh custom property to the root of the document
      document.documentElement.style.setProperty("--vh", `${vh}px`);
    };

    // Add event listener to update on resize
    window.addEventListener("resize", setViewportHeight);

    // Set the initial value
    setViewportHeight();

    // Clean up event listener on component unmount
    return () => window.removeEventListener("resize", setViewportHeight);
  }, []);

  return (
    <div
      className="flex flex-col relative"
      style={{
        height: "calc(var(--vh, 1vh) * 100)", // Use CSS variable for height
        overscrollBehavior: "none",
        paddingBottom: "env(safe-area-inset-bottom, 0px)", // Add padding for notches
      }}
    >
      <AsciiCanvas initialSize={200} initialColorFilter="original" />

      {/* Attribution Box - positioned in bottom left corner */}
      <div
        className="fixed left-0 bottom-0 bg-black bg-opacity-70 text-white p-1.5 rounded-tr text-xs z-50"
        style={{
          margin: 0,
          borderBottomLeftRadius: 0,
          borderTopLeftRadius: 0,
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 0.375rem)`,
        }}
      >
        <a
          href="https://github.com/bendsp"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:text-blue-300 transition-colors flex items-center"
        >
          <span>Ben Desprets - 2025</span>
          <svg
            className="ml-1 w-3 h-3"
            fill="currentColor"
            viewBox="0 0 16 16"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
        </a>
      </div>

      {/* Keyboard Instructions - positioned in bottom right corner */}
      <div
        className="fixed right-0 bottom-0 bg-black bg-opacity-70 text-white p-1.5 rounded-tl text-xs z-50"
        style={{
          margin: 0,
          borderBottomRightRadius: 0,
          borderTopRightRadius: 0,
          paddingBottom: `calc(env(safe-area-inset-bottom, 0px) + 0.375rem)`,
        }}
      >
        <p>+/-: Zoom | 0: Reset | Drag: Pan</p>
      </div>
    </div>
  );
}
