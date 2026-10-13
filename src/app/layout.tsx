import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SCRIPT_TEMA_INICIAL } from "@/lib/tema";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Nexus Dashboard",
  description: "Dashboard de Nexus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: el script de abajo le agrega la clase `dark` al
    // <html> antes de que React hidrate, así que el marcado del servidor y el
    // del cliente difieren a propósito en ese atributo.
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Antes del primer pintado, para que no haya un destello blanco. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
