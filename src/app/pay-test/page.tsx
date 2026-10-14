import type { Metadata } from "next";
import { PayTestButtons } from "./PayTestButtons";

// TEMPORARY: ₹1 test of which UPI apps accept payments opened from the website.
// Not linked anywhere and hidden from search engines. Delete after the test.
export const metadata: Metadata = {
  title: "UPI test",
  robots: { index: false, follow: false },
};

export default function PayTestPage() {
  return (
    <main className="mx-auto w-full max-w-[480px] px-4 py-6">
      <h1 className="text-xl font-bold text-foreground">UPI ₹1 test</h1>
      <p className="mt-1 text-sm text-muted">
        Open this page on your phone. Tap each button, pay ₹1 from someone else&apos;s UPI account,
        and note whether it says <strong>Success</strong> or shows an error.
      </p>
      <PayTestButtons />
    </main>
  );
}
