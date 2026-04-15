import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "ENTIA // SmartHome",
  icons: {
    icon: [
      { url: "/images/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/images/apple-touch-iconn.png",
    shortcut: "/images/favicon.ico",
  },
  manifest: "/images/manifest.json",
  other: {
    "msapplication-TileColor": "#0a0a0f",
    "msapplication-config": "/images/browserconfig.xml",
    "apple-mobile-web-app-capable": "yes",
    "screen-orientation": "portrait",
    nightmode: "enable",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a0f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="relative z-0 min-h-screen">
        {children}
        {/*
         * Register the service worker after the page is interactive.
         * next/script with strategy="afterInteractive" is the correct App Router
         * pattern -- replaces the old dangerouslySetInnerHTML inline script.
         */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(function(err) {
              console.warn('[sw] registration failed:', err);
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
