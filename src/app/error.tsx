"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[720px] flex-1 items-center px-4 py-12 sm:px-6">
      <section className="w-full rounded-card bg-surface p-8 text-center shadow-card">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">
          Please try again. If you were making a payment, don&apos;t pay twice — check your
          order status or contact support first.
        </p>
        {error.digest && (
          <p className="mt-3 font-mono text-xs text-muted">Reference: {error.digest}</p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => retry()}
            className="rounded-button bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent-dark"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-button border border-border-strong px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-background"
          >
            Go home
          </Link>
        </div>
      </section>
    </main>
  );
}
