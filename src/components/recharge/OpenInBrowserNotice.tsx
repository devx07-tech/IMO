"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import { browserDestination, detectBrowserContext, externalBrowserUrl } from "@/lib/open-in-browser";

const noopSubscribe = () => () => {};

export function OpenInBrowserNotice({ requestBrowser = false }: { requestBrowser?: boolean }) {
  const [copyStatus, setCopyStatus] = useState("");
  const linkInput = useRef<HTMLInputElement>(null);
  const snapshot = useSyncExternalStore(
    noopSubscribe,
    () => `${navigator.userAgent}\n${window.location.href}`,
    () => ""
  );
  const separator = snapshot.indexOf("\n");
  const ua = snapshot.slice(0, separator);
  const currentUrl = snapshot ? snapshot.slice(separator + 1) : BUSINESS.siteUrl;
  const context = detectBrowserContext(ua, requestBrowser);

  if (context === "browser" && !requestBrowser) return null;
  const destination = browserDestination(currentUrl);
  const href = externalBrowserUrl(context, { href: currentUrl }) ?? destination;
  const browser = context === "android-in-app" ? "Chrome" : context === "ios-in-app" ? "Safari" : "browser";

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(destination);
      setCopyStatus("Link copied. Paste it into Chrome or Safari.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setCopyStatus("Press and hold the selected link to copy it, then paste it into your browser.");
    }
  }

  return (
    <div className="rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-foreground">
      <p>Open Kamal Seller in your browser to recharge and pay.</p>
      <a
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 rounded-button bg-accent px-4 py-3 text-sm font-semibold text-white"
      >
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Open in {browser}
      </a>
      <p className="mt-3 text-sm">
        Still inside IMO? Use its menu or share button and choose <strong>Open in browser</strong>
        {context === "ios-in-app" ? " or Open in Safari" : ""}. If that option is unavailable,
        copy this link and paste it into Chrome or Safari.
      </p>
      <label className="mt-3 block text-xs font-medium">
        Website link
        <input
          ref={linkInput}
          readOnly
          value={destination}
          onFocus={(event) => event.currentTarget.select()}
          className="mt-1 block w-full rounded-input border border-warning/40 bg-surface px-3 py-2 text-sm"
        />
      </label>
      <button type="button" onClick={copyLink} className="mt-2 inline-flex min-h-11 items-center gap-1.5 font-semibold text-accent">
        <Copy className="h-4 w-4" aria-hidden="true" />
        Copy link
      </button>
      <p role="status" className="text-xs text-muted">{copyStatus}</p>
    </div>
  );
}
