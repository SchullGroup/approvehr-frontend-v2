"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  Field,
  FilterBar,
  Input,
  SegmentedControl,
  Select,
  Tabs,
  formatMoney,
  useToast,
  type AppliedFilter,
  type TabItem,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { usePermissions } from "@/lib/permissions";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useSession } from "@/lib/store/session";
import {
  daysSince,
  useExpenseClaims,
  useExpenseSummary,
  useExpenseTypes,
  type Claim,
  type ClaimStatus,
  type CreateTypeInput,
  type EditClaimInput,
  type ExpenseType,
  type SubmitClaimInput,
  type UpdateTypeInput,
} from "@/lib/store/reimbursements";
import { ApprovalQueue } from "./approval-queue";
import { ClaimForm } from "./claim-form";
import { useListQuery } from "@/lib/use-list-query";
import { ClaimsRegister } from "./claims-register";
import { ExpenseTypes } from "./expense-types";

/**
 * Expenses — one route, rendered by role.
 *
 * PARITY.md's Rule 1. A member of staff opening `/payroll/expenses` sees their
 * own claims and a button to add another. Somebody who approves them also gets
 * the queue and the outstanding total. Whoever owns settings also gets the
 * types. Same URL, so a link shared with a colleague works for them too, and
 * there is no `/payroll/expenses/my-claims` to learn.
 *
 * ## The outstanding total is the first thing on the page
 *
 * Approved and unpaid is money the company owes named people. It is a real
 * liability and an owner should not have to go looking for it, so it is a figure
 * at the top with the oldest claim's date beside it and a button that shows the
 * claims making it up. Claims still awaiting a decision are a separate figure —
 * adding the two together would produce a number that means nothing, because
 * half of it may never be owed at all.
 *
 * Both are shown in full naira and kobo with separators. Nobody can reconcile
 * "₦1.2m" against a bank statement.
 */

type Tab = "claims" | "queue" | "types";
type StatusFilter = "ALL" | ClaimStatus;

/** The chip's wording, in the same four words the badges use. */
const STATE_LABEL: Record<ClaimStatus, string> = {
  SUBMITTED: "Waiting",
  APPROVED: "Owed",
  PAID: "Paid",
  DECLINED: "Declined",
};

const money = (amount: number) => formatMoney(amount, "NGN", { decimals: true });

export function ExpensesScreen() {
  const { mode } = useSession();
  const { can } = usePermissions();
  const toast = useToast();

  const canApprove = can("APPROVE_EXPENSES");
  const canManageTypes = can("MANAGE_SETTINGS");
  const canFileForOthers = can("EDIT_RECORDS");
  const seesEverybody = canApprove || canFileForOthers || can("VIEW_SALARIES");

  /* Always the register first, for everybody. Permissions arrive a moment after
     the first render, so a default that depended on them would land on the
     register and then jump — and the queue is one labelled button away, which is
     the better answer anyway. */
  const [tab, setTab] = useState<Tab>("claims");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [editingClaim, setEditingClaim] = useState<Claim | null>(null);

  /**
   * The register's query.
   *
   * Four parameters chosen for what a claims register is *for*, not the same
   * three every table gets: **state**, **what kind of expense**, and a **date
   * range on when the money went out**. That last pair is the one a claims
   * register cannot do without — the question is always "what did we spend in
   * March", and `incurredOn` is the date that answers it. Not `submittedAt`: a
   * receipt filed in April for a March taxi belongs to March.
   */
  const list = useListQuery<{ status: StatusFilter; typeId: string; from: string; to: string }>({
    filters: { status: "ALL", typeId: "", from: "", to: "" },
    sort: "incurredOn",
    order: "desc",
    pageSize: 25,
  });
  const { status, typeId, from, to } = list.filters;

  const types = useExpenseTypes(includeArchived);
  /**
   * A claim in the approval queue can reference an archived type — the type
   * was retired after somebody claimed against it, not before. Resolving
   * "does this claim need a receipt" must not depend on `includeArchived`,
   * which only controls what the Types *management* tab chooses to show —
   * or an archived type's claims silently stop being checked for a receipt
   * the moment somebody archives it.
   */
  const allTypes = useExpenseTypes(true);
  const register = useExpenseClaims("all", {
    page: list.page,
    pageSize: list.pageSize,
    ...(status === "ALL" ? {} : { status }),
    ...(typeId ? { typeId } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(list.params.q ? { q: list.params.q } : {}),
    ...(list.sort ? { sort: list.sort as "incurredOn" | "amount" | "createdAt" | "status" } : {}),
    order: list.order,
  });
  const queue = useExpenseClaims("pending", {}, canApprove);
  const summary = useExpenseSummary(canApprove);

  /**
   * An approver reads the company's liability, from `GET /summary`. Everybody
   * else reads their own, from an unfiltered read of their own claims.
   *
   * Unfiltered is the point: the register above is filtered and searched, and
   * deriving "owed to you" from it would make the figure change when somebody
   * typed in the search box. A liability that moves when you filter a table is
   * worse than no liability figure at all.
   */
  const own = useExpenseClaims("mine", {}, !canApprove);

  const owed = canApprove
    ? summary.outstanding
    : {
        claimCount: own.outstanding.claimCount,
        amount: own.outstanding.amount,
        oldestIncurredOn:
          own.claims
            .filter((claim) => claim.outstanding)
            .map((claim) => claim.incurredOn)
            .sort((a, b) => a.localeCompare(b))[0] ?? null,
      };

  const awaiting = canApprove ? summary.awaitingDecision : own.awaitingDecision;

  /**
   * What is narrowing the register, as removable chips.
   *
   * Rendered outside the reveal by `FilterBar`. A claims register showing
   * ₦40,000 because a date range from last quarter is still applied — with the
   * count above it agreeing — is precisely the failure Rule 5 names.
   */
  const appliedFilters: AppliedFilter[] = [
    ...(status !== "ALL"
      ? [
          {
            label: "State",
            value: STATE_LABEL[status],
            onClear: () => list.setFilter("status", "ALL" as StatusFilter),
          },
        ]
      : []),
    ...(typeId
      ? [
          {
            label: "Kind",
            value: types.types.find((t) => t.id === typeId)?.name ?? "Selected",
            onClear: () => list.setFilter("typeId", ""),
          },
        ]
      : []),
    ...(from || to
      ? [
          {
            label: "Money went out",
            value: from && to ? `${from} to ${to}` : from ? `from ${from}` : `to ${to}`,
            onClear: () => {
              list.setFilter("from", "");
              list.setFilter("to", "");
            },
          },
        ]
      : []),
    ...(list.params.q
      ? [
          {
            label: "Search",
            value: list.params.q,
            onClear: () => list.setSearch(""),
          },
        ]
      : []),
  ];

  /** Every mutation reports its own outcome. The API's messages are the useful part. */
  async function run(action: () => Promise<unknown>, success: string) {
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
  }

  const tabs = useMemo<TabItem[]>(() => {
    const items: TabItem[] = [
      { id: "claims", label: seesEverybody ? "All claims" : "My claims" },
    ];
    if (canApprove) {
      items.push({
        id: "queue",
        label: "Waiting",
        ...(queue.claims.length > 0 ? { count: queue.claims.length } : {}),
      });
    }
    items.push({ id: "types", label: "Expense types" });
    return items;
  }, [seesEverybody, canApprove, queue.claims.length]);

  const loadError =
    types.error ?? register.error ?? queue.error ?? summary.error ?? own.error;

  return (
    <>
      <PageHeader
        title="Expenses"
        action={
          <Button variant="accent" size="sm" onClick={() => setClaiming(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Claim an expense
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {DEMO_ENABLED && mode === "offline" && (
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
            <Badge tone="warning" size="sm">
              Demo
            </Badge>
            Claims live in this browser only, and refuse exactly what the real
            thing refuses — including approving your own.
          </p>
        )}

        {loadError && (
          <LoadFailure subject="expenses" error={loadError} />
        )}

        {/* The liability, first. */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardBody className="flex flex-wrap items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-muted">
                  {canApprove ? "Owed to staff" : "Owed to you"}
                </p>
                <p className="tabular mt-1 text-h2 text-ink">
                  {money(owed.amount)}
                </p>
                <p className="mt-1.5 text-body-sm text-body">
                  {owed.claimCount === 0
                    ? "Nothing outstanding. Every approved claim has been paid."
                    : `${owed.claimCount} approved ${
                        owed.claimCount === 1 ? "claim" : "claims"
                      }, not paid yet.${
                        owed.oldestIncurredOn
                          ? ` The oldest money went out ${daysSince(owed.oldestIncurredOn)} days ago.`
                          : ""
                      }`}
                </p>

                {canApprove && summary.byType.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                    {summary.byType.map((row) => (
                      <span
                        key={row.typeId}
                        className="text-body-sm text-muted"
                      >
                        {row.type}{" "}
                        <span className="tabular font-medium text-ink">
                          {money(row.amount)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {owed.claimCount > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    /* Both go through `setFilter`/`setSearch`, which return to
                       page one — this can be pressed from page 4 of the
                       register, and "show what is owed" landing on an empty
                       page 4 would read as nothing being owed. */
                    list.clearFilters();
                    list.setFilter("status", "APPROVED");
                    setTab("claims");
                  }}
                >
                  Show what is owed
                </Button>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex h-full flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-body-sm font-medium text-muted">
                  Waiting for a decision
                </p>
                <p className="tabular mt-1 text-h3 text-ink">
                  {money(awaiting.amount)}
                </p>
                <p className="mt-1.5 text-body-sm text-body">
                  {awaiting.claimCount === 0
                    ? "Nothing waiting."
                    : `${awaiting.claimCount} ${
                        awaiting.claimCount === 1 ? "claim" : "claims"
                      }. Not owed until ${canApprove ? "you approve" : "somebody approves"} ${
                        awaiting.claimCount === 1 ? "it" : "them"
                      }.`}
                </p>
              </div>
              {canApprove && awaiting.claimCount > 0 && (
                <Button variant="accent" size="sm" onClick={() => setTab("queue")}>
                  Decide them
                </Button>
              )}
            </CardBody>
          </Card>
        </div>

        <Tabs
          items={tabs}
          value={tab}
          onChange={(next) => setTab(next as Tab)}
        >
          {tab === "claims" && (
            <ClaimsRegister
              title={seesEverybody ? "All claims" : "My claims"}
              description={
                status === "APPROVED"
                  ? "Approved claims. Anything still unpaid is money you owe."
                  : "Newest decisions needed first, then by the date the money went out."
              }
              claims={register.claims}
              types={types.types}
              loading={register.loading}
              showWho={seesEverybody}
              canSettle={canApprove}
              myEmployeeId={register.myEmployeeId}
              onEdit={setEditingClaim}
              onMarkPaid={(claim, paidOn) =>
                run(
                  () => register.markPaid(claim.id, paidOn),
                  `Marked ${money(claim.amount)} to ${claim.employeeName} as paid`,
                )
              }
              emptyAction={
                <Button variant="accent" size="sm" onClick={() => setClaiming(true)}>
                  Claim an expense
                </Button>
              }
              paging={{
                sort: list.sort,
                order: list.order,
                onSort: list.toggleSort,
                page: list.page,
                pageSize: list.pageSize,
                total: register.total,
                onPageChange: list.setPage,
                onPageSizeChange: list.setPageSize,
              }}
              filters={
                <FilterBar
                  search={list.search}
                  onSearchChange={list.setSearch}
                  searchPlaceholder="Search what it was for"
                  searchLabel="Search claims by what the money went on"
                  applied={appliedFilters}
                  onClearAll={list.clearFilters}
                  count={register.total}
                  noun={["claim", "claims"]}
                  actions={
                    <SegmentedControl<StatusFilter>
                      label="Filter claims by state"
                      value={status}
                      onChange={(value) => list.setFilter("status", value)}
                      options={[
                        { value: "ALL", label: "All" },
                        { value: "SUBMITTED", label: "Waiting" },
                        { value: "APPROVED", label: "Owed" },
                        { value: "PAID", label: "Paid" },
                        { value: "DECLINED", label: "Declined" },
                      ]}
                    />
                  }
                >
                  <Field label="Kind of expense">
                    <Select
                      value={typeId}
                      onChange={(event) =>
                        list.setFilter("typeId", event.target.value)
                      }
                    >
                      <option value="">Every kind</option>
                      {types.types.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Money went out from">
                    <Input
                      type="date"
                      value={from}
                      /* Bounded by each other and not by today: reading the
                         clock in render is the hydration trap HANDOVER
                         documents, and a future date simply matches nothing. */
                      max={to || undefined}
                      onChange={(event) => list.setFilter("from", event.target.value)}
                    />
                  </Field>
                  <Field label="…to">
                    <Input
                      type="date"
                      value={to}
                      min={from || undefined}
                      onChange={(event) => list.setFilter("to", event.target.value)}
                    />
                  </Field>
                </FilterBar>
              }
            />
          )}

          {tab === "queue" && canApprove && (
            <ApprovalQueue
              claims={queue.claims}
              types={allTypes.types}
              myEmployeeId={queue.myEmployeeId}
              loading={queue.loading}
              onApprove={async (claim) => {
                await run(
                  () => queue.approve(claim.id),
                  `Approved ${money(claim.amount)} for ${claim.employeeName}`,
                );
              }}
              onDecline={async (claim, reason) => {
                await run(
                  () => queue.decline(claim.id, reason),
                  `Declined ${claim.employeeName}'s claim`,
                );
              }}
            />
          )}

          {tab === "types" && (
            <ExpenseTypes
              types={types.types}
              loading={types.loading}
              canManage={canManageTypes}
              includeArchived={includeArchived}
              onIncludeArchivedChange={setIncludeArchived}
              onCreate={(input: CreateTypeInput) =>
                run(() => types.createType(input), `${input.name} added`)
              }
              onUpdate={(id: string, input: UpdateTypeInput) =>
                run(() => types.updateType(id, input), "Saved")
              }
              /* Archiving answers with a note that may name approved claims
                 still owed, so it is reported instead of a generic success. */
              onArchive={async (type: ExpenseType) => {
                try {
                  const note = await types.archiveType(type.id);
                  toast.push({
                    title: `${type.name} archived`,
                    tone: "success",
                    detail: note,
                  });
                  return true;
                } catch (error) {
                  toast.push({
                    title: "Could not archive it",
                    tone: "danger",
                    detail:
                      error instanceof ApiError
                        ? error.message
                        : "Something went wrong. Try again.",
                  });
                  return false;
                }
              }}
            />
          )}
        </Tabs>
      </PageBody>

      {(claiming || editingClaim) && (
        <ClaimHost
          canFileForOthers={canFileForOthers && editingClaim === null}
          types={types.types}
          claim={editingClaim ?? undefined}
          myEmployeeId={register.myEmployeeId}
          onClose={() => {
            setClaiming(false);
            setEditingClaim(null);
          }}
          onSubmit={async (input) => {
            await register.submit(input);
            toast.push({ title: "Sent for approval", tone: "success" });
          }}
          onEdit={async (id, input) => {
            await register.edit(id, input);
            toast.push({ title: "Claim updated", tone: "success" });
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Wraps the form so the employee directory is only read when it is needed.
 *
 * Filing a claim for somebody else needs `EDIT_RECORDS`, and only then is a list
 * of colleagues any use. Mounting this component behind the same condition means
 * a member of staff opening the form never sends a directory request they have
 * no reason to make.
 */
function ClaimHost({
  canFileForOthers,
  types,
  claim,
  myEmployeeId,
  onClose,
  onSubmit,
  onEdit,
}: {
  canFileForOthers: boolean;
  types: ExpenseType[];
  claim?: Claim | undefined;
  myEmployeeId: string | null;
  onClose: () => void;
  onSubmit: (input: SubmitClaimInput) => Promise<void>;
  onEdit: (id: string, input: EditClaimInput) => Promise<void>;
}) {
  return canFileForOthers ? (
    <ClaimFormForAnyone
      types={types}
      myEmployeeId={myEmployeeId}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  ) : (
    <ClaimForm
      open
      onClose={onClose}
      types={types}
      claim={claim}
      myEmployeeId={myEmployeeId}
      onSubmit={onSubmit}
      onEdit={onEdit}
    />
  );
}

function ClaimFormForAnyone({
  types,
  myEmployeeId,
  onClose,
  onSubmit,
}: {
  types: ExpenseType[];
  myEmployeeId: string | null;
  onClose: () => void;
  onSubmit: (input: SubmitClaimInput) => Promise<void>;
}) {
  const { employees } = useEmployeeDirectory({ pageSize: 200 });

  const colleagues = useMemo(() => {
    const rows = employees.map((employee) => ({
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`,
    }));
    /* The signed-in person first: filing for yourself is the common case. */
    return rows.sort((a, b) => {
      if (a.id === myEmployeeId) return -1;
      if (b.id === myEmployeeId) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [employees, myEmployeeId]);

  return (
    <ClaimForm
      open
      onClose={onClose}
      types={types}
      myEmployeeId={myEmployeeId}
      colleagues={colleagues}
      onSubmit={onSubmit}
    />
  );
}
