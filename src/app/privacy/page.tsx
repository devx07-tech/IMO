import type { Metadata } from "next";
import { ContactLinks, LegalPage, type LegalSection } from "@/components/recharge/LegalPage";
import { BUSINESS } from "@/lib/business";

export const metadata: Metadata = {
  title: "Privacy Policy — IMO Recharge",
  description:
    "How IMO Recharge collects, uses, and protects your information when you recharge your IMO account.",
};

const sections: LegalSection[] = [
  {
    title: "1. Who we are",
    body: (
      <p>
        IMO Recharge ({BUSINESS.domain}) (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is an independent online
        service operated by {BUSINESS.name}, an individual seller based in Tamil Nadu, India, that lets customers purchase IMO credits for an IMO account. We are
        not owned by, endorsed by, or affiliated with IMO or its parent company. This policy
        explains what information we collect when you use this website and what we do with it.
      </p>
    ),
  },
  {
    title: "2. Information we collect",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>
          <strong>Account identifier:</strong> the IMO ID or mobile number you enter so we know
          which account to recharge.
        </li>
        <li>
          <strong>Order details:</strong> the package, quantity, amount, order ID, payment
          status, recharge status, and the date and time of the order.
        </li>
        <li>
          <strong>WhatsApp number:</strong> the number you give at checkout, used to send you
          updates about your order and to let you look up your purchase history.
        </li>
        <li>
          <strong>Payment information:</strong> payments are processed by Razorpay. We receive
          the amount, the payment status, the payment method and Razorpay&apos;s payment
          reference. We never see or store your UPI PIN,
          card number or bank login.
        </li>
        <li>
          <strong>Support messages:</strong> anything you send us through WhatsApp or the IMO
          support link.
        </li>
        <li>
          <strong>Technical data:</strong> basic server logs such as IP address, browser type
          and request time, used to keep the service secure and working.
        </li>
      </ul>
    ),
  },
  {
    title: "3. How we use your information",
    body: (
      <ul className="list-disc space-y-1.5 pl-5">
        <li>To create your order, take payment, and credit your IMO account.</li>
        <li>To show you the status of an order when you look it up by Order ID.</li>
        <li>To provide customer support and resolve payment or recharge issues.</li>
        <li>To prevent fraud, abuse and duplicate or failed transactions.</li>
        <li>To meet legal, tax, accounting and audit obligations.</li>
      </ul>
    ),
  },
  {
    title: "4. We do not sell your data",
    body: (
      <p>
        We do not sell or rent your personal information, and we do not use it for third-party
        advertising.
      </p>
    ),
  },
  {
    title: "5. Who we share it with",
    body: (
      <>
        <p>We share information only with service providers needed to run the service:</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            <strong>Razorpay</strong> — our payment gateway. Your order amount, Order ID and
            WhatsApp number are sent to Razorpay to process the payment, under their own
            privacy policies. We don&apos;t send them your order details.
          </li>
          <li>
            <strong>Supabase</strong> — our database and hosting provider, where order records
            are stored.
          </li>
          <li>
            <strong>Messaging tools</strong> (such as Telegram or WhatsApp) — used internally to
            notify our team of new orders and to contact you about an order.
          </li>
        </ul>
        <p className="mt-2">
          We may also disclose information if required by law, court order, or to protect our
          rights and prevent fraud.
        </p>
      </>
    ),
  },
  {
    title: "6. How long we keep it",
    body: (
      <p>
        We keep order and payment records for as long as needed to provide support, handle
        disputes and refunds, and meet accounting and legal requirements. After that, records
        are deleted or anonymised.
      </p>
    ),
  },
  {
    title: "7. Security",
    body: (
      <p>
        The site runs over encrypted (HTTPS) connections and payments are handled by Razorpay&apos;s
        secure checkout. Order data is stored
        with access restricted to authorised administrators. No online service can guarantee
        absolute security, but we take reasonable steps to protect your information.
      </p>
    ),
  },
  {
    title: "8. Cookies",
    body: (
      <p>
        The public recharge pages do not use advertising or tracking cookies. The administrator
        area uses a session cookie to keep authorised staff signed in. Razorpay may set its own
        cookies during checkout to process and secure your payment.
      </p>
    ),
  },
  {
    title: "9. Your rights",
    body: (
      <p>
        Under applicable Indian law, including the Digital Personal Data Protection Act, 2023,
        you may ask us to confirm what personal data we hold about you, correct it, or delete it
        (subject to records we must keep by law), and you may withdraw consent for its use. To
        make a request, contact us using the details below and include your Order ID.
      </p>
    ),
  },
  {
    title: "10. Children",
    body: (
      <p>
        This service is intended for adults. If you are under 18, please use it only with a
        parent or guardian&rsquo;s involvement. We do not knowingly collect data from children.
      </p>
    ),
  },
  {
    title: "11. Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time. The &ldquo;last updated&rdquo; date above
        shows when it last changed. Continued use of the site after an update means you accept
        the revised policy.
      </p>
    ),
  },
  {
    title: "12. Contact us",
    body: (
      <>
        <ContactLinks />
        <p className="mt-2">{BUSINESS.address}</p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Privacy Policy" sections={sections} />;
}
