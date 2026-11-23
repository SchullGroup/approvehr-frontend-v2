import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiScoreRow } from "@/lib/api/performance";

/**
 * UAT 23 Nov, L13 (PERF-38): each row of a period's Marks table carried three
 * buttons (Ask colleagues, Change the mark, Send back) in three columns and ran
 * to three lines. They are one ⋯ menu per row now.
 */

vi.mock("@/lib/store/performance", async (original) => ({
  ...(await original<typeof import("@/lib/store/performance")>()),
  useCycleMutations: () => ({ requestRevision: vi.fn() }),
}));
vi.mock("@/app/(app)/performance/periods/[id]/ask-peers", () => ({
  AskPeersButton: () => <button type="button">Ask colleagues</button>,
  AskPeersDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Ask colleagues dialog</div> : null,
}));
vi.mock("@/components/performance/calibrate-dialog", () => ({
  CalibrateDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Calibrate dialog</div> : null,
}));

const { RegisterRow } =
  await import("@/app/(app)/performance/periods/[id]/period-screen");

const row = {
  employeeId: "e1",
  employeeName: "Chidi Nwosu",
  jobTitle: "Analyst",
  departmentName: "Finance",
  objectives: { agreed: 3, awaitingApproval: 0 },
  scoreBp: 7200,
  computedBp: 7200,
  components: [],
  calibration: null,
  signOff: {
    submitted: false,
    finalised: false,
    acknowledged: false,
    disputed: false,
    reviewId: null,
  },
} as unknown as ApiScoreRow;

function renderRow() {
  return render(
    <table>
      <tbody>
        <RegisterRow
          row={row}
          cycleId="c1"
          canAskPeers
          canCalibrate
          canRequestRevision
          existingRevision={undefined}
          onAsked={() => {}}
        />
      </tbody>
    </table>,
  );
}

describe("a row of the Marks table", () => {
  it("has one menu, not three buttons", () => {
    renderRow();
    expect(screen.queryByRole("button", { name: "Ask colleagues" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Change the mark" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Send back" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "More for Chidi Nwosu" }),
    ).toBeInTheDocument();
  });

  it("lists the three acts in the menu, and each opens its dialog", () => {
    renderRow();
    act(() =>
      screen.getByRole("button", { name: "More for Chidi Nwosu" }).click(),
    );
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Ask colleagues"),
        expect.stringContaining("Change the mark"),
        expect.stringContaining("Send back"),
      ]),
    );
    act(() =>
      screen
        .getAllByRole("menuitem")
        .find((item) => item.textContent?.includes("Change the mark"))!
        .click(),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Calibrate dialog");
  });
});
