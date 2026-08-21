import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  COMPANY,
  LEGAL_DOCS,
  LEGAL_STATUS,
  type LegalDoc,
  type LegalDocId,
} from "@/lib/marketing/legal";

/**
 * One renderer for all four legal documents.
 *
 * These pages have a different job from the rest of the marketing site — they
 * are read, not scanned, sometimes by a procurement reviewer working through a
 * checklist. So the type is set for continuous reading (a single measure around
 * 68 characters, generous leading) rather than the display-heavy register the
 * homepage uses, and every section carries an anchor so someone can send a
 * colleague a link to the clause rather than to the page.
 *
 * It still belongs to the marketing surface: sand ground, `slate` ink, the same
 * hairlines. It is a quieter room in the same building, not a different one.
 */
export function LegalDocument({ doc }: { doc: LegalDoc }) {
  const others = (Object.keys(LEGAL_DOCS) as LegalDocId[])
    .filter((id) => id !== doc.id)
    .map((id) => LEGAL_DOCS[id]);

  return (
    <div className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-16">
          <article className="max-w-[42rem]">
            <p className="text-[0.75rem] font-medium uppercase tracking-[0.08em] text-slate-muted">
              Legal
            </p>
            <h1 className="mt-3 text-h1 text-slate">{doc.title}</h1>
            <p className="mt-6 text-lead text-slate-muted">{doc.standfirst}</p>

            <p className="mt-8 text-[0.8125rem] text-slate-muted">
              Last updated {doc.updated}
            </p>

            {/* Draft disclosure. Deliberately part of the document rather than a
                dismissible banner — it is a statement about the document's
                status, so it belongs where the document is read. */}
            <aside
              aria-label="Status of this document"
              className="mt-6 rounded-2xl border border-sand-line bg-sand-deep/60 p-5"
            >
              <h2 className="text-[0.8125rem] font-semibold text-slate">
                Status: draft
              </h2>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-slate-muted">
                {LEGAL_STATUS}
              </p>
              {doc.statusNote && (
                <p className="mt-3 text-[0.875rem] leading-relaxed text-slate-muted">
                  {doc.statusNote}
                </p>
              )}
            </aside>

            {doc.sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                className="mt-12 scroll-mt-28"
              >
                <h2 className="text-[1.25rem] font-semibold leading-snug text-slate">
                  <span className="mr-2 font-normal tabular text-slate-muted">
                    {i + 1}.
                  </span>
                  {section.heading}
                </h2>

                {section.body?.map((para) => (
                  <p
                    key={para.slice(0, 40)}
                    className="mt-4 text-[0.9375rem] leading-[1.75] text-slate-soft"
                  >
                    {para}
                  </p>
                ))}

                {section.list && (
                  <ul className="mt-4 flex flex-col gap-3">
                    {section.list.map((item) => (
                      <li
                        key={item.slice(0, 40)}
                        className="flex gap-3 text-[0.9375rem] leading-[1.75] text-slate-soft"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[0.6875rem] size-1.5 shrink-0 rounded-full bg-slate-muted"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {section.rows && (
                  <dl className="mt-5 divide-y divide-sand-line border-y border-sand-line">
                    {section.rows.map((row) => (
                      <div
                        key={row.term}
                        className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr] sm:gap-6"
                      >
                        <dt className="text-[0.875rem] font-medium text-slate">
                          {row.term}
                        </dt>
                        <dd className="text-[0.9375rem] leading-[1.7] text-slate-soft">
                          {row.detail}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ))}

            <div className="mt-14 border-t border-sand-line pt-6">
              <p className="text-[0.875rem] leading-relaxed text-slate-muted">
                Questions about this document? Write to{" "}
                <a
                  href={`mailto:${COMPANY.legalEmail}`}
                  className="font-medium text-slate underline decoration-sand-line underline-offset-4 transition-colors hover:decoration-slate"
                >
                  {COMPANY.legalEmail}
                </a>
                . {COMPANY.legalName}, {COMPANY.city}, {COMPANY.country}.
              </p>
            </div>
          </article>

          {/* Contents + siblings. Sticky on desktop so a long document keeps its
              navigation; a plain block on mobile, above nothing, so it does not
              stand between the reader and the first clause. */}
          <nav
            aria-label="On this page"
            className="order-first lg:order-none lg:sticky lg:top-28 lg:self-start"
          >
            <h2 className="text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-slate-muted">
              On this page
            </h2>
            <ol className="mt-4 flex flex-col gap-2.5">
              {doc.sections.map((section, i) => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    className="flex gap-2 text-[0.8125rem] leading-snug text-slate-muted transition-colors hover:text-slate"
                  >
                    <span className="tabular">{i + 1}.</span>
                    <span>{section.heading}</span>
                  </a>
                </li>
              ))}
            </ol>

            <h2 className="mt-9 border-t border-sand-line pt-6 text-[0.75rem] font-semibold uppercase tracking-[0.08em] text-slate-muted">
              Other documents
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {others.map((other) => (
                <li key={other.id}>
                  <Link
                    href={`/${other.id}`}
                    className="group/doc inline-flex items-center gap-1.5 text-[0.8125rem] text-slate-muted transition-colors hover:text-slate"
                  >
                    {other.label}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-3.5 transition-transform duration-200 ease-[var(--ease-out-soft)] group-hover/doc:-translate-y-0.5 group-hover/doc:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </div>
  );
}
