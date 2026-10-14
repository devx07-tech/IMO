"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ExternalLink } from "lucide-react";

// In-app browsers (IMO, WhatsApp, Instagram, Facebook...) often can't hand a
// payment over to UPI apps. On Android we move the page to Chrome once per
// session; the banner stays as a manual fallback. iOS can't be redirected.

type Context = "android-in-app" | "ios-in-app" | "browser";

const IN_APP_RE = /\bwv\)|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|\bimo\b/i;
const REDIRECT_FLAG = "imo-open-in-chrome-tried";

function detect(): Context {
  const ua = navigator.userAgent;
  if (!IN_APP_RE.test(ua)) return "browser";
  if (/android/i.test(ua)) return "android-in-app";
  // Real Safari and Chrome on iOS identify themselves; in-app views usually don't.
  if (/iphone|ipad|ipod/i.test(ua) && !/Safari\//.test(ua)) return "ios-in-app";
  return "browser";
}

function chromeIntentUrl(): string {
  const { host, pathname, search, hash, href } = window.location;
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}

const noopSubscribe = () => () => {};

export function OpenInBrowserNotice() {
  const context = useSyncExternalStore(noopSubscribe, detect, () => "browser" as Context);

  useEffect(() => {
    if (context !== "android-in-app") return;
    try {
      if (sessionStorage.getItem(REDIRECT_FLAG)) return;
      sessionStorage.setItem(REDIRECT_FLAG, "1");
    } catch {
      return; // no storage: don't risk a redirect loop, keep the banner only
    }
    window.location.href = chromeIntentUrl();
  }, [context]);

  if (context === "browser") return null;

  return (
    <div className="rounded-card border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-foreground">
      {context === "android-in-app" ? (
        <>
          <p>For a smooth payment, open this page in Chrome.</p>
          <a
            href={chromeIntentUrl()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-button bg-accent px-3 py-2 text-xs font-semibold text-white"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open in Chrome
          </a>
        </>
      ) : (
        <p>
          For a smooth payment, open this page in Safari: tap the <strong>⋯</strong> or share button
          and choose <strong>Open in Safari</strong> (or Open in browser).
        </p>
      )}
    </div>
  );
}
