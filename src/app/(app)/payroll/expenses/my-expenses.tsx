"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, ReceiptText } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Money,
  formatMoney,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api/client";
import {
  useExpenseClaims,
  useExpenseTypes,
  type Claim,
} from "@/lib/store/reimbursements";
import { ClaimForm } from "./claim-form";
import { StatusBadge } from "./claims-register";

/**
 * The employee's own expenses, for `/profile`.
 *
 * Deliberately smaller than the full screen. From their own page a person wants
 * three things and nothing else: what the company still owes them, where each
 * claim has got to, and a way to add another. The register, the filters and the
 * approval queue all live on `/payroll/expenses`, one link away.
 *
 * "Owed to you" is the figure that matters here and it is the same arithmetic
 * the owner's screen calls a liability — approved, not yet paid. Somebody who is
 * ₦184,500.00 out of pocket for a work trip should be able to see that number
 * without asking anybody.
 */
export function MyExpenses({ className }: { className?: string }) {
  const types = useExpenseTypes();
  const mine = useExpenseClaims("mine");
  const toast = useToast();

  const [claiming, setClaiming] = useState(false);
  const [editing, setEditing] = useState<Claim | null>(null);

  const recent = mine.claims.slice(0, 5);

  return (
    <>
      <Card className={cn(className)}>
        <CardHeader
          title="Expenses"
          level={3}
          action={
            <Button variant="secondary" size="sm" onClick={() => setClaiming(true)}>
              <Plus aria-hidden="true" className="size-3.5" />
              Claim
            </Button>
          }
        />

        <CardBody className="flex flex-col gap-4">
          <LoadFailure subject="your expense claims" error={mine.error}  onRetry={mine.reload}/>

          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <div>
              <p className="text-body-sm text-muted">Owed to you</p>
              <p className="tabular mt-0.5 text-h4 text-ink">
                {formatMoney(mine.outstanding.amount, "NGN", { decimals: true })}
              </p>
            </div>
            <div>
              <p className="text-body-sm text-muted">Waiting for a decision</p>
              <p className="tabular mt-0.5 text-h4 text-ink">
                {formatMoney(mine.awaitingDecision.amount, "NGN", {
                  decimals: true,
                })}
              </p>
            </div>
          </div>

          {recent.length === 0 ? (
            <EmptyState
              compact
              icon={<ReceiptText aria-hidden="true" />}
              title={mine.loading ? "Loading…" : "No claims yet"}
              description={
                mine.loading
                  ? "Reading your claims."
                  : "Claim a bus fare, fuel or a hotel night and it appears here."
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {recent.map((claim) => (
                <li
                  key={claim.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body text-ink">
                      {claim.description}
                    </span>
                    <span className="block text-meta text-muted">
                      {claim.type} · spent {claim.incurredOn}
                    </span>
                    {claim.status === "DECLINED" && claim.declinedReason && (
                      <span className="mt-0.5 block text-body-sm text-body">
                        {claim.declinedReason}
                      </span>
                    )}
                  </span>

                  <span className="tabular text-body font-medium text-ink">
                    <Money amount={claim.amount} decimals />
                  </span>

                  <StatusBadge claim={claim} />

                  {claim.editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(claim)}
                    >
                      Edit
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {mine.claims.length > recent.length && (
            <Link
              href="/payroll/expenses"
              className="text-body-sm text-accent-text underline-offset-4 hover:underline"
            >
              See all {mine.claims.length} claims
            </Link>
          )}
        </CardBody>
      </Card>

      {(claiming || editing) && (
        <ClaimForm
          open
          onClose={() => {
            setClaiming(false);
            setEditing(null);
          }}
          types={types.types}
          claim={editing ?? undefined}
          myEmployeeId={mine.myEmployeeId}
          onSubmit={async (input) => {
            await mine.submit(input);
            toast.push({ title: "Sent for approval", tone: "success" });
          }}
          onEdit={async (id, input) => {
            await mine.edit(id, input);
            toast.push({ title: "Claim updated", tone: "success" });
          }}
        />
      )}
    </>
  );
}

/* Re-exported so a caller that only wants the error type does not reach into
   the API client. `MyExpenses` surfaces API messages verbatim. */
export type { ApiError };
