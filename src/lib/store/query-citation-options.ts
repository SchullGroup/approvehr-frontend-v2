"use client";

import { useCallback } from "react";
import { assetsApi } from "@/lib/api/assets";
import { conductApi } from "@/lib/api/conduct";
import { documentsApi } from "@/lib/api/documents";
import { leaveApi } from "@/lib/api/leave";
import type { CitationKind } from "@/lib/api/query-ties";
import { useSession } from "@/lib/store/session";
import { useFetched } from "@/lib/use-fetched";

/**
 * What can be cited of a person, for the "Add a reference" picker.
 *
 * Each list is **the person's own records, read through that module's own route and permission**,
 * so what is offered is only what this reader may already read there: a reader who may not read
 * somebody's leave is not shown it here, and the server is still the authority on what may be
 * cited (it refuses a record that is somebody else's, in its own sentence). An attendance or a
 * rota day has nothing to list: it is a date.
 *
 * Nothing about the choice is cached between openings, and nothing here is asked for until the
 * kind is chosen.
 */
export type CitationOption = {
  /** The id the server wants in the body. */
  value: string;
  /** What to read in the list. Never the leave type or a reason: only what the server cites. */
  label: string;
};

export type CitationOptions = {
  options: CitationOption[];
  loading: boolean;
  error: Error | null;
  /** True when the list may be longer than what was read. */
  cut: boolean;
};

const PAGE = 100;

export function useCitationOptions(
  kind: CitationKind | "",
  employeeId: string,
  formatDay: (day: string) => string,
): CitationOptions {
  const { isConnected } = useSession();
  const active =
    isConnected &&
    kind !== "" &&
    kind !== "ATTENDANCE_DAY" &&
    kind !== "ROTA_DAY";

  const load = useCallback(
    async (
      signal: AbortSignal,
    ): Promise<{ options: CitationOption[]; cut: boolean }> => {
      switch (kind) {
        case "POLICY": {
          const page = await conductApi.policies(
            { pageSize: PAGE, sort: "title", order: "asc" },
            signal,
          );
          return {
            options: page.data
              .filter((policy) => policy.published && !policy.archived)
              .map((policy) => ({
                value: policy.id,
                label: `${policy.title}, version ${policy.version}`,
              })),
            cut: page.meta.total > page.data.length,
          };
        }
        case "EQUIPMENT": {
          const holdings = await assetsApi.forEmployee(employeeId, signal);
          return {
            options: [
              ...holdings.holding.map((item) => ({
                value: item.assignmentId,
                label: `${item.name} (${item.tag}), given ${formatDay(item.assignedOn)}`,
              })),
              ...holdings.returned.map((item) => ({
                value: item.assignmentId,
                label: `${item.name} (${item.tag}), given ${formatDay(item.assignedOn)}${item.returnedOn ? `, handed back ${formatDay(item.returnedOn)}` : ""}`,
              })),
            ],
            cut: false,
          };
        }
        case "LEAVE_REQUEST": {
          const { rows, total } = await leaveApi.list(
            {
              employeeId,
              pageSize: PAGE,
              sort: "startDate",
              order: "desc",
            },
            signal,
          );
          return {
            /* Dates and the status only. The leave type and the reason can be health
               information and are not what a query cites. */
            options: rows.map((row) => ({
              value: row.id,
              label: `${formatDay(row.from)}${row.to !== row.from ? ` to ${formatDay(row.to)}` : ""}, ${row.days} ${row.days === 1 ? "day" : "days"}`,
            })),
            cut: total > rows.length,
          };
        }
        case "DOCUMENT_REQUEST": {
          const page = await documentsApi.requests(
            { employeeId, pageSize: PAGE, sort: "createdAt", order: "desc" },
            signal,
          );
          return {
            options: page.data.map((request) => ({
              value: request.id,
              label: request.dueOn
                ? `${request.name}, due ${formatDay(request.dueOn)}`
                : request.name,
            })),
            cut: page.meta.total > page.data.length,
          };
        }
        default:
          return { options: [], cut: false };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `formatDay` is a formatter; the key is the question
    [kind, employeeId],
  );

  const result = useFetched<{ options: CitationOption[]; cut: boolean }>(
    `queries.citation-options:${kind}:${employeeId}`,
    active && employeeId !== "",
    load,
  );
  return {
    options: result.data?.options ?? [],
    loading: active && result.loading,
    error: result.error,
    cut: result.data?.cut ?? false,
  };
}
