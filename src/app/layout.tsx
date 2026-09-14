import type { Metadata, Viewport } from "next";
import { Fraunces, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegistrar } from "@/components/pwa/pwa-client";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Ruang Tumbuh",
  description:
    "Ruang pribadi untuk dua orang — perencanaan, keuangan, refleksi, dan tumbuh bersama. Jalan boleh berubah. Arah jangan.",
  robots: { index: false, follow: false }, // aplikasi privat: jangan diindeks
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Ruang Tumbuh",
    statusBarStyle: "black-translucent",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "application-name": "Ruang Tumbuh",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  // viewport-fit=cover → env(safe-area-inset-*) aktif di ponsel ber-notch /
  // gesture navigation; dipakai navbar bawah & header atas.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <body
        className={`${fraunces.variable} ${workSans.variable} ${plexMono.variable} font-sans antialiased min-h-dvh`}
      >
        {children}
        <Toaster />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
