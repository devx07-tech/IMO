// Browser handoff is best effort: the host app can block external schemes.
// /open explicitly requests a handoff even when IMO hides its user agent.

const IN_APP_RE = /\bwv\)|FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|Snapchat|Telegram|MicroMessenger|LinkedInApp|Twitter|\bimo\b/i;

// Marker on the fallback URL: when Chrome isn't installed the intent lands
// back in the same in-app view, and we must not redirect again (loop).
export const FALLBACK_PARAM = "_inapp";

export type BrowserContext = "android-in-app" | "ios-in-app" | "browser";

export function detectBrowserContext(ua: string, requestBrowser = false): BrowserContext {
  if (/android/i.test(ua)) {
    // Android WebViews carry "; wv)" or a "Version/x.y" token real Chrome never sends.
    if (requestBrowser || IN_APP_RE.test(ua) || (/Version\/[\d.]+/.test(ua) && /Chrome\//.test(ua))) {
      return "android-in-app";
    }
    return "browser";
  }
  if (/iphone|ipad|ipod/i.test(ua)) {
    if (requestBrowser) return "ios-in-app";
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

export function browserDestination(href: string): string {
  const url = new URL(href);
  if (/^\/open\/?$/.test(url.pathname)) url.pathname = "/";
  url.searchParams.delete(FALLBACK_PARAM);
  return url.toString();
}

export function externalBrowserUrl(context: BrowserContext, loc: Pick<Location, "href">): string | null {
  const { protocol, host, pathname, search, hash } = new URL(browserDestination(loc.href));
  if (context === "android-in-app") {
    return `intent://${host}${pathname}${search}${hash}#Intent;scheme=${protocol.slice(0, -1)};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(withFallbackParam(loc.href))};end`;
  }
  if (context === "ios-in-app") return `x-safari-https://${host}${pathname}${search}${hash}`;
  return null;
}

/**
 * Try once on load. If blocked, only the explicit browser link should retry;
 * intercepting every first tap also disrupts the form and copy-link fallback.
 */
export const OPEN_IN_BROWSER_SCRIPT = String.raw`(function(){try{
var L=location,ua=navigator.userAgent||"";
if(/^\/admin/.test(L.pathname))return;
if(new URLSearchParams(L.search).has("${FALLBACK_PARAM}"))return;
var requestBrowser=/^\/open\/?$/.test(L.pathname),dest=new URL(L.href);
if(requestBrowser)dest.pathname="/";
dest.searchParams.delete("${FALLBACK_PARAM}");
var re=${IN_APP_RE.toString()},path=dest.host+dest.pathname+dest.search+dest.hash,target=null;
if(/android/i.test(ua)){
if(requestBrowser||re.test(ua)||(/Version\/[\d.]+/.test(ua)&&/Chrome\//.test(ua))){
var fb=new URL(L.href);fb.searchParams.set("${FALLBACK_PARAM}","1");
target="intent://"+path+"#Intent;scheme="+dest.protocol.slice(0,-1)+";package=com.android.chrome;S.browser_fallback_url="+encodeURIComponent(fb.toString())+";end";
}
}else if(/iphone|ipad|ipod/i.test(ua)&&(requestBrowser||(!/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)&&(re.test(ua)||!/Safari\//.test(ua))))){
target="x-safari-https://"+path;
}
if(!target&&requestBrowser){L.replace(dest.toString());return;}
if(!target)return;
L.href=target;
}catch(e){}})();`;
