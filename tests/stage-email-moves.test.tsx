import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoPipeline } from "@/lib/hiring/pipeline/demo-store";
import { pipelineViewState } from "@/lib/hiring/pipeline/use-view";
import {
  cardOf,
  column,
  dragTo,
  peopleIn,
  renderInToasts,
} from "./pipeline-workspace-helpers";

/**
 * Moving people into a stage that sends an email, in a demo.
 *
 * A stage can be set up to send a message to whoever is moved into it, and the API
 * sends it unless told not to. So nobody may be emailed by a drag: the board asks
 * first, both answers are one press, and "without" really is without. The demo has
 * no mail, so what it records is that an email was asked for and was **not** sent,
 * with the reason; nothing it says ever claims otherwise.
 *
 * In the seeded demo, Shortlisted sends an update and Interview sends an invitation;
 * Pre-screening sends nothing.
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

const { PipelineWorkspace } =
  await import("@/app/(app)/hiring/requisitions/[id]/pipeline-workspace");

const open = () => renderInToasts(<PipelineWorkspace requisitionId="req-01" />);

const ready = () =>
  waitFor(() =>
    expect(screen.getAllByRole("region").length).toBeGreaterThan(3),
  );

/** The stage emails have been read, so a move knows to ask. */
const knowsStages = () =>
  screen.findByRole("button", { name: /Stage emails and interview panels/ });

beforeEach(() => {
  window.localStorage?.clear?.();
  demoPipeline.reset();
  pipelineViewState.reset();
});

const menuFor = (person: string) =>
  within(cardOf(person)).getByLabelText(`Move ${person} to…`);

describe("moving into a stage with a message", () => {
  it("asks first, says which email, and moves nobody until it is answered", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Shortlisted");

    const dialog = await screen.findByRole("dialog", {
      name: `Move ${person} to Shortlisted?`,
    });
    expect(dialog).toHaveTextContent("Moved to the next stage");
    expect(dialog).toHaveTextContent("only if you choose to send it now");
    /* Nothing has moved, and nothing is owed. */
    expect(peopleIn("Sourced")).toContain(person);
    expect(demoPipeline.current().emails).toHaveLength(0);

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(peopleIn("Sourced")).toContain(person);
    expect(peopleIn("Shortlisted")).not.toContain(person);
    expect(demoPipeline.current().emails).toHaveLength(0);
  });

  it("moves without emailing when asked to, and owes nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Shortlisted");
    await user.click(
      await screen.findByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Shortlisted`),
    ).toBeInTheDocument();
    expect(peopleIn("Shortlisted")).toContain(person);
    expect(demoPipeline.current().emails).toHaveLength(0);
    expect(screen.queryByText(/The email to/)).not.toBeInTheDocument();
  });

  it("moves and records the email as not sent, with the reason, and never says it was sent", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Shortlisted");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );

    expect(
      await screen.findByText(`${person} moved to Shortlisted`),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        `The email to ${person} was not sent. Nothing is sent from a practice board.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/was sent\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/is queued/)).not.toBeInTheDocument();
    expect(demoPipeline.current().emails).toHaveLength(1);
    expect(demoPipeline.current().emails[0]).toMatchObject({
      status: "SKIPPED",
      trigger: "STAGE_ENTRY",
      stageName: "Shortlisted",
    });
  });

  it("names the field an invitation is missing when there is no interview behind it", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Interview");
    await user.click(
      await screen.findByRole("button", { name: "Move and email" }),
    );
    expect(
      await screen.findByText(
        /uses \{interview_time\}, \{interview_location\}/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no interview is scheduled for them/),
    ).toBeInTheDocument();
  });

  it("warns, before it is sent, that an email would not leave a practice board", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Shortlisted");
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("It would not be sent right now"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/practice workspace with no email/),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(/You can still move them/),
    ).toBeInTheDocument();
  });

  it("asks for a drag as well, because a drag is how most people move a card", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    dragTo(person, column("Shortlisted"));
    const dialog = await screen.findByRole("dialog", {
      name: `Move ${person} to Shortlisted?`,
    });
    expect(peopleIn("Sourced")).toContain(person);
    await user.click(
      within(dialog).getByRole("button", { name: "Move without emailing" }),
    );
    expect(
      await screen.findByText(`${person} moved to Shortlisted`),
    ).toBeInTheDocument();
  });
});

describe("moving into a stage with no message", () => {
  it("does not ask, and sends nothing", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Pre-screening");
    expect(
      await screen.findByText(`${person} moved to Pre-screening`),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(demoPipeline.current().emails).toHaveLength(0);
  });
});

describe("moving many people", () => {
  const tick = async (user: ReturnType<typeof userEvent.setup>, who: string) =>
    user.click(
      within(cardOf(who)).getByRole("checkbox", { name: `Select ${who}` }),
    );

  const startMove = async (user: ReturnType<typeof userEvent.setup>) => {
    open();
    await ready();
    await knowsStages();
    const [a, b] = peopleIn("Sourced") as [string, string];
    await tick(user, a);
    await tick(user, b);
    await user.click(screen.getByRole("button", { name: "Move to…" }));
    return screen.findByRole("dialog", { name: "Move 2 people" });
  };

  it("offers the stage's email as a tick only for a stage that has one, and it is off", async () => {
    const user = userEvent.setup();
    const dialog = await startMove(user);
    const to = within(dialog).getByRole("combobox", { name: /Move to/ });
    await user.selectOptions(to, "Pre-screening");
    expect(within(dialog).queryByRole("checkbox")).not.toBeInTheDocument();

    await user.selectOptions(to, "Shortlisted");
    const box = within(dialog).getByRole("checkbox", {
      name: /Send "Moved to the next stage" to everyone moved/,
    });
    expect(box).not.toBeChecked();

    /* Changing the stage lets go of the tick: it was made for another stage. */
    await user.click(box);
    expect(box).toBeChecked();
    await user.selectOptions(to, "Pre-screening");
    await user.selectOptions(to, "Shortlisted");
    expect(
      within(dialog).getByRole("checkbox", { name: /to everyone moved/ }),
    ).not.toBeChecked();
  });

  it("moves them all and says nothing about email when the tick is off", async () => {
    const user = userEvent.setup();
    const dialog = await startMove(user);
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Move to/ }),
      "Shortlisted",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move 2 people" }),
    );
    expect(
      await screen.findByText("Moved to Shortlisted: 2 people."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/queued to send/)).not.toBeInTheDocument();
    expect(demoPipeline.current().emails).toHaveLength(0);
  });

  it("with the tick on, records an email for each and says honestly none was queued", async () => {
    const user = userEvent.setup();
    const dialog = await startMove(user);
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Move to/ }),
      "Shortlisted",
    );
    await user.click(
      within(dialog).getByRole("checkbox", { name: /to everyone moved/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Move 2 people" }),
    );
    expect(
      await screen.findByText("Moved to Shortlisted: 2 people."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/nothing is sent from a practice board/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/queued to send/)).not.toBeInTheDocument();
    expect(demoPipeline.current().emails).toHaveLength(2);
  });
});

describe("rejecting one person", () => {
  it("says nothing was sent unless the decline email was ticked", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Reject…");
    const dialog = await screen.findByRole("dialog");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Does not meet the must-haves",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(`${person} rejected`)).toBeInTheDocument();
    expect(
      await screen.findByText(
        "The reason is on their record. Nothing was sent to them.",
      ),
    ).toBeInTheDocument();
    expect(demoPipeline.current().emails).toHaveLength(0);
  });

  it("with the tick on, says the decline was not sent and why", async () => {
    const user = userEvent.setup();
    open();
    await ready();
    await knowsStages();
    const person = peopleIn("Sourced")[0] as string;
    await user.selectOptions(menuFor(person), "Reject…");
    const dialog = await screen.findByRole("dialog");
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: /Send them a decline email/,
      }),
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /Reason/ }),
      "Does not meet the must-haves",
    );
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    expect(await screen.findByText(`${person} rejected`)).toBeInTheDocument();
    expect(
      await screen.findByText(
        /The email to .* was not sent\. Nothing is sent from a practice board/,
      ),
    ).toBeInTheDocument();
    expect(demoPipeline.current().emails[0]).toMatchObject({
      trigger: "REJECTION",
      status: "SKIPPED",
    });
  });
});
