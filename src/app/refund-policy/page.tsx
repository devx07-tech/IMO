import type { Metadata } from "next";
import { ContactLinks, LegalPage } from "@/components/recharge/LegalPage";

export const metadata: Metadata = { title: "Refund Policy — IMO Recharge" };

export default function RefundPolicyPage() {
  return (
    <LegalPage
      title="Refund Policy"
      sections={[
        {
          title: "1. Digital goods",
          body: (
            <p>
              IMO credits are digital goods delivered straight to your IMO account. Once
              credits are delivered, the order cannot be cancelled or refunded.
            </p>
          ),
        },
        {
          title: "2. When you get a refund",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Your payment was successful but the credits were not delivered within 24
                hours. We will deliver the credits, or refund you if we cannot.
              </li>
              <li>You were charged more than once for the same order.</li>
            </ul>
          ),
        },
        {
          title: "3. When we cannot refund",
          body: (
            <ul className="list-disc space-y-1.5 pl-5">
              <li>You entered a wrong IMO ID and the credits were delivered to it.</li>
              <li>You changed your mind after delivery.</li>
              <li>Your IMO account was banned or restricted by IMO after delivery.</li>
            </ul>
          ),
        },
        {
          title: "4. Failed payments",
          body: (
            <p>
              If money was deducted but the order shows failed or pending, it is normally
              returned to your account automatically by your bank within 5–7 working days. If
              not, contact us with your Order ID.
            </p>
          ),
        },
        {
          title: "5. How to ask for a refund",
          body: (
            <>
              <p>
                Message us with your Order ID and IMO ID within 7 days of payment. Approved
                refunds go back to the original payment method within 5–7 working days.
              </p>
              <div className="mt-2">
                <ContactLinks />
              </div>
            </>
          ),
        },
      ]}
    />
  );
}
