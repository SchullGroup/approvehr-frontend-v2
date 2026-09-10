import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";
import type { ApiQuestion } from "@/lib/api/performance";

/**
 * A question can be put to more than one audience, and the form has to be able
 * to say so.
 *
 * `ReviewQuestion.askedOf` is a list and the API accepts up to four. The form
 * was a single dropdown writing `audience === "ALL" ? [] : [audience]`, so it
 * could only ever produce an empty list or exactly one — and, worse, opening an
 * existing multi-audience question read `askedOf[0]` and saved it back having
 * dropped the rest. Nothing on screen said a second audience had been there.
 *
 * `tsc` cannot see any of this: `[audience]` is a perfectly good
 * `ReviewAudience[]`. The only witness is mounting the form with a two-audience
 * question in it, which is what these do.
 */

/** What the mocked store hands back. Set per test; the edit path needs a row. */
const listed: ApiQuestion[] = [];

vi.mock("@/lib/store/performance", () => ({
  useCycleQuestions: () => ({
    questions: listed,
    loading: false,
    reload: vi.fn(),
  }),
  useFramework: () => ({
    competencies: [],
    groups: [],
    loading: false,
    error: null,
    source: "api",
  }),
  useSections: () => ({ sections: [], loading: false }),
  useFrameworkActions: () => ({}),
  useAppraisals: () => ({ cycles: [], loading: false }),
}));

const question = (askedOf: ApiQuestion["askedOf"]): ApiQuestion => ({
  id: "q-1",
  reviewCycleId: "c-1",
  competencyId: null,
  prompt: "What did you deliver this period that you are proudest of?",
  kind: "TEXT",
  askedOf,
  required: true,
  options: [],
  allowCustom: false,
  order: 1,
  source: "HR",
  departmentIds: [],
});

const mount = (
  overrides: Partial<React.ComponentProps<typeof QuestionsDialog>> = {},
) => {
  const onAdd = vi.fn().mockResolvedValue(undefined);
  const onUpdate = vi.fn().mockResolvedValue(undefined);
  render(
    <QuestionsDialog
      cycleId="c-1"
      periodName="H2 2026 Appraisal"
      onClose={vi.fn()}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={vi.fn()}
      {...overrides}
    />,
  );
  return { onAdd, onUpdate };
};

beforeEach(() => {
  listed.length = 0;
});

const narrow = async () =>
  userEvent.selectOptions(
    screen.getByLabelText("Who is asked"),
    "Only certain people",
  );

describe("choosing more than one audience", () => {
  it("writes both when both are ticked", async () => {
    const { onAdd } = mount();

    await userEvent.type(
      screen.getByLabelText(/Add a question/),
      "How did this period go?",
    );
    await narrow();
    await userEvent.click(screen.getByLabelText("The person themselves"));
    await userEvent.click(screen.getByLabelText("Their manager"));
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0]?.[0]).toMatchObject({
      askedOf: ["SELF", "MANAGER"],
    });
  });

  it("keeps the declared order, not the order they were ticked", async () => {
    const { onAdd } = mount();

    await userEvent.type(screen.getByLabelText(/Add a question/), "Anything?");
    await narrow();
    /* Manager first. The list row joins these with commas, so click order
       leaking through would render one fact under two different labels. */
    await userEvent.click(screen.getByLabelText("Their manager"));
    await userEvent.click(screen.getByLabelText("The person themselves"));
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    expect(onAdd.mock.calls[0]?.[0]?.askedOf).toEqual(["SELF", "MANAGER"]);
  });

  it("still writes an empty list for everybody", async () => {
    const { onAdd } = mount();

    await userEvent.type(screen.getByLabelText(/Add a question/), "Anything?");
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    await waitFor(() => expect(onAdd).toHaveBeenCalled());
    /* Empty means everybody — the API filter is
       `askedOf.length === 0 || askedOf.includes(audience)`. Narrowing to all
       three instead would exclude any audience added to the enum later. */
    expect(onAdd.mock.calls[0]?.[0]?.askedOf).toEqual([]);
  });

  it("refuses a narrowed question with nobody ticked", async () => {
    const { onAdd } = mount();

    await userEvent.type(screen.getByLabelText(/Add a question/), "Anything?");
    await narrow();
    await userEvent.click(screen.getByRole("button", { name: "Add question" }));

    expect(
      await screen.findByText(/A question nobody is asked is never answered/),
    ).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe("editing a question that is already asked of two people", () => {
  /* The defect, exactly: the form read `askedOf[0]`, so opening this question
     showed "The person themselves" alone and saving wrote `["SELF"]` — MANAGER
     gone, with nothing on screen having said it was there. */
  const openTheEditor = async () => {
    listed.push(question(["SELF", "MANAGER"]));
    const handles = mount();
    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));
    return handles;
  };

  it("ticks both boxes", async () => {
    await openTheEditor();

    expect(screen.getByLabelText("The person themselves")).toBeChecked();
    expect(screen.getByLabelText("Their manager")).toBeChecked();
    expect(
      screen.getByLabelText("Their colleagues (anonymous)"),
    ).not.toBeChecked();
  });

  it("saves both back untouched", async () => {
    const { onUpdate } = await openTheEditor();

    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0]?.[1]).toMatchObject({
      askedOf: ["SELF", "MANAGER"],
    });
  });

  it("keeps an audience the form cannot show", async () => {
    /* `REPORT` is in the enum and nothing reaches it, so the picker offers no
       box for it. An edit must leave it alone rather than discard a value the
       screen happens not to render — which is this defect one level down. */
    listed.push(question(["MANAGER", "REPORT"]));
    const { onUpdate } = mount();

    await userEvent.click(screen.getByRole("button", { name: /Edit/i }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalled());
    expect(onUpdate.mock.calls[0]?.[1]?.askedOf).toEqual(["MANAGER", "REPORT"]);
  });
});
