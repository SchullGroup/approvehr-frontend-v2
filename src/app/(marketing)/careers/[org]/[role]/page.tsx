import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarClock, MapPin } from "lucide-react";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import {
  getRole,
  payRange,
  readableDate,
  workTypeLabel,
} from "@/lib/marketing/careers";
import { ApplyForm } from "./apply-form";

/**
 * One job advert, and the form to answer it.
 *
 * ## Read once per visit, not twice
 *
 * `generateMetadata` and the page both need the advert. The read is wrapped in
 * React's `cache` so the pair share one request — the public read routes are rate
 * limited to sixty an hour per network, which is generous for a person reading a
 * careers page and stingy if every page view costs two.
 *
 * ## A closed advert stays readable
 *
 * The API serves it deliberately: a link already shared in a WhatsApp group
 * should explain itself rather than 404. So the page renders in full and the form
 * is replaced by the closing date and a way back to what is still open.
 */
const readRole = cache(async (org: string, role: string) => getRole(org, role));

/** Never prerendered: an advert's state is only true at the moment it is read. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; role: string }>;
}): Promise<Metadata> {
  const { org, role } = await params;
  const result = await readRole(org, role);
  if (!result.ok) return { title: "Job" };
  return {
    title: `${result.value.title} — ${result.value.company}`,
    description: result.value.summary,
  };
}

export default async function RolePage({
  params,
}: {
  params: Promise<{ org: string; role: string }>;
}) {
  const { org, role: roleSlug } = await params;
  const result = await readRole(org, roleSlug);

  /* A draft, a closed-and-unpublished advert and a typo are all the same 404 —
     distinguishing them would confirm that a role exists but has not been
     published, which is information about a company's hiring plans. */
  if (!result.ok && result.reason === "missing") notFound();

  if (!result.ok) {
    return (
      <section className="px-4 pb-28 pt-16 sm:pt-24">
        <div className="container-page max-w-2xl">
          <h1 className="text-h2 text-slate">This role is not showing</h1>
          <p className="mt-4 text-[0.9375rem] leading-relaxed text-slate-muted">
            {result.reason === "unconfigured"
              ? "This site is not connected to a careers system."
              : "We could not load it just now."}
          </p>
          <div className="mt-8">
            <Pill href={`/careers/${org}`} variant="dark" arrow>
              See the open roles
            </Pill>
          </div>
        </div>
      </section>
    );
  }

  const role = result.value;
  const pay = payRange(role);

  return (
    <section className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page grid gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <Reveal>
          <div>
            <p className="mb-3 text-[0.75rem] font-semibold uppercase tracking-[0.1em] text-slate-muted">
              {role.company}
            </p>
            <h1 className="text-h1 text-slate">{role.title}</h1>
            <p className="mt-5 text-lead text-slate-muted">{role.summary}</p>

            <dl className="mt-8 flex flex-wrap gap-2.5">
              <Fact label="Type of work" value={workTypeLabel(role.employmentType)} />
              {role.location && (
                <Fact
                  label="Where"
                  value={role.location}
                  icon={<MapPin aria-hidden="true" className="size-3.5" />}
                />
              )}
              {pay && <Fact label="Pay" value={pay} tabular />}
              {role.closesOn && (
                <Fact
                  label="Last day to apply"
                  value={readableDate(role.closesOn)}
                  icon={<CalendarClock aria-hidden="true" className="size-3.5" />}
                />
              )}
            </dl>

            {role.postedOn && (
              <p className="mt-5 text-[0.875rem] text-slate-muted">
                Posted {readableDate(role.postedOn)}
              </p>
            )}

            {/* The advert as it was written. Kept as typed rather than parsed —
                a job description is somebody's own words about their own
                company, and reformatting it is how a paragraph loses a line. */}
            <div className="mt-10 whitespace-pre-line border-t border-sand-line pt-10 text-[0.9375rem] leading-relaxed text-slate-soft">
              {role.description}
            </div>
          </div>
        </Reveal>

        <Reveal delay={100}>
          <div className="lg:sticky lg:top-28">
            {role.acceptingApplications ? (
              <ApplyForm
                org={org}
                roleSlug={role.slug}
                roleTitle={role.title}
                company={role.company}
              />
            ) : (
              <Closed
                org={org}
                closedOn={role.closesOn ? readableDate(role.closesOn) : null}
              />
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

function Fact({
  label,
  value,
  icon,
  tabular = false,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  tabular?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-sand-line bg-white px-3.5 py-2 text-[0.875rem] text-slate-soft">
      <dt className="sr-only-focusable">{label}</dt>
      <dd className={`flex items-center gap-1.5 ${tabular ? "tabular" : ""}`}>
        {icon}
        {value}
      </dd>
    </div>
  );
}

function Closed({ org, closedOn }: { org: string; closedOn: string | null }) {
  return (
    <div className="rounded-3xl border border-sand-line bg-white/70 p-7 sm:p-9">
      <h2 className="text-h3 text-slate">Applications have closed</h2>
      <p className="mt-3 text-[0.9375rem] leading-relaxed text-slate-muted">
        {closedOn
          ? `The last day to apply was ${closedOn}.`
          : "This role is no longer taking applications."}
      </p>
      <div className="mt-8">
        <Pill href={`/careers/${org}`} variant="solid" arrow>
          See what else is open
        </Pill>
      </div>
    </div>
  );
}
