import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/client";

/**
 * With no objectives, the page says what they are worth in the score, starts
 * with the company's, and offers to ask everyone once a period exists.
 *
 * The ask is a route on the server. Pressing it used to answer 404 against a
 * server that did not have it and show the address it had tried, so the button
 * now goes quietly when the server cannot do it, and is offered only to the people
 * the route lets through.
 */
let cycles: { id: string; stage: string }[] = [];
let granted = new Set<string>(["MANAGE_SETTINGS"]);
const { notifyObjectives } = vi.hoisted(() => ({ notifyObjectives: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/performance/kpis",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/permissions", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/permissions")>()),
  useCan: (permission: string) => granted.has(permission),
}));
vi.mock("@/lib/store/performance", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/store/performance")>()),
  useAppraisals: () => ({ cycles }),
  useCycleMutations: () => ({ notifyObjectives }),
  useScoringWeights: () => ({
    weights: { rows: [{ component: "OBJECTIVES", weightBp: 3000 }] },
  }),
}));

const { EmptyObjectives } = await import("@/app/(app)/performance/kpis");
const { ToastProvider } = await import("@/components/ui");

const draw = () =>
  render(
    <ToastProvider>
      <EmptyObjectives scope="company" href="/performance/kpis/new" />
    </ToastProvider>,
  );

const askButton = () =>
  screen.queryByRole("button", { name: "Ask everyone to set theirs" });

beforeEach(() => {
  cycles = [{ id: "c1", stage: "DRAFT" }];
  granted = new Set(["MANAGE_SETTINGS"]);
  notifyObjectives.mockReset();
});

describe("the empty objectives page", () => {
  it("says what objectives are worth and starts with the company's", () => {
    cycles = [];
    draw();
    expect(screen.getByText(/30% of an appraisal score/)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Set a company objective/ }),
    ).toHaveAttribute("href", "/performance/kpis/new");
    expect(screen.queryByRole("button", { name: /Ask everyone/ })).toBeNull();
  });

  it("offers to ask everyone once there is a period to ask them in", () => {
    draw();
    expect(askButton()).toBeInTheDocument();
  });

  it("does not offer it to somebody the route would refuse", () => {
    granted = new Set();
    draw();
    expect(askButton()).toBeNull();
  });
});

describe("asking everyone", () => {
  it("says who was asked, who already has objectives and who has no sign-in", async () => {
    notifyObjectives.mockResolvedValue({
      notified: 4,
      alreadyHad: 2,
      noAccount: 1,
      askedAt: "2026-11-25T10:00:00.000Z",
    });
    draw();
    await userEvent.click(askButton()!);
    expect(notifyObjectives).toHaveBeenCalledWith("c1");
    expect(
      await screen.findByText("Everyone has been asked"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Asked 4 people. 2 already have objectives. 1 has no sign-in, so could not be asked in the app.",
      ),
    ).toBeInTheDocument();
  });

  it("a second press the same day says so, not that nobody was told", async () => {
    notifyObjectives.mockResolvedValue({
      notified: 0,
      alreadyHad: 2,
      askedAt: "2026-11-25T10:00:00.000Z",
    });
    draw();
    await userEvent.click(askButton()!);
    expect(
      await screen.findByText(
        "Everyone was asked in the last day. 2 already have objectives.",
      ),
    ).toBeInTheDocument();
  });

  it("takes the button away, and does not show the address it tried, when the server cannot do it", async () => {
    notifyObjectives.mockRejectedValue(
      new ApiError(
        404,
        "not_found",
        "POST /api/v1/performance/cycles/c1/notify-objectives could not be found.",
      ),
    );
    draw();
    await userEvent.click(askButton()!);
    expect(
      await screen.findByText("Asking everyone is not available yet"),
    ).toBeInTheDocument();
    await waitFor(() => expect(askButton()).toBeNull());
    expect(screen.queryByText(/could not be found/)).toBeNull();
    expect(screen.queryByText(/notify-objectives/)).toBeNull();
    /* The other way in is still there. */
    expect(
      screen.getByRole("link", { name: /Set a company objective/ }),
    ).toBeInTheDocument();
  });

  it("keeps the button, and the server's own sentence, for any other refusal", async () => {
    notifyObjectives.mockRejectedValue(
      new ApiError(
        409,
        "conflict",
        '"Q4" has been published, so nobody can set objectives for it now.',
      ),
    );
    draw();
    await userEvent.click(askButton()!);
    expect(await screen.findByText("That did not send")).toBeInTheDocument();
    expect(
      screen.getByText(
        '"Q4" has been published, so nobody can set objectives for it now.',
      ),
    ).toBeInTheDocument();
    expect(askButton()).toBeInTheDocument();
  });
});
