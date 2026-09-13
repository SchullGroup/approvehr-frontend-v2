import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiAction } from "@/lib/api/conduct";

/**
 * `acknowledgedAt` is a full instant (`"2026-07-23T16:30:00.000Z"`), not a
 * date-only value — unlike `incidentOn`, which is a calendar fact. The row
 * used to do `action.acknowledgedAt.slice(0, 10)` before handing it to
 * `dayLabel`, which extracts the *UTC* calendar day and formats it with UTC
 * getters — so for a company east of UTC, the "confirmed" date could name a
 * day earlier than the instant actually fell on locally.
 *
 * This machine defaults to `Africa/Lagos` (UTC+1), where that slice is
 * rarely wrong enough to notice. Pacific/Auckland (UTC+13) is not: the
 * instant below is 16:30 UTC on the 23rd, which is already 05:30 on the
 * 24th in Auckland. A test that only checked the default zone would pass
 * against the old, UTC-slicing code just as easily as the fixed one.
 */
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Pacific/Auckland",
}));

const { ActionRow } = await import("@/app/(app)/people/[id]/conduct");

const BASE_ACTION: ApiAction = {
  id: "act-1",
  employeeId: "emp-1",
  employeeName: "Amara Nwachukwu",
  employeeNo: "EMP-1",
  level: "WRITTEN",
  levelLabel: "Written warning",
  incidentOn: "2026-07-24",
  summary: "Late three times this week.",
  detail: null,
  outcome: null,
  issuedById: "emp-2",
  issuedByName: "Chidi Okafor",
  issuedAt: "2026-07-24T09:00:00.000Z",
  expiresOn: null,
  neverLapses: true,
  active: true,
  acknowledgedAt: "2026-07-23T16:30:00.000Z",
  disputedAt: null,
  disputeNote: null,
  awaitingConfirmation: false,
  createdAt: "2026-07-24T09:00:00.000Z",
  updatedAt: "2026-07-24T09:00:00.000Z",
};

describe("ActionRow's acknowledgement date", () => {
  it("reads the same day as the incident it sits beside, in the company's zone", () => {
    /* The incident happened, and was acknowledged, on the same calendar day
       in Auckland (24 July) — even though the acknowledgement instant's UTC
       calendar day is the 23rd. A panel that names the incident "24 Jul" and
       the acknowledgement "23 Jul" is disagreeing with itself about one
       day, which is worse than being wrong about both consistently. */
    render(
      <ActionRow
        action={BASE_ACTION}
        canEdit={false}
        isSubject={false}
        onConfirm={() => {}}
        onEdit={() => {}}
      />,
    );

    expect(screen.getByText("24 Jul 2026")).toBeInTheDocument();
    expect(screen.getByText(/confirmed 24 Jul 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/23 Jul 2026/)).not.toBeInTheDocument();
  });
});
