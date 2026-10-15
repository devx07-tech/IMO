"use client";

import { useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";
import { BrowserContext, detectBrowserContext, externalBrowserUrl } from "@/lib/open-in-browser";

// The automatic redirect lives in the root layout's <head> script; this banner
// is the manual fallback when an in-app browser refuses it.

const noopSubscribe = () => () => {};

export function OpenInBrowserNotice() {
  const context = useSyncExternalStore(
    noopSubscribe,
    () => detectBrowserContext(navigator.userAgent),
    () => "browser" as BrowserContext
  );

  if (context === "browser") return null;
  const href = externalBrowserUrl(context, window.location) ?? undefined;

  return (
    <div className="rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-foreground">
      {context === "android-in-app" ? (
        <>
          <p>For a smooth payment, open this page in Chrome.</p>
          <a
            href={href}
            className="mt-2 inline-flex items-center gap-1.5 rounded-button bg-accent px-3 py-2 text-xs font-semibold text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Chrome
          </a>
        </>
      ) : (
        <>
          <p>
            For a smooth payment, open this page in Safari: tap the <strong>⋯</strong> or share
            button and choose <strong>Open in Safari</strong> (or Open in browser).
          </p>
          <a
            href={href}
            className="mt-2 inline-flex items-center gap-1.5 rounded-button bg-accent px-3 py-2 text-xs font-semibold text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Safari
          </a>
        </>
      )}
    </div>
  );
}
