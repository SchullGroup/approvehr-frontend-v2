"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Save, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { ExportButton } from "@/components/portal/export-button";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { departments } from "@/lib/api/endpoints";
import { payrollApi } from "@/lib/api/payroll";
import {
  reportsApi,
  totalNote,
  type ApiCell,
  type ApiDataset,
  type ApiReportDefinition,
  type ApiReportResult,
  type ApiSavedReport,
} from "@/lib/api/reports";
import {
  useReportCatalogue,
  useReportMutations,
  useReportRun,
  useSavedReports,
} from "@/lib/store/reports-builder";

/**
 * Build a report.
 *
 * ## The two things on screen that nothing else in this product does
 *
 * **Every total says its own denominator.** `Over 240 rows. 31 have no figure
 * and are not in this total.` That sentence is the difference between a number
 * somebody can act on and one they will be wrong about — a `SUM` over a column
 * with absences in it is the sum of the rows that had a figure, and every
 * reporting tool on the market prints it bare.
 *
 * **A withheld column is named.** Somebody without `VIEW_SALARIES` running a
 * pay report gets the report, minus those columns, with a callout saying which
 * and why. Not a blank column, which invites a sum, and not an unexplained
 * refusal, which reads as a bug.
 *
 * ## Running is a button, never a keystroke
 *
 * A report can be a read over every person in the company. A builder that
 * re-ran on every column tick would fire one per click.
 */
export function ReportBuilderScreen() {
  const catalogue = useReportCatalogue();
  const saved = useSavedReports();
  const runner = useReportRun();

  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [groupBy, setGroupBy] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const dataset = useMemo(
    () => catalogue.data?.find((each) => each.id === datasetId) ?? null,
    [catalogue.data, datasetId],
  );

  const definition: ApiReportDefinition | null =
    dataset && columns.length > 0
      ? {
          dataset: dataset.id,
          columns,
          filters,
          ...(groupBy ? { groupBy } : {}),
        }
      : null;

  const choose = (id: string) => {
    setDatasetId(id);
    /* Columns, filters and a grouping all belong to the dataset that was open.
       Carrying them across would send column keys the new dataset has never
       heard of, and the API would refuse with a message about a rename that
       never happened. */
    setColumns([]);
    setFilters({});
    setGroupBy("");
    runner.clear();
  };

  return (
    <>
      <PageHeader
        breadcrumb={[{ href: "/reports", label: "Reports" }]}
        title="Build a report"
        meta={
          <span className="text-meta text-faint">
            Pick what one row is, then the columns. Every total says how many
            rows it covers.
          </span>
        }
      />
      <PageBody>
        {!catalogue.available ? (
          <Callout tone="info" title="This needs the API">
            {catalogue.refusal}
          </Callout>
        ) : catalogue.error ? (
          <LoadFailure
            subject="what can be reported on"
            error={catalogue.error}
            onRetry={catalogue.reload}
          />
        ) : catalogue.loading || !catalogue.data ? (
          <Spinner label="Loading" />
        ) : (
          <div className="flex flex-col gap-6">
            <SavedList read={saved} />

            <Card>
              <CardHeader
                level={2}
                title="What are you reporting on?"
                description="One row of the report is one of these."
              />
              <CardBody className="grid gap-3 sm:grid-cols-3">
                {catalogue.data.map((each) => (
                  <DatasetCard
                    key={each.id}
                    dataset={each}
                    chosen={each.id === datasetId}
                    onChoose={() => choose(each.id)}
                  />
                ))}
              </CardBody>
            </Card>

            {dataset && (
              <Card>
                <CardHeader
                  level={2}
                  title="Columns"
                  description={dataset.rowIs}
                  action={
                    <Badge tone="neutral" size="sm">
                      {columns.length} chosen
                    </Badge>
                  }
                />
                <CardBody className="flex flex-col gap-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {dataset.columns.map((column) => (
                      <Checkbox
                        key={column.key}
                        label={
                          column.available
                            ? column.label
                            : `${column.label} — needs ${column.permission ?? "a permission"}`
                        }
                        checked={columns.includes(column.key)}
                        disabled={!column.available}
                        onChange={(event) =>
                          setColumns((current) =>
                            event.target.checked
                              ? [...current, column.key]
                              : current.filter((key) => key !== column.key),
                          )
                        }
                      />
                    ))}
                  </div>

                  <Filters
                    dataset={dataset}
                    filters={filters}
                    onChange={setFilters}
                  />

                  <Field
                    label="Group by"
                    help="One column. Everything numeric you chose is totalled per group, and an absence gets its own group rather than joining another."
                  >
                    <Select
                      value={groupBy}
                      onChange={(event) => setGroupBy(event.target.value)}
                    >
                      <option value="">No grouping — one row each</option>
                      {dataset.columns
                        .filter(
                          (column) => column.groupable && column.available,
                        )
                        .map((column) => (
                          <option key={column.key} value={column.key}>
                            {column.label}
                          </option>
                        ))}
                    </Select>
                  </Field>

                  <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
                    <Button
                      variant="accent"
                      loading={runner.running}
                      disabled={definition === null}
                      onClick={() => {
                        if (definition) void runner.run(definition);
                      }}
                    >
                      <Play aria-hidden="true" className="size-4" />
                      Run it
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={runner.result === null}
                      onClick={() => setSaving(true)}
                    >
                      <Save aria-hidden="true" className="size-4" />
                      Save this report
                    </Button>
                    {columns.length === 0 && (
                      <span className="text-meta text-faint">
                        Choose at least one column.
                      </span>
                    )}
                  </div>
                </CardBody>
              </Card>
            )}

            {runner.error && (
              <Callout tone="danger" title="That was refused">
                {runner.error.message}
              </Callout>
            )}
            {runner.result && <Result result={runner.result} />}
          </div>
        )}
      </PageBody>
      {saving && definition && (
        <SaveDialog
          definition={definition}
          onClose={() => setSaving(false)}
          onDone={() => {
            setSaving(false);
            saved.reload();
          }}
        />
      )}
    </>
  );
}

function DatasetCard({
  dataset,
  chosen,
  onChoose,
}: {
  dataset: ApiDataset;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChoose}
      disabled={!dataset.available}
      className={`flex flex-col gap-1 rounded-md border p-3 text-left ${
        chosen ? "border-accent bg-accent-subtle" : "border-line bg-surface"
      } disabled:opacity-60`}
    >
      <span className="text-body-sm font-medium text-body">
        {dataset.label}
      </span>
      <span className="text-meta text-faint">{dataset.rowIs}</span>
      {/* Listed rather than hidden: a dataset that vanishes without a permission
          reads as a product that does not have it, and then nobody asks. */}
      {!dataset.available && (
        <span className="text-meta text-muted">
          Needs {dataset.needs.join(", ")}
        </span>
      )}
    </button>
  );
}

/**
 * A `select` whose options are this company's own rows.
 *
 * Fetched once per builder rather than per filter, and only for the sources a
 * dataset actually declares — a leave report should not pull the payroll runs.
 */
function useFilterOptions(dataset: ApiDataset | null) {
  const sources = useMemo(
    () =>
      new Set(
        (dataset?.filters ?? [])
          .map((filter) => filter.optionsFrom)
          .filter((source): source is "departments" | "payrollRuns" =>
            Boolean(source),
          ),
      ),
    [dataset],
  );
  const [options, setOptions] = useState<
    Record<string, { value: string; label: string }[]>
  >({});

  useEffect(() => {
    if (sources.size === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    void (async () => {
      const next: Record<string, { value: string; label: string }[]> = {};
      try {
        if (sources.has("departments")) {
          const tree = await departments.tree(false, controller.signal);
          next["departments"] = tree.flat.map((each) => ({
            value: each.id,
            label: each.name,
          }));
        }
        if (sources.has("payrollRuns")) {
          const { runs } = await payrollApi.runs(
            { take: 24 },
            controller.signal,
          );
          next["payrollRuns"] = runs.map((run) => ({
            value: run.id,
            /* The period and the status, because "which run" on a month with
               an off-cycle one beside it is otherwise unanswerable. */
            label: `${run.period} — ${run.status.toLowerCase()}`,
          }));
        }
        if (!cancelled) setOptions(next);
      } catch {
        /* An options list that will not load leaves the filter empty and says
           so below, rather than taking the whole builder down with it. */
        if (!cancelled) setOptions({});
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [sources]);

  return options;
}

function Filters({
  dataset,
  filters,
  onChange,
}: {
  dataset: ApiDataset;
  filters: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
}) {
  const fetched = useFilterOptions(dataset);
  if (dataset.filters.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {dataset.filters.map((filter) => (
        <Field
          key={filter.key}
          label={filter.required ? `${filter.label} (required)` : filter.label}
          {...(filter.note ? { help: filter.note } : {})}
        >
          {filter.kind === "select" ? (
            <Select
              value={filters[filter.key] ?? ""}
              onChange={(event) =>
                onChange({ ...filters, [filter.key]: event.target.value })
              }
            >
              <option value="">{filter.required ? "Choose one" : "Any"}</option>
              {(filter.options ?? []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {(fetched[filter.optionsFrom ?? ""] ?? []).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              type={filter.kind === "date" ? "date" : "text"}
              value={filters[filter.key] ?? ""}
              onChange={(event) =>
                onChange({ ...filters, [filter.key]: event.target.value })
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}

/** One cell. Money is money; an absence is an em dash and never a zero. */
function Cell({ value, kind }: { value: ApiCell; kind: string }) {
  if (value === null) return <span className="text-faint">—</span>;
  if (kind === "money" && typeof value === "number") {
    return <Money amount={value / 100} decimals />;
  }
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  return <>{String(value)}</>;
}

function Result({ result }: { result: ApiReportResult }) {
  return (
    <Card>
      <CardHeader
        level={2}
        title={result.grouped ? `Grouped by ${result.grouped.label}` : "Result"}
        description={
          result.grouped
            ? `${String(result.rowCount)} groups, over ${String(result.grouped.rows)} rows.`
            : `${String(result.rowCount)} rows.`
        }
      />
      <CardBody className="flex flex-col gap-4">
        {result.withheld.length > 0 && (
          <Callout tone="warning" title="Some columns are not shown to you">
            {result.withheld.map((each) => (
              <p key={each.key}>
                <strong>{each.label}</strong> — {each.reason}
              </p>
            ))}
          </Callout>
        )}
        {result.truncated && (
          <Callout tone="warning" title="There is more behind this">
            This report hit the row limit. Narrow it with a filter to see the
            rest — what is below is not the whole answer.
          </Callout>
        )}

        {result.rows.length === 0 ? (
          <EmptyState
            title="Nothing matched"
            description="No rows came back for those filters. That is an empty answer, not a failed one."
          />
        ) : (
          <>
            <div className="hidden sm:block">
              <TableWrap>
                <THead>
                  <TR>
                    {result.columns.map((column) => (
                      <TH key={column.key}>{column.label}</TH>
                    ))}
                  </TR>
                </THead>
                <TBody>
                  {result.rows.map((row, index) => (
                    <TR key={index}>
                      {row.map((cell, cellIndex) => (
                        <TD key={cellIndex}>
                          <Cell
                            value={cell}
                            kind={result.columns[cellIndex]?.kind ?? "text"}
                          />
                        </TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </TableWrap>
            </div>

            {/* A report's columns are whatever the reader chose, so there is no
                fixed shape to design a card around — the first column stands
                in for a title (it is what the reader put first) and every
                other column is a label/value row, generic over any dataset. */}
            <ul className="divide-y divide-line sm:hidden">
              {result.rows.map((row, index) => (
                <li
                  key={index}
                  className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0"
                >
                  {row.length > 0 && (
                    <p className="text-body-sm font-medium text-ink">
                      <Cell
                        value={row[0] ?? null}
                        kind={result.columns[0]?.kind ?? "text"}
                      />
                    </p>
                  )}
                  {row.slice(1).map((cell, cellIndex) => (
                    <div
                      key={cellIndex + 1}
                      className="flex items-center justify-between gap-3"
                    >
                      <span className="text-body-sm text-muted">
                        {result.columns[cellIndex + 1]?.label}
                      </span>
                      <span className="text-body-sm text-ink">
                        <Cell
                          value={cell}
                          kind={result.columns[cellIndex + 1]?.kind ?? "text"}
                        />
                      </span>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </>
        )}

        {result.totals.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-line pt-4">
            <p className="text-body-sm font-medium text-body">Totals</p>
            {result.totals.map((total) => {
              const column = result.columns.find(
                (each) => each.key === total.column,
              );
              return (
                <p key={total.column} className="text-body-sm text-body">
                  <span className="text-muted">
                    {column?.label ?? total.column}:
                  </span>{" "}
                  {/* Never rendered as 0. `null` means nothing was present,
                      which is a different fact from a total of nothing. */}
                  {total.value === null ? (
                    <span className="text-faint">no figure recorded</span>
                  ) : column?.kind === "money" ? (
                    <Money amount={total.value / 100} decimals />
                  ) : (
                    total.value
                  )}
                  <span className="ml-2 text-meta text-faint">
                    {totalNote(total)}
                  </span>
                </p>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SavedList({ read }: { read: ReturnType<typeof useSavedReports> }) {
  const mutations = useReportMutations();
  const toast = useToast();

  if (!read.available || read.loading) return null;
  if (read.error) {
    return (
      <LoadFailure
        subject="your saved reports"
        error={read.error}
        onRetry={read.reload}
      />
    );
  }
  if (!read.data || read.data.length === 0) return null;

  return (
    <Card>
      <CardHeader
        level={2}
        title="Saved reports"
        description="A saved report is the question, not the answer — running it reads again."
      />
      <CardBody className="flex flex-col gap-2">
        {read.data.map((report) => (
          <SavedRow
            key={report.id}
            report={report}
            onRemove={() => {
              void (async () => {
                try {
                  await mutations.remove(report.id);
                  toast.push({ tone: "success", title: "Deleted" });
                  read.reload();
                } catch (error) {
                  toast.push({
                    tone: "danger",
                    title:
                      error instanceof ApiError
                        ? error.message
                        : "Could not delete it.",
                  });
                }
              })();
            }}
          />
        ))}
      </CardBody>
    </Card>
  );
}

function SavedRow({
  report,
  onRemove,
}: {
  report: ApiSavedReport;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-body">{report.name}</p>
        <p className="text-meta text-faint">
          {report.datasetLabel ?? "Dataset no longer exists"}
          {report.description ? ` · ${report.description}` : ""}
        </p>
      </div>
      {report.shared && (
        <Badge tone="info" size="sm">
          Shared
        </Badge>
      )}
      <ExportButton
        label="Download"
        download={() => reportsApi.download(report.id, report.name)}
      />
      {report.mine && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Delete ${report.name}`}
          className="text-faint hover:text-body"
        >
          <Trash2 aria-hidden="true" className="size-4" />
        </button>
      )}
    </div>
  );
}

function SaveDialog({
  definition,
  onClose,
  onDone,
}: {
  definition: ApiReportDefinition;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useReportMutations();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Save this report"
      description="The question, not the answer. Running it later reads again."
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={name.trim() === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.save({
                    name,
                    ...(description ? { description } : {}),
                    definition,
                    shared,
                  });
                  toast.push({ tone: "success", title: "Saved" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Save it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Pay by department"
          />
        </Field>
        <Field label="What it is for" help="Optional.">
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Checkbox
          label="Share it with everybody"
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
        />
        <p className="text-meta text-faint">
          Sharing never widens a permission. Somebody who cannot see pay opens a
          shared pay report and gets it without those columns, and is told which
          are missing.
        </p>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
