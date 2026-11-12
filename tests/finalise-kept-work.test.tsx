import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import {
  FinaliseDialog,
  type KeptOutcome,
} from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * What the dialog says once a rating is final, about the work kept with it.
 *
 * What is proved: it says a record was kept, how many tasks and until when, in the company's own
 * zone, only when the API said one was; for a company that keeps none (every company until it
 * chooses a period) and for an older server that says nothing, it says nothing about a record, so
 * the confirmation never nags about a setting somebody has left alone.
 */

const review = {
  id: "r-1",
  cycleName: "H2 2026 Appraisal",
  subjectName: "Femi Balogun",
  rating: null,
  overallMark: false,
} as unknown as ApiReviewDetail;

const open = async (kept: KeptOutcome | null | undefined) => {
  render(
    <FinaliseDialog
      open
      review={review}
      onClose={() => {}}
      onConfirm={async () => ({
        subjectNotified: true,
        ...(kept === undefined ? {} : { kept }),
      })}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Make it final" }));
  await screen.findByText("It cannot be changed.");
};

afterEach(cleanup);

describe("when a record was kept", () => {
  it("says how many tasks were kept and until when", async () => {
    await open({
      items: 3,
      total: 3,
      truncated: false,
      retainUntil: "2027-11-01T09:00:00.000Z",
    });
    expect(
      screen.getByText(
        "A record of the 3 tasks Femi finished in this cycle is kept with it until 1 Nov 2027.",
      ),
    ).toBeInTheDocument();
  });

  it("reads the day in the company's zone, so a record kept late in the evening is not a day out", async () => {
    await open({
      items: 1,
      total: 1,
      truncated: false,
      retainUntil: "2027-10-31T23:30:00.000Z",
    });
    expect(
      screen.getByText(/is kept with it until 1 Nov 2027\./),
    ).toBeInTheDocument();
  });

  it("says an empty record is nothing recorded", async () => {
    await open({
      items: 0,
      total: 0,
      truncated: false,
      retainUntil: "2027-11-01T09:00:00.000Z",
    });
    expect(
      screen.getByText(
        "A record of the work behind it is kept until 1 Nov 2027: no finished tasks were recorded for Femi in this cycle.",
      ),
    ).toBeInTheDocument();
  });
});

describe("when nothing was kept, or the server did not say", () => {
  it("says nothing about a record when the API says none was kept", async () => {
    await open(null);
    expect(screen.queryByText(/A record of/)).not.toBeInTheDocument();
  });

  it("says nothing about a record when the server does not send the field at all", async () => {
    await open(undefined);
    expect(screen.queryByText(/A record of/)).not.toBeInTheDocument();
  });
});
