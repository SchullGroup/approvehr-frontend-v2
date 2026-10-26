import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import { demoScreening } from "@/lib/hiring/screening/demo-store";
import { column, renderInToasts } from "./pipeline-workspace-helpers";

/**
 * A score in the queue, the board and the table.
 *
 * What these hold: every row and card carries its score with the number in text,
 * the queue and the board both sort and filter by score and by status the way
 * the API does (a range only ever matches people who have a score), an advert with
 * no criteria says so with a way to add some, and an advert with people below the
 * pass mark says how many and where to look.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/hiring/postings/applications",
}));
vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));
vi.mock("@/lib/store/recruitment", () => ({
  useRequisitions: () => ({
    requisitions: [],
    total: 0,
    loading: false,
    error: null,
    connected: false,
    reload: () => undefined,
  }),
}));
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Africa/Lagos",
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
}));

const { ApplicationsScreen } =
  await import("@/app/(app)/hiring/postings/applications/applications-screen");
const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const SEEDED = "demo-advert-req-01";
const NO_CRITERIA_ADVERT = "demo-advert-req-02";

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  demoScreening.reset();
  pipelineViewState.reset();
});

/* ------------------------------------------------------------------- queue */

const openQueue = (posting = "") =>
  render(
    <ToastProvider>
      <ApplicationsScreen initialPostingId={posting} />
    </ToastProvider>,
  );

const waitForRows = () =>
  waitFor(() =>
    expect(screen.getAllByText(/^Applied 2026-/).length).toBeGreaterThan(0),
  );

/** The fit numbers on the page, in the order the rows are drawn. */
const fitsOnPage = (): (number | null)[] =>
  screen.getAllByText(/^Applied 2026-/).map((applied) => {
    const row = applied.closest("div.rounded-md") as HTMLElement;
    const badge = within(row).queryByText(/^Fit \d+/);
    return badge ? Number(/\d+/.exec(badge.textContent ?? "")?.[0]) : null;
  });

const openFilters = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /^Filters/ }));

describe("in the queue", () => {
  it("puts a score on each row, with the number in text", async () => {
    openQueue(SEEDED);
    await waitForRows();
    const fits = fitsOnPage();
    expect(fits.some((n) => n !== null)).toBe(true);
    expect(screen.getAllByText(/^Fit \d+/).length).toBeGreaterThan(5);
  });

  it("says in words why somebody has no score, and never shows a zero for them", async () => {
    openQueue(SEEDED);
    await waitForRows();
    expect(screen.getByText("Needs a person to read it")).toBeInTheDocument();
    expect(screen.getByText("Waiting for CV text")).toBeInTheDocument();
    expect(screen.getByText("Could not read the CV")).toBeInTheDocument();
    expect(screen.queryByText("Fit 0")).not.toBeInTheDocument();
  });

  it("says a score from the older version is, on the row", async () => {
    openQueue(SEEDED);
    await waitForRows();
    expect(screen.getByText("(older version)")).toBeInTheDocument();
  });

  it("flags who is below the pass mark, in those words", async () => {
    openQueue(SEEDED);
    await waitForRows();
    expect(screen.getAllByText("Below the pass mark").length).toBeGreaterThan(
      0,
    );
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bfailed\b|eliminated|disqualified/i);
  });

  it("opens the explanation of a score on the row", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await user.click(
      screen.getAllByRole("button", {
        name: "How this score was worked out",
      })[0] as HTMLElement,
    );
    expect(await screen.findByTestId("explanation")).toHaveTextContent(
      /Fit score \d+ out of 100|Needs a person|Waiting for CV text|Could not read/,
    );
  });

  it("sorts by the highest fit score, people with no score last", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort by" }),
      "Highest fit score",
    );
    await waitFor(() => {
      const fits = fitsOnPage();
      const scored = fits.filter((n): n is number => n !== null);
      expect(scored.length).toBeGreaterThan(3);
      expect(scored).toEqual([...scored].sort((a, b) => b - a));
      /* Nobody without a score sits above somebody with one. */
      expect(fits.indexOf(null)).toBeGreaterThanOrEqual(scored.length);
    });
  });

  it("sorts by the lowest fit score first", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort by" }),
      "Lowest fit score",
    );
    await waitFor(() => {
      const scored = fitsOnPage().filter((n): n is number => n !== null);
      expect(scored).toEqual([...scored].sort((a, b) => a - b));
    });
  });

  it("filters by a score range, and only people with a score are in a range", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.type(
      screen.getByRole("textbox", { name: /Fit score from/ }),
      "60",
    );
    await waitFor(() => {
      const fits = fitsOnPage();
      expect(fits.length).toBeGreaterThan(0);
      expect(fits.every((n) => n !== null && n >= 60)).toBe(true);
    });
    expect(screen.getByText(/60 or more/)).toBeInTheDocument();
  });

  it("finds the people who need a person to read the CV", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Score status" }),
      "Needs a person to read it",
    );
    await waitFor(() => expect(fitsOnPage()).toEqual([null]));
  });

  it("says a backwards range is, and applies neither end", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.type(
      screen.getByRole("textbox", { name: /Fit score from/ }),
      "80",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Fit score to/ }),
      "20",
    );
    expect(
      screen.getByText("That is below the start, so no scores are applied."),
    ).toBeInTheDocument();
    expect(screen.queryByText("80 or more")).not.toBeInTheDocument();
  });

  it("refuses a bound that is not a number from 0 to 100", async () => {
    const user = userEvent.setup();
    openQueue(SEEDED);
    await waitForRows();
    await openFilters(user);
    await user.type(
      screen.getByRole("textbox", { name: /Fit score from/ }),
      "150",
    );
    expect(screen.getByText("0 to 100")).toBeInTheDocument();
  });

  it("says an advert has no criteria, with a way to add them", async () => {
    openQueue(NO_CRITERIA_ADVERT);
    await waitForRows();
    const note = (
      await screen.findByText("This advert has no screening criteria yet")
    ).closest("div") as HTMLElement;
    expect(
      within(note).getByRole("link", { name: "Add criteria" }),
    ).toHaveAttribute(
      "href",
      `/hiring/postings/${NO_CRITERIA_ADVERT}?tab=screening`,
    );
    expect(screen.getAllByText("No criteria yet").length).toBeGreaterThan(0);
  });

  it("says how many are below the pass mark, and where to look, with nobody rejected", async () => {
    openQueue(SEEDED);
    await waitForRows();
    const note = (await screen.findByText("Some are below the pass mark"))
      .parentElement as HTMLElement;
    expect(note).toHaveTextContent(
      /\d+ people are below this advert's pass mark/,
    );
    expect(note).toHaveTextContent(
      "Nobody is rejected until a person confirms it",
    );
    expect(
      within(note).getByRole("link", { name: /Review them/ }),
    ).toHaveAttribute("href", `/hiring/postings/${SEEDED}/below-pass-mark`);
  });
});

/* ------------------------------------------------------------------- board */

const openBoard = () =>
  renderInToasts(<PipelineWorkspace requisitionId="req-01" />);

const boardReady = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(3),
  );

/** The fit figure on each card in a column, in order; `null` for no bar. */
const cardFits = (name: string): (number | null)[] =>
  within(column(name))
    .getAllByRole("article")
    .map((card) => {
      const bar = within(card).queryByTestId("fit-bar");
      const found = /Fit\s*(\d+)/.exec(bar?.textContent ?? "");
      return found ? Number(found[1]) : null;
    });

describe("on the board", () => {
  it("shows a small bar and the number on each card", async () => {
    openBoard();
    await boardReady();
    const cards = within(column("Sourced")).getAllByRole("article");
    expect(cards.length).toBeGreaterThan(5);
    for (const card of cards) {
      expect(within(card).getByTestId("fit-bar")).toBeInTheDocument();
    }
    expect(cardFits("Sourced").some((n) => n !== null)).toBe(true);
  });

  it("sorts a column by fit score, highest first", async () => {
    const user = userEvent.setup();
    openBoard();
    await boardReady();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort by" }),
      "Highest fit score",
    );
    await waitFor(() => {
      const scored = cardFits("Sourced").filter((n): n is number => n !== null);
      expect(scored.length).toBeGreaterThan(5);
      expect(scored).toEqual([...scored].sort((a, b) => b - a));
    });
  });

  it("narrows by a score range", async () => {
    const user = userEvent.setup();
    openBoard();
    await boardReady();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.type(
      screen.getByRole("textbox", { name: /Fit score from/ }),
      "70",
    );
    await waitFor(() => {
      const fits = cardFits("Sourced");
      expect(fits.length).toBeGreaterThan(0);
      expect(fits.every((n) => n !== null && n >= 70)).toBe(true);
    });
  });

  it("narrows to people with flagged answers, and says how many answers", async () => {
    const user = userEvent.setup();
    openBoard();
    await boardReady();
    const before = within(column("Sourced")).getAllByRole("article").length;
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Flagged answers" }),
      "1 or more",
    );
    await waitFor(() => {
      const cards = within(column("Sourced")).queryAllByRole("article");
      expect(cards.length).toBeGreaterThan(0);
      expect(cards.length).toBeLessThan(before);
      for (const card of cards) {
        expect(within(card).getByText(/Needs a look/)).toBeInTheDocument();
      }
    });
    /* The option, and the chip under the bar that says it is on. */
    expect(screen.getAllByText("1 or more").length).toBeGreaterThan(1);
  });

  it("narrows to people below the pass mark, in those words", async () => {
    const user = userEvent.setup();
    openBoard();
    await boardReady();
    await user.click(screen.getByRole("button", { name: /^Filters/ }));
    await user.click(
      screen.getByRole("checkbox", { name: /Below the pass mark/ }),
    );
    await waitFor(() => {
      const cards = within(column("Sourced")).queryAllByRole("article");
      for (const card of cards) {
        expect(
          within(card).getByText("Below the pass mark"),
        ).toBeInTheDocument();
      }
    });
  });

  it("shows the same score as a badge in the table", async () => {
    const user = userEvent.setup();
    openBoard();
    await boardReady();
    await user.click(screen.getByRole("radio", { name: "Table" }));
    const section = column("Sourced");
    expect(within(section).getAllByText(/^Fit \d+/).length).toBeGreaterThan(3);
  });
});
