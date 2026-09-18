import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * The link is reachable even when the server can send email.
 *
 * ## The failure this closes
 *
 * `InviteLinkButton` existed, worked, and was rendered behind
 * `noEmail && …` — true only when `GET /invites/delivery` answers
 * `{ email: false }`, which means *this deployment has no mail transport at
 * all*. That was the only failure the screens modelled.
 *
 * The common one is the other: the server sends perfectly, and the invitation
 * does not arrive — a typo'd address, a mailbox over quota, a filter that ate
 * it, a domain that silently drops mail from a new sender. In every one of
 * those the account exists, the person cannot get in, and the one control that
 * would fix it in ten seconds was invisible because the *server* was healthy.
 *
 * The API never had this gate. `POST /invites/:userId/link` is guarded by
 * `INVITE_STAFF`, `assertCanGrant`, a refusal for any account that already has
 * a password, and an audit row — none of which ask whether mail is configured.
 * Only the UI asked, and only the UI hid it.
 *
 * ## Why this is a test and not a glance
 *
 * `noEmail && <InviteLinkButton …>` typechecks perfectly. So does the version
 * that hides the control from everybody who needs it. Nothing but rendering it
 * under a healthy mail transport can tell the two apart.
 */

const link = vi.fn();
const deliveryAnswer = {
  current: { email: true, note: null as string | null },
};
const pendingRows = {
  current: [] as {
    userId: string;
    employeeId: string | null;
    email: string;
    name: string;
    roles: string[];
    invitedAt: string;
    expired: boolean;
  }[],
};

vi.mock("@/lib/api/invites", () => ({
  invitesApi: {
    link: (...args: unknown[]) => link(...args),
    delivery: () => Promise.resolve(deliveryAnswer.current),
    list: () => Promise.resolve({ data: pendingRows.current }),
    send: () => Promise.reject(new Error("not part of this test")),
    resend: () => Promise.reject(new Error("not part of this test")),
    revoke: () => Promise.reject(new Error("not part of this test")),
  },
}));

vi.mock("@/lib/api/permissions", () => ({
  permissionsApi: {
    roles: () =>
      Promise.resolve({ roles: [{ id: "role-employee", name: "Employee" }] }),
  },
}));

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));

const { InviteToSignIn } =
  await import("@/app/(app)/people/[id]/invite-to-sign-in");

const wrap = (ui: React.ReactNode) =>
  render(<ToastProvider>{ui}</ToastProvider>);

const openFor = (employeeId: string) =>
  wrap(
    <InviteToSignIn
      employeeId={employeeId}
      name="Grace Okafor"
      email="grace@example.com"
      onClose={() => {}}
    />,
  );

beforeEach(() => {
  link.mockReset();
  deliveryAnswer.current = { email: true, note: null };
  pendingRows.current = [];
});

describe("somebody was invited and the email never arrived", () => {
  it("offers the link on a server that can send email", async () => {
    pendingRows.current = [
      {
        userId: "user-1",
        employeeId: "emp-1",
        email: "grace@example.com",
        name: "Grace Okafor",
        roles: ["Employee"],
        invitedAt: "2026-09-10T09:00:00.000Z",
        expired: false,
      },
    ];

    openFor("emp-1");

    /* The whole point. `delivery.email` is true here — the server is healthy —
       and the control still has to be on screen, because a healthy server is
       not the same fact as a delivered email. */
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Get a link to send them/ }),
      ).toBeInTheDocument();
    });
  });

  it("still offers it when the server cannot send at all", async () => {
    deliveryAnswer.current = {
      email: false,
      note: "This server cannot send email yet.",
    };
    pendingRows.current = [
      {
        userId: "user-1",
        employeeId: "emp-1",
        email: "grace@example.com",
        name: "Grace Okafor",
        roles: ["Employee"],
        invitedAt: "2026-09-10T09:00:00.000Z",
        expired: false,
      },
    ];

    openFor("emp-1");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Get a link to send them/ }),
      ).toBeInTheDocument();
    });
  });

  /* Nothing is minted on open. Each press invalidates the previous token, so a
     dialog that took a link just by being opened would kill the link in
     somebody's inbox every time a colleague looked at the record. */
  it("mints nothing until somebody asks for it", async () => {
    pendingRows.current = [
      {
        userId: "user-1",
        employeeId: "emp-1",
        email: "grace@example.com",
        name: "Grace Okafor",
        roles: ["Employee"],
        invitedAt: "2026-09-10T09:00:00.000Z",
        expired: false,
      },
    ];

    openFor("emp-1");

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Get a link to send them/ }),
      ).toBeInTheDocument();
    });
    expect(link).not.toHaveBeenCalled();
  });
});

/**
 * The same way in, from the list of everybody who has not accepted.
 *
 * The person's record is where you go if you already know who you are looking
 * for. Settings → Roles → Invitations is where you go when somebody says "we
 * invited them last week and they still cannot get in" — it is precisely the
 * list of people in that state, and the only two actions on a row were Resend
 * (the same mail, to the same address that already swallowed one) and Revoke.
 */
const { InvitationsCard } =
  await import("@/app/(app)/settings/roles/roles-screen");

const invitesState = (rows: (typeof pendingRows)["current"]) => ({
  invites: rows,
  loading: false,
  error: null,
  connected: true,
  reload: () => {},
  send: () => Promise.reject(new Error("not part of this test")),
  resend: () => Promise.reject(new Error("not part of this test")),
  revoke: () => Promise.reject(new Error("not part of this test")),
});

describe("the invitations panel", () => {
  const row = {
    userId: "user-1",
    employeeId: "emp-1",
    email: "grace@example.com",
    name: "Grace Okafor",
    roles: ["Employee"],
    invitedAt: "2026-09-10T09:00:00.000Z",
    expired: false,
  };

  it("offers a link beside resend and revoke", () => {
    const linked: string[] = [];
    wrap(
      <InvitationsCard
        invites={
          invitesState([row]) as unknown as Parameters<
            typeof InvitationsCard
          >[0]["invites"]
        }
        canInvite
        onInvite={() => {}}
        onResend={() => {}}
        onRevoke={() => {}}
        onLink={(invite) => linked.push(invite.userId)}
      />,
    );

    screen.getByRole("button", { name: /Copy link/ }).click();
    expect(linked).toEqual(["user-1"]);
  });

  /* The panel is `INVITE_STAFF`-gated as a whole, and the row actions follow
     it. A reader who cannot invite must not be offered a way into an account. */
  it("offers nothing to somebody who cannot invite", () => {
    wrap(
      <InvitationsCard
        invites={
          invitesState([row]) as unknown as Parameters<
            typeof InvitationsCard
          >[0]["invites"]
        }
        canInvite={false}
        onInvite={() => {}}
        onResend={() => {}}
        onRevoke={() => {}}
        onLink={() => {}}
      />,
    );

    expect(screen.queryByRole("button", { name: /Copy link/ })).toBeNull();
  });
});
