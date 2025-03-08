import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "typeArt - ASCII Art",
  description: "Turn images into beautiful ASCII art with filters and styles.",
  metadataBase: new URL("https://typeart.desprets.net"),
  openGraph: {
    title: "typeArt - ASCII Art",
    description: "Turn images into beautiful ASCII art with filters and styles",
    url: "https://typeart.desprets.net",
    siteName: "typeArt",
    images: [
      {
        url: "/typeArt-logo.png",
        width: 800,
        height: 600,
        alt: "typeArt Logo",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "typeArt - ASCII Art",
    description: "Turn images into beautiful ASCII art with filters and styles",
    images: ["/typeArt-logo.png"],
    creator: "@bendsp",
  },
  icons: {
    icon: "/typeArt-logo.png",
    shortcut: "/typeArt-logo.png",
    apple: "/typeArt-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
