import type { Metadata } from "next";
import { Header } from "@/components/recharge/Header";
import { Footer } from "@/components/recharge/Footer";
import { OpenInBrowserNotice } from "@/components/recharge/OpenInBrowserNotice";

export const metadata: Metadata = {
  title: "Open Kamal Seller in your browser",
  robots: { index: false, follow: true },
};

// This page needs no database or payment provider to show browser instructions.
export default function OpenBrowserPage() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <h1 className="mb-4 text-2xl font-bold tracking-tight">Open Kamal Seller</h1>
        <OpenInBrowserNotice requestBrowser />
        <noscript>
          <p className="mt-4">Copy https://kamalseller.com into Chrome or Safari to continue.</p>
        </noscript>
      </main>
      <Footer />
    </>
  );
}
