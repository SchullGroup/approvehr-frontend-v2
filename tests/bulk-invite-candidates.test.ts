/**
 * U15 (HR-1, NC-2): the bulk "Invite staff" list filtered on `canLogin`, so a
 * person added with a work email (and so `canLogin: true`) but never invited
 * vanished from it: "Everybody already has a login" with three people never
 * invited. It now lists everyone the API says has no account.
 */
import { describe, expect, it } from "vitest";
import { inviteCandidatesFrom } from "@/components/portal/bulk-invite";
import type { ApiEmployee } from "@/lib/api/endpoints";

const row = (
  id: string,
  extra: Partial<ApiEmployee> & { access?: ApiEmployee["access"] },
): ApiEmployee =>
  ({
    id,
    firstName: id,
    lastName: "Okafor",
    jobTitle: "Clerk",
    email: `${id}@schull.io`,
    status: "ACTIVE",
    canLogin: true,
    ...extra,
  }) as ApiEmployee;

const access = (state: ApiEmployee["access"]["state"]) => ({
  state,
  expiresAt: null,
  roles: [],
});

describe("inviteCandidatesFrom", () => {
  it("lists a person with no account even when canLogin is true", () => {
    const list = inviteCandidatesFrom([
      row("adaeze", { canLogin: true, access: access("NONE") }),
    ]);
    expect(list.map((p) => p.employeeId)).toEqual(["adaeze"]);
  });

  it("leaves out people who have an account or an invitation", () => {
    const list = inviteCandidatesFrom([
      row("sent", { access: access("SENT") }),
      row("accepted", { access: access("ACCEPTED") }),
      row("disabled", { access: access("DISABLED") }),
    ]);
    expect(list).toEqual([]);
  });

  it("includes a starter still onboarding and leaves out a leaver", () => {
    const list = inviteCandidatesFrom([
      row("new", { status: "ONBOARDING", access: access("NONE") }),
      row("gone", { status: "EXITED", access: access("NONE") }),
    ]);
    expect(list.map((p) => p.employeeId)).toEqual(["new"]);
  });

  it("falls back to canLogin when the server sends no access", () => {
    const list = inviteCandidatesFrom([
      row("old-no", { canLogin: false }),
      row("old-yes", { canLogin: true }),
    ]);
    expect(list.map((p) => p.employeeId)).toEqual(["old-no"]);
  });
});
