import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The calibration audit shows nothing when nothing was moved, and otherwise one
 * heading-less list of the latest moves: no tiles, no group table.
 */

let moved = 0;

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/performance", () => ({
  useCycleFairness: () => ({
    available: true,
    loading: false,
    error: null,
    reload: vi.fn(),
    fairness: {
      calibration: {
        moved,
        up: 1,
        down: 0,
        byGroup: [],
        latest:
          moved === 0
            ? []
            : [
                {
                  id: "m1",
                  employeeName: "Ada Obi",
                  computedBp: 7000,
                  previousBp: 7000,
                  calibratedBp: 6200,
                  reason: "Agreed at the meeting",
                  actorName: "Chidi",
                  at: "2026-11-03T10:00:00Z",
                },
              ],
      },
    },
  }),
}));

const { CalibrationAudit } =
  await import("@/app/(app)/performance/periods/[id]/fairness/calibration-audit");

beforeEach(() => {
  moved = 0;
});

describe("the calibration audit", () => {
  it("renders nothing when no score was moved", () => {
    const { container } = render(<CalibrationAudit cycleId="c1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the moves with the date small under the name, and no tiles", () => {
    moved = 1;
    render(<CalibrationAudit cycleId="c1" />);
    expect(screen.getByText("Ada Obi")).toBeInTheDocument();
    expect(screen.getByText("Agreed at the meeting")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Scores moved")).toBeNull();
    expect(screen.queryByText("Moved up")).toBeNull();
    expect(screen.queryByText("Latest moves")).toBeNull();
  });
});
