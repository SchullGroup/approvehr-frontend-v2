"use client";

import { useMemo, useState } from "react";
import { ArrowRight, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Select,
  SegmentedControl,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { CsvFile } from "@/lib/csv";
import {
  FIELD_OPTIONS,
  mappingProblems,
  noteFor,
  type Mapping,
} from "@/lib/imports/mapping";
import { HEADING, type EmployeeField } from "@/lib/imports/template";

/**
 * Step two: match the columns.
 *
 * The step every other product gets wrong by demanding exact headings. The file
 * is never edited: each of *their* columns gets a dropdown, pre-selected with
 * our best guess, and they can overrule any of it — including telling us to
 * leave a column out.
 *
 * Three things earn their place on this screen:
 *
 * - **A sample value from their own file** beside every heading. `state` and
 *   `state_of_origin` are indistinguishable as words and obvious as soon as you
 *   can see "Lagos" against "Anambra". It is also the fastest way to notice that
 *   a column is shifted.
 * - **Required columns are named when they are missing**, with the words the
 *   template uses, so the fix is "add a column called start_date" rather than
 *   "resolve validation errors".
 * - **The columns being left out are counted, never hidden.** Somebody who
 *   uploads 58 columns and imports 27 should be told which 31 did not come
 *   across before they wonder where the data went, not afterwards.
 */
export function MatchColumns({
  csv,
  mapping,
  onChange,
  onReset,
  onBack,
  onContinue,
  busy,
  retrying = 0,
}: {
  csv: CsvFile;
  mapping: Mapping;
  onChange: (heading: string, field: EmployeeField | "") => void;
  onReset: () => void;
  onBack: () => void;
  onContinue: () => void;
  busy: boolean;
  /**
   * Rows left over from a partial import, when this is a second attempt.
   *
   * Shown rather than assumed: somebody who lands back on this step after 47 of
   * 50 imported needs to know the next check covers three rows and not fifty,
   * because otherwise the counts on the next screen look like a collapse.
   */
  retrying?: number;
}) {
  const [filter, setFilter] = useState<"all" | "matched" | "ignored">("all");

  const problems = useMemo(() => mappingProblems(mapping), [mapping]);
  const matched = csv.headers.filter((heading) => mapping[heading]).length;
  const ignored = csv.headers.length - matched;

  /* The first value that is actually filled in, looked for over the first few
     rows — the first row of a real file has empty cells like any other. */
  const sampleOf = (heading: string): string => {
    for (const row of csv.rows.slice(0, 8)) {
      const value = (row[heading] ?? "").trim();
      if (value !== "") return value;
    }
    return "";
  };

  /** A field is takeable unless another column already claims it. */
  const claimedBy = new Map<EmployeeField, string>();
  for (const [heading, field] of Object.entries(mapping)) {
    if (field && !claimedBy.has(field)) claimedBy.set(field, heading);
  }

  const shown = csv.headers.filter((heading) => {
    if (filter === "matched") return Boolean(mapping[heading]);
    if (filter === "ignored") return !mapping[heading];
    return true;
  });

  const ready =
    problems.missingRequired.length === 0 && problems.duplicates.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {retrying > 0 && (
        <Callout
          tone="info"
          title={`This will check ${retrying} ${retrying === 1 ? "row" : "rows"}, not the whole file`}
        >
          The {retrying === 1 ? "row" : "rows"} that did not import last time,
          with the same columns as before. Everything that landed is already in
          and is not sent again.
        </Callout>
      )}

      {problems.missingRequired.length > 0 && (
        <Callout tone="warning" title="Some columns we have to have are missing">
          <p>
            Every person needs{" "}
            {problems.missingRequired.map((field, index) => (
              <span key={field}>
                {index > 0 && ", "}
                <code className="rounded bg-ink/5 px-1 py-0.5 text-[0.8125rem]">
                  {HEADING[field]}
                </code>
              </span>
            ))}
            . Point a column at{" "}
            {problems.missingRequired.length === 1 ? "it" : "each of them"}{" "}
            below, or add {problems.missingRequired.length === 1 ? "it" : "them"}{" "}
            to your file and choose it again.
          </p>
        </Callout>
      )}

      {problems.duplicates.map((duplicate) => (
        <Callout
          key={duplicate.field}
          tone="warning"
          title={`Two columns are both going into ${HEADING[duplicate.field]}`}
        >
          {duplicate.headings.join(" and ")} cannot both be{" "}
          {HEADING[duplicate.field]}. Pick one and set the other to &ldquo;Do not
          import&rdquo;.
        </Callout>
      ))}

      <Card>
        <CardHeader
          title="Match the columns"
          description="We read the headings in your file and guessed. Change anything we got wrong."
          level={2}
        />

        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.875rem] text-body">
              <span className="font-medium text-ink">{csv.headers.length}</span>{" "}
              columns in your file.{" "}
              <span className="font-medium text-ink">{matched}</span> matched,{" "}
              <span className="font-medium text-ink">{ignored}</span> not
              imported.
            </p>
            {/* Both controls sit here rather than in the card header: on a
                narrow screen a header with an action beside it squeezes the
                description into a four-word column. */}
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                label="Which columns to show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: `All ${csv.headers.length}` },
                  { value: "matched", label: `Matched ${matched}` },
                  { value: "ignored", label: `Left out ${ignored}` },
                ]}
              />
              <Button variant="ghost" size="sm" onClick={onReset}>
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Guess again
              </Button>
            </div>
          </div>

          <TableWrap caption="Each column in your file and what it becomes">
            <THead>
              <TH>In your file</TH>
              <TH>An example from it</TH>
              <TH>Becomes</TH>
              <TH>What goes in it</TH>
            </THead>
            <TBody>
              {shown.map((heading) => {
                const field = mapping[heading] ?? "";
                const sample = sampleOf(heading);
                return (
                  <TR key={heading}>
                    <TD className="align-top">
                      <span className="block text-sm font-medium text-ink break-words">
                        {heading}
                      </span>
                      {!field && (
                        <Badge tone="neutral" size="sm" className="mt-1">
                          Not imported
                        </Badge>
                      )}
                    </TD>
                    <TD className="align-top">
                      {sample ? (
                        <span className="text-[0.875rem] text-body break-words">
                          {sample}
                        </span>
                      ) : (
                        <span className="text-[0.875rem] text-faint">
                          Empty in the first rows
                        </span>
                      )}
                    </TD>
                    <TD className="align-top">
                      <Select
                        aria-label={`What the ${heading} column becomes`}
                        value={field}
                        className="min-w-52"
                        onChange={(event) =>
                          onChange(
                            heading,
                            event.currentTarget.value as EmployeeField | "",
                          )
                        }
                      >
                        <option value="">Do not import</option>
                        {FIELD_OPTIONS.map((option) => {
                          const holder = claimedBy.get(option.field);
                          const taken = holder !== undefined && holder !== heading;
                          return (
                            <option
                              key={option.field}
                              value={option.field}
                              disabled={taken}
                            >
                              {option.label}
                              {option.required ? " (needed)" : ""}
                              {taken ? ` — already ${holder}` : ""}
                            </option>
                          );
                        })}
                      </Select>
                    </TD>
                    <TD className="align-top">
                      <span className="text-[0.875rem] text-muted">
                        {field ? noteFor(field) : "This column stays in your file."}
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>

          {shown.length === 0 && (
            <p className="py-6 text-center text-[0.875rem] text-muted">
              Nothing in this view.
            </p>
          )}
        </CardBody>

        <CardFooter className="justify-between">
          <Button variant="ghost" onClick={onBack}>
            Choose a different file
          </Button>
          <Button
            variant="accent"
            onClick={onContinue}
            disabled={!ready}
            loading={busy}
          >
            {retrying > 0
              ? `Check ${retrying} ${retrying === 1 ? "row" : "rows"}`
              : `Check ${csv.rows.length.toLocaleString("en-NG")} ${csv.rows.length === 1 ? "row" : "rows"}`}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
