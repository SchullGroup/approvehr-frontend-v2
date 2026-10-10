# Billing paywall and Subscribe / Pay — design

The screens a company sees when its trial is ending, when it is locked, and
when it pays. The backend sends everything these screens need. Two backend
specs apply:

- `approvehr-backend` → `2026-09-27-billing-and-subscriptions-design.md`
  (PR #174). This one covers status, the 402 paywall and `/auth/me`'s
  `billing` block.
- `2026-09-29-billing-collection-accounts-design.md`. This one covers checkout,
  the per-company subscription account and automatic activation.

**Ships switched off, like the backend.** While the paywall is off
(`billing.enforced === false`), nobody sees the paywall screen or a locked
menu. The only thing that shows is the trial banner, and that only when a
trial genuinely has days left. Turning the switch on in `/admin/billing` is
what makes the rest appear.

## What the backend gives us

`GET /auth/me` → `data.billing` is either null or:

```ts
type Billing = {
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
};
```

`billing: null` means the backend could not read billing. We treat it as
"show nothing": no banner, no paywall, nothing locked. That is the backend's
fail-open rule, carried through.

Other calls:

- `GET /billing/plans` lists the plans a company can buy.
- `POST /billing/checkout { planId, months }` returns `{ order, account }`.
- `GET /billing/checkout` returns the same shape for the current open order.
- A refused request returns 402 with `error.code = "payment_required"` and
  `error.details.reason`.

## Pieces

**1. Session carries billing.** `ApiUser` in `lib/api/endpoints.ts` gains
`billing?: Billing | null`. A small `useBilling()` hook reads it from the
session store. Nothing refetches it on its own; the Pay screen asks for a
refresh (see 5).

**2. `BillingGate`**, inside `AppShell`, wrapping the page content. The sidebar
and sign-out stay visible.

- When `enforced && !entitled`, it renders the **paywall screen** instead of
  the page.
- Otherwise it renders the page.
- `/billing/*` routes are always rendered, because a locked company must be
  able to reach the Pay screen.

**3. Paywall screen.**

- _No subscription:_ "Choose a plan to start using ApproveHR."
- _Expired:_ "Your subscription ended on {date}. Your data is safe — renew to
  carry on."
- _Cancelled:_ the expired wording, with "cancelled".

Every variant has a **Subscribe / Pay** button to `/billing/pay`. Someone
without `MANAGE_SETTINGS` sees "Ask your administrator to subscribe" and no
button.

**4. Banner**, at the top of the shell.

- Last 3 days of a trial: "Your trial ends in N days."
- During grace: "Your subscription has ended. You have N days before access is
  paused."

Both carry a **Subscribe** link, shown only to people with `MANAGE_SETTINGS`.
The banner shows whether or not the paywall is enforced: telling someone
their trial ends is only honest if it is true, and it is.

**5. Subscribe / Pay screen**, `app/(app)/billing/pay/page.tsx`.

- **Step 1:** pick a plan, from cards showing name, monthly price and the
  modules included. Then pick a length: 1, 3, 6 or 12 months. The total is
  shown as you go: "₦50,000 × 3 months = ₦150,000".
- **Continue:** runs `POST /billing/checkout`.
- **Step 2:** "Transfer exactly **₦150,000** to:" followed by the bank, the
  account number (with a copy button) and the account name. Under it: "This
  account belongs to your company. We'll switch you on as soon as the money
  arrives — usually within a minute."
  - A **Change plan** link goes back to step 1.
  - While step 2 is open, `/auth/me` is polled every 10 seconds.
  - When `billing.status` becomes `ACTIVE`, the screen shows "Payment
    received — you're on {plan} until {date}", and the session updates, so the
    paywall and locks lift without a reload.
- On load, if there's an open order (`GET /billing/checkout`), the screen
  opens at step 2, so a refresh or a return visit shows the same account and
  amount.
- The screen needs `MANAGE_SETTINGS`. Anyone else sees the same message as the
  paywall.

**6. Locked menu items.** Each nav module group maps to a billing module:

| Nav group     | Billing module   |
| ------------- | ---------------- |
| `core-hr`     | `CORE_HR`        |
| `payroll`     | `PAYROLL`        |
| `time`        | `TIME_AND_LEAVE` |
| `hiring`      | `RECRUITMENT`    |
| `performance` | `PERFORMANCE`    |
| `desk`        | `HELPDESK`       |

When `enforced`, items in a group whose module isn't in `billing.modules`
stay visible with a lock icon, and link to `/billing/pay`. This is done in
`visibleNav` (as a new `locked` flag on the item), so the sidebar, the mobile
sheet and the command palette all agree.

**7. A 402 anywhere else.** If a request still comes back 402, the API client
leaves the error as an `ApiError`. Screens then show the backend's message,
which already reads "Your company's plan does not include this. Upgrade the
plan to use it." One case can cause this: a page opened just before the
switch flipped. The next `/auth/me` corrects the gate. No global redirect,
because a redirect from inside a form would lose the user's work.

**8. Settings entry point.** Settings gains a **Billing** card for people with
`MANAGE_SETTINGS`. It shows the current plan, status and the relevant date,
with **Subscribe / Pay** or **Renew** linking to `/billing/pay`.

## Money and dates

- Kobo to naira goes through the existing money formatter.
- Dates use the company timezone helper the rest of the app uses.
- "N days" counts whole days, rounding down, from now to the relevant date.
  Zero reads as "today".

## Testing

- **Component tests** (vitest):
  - `BillingGate`: the matrix of enforced × entitled × `/billing` route ×
    `billing: null`.
  - Paywall variants, with and without `MANAGE_SETTINGS`.
  - Banner: trial with 3 / 4 days left, grace, and nothing when active.
  - `visibleNav` locking: an item is locked only when enforced and the module
    is missing.
  - Pay screen: the total is computed correctly; an existing order opens at
    step 2; seeing `ACTIVE` while polling shows the success state.
- **One Playwright walk** against a local backend with the fake 9jaPay
  provider: a locked company opens the app and sees the paywall, then pays.
  1. On `/billing/pay`, choose a plan and continue.
  2. A signed test inflow is posted to the backend's 9jaPay webhook for the
     shown account and amount.
  3. Within one poll, the success state shows and the dashboard opens.

## Out of scope

- Card payments, until the 9jaPay checkout arrives.
- Invoices and receipts.
- Changing plan mid-period from the UI.
- Showing unapplied payments to the customer. Short payments are for the admin
  in phase 1; the customer sees the step 2 screen still waiting, plus a
  line: "Paid a different amount? Contact support."
