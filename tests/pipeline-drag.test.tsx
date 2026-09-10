import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelineBoard } from "@/components/hiring/pipeline-board";
import type { PipelineCard, StageId } from "@/lib/types";

/**
 * The hiring board's drag, after it stopped being the browser's.
 *
 * It was `draggable` + `onDragStart` + `onDrop` — the HTML5 API — which cannot
 * be driven from a test at all in jsdom, does not work on touch in a real
 * browser, and gave the card no lift, no settle and no auto-scroll. It is
 * `useDragInto` now, the same pointer-event core the org chart uses.
 *
 * ## What these can and cannot prove
 *
 * `document.elementFromPoint` is **not implemented in jsdom** — it returns
 * null — and the hook uses it deliberately, because the browser's own hit test
 * is the only thing that agrees with what somebody can see. So it is stubbed
 * here to return the column the test means to be over. That is the honest
 * seam: everything downstream of the hit test is exercised for real, and the
 * hit test itself is the browser's job rather than this code's.
 *
 * Layout is the other gap. jsdom reports every element as 0×0, so
 * `scrollParent`'s `scrollWidth > clientWidth` is never true and the
 * auto-scroll cannot be asserted here at all. It is not asserted, rather than
 * asserted against a fake.
 *
 * The first test is the one worth having. `onMove` used to be called from
 * inside a `setState` updater, which React runs during the render phase — so a
 * caller that holds the board in its own state got "Cannot update a component
 * while rendering a different component", and whether it fired depended on
 * React's eager-evaluation path. Nothing in the types could see it and the
 * board shipped with it.
 */

const CANDIDATE = {
  id: "cand-1",
  firstName: "Adaeze",
  lastName: "Okonkwo",
  currentTitle: "Site Engineer",
  currentCompany: "Julius Berger",
};

const card = (id: string, stage: StageId): PipelineCard =>
  ({
    id,
    stage,
    outcome: "in_progress",
    stageEnteredAt: "2026-09-01T09:00:00.000Z",
    rating: null,
    offer: null,
    scorecards: [],
    interviews: [],
    candidate: CANDIDATE,
    requisition: { id: "req-1", title: "Site Engineer" },
  }) as unknown as PipelineCard;

const STAGES_SHOWN: StageId[] = ["sourced", "shortlisted", "interview"];

/** The column element a drop should land on, by its `data-drop-id`. */
const column = (stage: StageId): HTMLElement => {
  const node = document.querySelector<HTMLElement>(`[data-drop-id="${stage}"]`);
  if (!node) throw new Error(`No column for ${stage}`);
  return node;
};

/**
 * Grab a card by its grip and release it over a column.
 *
 * The grip is the only drag surface — the rest of the card is a button that
 * opens the panel — so this presses exactly what a person presses.
 */
function dragTo(name: string, stage: StageId | null) {
  const grip = screen.getByLabelText(new RegExp(`^Move ${name}\\.`));
  /* jsdom's PointerEvent has no `setPointerCapture` on the element unless it
     is stubbed; the hook calls it so the drag survives the pointer leaving the
     handle in a real browser. */
  (grip as HTMLElement & { setPointerCapture: () => void }).setPointerCapture =
    () => undefined;

  /* Each dispatch in its own `act`, and that is not ceremony.
     -------------------------------------------------------------------
     Pick-up sets state, and the effect that subscribes the window listeners
     only runs when React flushes it. Dispatching `pointermove` in the same
     synchronous block as `pointerdown` means dispatching it before anything is
     listening — which is what a first draft of this did, and it failed on the
     one assertion that depends on the listener while every negative assertion
     passed. In a browser these are three separate user gestures, so `act`
     around each is the honest model of them, not a workaround. */
  act(() => {
    grip.dispatchEvent(
      new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
    );
  });

  /* Defined, not spied: jsdom does not implement `elementFromPoint` at all, so
     there is no property to spy on. Assigning it is the seam described in the
     header — the browser's hit test is the browser's job, and everything
     downstream of it is exercised for real. */
  const target = stage === null ? document.body : column(stage);
  const doc = document as unknown as Record<string, unknown>;
  doc["elementFromPoint"] = () => target;

  act(() => {
    window.dispatchEvent(
      new MouseEvent("pointermove", {
        bubbles: true,
        clientX: 300,
        clientY: 200,
      }),
    );
  });
  act(() => {
    window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
  });

  Reflect.deleteProperty(doc, "elementFromPoint");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("moving a candidate between columns", () => {
  it("does not update a parent's state during render", () => {
    /* The whole point of the fix. A caller that keeps the board in state is
       the ordinary case — the screen re-renders with the card in its new
       column — and it is exactly the caller the old code warned on. */
    const errors: unknown[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args) => errors.push(args[0]));

    function Holder() {
      const [cards, setCards] = useState([card("app-1", "sourced")]);
      return (
        <PipelineBoard
          cards={cards}
          activeStages={STAGES_SHOWN}
          onOpen={() => undefined}
          onMove={(id, to) =>
            setCards((current) =>
              current.map((c) => (c.id === id ? { ...c, stage: to } : c)),
            )
          }
        />
      );
    }

    render(<Holder />);
    dragTo("Adaeze Okonkwo", "interview");

    expect(
      errors.filter((e) => String(e).includes("while rendering a different")),
    ).toEqual([]);
    spy.mockRestore();
  });

  it("moves the card to the column it was released over", () => {
    const onMove = vi.fn();
    render(
      <PipelineBoard
        cards={[card("app-1", "sourced")]}
        activeStages={STAGES_SHOWN}
        onOpen={() => undefined}
        onMove={onMove}
      />,
    );

    dragTo("Adaeze Okonkwo", "shortlisted");
    expect(onMove).toHaveBeenCalledWith("app-1", "shortlisted");
  });

  it("refuses a drop back into the column the card is already in", () => {
    /* Not because the write would be harmful — `onMove` to the same stage is a
       no-op — but because a column that lights up and then does nothing
       teaches somebody the drop failed. `canDrop` says no, so it never lights. */
    const onMove = vi.fn();
    render(
      <PipelineBoard
        cards={[card("app-1", "sourced")]}
        activeStages={STAGES_SHOWN}
        onOpen={() => undefined}
        onMove={onMove}
      />,
    );

    dragTo("Adaeze Okonkwo", "sourced");
    expect(onMove).not.toHaveBeenCalled();
  });

  it("does nothing when released over nothing droppable", () => {
    const onMove = vi.fn();
    render(
      <PipelineBoard
        cards={[card("app-1", "sourced")]}
        activeStages={STAGES_SHOWN}
        onOpen={() => undefined}
        onMove={onMove}
      />,
    );

    dragTo("Adaeze Okonkwo", null);
    expect(onMove).not.toHaveBeenCalled();
  });

  it("lifts the card while it is in the hand, and puts it down after", () => {
    /* The feel, asserted by class rather than by pixel.
       ------------------------------------------------------------------
       `.ahr-sortable-lifted > *` in `globals.css` is what applies the scale,
       the tilt and the shadow — and the reduced-motion outline that replaces
       them. Everything else in this file would pass with a typo in that class
       name, or with the class on the wrong element: the CSS styles the *child*
       of the lifted node, so the wrapper has to carry it and the article has to
       be inside. That is the one thing here jsdom can actually check. */
    render(
      <PipelineBoard
        cards={[card("app-1", "sourced")]}
        activeStages={STAGES_SHOWN}
        onOpen={() => undefined}
        onMove={() => undefined}
      />,
    );

    const grip = screen.getByLabelText(/^Move Adaeze Okonkwo\./);
    const wrapper = grip.closest(".ahr-sortable-row");
    if (!wrapper) throw new Error("the card is not wrapped for the settle");

    expect(wrapper.classList.contains("ahr-sortable-lifted")).toBe(false);
    /* The class styles `> *`, so the article must be the wrapper's child. */
    expect(wrapper.firstElementChild?.tagName).toBe("ARTICLE");

    (
      grip as HTMLElement & { setPointerCapture: () => void }
    ).setPointerCapture = () => undefined;
    act(() => {
      grip.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });
    expect(wrapper.classList.contains("ahr-sortable-lifted")).toBe(true);

    act(() => {
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    /* Put down. The settle itself is a CSS transition on the same node, which
       is why the class comes off rather than the element being replaced. */
    expect(wrapper.classList.contains("ahr-sortable-lifted")).toBe(false);
  });

  it("opens the card from the grip by keyboard, so the handle is not a dead control", () => {
    /* The grip starts a drag with a pointer and opens the card with Enter,
       which is where the explicit Advance action lives. A handle that did
       nothing on Enter would look operable and not be. */
    const onOpen = vi.fn();
    render(
      <PipelineBoard
        cards={[card("app-1", "sourced")]}
        activeStages={STAGES_SHOWN}
        onOpen={onOpen}
        onMove={() => undefined}
      />,
    );

    screen.getByLabelText(/^Move Adaeze Okonkwo\./).click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
