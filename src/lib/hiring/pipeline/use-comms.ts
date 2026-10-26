"use client";

import { useMemo, useState } from "react";
import type { ApiError } from "@/lib/api/client";
import type {
  EmailCatalog,
  EmailReadiness,
  MyAccess,
  RetentionReport,
  StageSetting,
} from "@/lib/hiring/comms/model";
import { useLoaded } from "@/lib/use-loaded";
import type { PipelineGateway } from "./gateway";
import { usePipelineGateway } from "./use-pipeline";

/**
 * The email, panel, panelist and retention reads, through whichever gateway is in
 * use.
 *
 * Each is asked of the gateway, never of a mode: a screen cannot tell whether it is
 * talking to the API or to the browser's own book. A write is followed by
 * `reload()`, which is all it takes to see what the write did.
 */

export type Data<T> = {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
};

function useGateway<T>(
  what: string,
  load: (gateway: PipelineGateway, signal: AbortSignal) => Promise<T>,
  enabled = true,
): Data<T> {
  const gateway = usePipelineGateway();
  const key = `${what}:${gateway.mode}`;
  const loaded = useLoaded<T>(key, enabled, (signal) => load(gateway, signal));

  /* The last answer for this key stays on screen while the next is fetched, so a
     write followed by `reload()` refreshes the list in place instead of replacing it
     with a skeleton and putting it back. Derived while rendering, not in an effect,
     so there is no frame that shows the old key's answer under the new one. */
  const [kept, setKept] = useState<{ key: string; data: T } | null>(null);
  if (
    loaded.data !== null &&
    (kept === null || kept.key !== key || kept.data !== loaded.data)
  ) {
    setKept({ key, data: loaded.data });
  }
  const data =
    loaded.data ?? (kept !== null && kept.key === key ? kept.data : null);

  return {
    data,
    loading: data === null && loaded.loading,
    error: loaded.error,
    reload: loaded.reload,
  };
}

export const useEmailCatalog = (): Data<EmailCatalog> =>
  useGateway("email-catalog", (gateway, signal) =>
    gateway.emails.catalog(signal),
  );

export const useEmailReadiness = (enabled = true): Data<EmailReadiness> =>
  useGateway(
    "email-readiness",
    (gateway, signal) => gateway.emails.readiness(signal),
    enabled,
  );

export const useStageSettings = (
  requisitionId: string,
  enabled = true,
): Data<StageSetting[]> =>
  useGateway(
    `stage-settings:${requisitionId}`,
    (gateway, signal) => gateway.stages.list(requisitionId, signal),
    enabled,
  );

export const useRetention = (): Data<RetentionReport> =>
  useGateway("retention", (gateway, signal) =>
    gateway.retention.report(signal),
  );

export const useMyAccess = (): Data<MyAccess> =>
  useGateway("my-access", (gateway, signal) => gateway.mine.access(signal));

/** The message a stage sends, by the stage's id. */
export type StageMail = {
  templateId: string;
  name: string;
  kindLabel: string;
};

/**
 * Which stages of a role send a message when somebody is moved into them.
 *
 * Asked once for the screen, so a move can say "this will email them" **before**
 * it is made. While it is loading, or if it failed, nothing is known, and a move
 * made then sends nothing: not knowing is not a reason to email somebody.
 */
export function useStageMail(
  requisitionId: string,
  enabled = true,
): {
  /** Whether it is known which stages send a message. */
  known: boolean;
  byStage: ReadonlyMap<string, StageMail>;
  /** The stages as the settings read them, once they have loaded. */
  stages: StageSetting[] | null;
  /** The company's emails, once they have loaded. */
  catalog: EmailCatalog | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => void;
} {
  const stages = useStageSettings(requisitionId, enabled);
  const catalog = useGateway(
    "email-catalog",
    (gateway, signal) => gateway.emails.catalog(signal),
    enabled,
  );
  const byStage = useMemo(() => {
    const map = new Map<string, StageMail>();
    for (const stage of stages.data ?? []) {
      if (!stage.emailTemplateId) continue;
      const template = catalog.data?.templates.find(
        (t) => t.id === stage.emailTemplateId && !t.archived,
      );
      if (template)
        map.set(stage.stageId, {
          templateId: template.id,
          name: template.name,
          kindLabel: template.kindLabel,
        });
    }
    return map;
  }, [stages.data, catalog.data]);
  return {
    known: stages.data !== null && catalog.data !== null,
    byStage,
    stages: stages.data,
    catalog: catalog.data,
    loading: stages.loading || catalog.loading,
    error: stages.error ?? catalog.error,
    reload: () => {
      stages.reload();
      catalog.reload();
    },
  };
}
