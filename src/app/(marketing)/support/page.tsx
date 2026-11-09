import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Mail } from "lucide-react";
import { COMPANY } from "@/lib/marketing/legal";
import { SITE_URL } from "@/lib/marketing/site";
import {
  SUPPORT,
  SUPPORT_LINKS,
  type SupportPara,
} from "@/lib/marketing/support";

export const metadata: Metadata = {
  title: SUPPORT.title,
  description: SUPPORT.description,
  alternates: { canonical: `${SITE_URL}/support` },
};

const TEXT_LINK =
  "font-medium text-slate underline decoration-sand-line underline-offset-4 transition-colors hover:decoration-slate";

/** A paragraph's text, with its links. `mailto:` is a plain anchor, a path is a `Link`. */
function Para({ children }: { children: SupportPara }) {
  if (typeof children === "string") return <>{children}</>;
  return (
    <>
      {children.map((piece, i) => {
        if (typeof piece === "string") return piece;
        return piece.href.startsWith("mailto:") ? (
          <a key={i} href={piece.href} className={TEXT_LINK}>
            {piece.text}
          </a>
        ) : (
          <Link key={i} href={piece.href} className={TEXT_LINK}>
            {piece.text}
          </Link>
        );
      })}
    </>
  );
}

/**
 * The page the App Store's Support URL points at, and the one place on the site
 * that says how to reach a person. Set like the legal pages (one narrow column,
 * read rather than scanned) with the address first, because that is what
 * somebody arrives for.
 */
export default function SupportPage() {
  return (
    <div className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page">
        <article className="max-w-2xl">
          <p className="text-meta font-medium text-slate-muted">
            {SUPPORT.title}
          </p>
          <h1 className="mt-3 text-h1 text-slate">{SUPPORT.heading}</h1>
          <p className="mt-6 text-lead text-slate-muted">
            {SUPPORT.standfirst}
          </p>

          <section
            aria-labelledby="contact-heading"
            className="mt-10 rounded-2xl border border-sand-line bg-white/70 p-6"
          >
            <h2
              id="contact-heading"
              className="flex items-center gap-2 text-body-md font-medium text-slate"
            >
              <Mail aria-hidden="true" className="size-4 text-slate-muted" />
              {SUPPORT.contact.label}
            </h2>
            <p className="mt-3 text-body leading-relaxed">
              <a
                href={`mailto:${COMPANY.supportEmail}`}
                className="text-[1.25rem] font-semibold text-slate underline decoration-sand-line underline-offset-4 transition-colors hover:decoration-slate"
              >
                {COMPANY.supportEmail}
              </a>
            </p>
            <p className="mt-2 text-body-sm leading-relaxed text-slate-muted">
              {SUPPORT.contact.note}
            </p>
          </section>

          {SUPPORT.sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="mt-12 scroll-mt-28"
            >
              <h2 className="text-[1.25rem] font-semibold leading-snug text-slate">
                {section.heading}
              </h2>

              {section.body.map((para, i) => (
                <p key={i} className="mt-4 text-body leading-[1.75]">
                  <Para>{para}</Para>
                </p>
              ))}

              {section.list && (
                <ul className="mt-4 flex flex-col gap-3">
                  {section.list.map((item) => (
                    <li
                      key={item.slice(0, 40)}
                      className="flex gap-3 text-body leading-[1.75]"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-2.75 size-1.5 shrink-0 rounded-full bg-slate-muted"
                      />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              {section.after && (
                <p className="mt-4 text-body leading-[1.75]">
                  <Para>{section.after}</Para>
                </p>
              )}
            </section>
          ))}

          <section aria-labelledby="elsewhere-heading" className="mt-12">
            <h2
              id="elsewhere-heading"
              className="text-[1.25rem] font-semibold leading-snug text-slate"
            >
              Elsewhere on this site
            </h2>
            <ul className="mt-4 divide-y divide-sand-line border-y border-sand-line">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="group/link flex items-start justify-between gap-4 py-4"
                  >
                    <span>
                      <span className="block text-body-md font-medium text-slate">
                        {link.label}
                      </span>
                      <span className="mt-1 block text-body-sm leading-relaxed text-slate-muted">
                        {link.note}
                      </span>
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-slate-muted transition-transform duration-200 ease-out-soft group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </div>
  );
}
