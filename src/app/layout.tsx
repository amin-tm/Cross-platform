import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "پُل — انتقال فایل، بدون فاصله",
  description: "فایل‌ها را بین اندروید، آیفون و کامپیوتر جابه‌جا کنید. بدون ثبت‌نام و نصب، با یک لینک یا کد QR.",
  applicationName: "پُل",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "پُل" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#5754e8",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body>{children}</body></html>;
}
