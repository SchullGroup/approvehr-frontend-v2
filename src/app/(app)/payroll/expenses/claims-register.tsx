"use client";

import { useState } from "react";
import { ReceiptText } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Pagination,
  SortableTH,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  type BadgeTone,
} from "@/components/ui";
import type { SortOrder } from "@/lib/use-list-query";
import { today, type Claim, type ExpenseType } from "@/lib/store/reimbursements";
import { ReceiptCell } from "./approval-queue";

/**
 * Every claim, whatever state it is in.
 *
 * ## Four words for four states
 *
 * "Waiting", "Owed", "Paid", "Declined". Not the enum. An approved claim that
 * nobody has paid is **owed** — it is a debt to a named member of staff, and
 * calling it "Approved" hides that from the one person who needs to see it. A
 * paid one says how it was settled, because a claim paid through payroll appears
 * on a payslip and one paid by transfer does not, and whoever is reconciling a
 * bank statement has to be able to tell them apart.
 */
const STATUS: Record<Claim["status"], { tone: BadgeTone; label: string }> = {
  SUBMITTED: { tone: "warning", label: "Waiting" },
  APPROVED: { tone: "accent", label: "Owed" },
  PAID: { tone: "success", label: "Paid" },
  DECLINED: { tone: "neutral", label: "Declined" },
};

export function StatusBadge({ claim }: { claim: Claim }) {
  const { tone, label } = STATUS[claim.status];
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge tone={tone} size="sm" dot>
        {label}
      </Badge>
      {claim.status === "PAID" && claim.settledThrough && (
        <span className="text-meta text-muted">
          {claim.settledThrough === "payroll" ? "on a payslip" : "by transfer"}
        </span>
      )}
    </span>
  );
}

export function ClaimsRegister({
  title,
  description,
  claims,
  types,
  loading,
  showWho,
  canSettle,
  myEmployeeId,
  filters,
  paging,
  onEdit,
  onMarkPaid,
  emptyAction,
}: {
  title: string;
  description?: string;
  claims: Claim[];
  types: ExpenseType[];
  loading: boolean;
  /** Off when the list is only ever the reader's own claims. */
  showWho: boolean;
  /** `APPROVE_EXPENSES`. Settling is the same finance role that approved it. */
  canSettle: boolean;
  myEmployeeId: string | null;
  filters?: React.ReactNode;
  /** Sorting and paging, from the caller's `useListQuery`. */
  paging?: {
    sort: string | undefined;
    order: SortOrder;
    onSort: (column: string, startDescending?: boolean) => void;
    page: number;
    pageSize: number;
    /** The server's count under the filter. `undefined` while unknown. */
    total: number | undefined;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  onEdit?: (claim: Claim) => void;
  onMarkPaid?: (claim: Claim, paidOn: string) => Promise<boolean>;
  emptyAction?: React.ReactNode;
}) {
  const [settling, setSettling] = useState<Claim | null>(null);

  /** A sortable header when the caller passes a query, a plain one otherwise. */
  const column = (
    key: string,
    text: string,
    options: { align?: "left" | "right"; startDescending?: boolean } = {},
  ) =>
    paging ? (
      <SortableTH
        column={key}
        active={paging.sort}
        order={paging.order}
        onSort={paging.onSort}
        {...(options.align ? { align: options.align } : {})}
        {...(options.startDescending ? { startDescending: true } : {})}
      >
        {text}
      </SortableTH>
    ) : (
      <TH {...(options.align ? { align: options.align } : {})}>{text}</TH>
    );

  return (
    <>
      <Card>
        <CardHeader title={title} {...(description ? { description } : {})} />

        {/* The filter bar gets its own full-width row rather than
            `CardHeader`'s action slot: that slot is `shrink-0`, so a search box
            and a five-way control in it squeeze the heading to one character per
            line below about 900px. */}
        {filters && <CardBody className="border-b border-line">{filters}</CardBody>}

        {claims.length === 0 ? (
          <EmptyState
            icon={<ReceiptText aria-hidden="true" />}
            title={loading ? "Loading…" : "No claims here"}
            description={
              loading
                ? "Reading the claims."
                : "Nothing matches. Claims appear here the moment they are sent."
            }
            {...(emptyAction && !loading ? { action: emptyAction } : {})}
          />
        ) : (
          <TableWrap className="rounded-none border-0" caption={title}>
            <THead>
              {showWho && <TH>Who</TH>}
              <TH>What for</TH>
              {column("incurredOn", "Spent on", { startDescending: true })}
              {column("amount", "Amount", {
                align: "right",
                startDescending: true,
              })}
              <TH>Receipt</TH>
              {column("status", "State")}
              <TH align="right">
                <span className="sr-only">Actions</span>
              </TH>
            </THead>
            <TBody>
              {claims.map((claim) => {
                const mine = claim.employeeId === myEmployeeId;
                return (
                  <TR key={claim.id}>
                    {showWho && (
                      <TD>
                        <span className="block font-medium text-ink">
                          {claim.employeeName}
                        </span>
                        <span className="block text-meta text-muted">
                          {claim.employeeNo}
                        </span>
                      </TD>
                    )}

                    <TD className="max-w-88">
                      <span className="block text-ink">{claim.description}</span>
                      <span className="block text-meta text-muted">
                        {claim.type}
                      </span>
                      {claim.status === "DECLINED" && claim.declinedReason && (
                        <span className="mt-1 block text-body-sm text-body">
                          {claim.approvedByName
                            ? `${claim.approvedByName}: `
                            : ""}
                          {claim.declinedReason}
                        </span>
                      )}
                    </TD>

                    <TD className="tabular text-body">{claim.incurredOn}</TD>

                    <TD align="right" className="tabular font-medium text-ink">
                      <Money amount={claim.amount} decimals />
                    </TD>

                    <TD>
                      <ReceiptCell claim={claim} types={types} />
                    </TD>

                    <TD>
                      <StatusBadge claim={claim} />
                    </TD>

                    <TD align="right">
                      <div className="flex justify-end gap-1.5">
                        {claim.editable && mine && onEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit(claim)}
                          >
                            Edit
                          </Button>
                        )}
                        {claim.outstanding && canSettle && onMarkPaid && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSettling(claim)}
                          >
                            Mark paid
                          </Button>
                        )}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </TableWrap>
        )}

        {paging && claims.length > 0 && (
          <Pagination
            page={paging.page}
            pageSize={paging.pageSize}
            total={paging.total}
            onPageChange={paging.onPageChange}
            onPageSizeChange={paging.onPageSizeChange}
            noun={["claim", "claims"]}
            loading={loading}
          />
        )}
      </Card>

      {settling && onMarkPaid && (
        <MarkPaidDialog
          claim={settling}
          onClose={() => setSettling(null)}
          onConfirm={async (paidOn) => {
            const ok = await onMarkPaid(settling, paidOn);
            if (ok) setSettling(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Settling a claim outside payroll.
 *
 * This records that the money went; it does not send it. The date matters
 * because it is what a bank statement will be matched against, so it is asked
 * for rather than assumed — defaulted to today, which is right nearly always.
 */
function MarkPaidDialog({
  claim,
  onClose,
  onConfirm,
}: {
  claim: Claim;
  onClose: () => void;
  onConfirm: (paidOn: string) => Promise<void>;
}) {
  const [paidOn, setPaidOn] = useState(today());
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Mark this as paid"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={busy || paidOn > today()}
            onClick={() => {
              setBusy(true);
              void onConfirm(paidOn).finally(() => setBusy(false));
            }}
          >
            Mark paid
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-body">
          <span className="tabular font-medium text-ink">
            <Money amount={claim.amount} decimals />
          </span>{" "}
          to {claim.employeeName}, for {claim.description.toLowerCase()}.
        </p>
        <Field
          label="Paid on"
          help="The day the transfer left, so it matches your bank statement."
        >
          <Input
            type="date"
            className="w-48"
            max={today()}
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}
