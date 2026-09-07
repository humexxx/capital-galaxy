import "./globals.css";

import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { DynamicFavicon } from "@/components/dynamic-favicon";
import { Toaster } from "@/components/ui/sonner";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { getBaseUrl } from "@/lib/env";

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { template: "%s | Allstars Galaxy", default: "Allstars Galaxy" },
  description:
    "Personal finance plans, portfolio tracking, productivity boards and travel planning in one workspace.",
  applicationName: "Allstars Galaxy",
  openGraph: {
    type: "website",
    siteName: "Allstars Galaxy",
    title: "Allstars Galaxy",
    description:
      "Personal finance plans, portfolio tracking, productivity boards and travel planning in one workspace.",
  },
  twitter: { card: "summary" },
  // app/icon.svg is auto-picked by Next.js as the primary favicon. The
  // light/dark variants in /public are referenced explicitly so the app
  // shell can hot-swap them when the user flips the theme.
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the app paint under the notch / home indicator on phones.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DynamicFavicon />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
