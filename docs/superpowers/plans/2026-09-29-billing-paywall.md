# Billing Paywall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a company its billing state and let it pay:

- a trial/grace banner;
- a paywall screen in place of a locked company's pages;
- locked menu items for modules outside its plan;
- a Settings card;
- a Subscribe / Pay screen that shows the exact amount and the company's own
  account number, then flips to "you're subscribed" by itself when the money
  lands.

**Architecture:** Everything reads one field, `user.billing`, which `/auth/me`
already returns once the backend branch is deployed. Four pieces render from it:

- `useBilling()` plus pure helpers in `src/lib/billing.ts`.
- `BillingGate` wraps page content inside `AppShell` and swaps in `Paywall`.
- `BillingBanner` sits beside `VerificationBanner`.
- `visibleNav` marks items `locked` from a group → module map.

The Pay screen is the only page that talks to the billing API
(`src/lib/api/billing.ts`). It polls a new `refreshSession()` until the status
becomes ACTIVE.

**Tech Stack:** Next.js (this repo's version — read `node_modules/next/dist/docs/`
per `AGENTS.md` before touching routing), React, TypeScript, Tailwind, lucide-react,
Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-29-billing-paywall-design.md`. The backend
contracts are in `approvehr-backend`: `docs/superpowers/specs/2026-09-27-billing-and-subscriptions-design.md`
and `2026-09-29-billing-collection-accounts-design.md`.

## Global Constraints

- **While the paywall is off (`billing.enforced === false`), nothing locks.** There is no paywall screen and no locked menu. Only the banner can show.
- **`billing` null or undefined means show nothing.** That covers demo mode, an older backend and a failed billing read.
- Only `MANAGE_SETTINGS` holders see Subscribe/Pay actions, and only they can open `/billing/pay`. Everyone else sees "Ask your administrator to subscribe."
- `/billing/*` always renders, even while locked.
- The banner shows in the last **3** days of a trial (`TRIALING`), and throughout `GRACE`. "N days" is whole days, rounded down; `0` reads "today".
- Months are one of `1, 3, 6, 12`. Money from the API is **kobo**. `formatMoney` takes **naira**, so divide by 100 at the boundary.
- Nav group → billing module: `core-hr→CORE_HR, payroll→PAYROLL, time→TIME_AND_LEAVE, hiring→RECRUITMENT, performance→PERFORMANCE, desk→HELPDESK`. Personal and company-wide groups never lock.
- A stray 402 stays a normal `ApiError`, showing the server's message. No global redirect.
- Frontend PRs target **`dev`**. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` after a blank line.
- Follow `AGENTS.md`: search `docs/pages/` and `docs/components/` before adding a component, and keep those inventories in step. Check how they are regenerated (look in `scripts/` and `package.json`), and regenerate them rather than hand-editing.

## Deliberate departures from the spec

1. **No Playwright walk.** `playwright.config.ts` runs the app in demo mode against a dead API port, and `e2e/` has no real-backend fixture. The end-to-end check becomes a written manual smoke walk in Task 7. The logic is covered by component tests.
2. **The Settings card is its own `BillingCard` component**, rendered above the `ONGOING` grid. `ONGOING` is static `{href, title, description, icon}` data and can't show live status.
3. **`SetupGate` exempts `/billing`.** Otherwise a locked owner whose setup isn't finished would be redirected to `/setup`, whose API calls are themselves refused with 402.

## Review Focus

1. **`billing` missing entirely (demo mode, an older backend).** No gate, banner or lock. Pinned in Tasks 2, 3 and 4.
2. **Enforced but entitled, on a module outside the plan.** The page renders; only the menu shows a lock. The gate must not paywall an entitled company. Pinned in Task 2.
3. **A trial ending today.** Reads "today", not "0 days". Pinned in Task 1.
4. **Pay screen refreshed mid-payment.** Resumes at step 2 with the same account and amount. Pinned in Task 5.
5. **Polling stops when the screen unmounts, and after success.** No interval leaks. Pinned in Task 5.

---

### Task 1: Types, API module, session refresh, pure helpers

**Files:**

- Modify: `src/lib/api/endpoints.ts` (`ApiUser`)
- Create: `src/lib/api/billing.ts`
- Modify: `src/lib/store/session.ts` (export `refreshSession`)
- Create: `src/lib/billing.ts`
- Test: `tests/billing-helpers.test.ts`

**Interfaces:**

- Produces:
  - `type ApiBilling` (the spec's `Billing` shape);
  - `ApiUser.billing?: ApiBilling | null`;
  - `billingApi.plans()`, `billingApi.checkout({ planId, months })`, `billingApi.currentCheckout()` (resolves `null` on a 404), and the types `ApiPlan`, `ApiCheckout`;
  - `refreshSession(): Promise<void>`;
  - from `src/lib/billing.ts`: `useBilling(): ApiBilling | null`, `CHECKOUT_MONTHS`, `BillingModule`, `wholeDaysUntil(iso: string, now?: Date): number`, `daysLabel(n: number): string`, `bannerFor(billing: ApiBilling | null, now?: Date): { kind: "trial" | "grace"; days: number } | null`, `isLockedOut(billing: ApiBilling | null): boolean`, `moduleLocked(billing: ApiBilling | null, module: BillingModule): boolean`, `nairaOf(kobo: number): number`.

- [ ] **Step 1: Failing tests**, in `tests/billing-helpers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  bannerFor,
  daysLabel,
  isLockedOut,
  moduleLocked,
  wholeDaysUntil,
} from "@/lib/billing";
import type { ApiBilling } from "@/lib/api/endpoints";

const NOW = new Date("2026-10-01T12:00:00Z");
const DAY = 86_400_000;
const iso = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const base: ApiBilling = {
  status: "ACTIVE",
  entitled: true,
  enforced: true,
  reason: null,
  plan: { name: "Growth", priceKobo: 5_000_000 },
  modules: ["CORE_HR", "PAYROLL"],
  trialEndsAt: null,
  currentPeriodEnd: iso(20 * DAY),
  graceEndsAt: null,
  lockedSince: null,
  cancelledAt: null,
  order: null,
};

describe("wholeDaysUntil / daysLabel", () => {
  it("rounds down and says today at zero", () => {
    expect(wholeDaysUntil(iso(2.9 * DAY), NOW)).toBe(2);
    expect(wholeDaysUntil(iso(0.5 * DAY), NOW)).toBe(0);
    expect(daysLabel(0)).toBe("today");
    expect(daysLabel(1)).toBe("in 1 day");
    expect(daysLabel(3)).toBe("in 3 days");
  });
});

describe("bannerFor", () => {
  it("is null with no billing", () => expect(bannerFor(null, NOW)).toBeNull());
  it("shows in the last 3 days of a trial only", () => {
    const trial = (d: number) => ({
      ...base,
      status: "TRIALING" as const,
      trialEndsAt: iso(d * DAY),
    });
    expect(bannerFor(trial(3.5), NOW)).toEqual({ kind: "trial", days: 3 });
    expect(bannerFor(trial(4.1), NOW)).toBeNull();
    expect(bannerFor(trial(0.2), NOW)).toEqual({ kind: "trial", days: 0 });
  });
  it("shows throughout grace, counting to graceEndsAt", () => {
    expect(
      bannerFor({ ...base, status: "GRACE", graceEndsAt: iso(6.5 * DAY) }, NOW),
    ).toEqual({ kind: "grace", days: 6 });
  });
  it("shows nothing when active", () =>
    expect(bannerFor(base, NOW)).toBeNull());
});

describe("isLockedOut / moduleLocked", () => {
  it("locks only when enforced and not entitled", () => {
    expect(isLockedOut(null)).toBe(false);
    expect(isLockedOut({ ...base, entitled: false, enforced: false })).toBe(
      false,
    );
    expect(isLockedOut({ ...base, entitled: false, status: "LOCKED" })).toBe(
      true,
    );
  });
  it("locks a module only when enforced and missing from the plan", () => {
    expect(moduleLocked(base, "RECRUITMENT")).toBe(true);
    expect(moduleLocked(base, "PAYROLL")).toBe(false);
    expect(moduleLocked({ ...base, enforced: false }, "RECRUITMENT")).toBe(
      false,
    );
    expect(moduleLocked(null, "RECRUITMENT")).toBe(false);
  });
});
```

- [ ] **Step 2:** Run `npx vitest run tests/billing-helpers.test.ts` and confirm it fails.

- [ ] **Step 3: Types.** In `src/lib/api/endpoints.ts`, add and export:

```ts
/** `/auth/me`'s billing block. Null or absent = show nothing (demo, older API, or a failed read). */
export type ApiBilling = {
  status: "TRIALING" | "ACTIVE" | "GRACE" | "LOCKED" | "CANCELLED";
  entitled: boolean;
  enforced: boolean;
  reason: "no_subscription" | "expired" | null;
  plan: { name: string; priceKobo: number | null } | null;
  modules: (
    | "CORE_HR"
    | "PAYROLL"
    | "TIME_AND_LEAVE"
    | "RECRUITMENT"
    | "PERFORMANCE"
    | "HELPDESK"
  )[];
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  graceEndsAt: string | null;
  lockedSince: string | null;
  cancelledAt: string | null;
  order: {
    planId: string;
    planName: string;
    months: number;
    amountKobo: number;
  } | null;
  /** Money received into the subscription account that nothing has been applied to yet (short, or unexpected). 0 when none. */
  unappliedKobo: number;
};
```

Add `billing?: ApiBilling | null;` to `ApiUser`, with a doc comment in the file's style: only `/auth/me` returns it, so sign-in and refresh leave it undefined until the next restore.

- [ ] **Step 4: API module.** Create `src/lib/api/billing.ts` in the shape of `src/lib/api/webhooks.ts` (header comment, types, one exported object):

```ts
import { ApiError, request } from "./client";

export type ApiPlan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceKobo: number;
  currency: string;
  modules: string[];
};
export type ApiCheckout = {
  order: {
    id: string;
    planId: string;
    planName: string;
    months: number;
    amountKobo: number;
  };
  account: { bankName: string; accountNumber: string; accountName: string };
};

export const billingApi = {
  plans: (signal?: AbortSignal) =>
    request<ApiPlan[]>("/billing/plans", signal ? { signal } : {}),
  checkout: (body: { planId: string; months: number }) =>
    request<ApiCheckout>("/billing/checkout", { method: "POST", body }),
  /** The open order, or null when there is none (the API answers 404). */
  currentCheckout: async (
    signal?: AbortSignal,
  ): Promise<ApiCheckout | null> => {
    try {
      return await request<ApiCheckout>(
        "/billing/checkout",
        signal ? { signal } : {},
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },
};
```

Check `request`'s options type in `client.ts:287`, and adapt the `signal` spread if the type needs it.

- [ ] **Step 5: `refreshSession`.** In `session.ts`, add it beside `markSignedIn` (`~142`):

```ts
/**
 * Re-read `/auth/me` into the session, for a screen that knows the answer has
 * changed server-side — the Pay screen, watching for a payment to land. A
 * failure leaves the session as it was: this is a refresh, not a sign-in.
 */
export async function refreshSession(): Promise<void> {
  if (cache.status !== "signed_in" || cache.mode !== "api") return;
  try {
    const me = await auth.me();
    set({ user: me });
  } catch {
    /* Keep what we had; the next restore or poll tries again. */
  }
}
```

Check the real names of the internal state variable, the setter, and the `status`/`mode` values in `session.ts`, then match them exactly. If `set` replaces the whole state rather than merging, spread the current state.

- [ ] **Step 6: Helpers.** Create `src/lib/billing.ts`:

```ts
"use client";
import { useSession } from "@/lib/store/session";
import type { ApiBilling } from "@/lib/api/endpoints";

export type BillingModule = ApiBilling["modules"][number];
export const CHECKOUT_MONTHS = [1, 3, 6, 12] as const;
const DAY_MS = 86_400_000;
const TRIAL_WARNING_DAYS = 3;

export function useBilling(): ApiBilling | null {
  return useSession().user?.billing ?? null;
}

export const nairaOf = (kobo: number): number => Math.round(kobo) / 100;

export function wholeDaysUntil(iso: string, now = new Date()): number {
  return Math.max(0, Math.floor((Date.parse(iso) - now.getTime()) / DAY_MS));
}

export function daysLabel(days: number): string {
  if (days <= 0) return "today";
  return `in ${days} day${days === 1 ? "" : "s"}`;
}

export function bannerFor(
  billing: ApiBilling | null,
  now = new Date(),
): { kind: "trial" | "grace"; days: number } | null {
  if (!billing) return null;
  if (billing.status === "TRIALING" && billing.trialEndsAt) {
    const days = wholeDaysUntil(billing.trialEndsAt, now);
    return days <= TRIAL_WARNING_DAYS ? { kind: "trial", days } : null;
  }
  if (billing.status === "GRACE" && billing.graceEndsAt) {
    return { kind: "grace", days: wholeDaysUntil(billing.graceEndsAt, now) };
  }
  return null;
}

export function isLockedOut(billing: ApiBilling | null): boolean {
  return !!billing && billing.enforced && !billing.entitled;
}

export function moduleLocked(
  billing: ApiBilling | null,
  module: BillingModule,
): boolean {
  return !!billing && billing.enforced && !billing.modules.includes(module);
}
```

Before creating it, search `docs/components/` for an existing `billing` helper; if one exists, don't create a second.

- [ ] **Step 7:** Run `npx vitest run tests/billing-helpers.test.ts`, then `npm run typecheck`, `npm run lint` and `npm run format:check`. Commit with `feat(billing): billing types, API module and session refresh`.

---

### Task 2: `BillingGate` and the paywall screen

**Files:**

- Create: `src/components/portal/billing-gate.tsx`, `src/components/portal/paywall.tsx`
- Modify: `src/components/portal/shell.tsx` (wrap `{children}` at ~355)
- Modify: `src/components/portal/setup-gate.tsx` (exempt `/billing`)
- Test: `tests/billing-gate.test.tsx`

**Interfaces:**

- Consumes: `useBilling`, `isLockedOut` (Task 1).
- Produces: `<BillingGate>{children}</BillingGate>`, `<Paywall billing={...} canPay={boolean} />`.

- [ ] **Step 1: Failing tests.** Copy the `vi.mock("@/lib/store/session", …)` idiom from an existing session-dependent test; `grep -l "vi.mock(\"@/lib/store/session\"" tests` finds one. Also mock `next/navigation`'s `usePathname`. Matrix:
  - `billing` undefined: renders children.
  - Enforced false and not entitled: children.
  - Enforced and entitled, even with modules missing: children (Review Focus 2).
  - Enforced and not entitled, on `/dashboard`: renders the paywall, not the children.
  - The same, on `/billing/pay`: children.
  - Paywall copy:
    - `reason: "no_subscription"` shows "Choose a plan to start using ApproveHR."
    - `expired` shows "Your subscription ended on …" and "Your data is safe".
    - `status: "CANCELLED"` says "cancelled".
  - With `MANAGE_SETTINGS`, a **Subscribe / Pay** link to `/billing/pay`. Without it, "Ask your administrator to subscribe." and no link.

- [ ] **Step 2:** Run the tests and confirm they fail.

- [ ] **Step 3: `Paywall`.** Build it from `EmptyState` (or `Card` + `Callout`) out of `@/components/ui`. Use `formatDate(billing.lockedSince ?? billing.currentPeriodEnd ?? billing.trialEndsAt, timeZone)` from `src/lib/time.ts`, with `timeZone` from `useOrgTimezone()`. Headings:
  - `no_subscription`: "Choose a plan to start using ApproveHR."
  - `expired`: "Your subscription ended on {date}. Your data is safe — renew to carry on."
  - `CANCELLED`: "Your subscription was cancelled and ended on {date}. Your data is safe — renew to carry on."

  The action is `ButtonLink href="/billing/pay"` labelled "Subscribe / Pay". When `!canPay`, show "Ask your administrator to subscribe." instead.

- [ ] **Step 4: `BillingGate`.**

```tsx
"use client";
import { usePathname } from "next/navigation";
import { useBilling, isLockedOut } from "@/lib/billing";
import { usePermissions } from "@/lib/permissions";
import { Paywall } from "./paywall";

/**
 * Swaps a locked company's page for the paywall, in place — the sidebar and
 * sign-out stay, and `/billing/*` always renders so they can pay. Nothing is
 * redirected, and nothing happens while the paywall is switched off or billing
 * is unknown: the backend's fail-open rule, carried through.
 */
export function BillingGate({ children }: { children: React.ReactNode }) {
  const billing = useBilling();
  const pathname = usePathname() ?? "";
  const { can } = usePermissions();
  if (!billing || !isLockedOut(billing) || pathname.startsWith("/billing")) {
    return <>{children}</>;
  }
  return <Paywall billing={billing} canPay={can("MANAGE_SETTINGS")} />;
}
```

- [ ] **Step 5: Wire it in.** In `shell.tsx`, replace `{children}` inside `<main>` with `<BillingGate>{children}</BillingGate>`. In `setup-gate.tsx`, add `/billing` to the exempt paths (`~48-49`), with a one-line comment explaining why.

- [ ] **Step 6:** Run `npx vitest run tests/billing-gate.test.tsx`, then typecheck, lint and format:check. Update the `docs/components/` inventory per `AGENTS.md`. Commit with `feat(billing): paywall in place of a locked company's pages`.

---

### Task 3: Trial / grace banner

**Files:**

- Create: `src/components/portal/billing-banner.tsx`
- Modify: `src/components/portal/shell.tsx` (mount beside `<VerificationBanner />`)
- Test: `tests/billing-banner.test.tsx`

- [ ] **Step 1: Failing tests** (mock the session as in Task 2):
  - Trial, 2 days left: "Your trial ends in 2 days."
  - Trial ending today: "Your trial ends today." (Review Focus 3)
  - Trial, 10 days left: nothing.
  - Grace: "Your subscription has ended. You have 6 days before access is paused."
  - Active: nothing. `billing` undefined: nothing.
  - The **Subscribe** link (`/billing/pay`) appears only with `MANAGE_SETTINGS`.
  - It shows even when `enforced: false`.

- [ ] **Step 2:** Run the tests and confirm they fail.

- [ ] **Step 3: Implement.** Copy `VerificationBanner`'s structure (`verification-banner.tsx`): a `"use client"` component, a sticky strip, an icon, a message and an action, returning `null` when not applicable. Use `bannerFor(useBilling())` and `daysLabel`:
  - trial: `Your trial ends ${daysLabel(days)}.`
  - grace: `Your subscription has ended. You have ${days === 0 ? "until today" : `${days} day${days === 1 ? "" : "s"}`} before access is paused.`

  Use the warning tone of the design system's banner colours. Leave out the dismiss button: this is a deadline, not a nag.

- [ ] **Step 4:** Mount `<BillingBanner />` directly above `<VerificationBanner />` in `shell.tsx`. Run the tests, typecheck, lint and format:check, and update the inventory. Commit with `feat(billing): trial and grace countdown banner`.

---

### Task 4: Locked menu items

**Files:**

- Modify: `src/components/portal/nav.tsx` (`NavGroup`, `NAV`, `visibleNav`), `src/components/portal/shell.tsx` (`SidebarNav` item rendering, the `visibleNav` call), `src/components/portal/command-palette.tsx` (only if it lists module pages)
- Test: `tests/nav-billing-lock.test.ts`

**Interfaces:**

- `NavGroup` gains `billingModule?: BillingModule`.
- `NavItem` gains `locked?: boolean`.
- `visibleNav(groups, permissions, features, facts, billing?: ApiBilling | null)`: the new last parameter is optional, so existing callers and tests keep compiling.

- [ ] **Step 1: Failing test.** Build a two-group `NavGroup[]` fixture:
  - a `billingModule: "RECRUITMENT"` group with one `always` item `{ href: "/hiring" }`;
  - a group with no `billingModule`.

  Call `visibleNav` with an empty permission set, `{}` features and default facts, and assert:
  - `billing` undefined: nothing locked, and hrefs unchanged (Review Focus 1).
  - Enforced, modules without RECRUITMENT: the hiring item has `locked: true` and `href: "/billing/pay"`. The other group's item is untouched.
  - The same, with `enforced: false`: nothing locked.
  - Also assert that `NAV`'s groups carry the mapped `billingModule` for each of the six modules. Find them by `heading`, against the `MODULES` labels.

- [ ] **Step 2:** Run the test and confirm it fails.

- [ ] **Step 3: Map at assembly.** In `NAV`, set `billingModule: BILLING_MODULE_OF[module.id]` on each module group, with

```ts
/** Which paid module pays for each nav group. Personal and company-wide groups never lock. */
const BILLING_MODULE_OF: Record<ModuleId, BillingModule> = {
  "core-hr": "CORE_HR",
  payroll: "PAYROLL",
  time: "TIME_AND_LEAVE",
  hiring: "RECRUITMENT",
  performance: "PERFORMANCE",
  desk: "HELPDESK",
};
```

If `ModuleId` has more members than these six (check `src/lib/marketing/modules.ts:56`), the `Record` type makes that a compile error. Map any extra deliberately, or make it `Partial` with a comment.

- [ ] **Step 4: Lock in `visibleNav`.** After the existing filtering for each group, if `moduleLocked(billing ?? null, group.billingModule)` holds, map each surviving item to `{ ...item, locked: true, href: "/billing/pay" }`. Visibility rules still apply first: a lock never reveals an item the reader couldn't see anyway.

- [ ] **Step 5: Render.** In `shell.tsx`, pass `useBilling()` into the `visibleNav` `useMemo`, and add it to the deps. In `SidebarNav`, when `item.locked`, render `Lock` from lucide-react in the badge slot, give the link `aria-label={`${item.label} (not in your plan)`}`, and mute the label. Then check `command-palette.tsx`:
  - If it builds its own list of module pages, apply the same `moduleLocked` rule there: hide them, or route them to `/billing/pay`, whichever matches how it treats unavailable items.
  - If it doesn't list module pages, note that in the report.

- [ ] **Step 6:** Run `npx vitest run tests/nav-billing-lock.test.ts` plus any existing nav/shell tests (`grep -l visibleNav tests`), then typecheck, lint and format:check. Commit with `feat(billing): lock menu items outside the company's plan`.

---

### Task 5: Subscribe / Pay screen

**Files:**

- Create: `src/app/(app)/billing/pay/page.tsx`, `src/app/(app)/billing/pay/pay-screen.tsx`
- Test: `tests/billing-pay-screen.test.tsx`

**Interfaces:**

- Consumes: `billingApi`, `refreshSession`, `useBilling`, `CHECKOUT_MONTHS`, `nairaOf` (Task 1); `formatMoney`, `ButtonLink`, `Card`, `RadioCard` or `SegmentedControl`, and `useToast` (`@/components/ui`); `PageHeader` and `PageBody` (`@/components/portal/shell`).
- Props for testability: `PayScreen({ api = billingApi, refresh = refreshSession, pollMs = 10_000 })`, so tests inject fakes instead of mocking modules. This is the `export-button.test.tsx` idiom.

- [ ] **Step 1: Failing tests**, using `vi.useFakeTimers()` for polling, with a mocked session:
  - Without `MANAGE_SETTINGS`: "Ask your administrator to subscribe." and no plans are fetched.
  - With it, and `currentCheckout` resolving `null`: plan cards come from `api.plans()`.
    - Picking a plan and **3 months** shows "₦50,000 × 3 months = ₦150,000", for `priceKobo: 5_000_000`.
    - **Continue** calls `api.checkout({ planId, months: 3 })`, then shows "Transfer exactly ₦150,000", the account number, the bank and the account name.
  - **Resume (Review Focus 4):** `currentCheckout` resolving an order opens directly at step 2 with that order's amount and account.
  - **Polling:** at step 2, advancing timers by `pollMs` calls `refresh` once per tick.
    - When the mocked session's `billing.order` becomes `null` and `billing.entitled` is true, the screen shows "Payment received — you're on Growth until …", and further ticks don't call `refresh` (Review Focus 5). It must **not** switch just because `status` is already `ACTIVE`: a company renewing early is ACTIVE before it has paid.
    - When `billing.unappliedKobo > 0` while still waiting, the screen shows "We've received ₦X so far, which doesn't cover this order. Our team will be in touch."
    - Unmounting stops the calls.
  - **Change plan** goes back to step 1.
  - A 422 from `checkout` with the message "Payments are not set up on this server yet." shows a clear "Online payment isn't available yet — contact support to subscribe." state, not a raw error.
  - An `ApiError` from `checkout` shows its message inline, and the screen stays on step 1.

- [ ] **Step 2:** Run the tests and confirm they fail.

- [ ] **Step 3: Page.** `page.tsx` follows the settings split:

```tsx
import type { Metadata } from "next";
import { PayScreen } from "./pay-screen";
export const metadata: Metadata = {
  title: "Subscribe",
  description: "Choose a plan and pay into your company's account.",
};
export default function PayPage() {
  return <PayScreen />;
}
```

Check `npm run verify-titles` in `check`, and follow whatever title rule it enforces.

- [ ] **Step 4: Screen.** A `"use client"` component with three states: `choose`, `transfer`, `done`.
  - **On mount:** if the user can't pay, render the administrator message. Otherwise load `api.currentCheckout()` and `api.plans()` in parallel. If there's an open checkout, go to `transfer` with it.
  - **`choose`:**
    - a plan card per plan, showing name, `formatMoney(nairaOf(priceKobo))` "/ month", and module names in words;
    - a months picker (1, 3, 6, 12), defaulting to 1;
    - the running total line;
    - **Continue**, disabled until a plan is picked. It calls `api.checkout`, then goes to `transfer`.
  - **`transfer`:**
    - "Transfer exactly **{amount}** to:", then the bank, the account number with a **Copy** button (copy the pattern at `src/components/portal/invite-link.tsx:108-116`: `navigator.clipboard.writeText` in try/catch plus a toast), and the account name;
    - the line "This account belongs to your company. We'll switch you on as soon as the money arrives — usually within a minute.";
    - when `billing.unappliedKobo > 0`: "We've received {formatMoney(nairaOf(unappliedKobo))} so far, which doesn't cover this order. Our team will be in touch." Otherwise: "Paid a different amount? Contact support.";
    - a **Change plan** link, back to `choose`;
    - an effect: `setInterval(refresh, pollMs)`, cleared on unmount and on leaving `transfer`.
  - **`done`:** when `useBilling()` has `order === null` and `entitled === true`, switch here and stop polling. Don't use `status === "ACTIVE"` on its own: a company renewing early is already ACTIVE before it pays. Show "Payment received — you're on {plan.name} until {formatDate(currentPeriodEnd)}." with a link to `/dashboard`.

- [ ] **Step 5:** Run `npx vitest run tests/billing-pay-screen.test.tsx`, then typecheck, lint and format:check. Update the `docs/pages/` inventory. Commit with `feat(billing): Subscribe / Pay screen with the company's account and exact amount`.

---

### Task 6: Billing card in Settings

**Files:**

- Create: `src/app/(app)/settings/billing-card.tsx`
- Modify: `src/app/(app)/settings/settings-screen.tsx` (render above the `ONGOING` grid)
- Test: `tests/billing-card.test.tsx`

- [ ] **Step 1: Failing tests:**
  - Not rendered without `MANAGE_SETTINGS`, or with `billing` undefined.
  - `TRIALING`: "Free trial · ends {date}" and **Subscribe / Pay**.
  - `ACTIVE`: "{plan} · paid until {date}" and **Renew**.
  - `GRACE`, `LOCKED` or `CANCELLED`: the status in words and **Renew**.
  - While `enforced` is false, a quiet line: "Billing isn't switched on yet — nothing is locked."

- [ ] **Step 2:** Implement with `Card` / `CardBody` and a `Badge` for the status (tone: warning for grace, danger for locked or cancelled, success for active, info for trial). The action is a `ButtonLink` to `/billing/pay`. Render `<BillingCard />` at the top of the settings screen's ongoing section.

- [ ] **Step 3:** Run the tests, typecheck, lint and format:check. Commit with `feat(billing): billing status card in Settings`.

---

### Task 7: Full check, manual smoke walk, PR

- [ ] **Step 1:** `npm run check` must pass. `npm test` must also pass; it isn't part of `check`, so run it separately.
- [ ] **Step 2: Manual smoke walk** against the local backend on branch `feat/billing-collection-accounts`, following the memory note on running the pair:
  1. Start the backend with `PORT=8010 CORS_ORIGINS=http://localhost:3001 PAYMENTS_FAKE_PROVIDER=true npm run dev`, and the frontend with `npm run dev -- -p 3001`. Never open the bare `/` path, which redirects to production.
  2. In `/admin/billing` on the backend, switch the paywall ON. The seed gives the demo company a 365-day trial, so first lock it: run `DELETE FROM subscriptions WHERE "organizationId" = (SELECT id FROM organizations WHERE slug = 'schull');` against the **local** dev database only. Sign in as the Administrator. You should see the paywall with **Subscribe / Pay**.
  3. Choose a plan and 1 month, then Continue. You should see the amount and an invented account number.
  4. Simulate the deposit. Use the backend test helper, or post a signed 9jaPay inflow as `tests/ninejapay-inflow.test.ts` does, with the local `NINEJAPAY_SECRET_KEY`. Within 10 seconds the screen should show "Payment received", and the menu and pages should unlock.
  5. Switch the paywall OFF again.

  Write down what you saw in the report, with screenshots if the tooling allows.

- [ ] **Step 3: Ask the user before pushing.** The PR targets **`dev`**. Its description should say that it needs the backend's `feat/billing-collection-accounts` (and PR #174) deployed, and that with an older backend it shows nothing.
