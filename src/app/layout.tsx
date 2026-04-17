import type { Metadata, Viewport } from "next";
import { Cinzel, Lato } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Navigation from "@/components/Navigation";
import PilotBanner from "@/components/PilotBanner";
import PostHogProvider from "@/components/PostHogProvider";
import TelemetryBanner from "@/components/TelemetryBanner";
import {
  SESSION_COOKIE_NAME,
  isAuthConfigured,
  verifySessionToken,
} from "@/lib/auth";
import { hashEmail } from "@/lib/user-id";
import {
  TELEMETRY_OPTOUT_COOKIE,
  isOptedOutFromCookieValue,
} from "@/lib/telemetry-consent";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let initialUserId: string | undefined;
  let optedOut = false;

  try {
    const cookieStore = await cookies();
    const optOutCookie = cookieStore.get(TELEMETRY_OPTOUT_COOKIE)?.value;
    optedOut = isOptedOutFromCookieValue(optOutCookie);

    if (isAuthConfigured()) {
      const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
      const session = await verifySessionToken(sessionCookie);
      if (session?.email) {
        initialUserId = hashEmail(session.email);
      }
    }
  } catch {
    // Telemetry init must never break the render.
  }

  return (
    <html lang="en" className="dark">
      <body className={`antialiased min-h-screen ${cinzel.variable} ${lato.variable}`}>
        <PostHogProvider initialUserId={optedOut ? undefined : initialUserId}>
          <PilotBanner />
          <Navigation />
          <main className="pt-4 md:pt-20 pb-20 md:pb-4 px-4 max-w-5xl mx-auto">
            {children}
          </main>
          <TelemetryBanner />
        </PostHogProvider>
      </body>
    </html>
  );
}
