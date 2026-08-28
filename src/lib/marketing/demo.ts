/**
 * The public demo request client.
 *
 * ## Why this lives under `src/lib/marketing/`
 *
 * The marketing surface is exported as a standalone site by
 * `scripts/export-marketing.ts`, and that script asserts the export's import
 * closure: nothing under `src/app/(marketing)` or `src/components/marketing` may
 * reach into `@/lib/api/`, which contains token handling and session logic.
 *
 * `src/lib/marketing/` is exported alongside marketing pages. This helper is
 * unauthenticated and posts directly to `POST /demo-requests`.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "") || null;

/** True when there is an API configured for demo requests. */
export const configured = API_URL !== null;

export type DemoRequestBody = {
  name: string;
  email: string;
  company: string;
  phone?: string;
  headcount: string;
  payrollToday?: string;
  interests?: string[];
  notes?: string;
};

export type DemoRequestResult = {
  id: string;
  /** One short line from the API, honest about what happens next. */
  note: string;
};

export type SubmitDemoOutcome =
  | { ok: true; value: DemoRequestResult }
  | { ok: false; message: string; fields: Record<string, string> };

/**
 * Send a demo request to the backend API.
 *
 * Returns `SubmitDemoOutcome`. Field-level issues (if any) populate `fields`,
 * and general messages (e.g. rate-limiting) populate `message`.
 */
export async function submitDemoRequest(
  body: DemoRequestBody,
): Promise<SubmitDemoOutcome> {
  if (!API_URL) {
    return {
      ok: true,
      value: {
        id: "unconfigured",
        /* Same fact as careers.ts's "unconfigured" reason, same wording
           convention: state the connection, not the product's maturity.
           This is the standalone marketing export's normal state, not a
           prototype — the backend is real, this deployment just isn't
           pointed at it. */
        note: "This site is not connected to ApproveHR's system, so the details above were not sent anywhere.",
      },
    };
  }

  try {
    const response = await fetch(`${API_URL}/demo-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: body.name.trim(),
        email: body.email.trim(),
        company: body.company.trim(),
        phone: body.phone?.trim() || undefined,
        headcount: body.headcount,
        payrollToday: body.payrollToday?.trim() || undefined,
        interests: body.interests ?? [],
        notes: body.notes?.trim() || undefined,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | {
          data?: DemoRequestResult;
          error?: {
            message?: string;
            details?: { field: string; message: string }[];
          };
        }
      | null;

    if (response.ok && payload?.data) {
      return { ok: true, value: payload.data };
    }

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
