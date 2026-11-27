import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiFlagResolution, ApiReviewFlag } from "@/lib/api/performance";

/**
 * After "Change the score" the Decision line said only that the score changed
 * (F40, 25 Nov walkthrough), so 58% to 52% read as nothing having moved. The
 * API now sends both figures with the move; the line says them, and a server
 * from before them says only that it moved.
 */

vi.mock("@/lib/permissions", () => ({ useCan: () => true }));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/store/performance", () => ({
  useCycleMutations: () => ({}),
  useFlagDecisions: () => ({ reopen: vi.fn() }),
}));
vi.mock("@/components/performance/calibrate-dialog", () => ({
  CalibrateDialog: () => null,
}));
vi.mock("@/components/ui", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui")>()),
  useToast: () => ({ push: vi.fn() }),
}));

const { FlagActions } =
  await import("@/app/(app)/performance/periods/[id]/fairness/flag-actions");

afterEach(() => cleanup());

const show = (resolution: ApiFlagResolution) =>
  render(
    <FlagActions
      cycleId="c1"
      stage="CALIBRATION"
      onChanged={() => undefined}
      person={
        {
          employeeId: "e1",
          firstName: "Chidi",
          markBp: 5822,
          resolution,
          managerReviewSubmitted: true,
        } as unknown as ApiReviewFlag
      }
    />,
  );

const moved = (extra: object = {}): ApiFlagResolution =>
  ({
    state: "moved",
    by: "Amara Nwachukwu",
    at: "2026-11-25T10:00:00.000Z",
    reason: "Both appraisers agreed it was too high.",
    ...extra,
  }) as ApiFlagResolution;

describe("a score that was changed says from what to what", () => {
  it("names both figures", () => {
    show(moved({ originalBp: 5822, calibratedBp: 5200 }));
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          /^Score changed from 58\.22% to 52% by Amara Nwachukwu on /.test(
            element.textContent ?? "",
          ),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Both appraisers agreed it was too high."),
    ).toBeInTheDocument();
  });

  it("says only that it changed where the server did not send the figures", () => {
    show(moved());
    expect(screen.getByText(/Score changed/)).toBeInTheDocument();
    expect(screen.queryByText(/from \d/)).toBeNull();
  });

  it("does not invent a figure from half an answer", () => {
    show(moved({ calibratedBp: 5200 }));
    expect(screen.queryByText(/from \d/)).toBeNull();
    expect(screen.queryByText(/52%/)).toBeNull();
  });

  it("reads a move to nought as a figure, not as a missing one", () => {
    show(moved({ originalBp: 5822, calibratedBp: 0 }));
    expect(screen.getByText(/from 58\.22% to 0%/)).toBeInTheDocument();
  });
});
