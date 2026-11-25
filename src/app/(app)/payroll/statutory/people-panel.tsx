"use client";

import { useEffect, useState } from "react";
import {
  Callout,
  LoadState,
  Modal,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { formatKobo, periodLabel } from "@/lib/api/payroll";
import {
  KIND_LABEL,
  statutory,
  type ApiSchedulePeople,
  type ApiStatutorySchedule,
  type ApiSchedulePerson,
} from "@/lib/api/statutory";

/**
 * Who is on one remittance schedule, and what each of them contributes to it.
 *
 * The count on the table says how many people; this says which ones. Every
 * column is a figure the body's own return carries for that person, and the
 * total row is the sum of those figures, so it can be checked against the
 * schedule amount shown above it. The people are the same ones the CSV file
 * sends to the portal, because the server selects both with one rule.
 */
export function PeoplePanel({
  schedule,
  open,
  onClose,
}: {
  schedule: ApiStatutorySchedule;
  open: boolean;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    id: string;
    attempt: number;
    data: ApiSchedulePeople | null;
    failed: boolean;
    error: ApiError | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const data = await statutory.people(schedule.id);
        if (!cancelled) {
          setState({
            id: schedule.id,
            attempt,
            data,
            failed: false,
            error: null,
          });
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError")
          return;
        if (!cancelled) {
          setState({
            id: schedule.id,
            attempt,
            data: null,
            failed: true,
            error: caught instanceof ApiError ? caught : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, schedule.id, attempt]);

  const current =
    state !== null && state.id === schedule.id && state.attempt === attempt
      ? state
      : null;
  const people = current?.data?.people ?? [];
  const columns = columnsFor(schedule.kind);
  const title = `${KIND_LABEL[schedule.kind]} · ${schedule.recipient}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={
        current?.data
          ? `${people.length} ${people.length === 1 ? "person" : "people"} on this schedule, from the ${periodLabel(current.data.period)} payroll.`
          : undefined
      }
      size="lg"
    >
      {current?.failed ? (
        <Callout tone="danger" title="The people on this schedule did not load">
          {current.error?.message ?? "Something went wrong. Try again."}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Retry
          </button>
        </Callout>
      ) : !current ? (
        <LoadState
          loading
          error={null}
          subject="the people on this schedule"
          onRetry={() => setAttempt((n) => n + 1)}
          skeleton="table"
        >
          {null}
        </LoadState>
      ) : people.length === 0 ? (
        <p className="text-body-sm text-body">
          Nobody is on this schedule. The count above says the same.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <TableWrap>
            <THead>
              <TH>Employee</TH>
              {columns.identifier && <TH>{columns.identifier}</TH>}
              {columns.figures.map((figure) => (
                <TH key={figure.label} align="right">
                  {figure.label}
                </TH>
              ))}
            </THead>
            <TBody>
              {people.map((person) => (
                <TR key={person.employeeNo}>
                  <TDPrimary title={person.name} subtitle={person.employeeNo} />
                  {columns.identifier && (
                    <TD>{person.identifier ?? "Not recorded"}</TD>
                  )}
                  {columns.figures.map((figure) => (
                    <TD key={figure.label} align="right" className="tabular">
                      {figureOf(person, figure.read)}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </TableWrap>

          <TotalsLine
            people={people}
            figures={columns.figures}
            scheduleAmountKobo={schedule.amountKobo}
            kind={schedule.kind}
          />
        </div>
      )}
    </Modal>
  );
}

type Figure = {
  label: string;
  read: (person: ApiSchedulePerson) => number | null;
};

/**
 * Which columns a body's people are shown with. Only the figures that belong to
 * that body appear: a PAYE return shows the tax deducted, a pension schedule
 * shows the two contributions and what they add to.
 */
function columnsFor(kind: ApiStatutorySchedule["kind"]): {
  identifier: string | null;
  figures: Figure[];
} {
  switch (kind) {
    case "PAYE":
      return {
        identifier: "TIN",
        figures: [
          { label: "Gross pay", read: (p) => p.grossKobo },
          { label: "PAYE", read: (p) => p.payeKobo },
        ],
      };
    case "PENSION":
      return {
        identifier: "PFA PIN",
        figures: [
          { label: "Employee", read: (p) => p.pensionEmployeeKobo },
          { label: "Employer", read: (p) => p.pensionEmployerKobo },
          {
            label: "Total remitted",
            read: (p) =>
              p.pensionEmployeeKobo === null || p.pensionEmployerKobo === null
                ? null
                : p.pensionEmployeeKobo + p.pensionEmployerKobo,
          },
        ],
      };
    case "NHF":
      return {
        identifier: "NHF number",
        figures: [
          { label: "Basic", read: (p) => p.basicKobo },
          { label: "NHF", read: (p) => p.nhfKobo },
        ],
      };
    case "NSITF":
    case "ITF":
      return {
        identifier: null,
        figures: [{ label: "Gross pay", read: (p) => p.grossKobo }],
      };
  }
}

function figureOf(person: ApiSchedulePerson, read: Figure["read"]): string {
  const value = read(person);
  return value === null ? "—" : formatKobo(value);
}

/**
 * The total of every column, and the schedule amount beside it. For PAYE,
 * pension and NHF the two match: the amount is the sum of those people's
 * figures. For NSITF and ITF the amount is worked out from gross pay rather
 * than summed from it, so the gross total is shown for reference and the
 * schedule amount is labelled as the figure to file.
 */
function TotalsLine({
  people,
  figures,
  scheduleAmountKobo,
  kind,
}: {
  people: ApiSchedulePerson[];
  figures: Figure[];
  scheduleAmountKobo: number;
  kind: ApiStatutorySchedule["kind"];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-body-sm">
        {figures.map((figure) => (
          <span key={figure.label} className="text-muted">
            {figure.label}{" "}
            <span className="tabular font-medium text-ink">
              {formatKobo(sumOf(people, figure.read))}
            </span>
          </span>
        ))}
      </div>
      <p className="text-body-sm text-ink">
        Amount on the schedule{" "}
        <span className="tabular font-medium">
          {formatKobo(scheduleAmountKobo)}
        </span>
        {kind === "NSITF" || kind === "ITF"
          ? ", worked out from the gross pay above."
          : ", which is the total of the people listed."}
      </p>
    </div>
  );
}

function sumOf(people: ApiSchedulePerson[], read: Figure["read"]): number {
  return people.reduce((sum, person) => sum + (read(person) ?? 0), 0);
}
