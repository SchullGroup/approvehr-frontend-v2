"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArchiveX, Info, Lock, Plus, RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  ProgressMeter,
  Select,
  Skeleton,
  Switch,
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
import { leaveApi, type LeaveAccrualWire } from "@/lib/api/leave";
import { EMPLOYEES } from "@/lib/mock/people";
import { usePermissions } from "@/lib/permissions";
import { useCompanySettings } from "@/lib/store/company";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";
import { remainingDays } from "@/lib/workflows/leave";
import { fullName } from "@/lib/types";
import { HolidaysPanel } from "./holidays-panel";

const ACCRUAL_LABEL = {
  annual_upfront: "Granted in full on 1 January",
  monthly: "Accrues monthly",
  on_completion: "Granted when the event occurs",
} as const;

type Accrual = keyof typeof ACCRUAL_LABEL;

const WIRE_TO_LOCAL_ACCRUAL: Record<LeaveAccrualWire, Accrual> = {
  ANNUAL_UPFRONT: "annual_upfront",
  MONTHLY: "monthly",
  ON_COMPLETION: "on_completion",
};
const LOCAL_TO_WIRE_ACCRUAL: Record<Accrual, LeaveAccrualWire> = {
  annual_upfront: "ANNUAL_UPFRONT",
  monthly: "MONTHLY",
  on_completion: "ON_COMPLETION",
};

/** The one shape both sources render the types table through. */
type TypeRow = {
  /** Null in demo mode — a type is matched by name, not an id. */
  id: string | null;
  name: string;
  entitled: number;
  accrual: Accrual;
  carryOverMax: number;
  minNoticeDays: number;
  requiresEvidence: boolean;
};

/**
 * Leave policy.
 *
 * This page is load-bearing, not a preferences screen. `entitled` here is the
 * divisor `leaveBalancesFor` uses, so changing Annual leave from 20 days to 22
 * moves every balance on `/people/leave`, on every employee record, and in the
 * booking dialog's validation.
 *
 * Connected, that sentence is only true if the edit reaches the company's own
 * `LeaveType` row — so this screen now writes through `PATCH /leave/types/:id`
 * for a real company instead of the localStorage-only settings store, which
 * moves nothing any other connected screen reads. The demo keeps writing to
 * `useCompanySettings`, which `leaveBalancesFor` already divides against, so the
 * claim was true there from the start.
 *
 * ## The permission gate sits above the hooks
 *
 * Same reason `AuditScreen` and `WebhooksScreen` split their check into a
 * separate component: checking `MANAGE_SETTINGS` inside the form and returning
 * early would still run every hook below it first, including the connected
 * fetch.
 */
export function LeavePolicyForm() {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <Header />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading leave policies</span>
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        <Header />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot manage leave policies"
              description="Entitlement here is what every balance in the product measures against, so changing it is kept to the people who manage company settings. Ask whoever handles access to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Policy />;
}

function Header() {
  return (
    <PageHeader
      title="Leave policies"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );
}

function Policy() {
  const { settings, updateLeave, updateLeaveType } = useCompanySettings();
  /* Demo-only, and read unconditionally regardless of mode — it is a pure,
     local computation with nothing to fetch, and the rules of hooks forbid
     calling it only sometimes. Its result is simply not rendered connected. */
  const demoBalances = useLeaveBalances();
  const { isConnected } = useSession();
  const toast = useToast();

  /* Demo mode runs on `TODAY`; the real clock would open the calendar on a year
     the seed has nothing in. Same reasoning as `/people/leave`. */
  const calendarYear = Number(
    (isConnected ? new Date().toISOString().slice(0, 10) : TODAY).slice(0, 4),
  );

  const policy = settings.leave;

  /* ---------------------------------------------------------- leave types */

  const [fetched, setFetched] = useState<{
    rows: TypeRow[];
    error: ApiError | null;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const [adding, setAdding] = useState(false);
  /** The row whose switch-off confirm is open. */
  const [archiving, setArchiving] = useState<TypeRow | null>(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  /**
   * Types switched off in this session — the only restore surface there can
   * be, for now. `GET /leave/types` filters archived rows out with no way to
   * ask for them, so once this page reloads a switched-off type is beyond the
   * interface's reach until that endpoint grows an `includeArchived`. The
   * card that renders this list says so in as many words, because a restore
   * button that quietly stops existing on reload is the kind of surprise this
   * product does not spring. On the register as a backend gap.
   */
  const [switchedOff, setSwitchedOff] = useState<
    { id: string; name: string; total: number }[]
  >([]);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const rows = await leaveApi.types();
        if (!cancelled) {
          setFetched({
            rows: rows.map((row) => ({
              id: row.id,
              name: row.name,
              entitled: row.entitledDays,
              accrual: WIRE_TO_LOCAL_ACCRUAL[row.accrual],
              carryOverMax: row.carryOverMax,
              minNoticeDays: row.minNoticeDays,
              requiresEvidence: row.requiresEvidence,
            })),
            error: null,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setFetched({
            rows: [],
            error: error instanceof ApiError ? error : null,
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, tick]);

  const demoRows: TypeRow[] = policy.types.map((type) => ({
    id: null,
    name: type.name,
    entitled: type.entitled,
    accrual: type.accrual,
    carryOverMax: type.carryOverMax,
    minNoticeDays: type.minNoticeDays,
    requiresEvidence: type.requiresEvidence,
  }));

  const types = isConnected ? fetched?.rows ?? [] : demoRows;
  const typesLoading = isConnected && fetched === null;

  async function editType(row: TypeRow, patch: Partial<Omit<TypeRow, "id" | "name">>) {
    if (!isConnected) {
      updateLeaveType(row.name, patch);
      return;
    }
    if (!row.id) return;
    const before = row;
    setFetched(
      (s) =>
        s && {
          ...s,
          rows: s.rows.map((r) => (r.id === row.id ? { ...r, ...patch } : r)),
        },
    );
    try {
      await leaveApi.updateType(row.id, {
        ...(patch.entitled !== undefined ? { entitledDays: patch.entitled } : {}),
        ...(patch.accrual !== undefined
          ? { accrual: LOCAL_TO_WIRE_ACCRUAL[patch.accrual] }
          : {}),
        ...(patch.carryOverMax !== undefined
          ? { carryOverMax: patch.carryOverMax }
          : {}),
        ...(patch.minNoticeDays !== undefined
          ? { minNoticeDays: patch.minNoticeDays }
          : {}),
        ...(patch.requiresEvidence !== undefined
          ? { requiresEvidence: patch.requiresEvidence }
          : {}),
      });
    } catch (error) {
      setFetched(
        (s) => s && { ...s, rows: s.rows.map((r) => (r.id === row.id ? before : r)) },
      );
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    }
  }

  async function createType(input: { name: string; entitledDays: number }) {
    await leaveApi.createType(input);
    setTick((t) => t + 1);
  }

  /**
   * Switch a type off. Archive, never delete — `LeaveRequest` and
   * `LeaveBalance` both point at the row, so the API keeps it and the pickers
   * drop it. The consequence the confirm states is the API's own reasoning,
   * and the toast reports the count the API answers with, so what stays on
   * the record is said with a figure rather than implied.
   */
  async function archiveType() {
    if (!archiving?.id) return;
    setArchiveBusy(true);
    try {
      const result = await leaveApi.archiveType(archiving.id);
      const total = result.total ?? 0;
      setSwitchedOff((rows) => [
        ...rows,
        { id: archiving.id as string, name: archiving.name, total },
      ]);
      setArchiving(null);
      setTick((t) => t + 1);
      toast.push({
        title: `${result.name} switched off`,
        tone: "success",
        detail:
          total > 0
            ? `${total} request${total === 1 ? " stays" : "s stay"} on the books — history keeps resolving, nobody can book it again.`
            : "Nobody had booked it, so nothing stays behind.",
      });
    } catch (error) {
      toast.push({
        title: "That did not switch off",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setArchiveBusy(false);
    }
  }

  async function restoreType(row: { id: string; name: string }) {
    try {
      await leaveApi.restoreType(row.id);
      setSwitchedOff((rows) => rows.filter((r) => r.id !== row.id));
      setTick((t) => t + 1);
      toast.push({
        title: `${row.name} is back on`,
        tone: "success",
        detail: "It appears in the booking form again, entitlement unchanged.",
      });
    } catch (error) {
      toast.push({
        title: "That did not restore",
        tone: "danger",
        detail:
          error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    }
  }

  /* ------------------------------------------------------- the preview panel */

  /* Company-wide effect of the current policy, so the number above has a
     consequence you can see rather than one you have to imagine. This is a
     demo-only device: it reads a fixed mock roster, which is not this
     organisation's actual directory once connected. */
  const annual = policy.types.find((t) => t.name === "Annual");
  const previewBalances = EMPLOYEES.map((e) => ({
    employee: e,
    balance: demoBalances.forType(e.id, "Annual"),
  })).filter((row) => row.balance !== undefined);

  const overdrawn = previewBalances.filter(
    (row) => remainingDays(row.balance!) < 0,
  ).length;

  return (
    <>
      <Header />

      <PageBody className="flex flex-col gap-6">
        <Callout tone="info" title="These figures are live">
          {/* A route in backticks is how the doc comments in this repo refer
              to a screen, and it had leaked into rendered prose — the one
              instance across 31 screens read by a browser. Backticks are
              markup, and `/people/leave` is a path rather than anything the
              person reading this has ever seen: the screen calls itself
              Time off, and so does the nav. */}
          Entitlement is the number every balance in the product is measured
          against. Change it here and Time off, each employee record and the
          booking form all move at once — there is no separate copy to keep in
          step.
        </Callout>

        <Card>
          <CardHeader
            title="Leave types"
            description="Statutory minimums in Nigeria are a floor, not a ceiling — a company may grant more."
            action={
              <Button
                variant="secondary"
                size="sm"
                disabled={!isConnected}
                onClick={() => setAdding(true)}
              >
                <Plus aria-hidden="true" className="size-3.5" />
                Add leave type
              </Button>
            }
          />
          {typesLoading ? (
            <CardBody>
              <Skeleton className="h-40 w-full" />
            </CardBody>
          ) : (
            <TableWrap className="rounded-none border-0">
              <THead>
                <TH>Type</TH>
                <TH align="right">Days a year</TH>
                <TH>Accrual</TH>
                <TH align="right">Carry over</TH>
                <TH align="right">Notice</TH>
                <TH>Evidence</TH>
                {isConnected && (
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                )}
              </THead>
              <TBody>
                {types.map((type) => (
                  <TR key={type.id ?? type.name}>
                    <TDPrimary
                      title={type.name}
                      subtitle={ACCRUAL_LABEL[type.accrual]}
                    />
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        value={type.entitled}
                        className="w-20 text-right"
                        aria-label={`${type.name} days per year`}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next) || next < 0) return;
                          void editType(type, { entitled: next });
                        }}
                      />
                    </TD>
                    <TD>
                      <Select
                        value={type.accrual}
                        aria-label={`${type.name} accrual`}
                        onChange={(e) => {
                          const next = e.target.value as Accrual;
                          void editType(type, { accrual: next });
                        }}
                      >
                        <option value="annual_upfront">Upfront</option>
                        <option value="monthly">Monthly</option>
                        <option value="on_completion">On event</option>
                      </Select>
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        max={type.entitled}
                        value={type.carryOverMax}
                        className="w-20 text-right"
                        aria-label={`${type.name} carry-over maximum`}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next) || next < 0) return;
                          void editType(type, { carryOverMax: next });
                        }}
                      />
                    </TD>
                    <TD align="right">
                      <Input
                        type="number"
                        min={0}
                        max={90}
                        value={type.minNoticeDays}
                        className="w-20 text-right"
                        aria-label={`${type.name} minimum notice in days`}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (!Number.isFinite(next) || next < 0) return;
                          void editType(type, { minNoticeDays: next });
                        }}
                      />
                    </TD>
                    <TD>
                      <Switch
                        checked={type.requiresEvidence}
                        label={type.requiresEvidence ? "Required" : "Not required"}
                        onChange={(e) =>
                          void editType(type, { requiresEvidence: e.target.checked })
                        }
                      />
                    </TD>
                    {/* Switch off, never delete. Requests and balances point
                        at the row, so the API archives it: history keeps
                        resolving, the booking form drops it. Absent in demo
                        mode with the same reasoning as the Add button. */}
                    {isConnected && (
                      <TD align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!type.id}
                          onClick={() => setArchiving(type)}
                        >
                          <ArchiveX aria-hidden="true" className="size-3.5" />
                          Switch off
                        </Button>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </TableWrap>
          )}
          {!isConnected && (
            <CardBody className="border-t border-line">
              <p className="text-body-sm leading-relaxed text-muted">
                Adding a leave type writes to the company&rsquo;s own record, so it
                needs a live company. Demo mode ships this fixed set of five.
              </p>
            </CardBody>
          )}
        </Card>

        {/* Only rendered while it has rows: an empty "switched off" card would
            be a claim about types this page cannot actually list. The API's
            type list filters archived rows out with no way to ask for them, so
            this is restore's whole reach — and the card says so rather than
            letting the button's disappearance on reload read as a bug. */}
        {switchedOff.length > 0 && (
          <Card>
            <CardHeader
              title="Switched off just now"
              level={3}
              description="Off, not deleted — every request already raised keeps its record. Turn one back on and it reappears in the booking form with its entitlement unchanged."
            />
            <CardBody className="flex flex-col gap-3">
              {switchedOff.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-body-sm font-medium text-ink">
                      {row.name}
                    </span>
                    <Badge tone="neutral" size="sm">
                      Switched off
                    </Badge>
                    {row.total > 0 && (
                      <span className="text-meta text-muted">
                        {row.total} request{row.total === 1 ? "" : "s"} kept on the
                        books
                      </span>
                    )}
                  </span>
                  <Button variant="secondary" size="sm" onClick={() => void restoreType(row)}>
                    <RotateCcw aria-hidden="true" className="size-3.5" />
                    Turn it back on
                  </Button>
                </div>
              ))}
              <p className="text-meta leading-relaxed text-muted">
                This list lasts as long as this page: the server does not yet let
                the interface see switched-off types, so leaving here puts turning
                one back on out of reach until it does.
              </p>
            </CardBody>
          </Card>
        )}

        <ConfirmDialog
          open={archiving !== null}
          onClose={() => setArchiving(null)}
          onConfirm={() => void archiveType()}
          loading={archiveBusy}
          title={`Switch off ${archiving?.name ?? "this leave type"}?`}
          confirmLabel="Switch it off"
          body={
            <span className="flex flex-col gap-2.5">
              <span>
                Off, not deleted. Every request already raised against it keeps
                its record, and reports about past years keep working.
              </span>
              <span>
                It leaves the booking form the moment you confirm, so nobody can
                raise new leave against it. Anything still pending stays pending
                &mdash; switching the type off decides nothing about requests
                already in flight.
              </span>
              <span>
                The name stays taken: adding a type called{" "}
                <strong>{archiving?.name}</strong> later is refused in favour of
                turning this one back on.
              </span>
            </span>
          }
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Approval rules" level={3} />
            <CardBody className="flex flex-col gap-5">
              <Field
                label="Allow approval into a negative balance"
                help="Off means an approver cannot push someone past their entitlement. On means they can, and payroll treats the excess as unpaid."
              >
                <Switch
                  checked={policy.allowNegativeBalance}
                  label={policy.allowNegativeBalance ? "Allowed" : "Blocked"}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    updateLeave({ allowNegativeBalance: checked });
                    toast.push({
                      title: checked
                        ? "Negative balances allowed"
                        : "Negative balances blocked",
                      tone: checked ? "info" : "success",
                      detail: checked
                        ? "Approvers can now exceed an entitlement. The excess is unpaid."
                        : "Approvers can no longer exceed an entitlement.",
                    });
                  }}
                />
              </Field>

              <Field
                label="Hold pending days against the remaining figure"
                help="On means an approver sees a balance that already accounts for requests they have not decided yet. Off means they can approve the same days twice."
              >
                <Switch
                  checked={policy.reservePendingDays}
                  label={policy.reservePendingDays ? "Held back" : "Not held back"}
                  onChange={(e) =>
                    updateLeave({ reservePendingDays: e.target.checked })
                  }
                />
              </Field>
            </CardBody>
          </Card>

          {isConnected ? (
            <Card>
              <CardHeader
                title="What this policy produces"
                description="Live per-person balances, on their own record."
                level={3}
              />
              <CardBody className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
                <p>
                  The table above edits this company&rsquo;s real leave types, so a
                  change here moves everybody&rsquo;s balance immediately. This card
                  cannot show a live roster of who that affects — that is a
                  per-employee read, not a company-wide one — without fetching
                  every employee&rsquo;s balance individually.
                </p>
                <p>
                  See a real person&rsquo;s balance move on{" "}
                  <Link href="/people/leave" className="font-medium text-accent-text underline">
                    /people/leave
                  </Link>
                  , or on their own record.
                </p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardHeader
                title="What this policy produces"
                description={`Annual leave at ${annual?.entitled ?? 0} days, across the whole company.`}
                level={3}
              />
              <CardBody className="flex flex-col gap-3.5">
                {overdrawn > 0 && (
                  <Callout tone="warning" title={`${overdrawn} people are now over`}>
                    Reducing the entitlement does not cancel leave already
                    approved. These balances are negative until the next accrual
                    year.
                  </Callout>
                )}
                {previewBalances.slice(0, 6).map(({ employee, balance }) => {
                  const remaining = remainingDays(balance!);
                  return (
                    <div key={employee.id}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="truncate text-body-sm text-body">
                          {fullName(employee)}
                        </span>
                        <span className="tabular shrink-0 text-meta text-muted">
                          {remaining} of {balance!.entitled} left
                        </span>
                      </div>
                      <ProgressMeter
                        value={Math.min(balance!.taken, balance!.entitled)}
                        max={Math.max(balance!.entitled, 1)}
                        size="sm"
                        tone={remaining < 0 ? "danger" : remaining <= 3 ? "warning" : "accent"}
                      />
                    </div>
                  );
                })}
                <p className="mt-1 flex gap-2 text-meta leading-relaxed text-muted">
                  <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                  Days taken before the tracked period are included, which is why
                  nobody starts at a full entitlement.
                </p>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Was a paragraph describing a calendar nobody could see or change.
            `GET/POST/PATCH/DELETE /leave/holidays` exist now, so it is the real
            thing. Demo mode edits a seeded copy and says so. */}
        <HolidaysPanel defaultYear={calendarYear} />
      </PageBody>

      {adding && (
        <AddLeaveTypeDialog
          onClose={() => setAdding(false)}
          onSave={async (input) => {
            await createType(input);
            setAdding(false);
            toast.push({
              title: `${input.name} added`,
              tone: "success",
              detail: "It is available to book from now on.",
            });
          }}
        />
      )}
    </>
  );
}

function AddLeaveTypeDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (input: { name: string; entitledDays: number }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [entitledDays, setEntitledDays] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const canSave = trimmed.length >= 2 && entitledDays >= 0 && !busy;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await onSave({ name: trimmed, entitledDays });
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.message : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Add a leave type"
      description="Study leave, sabbatical, or anything else this company grants that is not already listed."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!canSave}
            loading={busy}
            onClick={() => void save()}
          >
            Add leave type
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required error={error ?? undefined}>
          <Input
            value={name}
            autoFocus
            placeholder="Study leave"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Days a year" required help="Every other setting can be changed afterwards.">
          <Input
            type="number"
            min={0}
            max={365}
            value={entitledDays}
            onChange={(e) => {
              const next = Number(e.target.value);
              if (Number.isFinite(next) && next >= 0) setEntitledDays(next);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
