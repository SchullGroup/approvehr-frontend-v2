import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actorOf,
  describeEvent,
  type ApiHistoryEvent,
} from "@/lib/api/application-history";
import type { ApiApplicationDetail } from "@/lib/api/recruitment";

/**
 * The record of what happened to an application, and the CV on the pipeline side
 * of a candidate's page.
 *
 * The history arrives with the application's own detail, so there is nothing to
 * load: what these pin is the sentence each kind of event becomes, who it names
 * when nobody pressed anything, and that an application with no history says so
 * honestly instead of looking broken.
 */

vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

let allowed = true;
vi.mock("@/lib/permissions", () => ({
  useCan: () => allowed,
  usePermissions: () => ({ can: () => allowed, loading: false }),
}));

const openCandidateCv = vi.fn();
vi.mock("@/lib/api/recruitment", async (original) => {
  const real = await original<typeof import("@/lib/api/recruitment")>();
  return {
    ...real,
    recruitmentApi: {
      ...real.recruitmentApi,
      openCandidateCv: (...a: unknown[]) => openCandidateCv(...a),
    },
  };
});

const { StageHistory } = await import("@/components/hiring/stage-history");
const { RealScreening } =
  await import("@/app/(app)/hiring/candidates/[id]/real-pipeline");

const event = (over: Partial<ApiHistoryEvent> = {}): ApiHistoryEvent => ({
  id: "e1",
  kind: "STAGE_MOVED",
  fromStage: "Screening",
  toStage: "Interview",
  fromStatus: "IN_PROGRESS",
  toStatus: "IN_PROGRESS",
  byUserId: "u1",
  by: "Fatima Bello",
  note: null,
  at: "2026-10-14T08:12:00.000Z",
  ...over,
});

describe("one event, in words", () => {
  it("says a stage move from where to where", () => {
    expect(describeEvent(event())).toMatchObject({
      title: "Moved from Screening to Interview",
      actor: "Fatima Bello",
      tone: "accent",
    });
  });

  it("says where somebody was placed when they were screened in", () => {
    expect(
      describeEvent(
        event({ kind: "SCREENED_IN", fromStage: null, toStage: "Screening" }),
      ),
    ).toMatchObject({
      title: "Screened in",
      detail: "Placed in Screening",
      tone: "success",
    });
  });

  it("keeps the reason a person was turned down, and says whose it is", () => {
    expect(
      describeEvent(
        event({
          kind: "DECLINED",
          fromStage: null,
          toStage: null,
          note: "Wants twice the band.",
        }),
      ),
    ).toMatchObject({
      title: "Turned down at screening",
      detail: "Reason kept on file: Wants twice the band.",
      tone: "danger",
    });
  });

  it.each([
    ["REJECTED", "Rejected in Screening"],
    ["AUTO_REJECTED", "Rejected in Screening, automatically"],
    ["WITHDRAWN", "Withdrew from the process"],
    ["OFFER_SENT", "Offer sent"],
    ["OFFER_DECLINED", "Declined the offer"],
    ["OFFER_WITHDRAWN", "Offer withdrawn"],
    ["HIRED", "Hired"],
  ])("names %s", (kind, title) => {
    expect(describeEvent(event({ kind })).title).toBe(title);
  });

  it("does not stumble on a kind this build has never heard of", () => {
    expect(
      describeEvent(
        event({ kind: "TALENT_POOLED", fromStage: null, toStage: "Pool" }),
      ),
    ).toMatchObject({ title: "Talent pooled", detail: "Into Pool" });
  });

  it("tells a named person, a removed account and the system apart, never a blank", () => {
    expect(actorOf(event())).toBe("Fatima Bello");
    expect(actorOf(event({ by: null, byUserId: "gone" }))).toBe(
      "An account that has since been removed",
    );
    expect(actorOf(event({ by: null, byUserId: null }))).toBe(
      "ApproveHR, automatically",
    );
  });
});

describe("the history card", () => {
  it("lists every move, oldest first, with who made it and when in the company's own time", () => {
    render(
      <StageHistory
        events={[
          event({
            id: "e1",
            kind: "SCREENED_IN",
            fromStage: null,
            toStage: "Screening",
            at: "2026-10-12T08:00:00.000Z",
          }),
          event({ id: "e2", at: "2026-10-14T08:12:00.000Z" }),
          event({
            id: "e3",
            kind: "AUTO_REJECTED",
            by: null,
            byUserId: null,
            fromStage: "Interview",
            toStage: null,
            note: "Role filled by Ada Obi.",
            at: "2026-10-15T09:30:00.000Z",
          }),
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Screened in");
    expect(items[1]).toHaveTextContent("Moved from Screening to Interview");
    expect(items[1]).toHaveTextContent("by Fatima Bello");
    /* 08:12 UTC is 09:12 in Lagos. */
    expect(items[1]).toHaveTextContent("14 Oct 2026, 09:12");
    expect(items[2]).toHaveTextContent("Rejected in Interview, automatically");
    expect(items[2]).toHaveTextContent("by ApproveHR, automatically");
    expect(items[2]).toHaveTextContent("Role filled by Ada Obi.");
  });

  it("says moves before history began are not listed, rather than 'nothing happened'", () => {
    render(<StageHistory events={[]} />);
    expect(screen.getByText(/No moves recorded/)).toBeInTheDocument();
    expect(
      screen.getByText(/moves made before then are not listed/),
    ).toBeInTheDocument();
  });

  it("draws nothing at all for an API that sent no history, because it claims nothing", () => {
    const { container } = render(<StageHistory events={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/* ------------------------------------------------- the CV on the pipeline side */

const application = (cvStorageKey: string | null): ApiApplicationDetail =>
  ({
    id: "pa-1",
    requisitionId: "req-1",
    candidateId: "cand-1",
    candidateName: "Chioma Aduba",
    candidateEmail: "chioma@example.com",
    stageId: "s1",
    stageName: "Screening",
    outcome: "IN_PROGRESS",
    requisitionReference: "REQ-1",
    requisitionJobTitle: "Payroll Analyst",
    candidate: {
      id: "cand-1",
      firstName: "Chioma",
      lastName: "Aduba",
      name: "Chioma Aduba",
      email: "chioma@example.com",
      phone: null,
      cvStorageKey,
      source: "LinkedIn",
      noticeDays: null,
      currentSalaryKobo: null,
      expectedSalaryKobo: null,
      rightToWork: null,
    },
    interviews: [],
    offer: null,
    history: [],
  }) as unknown as ApiApplicationDetail;

describe("the CV a screener attached", () => {
  beforeEach(() => {
    allowed = true;
    openCandidateCv.mockReset();
  });

  it("no longer says it is a storage key that cannot be downloaded, and opens through the API instead", async () => {
    openCandidateCv.mockResolvedValue({
      url: "https://files.example/cv.pdf?sig=2",
      note: null,
    });
    const tab = { opener: {}, location: { href: "" }, close: vi.fn() };
    vi.stubGlobal(
      "open",
      vi.fn(() => tab),
    );
    const user = userEvent.setup();
    render(
      <RealScreening application={application("k/cv")} onChanged={() => {}} />,
    );

    expect(screen.queryByText(/storage key/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/cannot be downloaded/i)).not.toBeInTheDocument();
    expect(
      screen.getByText("A CV was attached on screening."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Open CV" }));
    await waitFor(() =>
      expect(tab.location.href).toBe("https://files.example/cv.pdf?sig=2"),
    );
    expect(openCandidateCv).toHaveBeenCalledWith("cand-1");
    vi.unstubAllGlobals();
  });

  it("offers nothing to somebody who may not read it, and says whose it is to open", () => {
    allowed = false;
    render(
      <RealScreening application={application("k/cv")} onChanged={() => {}} />,
    );

    expect(
      screen.queryByRole("button", { name: "Open CV" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/kept to whoever hires or approves hiring/),
    ).toBeInTheDocument();
  });

  it("says nothing about a CV when none was attached", () => {
    render(
      <RealScreening application={application(null)} onChanged={() => {}} />,
    );
    expect(screen.queryByText(/A CV was attached/)).not.toBeInTheDocument();
    expect(
      within(document.body).queryByRole("button", { name: "Open CV" }),
    ).not.toBeInTheDocument();
    /* The source line, which does not depend on a file, is still there. */
    expect(screen.getByText("LinkedIn")).toBeInTheDocument();
  });
});
