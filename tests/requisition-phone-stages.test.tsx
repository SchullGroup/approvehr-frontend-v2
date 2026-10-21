import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import { cardOf, renderInToasts } from "./pipeline-workspace-helpers";

/**
 * The board on a phone: one stage at a time, the stage you are working in first.
 *
 * Rendered through the real workspace with the demo's own book, as the board's tests
 * do, with the phone query answering yes. The desktop board keeps its own tests; what
 * is pinned here is that a phone gets the same people, the same selection and the same
 * ways to act, laid out as a strip of stages and a list.
 */

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({
    isConnected: false,
    isLoading: false,
    user: null,
    organization: undefined,
  }),
  useOrgTimezone: () => "Africa/Lagos",
}));
vi.mock("@/lib/permissions", () => ({
  useCan: () => true,
  usePermissions: () => ({ can: () => true, loading: false }),
}));
vi.mock("@/app/(app)/hiring/requisitions/[id]/use-phone", () => ({
  usePhone: () => true,
}));

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const open = () => renderInToasts(<PipelineWorkspace requisitionId="req-01" />);

const ready = () =>
  waitFor(() =>
    expect(
      screen.getByRole("tablist", { name: "Pipeline stages" }),
    ).toBeVisible(),
  );

const tab = (name: RegExp | string) =>
  screen.getByRole("tab", {
    name: typeof name === "string" ? new RegExp(`^${name}`) : name,
  });

const people = () =>
  within(screen.getByRole("tabpanel"))
    .queryAllByRole("article")
    .map((card) => within(card).getAllByRole("link")[0]?.textContent ?? "");

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  pipelineViewState.reset();
});

describe("the board on a phone", () => {
  it("is a strip of stages with their counts, not five columns in a sideways scroller", async () => {
    open();
    await ready();
    const names = screen.getAllByRole("tab").map((t) => t.textContent);
    expect(names[0]).toBe("Sourced41");
    expect(names).toContain("Rejected12");
    expect(names).toContain("Hired0");
    expect(screen.queryByRole("region", { name: /^Shortlisted,/ })).toBeNull();
  });

  it("opens on the first stage that has somebody in it, with that stage's own page", async () => {
    open();
    await ready();
    expect(tab("Sourced")).toHaveAttribute("aria-selected", "true");
    expect(people()).toHaveLength(25);
    expect(
      screen.getByRole("button", { name: "Load more (16 left)" }),
    ).toBeInTheDocument();
  });

  it("shows another stage's people when its tab is chosen", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const sourced = people();
    await user.click(tab("Interview"));
    expect(tab("Interview")).toHaveAttribute("aria-selected", "true");
    expect(people()).not.toEqual(sourced);
    expect(screen.getByRole("tabpanel")).toHaveAttribute(
      "aria-labelledby",
      tab("Interview").id,
    );
  });

  it("says so for a stage nobody is in, rather than drawing nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(tab("Hired"));
    expect(screen.getByText("Nobody here")).toBeInTheDocument();
  });

  it("changes stage on a deliberate sideways swipe, and not on a vertical scroll", async () => {
    open();
    await ready();
    const panel = screen.getByRole("tabpanel");
    const touch = (x: number, y: number) => ({
      touches: [{ clientX: x, clientY: y }],
      changedTouches: [{ clientX: x, clientY: y }],
    });

    /* Mostly down: a scroll. */
    fireEvent.touchStart(panel, touch(200, 100));
    fireEvent.touchEnd(panel, touch(190, 400));
    expect(tab("Sourced")).toHaveAttribute("aria-selected", "true");

    /* Too short to mean it. */
    fireEvent.touchStart(panel, touch(200, 100));
    fireEvent.touchEnd(panel, touch(170, 100));
    expect(tab("Sourced")).toHaveAttribute("aria-selected", "true");

    /* Left: the next stage. */
    fireEvent.touchStart(panel, touch(300, 100));
    fireEvent.touchEnd(panel, touch(120, 110));
    expect(tab("Shortlisted")).toHaveAttribute("aria-selected", "true");

    /* Right: back. */
    fireEvent.touchStart(panel, touch(100, 100));
    fireEvent.touchEnd(panel, touch(300, 110));
    expect(tab("Sourced")).toHaveAttribute("aria-selected", "true");
  });

  it("moves a person with the Move to… picker, as the board does, and has no drag grip", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    const person = people()[0] as string;
    expect(cardOf(person).querySelector("button[aria-hidden]")).toBeNull();
    await user.selectOptions(
      within(cardOf(person)).getByLabelText(`Move ${person} to…`),
      "Shortlisted",
    );
    /* Shortlisted sends a message to whoever is moved in, so it asks first. */
    await user.click(
      await screen.findByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Shortlisted`),
    ).toBeInTheDocument();
    expect(people()).not.toContain(person);
    expect(tab("Sourced")).toHaveTextContent("40");
    await user.click(tab("Shortlisted"));
    expect(people()).toContain(person);
    expect(tab("Shortlisted")).toHaveTextContent("12");
  });

  it("selects everyone shown in the stage through the same selection", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await user.click(
      screen.getByRole("checkbox", {
        name: "Select everyone shown in Sourced",
      }),
    );
    const person = people()[0] as string;
    expect(
      within(cardOf(person)).getByRole("checkbox", {
        name: `Select ${person}`,
      }),
    ).toBeChecked();
  });

  it("links each card to the person's record and carries the same facts as the board", async () => {
    open();
    await ready();
    const card = cardOf("Jumoke Quadri");
    expect(within(card).getByText(/^APP-/)).toBeInTheDocument();
    expect(within(card).getByText("LinkedIn")).toBeInTheDocument();
    expect(
      within(card).getByRole("link", { name: "Jumoke Quadri" }),
    ).toHaveAttribute(
      "href",
      expect.stringMatching(/^\/hiring\/candidates\/app-/),
    );
  });
});
