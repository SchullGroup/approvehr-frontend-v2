"use client";

import { request, tokens } from "@/lib/api/client";
import type { ApiUser } from "@/lib/api/endpoints";

/**
 * Opening an account, confirming an address, recovering a password.
 *
 * The five routes under `/api/v1/auth` that a person can reach **without being
 * signed in already**. `endpoints.ts` owns `sign-in`, `refresh`, `sign-out`,
 * `change-password` and `me`; this file owns the rest, in the same hand-written
 * style, and there is no money anywhere in it so nothing converts.
 *
 * Three things here are load-bearing.
 *
 * ## 1. `anonymous: true` on every route that takes a token in the body
 *
 * The client (`client.ts`) reads a 401 as "refresh and retry". A reset link
 * opened in a browser that still holds a stale session would therefore trigger a
 * refresh in the middle of setting a password, and a rotated refresh token
 * presented twice is read by the API as theft — it revokes every session.
 * `anonymous` skips the Authorization header and the retry entirely, so the link
 * is the only credential in play.
 *
 * The API helps here too: a bad, expired, used or wrong-kind token answers
 * **422**, never 401, for exactly this reason. Both halves of that agreement
 * have to hold, so do not "simplify" this flag away.
 *
 * `verify-email/request` is the one exception — it is authenticated, because the
 * caller already holds a token for the account and so there is no address to
 * look up and no way to use it to discover whether somebody has an account.
 *
 * ## 2. The tokens
 *
 * `register` returns a session, so somebody lands inside the product rather than
 * on a "now go and sign in" dead end — it stores them exactly the way
 * `auth.signIn` does. `resetPassword` does the opposite: the API revokes every
 * session on the account, which includes whatever this browser was holding, so
 * the local copy is cleared rather than left to fail on the next request.
 *
 * ## 3. `DeliveryHint` is not a feature
 *
 * **There is no mail transport on the API yet.** Outside production the token
 * comes back in the response so the flow is usable at all; in production the
 * field is `null`, always. Any screen rendering it must say plainly that no
 * email was sent — see `delivery-note.tsx`. The day a transport is wired the
 * field goes null everywhere and the notes disappear on their own.
 */

/* --------------------------------------------------------------------- types */

/** Present only while no mail transport is wired, and never in production. */
export type DeliveryHint = {
  token: string;
  expiresAt: string;
  note: string;
} | null;

export type RegisterInput = {
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
};

export type RegisterResult = {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
  organization: { id: string; slug: string; legalName: string };
  /** False for every new company. Its absence is what routes them into setup. */
  setupCompleted: boolean;
  emailVerification: DeliveryHint;
};

export type VerificationRequestResult = {
  alreadyVerified: boolean;
  emailVerification: DeliveryHint;
};

export type EmailConfirmedResult = { email: string; verifiedAt: string };

/** `message` is written by the API and is identical whether or not the address
 *  has an account. Render it; do not compose a friendlier one from the input. */
export type ForgotPasswordResult = {
  message: string;
  passwordReset: DeliveryHint;
};

export type ResetPasswordResult = { sessionsRevoked: number };

export type AcceptInviteResult = {
  accessToken: string;
  refreshToken: string;
  user: ApiUser;
};

/* ------------------------------------------------------------------- calls */

export const account = {
  /** Creates the company, its owner and a signed-in session. */
  async register(input: RegisterInput): Promise<RegisterResult> {
    const result = await request<RegisterResult>("/auth/register", {
      method: "POST",
      body: input,
      anonymous: true,
    });
    tokens.set(result.accessToken, result.refreshToken);
    return result;
  },

  /** Re-issues the verification link. Authenticated — see the note above. */
  requestEmailVerification: () =>
    request<VerificationRequestResult>("/auth/verify-email/request", {
      method: "POST",
    }),

  confirmEmail: (token: string) =>
    request<EmailConfirmedResult>("/auth/verify-email/confirm", {
      method: "POST",
      body: { token },
      anonymous: true,
    }),

  forgotPassword: (email: string) =>
    request<ForgotPasswordResult>("/auth/forgot-password", {
      method: "POST",
      body: { email },
      anonymous: true,
    }),

  /**
   * Whether this reset link's account needs the stronger password policy —
   * asked before the password is typed, so the checklist that appears matches
   * what the real submit will demand. Read-only on the API's side; see the
   * note on `resetPasswordRequirements` in `auth/service.ts`. A dead or
   * malformed token answers `false` here and then fails the usual way on
   * submit, so a failed call is safe to treat the same as a `false` reply.
   */
  requirementsForReset: (token: string): Promise<{ requiresStrongPassword: boolean }> =>
    request<{ requiresStrongPassword: boolean }>("/auth/reset-password", {
      query: { token },
      anonymous: true,
    }),

  /** Sets the password and ends every session, this browser's included. */
  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<ResetPasswordResult> {
    const result = await request<ResetPasswordResult>("/auth/reset-password", {
      method: "POST",
      body: { token, newPassword },
      anonymous: true,
    });
    tokens.clear();
    return result;
  },

  /** Same idea as `requirementsForReset`, for an invitation instead of a reset. */
  requirementsForInvite: (token: string): Promise<{ requiresStrongPassword: boolean }> =>
    request<{ requiresStrongPassword: boolean }>("/auth/accept-invite", {
      query: { token },
      anonymous: true,
    }),

  /**
   * Exchanges an invitation for a password and a signed-in session, in one
   * request — the API's `acceptInvite` returns the same shape `sign-in` does,
   * because accepting an invitation and signing in are the same act the first
   * time. Stores tokens exactly as `register` does; the caller still calls
   * `markSignedIn(result.user)` itself, the same one extra step
   * `register-screen.tsx` takes, and for the same reason documented there.
   */
  async acceptInvite(
    token: string,
    newPassword: string,
  ): Promise<AcceptInviteResult> {
    const result = await request<AcceptInviteResult>("/auth/accept-invite", {
      method: "POST",
      body: { token, newPassword },
      anonymous: true,
    });
    tokens.set(result.accessToken, result.refreshToken);
    return result;
  },
};

/* ------------------------------------------------------------------ password */

/**
 * The password rule, mirrored from the API so the form can show it being met
 * rather than reporting it as a failure after a round trip.
 *
 * It is length-first on purpose: composition rules ("one symbol, one digit")
 * reliably produce `Password1!` and a sticky note, while length is what actually
 * resists cracking. If `registerSchema` in `approvehr-api/src/modules/auth/
 * schemas.ts` changes, change this with it — the API stays authoritative either
 * way, and anything it rejects still comes back as a field error on the form.
 */
export const PASSWORD_MIN = 12;

/** The list the API refuses. Short by design; the server is the real gate. */
const OBVIOUS = [
  "password1234",
  "passw0rd1234",
  "administrator",
  "approvehr123",
  "qwertyuiop12",
];

export type PasswordRule = {
  id: string;
  label: string;
  met: boolean;
  /**
   * `unmet` rules stay hidden until they fail. "Not an obvious password" is not
   * a hurdle anybody needs to see while typing a good one — it is a correction,
   * and a correction shown in advance is just noise.
   */
  showWhen: "always" | "unmet";
};

/**
 * The composition floor for an account that can see pay, run payroll, or hand
 * out access — layered on top of the length rule above, not instead of it, and
 * only for that tier of account. `strict` on `passwordRules`/`passwordAccepted`
 * decides whether these four apply; `requiresStrongPassword` in
 * `lib/permissions.ts` is what decides `strict` for a signed-in change of
 * password, and `register`/`accept-invite`/`reset-password` each resolve their
 * own — see the callers.
 *
 * Mirrored from `assertPasswordComplexity` in `approvehr-api/src/modules/
 * auth/service.ts`. If that changes, change this with it, the same rule the
 * length constant above already lives by — the API stays the real gate either
 * way, and a mismatch only ever costs a round trip, never a wrong acceptance.
 */
const CLASS_RULES: { id: string; label: string; test: (value: string) => boolean }[] = [
  { id: "lower", label: "A lowercase letter", test: (value) => /[a-z]/.test(value) },
  { id: "upper", label: "An uppercase letter", test: (value) => /[A-Z]/.test(value) },
  { id: "digit", label: "A number", test: (value) => /[0-9]/.test(value) },
  {
    id: "symbol",
    label: "A special character",
    test: (value) => /[^a-zA-Z0-9]/.test(value),
  },
];

export function passwordRules(value: string, strict = false): PasswordRule[] {
  const base: PasswordRule[] = [
    {
      id: "length",
      label: `${PASSWORD_MIN} characters or more`,
      met: value.length >= PASSWORD_MIN,
      showWhen: "always",
    },
    {
      id: "obvious",
      label: "Not a password everybody tries",
      met: !OBVIOUS.includes(value.toLowerCase()),
      showWhen: "unmet",
    },
  ];
  if (!strict) return base;
  return [
    ...base,
    ...CLASS_RULES.map((rule) => ({
      id: rule.id,
      label: rule.label,
      met: rule.test(value),
      showWhen: "always" as const,
    })),
  ];
}

export const passwordAccepted = (value: string, strict = false): boolean =>
  passwordRules(value, strict).every((rule) => rule.met);
