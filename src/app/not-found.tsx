import type { Metadata } from "next";
import Link from "next/link";
import { Header } from "@/components/recharge/Header";
import { Footer } from "@/components/recharge/Footer";

export const metadata: Metadata = {
  title: "Page not found — IMO Recharge",
  robots: { index: false },
};

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-card bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-semibold text-accent">404</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground">Page not found</h1>
          <p className="mt-2 text-sm text-muted">
            The page you&apos;re looking for doesn&apos;t exist or has moved.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center rounded-button bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            Back to recharge
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
