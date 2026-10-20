"use client";

import { useMemo } from "react";
import type { ApiError } from "@/lib/api/client";
import { useSession } from "@/lib/store/session";
import { useLoaded } from "@/lib/use-loaded";
import { apiGateway } from "./api-gateway";
import { usage } from "./demo-ops";
import { demoGateway } from "./demo-gateway";
import { useDemoBook } from "./demo-store";
import type { PipelineGateway } from "./gateway";
import type { PipelineTemplate, RejectionReason, Tag } from "./model";

/**
 * Which side the pipeline screens are talking to, and the company's own lists.
 *
 * `usePipelineGateway` is the one place a screen learns whether it is connected.
 * Everything else — the board, the bulk bar, the settings pages — takes the
 * gateway and never asks.
 */

export function usePipelineGateway(): PipelineGateway {
  const { isConnected } = useSession();
  return isConnected ? apiGateway : demoGateway;
}

type List<T> = {
  items: T[];
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

const NOTHING = () => undefined;

export function useTags(): List<Tag> {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const loaded = useLoaded<Tag[]>("tags", isConnected, (signal) =>
    apiGateway.tags.list(signal),
  );
  const demo = useMemo(() => {
    const counts = usage(book).tags;
    return book.tags.map((tag) => ({ ...tag, uses: counts[tag.id] ?? 0 }));
  }, [book]);

  if (!isConnected) {
    return { items: demo, loading: false, error: null, reload: NOTHING };
  }
  return {
    items: loaded.data ?? [],
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
  };
}

export function useRejectionReasons(): List<RejectionReason> {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const loaded = useLoaded<RejectionReason[]>(
    "reasons",
    isConnected,
    (signal) => apiGateway.reasons.list(signal),
  );
  const demo = useMemo(() => {
    const counts = usage(book).reasons;
    return book.reasons.map((reason) => ({
      ...reason,
      uses: counts[reason.id] ?? 0,
    }));
  }, [book]);

  if (!isConnected) {
    return { items: demo, loading: false, error: null, reload: NOTHING };
  }
  return {
    items: loaded.data ?? [],
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
  };
}

export function useTemplates(): List<PipelineTemplate> {
  const { isConnected } = useSession();
  const book = useDemoBook();
  const loaded = useLoaded<PipelineTemplate[]>(
    "templates",
    isConnected,
    (signal) => apiGateway.templates.list(signal),
  );

  if (!isConnected) {
    return {
      items: book.templates,
      loading: false,
      error: null,
      reload: NOTHING,
    };
  }
  return {
    items: loaded.data ?? [],
    loading: loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
  };
}
