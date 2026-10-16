"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import { usePagedList } from "@/lib/store/paged-list";
import { useDebounced } from "@/lib/use-debounced";
import { useLoaded } from "@/lib/use-loaded";
import type {
  AssessmentEntry,
  BelowCount,
  BelowFilters,
  BelowRow,
  Criteria,
  CriteriaPreview,
  CriteriaView,
  Explanation,
  PassMark,
  PassMarkCount,
  PassMarkInput,
  RescoreProgress,
  ScreeningSubject,
} from "./model";
import { NOT_RESCORING } from "./model";
import { useScreeningGateway } from "./use-gateway";

/**
 * The screening screens' reads, each keyed by what it is about.
 *
 * Every hook asks the gateway, so the same screen runs on the API and on the demo's
 * book. None of them sets state in an effect body: the answer arrives after an
 * `await`, keyed by the attempt it belongs to, so there is no window in which one
 * advert's criteria are shown under another's name.
 */

/** How often a running re-score is asked how far it has got. Kind to the rate limit. */
export const RESCORE_POLL_MS = 2500;

/* ----------------------------------------------------------------- criteria */

export function useCriteria(postingId: string) {
  const gateway = useScreeningGateway();
  const loaded = useLoaded<CriteriaView>(
    `criteria:${gateway.mode}:${postingId}`,
    true,
    (signal) => gateway.criteria.get(postingId, signal),
  );
  /* What was just saved, shown until the re-read of it arrives, so the editor
     never flashes the version from a moment ago and reads as unsaved. */
  const [justSaved, setJustSaved] = useState<{
    view: CriteriaView;
    until: number;
  } | null>(null);

  const view =
    justSaved && loaded.settled < justSaved.until
      ? justSaved.view
      : loaded.data;

  const save = useCallback(
    async (criteria: Criteria, baseVersion: number | null) => {
      const next = await gateway.criteria.save(
        postingId,
        criteria,
        baseVersion,
      );
      setJustSaved({ view: next, until: loaded.nextAttempt() });
      loaded.reload();
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateway, postingId, loaded.reload, loaded.nextAttempt],
  );

  return {
    view,
    loading: loaded.loading && view === null,
    error: loaded.error,
    reload: loaded.reload,
    save,
  };
}

/** Words to put in chips. Asked on request, never on its own. */
export function useSuggest(postingId: string) {
  const gateway = useScreeningGateway();
  return useCallback(
    () => gateway.criteria.suggest(postingId, new AbortController().signal),
    [gateway, postingId],
  );
}

/** How a draft would score this advert's applicants, asked on request. */
export function usePreview(postingId: string) {
  const gateway = useScreeningGateway();
  const [state, setState] = useState<{
    status: "idle" | "loading" | "ready" | "failed";
    preview: CriteriaPreview | null;
    message: string | null;
    /** The draft it answers, to say when the draft has moved on. */
    asked: string;
  }>({ status: "idle", preview: null, message: null, asked: "" });
  const latest = useRef(0);

  const run = useCallback(
    async (criteria: Criteria, key: string) => {
      latest.current += 1;
      const mine = latest.current;
      setState((now) => ({ ...now, status: "loading", asked: key }));
      try {
        const preview = await gateway.criteria.preview(
          postingId,
          criteria,
          new AbortController().signal,
        );
        if (mine === latest.current)
          setState({ status: "ready", preview, message: null, asked: key });
      } catch (error) {
        if (mine === latest.current)
          setState({
            status: "failed",
            preview: null,
            message:
              error instanceof ApiError
                ? error.message
                : "The preview could not be made. Try again.",
            asked: key,
          });
      }
    },
    [gateway, postingId],
  );

  return { ...state, run };
}

/* ----------------------------------------------------------------- re-scoring */

/**
 * How far re-scoring has got, asked again while it runs.
 *
 * `watch()` starts asking: called after a save, or after a new pass mark. Once the
 * answer says it is not running, asking stops. `finished` counts the times it
 * went from running to done, so a list can refresh itself when the new scores are
 * in.
 */
export function useRescore(postingId: string) {
  const gateway = useScreeningGateway();
  const [progress, setProgress] = useState<RescoreProgress>(NOT_RESCORING);
  const [watching, setWatching] = useState(0);
  const [finished, setFinished] = useState(0);
  const was = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();

    async function tick() {
      try {
        const next = await gateway.rescore.progress(
          postingId,
          controller.signal,
        );
        if (cancelled) return;
        setProgress(next);
        if (next.running) {
          was.current = true;
          timer = setTimeout(() => void tick(), RESCORE_POLL_MS);
        } else if (was.current) {
          was.current = false;
          setFinished((n) => n + 1);
        }
      } catch {
        /* A missed answer is not worth a message: the next one will do. */
        if (!cancelled && was.current)
          timer = setTimeout(() => void tick(), RESCORE_POLL_MS * 2);
      }
    }
    void tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [gateway, postingId, watching]);

  const watch = useCallback(() => setWatching((n) => n + 1), []);
  const start = gateway.rescore.start;
  const restart = useMemo(
    () =>
      start
        ? async () => {
            await start(postingId);
            watch();
          }
        : null,
    [start, postingId, watch],
  );
  return { progress, finished, watch, restart };
}

/* ------------------------------------------------------------------ pass mark */

export function usePassMark(postingId: string) {
  const gateway = useScreeningGateway();
  const loaded = useLoaded<PassMark>(
    `passmark:${gateway.mode}:${postingId}`,
    true,
    (signal) => gateway.passMark.get(postingId, signal),
  );
  const save = useCallback(
    async (input: PassMarkInput) => {
      const next = await gateway.passMark.save(postingId, input);
      loaded.reload();
      return next;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateway, postingId, loaded.reload],
  );
  return {
    mark: loaded.data,
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
    save,
  };
}

/**
 * "412 of 4,210 would be below the pass mark", for what is typed right now.
 *
 * Asked once the typing pauses. `current` says whether the count in hand answers
 * what is in the boxes this moment: debouncing the request must not leave an old
 * number on the screen as though it were the new one.
 */
export function usePassMarkCount(postingId: string, input: PassMarkInput) {
  const gateway = useScreeningGateway();
  const live = JSON.stringify([input.fitMin, input.assessmentMin]);
  const settled = useDebounced(live, 500);
  const loaded = useLoaded<PassMarkCount>(
    `count:${gateway.mode}:${postingId}:${settled}`,
    true,
    (signal) => {
      const [fitMin, assessmentMin] = JSON.parse(settled) as [
        number | null,
        number | null,
      ];
      return gateway.passMark.count(
        postingId,
        { fitMin, assessmentMin },
        signal,
      );
    },
  );
  /* The last answer, kept while the next is on its way, so the number is dimmed
     under a new figure rather than vanishing and coming back. Derived while
     rendering: there is no frame showing something else. */
  const [last, setLast] = useState<PassMarkCount | null>(null);
  if (loaded.data && loaded.data !== last) setLast(loaded.data);
  return {
    count: loaded.data ?? last,
    loading: loaded.loading,
    error: loaded.error,
    /** The count answers what is in the boxes now. */
    current: settled === live && loaded.data !== null,
    reload: loaded.reload,
  };
}

/* ---------------------------------------------------------------- explanation */

export function useExplanation(subject: ScreeningSubject, enabled = true) {
  const gateway = useScreeningGateway();
  const loaded = useLoaded<Explanation>(
    `explain:${gateway.mode}:${subject.kind}:${subject.id}`,
    enabled,
    (signal) => gateway.explanation(subject, signal),
  );
  return {
    explanation: loaded.data,
    loading: enabled && loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
    canRetry: gateway.retryReading !== null,
    retry: useCallback(async () => {
      if (!gateway.retryReading) return;
      await gateway.retryReading(subject);
      loaded.reload();
    }, [gateway, subject.kind, subject.id, loaded.reload]), // eslint-disable-line react-hooks/exhaustive-deps
  };
}

export function useAssessmentHistory(
  subject: ScreeningSubject,
  enabled = true,
) {
  const gateway = useScreeningGateway();
  const loaded = useLoaded<AssessmentEntry[]>(
    `assessments:${gateway.mode}:${subject.kind}:${subject.id}`,
    enabled,
    (signal) => gateway.assessment.history(subject, signal),
  );
  const enter = useCallback(
    async (score: number, note: string | null) => {
      await gateway.assessment.enter(subject, score, note);
      loaded.reload();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateway, subject.kind, subject.id, loaded.reload],
  );
  return {
    entries: loaded.data ?? [],
    loading: enabled && loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
    enter,
  };
}

/* ----------------------------------------------------------- below the pass mark */

export const BELOW_PAGE_SIZE = 50;

export function useBelowList(postingId: string, filters: BelowFilters) {
  const gateway = useScreeningGateway();
  const key = JSON.stringify([gateway.mode, postingId, filters]);
  const fetchPage = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      const page = await gateway.below.list(
        { postingId, filters, cursor, pageSize: BELOW_PAGE_SIZE },
        signal,
      );
      return { rows: page.rows, total: page.total, next: page.next };
    },
    // `filters` is rebuilt by its caller; the key is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gateway, postingId, key],
  );
  return usePagedList<BelowRow>({
    key,
    fetchPage,
    idOf: (row) => row.id,
  });
}

export function useBelowCount(postingId: string) {
  const gateway = useScreeningGateway();
  const loaded = useLoaded<BelowCount>(
    `below-count:${gateway.mode}:${postingId}`,
    true,
    (signal) => gateway.below.count(postingId, signal),
  );
  return {
    count: loaded.data,
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
  };
}
