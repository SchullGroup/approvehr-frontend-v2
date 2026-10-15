import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiApplicationDetail } from "@/lib/api/recruitment";

/**
 * Recording that a candidate accepted also creates their employee record, and the
 * API now asks for permission to edit people as well as to manage hiring.
 * Somebody holding only the second used to be offered a button whose one outcome
 * was a 403; they are now told why it is not there.
 */

let granted = new Set<string>();
vi.mock("@/lib/permissions", () => ({
  useCan: (permission: string) => granted.has(permission),
  usePermissions: () => ({
    can: (p: string) => granted.has(p),
    loading: false,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
  useOrgTimezone: () => "Africa/Lagos",
}));

const accept = vi.fn();
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      listStages: async () => [],
      acceptOffer: (...args: unknown[]) => accept(...args),
    },
  };
});

const { RealPipeline } =
  await import("@/app/(app)/hiring/candidates/[id]/real-pipeline");

const application = {
  id: "pa-1",
  requisitionId: "req-1",
  candidateId: "cand-1",
  candidateName: "Chioma Aduba",
  candidateEmail: "chioma@example.com",
  stageId: "s1",
  stageName: "Offer",
  outcome: "OFFER_MADE",
  requisitionReference: "REQ-1",
  requisitionJobTitle: "Payroll Analyst",
  candidate: { id: "cand-1" },
  interviews: [],
  history: [],
  offer: {
    id: "offer-1",
    applicationId: "pa-1",
    grossMonthlyKobo: 50_000_000,
    startDate: "2026-11-01",
    status: "SENT",
    outsideBand: false,
    approvedById: "u1",
    approvedAt: "2026-10-10T09:00:00.000Z",
    sentAt: "2026-10-11T09:00:00.000Z",
    respondedAt: null,
    employeeId: null,
  },
} as unknown as ApiApplicationDetail;

const open = () =>
  render(<RealPipeline application={application} onChanged={() => {}} />);

beforeEach(() => {
  accept.mockReset();
  granted = new Set();
});

describe("recording that an offer was accepted", () => {
  it("is offered to somebody who may manage hiring and edit people", async () => {
    granted = new Set(["MANAGE_HIRING", "EDIT_RECORDS"]);
    accept.mockResolvedValue({
      rejectedOthers: 0,
      requisitionFilled: false,
      hiresSoFar: 1,
      headcount: 3,
    });
    const onChanged = vi.fn();
    const user = userEvent.setup();
    render(<RealPipeline application={application} onChanged={onChanged} />);

    await user.click(screen.getByRole("button", { name: "Record accepted" }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith("offer-1"));
    /* A role with room for more is not filled by the first, and the banner says
       which hire this was instead of leaving "Accepted" to read as "done". */
    expect(
      await screen.findByText(
        /That is hire 1 of 3 for this role, so it is still open/,
      ),
    ).toBeInTheDocument();
  });

  it("is replaced by the reason for somebody who may manage hiring but not edit people", () => {
    granted = new Set(["MANAGE_HIRING"]);
    open();

    expect(
      screen.queryByRole("button", { name: "Record accepted" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/also creates their employee record/),
    ).toBeInTheDocument();
    /* Declining creates nobody, so it is still theirs to press. */
    expect(
      screen.getByRole("button", { name: "Record declined" }),
    ).toBeInTheDocument();
  });

  it("is not offered to an approver who cannot manage hiring", () => {
    granted = new Set(["APPROVE_HIRING", "EDIT_RECORDS"]);
    open();
    expect(
      screen.queryByRole("button", { name: "Record accepted" }),
    ).not.toBeInTheDocument();
  });

  it("says the role is filled, and who was rejected, when the last hire closes it", async () => {
    granted = new Set(["MANAGE_HIRING", "EDIT_RECORDS"]);
    accept.mockResolvedValue({
      rejectedOthers: 4,
      requisitionFilled: true,
      hiresSoFar: 3,
      headcount: 3,
    });
    const user = userEvent.setup();
    open();

    await user.click(screen.getByRole("button", { name: "Record accepted" }));
    expect(
      await screen.findByText(
        /4 other candidates still in this pipeline were automatically rejected/,
      ),
    ).toBeInTheDocument();
  });
});
