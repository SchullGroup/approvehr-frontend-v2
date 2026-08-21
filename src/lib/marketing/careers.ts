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

const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;

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
 * Three cases, three different pages. `missing` is a 404 — no such company, no
 * such advert, or an advert that was never published; the API answers all three
 * identically on purpose, so that this endpoint cannot be used to work out which
 * companies are customers or what they are about to hire for.
 */
export type ReadFailure = "unconfigured" | "missing" | "unreachable";

export type ReadResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: ReadFailure };

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
  const min = role.salaryMinKobo === null ? null : formatNaira(role.salaryMinKobo);
  const max = role.salaryMaxKobo === null ? null : formatNaira(role.salaryMaxKobo);
  if (min && max) return min === max ? `${min} a month` : `${min} – ${max} a month`;
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

/* ---------------------------------------------------------------------- read */

async function read<T>(path: string): Promise<ReadResult<T>> {
  if (!API_URL) return { ok: false, reason: "unconfigured" };

  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: { Accept: "application/json" },
      /* An advert can be published, edited or closed at any moment, and a
         cached careers page is how somebody applies for a role that closed last
         week. Correctness beats a cache here. */
      cache: "no-store",
    });
    if (response.status === 404) return { ok: false, reason: "missing" };
    if (!response.ok) return { ok: false, reason: "unreachable" };
    const body = (await response.json()) as { data: T };
    return { ok: true, value: body.data };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

/** Every live advert for one company. Closed ones drop off this list. */
export const listRoles = (orgSlug: string): Promise<ReadResult<PublicRole[]>> =>
  read<PublicRole[]>(`/careers/public/${encodeURIComponent(orgSlug)}?pageSize=100`);

/** One advert, in full. Stays readable after its closing date. */
export const getRole = (
  orgSlug: string,
  roleSlug: string,
): Promise<ReadResult<PublicRoleDetail>> =>
  read<PublicRoleDetail>(
    `/careers/public/${encodeURIComponent(orgSlug)}/${encodeURIComponent(roleSlug)}`,
  );

/* --------------------------------------------------------------------- apply */

export type ApplyOutcome =
  | { ok: true; value: ApplyResult }
  /** `message` is the API's own sentence. It is written for the applicant. */
  | { ok: false; message: string; fields: Record<string, string> };

/**
 * Send an application.
 *
 * Every refusal here is a sentence somebody has to read and act on, so the
 * API's message is passed through rather than replaced: "you have already
 * applied, we received it on 14 August" is far more use than "something went
 * wrong". Field-level details are kept separately so the form can point at the
 * input that needs fixing.
 */
export async function apply(
  orgSlug: string,
  roleSlug: string,
  body: ApplyBody,
): Promise<ApplyOutcome> {
  if (!API_URL) {
    return {
      ok: false,
      message: "This page cannot take applications yet.",
      fields: {},
    };
  }

  try {
    const response = await fetch(
      `${API_URL}/careers/public/${encodeURIComponent(orgSlug)}/${encodeURIComponent(roleSlug)}/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: ApplyResult;
          error?: {
            message?: string;
            details?: { field: string; message: string }[];
          };
        }
      | null;

    if (response.ok && payload?.data) return { ok: true, value: payload.data };

    const fields: Record<string, string> = {};
    for (const detail of payload?.error?.details ?? []) {
      fields[detail.field] = detail.message;
    }
    return {
      ok: false,
      message:
        payload?.error?.message ??
        "That did not go through. Check your details and try again.",
      fields,
    };
  } catch {
    return {
      ok: false,
      message: "We could not reach the server. Check your connection and try again.",
      fields: {},
    };
  }
}

/* ------------------------------------------------------------------ the seam */

/**
 * There is nowhere to put a CV.
 *
 * `JobApplication.cvKey` holds an object-storage key and nothing in the stack
 * uploads, stores or serves a file — see `src/modules/careers/storage.ts`, which
 * names the two routes that will change that. So this form does not render a
 * drop zone. A drop zone that accepts a file and drops it is worse than no
 * field at all: the applicant believes their CV arrived, and the hiring manager
 * finds out the day before the interview.
 *
 * One line on the form, and the note field takes a link instead.
 */
export const CV_LINE =
  "You cannot attach a file yet — put a link to your CV in the note below.";
