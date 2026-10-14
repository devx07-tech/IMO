import type { Metadata } from "next";
import { ContactLinks, LegalPage } from "@/components/recharge/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Terms & Conditions — IMO Recharge" };

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms & Conditions"
      sections={[
        {
          title: "1. About us",
          body: (
            <p>
              {BUSINESS.brand} ({BUSINESS.domain}) is run by {BUSINESS.name}, an individual
              seller. We sell IMO diamonds and coins top-ups. We are not affiliated with or
              endorsed by IMO.
            </p>
          ),
        },
        {
          title: "2. How it works",
          body: (
            <p>
              Choose a package, enter your IMO ID, and pay online by UPI. After payment is
              confirmed, the credits are added to that IMO account, usually within a few
              minutes.
            </p>
          ),
        },
        {
          title: "3. Your responsibility",
          body: (
            <p>
              Please check your IMO ID carefully before paying. Credits are sent to the ID you
              enter, and we cannot recover credits sent to a wrong ID that you entered.
            </p>
          ),
        },
        {
          title: "4. Prices and payment",
          body: (
            <p>
              All prices are in Indian Rupees (₹). UPI checkout and payment confirmation are
              provided by BaseUPI, with payments sent directly to our UPI account.
              Prices may change, but the price shown when you pay is the price you
              are charged.
            </p>
          ),
        },
        {
          title: "5. Refunds",
          body: (
            <p>
              Refunds are handled as described in our{" "}
              <a href="/refund-policy" className="font-medium text-accent hover:underline">
                Refund Policy
              </a>
              .
            </p>
          ),
        },
        {
          title: "6. Acceptable use",
          body: (
            <p>
              Use this site only for lawful purposes and with payment methods you are
              authorised to use. We may cancel orders we believe are fraudulent or abusive.
            </p>
          ),
        },
        {
          title: "7. Service availability",
          body: (
            <p>
              We try to keep the service running at all times, but delays can happen because
              of IMO, our payment partner, or technical issues. We are not liable for losses
              caused by events outside our control.
            </p>
          ),
        },
        {
          title: "8. Governing law",
          body: (
            <p>
              These terms are governed by the laws of India. Any dispute falls under the courts
              of Tamil Nadu.
            </p>
          ),
        },
        { title: "9. Contact", body: <ContactLinks /> },
      ]}
    />
  );
}
