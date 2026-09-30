import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ApiApplicationDetail,
  ApiCandidateDetail,
} from "@/lib/api/recruitment";

/**
 * The candidate page's transient "nothing here yet" flash, found while
 * verifying PR #344's recruitment followups against a real staging backend.
 *
 * `/hiring/candidates/[id]` accepts either an application id or a candidate
 * id, and `useRealPipelineApplication` tries the application read first,
 * falls back to the candidate one, and returns whichever application that
 * resolves to. `RealPipeline`/`RealScreening` call the hook's `reload` after
 * every mutation — an offer edit, a withdraw, a reschedule.
 *
 * `candidate-screen.tsx`'s loading guard only shows a skeleton while the
 * careers-page `record` is *also* unresolved
 * (`isConnected && real.loading && record === null`), and for anybody who
 * applied through the careers page and was screened in — the ordinary case —
 * `record` is already resolved by the time a mutation happens. So the guard
 * never fires, and the old hook nulled `application` out the instant a
 * reload's fetch started, which briefly unmounted `RealPipeline` and
 * `RealScreening` in favour of their "nobody has screened this person into a
 * role's pipeline yet" fallback — even though nothing had actually gone
 * missing, as a fresh page load (a genuinely new identity, no stale state to
 * keep) always proved.
 *
 * The fix keys the hook's stored state on identity (`id` + `candidateId`)
 * rather than on identity-plus-nonce, so a `reload()` against the same
 * identity keeps the last-resolved application on screen while the fresh
 * copy is in flight, instead of nulling it out mid-refetch.
 */

const getApplication = vi.fn();
const getCandidate = vi.fn();

vi.mock("@/lib/api/recruitment", () => ({
  recruitmentApi: {
    getApplication: (...args: unknown[]) => getApplication(...args),
    getCandidate: (...args: unknown[]) => getCandidate(...args),
  },
}));

vi.mock("@/lib/store/session", () => ({
  useSession: () => ({ isConnected: true, isLoading: false }),
}));

const { useRealPipelineApplication } = await import("@/lib/store/recruitment");

const application = (id: string) =>
  ({
    id,
    requisitionId: "req-1",
    outcome: "IN_PROGRESS",
    offer: null,
    interviews: [],
    candidate: { id: "cand-1", email: "a@example.com", phone: null },
  }) as unknown as ApiApplicationDetail;

const candidateWithOneApplication = () =>
  ({
    applications: [{ id: "app-1", outcome: "IN_PROGRESS" }],
  }) as unknown as ApiCandidateDetail;

beforeEach(() => {
  getApplication.mockReset();
  getCandidate.mockReset();
  /* `id` is a candidate id, not an application one — `getApplication(id)`
     404s, and only the fallback through `getCandidate` resolves anything,
     mirroring the candidateId-keyed URL the finding was reported against. */
  getApplication.mockImplementation((id: string) =>
    id === "app-1"
      ? Promise.resolve(application("app-1"))
      : Promise.reject(new Error("not an application id")),
  );
});

describe("reloading the same candidate", () => {
  it("keeps the resolved application on screen while the refetch is in flight", async () => {
    getCandidate.mockResolvedValueOnce(candidateWithOneApplication());

    const { result } = renderHook(() =>
      useRealPipelineApplication("cand-1", null),
    );

    await waitFor(() => expect(result.current.application).not.toBeNull());
    expect(result.current.application?.id).toBe("app-1");
    expect(result.current.loading).toBe(false);

    /* The second `getCandidate` call — the one `reload()` triggers — is held
       open, so the hook's state can be inspected mid-refetch. */
    let releaseReload: (() => void) | undefined;
    getCandidate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseReload = () => resolve(candidateWithOneApplication());
        }),
    );

    act(() => {
      result.current.reload();
    });

    /* This is the assertion that fails against the old, nonce-keyed state:
       it used to null `application` out the instant this refetch started. */
    expect(result.current.application).not.toBeNull();
    expect(result.current.application?.id).toBe("app-1");
    expect(result.current.loading).toBe(false);

    await act(async () => {
      releaseReload?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(getCandidate).toHaveBeenCalledTimes(2));
    expect(result.current.application?.id).toBe("app-1");
  });

  it("still shows a loading state on a genuine navigation to a different candidate", async () => {
    getCandidate.mockResolvedValue(candidateWithOneApplication());

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useRealPipelineApplication(id, null),
      { initialProps: { id: "cand-1" } },
    );

    await waitFor(() => expect(result.current.application).not.toBeNull());

    getApplication.mockImplementation((id: string) =>
      id === "app-2"
        ? Promise.resolve(application("app-2"))
        : Promise.reject(new Error("not an application id")),
    );
    getCandidate.mockResolvedValue({
      applications: [{ id: "app-2", outcome: "IN_PROGRESS" }],
    } as unknown as ApiCandidateDetail);

    rerender({ id: "cand-2" });

    /* A different identity has nothing to keep on screen, so this still
       shows a genuine loading state rather than the previous candidate's
       application. */
    expect(result.current.loading).toBe(true);
    expect(result.current.application).toBeNull();

    await waitFor(() => expect(result.current.application?.id).toBe("app-2"));
  });
});
