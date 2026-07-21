import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { ThemeBoot } from "./components/ThemeBoot";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://vcaist-platform.familydn06.chatgpt.site"),
  title: {
    default: "VCAIST — Understand your app",
    template: "%s · VCAIST",
  },
  description:
    "A plain-English control room for understanding, testing, and safely changing your app.",
  openGraph: {
    title: "VCAIST — Understand your app",
    description: "Understand your app, try changes safely, and stay in control.",
    images: [{ url: "/og-dark.png", width: 1536, height: 1024, alt: "VCAIST — Understand your app. Stay in control." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VCAIST — Understand your app",
    description: "Understand your app, try changes safely, and stay in control.",
    images: ["/og-dark.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#090b0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/workspace"
      signUpFallbackRedirectUrl="/workspace"
      afterSignOutUrl="/"
    >
      <html lang="en" data-theme="midnight-clay" suppressHydrationWarning>
        <body><ThemeBoot />{children}</body>
      </html>
    </ClerkProvider>
  );
}
