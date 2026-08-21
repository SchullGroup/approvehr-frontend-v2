"use client";

import { useState } from "react";
import Link from "next/link";
import { Banknote, Landmark, TriangleAlert } from "lucide-react";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  Spinner,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { naira } from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  BATCH_STATUS,
  usePaymentActions,
  usePaymentBatch,
  usePaymentsSummary,
} from "@/lib/store/payments";
import { downloadCsv } from "@/lib/csv";
import { longDate, longDateTime, monthLabel, people } from "../format";
import { CheckPanel } from "./check-panel";
import { ReleasePanel } from "./release-panel";

/**
 * One payment batch. The most consequential screen in the product.
 *
 * ## It is deliberately plain
 *
 * Four facts, in one block, before anything else: **who** is being paid, **how
 * much**, **which account** it leaves, and **when**. Then the check. Then the
 * one button that does something, named with the amount in it.
 *
 * No sparklines, no ring charts, nothing computed for effect. Somebody is about
 * to move a month of their company's salaries and every pixel that is not one of
 * those facts is in the way.
 *
 * ## Figures are never abbreviated here
 *
 * ₦4,233,291.88, never ₦4.2m. This is a figure somebody reconciles against a
 * bank statement, and an abbreviation loses the kobo that make it match.
 *
 * ## Bank transfers are not connected
 *
 * See `release-panel.tsx`. The short version: Release is disabled with one line
 * saying why, and the payment file is the primary action because it is the thing
 * that works.
 */
export function BatchDetailScreen({ id }: { id: string }) {
  const { can, loading: permissionsLoading } = usePermissions();
  const { batch, loading, error, live } = usePaymentBatch(id);
  const summary = usePaymentsSummary();
  const actions = usePaymentActions();
  const toast = useToast();

  const [busy, setBusy] = useState(false);
  const [rechecking, setRechecking] = useState(false);

  if (permissionsLoading || loading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  if (!can("RUN_PAYROLL")) {
    return (
      <>
        <PageHeader title="Payment batch" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="Payments are not part of your access"
              description="Only people who run payroll can see payment batches."
              action={<ButtonLink href="/dashboard">Back to home</ButtonLink>}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  if (!batch) {
    return (
      <>
        <PageHeader
          title="Payment batch"
          breadcrumb={[
            { href: "/payroll", label: "Payroll" },
            { href: "/payroll/payments", label: "Payments" },
          ]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="That batch is not here"
              description={
                error
                  ? error.message
                  : live
                    ? "It may have been cancelled, or it belongs to another company."
                    : "Batches created in another browser are not in this one — demo data is per-browser."
              }
              action={
                <ButtonLink href="/payroll/payments" variant="accent">
                  All payment batches
                </ButtonLink>
              }
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const status = BATCH_STATUS[batch.status];
  const providerConnected = summary.summary?.provider.connected ?? false;
  /* Captured before the callbacks below close over it, so nothing has to assert
     that a batch narrowed above is still non-null inside a handler. */
  const current = batch;

  /** Every action reports its own outcome — the API's messages are the useful part. */
  async function run(action: () => Promise<unknown>, success?: string) {
    setBusy(true);
    try {
      await action();
      if (success) toast.push({ title: success, tone: "success" });
    } catch (caught) {
      toast.push({
        title: "That did not happen",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setBusy(true);
    try {
      const file = await actions.downloadFile(current.id);
      downloadCsv(file.filename, file.csv);
      toast.push({
        title: `${file.filename} saved`,
        tone: "success",
        detail: "Upload it to your bank to pay these people.",
      });
    } catch (caught) {
      toast.push({
        title: "No file was produced",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={batch.reference}
        description={
          batch.period
            ? `${batch.narration ?? monthLabel(batch.period)} · pays ${
                batch.payDate ? longDate(batch.payDate) : "when you send it"
              }`
            : (batch.narration ?? undefined)
        }
        breadcrumb={[
          { href: "/payroll", label: "Payroll" },
          { href: "/payroll/payments", label: "Payments" },
        ]}
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone} size="sm" dot>
              {status.label}
            </Badge>
            <Badge tone={live ? "success" : "warning"} size="sm" dot>
              {live ? "Live from the API" : "Demo data, this browser only"}
            </Badge>
          </span>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {batch.failureReason && (
          <Callout tone="warning" title="What happened to this batch">
            {batch.failureReason}
          </Callout>
        )}

        {/* The four facts. Nothing above them, nothing between them. */}
        <Card>
          <CardBody className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <Fact term="Paying" value={people(batch.itemCount)} />
            <Fact
              term="Total leaving the account"
              value={
                <Money amount={naira(batch.computedTotalKobo)} decimals size="lg" />
              }
            />
            <Fact
              term="From"
              value={
                <span className="flex flex-col gap-0.5">
                  <span className="text-body-sm font-medium text-ink">
                    {batch.sourceBankName}
                  </span>
                  <span className="tabular text-body-sm text-muted">
                    {batch.sourceAccountMasked}
                  </span>
                  <Link
                    href="/settings/bank-accounts"
                    className="mt-0.5 flex items-center gap-1.5 text-body-sm font-medium text-accent-text hover:underline underline-offset-4"
                  >
                    <Landmark aria-hidden="true" className="size-3.5" />
                    Change account
                  </Link>
                </span>
              }
            />
            <Fact
              term="Pay date"
              value={batch.payDate ? longDate(batch.payDate) : "Not set"}
            />
          </CardBody>
        </Card>

        <CheckPanel
          batch={batch}
          rechecking={rechecking}
          onRecheck={() => {
            setRechecking(true);
            void run(async () => {
              const result = await actions.check(batch.id);
              toast.push({
                title: result.ok
                  ? "Everything adds up"
                  : `${result.discrepancies.filter((d) => d.severity === "BLOCKER").length} problems to fix`,
                tone: result.ok ? "success" : "warning",
              });
            }).finally(() => setRechecking(false));
          }}
        />

        <ReleasePanel
          batch={batch}
          providerConnected={providerConnected}
          providerKnown={summary.summary !== null}
          canApprove={can("APPROVE_PAYROLL")}
          busy={busy}
          onApprove={() =>
            run(() => actions.approve(batch.id), `${batch.reference} approved`)
          }
          onRelease={() => run(() => actions.release(batch.id))}
          onCancel={(reason) =>
            run(() => actions.cancel(batch.id, reason), `${batch.reference} stopped`)
          }
          onDownload={download}
        />

        <Card>
          <CardHeader
            level={2}
            title="Who is being paid"
            description="Bank details as they were when this batch was built."
          />
          <TableWrap
            className="rounded-none border-0"
            caption={`The ${batch.itemCount} people in ${batch.reference}`}
          >
            <THead>
              <TH>Name</TH>
              <TH>Bank</TH>
              <TH>Account</TH>
              <TH align="right">Amount</TH>
              <TH>Payment</TH>
            </THead>
            <TBody>
              {batch.instructions.map((row) => (
                <TR key={row.id}>
                  <TDPrimary
                    title={
                      <Link
                        href={`/people/${row.employeeId}`}
                        className="hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {row.payeeName}
                      </Link>
                    }
                  />
                  <TD>
                    {row.bankName.trim().length > 0 ? (
                      row.bankName
                    ) : (
                      <span className="flex items-center gap-1.5 text-danger-text">
                        <TriangleAlert aria-hidden="true" className="size-3.5" />
                        No bank on file
                      </span>
                    )}
                  </TD>
                  <TD className="tabular">
                    {row.accountNumberOk ? (
                      row.accountNumberMasked
                    ) : (
                      <span className="flex items-center gap-1.5 text-danger-text">
                        <TriangleAlert aria-hidden="true" className="size-3.5" />
                        {row.accountNumberMasked === ""
                          ? "None on file"
                          : `${row.accountNumberMasked} — not ten digits`}
                      </span>
                    )}
                  </TD>
                  <TD align="right" className="tabular font-medium text-ink">
                    <Money amount={naira(row.amountKobo)} decimals />
                  </TD>
                  <TD>
                    <InstructionState
                      status={row.status}
                      failureReason={row.failureReason}
                    />
                  </TD>
                </TR>
              ))}
              <TR className="bg-canvas">
                <TDPrimary title="Total" />
                <TD />
                <TD className="tabular text-body-sm text-muted">
                  {people(batch.instructions.length)}
                </TD>
                <TD align="right" className="tabular font-semibold text-ink">
                  <Money amount={naira(batch.check.instructionTotalKobo)} decimals />
                </TD>
                <TD />
              </TR>
            </TBody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader level={2} title="History" />
          <CardBody>
            <dl className="flex flex-col gap-3">
              <HistoryLine term="Built" value={longDateTime(batch.createdAt)} />
              {batch.approvedAt && (
                <HistoryLine
                  term="Approved"
                  value={`${longDateTime(batch.approvedAt)}${
                    batch.approvedByName ? ` by ${batch.approvedByName}` : ""
                  }`}
                />
              )}
              {batch.submittedAt && (
                <HistoryLine term="Sent" value={longDateTime(batch.submittedAt)} />
              )}
              {batch.completedAt && (
                <HistoryLine term="Paid" value={longDateTime(batch.completedAt)} />
              )}
              {batch.providerRef && (
                <HistoryLine
                  term={batch.providerName ?? "Provider reference"}
                  value={batch.providerRef}
                />
              )}
              {!batch.approvedAt && !batch.submittedAt && (
                <HistoryLine
                  term="Money moved"
                  value="None. Nothing has been sent to a bank from here."
                />
              )}
            </dl>
          </CardBody>
        </Card>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** One of the four facts. The term is small, the value is not. */
function Fact({ term, value }: { term: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-meta font-medium uppercase tracking-wide text-muted">
        {term}
      </p>
      <div className="mt-1.5 text-body font-medium text-ink">{value}</div>
    </div>
  );
}

function HistoryLine({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <dt className="min-w-32 text-body-sm text-muted">{term}</dt>
      <dd className="text-body-sm text-ink">{value}</dd>
    </div>
  );
}

/**
 * What happened to one payment.
 *
 * `PENDING` is the only state reachable today and it reads "Not sent" rather
 * than "Pending" — pending suggests something is under way, and nothing is.
 */
function InstructionState({
  status,
  failureReason,
}: {
  status: string;
  failureReason: string | null;
}) {
  const map: Record<string, { label: string; tone: "neutral" | "warning" | "success" | "danger" }> = {
    PENDING: { label: "Not sent", tone: "neutral" },
    SUBMITTED: { label: "Sent", tone: "warning" },
    SETTLED: { label: "Paid", tone: "success" },
    FAILED: { label: "Failed", tone: "danger" },
    REVERSED: { label: "Came back", tone: "danger" },
  };
  const state = map[status] ?? { label: status, tone: "neutral" as const };
  return (
    <span className="flex flex-col gap-1">
      <Badge tone={state.tone} size="sm" dot>
        {state.label}
      </Badge>
      {failureReason && (
        <span className="text-meta text-danger-text">{failureReason}</span>
      )}
    </span>
  );
}
