import type { Metadata } from "next";
import { Cinzel } from "next/font/google";
import "./globals.css";
import Navigation from "@/components/Navigation";

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Masonic Ritual Mentor",
  description:
    "A privacy-first voice-driven practice tool for Masonic ritual memorization. Upload your ritual, practice by speaking, and get instant accuracy feedback — all on your device.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`antialiased min-h-screen font-sans ${cinzel.variable}`}>
        <Navigation />
        <main className="pt-4 md:pt-20 pb-20 md:pb-4 px-4 max-w-5xl mx-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
