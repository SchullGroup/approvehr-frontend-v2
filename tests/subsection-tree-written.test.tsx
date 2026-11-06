import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { ToastProvider } from "@/components/ui";
import type { ApiCompetency } from "@/lib/api/performance";

/**
 * The company's sections and subsections, for a subsection answered in words.
 *
 * What the tree has to get right for it: the word on its row (Written, and not
 * Rated), the kind it sends when a new one is made (`TEXT`, which an older body never
 * mentions and a level never sends), keeping that kind for the next one typed, and
 * where a new version of it opens (on its questions, like every kind but a pick,
 * which needs its choices first). None of it is visible to `tsc`.
 */

let createCompetency: Mock<(...args: unknown[]) => Promise<unknown>>;
let newCompetencyVersion: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("@/lib/store/performance", () => ({
  useFrameworkActions: () => ({
    editable: true,
    createSection: vi.fn().mockResolvedValue({}),
    createCompetency: (...args: unknown[]) => createCompetency(...args),
    updateCompetency: vi.fn().mockResolvedValue({}),
    setChoiceOptions: vi.fn().mockResolvedValue({}),
    newCompetencyVersion: (...args: unknown[]) => newCompetencyVersion(...args),
  }),
  useFramework: () => ({ competencies: [], groups: [], loading: false }),
  useSections: () => ({ sections: [], loading: false }),
}));
vi.mock("@/lib/permissions", () => ({ useCan: () => true }));

const { SubsectionTree, newSubsectionBody } =
  await import("@/app/(app)/performance/subsection-tree");

const SECTIONS = [
  { id: "s-beh", name: "Behavioural competency", weightBp: 3000 },
];

const competency = (over: Partial<ApiCompetency>): ApiCompetency => ({
  id: "c",
  name: "Subsection",
  sectionId: "s-beh",
  sectionName: "Behavioural competency",
  description: null,
  isCore: false,
  scaleMax: 5,
  active: true,
  archived: false,
  ratingCount: 0,
  ...over,
});

const WRITTEN = competency({
  id: "c-words",
  name: "Communication",
  answerKind: "TEXT",
});

/** The parent owns the list and which row is open; this stands in for it. */
function Harness({
  start = [WRITTEN],
  next,
  onChanged,
}: {
  start?: ApiCompetency[];
  next?: ApiCompetency[];
  onChanged?: () => void;
}) {
  const [list, setList] = useState<ApiCompetency[]>(start);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <ToastProvider>
      <SubsectionTree
        periodName="H2 2026 Appraisal"
        sections={SECTIONS}
        competencies={list}
        loading={false}
        questionCounts={new Map()}
        unfiledQuestionCount={0}
        editable
        whyNot={null}
        selectedId={selectedId}
        onSelect={(chosen) => setSelectedId(chosen?.id ?? null)}
        onChanged={() => {
          onChanged?.();
          if (next) setList(next);
        }}
        renderQuestions={(one) => (
          <div data-testid="questions-panel">Questions for {one.name}</div>
        )}
      />
    </ToastProvider>
  );
}

const toggleOf = (name: RegExp | string) => {
  const toggle = screen
    .getAllByRole("button", { name })
    .find((button) => button.hasAttribute("aria-expanded"));
  if (!toggle) throw new Error(`No row for ${String(name)}`);
  return toggle;
};
const openSection = () => userEvent.click(toggleOf(/Behavioural competency/));
const nameField = () =>
  screen.getByLabelText("New subsection") as HTMLInputElement;

beforeEach(() => {
  createCompetency = vi.fn().mockResolvedValue({});
  newCompetencyVersion = vi.fn().mockResolvedValue({});
});

describe("a written subsection's row", () => {
  it("says Written in front of its name, and not Rated", async () => {
    render(<Harness />);
    await openSection();
    const row = toggleOf(/Communication/);
    expect(row).toHaveTextContent("Written");
    expect(row).not.toHaveTextContent("Rated");
  });

  it("opens on its questions, like every other kind, because that is what it is opened to write", async () => {
    render(<Harness />);
    await openSection();
    await userEvent.click(toggleOf(/Communication/));
    expect(screen.getByRole("tab", { name: /Questions/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByTestId("questions-panel")).toHaveTextContent(
      "Questions for Communication",
    );
  });

  it("is a lock-free row when nothing has been recorded on it, and fixed when something has", async () => {
    render(
      <Harness
        start={[
          WRITTEN,
          competency({
            id: "c-fixed",
            name: "Candour",
            answerKind: "TEXT",
            ratingCount: 3,
          }),
        ]}
      />,
    );
    await openSection();
    expect(toggleOf(/Communication/)).not.toHaveTextContent("Fixed");
    expect(
      screen.getByText("Fixed: 3 ratings are recorded, in any period."),
    ).toBeInTheDocument();
  });
});

describe("making a subsection that is answered in words", () => {
  it("sends the kind, which a level never does", async () => {
    render(<Harness start={[]} />);
    await openSection();
    await userEvent.type(nameField(), "Communication");
    await userEvent.selectOptions(screen.getByLabelText("Answered by"), "TEXT");
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );

    await waitFor(() =>
      expect(createCompetency).toHaveBeenCalledWith({
        name: "Communication",
        scaleMax: 5,
        sectionId: "s-beh",
        answerKind: "TEXT",
      }),
    );
  });

  it("needs nothing else: no scale of its own and no choices", async () => {
    render(<Harness start={[]} />);
    await openSection();
    await userEvent.type(nameField(), "Communication");
    await userEvent.selectOptions(screen.getByLabelText("Answered by"), "TEXT");
    await userEvent.click(
      screen.getByRole("button", { name: "Add subsection" }),
    );
    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(1));
    const body = createCompetency.mock.calls[0]?.[0] as object;
    expect(Object.keys(body).sort()).toEqual([
      "answerKind",
      "name",
      "scaleMax",
      "sectionId",
    ]);
    expect(body).not.toHaveProperty("choiceOptions");
  });

  it("keeps the kind for the next one typed, so ten written subsections are not ten choices of it", async () => {
    render(<Harness start={[]} />);
    await openSection();
    await userEvent.selectOptions(screen.getByLabelText("Answered by"), "TEXT");
    await userEvent.type(nameField(), "First{Enter}");
    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(nameField().value).toBe(""));

    await userEvent.type(nameField(), "Second{Enter}");
    await waitFor(() => expect(createCompetency).toHaveBeenCalledTimes(2));
    expect(createCompetency.mock.calls[1]?.[0]).toMatchObject({
      name: "Second",
      answerKind: "TEXT",
    });
  });

  it("builds the body with the kind for words, and without one for a level", () => {
    expect(
      newSubsectionBody({
        name: "  Communication ",
        sectionId: "s-beh",
        answerKind: "TEXT",
      }),
    ).toEqual({
      name: "Communication",
      scaleMax: 5,
      sectionId: "s-beh",
      answerKind: "TEXT",
    });
    expect(
      newSubsectionBody({
        name: "Diligence",
        sectionId: "s-beh",
        answerKind: "RATING",
      }),
    ).not.toHaveProperty("answerKind");
  });
});

describe("starting a new version as a written subsection", () => {
  const FIXED = competency({
    id: "c-fixed",
    name: "Teamwork",
    answerKind: "BOOLEAN",
    ratingCount: 12,
  });
  const MADE = competency({
    id: "c-made",
    name: "Teamwork",
    answerKind: "TEXT",
    ratingCount: 0,
  });

  it("opens the new subsection on its questions, as for any kind but a pick, and tells the owner of the list", async () => {
    newCompetencyVersion.mockResolvedValue({
      competency: MADE,
      retired: { id: "c-fixed", name: "Teamwork (retired)", ratingsKept: 12 },
      notes: [],
    });
    const onChanged = vi.fn();
    render(<Harness start={[FIXED]} next={[MADE]} onChanged={onChanged} />);
    await openSection();
    await userEvent.click(toggleOf(/Teamwork/));
    await userEvent.click(screen.getByRole("tab", { name: "How it is rated" }));
    await userEvent.click(
      screen.getByRole("button", { name: "Start a new version" }),
    );
    await userEvent.selectOptions(
      screen.getByLabelText(/How the new version is answered/),
      "In their own words",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Start new version" }),
    );

    await waitFor(() =>
      expect(newCompetencyVersion).toHaveBeenCalledWith("c-fixed", "TEXT"),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /Questions/ })).toHaveAttribute(
        "aria-selected",
        "true",
      ),
    );
    expect(screen.getByTestId("questions-panel")).toHaveTextContent(
      "Questions for Teamwork",
    );
    expect(toggleOf(/Teamwork/)).toHaveTextContent("Written");
  });
});
