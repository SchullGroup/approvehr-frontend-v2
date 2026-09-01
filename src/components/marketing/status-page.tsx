import type { ReactNode } from "react";
import { LogoMark } from "@/components/brand/logo";

/**
 * The shared shell behind this app's route-level dead ends: `app/not-found.tsx`,
 * `app/error.tsx`, `app/global-error.tsx`. One visual language rather than
 * Next's bare, unstyled defaults — on the same tokens as the rest of the
 * marketing surface, since these render for any URL Next could not match at
 * all (no closer route-scoped boundary exists in `(app)` on purpose — see the
 * `notFound()` comments in the hiring/payroll screens: a dead end reached by
 * following a link this product itself gave someone is deliberately avoided
 * there in favour of an inline "not found" state, which is a different thing
 * from a URL nothing recognises).
 *
 * `code` is a large watermark numeral behind the copy (404, 500). Optional —
 * a render crash has no status code worth naming.
 *
 * Ported to `aprrovehr-frontend` as its own `StatusPage`, on this app's design
 * tokens either way — keep the two visually in step if either changes.
 */
export function StatusPage({
  eyebrow,
  code,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  code?: string;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  return (
    <section className="relative flex min-h-[60vh] items-center overflow-hidden px-4 py-24">
      {code && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -z-0 -translate-x-1/2 -translate-y-1/2 select-none text-[min(48vw,26rem)] font-semibold leading-none tracking-tight text-slate/[0.05]"
        >
          {code}
        </span>
      )}

      <div className="container-page relative">
        <div className="mx-auto max-w-xl text-center">
          <span className="mb-6 inline-flex items-center justify-center rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgb(20_18_15/0.08),0_8px_20px_-8px_rgb(20_18_15/0.14)]">
            <LogoMark size={26} className="text-slate" />
          </span>

          <p className="text-meta font-semibold uppercase tracking-wide text-slate-muted">
            {eyebrow}
          </p>
          <h1 className="mt-3 text-h1 text-slate">{title}</h1>
          <p className="mx-auto mt-5 max-w-md text-lead text-slate-muted">
            {description}
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {actions}
          </div>
        </div>
      </div>
    </section>
  );
}
