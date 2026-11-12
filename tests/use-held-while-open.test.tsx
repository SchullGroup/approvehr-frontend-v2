import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useHeldWhileOpen } from "@/lib/use-held-while-open";

/**
 * A list that is open is never rearranged under somebody's pointer.
 *
 * What is proved: until something is held the live value is shown, so a list nobody has touched
 * follows the answer as it arrives; once held, exactly what was live at that moment is shown, however
 * the live value moves after; it is let go by a release (blur, a choice) and, where the caller has its
 * own notion of done, by `active` turning false; a held `null` is a snapshot and not "nothing held",
 * which is the case that matters (a list reached for before its answer arrived); `hold` does not
 * re-take a snapshot that is already held, and `press` always does, so a list opened, dismissed and
 * opened again shows what has arrived since.
 */

const mount = (initial: string | null, active = true) =>
  renderHook(
    (props: { live: string | null; active: boolean }) =>
      useHeldWhileOpen(props.live, props.active),
    { initialProps: { live: initial, active } },
  );

describe("while nothing is held", () => {
  it("shows the live value, and follows it", () => {
    const { result, rerender } = mount("a");
    expect(result.current.shown).toBe("a");
    expect(result.current.holding).toBe(false);
    rerender({ live: "b", active: true });
    expect(result.current.shown).toBe("b");
  });
});

describe("once held", () => {
  it("shows what was live at that moment, however the live value moves after", () => {
    const { result, rerender } = mount("a");
    act(() => result.current.hold());
    expect(result.current.holding).toBe(true);
    rerender({ live: "b", active: true });
    rerender({ live: "c", active: true });
    expect(result.current.shown).toBe("a");
  });

  it("holds a snapshot that is itself null, and does not mistake it for nothing held", () => {
    const { result, rerender } = mount(null);
    act(() => result.current.hold());
    expect(result.current.holding).toBe(true);
    /* The answer arrives while the list is open: it is not applied. */
    rerender({ live: "late", active: true });
    expect(result.current.shown).toBeNull();
  });

  it("is let go by a release, and then follows the live value again", () => {
    const { result, rerender } = mount(null);
    act(() => result.current.hold());
    rerender({ live: "late", active: true });
    act(() => result.current.release());
    expect(result.current.holding).toBe(false);
    expect(result.current.shown).toBe("late");
  });

  it("is let go when the caller says it is no longer active, and holds again once it is", () => {
    const { result, rerender } = mount(null, true);
    act(() => result.current.hold());
    rerender({ live: "late", active: true });
    expect(result.current.shown).toBeNull();
    rerender({ live: "late", active: false });
    expect(result.current.shown).toBe("late");
    expect(result.current.holding).toBe(false);
    /* Opened again: a new snapshot, of what is there now. */
    rerender({ live: "late", active: true });
    act(() => result.current.hold());
    rerender({ live: "later", active: true });
    expect(result.current.shown).toBe("late");
  });

  it("does nothing when released with nothing held", () => {
    const { result } = mount("a");
    act(() => result.current.release());
    expect(result.current.shown).toBe("a");
    expect(result.current.holding).toBe(false);
  });
});

describe("hold and press", () => {
  it("hold keeps the snapshot it already has: arrowing through a list does not re-take it", () => {
    const { result, rerender } = mount("a");
    act(() => result.current.hold());
    rerender({ live: "b", active: true });
    act(() => result.current.hold());
    expect(result.current.shown).toBe("a");
  });

  it("press always takes a new one: a list opened, dismissed and opened again shows what has arrived", () => {
    const { result, rerender } = mount(null);
    act(() => result.current.press());
    rerender({ live: "arrived", active: true });
    /* Escape leaves the focus where it was, so nothing was released: still the first snapshot. */
    expect(result.current.shown).toBeNull();
    act(() => result.current.press());
    expect(result.current.shown).toBe("arrived");
    expect(result.current.holding).toBe(true);
  });
});
