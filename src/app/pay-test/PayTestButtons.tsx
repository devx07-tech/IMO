"use client";

import { useSyncExternalStore } from "react";

// TEMPORARY test buttons. Each opens a UPI app with ₹1 prefilled and a test
// note (e.g. TEST-P1) so the payment can be identified in the receiving app.

type App = "any" | "gpay" | "phonepe" | "paytm";

const PERSONAL = "kamal6382371168@okicici";
const MERCHANT = "paytm.s2sovgg@pty";
const NAME = "Kamal Srinivasan";

const TESTS: { id: string; vpa: string; app: App; label: string }[] = [
  { id: "P1", vpa: PERSONAL, app: "any", label: "Personal ID · any UPI app" },
  { id: "P2", vpa: PERSONAL, app: "gpay", label: "Personal ID · Google Pay" },
  { id: "P3", vpa: PERSONAL, app: "phonepe", label: "Personal ID · PhonePe" },
  { id: "P4", vpa: PERSONAL, app: "paytm", label: "Personal ID · Paytm" },
  { id: "M1", vpa: MERCHANT, app: "paytm", label: "Merchant ID · Paytm" },
  { id: "M2", vpa: MERCHANT, app: "phonepe", label: "Merchant ID · PhonePe" },
  { id: "M3", vpa: MERCHANT, app: "any", label: "Merchant ID · any UPI app" },
  { id: "M4", vpa: MERCHANT, app: "gpay", label: "Merchant ID · Google Pay" },
];

const ANDROID_PACKAGE: Record<Exclude<App, "any">, string> = {
  gpay: "com.google.android.apps.nbu.paisa.user",
  phonepe: "com.phonepe.app",
  paytm: "net.one97.paytm",
};
const IOS_PREFIX: Record<Exclude<App, "any">, string> = {
  gpay: "gpay://upi/pay",
  phonepe: "phonepe://pay",
  paytm: "paytmmp://pay",
};

function link(vpa: string, app: App, id: string, ios: boolean): string {
  const query = `pa=${vpa}&pn=${encodeURIComponent(NAME)}&am=1.00&cu=INR&tn=TEST-${id}`;
  if (app === "any") return `upi://pay?${query}`;
  if (ios) return `${IOS_PREFIX[app]}?${query}`;
  return `intent://pay?${query}#Intent;scheme=upi;package=${ANDROID_PACKAGE[app]};end`;
}

const noopSubscribe = () => () => {};

export function PayTestButtons() {
  const ios = useSyncExternalStore(noopSubscribe, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);
  return (
    <ol className="mt-5 space-y-3">
      {TESTS.map((test) => (
        <li key={test.id}>
          <a href={link(test.vpa, test.app, test.id, ios)}
            className="flex items-center gap-3 rounded-card border border-border-strong bg-surface px-4 py-3 text-sm font-semibold text-foreground hover:border-accent">
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs text-white">{test.id}</span>
            <span>{test.label} · pay ₹1</span>
          </a>
        </li>
      ))}
    </ol>
  );
}
