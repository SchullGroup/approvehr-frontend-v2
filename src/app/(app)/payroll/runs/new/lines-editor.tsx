"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button, Callout, Field, Input, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { formatKobo, type AdjustmentLine } from "@/lib/api/payroll";
import { usePayrollActions } from "@/lib/store/payroll";
import { BackToPayslip, FormFooter, TOUCH } from "./drawer-parts";

/**
 * Several named bonuses, or several named deductions, as one figure.
 *
 * ## Where this went
 *
 * It was `LinesDialog`, a modal opened from two of the four links in every table
 * row. The Review step now edits everything in one place, the adjust drawer, so
 * this is the same editor with the same fields, the same rules and the same
 * save, rendered as a view of that drawer instead of a dialog stacked over it.
 * Nothing about what it does has changed.
 *
 * ## Why lines and not a cell
 *
 * A single amount is right for a correction: somebody's tax is wrong, type over
 * it. It cannot express the thing people actually have: **₦50,000 for the Lagos
 * install and ₦20,000 for the weekend cover**, which is one bonus figure on the
 * payslip and two facts about why.
 *
 * A single amount with a single reason forces those two into one, and the loss
 * is not cosmetic. "₦70,000, Lagos install and weekend cover" is a sentence
 * nobody can reconcile against anything twelve months later, when the question
 * is which project the ₦50,000 belonged to. Lines keep the amounts separate
 * and the table keeps showing one total, which is what a payroll table is for.
 *
 * ## The reason is optional, and stays optional
 *
 * A company recording "Bonus" and nothing else is doing something ordinary. The
 * reason is what makes *several* lines legible, not what makes one line valid,
 * and the API's own schema agrees, so demanding one here would be the screen
 * inventing a rule the server does not have.
 *
 * ## Saved whole, once
 *
 * `setLines` replaces every line of one kind. Somebody who adds two lines, edits
 * a third and removes a fourth has made **one** decision, and sending it as four
 * requests makes four, any of which can fail alone and leave the person carrying
 * half of what was meant.
 */
export function LinesEditor({
  runId,
  employeeId,
  name,
  kind,
  onBack,
  onSaved,
}: {
  runId: string;
  employeeId: string;
  name: string;
  kind: "bonus" | "deduction";
  onBack: () => void;
  /** The run was rebuilt. The wizard re-reads it. */
  onSaved: (summary: string) => void;
}) {
  /* Destructured, not held as `actions`.
     ---------------------------------------------------------------------
     `usePayrollActions()` returns a fresh object literal every render, so an
     effect depending on the whole thing re-runs on every render, which re-seeds
     `rows` and **wipes whatever somebody has just typed**. Each function is its
     own `useCallback` over `[isConnected]` and is therefore stable. */
  const { adjustmentLines, setLines } = usePayrollActions();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const lines = await adjustmentLines(runId, employeeId);
        if (cancelled) return;
        const existing = kind === "bonus" ? lines.bonuses : lines.deductions;
        /* One blank row when there is nothing yet, so the view opens on
           something to type into rather than on an empty box and a button. */
        setRows(existing.length > 0 ? existing.map(toRow) : [blank()]);
      } catch (error) {
        if (cancelled) return;
        setFailed(
          error instanceof ApiError
            ? error.message
            : "Those lines could not be read.",
        );
        setRows([blank()]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adjustmentLines, runId, employeeId, kind]);

  const noun = kind === "bonus" ? "bonus" : "deduction";
  const filled = rows.filter((row) => parseKobo(row.amount) !== null);
  const total = filled.reduce(
    (sum, row) => sum + (parseKobo(row.amount) ?? 0),
    0,
  );

  /* A row with something typed into the amount that is not a number. Kept apart
     from "empty", which is an ordinary row somebody has not filled in yet and
     which is simply dropped on save. */
  const broken = rows.some(
    (row) => row.amount.trim() !== "" && parseKobo(row.amount) === null,
  );

  /** Was there anything before? Decides whether saving nothing is a removal. */
  const hadLines = rows.length > 0 && rows.some((row) => row.id !== null);

  async function save() {
    setSaving(true);
    setFailed(null);
    try {
      const result = await setLines(runId, {
        employeeId,
        kind,
        lines: filled.map((row) => {
          const amountKobo = parseKobo(row.amount) ?? 0;
          const reason = row.reason.trim();
          /* A reason is omitted rather than sent empty. The API stores null for
             "no reason given" and the payslip line then reads "Bonus" rather
             than "Bonus — ", which is the difference between a line with no
             explanation and one whose explanation is blank. */
          return reason ? { amountKobo, reason } : { amountKobo };
        }),
      });

      onSaved(
        filled.length === 0
          ? `${name}'s ${noun} removed`
          : `${name}: ${formatKobo(result.totalKobo)} ${noun}${
              filled.length > 1 ? ` over ${String(filled.length)} lines` : ""
            }`,
      );
    } catch (error) {
      setFailed(
        error instanceof ApiError
          ? error.message
          : `That ${noun} could not be saved.`,
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flow-root -mb-5">
      <BackToPayslip onBack={onBack} disabled={saving} />

      <p className="mb-5 text-body-sm leading-relaxed text-body">
        {kind === "bonus"
          ? "Taxable, and not pensionable. It shows on the payroll as one figure."
          : "Taken off take-home pay after tax. It shows on the payroll as one figure."}
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {failed && (
            <Callout tone="danger" title="Nothing was saved">
              {failed}
            </Callout>
          )}

          <div className="flex flex-col gap-4">
            {rows.map((row, at) => (
              /* Each row is a named group, so "Amount" and "What it is for" are
                 unambiguous to a screen reader without repeating "line 2" into
                 every visible label. */
              <div
                key={row.key}
                role="group"
                aria-label={`Line ${String(at + 1)}`}
                className="grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-[minmax(0,130px)_minmax(0,1fr)_auto] sm:items-start sm:border-0 sm:p-0"
              >
                <Field
                  label="Amount"
                  hideLabel={at !== 0}
                  /* Only the row somebody has actually broken. An empty row is
                     not an error, it is a row waiting to be filled in, and
                     save drops it. */
                  error={
                    row.amount.trim() !== "" && parseKobo(row.amount) === null
                      ? "A figure, in naira."
                      : undefined
                  }
                >
                  <Input
                    inputMode="decimal"
                    placeholder="0.00"
                    value={row.amount}
                    className="max-sm:h-11"
                    onChange={(event) => {
                      const next = event.target.value;
                      setRows((was) =>
                        was.map((r) =>
                          r.key === row.key ? { ...r, amount: next } : r,
                        ),
                      );
                    }}
                  />
                </Field>
                <Field
                  label="What it is for"
                  hideLabel={at !== 0}
                  help={
                    at === 0
                      ? "Optional. It becomes the payslip line, and it is what makes several lines tell anybody apart a year from now."
                      : undefined
                  }
                >
                  <Input
                    placeholder={
                      kind === "bonus"
                        ? "Lagos install"
                        : "Staff loan repayment"
                    }
                    value={row.reason}
                    maxLength={200}
                    className="max-sm:h-11"
                    onChange={(event) => {
                      const next = event.target.value;
                      setRows((was) =>
                        was.map((r) =>
                          r.key === row.key ? { ...r, reason: next } : r,
                        ),
                      );
                    }}
                  />
                </Field>
                <div className={at === 0 ? "sm:pt-7" : undefined}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remove line ${String(at + 1)}`}
                    /* Never below one row. An empty list is reachable by
                       clearing the amount and saving, which says what it does
                       on the button, rather than by deleting your way to a view
                       with nothing in it. */
                    disabled={rows.length === 1}
                    className="max-sm:min-h-11 max-sm:w-full"
                    onClick={() => {
                      setRows((was) => was.filter((r) => r.key !== row.key));
                    }}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                    <span className="sm:sr-only">Remove this line</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className={TOUCH}
              disabled={rows.length >= MAX_LINES}
              onClick={() => {
                setRows((was) => [...was, blank()]);
              }}
            >
              <Plus aria-hidden="true" className="size-4" />
              Another line
            </Button>
            {rows.length >= MAX_LINES && (
              <p className="mt-2 text-meta text-muted">
                {MAX_LINES} lines is the most one person can carry in a month.
              </p>
            )}
          </div>

          <p className="text-meta text-muted">
            {kind === "bonus"
              ? "A bonus belongs to this payroll only: next month starts with none. " +
                "Something paid every month is a pay component on their record."
              : "This is on top of pension, tax and anything the payroll works out " +
                "itself. It comes off after tax, and it cannot take somebody below nothing."}
          </p>
        </div>
      )}

      <FormFooter
        summary={
          filled.length === 0 ? (
            hadLines ? (
              <span className="text-warning-text">
                Saving now takes {name}&rsquo;s {noun} off entirely.
              </span>
            ) : (
              "Nothing entered yet."
            )
          ) : (
            <>
              <span className="tabular font-medium text-ink">
                {formatKobo(total)}
              </span>{" "}
              over {filled.length} {filled.length === 1 ? "line" : "lines"}
            </>
          )
        }
      >
        <Button
          type="button"
          variant="ghost"
          className={TOUCH}
          onClick={onBack}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="accent"
          className={TOUCH}
          loading={saving}
          /* Nothing entered and nothing to remove is a button that would save
             an empty list over an empty list. It reads as an action and is a
             no-op, so it is dead rather than dressed up. */
          disabled={
            saving || loading || broken || (filled.length === 0 && !hadLines)
          }
          onClick={() => void save()}
        >
          {filled.length === 0
            ? hadLines
              ? `Take the ${noun} off`
              : "Enter an amount"
            : `Save ${formatKobo(total)}`}
        </Button>
      </FormFooter>
    </div>
  );
}

/**
 * The most lines one person may carry, matching the API's own ceiling.
 *
 * A typo guard rather than a policy: twenty separate bonuses in one month is
 * somebody's finger stuck on a key. Kept in step with `linesSchema` on the API.
 */
const MAX_LINES = 20;

type Row = {
  /** Stable across re-renders and edits; the array index is not. */
  key: string;
  /** Null for a row somebody has just added. */
  id: string | null;
  /** As typed. Parsed on save, so a half-typed "12." is not an error yet. */
  amount: string;
  reason: string;
};

let counter = 0;
function blank(): Row {
  counter += 1;
  return { key: `new-${String(counter)}`, id: null, amount: "", reason: "" };
}

function toRow(line: AdjustmentLine): Row {
  return {
    key: line.id,
    id: line.id,
    /* Naira, with the decimals, because that is what somebody typed and what
       they will recognise. Parsed back to kobo on the way out; the round trip
       through a string is exact for whole and fractional naira alike. */
    amount: (line.amountKobo / 100).toFixed(2),
    reason: line.reason ?? "",
  };
}

/**
 * Naira as typed, to integer kobo. Null when it is not a figure.
 *
 * `Math.round` on the last step and never a bare multiply: `12.34 * 100` is
 * 1233.9999999999998 in binary floating point, and truncating that pays
 * somebody a kobo less than they typed. The same rule as `toKobo` on the API.
 */
function parseKobo(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "").replace(/^₦/, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Math.round(Number(trimmed) * 100);
  /* Zero is not a line. Removing one is what an empty list is for, and a
     ₦0.00 bonus on a payslip is a line that explains nothing. */
  return value > 0 ? value : null;
}
