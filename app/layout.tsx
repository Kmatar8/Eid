import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const cairo = Cairo({ subsets: ["arabic"], weight: ["400", "500", "600", "700", "800"] });
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.happystore.click";
const shareImagePath = "/images/landing-hero.jpg";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "فعالية العيد",
  description: "فعالية العيد: ألعاب تفاعلية للجمعات العائلية تعمل مباشرة على شاشة العرض والجوال.",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "ar_SA",
    url: "/",
    siteName: "فعالية العيد",
    title: "فعالية العيد",
    description: "فعالية العيد: ألعاب تفاعلية للجمعات العائلية تعمل مباشرة على شاشة العرض والجوال.",
    images: [
      {
        url: shareImagePath,
        width: 1200,
        height: 630,
        alt: "فعالية العيد",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "فعالية العيد",
    description: "فعالية العيد: ألعاب تفاعلية للجمعات العائلية تعمل مباشرة على شاشة العرض والجوال.",
    images: [shareImagePath],
  },
  icons: {
    icon: [{ url: "/eid-favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/eid-favicon.svg"],
    apple: ["/eid-favicon.svg"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "فعالية العيد",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body className={`${cairo.className} antialiased bg-background text-foreground selection:bg-amber-500/30 selection:text-amber-200 overflow-x-hidden transition-colors duration-500`}>
        <ThemeProvider
          attribute="class"
          forcedTheme="dark"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
