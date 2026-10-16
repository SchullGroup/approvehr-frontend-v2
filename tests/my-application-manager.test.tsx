import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MyApplication } from "@/lib/hiring/comms/model";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * A hiring manager's view of a candidate, through the same narrow door.
 *
 * A panelist sees their own scorecard and nobody's else; the person who hires for the
 * role sees every submitted one, with who wrote it, and the score they come to. What
 * is the same for both: a name, the role, the stage, the interviews and a CV, and no
 * contact details.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false, user: null }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/hiring/my-interviews/a1",
  useSearchParams: () => new URLSearchParams(),
}));

const application = vi.fn();
const openCv = vi.fn();
vi.mock("@/lib/hiring/pipeline/use-pipeline", () => ({
  usePipelineGateway: () => ({
    mode: "api",
    mine: {
      application: (...a: unknown[]) => application(...a),
      submitScorecard: vi.fn(),
      openCv: (...a: unknown[]) => openCv(...a),
    },
  }),
}));

const { MyApplicationScreen } =
  await import("@/app/(app)/hiring/my-interviews/[id]/my-application-screen");

const card = (id: string, by: string, composite: number) => ({
  id,
  by,
  recommendation: "YES",
  notes: `${by} liked the design discussion`,
  submitted: true,
  composite,
  ratings: [{ competency: "Technical", score: 4, weight: 1, comment: null }],
});

const managed: MyApplication = {
  id: "a1",
  candidateName: "Ada Okafor",
  role: "Operations Analyst",
  reference: "REQ-0004",
  stageName: "Interview",
  outcome: "IN_PROGRESS",
  roles: ["Hiring manager"],
  hasCv: true,
  interviews: [
    {
      id: "i1",
      kind: "Panel",
      scheduledFor: "2026-10-20T09:00:00.000Z",
      durationMins: 60,
      status: "COMPLETED",
      location: null,
      stageName: "Interview",
      iAmPanelist: false,
      panel: [
        { employeeId: "e1", name: "Chidi Nwosu", submitted: true },
        { employeeId: "e2", name: "Emeka Anyanwu", submitted: true },
      ],
      mine: null,
      everyones: [
        card("s1", "Chidi Nwosu", 4.33),
        card("s2", "Emeka Anyanwu", 4),
      ],
    },
  ],
  score: {
    outOf: 5,
    composite: 4.17,
    interviews: [],
    recommendations: { STRONG_YES: 0, YES: 2, NO: 0, STRONG_NO: 0 },
    byCompetency: [{ competency: "Technical", average: 4, ratings: 2 }],
    scorecardsSubmitted: 2,
  },
};

beforeEach(() => {
  application.mockReset();
  openCv.mockReset();
});

describe("the hiring manager's view", () => {
  it("shows every submitted scorecard with who wrote it, and the score they come to", async () => {
    application.mockResolvedValue(managed);
    renderInToasts(<MyApplicationScreen id="a1" />);
    expect(
      await screen.findByText("Everyone's scorecards"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Chidi Nwosu liked the design discussion"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Emeka Anyanwu liked the design discussion"),
    ).toBeInTheDocument();
    expect(screen.getByText("Interview score")).toBeInTheDocument();
    expect(screen.getByText("4.17")).toBeInTheDocument();
  });

  it("offers no scorecard to hand in when they are not on the panel, and no waiting banner", async () => {
    application.mockResolvedValue(managed);
    renderInToasts(<MyApplicationScreen id="a1" />);
    await screen.findByText("Everyone's scorecards");
    expect(
      screen.queryByRole("button", { name: "Hand in my scorecard" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/waiting for you/)).not.toBeInTheDocument();
  });

  it("opens the CV through the audited route for this application", async () => {
    application.mockResolvedValue(managed);
    renderInToasts(<MyApplicationScreen id="a1" />);
    await screen.findByText("Everyone's scorecards");
    expect(screen.getByRole("button", { name: "Open CV" })).toBeInTheDocument();
  });

  it("shows nothing but a name, the role and the stage of the person", async () => {
    application.mockResolvedValue(managed);
    renderInToasts(<MyApplicationScreen id="a1" />);
    await screen.findByText("Everyone's scorecards");
    const page = document.body.textContent ?? "";
    expect(page).toContain("Ada Okafor");
    expect(page).toContain("Operations Analyst (REQ-0004)");
    expect(page).not.toMatch(/@/);
    expect(page).not.toMatch(/\+234/);
    expect(
      within(document.body).queryByText(/salary/i),
    ).not.toBeInTheDocument();
  });
});
