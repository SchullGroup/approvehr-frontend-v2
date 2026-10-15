/**
 * The public careers page — the three unauthenticated routes.
 *
 * ## Why this is not `lib/api/careers.ts`
 *
 * The marketing surface is exported as a standalone site by
 * `scripts/export-marketing.ts`, and that script asserts the export's import
 * closure: nothing under `src/app/(marketing)` or `src/components/marketing` may
 * reach into `@/components/ui`, `@/lib/store`, `@/lib/payroll` — or any `@/`
 * path that is not itself copied. `src/lib/api/` is not copied, because it
 * carries token handling, refresh rotation and the whole signed-in surface, none
 * of which belongs in a public repo.
 *
 * So the careers page gets its own small client. That duplication is the right
 * trade twice over:
 *
 * 1. The API's public serializer is deliberately **shorter** than its internal
 *    one — no requisition reference, no application count, and no salary band
 *    unless the company chose to publish it. The way that leak happens is
 *    somebody reusing the internal type because it was already there.
 * 2. These three routes take no token, so none of the auth machinery applies.
 *
 * ## Money
 *
 * The API speaks integer **kobo**. `formatNaira` below is the only place on this
 * surface that divides by 100, and it renders thousands separators and two
 * decimals — never an abbreviation. Somebody deciding whether to change job
 * reads this figure and compares it against a payslip.
 *
 * ## No API address, no careers page
 *
 * `NEXT_PUBLIC_API_URL` is unset in the standalone marketing build, because that
 * repo has no backend behind it. Rather than fetch `undefined/...` and render an
 * error, `configured` is false and the pages say plainly that no roles can be
 * loaded. Same rule as `links.ts`: never point at something that is not there.
 */

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;

/** True when there is an API to ask for adverts. */
export const configured = API_URL !== null;

/* -------------------------------------------------------------------- shapes */

/** Exactly what a stranger is allowed to see about one advert. */
export type PublicRole = {
  slug: string;
  title: string;
  summary: string;
  location: string | null;
  employmentType: string;
  /** Both null unless the company chose to publish the range. */
  salaryMinKobo: number | null;
  salaryMaxKobo: number | null;
  /** `YYYY-MM-DD`, or null when it stays open. */
  closesOn: string | null;
  /** False once the closing day has passed. The advert stays readable. */
  acceptingApplications: boolean;
  postedOn: string | null;
};

/** One advert in full. The description is only served from the single route. */
export type PublicRoleDetail = PublicRole & {
  company: string;
  description: string;
};

export type ApplyBody = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  coverNote?: string;
};

export type ApplyResult = {
  id: string;
  company: string;
  postingTitle: string;
  /** One short line from the API, honest about what happens next. */
  note: string;
  cvNote: string | null;
};

/**
 * Why a read did not produce anything.
 *
 * Five cases, and the page says a different thing for each, because they ask
 * the visitor to do different things:
 *
 * - `missing` is a 404 — no such company, no such advert, or an advert that was
 *   never published. The API answers all three identically on purpose, so that
 *   this endpoint cannot be used to work out which companies are customers or
 *   what they are about to hire for. The page renders `notFound()`.
 * - `rate_limited` is a 429. Somebody on this network has opened careers pages a
 *   great many times in a short while. Waiting works; refreshing at once does
 *   not. `retryAfterSeconds` is the API's own figure when it sent one.
 * - `server_error` is a 5xx. The fault is ours and the advice is to try again.
 * - `unreachable` is no answer at all: a refused connection, a timeout.
 * - `unconfigured` is a build with no API behind it.
 *
 * They used to be one line, "We could not load the roles just now", and a
 * visitor locked out by a limiter read it as the company having no jobs.
 */
export type ReadFailure =
  "unconfigured" | "missing" | "rate_limited" | "server_error" | "unreachable";

export type ReadResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      reason: ReadFailure;
      /** Only for `rate_limited`, and only when the API said how long. */
      retryAfterSeconds: number | null;
    };

/**
 * `Retry-After` as seconds.
 *
 * The header is either a count of seconds or an HTTP date, and both are legal.
 * Anything else — absent, negative, nonsense — is `null`, never a guess: a page
 * that says "try again in 0 minutes" is worse than one that says "in a few".
 */
export function parseRetryAfter(
  header: string | null,
  now: number = Date.now(), // reads-the-clock: a distance in seconds to a future instant, never a calendar day
): number | null {
  if (header === null) return null;
  const text = header.trim();
  if (text === "") return null;
  if (/^\d+$/.test(text)) {
    const seconds = Number.parseInt(text, 10);
    return seconds > 0 ? seconds : null;
  }
  const at = Date.parse(text);
  if (Number.isNaN(at)) return null;
  const seconds = Math.ceil((at - now) / 1000);
  return seconds > 0 ? seconds : null;
}

/**
 * How long to wait, in words a visitor can act on.
 *
 * Rounded **up** — "about 2 minutes" for 61 seconds — because the point is to
 * stop somebody trying again too soon, and the limiter is not sympathetic to
 * "nearly".
 */
export function waitPhrase(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "a few minutes";
  if (seconds < 60) return "under a minute";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60)
    return `about ${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  const hours = Math.ceil(minutes / 60);
  return `about ${hours} ${hours === 1 ? "hour" : "hours"}`;
}

/* --------------------------------------------------------------------- money */

/**
 * Kobo to naira, written out in full.
 *
 * The only division by 100 on the marketing surface. Two decimals and thousands
 * separators, never `₦4.2m` — an abbreviated salary is not a figure anybody can
 * check against an offer.
 */
export function formatNaira(amountKobo: number): string {
  return `₦${(Math.round(amountKobo) / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** A pay range as the advert states it, or null when the company withheld it. */
export function payRange(role: {
  salaryMinKobo: number | null;
  salaryMaxKobo: number | null;
}): string | null {
  const min =
    role.salaryMinKobo === null ? null : formatNaira(role.salaryMinKobo);
  const max =
    role.salaryMaxKobo === null ? null : formatNaira(role.salaryMaxKobo);
  if (min && max)
    return min === max ? `${min} a month` : `${min} – ${max} a month`;
  if (min) return `${min} a month and up`;
  if (max) return `Up to ${max} a month`;
  return null;
}

/** The API's enum, in words. Matches the internal labels. */
const TYPE_LABEL: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  NYSC: "NYSC",
};

export const workTypeLabel = (value: string): string =>
  TYPE_LABEL[value] ?? "Full time";

/** `2026-08-21` → `21 August 2026`. Dates on a public page read as words. */
export function readableDate(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* --------------------------------------------------------------------- apply */

/**
 * The name of the hidden field the API treats as a bot trap.
 *
 * Set by the API's contract, not chosen here: a different name would sail
 * through as an unknown key and the trap would catch nobody. The name is
 * deliberately dull — a browser offers a saved web address to a field called
 * `website` or `url`, and a real applicant would trip the trap.
 */
export const HONEYPOT_FIELD = "faxNumber";

/**
 * Why an application did not go through.
 *
 * Each one is a different next step for the person holding the phone, so the
 * form can say the right thing instead of one line for all of them:
 *
 * - `invalid` — a field is wrong. `fields` says which.
 * - `rate_limited` — too many from this network or for this address. Waiting is
 *   the only fix, and `retryAfterSeconds` says how long when the API said.
 * - `duplicate` — they already applied. The API's own sentence says when.
 * - `captcha` — the "are you a person" check is on and was missing, wrong,
 *   expired or could not be run. The form shows the check and asks again.
 * - `server_error` — ours. Their answers are still in the form.
 * - `network` — the request never arrived.
 * - `refused` — anything else the API explained.
 */
export type ApplyFailureKind =
  | "invalid"
  | "rate_limited"
  | "duplicate"
  | "captcha"
  | "server_error"
  | "network"
  | "refused";

export type ApplyOutcome =
  | { ok: true; value: ApplyResult }
  | {
      ok: false;
      kind: ApplyFailureKind;
      /** One sentence for the applicant. Safe to show as written. */
      message: string;
      fields: Record<string, string>;
      /** Only for `rate_limited`, and only when the API said how long. */
      retryAfterSeconds: number | null;
    };

/**
 * Send an application.
 *
 * Every refusal here is a sentence somebody has to read and act on, so the
 * API's message is passed through where it wrote one *about this person's
 * situation* — "you have already applied, we received it on 14 August" is far
 * more use than "something went wrong". Field-level details are kept
 * separately so the form can point at the input that needs fixing.
 *
 * Two refusals are worded here instead, because the API cannot know the one
 * thing the sentence needs: a rate limit is described by how long to wait, and
 * the API's text names a fixed hour while its `Retry-After` header counts down
 * the real remainder. A 5xx is described by us because whatever text came back
 * was written for a log.
 */
export async function apply(
  orgSlug: string,
  roleSlug: string,
  body: ApplyBody,
  /** Extra fields the API asked for beyond the person's own answers. */
  extra: Record<string, string> = {},
): Promise<ApplyOutcome> {
  const failure = (
    kind: ApplyFailureKind,
    message: string,
    fields: Record<string, string> = {},
    retryAfterSeconds: number | null = null,
  ): ApplyOutcome => ({ ok: false, kind, message, fields, retryAfterSeconds });

  if (!API_URL) {
    return failure("refused", "This page cannot take applications yet.");
  }

  try {
    const response = await fetch(
      `${API_URL}/careers/public/${encodeURIComponent(orgSlug)}/${encodeURIComponent(roleSlug)}/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, ...extra }),
      },
    );

    const payload = (await response.json().catch(() => null)) as {
      data?: ApplyResult;
      error?: {
        code?: string;
        message?: string;
        retryAfterSeconds?: number;
        details?: { field: string; message: string }[];
      };
    } | null;

    if (response.ok && payload?.data) return { ok: true, value: payload.data };

    if (response.status === 429) {
      /* The header where the API sent it, and the body where a browser can
         always read it — `Retry-After` is not one of the response headers a
         cross-origin page may see unless the API exposes it. */
      const wait =
        parseRetryAfter(response.headers.get("Retry-After")) ??
        (typeof payload?.error?.retryAfterSeconds === "number" &&
        payload.error.retryAfterSeconds > 0
          ? Math.ceil(payload.error.retryAfterSeconds)
          : null);
      return failure(
        "rate_limited",
        wait === null
          ? (payload?.error?.message ??
              "Too many applications from your network. Wait a little while, then send it again.")
          : `Too many applications from your network just now. Wait ${waitPhrase(wait)}, then send it again. What you typed is still here.`,
        {},
        wait,
      );
    }

    /* Before the 5xx branch: "we could not run the check" is a 503, and it
       is about the check, not about the server being down. */
    if (payload?.error?.code?.startsWith("captcha_")) {
      return failure(
        "captcha",
        payload.error.message ??
          "Complete the check above the button, then send again.",
      );
    }

    if (response.status >= 500) {
      return failure(
        "server_error",
        "Something went wrong on our side, not yours. What you typed is still here, so try sending it again in a minute.",
      );
    }

    const fields: Record<string, string> = {};
    for (const detail of payload?.error?.details ?? []) {
      fields[detail.field] = detail.message;
    }
    const message =
      payload?.error?.message ??
      "That did not go through. Check your details and try again.";
    return failure(
      response.status === 409
        ? "duplicate"
        : Object.keys(fields).length > 0
          ? "invalid"
          : "refused",
      message,
      fields,
    );
  } catch {
    return failure(
      "network",
      "We could not reach the server. Check your connection and try again. What you typed is still here.",
    );
  }
}

/* ------------------------------------------------------------------ the seam */

/**
 * The form has no file field yet, and says so.
 *
 * The API can already issue an upload address, but this form does not use it:
 * a drop zone that takes a file and then fails to attach it is worse than no
 * field at all, because the applicant believes their CV arrived and the hiring
 * manager finds out the day before the interview. Attaching a CV to the
 * application itself is the next piece of work on this form, and until it lands
 * the honest instruction is a link in the note.
 *
 * One line on the form, and the note field takes a link instead.
 */
export const CV_LINE =
  "You cannot attach a file yet, put a link to your CV in the note below.";
