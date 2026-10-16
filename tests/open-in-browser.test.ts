import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import {
  browserDestination,
  detectBrowserContext,
  externalBrowserUrl,
  OPEN_IN_BROWSER_SCRIPT,
} from "@/lib/open-in-browser";

const androidChrome = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36";
const androidImo = "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36 imo";
const iphoneSafari = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1";
const iphoneImo = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 imo";

function runScript(ua: string, href: string) {
  const url = new URL(href);
  const location = {
    href, host: url.host, pathname: url.pathname, search: url.search, hash: url.hash,
    replace: vi.fn(),
  };
  const document = { addEventListener: vi.fn() };
  runInNewContext(OPEN_IN_BROWSER_SCRIPT, {
    location, navigator: { userAgent: ua }, URL, URLSearchParams, document,
  }, { timeout: 1000 });
  return { location, document };
}

describe("external browser handoff", () => {
  it("distinguishes in-app views from normal browsers", () => {
    expect(detectBrowserContext(androidChrome)).toBe("browser");
    expect(detectBrowserContext(iphoneSafari)).toBe("browser");
    expect(detectBrowserContext(androidImo)).toBe("android-in-app");
    expect(detectBrowserContext(iphoneImo)).toBe("ios-in-app");
  });

  it("allows the dedicated link to work when the app hides its identity", () => {
    expect(detectBrowserContext(androidChrome, true)).toBe("android-in-app");
    expect(detectBrowserContext(iphoneSafari, true)).toBe("ios-in-app");
  });

  it("preserves order/history links while removing the fallback marker and /open", () => {
    expect(browserDestination("https://kamalseller.shop/open?history=123456789&_inapp=1#transaction-history"))
      .toBe("https://kamalseller.shop/?history=123456789#transaction-history");
    expect(browserDestination("https://kamalseller.shop/contact?from=imo"))
      .toBe("https://kamalseller.shop/contact?from=imo");
  });

  it.each([
    [androidImo, "https://kamalseller.shop/?order=IMO-ABCDE12345"],
    [iphoneImo, "https://kamalseller.shop/?history=123456789#transaction-history"],
    [androidChrome, "https://kamalseller.shop/open?history=123456789#transaction-history"],
    [iphoneSafari, "https://kamalseller.shop/open/"],
    [androidImo, "http://localhost:3000/open"],
  ])("makes the automatic script and manual link agree for %s at %s", (ua, href) => {
    const context = detectBrowserContext(ua, /^\/open\/?$/.test(new URL(href).pathname));
    const { location, document } = runScript(ua, href);
    expect(location.href).toBe(externalBrowserUrl(context, { href }));
    expect(location.replace).not.toHaveBeenCalled();
    // Copy, support and form taps must never be intercepted for a second launch.
    expect(document.addEventListener).not.toHaveBeenCalled();
  });

  it("returns to the instructions with a marker if Chrome cannot launch", () => {
    const href = "https://kamalseller.shop/open?order=IMO-ABCDE12345";
    const intent = externalBrowserUrl("android-in-app", { href })!;
    const fallback = decodeURIComponent(intent.split("S.browser_fallback_url=")[1].split(";end")[0]);
    expect(fallback).toBe(`${href}&_inapp=1`);
    const { location } = runScript(androidImo, fallback);
    expect(location.href).toBe(fallback);
    expect(location.replace).not.toHaveBeenCalled();
    expect(externalBrowserUrl("android-in-app", { href: fallback })).toContain("intent://kamalseller.shop/?order=IMO-ABCDE12345#Intent;");
  });

  it.each([androidChrome, iphoneSafari, "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"])(
    "leaves ordinary browser visits alone: %s", (ua) => {
      const href = "https://kamalseller.shop/";
      const { location } = runScript(ua, href);
      expect(location.href).toBe(href);
      expect(location.replace).not.toHaveBeenCalled();
    }
  );

  it("sends desktop /open visitors to the homepage with their order intact", () => {
    const { location } = runScript("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "https://kamalseller.shop/open?order=IMO-ABCDE12345");
    expect(location.replace).toHaveBeenCalledWith("https://kamalseller.shop/?order=IMO-ABCDE12345");
  });

  it("does not launch a browser from admin pages", () => {
    const href = "https://kamalseller.shop/admin/login";
    const { location } = runScript(androidImo, href);
    expect(location.href).toBe(href);
    expect(location.replace).not.toHaveBeenCalled();
  });
});
