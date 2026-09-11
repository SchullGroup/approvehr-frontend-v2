import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QuestionsDialog } from "@/app/(app)/performance/period-dialogs";
import { ApiError } from "@/lib/api/client";
import type { ApiQuestion } from "@/lib/api/performance";

/**
 * Rearranging the form, and what the list must do while the request is in
 * flight.
 *
 * The API takes every question id at once and renumbers them, so the screen
 * holds the arrangement somebody just made rather than waiting for the answer.
 * Two ways that goes wrong and neither is visible to `tsc`:
 *
 * - **no optimistic order** — the row snaps back for as long as the request
 *   takes, which reads as the drag having failed, and then lands in the new
 *   place a moment later, which reads as a second move nobody asked for;
 * - **no revert** — a refused reorder leaves the list claiming a change the
 *   server rejected, which is a screen lying about what is stored.
 *
 * Driven through the keyboard rather than pointer events. `Sortable`'s own
 * header says the keyboard path is the real one and not a fallback, and it is
 * the half `jsdom` can exercise honestly: pointer dragging needs measured
 * rects, which `jsdom` does not have.
 */

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

const question = (id: string, prompt: string): ApiQuestion => ({
  id,
  reviewCycleId: "c-1",
  competencyId: null,
  prompt,
  kind: "TEXT",
  askedOf: [],
  required: true,
  options: [],
  allowCustom: false,
  order: Number(id.slice(2)),
  source: "HR",
  departmentIds: [],
});

beforeEach(() => {
  listed.length = 0;
  listed.push(
    question("q-1", "What are you proudest of?"),
    question("q-2", "How did this period go?"),
    question("q-3", "What do you want support with?"),
  );
});

const mount = (onReorder?: (ids: string[]) => Promise<void>) => {
  render(
    <QuestionsDialog
      cycleId="c-1"
      periodName="H2 2026 Appraisal"
      onClose={vi.fn()}
      onAdd={vi.fn().mockResolvedValue(undefined)}
      onUpdate={vi.fn().mockResolvedValue(undefined)}
      onRemove={vi.fn().mockResolvedValue(undefined)}
      {...(onReorder ? { onReorder } : {})}
    />,
  );
};

/** The prompts as the list currently shows them, top to bottom. */
const promptsOnScreen = () =>
  screen
    .getAllByRole("button", { name: /^Edit "/ })
    .map(
      (button) =>
        /^Edit "(.*)"$/.exec(button.getAttribute("aria-label") ?? "")?.[1],
    );

/**
 * The handle, and only the handle. Its label is "Move <prompt>. Position n of
 * m." — a bare prompt also matches this row's Edit and Remove buttons.
 */
const handleFor = (prompt: string) =>
  screen.getByRole("button", {
    name: new RegExp(
      `^Move ${prompt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.`,
    ),
  });

/** Pick the row up, move it once, put it down — `Sortable`'s keyboard path. */
const moveDown = async (prompt: string) => {
  const handle = handleFor(prompt);
  handle.focus();
  await userEvent.keyboard("{ }");
  await userEvent.keyboard("{ArrowDown}");
  await userEvent.keyboard("{ }");
};

/**
 * Drag with a pointer, which is the path the keyboard tests do not reach.
 *
 * `Sortable` committed the release from inside a `setDrag` updater — and React
 * runs updaters during the render phase, so `onReorder` landed a parent's
 * `setState` mid-render. The keyboard path never had it: it calls `commit` and
 * `setDrag` as two statements in the handler.
 *
 * jsdom reports every rect as zero, so the slot arithmetic runs on `gap` alone:
 * 8px a row, and a swap at half of it. That is enough to move a row by one,
 * which is all this needs to prove.
 */
const drag = async (prompt: string, byPixels: number) => {
  const handle = handleFor(prompt);
  /* jsdom has neither, and `Sortable` calls the first at pick-up. */
  handle.setPointerCapture = vi.fn();
  handle.releasePointerCapture = vi.fn();

  const pointer = (type: string, clientY: number) =>
    Object.assign(new MouseEvent(type, { bubbles: true, clientY }), {
      pointerId: 1,
    });

  await act(async () => {
    handle.dispatchEvent(pointer("pointerdown", 0));
  });
  await act(async () => {
    window.dispatchEvent(pointer("pointermove", byPixels));
  });
  await act(async () => {
    window.dispatchEvent(pointer("pointerup", byPixels));
  });
};

describe("dragging with a pointer", () => {
  it("commits the release without updating a parent mid-render", async () => {
    /* React reports a setState-in-render through `console.error` and nothing
       else — no throw, no failed assertion, and every other test here stays
       green. Watching the channel is the only way to see it. */
    const complaints: unknown[][] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => complaints.push(args));

    const onReorder = vi.fn().mockResolvedValue(undefined);
    mount(onReorder);
    await drag("What are you proudest of?", 10);
    spy.mockRestore();

    expect(onReorder).toHaveBeenCalledWith(["q-2", "q-1", "q-3"]);
    expect(
      complaints.filter((args) =>
        String(args[0]).includes("while rendering a different component"),
      ),
    ).toEqual([]);
  });
});

describe("rearranging the form", () => {
  it("sends every id, once, in the new order", async () => {
    const onReorder = vi.fn().mockResolvedValue(undefined);
    mount(onReorder);

    await moveDown("What are you proudest of?");

    await waitFor(() => expect(onReorder).toHaveBeenCalled());
    /* Every question on the cycle, once each. The API refuses a partial list
       rather than inferring where the rest go. */
    expect(onReorder.mock.calls[0]?.[0]).toEqual(["q-2", "q-1", "q-3"]);
  });

  it("shows the new order straight away, not after the answer", async () => {
    /* Never resolves, so the only order that can be on screen is the local one. */
    mount(() => new Promise<void>(() => {}));

    await moveDown("What are you proudest of?");

    await waitFor(() =>
      expect(promptsOnScreen()).toEqual([
        "How did this period go?",
        "What are you proudest of?",
        "What do you want support with?",
      ]),
    );
  });

  it("puts it back, and says why, when the server refuses", async () => {
    const refusal =
      '"H2 2026 Appraisal" is published. Its form is a record now.';
    mount(() => Promise.reject(new ApiError(409, "conflict", refusal)));

    await moveDown("What are you proudest of?");

    /* Verbatim — the server knows which cycle and which stage; nothing here does. */
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    await waitFor(() =>
      expect(promptsOnScreen()).toEqual([
        "What are you proudest of?",
        "How did this period go?",
        "What do you want support with?",
      ]),
    );
  });

  it("offers no handles at all when rearranging is refused", () => {
    /* A published period. Absent, not present-and-failing: a drag that is
       always undone teaches people the screen is broken. */
    mount();

    expect(
      screen.queryByRole("button", { name: /^Move / }),
    ).not.toBeInTheDocument();
    expect(promptsOnScreen()).toHaveLength(3);
  });
});
