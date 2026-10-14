// Official app logos in public/payment-apps/. Google Pay and Paytm come from
// their Wikimedia Commons brand files, PhonePe from Simple Icons (CC0). The
// logos are trademarks of their owners, used only to label the app buttons.

const ICONS = {
  gpay: { src: "/payment-apps/gpay.svg", width: 64, height: 24 },
  phonepe: { src: "/payment-apps/phonepe.svg", width: 24, height: 24 },
  paytm: { src: "/payment-apps/paytm.svg", width: 64, height: 20 },
} as const;

export type PaymentAppIconName = keyof typeof ICONS;

export function PaymentAppIcon({ app, className }: { app: PaymentAppIconName; className?: string }) {
  const icon = ICONS[app];
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static SVG, no optimisation needed
    <img src={icon.src} alt="" aria-hidden="true" width={icon.width} height={icon.height} className={className} />
  );
}
