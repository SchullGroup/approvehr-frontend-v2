"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownToLine,
  Banknote,
  Landmark,
  Plus,
  ScrollText,
} from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
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
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { naira, type ApiPaymentBatch } from "@/lib/api/payments";
import { usePermissions } from "@/lib/permissions";
import {
  BATCH_STATUS,
  usePaymentActions,
  usePaymentBatches,
  usePaymentsSummary,
  usePayableRuns,
} from "@/lib/store/payments";
import { downloadCsv } from "@/lib/csv";
import { BuildBatchModal } from "./build-batch-modal";
import { longDate } from "./format";
import { LedgerPanel } from "./ledger-panel";

/**
 * Payments.
 *
 * ## What this screen is for
 *
 * One question: what is waiting to go out, and what has actually left the
 * account. Those are two different figures and the tiles keep them apart —
 * "waiting to go out" is a batch somebody built, "left the account" is a bank
 * statement. Collapsing them is how a payroll product ends up showing money as
 * paid because a button was pressed.
 *
 * ## Bank transfers are not connected
 *
 * There is no payment provider, so nothing here releases money. The way out is
 * the payment file: approve a batch, download it, upload it to your bank. Every
 * approved batch carries that button, so the working path is never more than one
 * click from wherever somebody notices they need it.
 */
export function PaymentsScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const summary = usePaymentsSummary();
  const list = usePaymentBatches({ pageSize: 25 });
  const payable = usePayableRuns();
  const actions = usePaymentActions();
  const toast = useToast();

  const [building, setBuilding] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (permissionsLoading) {
    return (
      <PageBody className="flex items-center justify-center py-24">
        <Spinner />
      </PageBody>
    );
  }

  if (!can("RUN_PAYROLL")) {
    return (
      <>
        <PageHeader title="Payments" />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="Payments are not part of your access"
              description="Only people who run payroll can see payment batches. Ask whoever manages roles if you need it."
              action={<ButtonLink href="/dashboard">Back to home</ButtonLink>}
            />
          </Card>
        </PageBody>
      </>
    );
  }

  async function download(batch: ApiPaymentBatch) {
    setDownloading(batch.id);
    try {
      const file = await actions.downloadFile(batch.id);
      downloadCsv(file.filename, file.csv);
      toast.push({
        title: `${file.filename} saved`,
        tone: "success",
        detail: "Upload it to your bank to pay these people.",
      });
    } catch (error) {
      toast.push({
        title: "No file was produced",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setDownloading(null);
    }
  }

  const provider = summary.summary?.provider;
  const primary = summary.summary?.primaryAccount;
  const thisMonth = summary.summary?.thisMonth;
  /* The newest batch whose file the API will actually produce. `can` comes from
     the server's own view of the state machine, so this cannot offer a download
     the endpoint would refuse. */
  const readyToDownload = list.batches.find((batch) => batch.can.downloadFile);

  /* One batch per run. A run that already has a live batch is refused by the API
     — two batches for one run is how people get paid twice — so those runs are
     dropped here rather than offered and then refused. */
  const claimed = new Set(
    list.batches
      .filter((batch) => batch.status !== "CANCELLED")
      .map((batch) => batch.payrollRunId)
      .filter((id): id is string => id !== null),
  );
  const buildable = payable.runs.filter((run) => !claimed.has(run.id));

  return (
    <>
      <PageHeader
        title="Payments"
        description="What is waiting to go out, and what has left the account."
        meta={
          <Badge tone={list.live ? "success" : "warning"} size="sm" dot>
            {list.live ? "Live from the API" : "Demo data, this browser only"}
          </Badge>
        }
        action={
          buildable.length > 0 ? (
            <Button variant="accent" size="sm" onClick={() => setBuilding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Build a payment batch
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {list.error && (
          <Callout tone="danger" title="Could not load the batches">
            {list.error.message}
          </Callout>
        )}

        {summary.summary && !primary && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-sm text-ink">
                No account for salaries to come from yet.
              </p>
              <ButtonLink href="/settings/bank-accounts" variant="accent" size="sm">
                <Landmark aria-hidden="true" className="size-4" />
                Add a bank account
              </ButtonLink>
            </CardBody>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Waiting to go out"
            value={
              <Money
                amount={naira(summary.summary?.outstanding.totalKobo ?? 0)}
                decimals
              />
            }
            hint={`${summary.summary?.outstanding.count ?? 0} ${
              (summary.summary?.outstanding.count ?? 0) === 1 ? "batch" : "batches"
            }`}
          />
          <Stat
            label={thisMonth ? `Built in ${thisMonth.period}` : "Built this month"}
            value={<Money amount={naira(thisMonth?.totalKobo ?? 0)} decimals />}
            hint={`${thisMonth?.payments ?? 0} ${
              (thisMonth?.payments ?? 0) === 1 ? "payment" : "payments"
            }`}
          />
          <Stat
            label="Left the account"
            value={<Money amount={naira(thisMonth?.settledKobo ?? 0)} decimals />}
            hint="what the ledger says settled"
          />
          <Stat
            label="Paying from"
            value={
              primary ? (
                <span className="text-body font-medium text-ink">
                  {primary.bankName}
                </span>
              ) : (
                <span className="text-body font-medium text-muted">Not set</span>
              )
            }
            hint={primary ? `${primary.accountName} · ${primary.accountNumberMasked}` : undefined}
          />
        </div>

        {/* One line, and beside it the button that does what the line says.
            When no batch is ready to download there is no button, because
            pointing somewhere else would make the line a piece of narration. */}
        {provider && !provider.connected && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-body-sm text-body">
                Bank transfers are not connected yet. Download the payment file and
                upload it to your bank.
              </p>
              {readyToDownload && (
                <Button
                  variant="accent"
                  size="sm"
                  loading={downloading === readyToDownload.id}
                  onClick={() => void download(readyToDownload)}
                >
                  <ArrowDownToLine aria-hidden="true" className="size-4" />
                  Download {readyToDownload.reference}
                </Button>
              )}
            </CardBody>
          </Card>
        )}

        <Card>
          <CardHeader
            title="Payment batches"
            description="Newest first. Open one to see who is being paid and what it comes to."
          />
          {list.loading ? (
            <CardBody className="flex justify-center py-10">
              <Spinner />
            </CardBody>
          ) : list.batches.length === 0 ? (
            <EmptyState
              icon={<Banknote aria-hidden="true" />}
              title="No payment batches yet"
              description="A batch is built from an approved payroll run. Approve this month's run and it will show up here."
              action={<ButtonLink href="/payroll">Go to payroll runs</ButtonLink>}
            />
          ) : (
            <TableWrap
              className="rounded-none border-0"
              caption="Payment batches, newest first"
            >
              <THead>
                <TH>Reference</TH>
                <TH>Pays</TH>
                <TH align="right">People</TH>
                <TH align="right">Total</TH>
                <TH>From</TH>
                <TH>Status</TH>
                <TH align="right">
                  <span className="sr-only">Actions</span>
                </TH>
              </THead>
              <TBody>
                {list.batches.map((batch) => {
                  const status = BATCH_STATUS[batch.status];
                  return (
                    <TR key={batch.id}>
                      <TDPrimary
                        title={
                          <Link
                            href={`/payroll/payments/${batch.id}`}
                            className="hover:text-accent-text hover:underline underline-offset-4"
                          >
                            {batch.reference}
                          </Link>
                        }
                        subtitle={batch.narration ?? undefined}
                      />
                      <TD>{batch.payDate ? longDate(batch.payDate) : "—"}</TD>
                      <TD align="right" className="tabular">
                        {batch.itemCount}
                      </TD>
                      <TD align="right" className="tabular font-medium text-ink">
                        <Money amount={naira(batch.computedTotalKobo)} decimals />
                      </TD>
                      <TD>
                        <span className="text-body-sm">
                          {batch.sourceBankName}
                        </span>
                        <span className="tabular mt-0.5 block text-meta text-muted">
                          {batch.sourceAccountMasked}
                        </span>
                      </TD>
                      <TD>
                        <Badge tone={status.tone} size="sm" dot>
                          {status.label}
                        </Badge>
                      </TD>
                      <TD align="right">
                        <div className="flex justify-end gap-2">
                          {batch.can.downloadFile && (
                            <Button
                              variant="secondary"
                              size="sm"
                              loading={downloading === batch.id}
                              onClick={() => void download(batch)}
                            >
                              <ArrowDownToLine aria-hidden="true" className="size-3.5" />
                              Payment file
                            </Button>
                          )}
                          <ButtonLink
                            href={`/payroll/payments/${batch.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            Open
                          </ButtonLink>
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </TableWrap>
          )}
        </Card>

        <LedgerPanel canRecordFunding={can("MANAGE_SETTINGS")} />

        <p className="flex items-center gap-2 text-body-sm text-muted">
          <ScrollText aria-hidden="true" className="size-4 shrink-0" />
          Every payment file download is recorded in the{" "}
          <Link
            href="/settings/audit"
            className="text-accent-text hover:underline underline-offset-4"
          >
            audit trail
          </Link>
          .
        </p>
      </PageBody>

      {building && (
        <BuildBatchModal
          runs={buildable}
          onClose={() => setBuilding(false)}
          onBuilt={() => {
            setBuilding(false);
            list.reload();
          }}
        />
      )}
    </>
  );
}
