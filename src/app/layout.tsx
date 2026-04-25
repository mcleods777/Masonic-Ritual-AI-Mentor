import type { Metadata, Viewport } from "next";
import { Cinzel, Lato } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";
import PilotBanner from "@/components/PilotBanner";
import DegradedModeBanner from "@/components/DegradedModeBanner";
import HeartbeatClient from "@/components/HeartbeatClient";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

const lato = Lato({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-lato",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Masonic Ritual Mentor",
  description:
    "A privacy-first voice-driven practice tool for Masonic ritual memorization. Upload your ritual, practice by speaking, and get instant accuracy feedback — all on your device.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Ritual Mentor",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`antialiased min-h-screen ${cinzel.variable} ${lato.variable}`}>
        <PilotBanner />
        <DegradedModeBanner />
        <HeartbeatClient />
        <Navigation />
        <main className="pt-4 md:pt-20 pb-20 md:pb-4 px-4 max-w-5xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
