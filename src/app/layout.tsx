import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { BUSINESS } from "@/lib/business";
import { OPEN_IN_BROWSER_SCRIPT } from "@/lib/open-in-browser";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(BUSINESS.siteUrl),
  title: "IMO Recharge — Powered by Kamal",
  description:
    "Recharge your IMO account quickly and securely. Enter your IMO ID, pick a package, and pay securely by UPI.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "IMO Recharge — Powered by Kamal",
    description: "Fast, secure IMO credit recharge with UPI payment.",
    url: "/",
    siteName: "IMO Recharge",
    type: "website",
    locale: "en_IN",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Script id="open-in-browser" strategy="beforeInteractive">
          {OPEN_IN_BROWSER_SCRIPT}
        </Script>
        {children}
      </body>
    </html>
  );
}
