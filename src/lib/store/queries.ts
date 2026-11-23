"use client";

import { useCallback, useMemo, useState } from "react";
import {
  queriesApi,
  type ApiQueryDetail,
  type ApiQuerySettings,
  type CreateQueryBody,
  type IssueResult,
  type LetterBody,
  type QueryFileRole,
  type QueryOutcome,
  type QueryPage,
  type RegisterParams,
  type SettingsPatch,
} from "@/lib/api/queries";
import type {
  ApiQueryCounts,
  AskDocumentBody,
  CiteBody,
  TemplateBody,
  TemplateList,
} from "@/lib/api/query-ties";
import { useFeatureSettings } from "@/lib/store/features";
import { useFetched } from "@/lib/use-fetched";
import { useSession } from "./session";

/**
 * Queries.
 *
 * ## Demo mode has none, and a production build could not have one
 *
 * A query is a letter to a named person about their conduct, kept on the server. A copy in this
 * browser would be read by nobody and answered by nobody, and a seeded one would be an invented
 * allegation against an invented employee. So there is no local store here at all: every hook asks
 * the API, every write refuses without one, and the screens say so in the sentence below, the one
 * the other API-only screens use.
 *
 * ## Nothing is cached between screens
 *
 * Reads go through `useFetched` and not a shared resource. A shared resource keeps its answer for
 * the life of the tab, across mounts and across sign-ins, and a letter about somebody's conduct is
 * the last thing that should outlive the screen that showed it. A write's own answer is held for
 * the length of one screen instead (`useQueryDetail`'s `publish`), so a button press does not
 * flash a skeleton, and is dropped the moment a newer read arrives.
 */

export const DEMO_QUERY_HEADING = "Queries need the API";

export const DEMO_QUERY_REASON =
  "A query is a written letter to one person and their one written reply, kept on the server, " +
  "and a copy kept in this browser would reach nobody. There is no demo of it, because an " +
  "invented allegation against an invented employee would teach the wrong thing.";

/**
 * Whether the company has switched queries on, from the same read the sidebar uses.
 *
 * `known` is false while that read is on its way or has failed: a screen that decided "off" from a
 * default would flash a refusal at a company that has it on. The server is still the authority,
 * and every query route answers `module_off` while the switch is off.
 */
export function useQueriesSwitch(): {
  on: boolean;
  known: boolean;
  /** Whether the server told us (an API one deploy behind does not). */
  said: boolean;
  editable: boolean;
  error: unknown;
} {
  const features = useFeatureSettings();
  const known = !features.loading && features.error == null;
  return {
    on: features.flags.queries === true,
    known,
    said: features.queriesSaid,
    editable: features.editable,
    error: features.error,
  };
}

/** The register. Connected only, and only for somebody who works queries (the caller decides). */
export function useQueryRegister(params: RegisterParams, enabled = true) {
  const { isConnected } = useSession();
  const key = JSON.stringify(params);
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.register(params, signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the serialised `params`
    [key],
  );
  const result = useFetched<QueryPage>(
    `queries.register:${key}`,
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/**
 * A line manager's own drafts about their reports. Asked for only while `enabled`.
 *
 * **A 403 is the server saying the caller cannot draft** (no permission, or the company's setting
 * is off) and is an answer and not a failure: the screen shows the server's own sentence for it.
 */
export function useMyDrafts(enabled: boolean) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.myDrafts(signal),
    [],
  );
  const result = useFetched<QueryPage>(
    "queries.drafts",
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/**
 * The company's letter templates. `includeArchived` is honoured by the server only for somebody
 * who may manage settings. Works while the switch is off.
 */
export function useQueryTemplates(includeArchived: boolean, enabled = true) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.templates(includeArchived, signal),
    [includeArchived],
  );
  const result = useFetched<TemplateList>(
    `queries.templates:${includeArchived}`,
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/** Counts of queries served in a year: statuses and months, above a floor, and nothing else. */
export function useQueryCounts(year: number | undefined, enabled = true) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.counts(year, signal),
    [year],
  );
  const result = useFetched<ApiQueryCounts | null>(
    `queries.counts:${year ?? "now"}`,
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/** The caller's own issued queries. Nothing is asked for while `enabled` is false. */
export function useMyQueries(enabled: boolean) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.mine(signal),
    [],
  );
  const result = useFetched<QueryPage>(
    "queries.mine",
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/**
 * One query, as its reader may see it.
 *
 * `publish` takes the **server's own answer to a write** and shows it at once, with no loading
 * flash. It is dropped in render as soon as a newer read lands (`fetched` is a new object then),
 * so an answer can never outlive the read that supersedes it. Never publish anything but a
 * response.
 */
export function useQueryDetail(id: string) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.get(id, signal),
    [id],
  );
  const fetched = useFetched<ApiQueryDetail>(
    `queries.detail:${id}`,
    isConnected,
    load,
  );
  const [published, setPublished] = useState<{
    base: ApiQueryDetail | null;
    id: string;
    detail: ApiQueryDetail;
  } | null>(null);

  /* Shown only while it still sits on the read it was made over, and only for this query. */
  const current =
    published !== null && published.id === id && published.base === fetched.data
      ? published.detail
      : null;

  const publish = useCallback(
    (detail: ApiQueryDetail) =>
      setPublished({ base: fetched.data, id, detail }),
    [fetched.data, id],
  );

  return {
    detail: current ?? fetched.data,
    loading: fetched.loading,
    error: fetched.error,
    reload: fetched.reload,
    publish,
    unavailable: !isConnected,
  };
}

/** The company's rules around queries. Works while the switch is off. */
export function useQuerySettings(enabled = true) {
  const { isConnected } = useSession();
  const load = useCallback(
    (signal: AbortSignal) => queriesApi.settings(signal),
    [],
  );
  const result = useFetched<ApiQuerySettings | null>(
    "queries.settings",
    isConnected && enabled,
    load,
  );
  return { ...result, unavailable: !isConnected };
}

/**
 * Every write, each refusing without a server.
 *
 * Each returns the server's own answer and nothing else is kept: a screen publishes the detail it
 * is handed, and a toast says what was done, never what the letter is about.
 */
export function useQueryActions() {
  const { isConnected } = useSession();

  const guard = useCallback(() => {
    if (!isConnected)
      throw new Error(`${DEMO_QUERY_HEADING}. ${DEMO_QUERY_REASON}`);
  }, [isConnected]);

  return useMemo(
    () => ({
      readOnly: !isConnected,
      create: async (body: CreateQueryBody): Promise<ApiQueryDetail> => {
        guard();
        return queriesApi.create(body);
      },
      update: async (id: string, body: LetterBody): Promise<ApiQueryDetail> => {
        guard();
        return queriesApi.update(id, body);
      },
      issue: async (id: string): Promise<IssueResult> => {
        guard();
        return queriesApi.issue(id);
      },
      addFile: async (
        id: string,
        body: { role: QueryFileRole; filename: string; contentBase64: string },
      ) => {
        guard();
        return queriesApi.addFile(id, body);
      },
      removeFile: async (id: string, fileId: string) => {
        guard();
        return queriesApi.removeFile(id, fileId);
      },
      /** The bytes of one file: fetched on a click, audited by the server before it serves them. */
      fileContent: async (id: string, fileId: string) => {
        guard();
        return queriesApi.fileContent(id, fileId);
      },
      confirmReceipt: async (id: string) => {
        guard();
        return queriesApi.confirmReceipt(id);
      },
      saveReply: async (id: string, body: string) => {
        guard();
        return queriesApi.saveReply(id, body);
      },
      sendReply: async (id: string) => {
        guard();
        return queriesApi.sendReply(id);
      },
      replyFromPaper: async (
        id: string,
        body: {
          body: string;
          receivedOn: string;
          files?: { filename: string; contentBase64: string }[];
        },
      ) => {
        guard();
        return queriesApi.replyFromPaper(id, body);
      },
      extend: async (id: string, body: { replyBy: string; reason: string }) => {
        guard();
        return queriesApi.extend(id, body);
      },
      outcome: async (
        id: string,
        body: { outcome: QueryOutcome; reasons: string },
      ) => {
        guard();
        return queriesApi.outcome(id, body);
      },
      withdraw: async (id: string, body: { reason: string }) => {
        guard();
        return queriesApi.withdraw(id, body);
      },
      archive: async (id: string) => {
        guard();
        return queriesApi.archive(id);
      },
      updateSettings: async (body: SettingsPatch) => {
        guard();
        return queriesApi.updateSettings(body);
      },
      addCitation: async (id: string, body: CiteBody) => {
        guard();
        return queriesApi.addCitation(id, body);
      },
      removeCitation: async (id: string, citationId: string) => {
        guard();
        return queriesApi.removeCitation(id, citationId);
      },
      askForDocument: async (id: string, body: AskDocumentBody) => {
        guard();
        return queriesApi.askForDocument(id, body);
      },
      createTemplate: async (body: TemplateBody) => {
        guard();
        return queriesApi.createTemplate(body);
      },
      updateTemplate: async (id: string, body: Partial<TemplateBody>) => {
        guard();
        return queriesApi.updateTemplate(id, body);
      },
      archiveTemplate: async (id: string) => {
        guard();
        return queriesApi.archiveTemplate(id);
      },
      restoreTemplate: async (id: string) => {
        guard();
        return queriesApi.restoreTemplate(id);
      },
    }),
    [guard, isConnected],
  );
}
