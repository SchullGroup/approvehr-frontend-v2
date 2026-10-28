import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHeld } from "@/lib/use-held";

/**
 * The last complete answer, kept on screen while the next one is read.
 *
 * `useFetched` blanks its data when it is asked again, and a list with a form in it
 * loses the form with the blank. What this has to get right is small and easy to
 * break quietly: hold exactly while the next answer is not ready, follow the live
 * one exactly when it is, and never render for ever over a value that is rebuilt on
 * every render.
 */

type Props = { live: unknown; ready: boolean };

const run = (initial: Props, same?: (a: unknown, b: unknown) => boolean) =>
  renderHook(({ live, ready }: Props) => useHeld(live, ready, same), {
    initialProps: initial,
  });

describe("useHeld", () => {
  it("is what it was given while that is ready", () => {
    const view = run({ live: "first", ready: true });
    expect(view.result.current).toBe("first");
    view.rerender({ live: "second", ready: true });
    expect(view.result.current).toBe("second");
  });

  it("keeps the last ready value while the next is not ready, however empty what it is given looks", () => {
    const view = run({ live: ["a", "b"], ready: true });
    const kept = view.result.current;

    view.rerender({ live: [], ready: false });
    expect(view.result.current).toBe(kept);
    expect(view.result.current).toEqual(["a", "b"]);

    view.rerender({ live: [], ready: false });
    expect(view.result.current).toBe(kept);
  });

  it("follows the new answer the moment it is ready", () => {
    const view = run({ live: ["a"], ready: true });
    view.rerender({ live: [], ready: false });
    view.rerender({ live: ["a", "c"], ready: true });
    expect(view.result.current).toEqual(["a", "c"]);
  });

  it("keeps the newest ready value, not the first, across several reads", () => {
    const view = run({ live: 1, ready: true });
    view.rerender({ live: 2, ready: true });
    view.rerender({ live: 0, ready: false });
    expect(view.result.current).toBe(2);
  });

  it("has nothing to hold before the first answer, and shows what it was given", () => {
    const view = run({ live: [], ready: false });
    expect(view.result.current).toEqual([]);
  });

  it("settles over a value rebuilt on every render when told how to compare it", () => {
    /* Identity can never match a fresh object, so a comparison that looks inside
       is what stops the update during render from running for ever. */
    const same = (a: unknown, b: unknown) =>
      JSON.stringify(a) === JSON.stringify(b);
    const view = run({ live: { rows: [1, 2] }, ready: true }, same);

    view.rerender({ live: { rows: [1, 2] }, ready: true });
    view.rerender({ live: { rows: [1, 2] }, ready: true });
    expect(view.result.current).toEqual({ rows: [1, 2] });

    view.rerender({ live: { rows: [] }, ready: false });
    expect(view.result.current).toEqual({ rows: [1, 2] });
  });

  it("holds a function as a value and does not call it", () => {
    const first = () => "first";
    const second = () => "second";
    const view = run({ live: first, ready: true });
    view.rerender({ live: second, ready: false });
    expect(view.result.current).toBe(first);
  });
});
