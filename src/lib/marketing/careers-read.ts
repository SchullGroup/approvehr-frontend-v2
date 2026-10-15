import { headers } from "next/headers";
import {
  API_URL,
  parseRetryAfter,
  type PublicRole,
  type PublicRoleDetail,
  type ReadFailure,
  type ReadResult,
} from "@/lib/marketing/careers";

/**
 * The two reads a careers page makes, **on the server**, on a visitor's behalf.
 *
 * ## Why this is its own file
 *
 * `careers.ts` is imported by the apply form, which runs in the visitor's browser.
 * Everything here reads a request header and a server-only secret, and neither
 * belongs in a module a client component can reach — even though Next never
 * inlines a variable that does not start with `NEXT_PUBLIC_`. Kept apart, the
 * boundary is the file boundary and nobody has to remember an environment rule.
 *
 * ## Whose address the API sees
 *
 * These pages are rendered by the Next.js server, so the API sees one address for
 * every visitor on the internet — the server's. Left alone, every visitor shares
 * one rate-limit bucket and the pages fail to load for everybody after the first
 * few hundred views, which is how a campus drive takes the careers page down for
 * a company that was not even recruiting that day.
 *
 * So the server passes the visitor's address along, and proves it is the server:
 *
 *   `x-careers-client-ip`   the visitor's address, as the platform reports it
 *   `x-careers-ssr-secret`  `PUBLIC_SSR_SECRET`, the same value the API holds
 *
 * Both or neither. With no `PUBLIC_SSR_SECRET` here — local development, a
 * preview deployment — nothing is sent and the API counts the server's own
 * address, which is the right answer for one developer. The API ignores the
 * headers entirely unless it has the secret too, so an environment that has not
 * opted in cannot be steered by a stranger sending them.
 *
 * The browser never sees any of this: the apply form calls the API directly, and
 * the API then sees the applicant's own connection.
 */

export const SSR_CLIENT_IP_HEADER = "x-careers-client-ip";
export const SSR_SECRET_HEADER = "x-careers-ssr-secret";

/** Longest the server waits for the API before calling it unreachable. */
const READ_TIMEOUT_MS = 8_000;

/**
 * The visitor's address, from the headers the hosting platform sets.
 *
 * `x-real-ip` first: it is one address. `x-forwarded-for` may be a chain, and
 * the first entry is the client only when every proxy in front of us appends
 * honestly — the platform overwrites what a client sent, which is what makes the
 * leftmost entry safe to read here, and the API checks that it parses as an
 * address before using it.
 */
export async function visitorIp(): Promise<string | null> {
  let incoming: Headers;
  try {
    incoming = await headers();
  } catch {
    /* Called outside a request (a build, a test). There is no visitor. */
    return null;
  }
  const real = incoming.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || null;
}

/** What a 429 says in its body: the wait, and the API's own sentence for the visitor. */
async function readRefusal(
  response: Response,
): Promise<{ seconds: number | null; message: string | null }> {
  const body = (await response.json().catch(() => null)) as {
    error?: { retryAfterSeconds?: unknown; message?: unknown };
  } | null;
  const seconds = body?.error?.retryAfterSeconds;
  const message = body?.error?.message;
  return {
    seconds:
      typeof seconds === "number" && seconds > 0 ? Math.ceil(seconds) : null,
    message:
      typeof message === "string" && message.trim() ? message.trim() : null,
  };
}

async function read<T>(path: string): Promise<ReadResult<T>> {
  const fail = (
    reason: ReadFailure,
    retryAfterSeconds: number | null = null,
    message: string | null = null,
  ): ReadResult<T> => ({ ok: false, reason, retryAfterSeconds, message });

  if (!API_URL) return fail("unconfigured");

  const secret = process.env["PUBLIC_SSR_SECRET"]?.trim();
  const ip = secret ? await visitorIp() : null;

  /* A page that waits forever on a stuck API is a page that never answers
     anybody; eight seconds is long enough for a cold start and short enough to
     say so. A controller and a timer rather than `AbortSignal.timeout`, so the
     wait is something a test can move. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        Accept: "application/json",
        ...(secret && ip
          ? { [SSR_CLIENT_IP_HEADER]: ip, [SSR_SECRET_HEADER]: secret }
          : {}),
      },
      /* An advert can be published, edited or closed at any moment, and a
         cached careers page is how somebody applies for a role that closed last
         week. Correctness beats a cache here. */
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) return fail("missing");
    if (response.status === 429) {
      const refusal = await readRefusal(response);
      return fail(
        "rate_limited",
        parseRetryAfter(response.headers.get("Retry-After")) ?? refusal.seconds,
        refusal.message,
      );
    }
    if (!response.ok) return fail("server_error");
    const body = (await response.json()) as { data: T };
    return { ok: true, value: body.data };
  } catch {
    return fail("unreachable");
  } finally {
    clearTimeout(timer);
  }
}

/** Every live advert for one company. Closed ones drop off this list. */
export const listRoles = (orgSlug: string): Promise<ReadResult<PublicRole[]>> =>
  read<PublicRole[]>(
    `/careers/public/${encodeURIComponent(orgSlug)}?pageSize=100`,
  );

/** One advert, in full. Stays readable after its closing date. */
export const getRole = (
  orgSlug: string,
  roleSlug: string,
): Promise<ReadResult<PublicRoleDetail>> =>
  read<PublicRoleDetail>(
    `/careers/public/${encodeURIComponent(orgSlug)}/${encodeURIComponent(roleSlug)}`,
  );
