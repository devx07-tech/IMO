"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import QRCode from "qrcode";
import { Download, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import { buildUpiLink, formatPaise, type UpiApp } from "@/lib/upi";
import { PaymentAppIcon, type PaymentAppIconName } from "./PaymentAppIcon";

export interface UpiPaymentInfo {
  orderNumber: string;
  amountPaise: number;
  expiresAt: string | null;
  utrSubmitted: boolean;
}

type Device = "android" | "ios" | "desktop";
const noopSubscribe = () => () => {};
function useDevice(): Device {
  return useSyncExternalStore(
    noopSubscribe,
    () => /android/i.test(navigator.userAgent) ? "android"
      : /iphone|ipad|ipod/i.test(navigator.userAgent) ? "ios" : "desktop",
    () => "desktop"
  );
}

function useSecondsLeft(expiresAt: string | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!expiresAt) return null;
  return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
}

type Route = keyof typeof BUSINESS.upi.routes;

/** The UPI ID a checkout option pays to (see BUSINESS.upi.routes). */
function upiIdFor(route: Route): string {
  return BUSINESS.upi.routes[route] === "merchant" ? BUSINESS.upi.merchantId : BUSINESS.upi.personalId;
}

const APP_BUTTONS: { app: PaymentAppIconName & UpiApp; label: string }[] = [
  { app: "gpay", label: "Google Pay" },
  { app: "phonepe", label: "PhonePe" },
  { app: "paytm", label: "Paytm" },
];

export function UpiPaymentPanel({
  payment,
  onSubmitUtr,
  onCancel,
  onCancelOrder,
}: {
  payment: UpiPaymentInfo;
  onSubmitUtr: (utr: string) => Promise<string | null>;
  onCancel: () => void;
  onCancelOrder: () => Promise<string | null>;
}) {
  const device = useDevice();
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const secondsLeft = useSecondsLeft(payment.expiresAt);
  const amount = formatPaise(payment.amountPaise);
  const onPhone = device !== "desktop";
  const qrVisible = !onPhone || showQr;

  const link = (route: Route, app: UpiApp = "upi") => buildUpiLink({
    vpa: upiIdFor(route),
    payeeName: BUSINESS.upi.payeeName,
    amountPaise: payment.amountPaise,
    note: payment.orderNumber,
  }, app, device === "ios" ? "ios" : "android");
  // The QR is scanned, which the merchant ID accepts.
  const qrLink = link("qr");

  useEffect(() => {
    if (!qrVisible) return;
    let active = true;
    QRCode.toDataURL(qrLink, { margin: 3, width: 560, errorCorrectionLevel: "M" })
      .then((url) => { if (active) setQr(url); })
      .catch(() => { if (active) setQr(null); });
    return () => { active = false; };
  }, [qrLink, qrVisible]);

  const minutes = secondsLeft === null ? null : Math.floor(secondsLeft / 60);
  const seconds = secondsLeft === null ? null : String(secondsLeft % 60).padStart(2, "0");

  return (
    <div>
      <div className="text-center">
        <p className="text-sm text-muted">Pay exactly</p>
        <p className="mt-1 text-3xl font-bold tracking-tight text-foreground">₹{amount}</p>
        <p className="mt-1 text-xs text-muted">
          This exact amount identifies your order. Don&apos;t change it in your UPI app.
        </p>
        <p className="mt-2 text-xs text-muted">
          To <span className="font-medium text-foreground">{BUSINESS.upi.payeeName}</span>
        </p>
      </div>

      {onPhone && (
        <div className="mt-5 space-y-2">
          <p className="text-center text-xs font-medium text-foreground">Tap your UPI app to pay</p>
          <div className="grid grid-cols-3 gap-2">
            {APP_BUTTONS.map(({ app, label }) => (
              <a key={app} href={link(app, app)} aria-label={`Pay ₹${amount} with ${label}`}
                className="flex flex-col items-center gap-1 rounded-button border border-border-strong px-2 py-2.5 text-center text-xs font-semibold text-foreground hover:border-accent hover:text-accent">
                <PaymentAppIcon app={app} className="h-6 w-auto max-w-full object-contain" />
                {label}
              </a>
            ))}
          </div>
          <a href={link("other")} className="flex w-full items-center justify-center gap-2 rounded-button border border-border-strong px-4 py-2.5 text-xs font-semibold text-foreground hover:border-accent hover:text-accent">
            <Smartphone className="h-4 w-4" aria-hidden="true" />
            Other UPI apps (BHIM, CRED, Amazon Pay, bank apps)
          </a>
          <button type="button" onClick={() => setShowQr((value) => !value)} className="w-full text-xs font-medium text-accent hover:underline">
            {showQr ? "Hide QR code" : "Paying from another phone? Show QR code"}
          </button>
        </div>
      )}

      {qrVisible && (
        <div className="mt-4 flex flex-col items-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={qr} alt={`UPI QR code to pay ₹${amount}`} width={200} height={200} className="rounded-input border border-border bg-white" />
          ) : (
            <div className="flex h-[200px] w-[200px] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted" aria-hidden="true" /></div>
          )}
          <p className="mt-2 text-center text-xs text-muted">Scan with any UPI app. The amount is filled in for you.</p>
          {onPhone && qr && (
            <a href={qr} download={`pay-${amount}-${payment.orderNumber}.png`}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:underline">
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Save QR to gallery (scan it from your UPI app)
            </a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-2 rounded-input bg-background px-3 py-2.5 text-xs text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" aria-hidden="true" />
        <span>
          Waiting for your payment. This screen updates by itself.
          {minutes !== null && secondsLeft! > 0 && <> Time left {minutes}:{seconds}</>}
        </span>
      </div>

      <UtrForm onSubmit={onSubmitUtr} submitted={payment.utrSubmitted} />

      <div className="mt-4 flex items-center justify-between text-xs">
        <span className="inline-flex items-center gap-1 text-muted"><ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />Order {payment.orderNumber}</span>
        <button type="button" onClick={onCancel} className="font-medium text-muted hover:text-foreground">Close</button>
      </div>
      <CancelOrderButton onCancelOrder={onCancelOrder} />
    </div>
  );
}

/** Two-step cancel so a customer who already paid doesn't cancel by mistake. */
export function CancelOrderButton({ onCancelOrder }: { onCancelOrder: () => Promise<string | null> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cancel = async () => {
    setBusy(true); setError("");
    const failure = await onCancelOrder();
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <div className="mt-3 text-center text-xs">
      {confirming ? (
        <div className="rounded-input border border-border bg-background p-3">
          <p className="text-foreground">Only cancel if you have <strong>not</strong> paid. If money was debited, enter your UTR instead.</p>
          <div className="mt-2 flex justify-center gap-2">
            <button type="button" disabled={busy} onClick={() => void cancel()}
              className="rounded-button bg-error px-3 py-1.5 font-semibold text-white disabled:opacity-60">
              {busy ? "Cancelling..." : "I haven't paid, cancel order"}
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirming(false)}
              className="rounded-button border border-border-strong px-3 py-1.5 font-semibold text-foreground">Keep order</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="font-medium text-error hover:underline">Cancel order</button>
      )}
      {error && <p role="alert" className="mt-1 text-error">{error}</p>}
    </div>
  );
}

/** Fallback when automatic confirmation is slow: the customer enters their 12-digit UTR. */
export function UtrForm({ onSubmit, submitted, defaultOpen = false }: {
  onSubmit: (utr: string) => Promise<string | null>;
  submitted: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [utr, setUtr] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (submitted) {
    return <p className="mt-3 text-center text-xs text-muted">We received your UTR and are checking it with our account.</p>;
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 w-full text-xs font-medium text-accent hover:underline">
        Paid but still waiting? Enter your UPI reference number
      </button>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = utr.replace(/\s+/g, "");
    if (!/^\d{12}$/.test(value)) { setError("The UTR is the 12-digit number in your UPI app's payment details."); return; }
    setBusy(true); setError("");
    const failure = await onSubmit(value);
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <form onSubmit={submit} className="mt-3">
      <label htmlFor="utr" className="text-xs font-medium text-foreground">UPI reference number (UTR)</label>
      <div className="mt-1 flex gap-2">
        <input id="utr" inputMode="numeric" autoComplete="off" maxLength={14} value={utr}
          onChange={(e) => setUtr(e.target.value.replace(/[^\d\s]/g, ""))} placeholder="12-digit number"
          className="min-w-0 flex-1 rounded-input border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/40" />
        <button type="submit" disabled={busy} className="rounded-button bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
          {busy ? "Checking..." : "Submit"}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-error">{error}</p>}
      <p className="mt-1 text-[11px] text-muted">Find it in your UPI app under the payment&apos;s details (also called UPI Ref No. or Transaction ID).</p>
    </form>
  );
}
