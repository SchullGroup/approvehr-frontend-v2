import { describe, expect, it } from "vitest";
import { inviteWarningFrom } from "@/app/(app)/people/new/form";
import type { ApiCreateInviteOutcome } from "@/lib/api/endpoints";

/**
 * "Added!" and "nobody was actually invited" used to be one screen.
 *
 * `POST /employees` attempts an invitation whenever the add-employee form
 * asked for one, and reports exactly what happened — `sent`, `noEmail`,
 * `alreadyHadLogin`, `failed`, `skippedEntirely`. The wizard kept only the
 * created record: `useEmployeeMutations().create()` narrowed the response
 * through `toEmployee`, and `createOnApi()` extracted only the id. A caller
 * without `INVITE_STAFF`, an address already registered elsewhere, a "role"
 * the importer could not grant, a mail provider having a bad afternoon — all
 * four were structurally invisible on the one screen HR was looking at when
 * they happened.
 *
 * `inviteWarningFrom` is the fix's whole logic, pulled out of the component so
 * it can be asserted without mounting the wizard's four steps, its session
 * hook, its permission checks and its draft-recovery machinery.
 */

const base: ApiCreateInviteOutcome = {
  sent: 0,
  noEmail: 0,
  alreadyHadLogin: 0,
  failed: [],
};

describe("inviteWarningFrom", () => {
  it("says nothing when nobody asked to invite anybody", () => {
    expect(inviteWarningFrom(undefined)).toBeNull();
  });

  it("says nothing when the invitation actually went out", () => {
    expect(inviteWarningFrom({ ...base, sent: 1 })).toBeNull();
  });

  it("shows the server's own sentence when the account could add people but not invite them", () => {
    const skippedEntirely =
      "Nobody was emailed an invitation: this account can add people but " +
      "cannot give them a login.";
    expect(inviteWarningFrom({ ...base, skippedEntirely })).toBe(
      skippedEntirely,
    );
  });

  it("names an address already registered elsewhere, in words a reader can act on", () => {
    const warning = inviteWarningFrom({ ...base, alreadyHadLogin: 1 });
    expect(warning).toContain("already has an ApproveHR account");
    expect(warning).toContain("fix the address");
  });

  it("shows the failure reason the server gave, not a generic refusal", () => {
    const warning = inviteWarningFrom({
      ...base,
      failed: [
        {
          name: "Grace Effiong",
          reason: "That role carries a permission you do not hold.",
        },
      ],
    });
    expect(warning).toBe(
      "They were not invited: That role carries a permission you do not hold.",
    );
  });

  it("still says something when a failure carries no reason at all", () => {
    /* Defensive: nothing in the API today produces `failed` with no reason,
       but a caller reading this value must never render `undefined` on
       screen just because a future change to the server forgot to set one. */
    const warning = inviteWarningFrom({
      ...base,
      failed: [{ name: "Someone", reason: "" }],
    });
    expect(warning).toBeTruthy();
    expect(warning).not.toContain("undefined");
  });

  /**
   * The case this fix exists for, named explicitly: `sent === 0` with every
   * other field at its zero value. This is what a bare `{ sent: 0 }` from a
   * server that added the fact but not yet a reason would look like, and the
   * function must not return `null` for it just because nothing else fired —
   * `null` means "nothing to say", and this is a create that asked to invite
   * somebody and did not.
   */
  it("still warns when sent is zero and no other field explains why", () => {
    expect(inviteWarningFrom(base)).not.toBeNull();
  });
});
