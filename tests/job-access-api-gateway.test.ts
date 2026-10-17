import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";
import type { ApiAccessPerson, ApiAccessView } from "@/lib/api/job-access";
import type { PendingInvite } from "@/lib/hiring/access/model";

/**
 * The access panel's gateway to the API: one read of everybody who can reach a job,
 * turned into the three things the panel draws, and every change said in the API's
 * own words about whether an email really left.
 */

const api = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  grant: vi.fn(),
  changeRole: vi.fn(),
  revoke: vi.fn(),
  resend: vi.fn(),
}));
const audit = vi.hoisted(() => ({ timeline: vi.fn() }));
const staff = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/api/job-access", () => ({ jobAccessApi: api }));
vi.mock("@/lib/api/audit", () => ({ auditApi: audit }));
vi.mock("@/lib/api/endpoints", () => ({ employees: staff }));

const { apiAccessGateway, accessFrom } =
  await import("@/lib/hiring/access/api-gateway");

const signal = () => new AbortController().signal;

const person = (over: Partial<ApiAccessPerson>): ApiAccessPerson => ({
  id: "g1",
  userId: "u1",
  employeeId: null,
  name: "Folasade Ige",
  email: "folasade@example.com",
  role: "PANELIST",
  via: ["ACCESS_LIST"],
  status: "ACTIVE",
  addedAt: "2026-10-01T09:00:00.000Z",
  addedBy: "Fatima Bello",
  canSeeScores: false,
  seats: { stages: [], interviews: 0 },
  ...over,
});

const view = (
  people: ApiAccessPerson[],
  over: Partial<ApiAccessView> = {},
): ApiAccessView => ({
  requisitionId: "r1",
  reference: "REQ-0001",
  jobTitle: "Analyst",
  restricted: false,
  panelistsSeeScores: false,
  hiringManager: null,
  people,
  companyWide: {
    holders: 3,
    opensThisJob: true,
    note: "Everybody with company-wide hiring permission can open this job.",
  },
  overrideHolders: [],
  ...over,
});

beforeEach(() => {
  for (const fn of [
    ...Object.values(api),
    ...Object.values(audit),
    ...Object.values(staff),
  ])
    fn.mockReset();
});

describe("reading who can reach a job", () => {
  it("makes the list's signed-in people members, and the invited ones the invitations: each once", () => {
    const access = accessFrom(
      view([
        person({ id: "g1", userId: "u1" }),
        person({
          id: "g2",
          userId: "u2",
          name: "Kunle Adebayo",
          email: "kunle@example.com",
          status: "INVITED",
        }),
        person({
          id: "g3",
          userId: "u3",
          name: "Ada Okafor",
          email: "ada@example.com",
          status: "INVITATION_EXPIRED",
        }),
      ]),
    );
    expect(access.members.map((m) => m.name)).toEqual(["Folasade Ige"]);
    expect(access.pending.map((p) => [p.name, p.expired])).toEqual([
      ["Kunle Adebayo", false],
      ["Ada Okafor", true],
    ]);
    /* The invitation's id is what resending and cancelling name. */
    expect(access.pending[0]?.id).toBe("g2");
  });

  it("says an invited account is not staff and a member of staff is", () => {
    const access = accessFrom(
      view([
        person({ id: "g1", userId: "u1", employeeId: null }),
        person({
          id: "g2",
          userId: "u2",
          employeeId: "e2",
          name: "Chidi Nwosu",
        }),
      ]),
    );
    expect(access.members.map((m) => [m.name, m.kind])).toEqual([
      ["Folasade Ige", "ACCOUNT"],
      ["Chidi Nwosu", "STAFF"],
    ]);
    expect(access.members[0]).toMatchObject({ userId: "u1", employeeId: null });
  });

  it("carries where each person sits, so taking them off can say what else goes", () => {
    const access = accessFrom(
      view([
        person({
          id: "g1",
          seats: { stages: ["Interview"], interviews: 2 },
        }),
      ]),
    );
    expect(access.members[0]?.seats).toEqual({
      stages: ["Interview"],
      interviews: 2,
    });
  });

  it("lists everybody who reaches the job some other way, apart and in words", () => {
    const access = accessFrom(
      view([
        person({ id: "g1" }),
        person({
          id: null,
          userId: null,
          employeeId: "e9",
          name: "Emeka Anyanwu",
          role: null,
          via: ["HIRING_MANAGER", "STAGE_PANEL"],
          status: "NO_SIGN_IN",
          canSeeScores: true,
        }),
      ]),
    );
    expect(access.members).toHaveLength(1);
    expect(access.alsoReach).toEqual([
      {
        name: "Emeka Anyanwu",
        via: ["Hiring manager on the role", "On a stage's panel"],
        canSeeScores: true,
      },
    ]);
  });

  it("carries the API's sentence about who can open a restricted job, and who sees scores", () => {
    const access = accessFrom(
      view([], {
        restricted: true,
        panelistsSeeScores: true,
        companyWide: {
          holders: 3,
          opensThisJob: false,
          note: "This job is restricted: people with company-wide hiring permission cannot open it unless they are on this list.",
        },
      }),
    );
    expect(access.restricted).toBe(true);
    expect(access.restrictedNote).toMatch(
      /cannot open it unless they are on this list/,
    );
    expect(access.scoreVisibility).toBe("ALSO_PANELISTS");
    expect(
      accessFrom(
        view([], {
          overrideHolders: [{ userId: "u9", name: "Amara Nwachukwu" }],
        }),
      ).alwaysOpen,
    ).toEqual(["Amara Nwachukwu"]);
    expect(accessFrom(view([])).scoreVisibility).toBe("HIRING_TEAM");
  });
});

describe("changing how a job is set", () => {
  it("restricts it, and says when the person who did it was put on the list", async () => {
    api.update.mockResolvedValue({
      ...view([person({ id: "g1" })], { restricted: true }),
      changed: ["restricted"],
      addedYou: true,
    });
    const access = await apiAccessGateway.setRestricted("r1", true);
    expect(api.update).toHaveBeenCalledWith("r1", { restricted: true });
    expect(access.restricted).toBe(true);
    expect(access.addedYou).toBe(true);
  });

  it("does not claim they were added when they were not", async () => {
    api.update.mockResolvedValue({
      ...view([]),
      changed: ["restricted"],
      addedYou: false,
    });
    const access = await apiAccessGateway.setRestricted("r1", false);
    expect("addedYou" in access).toBe(false);
  });

  it("sends who sees scores as the one flag the API has", async () => {
    api.update.mockResolvedValue({
      ...view([], { panelistsSeeScores: true }),
      changed: ["panelistsSeeScores"],
      addedYou: false,
    });
    await apiAccessGateway.setScoreVisibility("r1", "ALSO_PANELISTS");
    expect(api.update).toHaveBeenLastCalledWith("r1", {
      panelistsSeeScores: true,
    });
    await apiAccessGateway.setScoreVisibility("r1", "HIRING_TEAM");
    expect(api.update).toHaveBeenLastCalledWith("r1", {
      panelistsSeeScores: false,
    });
  });
});

describe("inviting", () => {
  const email = {
    kind: "EMAIL" as const,
    firstName: "Kunle",
    lastName: "Adebayo",
    email: "kunle@example.com",
    role: "PANELIST" as const,
  };

  it("sends the name, the address and the role, and says an invitation went when the API says so", async () => {
    api.grant.mockResolvedValue({
      accessId: "g2",
      person: person({
        id: "g2",
        userId: "u2",
        name: "Kunle Adebayo",
        email: "kunle@example.com",
        status: "INVITED",
      }),
      invitation: { issued: true, delivered: true, delivery: null },
    });
    const result = await apiAccessGateway.invites.invite("r1", email);
    expect(api.grant).toHaveBeenCalledWith("r1", {
      role: "PANELIST",
      email: "kunle@example.com",
      firstName: "Kunle",
      lastName: "Adebayo",
    });
    expect(result.invite?.id).toBe("g2");
    expect(result.member).toBeNull();
    expect(result.said).toBe(
      "An invitation was sent to kunle@example.com. Until they accept it, they can see nothing.",
    );
    expect(result.emailLeft).toBe(true);
  });

  it("says no email was sent, with the API's reason, when the provider did not take it", async () => {
    api.grant.mockResolvedValue({
      accessId: "g2",
      person: person({
        id: "g2",
        userId: "u2",
        name: "Kunle Adebayo",
        email: "kunle@example.com",
        status: "INVITED",
      }),
      invitation: {
        issued: true,
        delivered: false,
        delivery: {
          delivered: false,
          note: "This server cannot send email yet.",
        },
      },
    });
    const result = await apiAccessGateway.invites.invite("r1", email);
    expect(result.said).toBe(
      "No email was sent to kunle@example.com. This server cannot send email yet.",
    );
    expect(result.said).not.toMatch(/^An invitation was sent/);
    expect(result.emailLeft).toBe(false);
  });

  it("gives a member of staff who can sign in access at once, and says no email was needed", async () => {
    api.grant.mockResolvedValue({
      accessId: "g3",
      person: person({
        id: "g3",
        userId: "u3",
        employeeId: "e3",
        name: "Chidi Nwosu",
        role: "RECRUITER",
      }),
      invitation: null,
    });
    const result = await apiAccessGateway.invites.invite("r1", {
      kind: "STAFF",
      employeeId: "e3",
      role: "RECRUITER",
    });
    expect(api.grant).toHaveBeenCalledWith("r1", {
      role: "RECRUITER",
      employeeId: "e3",
    });
    expect(result.member?.name).toBe("Chidi Nwosu");
    expect(result.invite).toBeNull();
    expect(result.said).toBe(
      "Chidi Nwosu has access as recruiter now. No email was sent: they can already sign in.",
    );
    expect(result.emailLeft).toBeNull();
  });

  it("leaves a refusal as the ApiError the API threw, with its field", async () => {
    const refusal = new ApiError(
      400,
      "validation_failed",
      "Enter a valid email address.",
      [{ field: "email", message: "Enter a valid email address." }],
    );
    api.grant.mockRejectedValue(refusal);
    await expect(apiAccessGateway.invites.invite("r1", email)).rejects.toBe(
      refusal,
    );
  });

  const waiting: PendingInvite = {
    id: "g2",
    name: "Kunle Adebayo",
    email: "kunle@example.com",
    role: "PANELIST",
    invitedAt: "2026-10-01T09:00:00.000Z",
    expiresAt: null,
    expired: false,
    invitedBy: null,
  };

  it("sends an invitation again, saying the earlier link no longer works only when it was sent", async () => {
    api.resend.mockResolvedValue({
      issued: true,
      delivered: true,
      delivery: null,
    });
    const sent = await apiAccessGateway.invites.resend("r1", waiting);
    expect(api.resend).toHaveBeenCalledWith("r1", "g2");
    expect(sent.delivered).toBe(true);
    expect(sent.said).toMatch(/earlier link no longer works/);

    api.resend.mockResolvedValue({
      issued: true,
      delivered: false,
      delivery: { delivered: false, note: "The provider refused it." },
    });
    const refused = await apiAccessGateway.invites.resend("r1", waiting);
    expect(refused.delivered).toBe(false);
    expect(refused.said).toBe(
      "No email was sent to kunle@example.com. The provider refused it.",
    );
  });

  it("cancels an invitation by taking the row off the job", async () => {
    api.revoke.mockResolvedValue({ revoked: true, closedInvitation: true });
    await apiAccessGateway.invites.cancel("r1", waiting);
    expect(api.revoke).toHaveBeenCalledWith("r1", "g2");
  });

  it("offers a staff list only where there is staff to choose from", async () => {
    staff.list.mockResolvedValue({ data: [], meta: { total: 0 } });
    expect(
      (await apiAccessGateway.invites.options(signal())).staffAvailable,
    ).toBe(false);
    staff.list.mockResolvedValue({ data: [{}], meta: { total: 12 } });
    expect(
      (await apiAccessGateway.invites.options(signal())).staffAvailable,
    ).toBe(true);
    /* A company without Core HR may refuse the staff list outright. */
    staff.list.mockRejectedValue(new ApiError(404, "not_found", "No."));
    expect(
      (await apiAccessGateway.invites.options(signal())).staffAvailable,
    ).toBe(false);
  });

  it("says all three roles, whoever the company has", async () => {
    staff.list.mockResolvedValue({ data: [], meta: { total: 0 } });
    const options = await apiAccessGateway.invites.options(signal());
    expect(options.roles.map((r) => r.role)).toEqual([
      "HIRING_MANAGER",
      "RECRUITER",
      "PANELIST",
    ]);
  });
});

describe("taking somebody off", () => {
  it("names the list row", async () => {
    api.revoke.mockResolvedValue({ revoked: true, closedInvitation: false });
    const access = accessFrom(view([person({ id: "g1" })]));
    await apiAccessGateway.revoke("r1", access.members[0]!);
    expect(api.revoke).toHaveBeenCalledWith("r1", "g1");
  });
});

describe("the trail", () => {
  const entry = (id: string, action: string, label: string) => ({
    id,
    action,
    actionLabel: label,
    at: "2026-10-02T09:00:00.000Z",
    actor: { id: "u9", name: "Fatima Bello", isSystem: false },
  });

  it("keeps only the changes to who can see the job, newest first as the API sends them", async () => {
    audit.timeline.mockResolvedValue({
      data: [
        entry("a1", "job_access.granted", "Job access granted"),
        entry("a2", "requisition.updated", "Requisition updated"),
        entry("a3", "job_access.restricted", "Job access restricted"),
      ],
    });
    const trail = await apiAccessGateway.events("r1", signal());
    expect(audit.timeline).toHaveBeenCalledWith(
      "requisitions",
      "r1",
      { pageSize: 100 },
      expect.anything(),
    );
    expect(trail?.map((e) => [e.id, e.text, e.by])).toEqual([
      ["a1", "Job access granted", "Fatima Bello"],
      ["a3", "Job access restricted", "Fatima Bello"],
    ]);
  });

  it("is absent for somebody who may not read the audit trail, not an error", async () => {
    audit.timeline.mockRejectedValue(new ApiError(403, "forbidden", "No."));
    expect(await apiAccessGateway.events("r1", signal())).toBeNull();
  });

  it("lets any other failure be one", async () => {
    audit.timeline.mockRejectedValue(new ApiError(500, "boom", "Broke."));
    await expect(apiAccessGateway.events("r1", signal())).rejects.toThrow(
      "Broke.",
    );
  });
});
