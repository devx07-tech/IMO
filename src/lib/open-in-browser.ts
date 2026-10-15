// In-app browsers (IMO, WhatsApp, Instagram, Facebook...) often can't hand a
// payment over to UPI apps, so customers who tap a shared link are pushed
// straight to the real browser: Chrome on Android, Safari on iOS (17+).
// The script runs inline in <head>, before React loads, on every page load.

const IN_APP_RE = /\bwv\)|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Telegram|MicroMessenger|LinkedInApp|Twitter|\bimo\b/i;

// Marker on the fallback URL: when Chrome isn't installed the intent lands
// back in the same in-app view, and we must not redirect again (loop).
export const FALLBACK_PARAM = "_inapp";

export type BrowserContext = "android-in-app" | "ios-in-app" | "browser";

export function detectBrowserContext(ua: string): BrowserContext {
  if (/android/i.test(ua)) {
    // Android WebViews carry "; wv)" or a "Version/x.y" token real Chrome never sends.
    if (IN_APP_RE.test(ua) || (/Version\/[\d.]+/.test(ua) && /Chrome\//.test(ua))) {
      return "android-in-app";
    }
    return "browser";
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) return "browser";
    // Real Safari identifies itself; in-app views usually don't.
    if (IN_APP_RE.test(ua) || !/Safari\//.test(ua)) return "ios-in-app";
  }
  return "browser";
}

function withFallbackParam(href: string): string {
  const url = new URL(href);
  url.searchParams.set(FALLBACK_PARAM, "1");
  return url.toString();
}

export function externalBrowserUrl(context: BrowserContext, loc: Location): string | null {
  const { host, pathname, search, hash, href } = loc;
  if (context === "android-in-app") {
    return `intent://${host}${pathname}${search}${hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(withFallbackParam(href))};end`;
  }
  if (context === "ios-in-app") return `x-safari-https://${host}${pathname}${search}${hash}`;
  return null;
}

/**
 * Inline <head> script: redirect immediately, and if the in-app view blocked
 * that (some only allow app links from a user gesture), retry on first tap.
 */
export const OPEN_IN_BROWSER_SCRIPT = String.raw`(function(){try{
var L=location,ua=navigator.userAgent||"";
if(/^\/admin/.test(L.pathname))return;
if(new URLSearchParams(L.search).has("${FALLBACK_PARAM}"))return;
var re=${IN_APP_RE.toString()},path=L.host+L.pathname+L.search+L.hash,target=null;
if(/android/i.test(ua)){
if(re.test(ua)||(/Version\/[\d.]+/.test(ua)&&/Chrome\//.test(ua))){
var fb=new URL(L.href);fb.searchParams.set("${FALLBACK_PARAM}","1");
target="intent://"+path+"#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url="+encodeURIComponent(fb.toString())+";end";
}
}else if(/iphone|ipad|ipod/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)&&(re.test(ua)||!/Safari\//.test(ua))){
target="x-safari-https://"+path;
}
if(!target)return;
L.href=target;
var retried=false;
document.addEventListener("click",function(){if(retried)return;retried=true;L.href=target;},true);
}catch(e){}})();`;
