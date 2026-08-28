"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Stat,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  formatMoney,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import {
  kobo,
  naira,
  type ApiGrade,
  type ApiIncreaseResult,
} from "@/lib/api/grades";
import {
  useGradeEmployees,
  useGradeIncrease,
  useGradeTotals,
  useGrades,
  type IncreaseDraft,
} from "@/lib/store/grades";
import { BandMeter } from "./band-position";

/**
 * Salary grades — one tab of Pay setup.
 *
 * A panel, not a page: the tab shell owns the heading and the route, so nothing
 * here renders `PageHeader`. Mounted at
 * `app/(app)/payroll/pay-setup/grades-panel.tsx` because the shell imports that
 * exact path.
 *
 * ## Why the table is ordered by level and not by code
 *
 * Company grade codes are almost never sortable — "SL-2" sorts above "M10"
 * alphabetically and below it in every real company. `level` is the ladder, so
 * the ladder is what you see. It is also why the level column is first: reading
 * down it is how you check the structure has no gaps.
 *
 * ## Giving a whole grade a rise
 *
 * The button is real, and it cannot fire in one click. Fill the amount, press
 * **Show what it costs**, read the per-person list and the monthly and annual
 * totals, and only then **Apply**. The preview writes nothing — on the server it
 * is the same endpoint with `confirm: false`, which is a field somebody has to
 * mean rather than a flag that could default the dangerous way.
 *
 * The confirmed request sends the amount again, not the figures on screen. So a
 * preview left open while somebody else granted an individual rise cannot
 * silently undo it: the server re-reads current pay and redoes the arithmetic.
 *
 * ## Out of band is not an error
 *
 * People sit outside their own band all the time — three rises and no re-grade
 * puts somebody above the top, a new joiner below the bottom. The count is shown
 * per grade and the meter draws the marker off the end of the track rather than
 * pinning it, because a meter resting on its ceiling reads as "at the top",
 * which is the opposite of the truth.
 */
export function GradesPanel() {
  const [query, setQuery] = useState("");
  const search = useDebounced(query.trim(), 250);
  const [includeArchived, setIncludeArchived] = useState(false);

  const grades = useGrades({
    ...(search ? { q: search } : {}),
    ...(includeArchived ? { includeArchived: true } : {}),
    pageSize: 100,
  });
  const totals = useGradeTotals(grades.rows);
  const increase = useGradeIncrease();
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApiGrade | null>(null);
  const [archiving, setArchiving] = useState<ApiGrade | null>(null);
  const [raising, setRaising] = useState<ApiGrade | null>(null);
  const [viewing, setViewing] = useState<ApiGrade | null>(null);

  /* The next free rung. Levels are only held by live grades, so max + 1 is
     always available and a new grade never collides on the way in. */
  const nextLevel = useMemo(
    () =>
      grades.rows.reduce(
        (highest, row) =>
          row.archived ? highest : Math.max(highest, row.level),
        0,
      ) + 1,
    [grades.rows],
  );

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {DEMO_ENABLED && !grades.connected && !grades.loading && (
        <Callout tone="warning" title="Demo data, this browser only">
          You can price a rise here and see exactly what it would cost. Applying
          one, and adding or editing a grade, needs the API — pay set in a
          browser would never reach a payroll run.
        </Callout>
      )}

      {grades.error && (
        <LoadFailure subject="the salary bands" error={grades.error} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Salary grades"
          value={String(totals.grades)}
          hint="on the ladder"
        />
        <Stat
          label="People on a grade"
          value={String(totals.employees)}
          hint="active records"
        />
        <Stat
          label="Monthly cost"
          value={
            <Money
              amount={naira(totals.monthlyPayrollKobo)}
              decimals
              size="xl"
            />
          }
          hint="gross, before employer pension"
        />
        <Stat
          label="Outside their band"
          value={String(totals.outsideBand)}
          {...(totals.outsideBand > 0
            ? { trend: { direction: "down" as const, label: "Worth a look" } }
            : {})}
          hint={totals.outsideBand === 1 ? "one person" : "people"}
        />
      </div>

      <Card>
        <CardHeader
          title="Salary grades"
          description="Ordered by level, lowest first. The band is what the grade is worth a month."
          action={
            grades.editable ? (
              <Button
                variant="accent"
                size="sm"
                onClick={() => setCreating(true)}
              >
                <Plus aria-hidden="true" className="size-4" />
                Add grade
              </Button>
            ) : undefined
          }
        />

        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative w-full max-w-xs">
              <Input
                type="search"
                value={query}
                placeholder="Search code or name"
                aria-label="Search grades"
                icon={<Search aria-hidden="true" />}
                onChange={(e) => {
                  const value = e.target.value;
                  setQuery(value);
                }}
              />
            </div>
            <Checkbox
              label="Show archived"
              checked={includeArchived}
              onChange={(e) => {
                const value = e.target.checked;
                setIncludeArchived(value);
              }}
            />
          </div>

          {grades.rows.length === 0 ? (
            <EmptyState
              compact
              icon={<Layers aria-hidden="true" />}
              title={
                grades.loading
                  ? "Loading…"
                  : search
                    ? "Nothing matches that"
                    : "No grades yet"
              }
              description={
                grades.loading
                  ? undefined
                  : search
                    ? "Try a different code or name."
                    : "A grade is a band around a monthly gross. Add one and you can raise everybody on it at once."
              }
              action={
                !grades.loading && !search && grades.editable ? (
                  <Button
                    variant="accent"
                    size="sm"
                    onClick={() => setCreating(true)}
                  >
                    <Plus aria-hidden="true" className="size-4" />
                    Add the first grade
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableWrap caption="Salary grades, ordered by level">
              <THead>
                <TH className="w-16">Level</TH>
                <TH>Grade</TH>
                <TH>Band a month</TH>
                <TH align="right">People</TH>
                <TH align="right">Monthly cost</TH>
                <TH>
                  <span className="sr-only-focusable">Actions</span>
                </TH>
              </THead>
              <TBody>
                {grades.rows.map((row) => (
                  <GradeRow
                    key={row.id}
                    row={row}
                    editable={grades.editable}
                    canApply={increase.canApply}
                    onView={() => setViewing(row)}
                    onRaise={() => setRaising(row)}
                    onEdit={() => setEditing(row)}
                    onArchive={() => setArchiving(row)}
                    onRestore={() =>
                      void run(
                        () => grades.restore(row.id),
                        `${row.code} is back on the ladder`,
                      )
                    }
                  />
                ))}
              </TBody>
            </TableWrap>
          )}
        </CardBody>
      </Card>

      {creating && (
        <GradeDialog
          mode="create"
          nextLevel={nextLevel}
          onClose={() => setCreating(false)}
          onSubmit={async (body) => {
            const ok = await run(
              () => grades.create(body),
              `${body.code} ${body.name} added`,
            );
            if (ok) setCreating(false);
          }}
        />
      )}

      {editing && (
        <GradeDialog
          mode="edit"
          grade={editing}
          nextLevel={editing.level}
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            const ok = await run(
              () => grades.update(editing.id, body),
              "Saved",
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      {raising && (
        <RaiseDialog
          grade={raising}
          onClose={() => setRaising(null)}
          onApplied={() => {
            setRaising(null);
            void grades.reload();
          }}
        />
      )}

      {viewing && (
        <PeopleDrawer grade={viewing} onClose={() => setViewing(null)} />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.code ?? ""} ${archiving?.name ?? ""}?`}
        confirmLabel="Archive"
        tone="danger"
        body="Hidden, not deleted, and its level is freed for another grade. Move anyone still on it first — nobody's pay changes."
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(
            () => grades.archive(archiving.id),
            `${archiving.code} archived`,
          );
          if (ok) setArchiving(null);
        }}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function GradeRow({
  row,
  editable,
  canApply,
  onView,
  onRaise,
  onEdit,
  onArchive,
  onRestore,
}: {
  row: ApiGrade;
  editable: boolean;
  canApply: boolean;
  onView: () => void;
  onRaise: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <TR className={cn(row.archived && "opacity-60")}>
      <TD>
        <span className="tabular text-body-sm font-medium text-ink">
          {row.level}
        </span>
      </TD>

      <TDPrimary
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="tabular">{row.code}</span>
            <span className="font-normal text-body">{row.name}</span>
            {row.archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
          </span>
        }
        subtitle={
          row.outsideBand > 0 ? (
            <button
              type="button"
              onClick={onView}
              className="rounded text-meta font-medium text-warning-text hover:underline underline-offset-4"
            >
              {row.outsideBand === 1
                ? "1 person outside this band"
                : `${row.outsideBand} people outside this band`}
            </button>
          ) : undefined
        }
      />

      <TD>
        <span className="block tabular text-body-sm text-ink">
          <Money amount={naira(row.minGrossKobo)} decimals /> —{" "}
          <Money amount={naira(row.maxGrossKobo)} decimals />
        </span>
        <span className="mt-0.5 block text-meta text-muted">
          Mid-point <Money amount={naira(row.midGrossKobo)} decimals />
        </span>
      </TD>

      <TD align="right">
        {row.employees === 0 ? (
          <span className="text-body-sm text-faint">Nobody yet</span>
        ) : (
          <button
            type="button"
            onClick={onView}
            className="rounded tabular text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
          >
            {row.employees}
          </button>
        )}
      </TD>

      <TD align="right">
        <Money amount={naira(row.monthlyPayrollKobo)} decimals />
      </TD>

      <TD>
        <div className="flex justify-end gap-1.5">
          {row.archived ? (
            editable && (
              <Button variant="secondary" size="sm" onClick={onRestore}>
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Restore
              </Button>
            )
          ) : (
            <>
              {row.employees > 0 && canApply && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRaise}
                  aria-label={`Give everyone on ${row.code} a rise`}
                >
                  <TrendingUp aria-hidden="true" className="size-3.5" />
                  Give a rise
                </Button>
              )}
              {editable && (
                <>
                  <Button variant="ghost" size="sm" onClick={onEdit}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onArchive}
                    aria-label={`Archive ${row.code}`}
                  >
                    <Trash2 aria-hidden="true" className="size-3.5" />
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </TD>
    </TR>
  );
}

/* -------------------------------------------------------------------------- */

type GradeBody = {
  code: string;
  name: string;
  level: number;
  minGrossKobo: number;
  midGrossKobo: number;
  maxGrossKobo: number;
};

/**
 * Add or edit a grade.
 *
 * Adding one is **four fields**: a code, a name, the bottom of the band and the
 * top. Level goes in at the next free rung and the mid-point sits halfway, both
 * shown as figures rather than asked as questions — a company setting up its
 * first ladder has no opinion about either yet, and Edit exposes all six the
 * moment it does.
 */
function GradeDialog({
  mode,
  grade,
  nextLevel,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  grade?: ApiGrade;
  nextLevel: number;
  onClose: () => void;
  onSubmit: (body: GradeBody) => Promise<void>;
}) {
  const [code, setCode] = useState(grade?.code ?? "");
  const [name, setName] = useState(grade?.name ?? "");
  const [min, setMin] = useState(
    grade ? String(naira(grade.minGrossKobo)) : "",
  );
  const [max, setMax] = useState(
    grade ? String(naira(grade.maxGrossKobo)) : "",
  );
  /* Empty means "halfway", which is what the line under the inputs shows. Kept
     as a string so an edit that clears it falls back to the default rather than
     to zero. */
  const [mid, setMid] = useState(
    grade ? String(naira(grade.midGrossKobo)) : "",
  );
  const [level, setLevel] = useState(String(grade?.level ?? nextLevel));
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);

  const minValue = parseAmount(min);
  const maxValue = parseAmount(max);
  const midValue =
    parseAmount(mid) ??
    (minValue !== null && maxValue !== null
      ? Math.round((minValue + maxValue) / 2)
      : null);
  const levelValue = Number.parseInt(level, 10);

  /* The common mistake is just the top and bottom swapped, so that gets the
     plain sentence. The mid-point can only be out of range on its own once
     somebody has typed one in — see "Set the level and mid-point myself"
     below — so it gets a second, still short, sentence rather than one
     sentence trying to cover both at once. */
  const orderError =
    minValue !== null && maxValue !== null && midValue !== null
      ? minValue > maxValue
        ? "Top has to be higher than bottom."
        : minValue > midValue || midValue > maxValue
          ? "The mid-point has to be between the bottom and the top."
          : undefined
      : undefined;

  const ready =
    code.trim().length > 0 &&
    name.trim().length >= 2 &&
    minValue !== null &&
    minValue > 0 &&
    maxValue !== null &&
    maxValue > 0 &&
    midValue !== null &&
    Number.isInteger(levelValue) &&
    levelValue >= 1 &&
    !orderError;

  const submit = () => {
    if (!ready || minValue === null || maxValue === null || midValue === null)
      return;
    setBusy(true);
    void onSubmit({
      code: code.trim().toUpperCase(),
      name: name.trim(),
      level: levelValue,
      minGrossKobo: kobo(minValue),
      midGrossKobo: kobo(midValue),
      maxGrossKobo: kobo(maxValue),
    }).finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Add a grade" : `Edit ${grade?.code ?? ""}`}
      description={
        mode === "create"
          ? "A band around one monthly gross figure. Everyone you put on it can then be raised together."
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="accent" disabled={!ready || busy} onClick={submit}>
            {busy ? "Saving…" : mode === "create" ? "Add grade" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Code"
            required
            help="What payslips and offer letters quote."
          >
            <Input
              value={code}
              autoFocus={mode === "create"}
              placeholder="G3"
              onChange={(e) => {
                const value = e.target.value;
                setCode(value.toUpperCase());
              }}
            />
          </Field>
          <Field label="Name" required>
            <Input
              value={name}
              placeholder="Lead"
              onChange={(e) => {
                const value = e.target.value;
                setName(value);
              }}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bottom of band" required help="Naira a month.">
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={1000}
              value={min}
              placeholder="1300000"
              onChange={(e) => {
                const value = e.target.value;
                setMin(value);
              }}
            />
          </Field>
          <Field
            label="Top of band"
            required
            help="Naira a month."
            error={orderError}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={1000}
              value={max}
              placeholder="1900000"
              onChange={(e) => {
                const value = e.target.value;
                setMax(value);
              }}
            />
          </Field>
        </div>

        {/* Facts about what will be saved, not a form. */}
        <dl className="grid gap-3 rounded-lg border border-line bg-canvas p-4 sm:grid-cols-2">
          <div>
            <dt className="text-meta font-semibold tracking-wide text-faint">
              Level
            </dt>
            <dd className="tabular text-body-sm font-medium text-ink">
              {Number.isInteger(levelValue) ? levelValue : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-meta font-semibold tracking-wide text-faint">
              Mid-point
            </dt>
            <dd className="text-body-sm font-medium text-ink">
              {midValue === null ? "—" : <Money amount={midValue} decimals />}
            </dd>
          </div>
        </dl>

        {(advanced || mode === "edit") && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Level"
              required
              help="Rank on the ladder. One grade per level."
            >
              <Input
                type="number"
                min={1}
                step={1}
                value={level}
                onChange={(e) => {
                  const value = e.target.value;
                  setLevel(value);
                }}
              />
            </Field>
            <Field
              label="Mid-point"
              help="Naira a month. Halfway if you leave it."
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={1000}
                value={mid}
                onChange={(e) => {
                  const value = e.target.value;
                  setMid(value);
                }}
              />
            </Field>
          </div>
        )}

        {mode === "create" && !advanced && (
          <div>
            <Button variant="ghost" size="sm" onClick={() => setAdvanced(true)}>
              Set the level and mid-point myself
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * A grade-wide rise, in two stages.
 *
 * Stage one is the amount. Stage two is every person's before and after, the
 * monthly cost change and the annual one, and how many end up above the top of
 * their band. Only stage two has an Apply button, and it is never the button
 * that got you there.
 */
function RaiseDialog({
  grade,
  onClose,
  onApplied,
}: {
  grade: ApiGrade;
  onClose: () => void;
  onApplied: () => void;
}) {
  const increase = useGradeIncrease();
  const toast = useToast();

  const [draft, setDraft] = useState<IncreaseDraft>({
    basis: "PERCENT",
    percent: 5,
    amountKobo: 0,
    note: "",
  });
  const [percentText, setPercentText] = useState("5");
  const [amountText, setAmountText] = useState("");
  const [preview, setPreview] = useState<ApiIncreaseResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const percentValue = parseAmount(percentText);
  const amountValue = parseAmount(amountText);
  const ready =
    draft.basis === "PERCENT"
      ? percentValue !== null && percentValue > 0 && percentValue <= 100
      : amountValue !== null && amountValue > 0;

  const current: IncreaseDraft = {
    basis: draft.basis,
    percent: percentValue ?? 0,
    amountKobo: amountValue === null ? 0 : kobo(amountValue),
    note: draft.note,
  };

  const showPreview = () => {
    setFailure(null);
    void increase
      .preview(grade, current)
      .then(setPreview)
      .catch((error: unknown) =>
        setFailure(
          error instanceof ApiError
            ? error.message
            : "Could not work out what that would cost.",
        ),
      );
  };

  const apply = () => {
    setFailure(null);
    void increase
      .apply(grade, current)
      .then((result) => {
        toast.push({
          title: `${result.appliedCount} ${
            result.appliedCount === 1 ? "person" : "people"
          } on ${grade.code} raised`,
          tone: "success",
          detail: result.note,
        });
        onApplied();
      })
      .catch((error: unknown) =>
        setFailure(
          error instanceof ApiError
            ? error.message
            : "The rise was not applied.",
        ),
      );
  };

  const people = grade.employees;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Give everyone on ${grade.code} ${grade.name} a rise`}
      description={
        preview
          ? undefined
          : `${people} ${people === 1 ? "person is" : "people are"} on this grade.`
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {preview ? (
            <>
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Change the amount
              </Button>
              <Button
                variant="accent"
                disabled={increase.busy !== null || !increase.canApply}
                onClick={apply}
              >
                {increase.busy === "apply"
                  ? "Applying…"
                  : `Apply to ${preview.employees} ${
                      preview.employees === 1 ? "person" : "people"
                    }`}
              </Button>
            </>
          ) : (
            <Button
              variant="accent"
              disabled={!ready || increase.busy !== null}
              onClick={showPreview}
            >
              {increase.busy === "preview"
                ? "Working it out…"
                : "Show what it costs"}
            </Button>
          )}
        </div>
      }
    >
      {failure && (
        <Callout tone="danger" title="Not applied" className="mb-4">
          {failure}
        </Callout>
      )}

      {preview ? (
        <PreviewBody
          preview={preview}
          grade={grade}
          /* Only a *connected* account can lack the permission. In demo mode the
             refusal arrives from the Apply button itself, with its own reason. */
          missingPermission={increase.connected && !increase.canApply}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Rise as">
            <Select
              value={draft.basis}
              onChange={(e) => {
                const value = e.target.value as IncreaseDraft["basis"];
                setDraft((d) => ({ ...d, basis: value }));
              }}
            >
              <option value="PERCENT">
                A percentage of what they earn now
              </option>
              <option value="AMOUNT">The same amount for everybody</option>
            </Select>
          </Field>

          {draft.basis === "PERCENT" ? (
            <Field
              label="Percentage"
              required
              help="Up to 100, two decimal places. 7.5 means 7.5%."
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.5}
                value={percentText}
                autoFocus
                onChange={(e) => {
                  const value = e.target.value;
                  setPercentText(value);
                }}
              />
            </Field>
          ) : (
            <Field
              label="Amount each"
              required
              help="Naira a month, added to everyone."
            >
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step={1000}
                value={amountText}
                autoFocus
                placeholder="25000"
                onChange={(e) => {
                  const value = e.target.value;
                  setAmountText(value);
                }}
              />
            </Field>
          )}

          <Field
            optional
            label="Note"
            help="Goes in the audit trail with the rise."
          >
            <Input
              value={draft.note}
              placeholder="2026 annual review"
              onChange={(e) => {
                const value = e.target.value;
                setDraft((d) => ({ ...d, note: value }));
              }}
            />
          </Field>
        </div>
      )}
    </Modal>
  );
}

function PreviewBody({
  preview,
  grade,
  missingPermission,
}: {
  preview: ApiIncreaseResult;
  grade: ApiGrade;
  missingPermission: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure
          label="Payroll now"
          value={naira(preview.totals.currentMonthlyKobo)}
        />
        <Figure
          label="Payroll after"
          value={naira(preview.totals.newMonthlyKobo)}
          strong
        />
        <Figure
          label="Extra every month"
          value={naira(preview.totals.monthlyIncreaseKobo)}
          strong
          hint={`${formatPlain(naira(preview.totals.annualIncreaseKobo))} over twelve months`}
        />
      </div>

      {preview.leavingBand > 0 && (
        <Callout tone="warning" title="Some end up above the top of the band">
          {preview.leavingBand === 1
            ? "One person"
            : `${preview.leavingBand} people`}{" "}
          will be paid more than {grade.code} tops out at. Marked below. You can
          apply it and widen the band afterwards, or go back and lower the rise.
        </Callout>
      )}

      {missingPermission && (
        <Callout tone="warning" title="You cannot apply this">
          Your account can define bands but not change what a named person is
          paid. Ask someone with that permission to apply it.
        </Callout>
      )}

      <TableWrap caption="Who is affected and what each goes from and to">
        <THead>
          <TH>Person</TH>
          <TH align="right">Now</TH>
          <TH align="right">After</TH>
          <TH align="right">Rise</TH>
        </THead>
        <TBody>
          {preview.lines.map((line) => (
            <TR key={line.id}>
              <TDPrimary
                title={line.name}
                subtitle={
                  <>
                    <span className="tabular">{line.employeeNo}</span>
                    {line.leavesBandAbove && (
                      <span className="block text-warning-text">
                        Goes above the top of the band
                      </span>
                    )}
                  </>
                }
              />
              <TD align="right">
                <Money amount={naira(line.currentGrossKobo)} decimals />
              </TD>
              <TD align="right">
                <Money amount={naira(line.newGrossKobo)} decimals />
              </TD>
              <TD align="right">
                <span className="tabular text-body-sm font-medium text-success-text">
                  +{formatPlain(naira(line.increaseKobo))}
                </span>
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  strong = false,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-canvas p-4">
      <p className="text-meta font-semibold tracking-wide text-faint">
        {label}
      </p>
      <p
        className={cn(
          "mt-1 tabular",
          strong ? "text-h4 text-ink" : "text-body-sm text-body",
        )}
      >
        {formatPlain(value)}
      </p>
      {hint && <p className="mt-1 text-meta text-muted">{hint}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Who is on a grade, each against the band. */
function PeopleDrawer({
  grade,
  onClose,
}: {
  grade: ApiGrade;
  onClose: () => void;
}) {
  const band = {
    minGrossKobo: grade.minGrossKobo,
    midGrossKobo: grade.midGrossKobo,
    maxGrossKobo: grade.maxGrossKobo,
  };
  const { rows, loading, error } = useGradeEmployees(grade.id, band);

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${grade.code} ${grade.name}`}
      description={`Level ${grade.level} · ${formatPlain(
        naira(grade.minGrossKobo),
      )} to ${formatPlain(naira(grade.maxGrossKobo))} a month`}
    >
      <div className="flex flex-col gap-5">
        {error && <LoadFailure subject="the list" error={error} />}

        {loading && <p className="text-body-sm text-muted">Loading…</p>}

        {!loading && rows.length === 0 && !error && (
          <EmptyState
            compact
            icon={<ArrowUpRight aria-hidden="true" />}
            title="Nobody on this grade"
            description="Put people on it from their record, then a rise here moves all of them together."
          />
        )}

        {/* No badge of our own up here: `BandMeter` already carries the state and
            the sentence, and two labels for one figure is how a reader starts
            wondering whether they mean different things. */}
        {rows.map((person) => (
          <div
            key={person.id}
            className="rounded-lg border border-line bg-surface p-4"
          >
            <p className="font-medium text-ink">{person.name}</p>
            <p className="text-body-sm text-muted">
              {person.jobTitle} · {person.employeeNo}
            </p>
            <BandMeter
              className="mt-3"
              band={band}
              grossKobo={person.grossMonthlyKobo}
              placement={person.position}
              size="sm"
            />
          </div>
        ))}
      </div>
    </Drawer>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Naira with separators and two decimals, as a plain string.
 *
 * `formatMoney` from the design system, with `decimals` on and `compact` off,
 * wrapped only to name the intent — this is the *reconcilable* form. Used where a
 * figure sits inside a sentence or a `description` prop that takes text rather
 * than nodes. Never abbreviated: `₦1.9m` and `₦1,900,000.00` are not the same
 * promise, and somebody is going to reconcile this against a bank statement.
 */
function formatPlain(amount: number): string {
  return formatMoney(amount, "NGN", { decimals: true });
}

/** `""` and a non-number both mean "not given yet", never zero. */
function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/** A keystroke is faster than a request. */
function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
