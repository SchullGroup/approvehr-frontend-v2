"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/client";
import {
  recruitmentApi,
  type ApiAnalytics,
  type ApiApplication,
  type ApiApplicationDetail,
  type ApiCandidate,
  type ApiInterview,
  type ApiInterviewDetail,
  type ApiOffer,
  type ApiRequisition,
  type ApiRequisitionDetail,
  type ApiStage,
  type ApplicationListParams,
  type CandidateListParams,
  type CreateOfferBody,
  type CreateRequisitionBody,
  type CreateStageBody,
  type InterviewListParams,
  type OfferListParams,
  type RequisitionListParams,
  type RescheduleInterviewBody,
  type ScheduleInterviewBody,
  type SubmitScorecardBody,
  type UpdateCandidateBody,
  type UpdateOfferBody,
  type UpdateRequisitionBody,
  type UpdateStageBody,
} from "@/lib/api/recruitment";
import { useSession } from "./session";
import { useRevalidation } from "@/lib/revalidate";

/**
 * The internal hiring pipeline — connected only.
 *
 * There is no local/demo store for any of this: the module never had a
 * connected backend before, so there is nothing to fall back to offline.
 * Every hook here says so plainly rather than inventing one, the same way
 * `useCycleReport`/`useAppraiserMap` refuse offline in performance rather
 * than rendering zeroed figures.
 */

function offlineError(action: string): ApiError {
  return new ApiError(0, "offline", `${action} needs the API. Start it and sign in again.`);
}

/* -------------------------------------------------------------- requisitions */

export type RequisitionListState = {
  requisitions: ApiRequisition[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useRequisitions(params: RequisitionListParams = {}): RequisitionListState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    requisitions: ApiRequisition[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ requisitions: [], total: 0, loading: isConnected, error: null });
  const key = JSON.stringify(params);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await recruitmentApi.listRequisitions(
        JSON.parse(key) as RequisitionListParams,
        controller.signal,
      );
      if (ticket !== latest.current) return;
      setState({ requisitions: page.data, total: page.meta.total, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
    }
  }, [isConnected, key]);

  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  if (!isConnected) {
    return { requisitions: [], total: 0, loading: false, error: null, connected: false, reload: () => {} };
  }
  return { ...state, connected: true, reload: load };
}

export type RequisitionDetailState = {
  requisition: ApiRequisitionDetail | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  notFound: boolean;
  reload: () => void;
};

export function useRequisitionDetail(id: string | undefined): RequisitionDetailState {
  const { isConnected, isLoading } = useSession();
  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    nonce: number;
    row: ApiRequisitionDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && !isLoading && Boolean(id);
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!active || !id) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const row = await recruitmentApi.getRequisition(id, controller.signal);
        if (!cancelled) setFetched({ id, nonce, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({ id, nonce, row: null, error: error instanceof ApiError ? error : null });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, nonce, active, revalidation]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    return { requisition: null, loading: false, error: null, connected: false, notFound: false, reload };
  }
  if (!id) {
    return { requisition: null, loading: false, error: null, connected: true, notFound: true, reload };
  }

  const matched = fetched !== null && fetched.id === id && fetched.nonce === nonce;
  const row = matched ? fetched.row : null;
  const error = matched ? fetched.error : null;

  return {
    requisition: row,
    loading: !matched,
    error,
    connected: true,
    notFound: error?.status === 404,
    reload,
  };
}

export function useRequisitionMutations() {
  const { isConnected } = useSession();

  const create = useCallback(
    async (body: CreateRequisitionBody) => {
      if (!isConnected) throw offlineError("Creating a requisition");
      return recruitmentApi.createRequisition(body);
    },
    [isConnected],
  );
  const update = useCallback(
    async (id: string, body: UpdateRequisitionBody) => {
      if (!isConnected) throw offlineError("Updating a requisition");
      return recruitmentApi.updateRequisition(id, body);
    },
    [isConnected],
  );
  const submit = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Submitting a requisition");
      return recruitmentApi.submitRequisition(id);
    },
    [isConnected],
  );
  const approve = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Approving a requisition");
      return recruitmentApi.approveRequisition(id);
    },
    [isConnected],
  );
  const hold = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Holding a requisition");
      return recruitmentApi.holdRequisition(id, reason);
    },
    [isConnected],
  );
  const reopen = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Reopening a requisition");
      return recruitmentApi.reopenRequisition(id);
    },
    [isConnected],
  );
  const fill = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Marking a requisition filled");
      return recruitmentApi.fillRequisition(id);
    },
    [isConnected],
  );
  const cancel = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Cancelling a requisition");
      return recruitmentApi.cancelRequisition(id, reason);
    },
    [isConnected],
  );

  return { create, update, submit, approve, hold, reopen, fill, cancel, connected: isConnected };
}

export type StageListState = {
  stages: ApiStage[];
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useStages(requisitionId: string | undefined): StageListState {
  const { isConnected } = useSession();
  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    nonce: number;
    rows: ApiStage[];
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && Boolean(requisitionId);
  useEffect(() => {
    if (!active || !requisitionId) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const rows = await recruitmentApi.listStages(requisitionId, controller.signal);
        if (!cancelled) setFetched({ id: requisitionId, nonce, rows, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({ id: requisitionId, nonce, rows: [], error: error instanceof ApiError ? error : null });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, requisitionId, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected || !requisitionId) {
    return { stages: [], loading: false, error: null, connected: isConnected, reload };
  }
  const matched = fetched !== null && fetched.id === requisitionId && fetched.nonce === nonce;
  return {
    stages: matched ? fetched.rows : [],
    loading: !matched,
    error: matched ? fetched.error : null,
    connected: true,
    reload,
  };
}

export function useStageMutations() {
  const { isConnected } = useSession();

  const create = useCallback(
    async (requisitionId: string, body: CreateStageBody) => {
      if (!isConnected) throw offlineError("Adding a stage");
      return recruitmentApi.createStage(requisitionId, body);
    },
    [isConnected],
  );
  const update = useCallback(
    async (requisitionId: string, stageId: string, body: UpdateStageBody) => {
      if (!isConnected) throw offlineError("Updating a stage");
      return recruitmentApi.updateStage(requisitionId, stageId, body);
    },
    [isConnected],
  );
  const remove = useCallback(
    async (requisitionId: string, stageId: string) => {
      if (!isConnected) throw offlineError("Removing a stage");
      return recruitmentApi.deleteStage(requisitionId, stageId);
    },
    [isConnected],
  );
  const reorder = useCallback(
    async (requisitionId: string, stageIds: string[]) => {
      if (!isConnected) throw offlineError("Reordering stages");
      return recruitmentApi.reorderStages(requisitionId, stageIds);
    },
    [isConnected],
  );

  return { create, update, remove, reorder, connected: isConnected };
}

/* --------------------------------------------------------------- applications */

export type ApplicationListState = {
  applications: ApiApplication[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useApplicationsForRequisition(
  requisitionId: string | undefined,
  params: ApplicationListParams = {},
): ApplicationListState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    applications: ApiApplication[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ applications: [], total: 0, loading: isConnected, error: null });
  const key = JSON.stringify(params);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected || !requisitionId) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await recruitmentApi.listApplications(
        requisitionId,
        JSON.parse(key) as ApplicationListParams,
        controller.signal,
      );
      if (ticket !== latest.current) return;
      setState({ applications: page.data, total: page.meta.total, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
    }
  }, [isConnected, requisitionId, key]);

  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  if (!isConnected || !requisitionId) {
    return { applications: [], total: 0, loading: false, error: null, connected: isConnected, reload: () => {} };
  }
  return { ...state, connected: true, reload: load };
}

export type ApplicationDetailState = {
  application: ApiApplicationDetail | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  notFound: boolean;
  reload: () => void;
};

export function useApplicationDetail(id: string | undefined): ApplicationDetailState {
  const { isConnected, isLoading } = useSession();
  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    nonce: number;
    row: ApiApplicationDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && !isLoading && Boolean(id);
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!active || !id) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const row = await recruitmentApi.getApplication(id, controller.signal);
        if (!cancelled) setFetched({ id, nonce, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({ id, nonce, row: null, error: error instanceof ApiError ? error : null });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, nonce, active, revalidation]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    return { application: null, loading: false, error: null, connected: false, notFound: false, reload };
  }
  if (!id) {
    return { application: null, loading: false, error: null, connected: true, notFound: true, reload };
  }

  const matched = fetched !== null && fetched.id === id && fetched.nonce === nonce;
  const row = matched ? fetched.row : null;
  const error = matched ? fetched.error : null;

  return {
    application: row,
    loading: !matched,
    error,
    connected: true,
    notFound: error?.status === 404,
    reload,
  };
}

export function useApplicationMutations() {
  const { isConnected } = useSession();

  const move = useCallback(
    async (id: string, stageId: string) => {
      if (!isConnected) throw offlineError("Moving a candidate");
      return recruitmentApi.moveApplication(id, stageId);
    },
    [isConnected],
  );
  const reject = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Rejecting a candidate");
      return recruitmentApi.rejectApplication(id, reason);
    },
    [isConnected],
  );
  const withdraw = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Withdrawing an application");
      return recruitmentApi.withdrawApplication(id, reason);
    },
    [isConnected],
  );

  return { move, reject, withdraw, connected: isConnected };
}

export function useCandidateMutations() {
  const { isConnected } = useSession();
  const update = useCallback(
    async (id: string, body: UpdateCandidateBody) => {
      if (!isConnected) throw offlineError("Updating a candidate");
      return recruitmentApi.updateCandidate(id, body);
    },
    [isConnected],
  );
  return { update, connected: isConnected };
}

export function useCandidates(params: CandidateListParams = {}) {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    candidates: ApiCandidate[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ candidates: [], total: 0, loading: isConnected, error: null });
  const key = JSON.stringify(params);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await recruitmentApi.listCandidates(
        JSON.parse(key) as CandidateListParams,
        controller.signal,
      );
      if (ticket !== latest.current) return;
      setState({ candidates: page.data, total: page.meta.total, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
    }
  }, [isConnected, key]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isConnected) {
    return { candidates: [], total: 0, loading: false, error: null, connected: false, reload: () => {} };
  }
  return { ...state, connected: true, reload: load };
}

/* ------------------------------------------------------------------ interviews */

export type InterviewListState = {
  interviews: ApiInterview[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useInterviews(params: InterviewListParams = {}): InterviewListState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    interviews: ApiInterview[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ interviews: [], total: 0, loading: isConnected, error: null });
  const key = JSON.stringify(params);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await recruitmentApi.listInterviews(
        JSON.parse(key) as InterviewListParams,
        controller.signal,
      );
      if (ticket !== latest.current) return;
      setState({ interviews: page.data, total: page.meta.total, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
    }
  }, [isConnected, key]);

  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  if (!isConnected) {
    return { interviews: [], total: 0, loading: false, error: null, connected: false, reload: () => {} };
  }
  return { ...state, connected: true, reload: load };
}

export type InterviewDetailState = {
  interview: ApiInterviewDetail | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useInterviewDetail(id: string | undefined): InterviewDetailState {
  const { isConnected, isLoading } = useSession();
  const [nonce, setNonce] = useState(0);
  const [fetched, setFetched] = useState<{
    id: string;
    nonce: number;
    row: ApiInterviewDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && !isLoading && Boolean(id);
  const revalidation = useRevalidation();

  useEffect(() => {
    if (!active || !id) return;
    const controller = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const row = await recruitmentApi.getInterview(id, controller.signal);
        if (!cancelled) setFetched({ id, nonce, row, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setFetched({ id, nonce, row: null, error: error instanceof ApiError ? error : null });
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, nonce, active, revalidation]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected || !id) {
    return { interview: null, loading: false, error: null, connected: isConnected, reload };
  }
  const matched = fetched !== null && fetched.id === id && fetched.nonce === nonce;
  return {
    interview: matched ? fetched.row : null,
    loading: !matched,
    error: matched ? fetched.error : null,
    connected: true,
    reload,
  };
}

export function useInterviewMutations() {
  const { isConnected } = useSession();

  const schedule = useCallback(
    async (applicationId: string, body: ScheduleInterviewBody) => {
      if (!isConnected) throw offlineError("Scheduling an interview");
      return recruitmentApi.scheduleInterview(applicationId, body);
    },
    [isConnected],
  );
  const reschedule = useCallback(
    async (id: string, body: RescheduleInterviewBody) => {
      if (!isConnected) throw offlineError("Rescheduling an interview");
      return recruitmentApi.rescheduleInterview(id, body);
    },
    [isConnected],
  );
  const cancel = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Cancelling an interview");
      return recruitmentApi.cancelInterview(id);
    },
    [isConnected],
  );
  const complete = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Marking an interview complete");
      return recruitmentApi.completeInterview(id);
    },
    [isConnected],
  );
  const noShow = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Recording a no-show");
      return recruitmentApi.noShowInterview(id);
    },
    [isConnected],
  );
  const submitScorecard = useCallback(
    async (interviewId: string, body: SubmitScorecardBody) => {
      if (!isConnected) throw offlineError("Submitting a scorecard");
      return recruitmentApi.submitScorecard(interviewId, body);
    },
    [isConnected],
  );

  return { schedule, reschedule, cancel, complete, noShow, submitScorecard, connected: isConnected };
}

/* ---------------------------------------------------------------------- offers */

export type OfferListState = {
  offers: ApiOffer[];
  total: number;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

export function useOffers(params: OfferListParams = {}): OfferListState {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    offers: ApiOffer[];
    total: number;
    loading: boolean;
    error: ApiError | null;
  }>({ offers: [], total: 0, loading: isConnected, error: null });
  const key = JSON.stringify(params);
  const latest = useRef(0);

  const load = useCallback(async () => {
    if (!isConnected) return;
    const ticket = ++latest.current;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const page = await recruitmentApi.listOffers(
        JSON.parse(key) as OfferListParams,
        controller.signal,
      );
      if (ticket !== latest.current) return;
      setState({ offers: page.data, total: page.meta.total, loading: false, error: null });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (ticket !== latest.current) return;
      setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
    }
  }, [isConnected, key]);

  const revalidation = useRevalidation();
  useEffect(() => {
    void load();
  }, [load, revalidation]);

  if (!isConnected) {
    return { offers: [], total: 0, loading: false, error: null, connected: false, reload: () => {} };
  }
  return { ...state, connected: true, reload: load };
}

export function useOfferMutations() {
  const { isConnected } = useSession();

  const create = useCallback(
    async (applicationId: string, body: CreateOfferBody) => {
      if (!isConnected) throw offlineError("Creating an offer");
      return recruitmentApi.createOffer(applicationId, body);
    },
    [isConnected],
  );
  const update = useCallback(
    async (id: string, body: UpdateOfferBody) => {
      if (!isConnected) throw offlineError("Updating an offer");
      return recruitmentApi.updateOffer(id, body);
    },
    [isConnected],
  );
  const submit = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Submitting an offer");
      return recruitmentApi.submitOffer(id);
    },
    [isConnected],
  );
  const approve = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Approving an offer");
      return recruitmentApi.approveOffer(id);
    },
    [isConnected],
  );
  const send = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Sending an offer");
      return recruitmentApi.sendOffer(id);
    },
    [isConnected],
  );
  const accept = useCallback(
    async (id: string) => {
      if (!isConnected) throw offlineError("Accepting an offer");
      return recruitmentApi.acceptOffer(id);
    },
    [isConnected],
  );
  const decline = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Declining an offer");
      return recruitmentApi.declineOffer(id, reason);
    },
    [isConnected],
  );
  const withdraw = useCallback(
    async (id: string, reason?: string) => {
      if (!isConnected) throw offlineError("Withdrawing an offer");
      return recruitmentApi.withdrawOffer(id, reason);
    },
    [isConnected],
  );
  const redo = useCallback(
    async (id: string, body: CreateOfferBody) => {
      if (!isConnected) throw offlineError("Redoing an offer");
      return recruitmentApi.redoOffer(id, body);
    },
    [isConnected],
  );

  return { create, update, submit, approve, send, accept, decline, withdraw, redo, connected: isConnected };
}

/* ------------------------------------------------------------------- analytics */

export function useRecruitmentAnalytics() {
  const { isConnected } = useSession();
  const [state, setState] = useState<{
    analytics: ApiAnalytics | null;
    loading: boolean;
    error: ApiError | null;
  }>({ analytics: null, loading: isConnected, error: null });

  const revalidation = useRevalidation();
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    void (async () => {
      try {
        const analytics = await recruitmentApi.analytics(controller.signal);
        if (!cancelled) setState({ analytics, loading: false, error: null });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: error instanceof ApiError ? error : null }));
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isConnected, revalidation]);

  if (!isConnected) {
    return { analytics: null, loading: false, error: null, connected: false };
  }
  return { ...state, connected: true };
}

/* ---------------------------------------------------- resolving a candidate id */

export type RealPipelineState = {
  application: ApiApplicationDetail | null;
  loading: boolean;
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
};

/**
 * Resolves an id that might be a real pipeline `Application` id directly (the
 * connected board links these), or a careers `candidateId` to look an active
 * pipeline application up through (every other entry point only has that).
 *
 * `Candidate.applications` can hold more than one — a person can apply to
 * more than one role — so this picks the one still in progress, or the most
 * recent otherwise, rather than guessing further.
 */
export function useRealPipelineApplication(
  id: string | undefined,
  candidateId: string | null | undefined,
): RealPipelineState {
  const { isConnected, isLoading } = useSession();
  const [state, setState] = useState<{
    key: string;
    application: ApiApplicationDetail | null;
    error: ApiError | null;
  } | null>(null);

  const active = isConnected && !isLoading && (Boolean(id) || Boolean(candidateId));
  const [nonce, setNonce] = useState(0);
  const key = `${id ?? ""}:${candidateId ?? ""}:${nonce}`;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      let application: ApiApplicationDetail | null = null;
      let failure: ApiError | null = null;
      try {
        if (id) {
          try {
            application = await recruitmentApi.getApplication(id, controller.signal);
          } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") throw error;
            application = null;
          }
        }
        if (!application && candidateId) {
          const candidate = await recruitmentApi.getCandidate(candidateId, controller.signal);
          const best =
            candidate.applications.find((a) => a.outcome === "IN_PROGRESS") ??
            candidate.applications[0];
          if (best) application = await recruitmentApi.getApplication(best.id, controller.signal);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        failure = error instanceof ApiError ? error : null;
      }
      if (!cancelled) setState({ key, application, error: failure });
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [active, id, candidateId, key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  if (!isConnected) {
    return { application: null, loading: false, error: null, connected: false, reload };
  }
  const matched = state !== null && state.key === key;
  return {
    application: matched ? state.application : null,
    loading: !matched,
    error: matched ? state.error : null,
    connected: true,
    reload,
  };
}

export type { ApiStage };
