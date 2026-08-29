import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MapPin } from "lucide-react";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import {
  listRoles,
  payRange,
  readableDate,
  workTypeLabel,
  type PublicRole,
  type ReadFailure,
} from "@/lib/marketing/careers";

export const metadata: Metadata = {
  title: "Open roles",
  description: "Every job this company is hiring for, and how to apply.",
};

/**
 * Never prerendered, never cached.
 *
 * `no-store` on the fetch already forces this, but saying it here also stops the
 * build from trying to reach an API that is not running while it compiles.
 */
export const dynamic = "force-dynamic";

/**
 * A company's careers page.
 *
 * ## Rendered fresh on every visit
 *
 * An advert can be published, edited or closed at any moment. A cached careers
 * page is how somebody spends an evening applying for a role that closed last
 * week, so this is dynamic and the fetch is `no-store`.
 *
 * ## The heading does not name the company, and that is deliberate
 *
 * The list endpoint knows the company's name but the paged response envelope
 * carries `data` and `meta` only, so the name does not survive the wire. Rather
 * than guess it from the URL slug — "acme-ltd" is not reliably "Acme Ltd" — the
 * heading says what is true, and the role page, which *is* served the name, uses
 * it. Inventing an employer's name on their own careers page is not a small
 * mistake.
 */
export default async function CareersListingPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const result = await listRoles(org);

  /* A company that does not exist, is archived, or has never published anything
     is one 404. The API answers all three identically so that this page cannot
     be used to find out which companies are customers. */
  if (!result.ok && result.reason === "missing") notFound();

  return (
    <section className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page">
        <Reveal>
          <header className="max-w-3xl">
            <p className="mb-3 text-meta font-semibold text-slate-muted">
              Careers
            </p>
            <h1 className="text-h1 text-slate">Open roles</h1>
            <p className="mt-5 text-lead text-slate-muted">
              Everything currently being hired for. Applying takes a name, an
              email and a minute.
            </p>
          </header>
        </Reveal>

        {!result.ok ? (
          <Unavailable reason={result.reason} />
        ) : result.value.length === 0 ? (
          <Reveal delay={80}>
            <div className="mt-14 rounded-3xl border border-sand-line bg-white/70 p-10 sm:p-14">
              <h2 className="text-h3 text-slate">Nothing open right now</h2>
              <p className="mt-3 max-w-md text-body leading-relaxed">
                No roles are being advertised today. New ones appear on this page
                the moment they go live.
              </p>
            </div>
          </Reveal>
        ) : (
          <ul className="mt-14 flex list-none flex-col gap-4">
            {result.value.map((role, index) => (
              <Reveal
                key={role.slug}
                as="li"
                delay={Math.min(index, 3) * 70}
              >
                <RoleCard org={org} role={role} />
              </Reveal>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function RoleCard({ org, role }: { org: string; role: PublicRole }) {
  const pay = payRange(role);

  return (
    <article className="group relative flex flex-col gap-4 rounded-3xl border border-sand-line bg-white/70 p-7 transition-all duration-300 ease-out-soft hover:-translate-y-0.5 hover:border-slate/25 hover:shadow-[0_12px_28px_-8px_rgb(20_18_15/0.14)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-slate sm:flex-row sm:items-center sm:gap-8">
      <div className="min-w-0 flex-1">
        <h2 className="text-h4 text-slate">{role.title}</h2>
        <p className="mt-2 max-w-2xl text-body leading-relaxed">
          {role.summary}
        </p>

        <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-body-sm text-slate-muted">
          <div className="flex items-center gap-1.5">
            <dt className="sr-only-focusable">Type of work</dt>
            <dd>{workTypeLabel(role.employmentType)}</dd>
          </div>
          {role.location && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only-focusable">Where</dt>
              <dd className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-3.5" />
                {role.location}
              </dd>
            </div>
          )}
          {pay && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only-focusable">Pay</dt>
              <dd className="tabular">{pay}</dd>
            </div>
          )}
          {role.closesOn && (
            <div className="flex items-center gap-1.5">
              <dt className="sr-only-focusable">Last day to apply</dt>
              <dd>Apply by {readableDate(role.closesOn)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* One stretched link over the card. Wrapping the article in an anchor
          would nest this link inside it — invalid, and it breaks hydration. */}
      <Link
        href={`/careers/${org}/${role.slug}`}
        className="inline-flex shrink-0 items-center gap-2 text-body-sm font-medium text-slate transition-colors hover:text-slate-muted after:absolute after:inset-0 after:content-['']"
      >
        See the role
        <span className="flex size-6 items-center justify-center rounded-full bg-slate/8 transition-all duration-200 ease-out-soft group-hover:bg-slate group-hover:text-white">
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </span>
      </Link>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What to say when the list could not be read.
 *
 * Two different facts, and neither of them is "no roles". Saying "nothing open"
 * when the truth is "we could not ask" would send somebody away from a job they
 * could have had.
 */
function Unavailable({ reason }: { reason: ReadFailure }) {
  const line =
    reason === "unconfigured"
      ? "This site is not connected to a careers system, so there are no roles to show."
      : "We could not load the roles just now.";

  return (
    <div className="mt-14 rounded-3xl border border-sand-line bg-white/70 p-10 sm:p-14">
      <h2 className="text-h3 text-slate">Roles are not showing</h2>
      <p className="mt-3 max-w-md text-body leading-relaxed">
        {line}
      </p>
      <div className="mt-8">
        <Pill href="/" variant="dark" arrow>
          Back to the homepage
        </Pill>
      </div>
    </div>
  );
}
