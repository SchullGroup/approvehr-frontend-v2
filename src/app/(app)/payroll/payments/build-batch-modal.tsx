"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Field,
  Modal,
  Money,
  Select,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { naira, type ApiPayableRun } from "@/lib/api/payments";
import { useBankAccounts, usePaymentActions } from "@/lib/store/payments";
import { longDate, monthLabel, people } from "./format";

/**
 * Builds a payment batch from an approved payroll run.
 *
 * Two choices and nothing else: which run, and which account it comes out of.
 * Everything else — the reference, the narration, one instruction per payslip
 * with the employee's bank details copied onto it — the API does, and it does it
 * the same way every time.
 *
 * Building a batch **releases nothing**. It is a list of payments waiting for a
 * check and an approval, which is why this is a small modal rather than a
 * wizard: the consequential screen is the one after it.
 */
export function BuildBatchModal({
  runs,
  onClose,
  onBuilt,
}: {
  runs: ApiPayableRun[];
  onClose: () => void;
  onBuilt: () => void;
}) {
  const accounts = useBankAccounts();
  const actions = usePaymentActions();
  const toast = useToast();
  const router = useRouter();

  const [runId, setRunId] = useState(runs[0]?.id ?? "");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usable = accounts.accounts.filter(
    (account) => !account.archived && account.active,
  );
  const chosenAccount =
    accountId || usable.find((account) => account.isPrimary)?.id || "";
  const run = runs.find((candidate) => candidate.id === runId);

  async function build() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const id = await actions.createBatch(run.id, chosenAccount || undefined);
      toast.push({
        title: `Batch built for ${monthLabel(run.period)}`,
        tone: "success",
        detail: "Check it, then approve it. Nothing has left the account.",
      });
      onBuilt();
      router.push(`/payroll/payments/${id}`);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not work. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Build a payment batch"
      description="One batch per payroll run. Nothing leaves the account until it is checked and approved."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!run || busy}
            loading={busy}
            onClick={() => void build()}
          >
            Build the batch
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-danger-text">
            {error}
          </p>
        )}

        <Field label="Which payroll run" required>
          <Select
            value={runId}
            onChange={(e) => {
              const value = e.target.value;
              setRunId(value);
            }}
          >
            {runs.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {monthLabel(candidate.period)} — {people(candidate.employeeCount)}
              </option>
            ))}
          </Select>
        </Field>

        {run && (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-md border border-line bg-canvas p-4">
            <div>
              <dt className="text-meta font-medium text-muted">Pays</dt>
              <dd className="mt-1 text-body-sm text-ink">{longDate(run.payDate)}</dd>
            </div>
            <div>
              <dt className="text-meta font-medium text-muted">People</dt>
              <dd className="tabular mt-1 text-body-sm text-ink">
                {run.employeeCount}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-meta font-medium text-muted">
                Net pay on the run
              </dt>
              <dd className="mt-1">
                <Money amount={naira(run.totalNetKobo)} decimals size="lg" />
              </dd>
            </div>
          </dl>
        )}

        <Field
          label="Paying from"
          help="The account salaries come from, unless you pick another."
        >
          <Select
            value={chosenAccount}
            onChange={(e) => {
              const value = e.target.value;
              setAccountId(value);
            }}
          >
            {usable.map((account) => (
              <option key={account.id} value={account.id}>
                {account.bankName} {account.accountNumberMasked}
                {account.isPrimary ? " — salaries come from here" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
