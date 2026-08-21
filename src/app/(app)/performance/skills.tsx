"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, GraduationCap, Grid3x3 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Spinner,
  Stat,
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
import type { ApiCompetencyRow, ApiHeatmapRow } from "@/lib/api/performance";
import {
  CATEGORY_ORDER,
  useGaps,
  useHeatmap,
  useRating,
  useSkills,
} from "@/lib/store/performance";
import { useSession } from "@/lib/store/session";
import { RecordLevelDialog } from "./rating-dialog";

/**
 * Skills: levels against the targets the company set.
 *
 * ## A gap is arithmetic, not an opinion
 *
 * `target - level`, from the latest assessment only. That is why the target is
 * stored beside the rating rather than inferred from a job title, and it is why
 * a row with a level but no target shows no gap instead of assuming one.
 *
 * ## "Not assessed" is not zero
 *
 * Every live competency is listed for every person, rated or not. A list that
 * only showed what has been rated would hide the more useful fact — that nobody
 * has ever looked at it — and a zero in its place would be a score somebody
 * would argue with.
 *
 * ## The heatmap is a grid, and it does not rely on colour
 *
 * Every cell prints its average as text. The tint is a second channel on top of
 * the number, never instead of it, and the pairs it uses are the ones the badge
 * palette already passes contrast on. A cell with people below their target
 * carries an icon and a spoken count as well.
 */
export function SkillsTab({
  canSeeCompany,
  isManager,
}: {
  canSeeCompany: boolean;
  isManager: boolean;
}) {
  const { isConnected, employeeId, actingId } = useSession();
  const me = isConnected ? employeeId : actingId;

  const mine = useSkills(me);
  const gaps = useGaps(canSeeCompany || isManager);
  const grid = useHeatmap(canSeeCompany);
  const rating = useRating();
  const toast = useToast();

  const [recording, setRecording] = useState(false);

  const grouped = useMemo(() => {
    const rows = mine.skills?.rows ?? [];
    const bucket = new Map<string, ApiCompetencyRow[]>();
    for (const row of rows) {
      const category = row.category ?? "Other";
      bucket.set(category, [...(bucket.get(category) ?? []), row]);
    }
    const known = CATEGORY_ORDER.filter((category) => bucket.has(category));
    const rest = [...bucket.keys()]
      .filter((category) => !CATEGORY_ORDER.includes(category))
      .sort();
    return [...known, ...rest].map((category) => ({
      category,
      rows: bucket.get(category) ?? [],
    }));
  }, [mine.skills]);

  const summary = mine.skills?.summary ?? { total: 0, rated: 0, gaps: 0 };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {mine.source === "demo" && (
          <Badge tone="warning" size="sm">
            Demo · seeded assessments
          </Badge>
        )}
        {(canSeeCompany || isManager) && rating.editable && (
          <Button variant="accent" size="sm" onClick={() => setRecording(true)}>
            Record a level
          </Button>
        )}
      </div>

      {mine.error && (
        <p className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink">
          {mine.error.message}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Skills on your framework" value={String(summary.total)} />
        <Stat
          label="Assessed so far"
          value={`${summary.rated} of ${summary.total}`}
        />
        <Stat
          label="Below target"
          value={String(summary.gaps)}
          {...(summary.gaps > 0
            ? { trend: { direction: "down" as const, label: "Needs work" } }
            : {})}
        />
      </div>

      <Card>
        <CardHeader
          title="Your skills"
          description="Your level, the target beside it, and the gap between."
        />
        {mine.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </CardBody>
        ) : grouped.length === 0 ? (
          <EmptyState
            compact
            icon={<GraduationCap aria-hidden="true" />}
            title="No framework yet"
            description="Finish setup and the four standard parts are created for you."
          />
        ) : (
          <CardBody className="flex flex-col gap-6">
            {grouped.map((group) => (
              <div key={group.category}>
                <p className="flex flex-wrap items-center gap-2 text-body-sm font-semibold text-ink">
                  {group.category}
                  {group.category === "Leadership" && (
                    <Badge tone="neutral" size="sm">
                      Managers only
                    </Badge>
                  )}
                </p>
                <ul className="mt-2.5 flex flex-col gap-2.5">
                  {group.rows.map((row) => (
                    <SkillRow key={row.competencyId} row={row} />
                  ))}
                </ul>
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {(canSeeCompany || isManager) && (
        <Card>
          <CardHeader
            title="Where people are below target"
            description="Biggest gap first."
          />
          {gaps.loading ? (
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading
            </CardBody>
          ) : gaps.gaps.length === 0 ? (
            <EmptyState
              compact
              icon={<GraduationCap aria-hidden="true" />}
              title="Nobody is below target"
              description="Either everyone is where they should be, or nobody has been assessed yet."
            />
          ) : (
            <TableWrap>
              <THead>
                <TR>
                  <TH>Person</TH>
                  <TH>Skill</TH>
                  <TH align="right">Level</TH>
                  <TH align="right">Target</TH>
                  <TH align="right">Gap</TH>
                </TR>
              </THead>
              <TBody>
                {gaps.gaps.map((gap) => (
                  <TR key={`${gap.employeeId}-${gap.competencyId}`}>
                    <TDPrimary title={gap.employeeName} />
                    <TD>
                      {gap.competencyName}
                      {gap.category && (
                        <span className="mt-0.5 block text-meta text-muted">
                          {gap.category}
                        </span>
                      )}
                    </TD>
                    <TD align="right" className="tabular">
                      {gap.level} of {gap.scaleMax}
                    </TD>
                    <TD align="right" className="tabular">
                      {gap.target}
                    </TD>
                    <TD align="right">
                      <Badge
                        tone="warning"
                        size="sm"
                        icon={<AlertTriangle aria-hidden="true" />}
                      >
                        {gap.gap === 1 ? "1 level" : `${gap.gap} levels`}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
        </Card>
      )}

      {canSeeCompany && (
        <Card>
          <CardHeader
            title="Department heatmap"
            description="Average level per skill, per department."
          />
          {grid.loading ? (
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading the grid
            </CardBody>
          ) : !grid.heatmap || grid.heatmap.rows.length === 0 ? (
            <EmptyState
              compact
              icon={<Grid3x3 aria-hidden="true" />}
              title="Nothing assessed yet"
              description="Record a level for somebody and the grid fills in."
            />
          ) : (
            <CardBody className="flex flex-col gap-4">
              <Legend />
              <div className="scroll-x">
                <table className="w-full border-collapse text-body-sm">
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        className="sticky left-0 z-10 bg-surface p-2 text-left font-medium text-muted"
                      >
                        Department
                      </th>
                      {grid.heatmap.competencies.map((competency) => (
                        <th
                          scope="col"
                          key={competency.id}
                          className="min-w-28 p-2 text-left align-bottom font-medium text-muted"
                        >
                          {competency.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grid.heatmap.rows.map((row) => (
                      <HeatRow
                        key={row.departmentId ?? "none"}
                        row={row}
                        scaleMax={grid.heatmap?.competencies[0]?.scaleMax ?? 5}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          )}
        </Card>
      )}

      {recording && (
        <RecordLevelDialog
          onClose={() => setRecording(false)}
          onSave={async (competencyId, body) => {
            try {
              await rating.rate(competencyId, body);
              toast.push({ title: "Level recorded", tone: "success" });
              mine.reload();
              setRecording(false);
            } catch (error) {
              toast.push({
                title: "That did not work",
                tone: "danger",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
              });
            }
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function SkillRow({ row }: { row: ApiCompetencyRow }) {
  const gap = row.gap ?? 0;

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0">
        <p className="text-body-sm font-medium text-ink">{row.name}</p>
        <p className="tabular mt-1 text-body-sm text-muted">
          {row.level === null
            ? "Not assessed yet"
            : `Level ${row.level} of ${row.scaleMax}${
                row.target !== null ? ` · target ${row.target}` : ""
              }`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Pips level={row.level} target={row.target} scaleMax={row.scaleMax} />
        {row.level === null ? (
          <Badge tone="neutral" size="sm">
            Not assessed
          </Badge>
        ) : gap > 0 ? (
          <Badge
            tone="warning"
            size="sm"
            icon={<AlertTriangle aria-hidden="true" />}
          >
            {gap === 1 ? "1 level below target" : `${gap} levels below target`}
          </Badge>
        ) : row.target !== null ? (
          <Badge tone="accent" size="sm">
            At target
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm">
            No target set
          </Badge>
        )}
      </div>
    </li>
  );
}

/**
 * The level as a row of blocks, with the target marked.
 *
 * Decoration only — `aria-hidden`, because the sentence beside it already says
 * "Level 3 of 5, target 4". A shape that carries meaning nothing else carries is
 * a shape somebody cannot read.
 */
function Pips({
  level,
  target,
  scaleMax,
}: {
  level: number | null;
  target: number | null;
  scaleMax: number;
}) {
  return (
    <span aria-hidden="true" className="flex items-end gap-1">
      {Array.from({ length: scaleMax }).map((_, index) => {
        const step = index + 1;
        const filled = level !== null && step <= level;
        const isTarget = target !== null && step === target;
        return (
          <span
            key={step}
            className={cn(
              "h-4 w-2.5 rounded-xs border",
              filled ? "bg-ink border-ink" : "bg-sunken border-line-strong",
              isTarget && "outline-2 outline-offset-1 outline-accent-text",
            )}
          />
        );
      })}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** Four bands. The key to the tint, which is never the only signal. */
function Legend() {
  const bands = [
    { label: "Under 2.5", className: "bg-danger-soft text-danger-text" },
    { label: "2.5 to 3.4", className: "bg-warning-soft text-warning-text" },
    { label: "3.5 to 4.4", className: "bg-info-soft text-info-text" },
    { label: "4.5 and above", className: "bg-accent-soft text-accent-text" },
  ];
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {bands.map((band) => (
        <li
          key={band.label}
          className={cn(
            "rounded-sm border border-line px-2 py-0.5 text-meta font-medium",
            band.className,
          )}
        >
          {band.label}
        </li>
      ))}
    </ul>
  );
}

function bandFor(average: number): string {
  if (average < 2.5) return "bg-danger-soft text-danger-text";
  if (average < 3.5) return "bg-warning-soft text-warning-text";
  if (average < 4.5) return "bg-info-soft text-info-text";
  return "bg-accent-soft text-accent-text";
}

function HeatRow({ row, scaleMax }: { row: ApiHeatmapRow; scaleMax: number }) {
  return (
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 border-t border-line bg-surface p-2 text-left align-middle font-medium text-ink"
      >
        {row.departmentName}
        <span className="mt-0.5 block text-meta font-normal text-muted">
          {row.ratedPeople === 1 ? "1 person" : `${row.ratedPeople} people`}
        </span>
      </th>
      {row.cells.map((cell) => (
        <td
          key={cell.competencyId}
          className="border-t border-line p-1 align-middle"
        >
          {cell.average === null ? (
            <span className="flex h-11 items-center justify-center rounded-sm border border-line bg-canvas text-body-sm text-muted">
              <span aria-hidden="true">&mdash;</span>
              <span className="sr-only">Not assessed</span>
            </span>
          ) : (
            <span
              className={cn(
                "tabular flex h-11 flex-col items-center justify-center rounded-sm border border-line text-body-sm font-medium",
                bandFor(cell.average),
              )}
            >
              <span>
                {cell.average}
                <span className="sr-only"> out of {scaleMax}</span>
              </span>
              {cell.belowTarget > 0 ? (
                <span className="flex items-center gap-1 text-meta font-normal">
                  <AlertTriangle aria-hidden="true" className="size-3" />
                  {cell.belowTarget}
                  <span className="sr-only">
                    {cell.belowTarget === 1
                      ? " person below target"
                      : " people below target"}
                  </span>
                </span>
              ) : (
                <span className="text-meta font-normal">
                  {cell.rated === 1 ? "1 rated" : `${cell.rated} rated`}
                </span>
              )}
            </span>
          )}
        </td>
      ))}
    </tr>
  );
}
