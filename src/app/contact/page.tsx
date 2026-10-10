import type { Metadata } from "next";
import { ContactLinks, LegalPage } from "@/components/recharge/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = { title: "Contact Us — IMO Recharge" };

export default function ContactPage() {
  return (
    <LegalPage
      title="Contact Us"
      sections={[
        {
          title: "Support",
          body: (
            <>
              <p>We are available for support round the clock. Reach us here:</p>
              <div className="mt-2">
                <ContactLinks />
              </div>
              <p className="mt-2">Please include your Order ID so we can help faster.</p>
            </>
          ),
        },
        {
          title: "Business details",
          body: (
            <>
              <p>
                {BUSINESS.name} (individual) — {BUSINESS.domain}
              </p>
              <p className="mt-1">{BUSINESS.address}</p>
            </>
          ),
        },
      ]}
    />
  );
}
