import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

/**
 * A browser that holds the demo's previous book opens the new build cleanly.
 *
 * The book is stored with a version. The finished tasks that span the review
 * periods, and the links on them, arrived with version 3, so a version 2 book is
 * dropped and the sample is built again: no crash, no half book, and nothing of
 * the old one left to show.
 */

const KEY = "approvehr.projects.book";
const TODAY = "2026-11-06";

const { useDemoBook } = await import("@/lib/store/projects");

beforeEach(() => window.localStorage.clear());

describe("the demo book", () => {
  it("drops a version 2 book and builds the new sample", async () => {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({
        v: 2,
        data: {
          anchor: TODAY,
          projects: {
            "pj-old": {
              project: {
                id: "pj-old",
                key: "OLD",
                name: "A made-up old project",
              },
              issues: [{ id: "x", key: "OLD-1", title: "A made-up old task" }],
              sprints: [],
            },
          },
          comments: {},
          activity: {},
          counters: {},
          programs: {},
          programAccess: {},
        },
      }),
    );
    const { result } = renderHook(() => useDemoBook(true, TODAY));
    await waitFor(() =>
      expect(result.current.projects["pj-mob"]).toBeDefined(),
    );
    expect(result.current.projects["pj-old"]).toBeUndefined();
    expect(JSON.stringify(result.current)).not.toContain("A made-up old");
    expect(JSON.parse(window.localStorage.getItem(KEY)!).v).toBe(3);
  });

  it("builds the finished, linked and unlinked work the screens are shown with", async () => {
    const { result } = renderHook(() => useDemoBook(true, TODAY));
    await waitFor(() =>
      expect(result.current.projects["pj-mob"]).toBeDefined(),
    );
    const issues = Object.values(result.current.projects).flatMap(
      (d) => d.issues,
    );
    const finished = issues.filter((i) => i.doneAt);
    expect(finished.some((i) => i.goalId)).toBe(true);
    expect(finished.some((i) => !i.goalId)).toBe(true);
    expect(finished.some((i) => i.keyResultId)).toBe(true);
    expect(finished.some((i) => i.doneAt!.startsWith("2026-0"))).toBe(true);
    expect(finished.some((i) => i.doneAt!.startsWith("2025-"))).toBe(true);
  });

  it("starts again from a book that is not JSON, rather than crashing", async () => {
    window.localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useDemoBook(true, TODAY));
    await waitFor(() =>
      expect(result.current.projects["pj-mob"]).toBeDefined(),
    );
  });
});
