import { CalendarClock, MapPin } from "lucide-react";
import { CareersBrand } from "@/components/marketing/careers-brand";
import { Pill } from "@/components/marketing/pill";
import { Reveal } from "@/components/marketing/motion";
import { RichText } from "@/components/marketing/rich-text";
import { accentFor } from "@/lib/marketing/accent";
import {
  payRange,
  readableDate,
  workTypeLabel,
  type PublicRoleDetail,
} from "@/lib/marketing/careers";

/**
 * One advert as a stranger reads it, with the form (or the notice that it has
 * closed) beside it.
 *
 * Shared by the live careers page and by the signed-in preview, so that "what an
 * applicant sees" is one piece of markup and not a copy that drifts. The form is
 * handed in as `aside`: the live page gives it the real client, the preview a
 * client that sends nothing, and this component does not know the difference.
 *
 * The description is drawn from the API's cleaned HTML through `RichText`, never
 * as markup; an API that predates rich text sends only the plain words, which keep
 * their line breaks exactly as typed. The company's accent colour re-tints the
 * primary button inside `aside` and nothing else, and only after `accentFor` has
 * made it carry white text.
 */
export function RoleView({
  role,
  aside,
  motion = true,
  titleAs = "h1",
}: {
  role: PublicRoleDetail;
  aside: React.ReactNode;
  /** The scroll-reveal. Off inside the app, where a preview should simply be there. */
  motion?: boolean;
  /** `h2` where the page around it already has its one `h1`. */
  titleAs?: "h1" | "h2";
}) {
  const Title = titleAs;
  const pay = payRange(role);
  const accent = accentFor(role.branding?.accentColor);
  const Wrap = motion ? Reveal : Still;

  return (
    <section className="px-4 pb-28 pt-16 sm:pt-24">
      <div className="container-page">
        <CareersBrand company={role.company} branding={role.branding} />
      </div>
      <div className="container-page grid gap-14 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <Wrap>
          <div>
            <Title className="text-h1 text-slate">{role.title}</Title>
            <p className="mt-5 text-lead text-slate-muted">{role.summary}</p>

            <dl className="mt-8 flex flex-wrap gap-2.5">
              <Fact
                label="Type of work"
                value={workTypeLabel(role.employmentType)}
              />
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
                  icon={
                    <CalendarClock aria-hidden="true" className="size-3.5" />
                  }
                />
              )}
            </dl>

            {role.postedOn && (
              <p className="mt-5 text-body-sm text-slate-muted">
                Posted {readableDate(role.postedOn)}
              </p>
            )}

            <div className="mt-10 border-t border-sand-line pt-10 text-body">
              {role.descriptionHtml ? (
                <RichText html={role.descriptionHtml} />
              ) : (
                <div className="whitespace-pre-line leading-relaxed">
                  {role.description}
                </div>
              )}
            </div>
          </div>
        </Wrap>

        <Wrap delay={100}>
          <div
            data-testid="role-aside"
            className="lg:sticky lg:top-28"
            {...(accent
              ? {
                  style: {
                    "--color-accent": accent.button,
                    "--color-accent-hover": accent.buttonHover,
                  } as React.CSSProperties,
                }
              : {})}
          >
            {aside}
          </div>
        </Wrap>
      </div>
    </section>
  );
}

/** Stands where `Reveal` does when there is to be no motion. */
function Still({ children }: { children: React.ReactNode; delay?: number }) {
  return <div>{children}</div>;
}

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
    <div className="inline-flex items-center gap-1.5 rounded-full border border-sand-line bg-white px-3.5 py-2 text-body-sm text-slate-soft">
      <dt className="sr-only-focusable">{label}</dt>
      <dd className={`flex items-center gap-1.5 ${tabular ? "tabular" : ""}`}>
        {icon}
        {value}
      </dd>
    </div>
  );
}

/** Where the form was, once an advert has closed. */
export function Closed({
  org,
  closedOn,
}: {
  org: string;
  closedOn: string | null;
}) {
  return (
    <div className="rounded-3xl border border-sand-line bg-white/70 p-7 sm:p-9">
      <h2 className="text-h3 text-slate">Applications have closed</h2>
      <p className="mt-3 text-body leading-relaxed">
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
