"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Filter, UserRoundPlus } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  EmptyState,
  Select,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiApplication, ApiStage } from "@/lib/api/recruitment";
import { useApplicationMutations, useApplicationsForRequisition } from "@/lib/store/recruitment";

const OUTCOME_TONE = {
  IN_PROGRESS: "info",
  OFFER_MADE: "warning",
  HIRED: "success",
  REJECTED: "danger",
  WITHDRAWN: "neutral",
} as const;

const OUTCOME_LABEL: Record<string, string> = {
  IN_PROGRESS: "In progress",
  OFFER_MADE: "Offer made",
  HIRED: "Hired",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

/**
 * The real pipeline board — dynamic columns, one per this requisition's own
 * `PipelineStage`, unlike the seeded `RequisitionWorkspace`'s fixed five.
 *
 * Board only, no table toggle: a stage picker per card reads fine either way,
 * and a second view is a nice-to-have this cutover did not need to match
 * pixel for pixel to be real.
 */
export function RealRequisitionWorkspace({
  requisitionId,
  stages,
}: {
  requisitionId: string;
  stages: ApiStage[];
}) {
  const { applications, loading, error, reload } = useApplicationsForRequisition(requisitionId, {
    pageSize: 200,
  });
  const mutations = useApplicationMutations();
  const toast = useToast();
  const [showTerminal, setShowTerminal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const ordered = useMemo(() => [...stages].sort((a, b) => a.order - b.order), [stages]);

  const visible = useMemo(
    () => applications.filter((a) => showTerminal || a.outcome === "IN_PROGRESS"),
    [applications, showTerminal],
  );

  const terminalCount = applications.filter((a) => a.outcome !== "IN_PROGRESS").length;

  async function move(application: ApiApplication, stageId: string) {
    setBusyId(application.id);
    try {
      await mutations.move(application.id, stageId);
      reload();
    } catch (error) {
      toast.push({
        title: "Not moved",
        tone: "danger",
        detail: error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setBusyId(null);
    }
  }

  if (loading && applications.length === 0) {
    return (
      <TableWrap caption="Candidates for this role">
        <THead>
          <TH>Candidate</TH>
          <TH>Stage</TH>
          <TH>Outcome</TH>
        </THead>
        <TBody>
          <TR>
            <TD colSpan={3} className="text-body-sm text-muted">
              Loading…
            </TD>
          </TR>
        </TBody>
      </TableWrap>
    );
  }

  if (error) {
    return (
      <EmptyState
        title="Could not load this pipeline"
        description={error.message}
        action={
          <Button variant="secondary" size="sm" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-meta text-muted">
          {ordered.length} stage{ordered.length === 1 ? "" : "s"}
        </span>
        <Button
          size="sm"
          variant={showTerminal ? "primary" : "secondary"}
          onClick={() => setShowTerminal((v) => !v)}
        >
          <Filter aria-hidden="true" className="size-3.5" />
          {showTerminal ? "Hide" : "Show"} hired / rejected / withdrawn
          {terminalCount > 0 && (
            <span className="tabular ml-0.5 text-meta opacity-70">({terminalCount})</span>
          )}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={<UserRoundPlus aria-hidden="true" />}
          title="No candidates yet"
          description="Somebody joins this board when a screener screens them in from the application queue."
          action={
            <ButtonLink href="/hiring/postings/applications" variant="accent" size="sm">
              Open the application queue
            </ButtonLink>
          }
        />
      ) : (
        <TableWrap caption="Candidates, their stage and outcome">
          <THead>
            <TH>Candidate</TH>
            <TH>Stage</TH>
            <TH>Outcome</TH>
            <TH align="right">Move to</TH>
          </THead>
          <TBody>
            {visible.map((a) => (
              <TR key={a.id}>
                <TDPrimary
                  title={
                    <Link
                      href={`/hiring/candidates/${a.id}`}
                      className="hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {a.candidateName}
                    </Link>
                  }
                  subtitle={a.candidateEmail}
                />
                <TD>
                  <Badge tone="neutral" size="sm">
                    {a.stageName ?? "Not placed"}
                  </Badge>
                </TD>
                <TD>
                  <Badge tone={OUTCOME_TONE[a.outcome]} size="sm">
                    {OUTCOME_LABEL[a.outcome] ?? a.outcome}
                  </Badge>
                </TD>
                <TD align="right">
                  {a.outcome === "IN_PROGRESS" && (
                    <Select
                      value={a.stageId ?? ""}
                      disabled={busyId === a.id}
                      onChange={(e) => void move(a, e.currentTarget.value)}
                      className="ml-auto w-auto"
                    >
                      {ordered.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}
    </div>
  );
}
