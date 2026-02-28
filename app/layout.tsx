import type { Metadata, Viewport } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const cairo = Cairo({ subsets: ["arabic"], weight: ["400", "500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "حروف - ألعاب العيد",
  description: "مجموعة ألعاب تفاعلية لجمعات العيد والعائلة. صممت لتلعب على التلفزيون.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "حروف",
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
