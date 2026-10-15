import { Pill } from "@/components/marketing/pill";
import { CareersRetry } from "@/components/marketing/careers-retry";
import { waitPhrase, type ReadFailure } from "@/lib/marketing/careers";

/**
 * What to say when a careers page could not be read.
 *
 * Four different facts, and the sentence for each is chosen so that the visitor
 * knows what *they* can do about it:
 *
 * | | Whose fault | What they are told |
 * |---|---|---|
 * | rate limited | their network's volume | wait this long, then try again |
 * | server error | ours | it is not you; try again in a minute |
 * | unreachable | ours, or a blip | try again in a minute |
 * | unconfigured | the deployment | this site is not connected to a careers system |
 *
 * `missing` does not normally reach this component — the pages call
 * `notFound()` for it — but the type allows it, and a page that someone later
 * changes to render it should not have to invent a sentence. None of these says
 * "no roles", because "nothing open" is a different fact
 * and sending somebody away from a job they could have had is the failure this
 * exists to prevent.
 *
 * Server-rendered: the copy needs no scripting. Only the retry control is a
 * client component.
 */
export function CareersNotice({
  reason,
  retryAfterSeconds,
  subject,
  backHref,
  backLabel,
}: {
  reason: ReadFailure;
  retryAfterSeconds: number | null;
  /** What did not load: "roles" for the list, "this role" for an advert. */
  subject: "roles" | "this role";
  backHref: string;
  backLabel: string;
}) {
  const copy = noticeCopy(reason, retryAfterSeconds, subject);

  return (
    <div
      data-testid="careers-notice"
      data-reason={reason}
      className="rounded-3xl border border-sand-line bg-white/70 p-10 sm:p-14"
    >
      <h2 className="text-h3 text-slate">{copy.title}</h2>
      <p className="mt-3 max-w-md text-body leading-relaxed">{copy.body}</p>
      <div className="mt-8 flex flex-wrap items-start gap-x-4 gap-y-3">
        {copy.retry && <CareersRetry />}
        <Pill href={backHref} variant="quiet" arrow>
          {backLabel}
        </Pill>
      </div>
    </div>
  );
}

export function noticeCopy(
  reason: ReadFailure,
  retryAfterSeconds: number | null,
  subject: "roles" | "this role",
): { title: string; body: string; retry: boolean } {
  switch (reason) {
    case "rate_limited":
      return {
        title: "Too many visits from your network",
        body:
          `This page has been opened a lot from your network in a short time, so it is ` +
          `paused for a while. It is nothing you have done wrong. Try again in ` +
          `${waitPhrase(retryAfterSeconds)}.`,
        retry: true,
      };
    case "server_error":
      return {
        title:
          subject === "roles"
            ? "Roles are not showing"
            : "This role is not showing",
        body:
          "Something went wrong on our side, not yours. Try again in a minute; " +
          "if it keeps happening, the company can tell us.",
        retry: true,
      };
    case "unreachable":
      return {
        title:
          subject === "roles"
            ? "Roles are not showing"
            : "This role is not showing",
        body:
          "We could not reach the careers system just now. It is usually over " +
          "within a minute, so try again shortly.",
        retry: true,
      };
    case "missing":
      return {
        title: "We could not find that page",
        body: "The link may be old, or the role may have been taken down.",
        retry: false,
      };
    case "unconfigured":
      return {
        title:
          subject === "roles"
            ? "Roles are not showing"
            : "This role is not showing",
        body:
          subject === "roles"
            ? "This site is not connected to a careers system, so there are no roles to show."
            : "This site is not connected to a careers system.",
        /* Nothing a retry can change: the build has no API behind it. */
        retry: false,
      };
  }
}
