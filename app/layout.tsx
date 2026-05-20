import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import PWAInstaller from "@/components/PWAInstaller";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "POSMASTER — Sistema de Punto de Venta",
  description: "Sistema de gestión de ventas, inventario y clientes.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "POSMASTER",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  minimumScale: 1,
  userScalable: true,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link
          rel="icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect fill='%232563eb' width='192' height='192'/><text x='50%' y='50%' font-size='120' font-weight='900' text-anchor='middle' dominant-baseline='middle' fill='white'>P</text></svg>"
        />
        <meta name="theme-color" content="#2563eb" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="POSMASTER" />
        <link
          rel="apple-touch-icon"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'><rect fill='%232563eb' width='192' height='192' rx='45'/><text x='50%' y='50%' font-size='120' font-weight='900' text-anchor='middle' dominant-baseline='middle' fill='white'>P</text></svg>"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <PWAInstaller />
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
