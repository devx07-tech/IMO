import Link from "next/link";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { BUSINESS } from "@/lib/business";

export interface LegalSection {
  title: string;
  body: React.ReactNode;
}

export function LegalPage({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <>
      <Header />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <article className="rounded-card bg-surface p-5 shadow-card sm:p-8">
          <Link href="/" className="text-sm font-medium text-accent hover:underline">
            ← Back to recharge
          </Link>

          <h1 className="mt-4 text-[26px] font-bold tracking-tight text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-muted">Last updated: {BUSINESS.lastUpdated}</p>

          <div className="mt-6 space-y-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                <div className="mt-2 text-sm leading-relaxed text-foreground/80">
                  {section.body}
                </div>
              </section>
            ))}
          </div>
        </article>
      </main>

      <Footer />
    </>
  );
}

export function ContactLinks() {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      <li>
        WhatsApp:{" "}
        <a
          href={BUSINESS.whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent hover:underline"
        >
          {BUSINESS.whatsappDisplay}
        </a>
      </li>
      <li>
        IMO:{" "}
        <a
          href={BUSINESS.imoSupportLink}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-accent hover:underline"
        >
          {BUSINESS.imoSupportLink}
        </a>
      </li>
    </ul>
  );
}
