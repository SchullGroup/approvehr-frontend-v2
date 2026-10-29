"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArchiveX,
  Check,
  Info,
  Lock,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Disclosure,
  EmptyState,
  Field,
  FieldRow,
  Input,
  Modal,
  ProgressMeter,
  RowActions,
  Select,
  Skeleton,
  Spinner,
  Switch,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  TextLink,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { leaveApi, type LeaveAccrualWire } from "@/lib/api/leave";
import { EMPLOYEES } from "@/lib/mock/people";
import { usePermissions } from "@/lib/permissions";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { useCompanySettings } from "@/lib/store/company";
import { FEATURE_COPY, useFeatureSettings } from "@/lib/store/features";
import { useLeaveBalances } from "@/lib/store/leave-balances";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { TODAY } from "@/lib/today";
import { todayIn } from "@/lib/time";
import { remainingDays } from "@/lib/workflows/leave";
import { fullName } from "@/lib/types";
import { HolidaysPanel } from "./holidays-panel";
import { isLeaveTab, type LeaveTab } from "./tabs";

const ACCRUAL_LABEL = {
  annual_upfront: "Granted in full on 1 January",
  monthly: "Accrues monthly",
  on_completion: "Granted when the event occurs",
} as const;

type Accrual = keyof typeof ACCRUAL_LABEL;

/** The same three words the accrual select offers, for a closed row's one line. */
const ACCRUAL_SHORT: Record<Accrual, string> = {
  annual_upfront: "upfront",
  monthly: "monthly",
  on_completion: "on the event",
};

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
  /** Null is everyone. See `EligibleGender` in `lib/api/leave.ts`. */
  eligibleGender: "female" | "male" | "other" | null;
};

/** The three words a company can restrict a type to, alongside "everyone". */
const ELIGIBILITY_LABEL: Record<"female" | "male" | "other", string> = {
  female: "Women",
  male: "Men",
  other: "Neither",
};

/** One copy shared by the desktop cell and the mobile card, so the option
    list and the null-vs-string mapping cannot drift between them. */
function EligibilitySelect({
  type,
  onChange,
  className,
}: {
  type: TypeRow;
  onChange: (value: TypeRow["eligibleGender"]) => void;
  className?: string;
}) {
  return (
    <Select
      className={className}
      value={type.eligibleGender ?? ""}
      aria-label={`Who ${type.name} is for`}
      onChange={(e) => {
        const next = e.target.value;
        onChange(next === "" ? null : (next as "female" | "male" | "other"));
      }}
    >
      <option value="">Everyone</option>
      {(["female", "male", "other"] as const).map((gender) => (
        <option key={gender} value={gender}>
          {ELIGIBILITY_LABEL[gender]}
        </option>
      ))}
    </Select>
  );
}

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
export function LeavePolicyForm({
  initialTab = "types",
}: {
  initialTab?: LeaveTab;
}) {
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

  return <Policy initialTab={initialTab} />;
}

function Header() {
  return (
    <PageHeader
      title="Leave policies"
      breadcrumb={[{ href: "/settings", label: "Settings" }]}
    />
  );
}

function Policy({ initialTab }: { initialTab: LeaveTab }) {
  const { settings, updateLeave, updateLeaveType } = useCompanySettings();
  const [tab, setTab] = useState<LeaveTab>(initialTab);
  const changeTab = (next: string) => {
    if (!isLeaveTab(next)) return;
    setTab(next);
    /* Shareable without a navigation, and the back button keeps pointing at
       wherever the reader came from. */
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  };
  /* Demo-only, and read unconditionally regardless of mode — it is a pure,
     local computation with nothing to fetch, and the rules of hooks forbid
     calling it only sometimes. Its result is simply not rendered connected. */
  const demoBalances = useLeaveBalances();
  const { isConnected } = useSession();
  const timeZone = useOrgTimezone();
  const toast = useToast();

  /**
   * Whether the last edit has landed.
   *
   * The feedback: *"Settings fields (Leave) need a clear save mechanism:
   * either a visible Save button when a field is edited, or if changes are
   * autosaved a clear 'Autosaved' indicator so users aren't left unsure
   * whether their edits were captured."*
   *
   * These fields **do** autosave — every keystroke on the entitlement fires a
   * PATCH — and said nothing at all, so somebody typing 26 and navigating away
   * had no way to know whether it took. A Save button would be the wrong fix:
   * it would have to be added to a screen that already writes on change, which
   * means either two mechanisms or a rewrite of the save path for a message.
   *
   * `saved` clears itself after a few seconds. A permanent "Saved" beside a
   * field is not an indicator, it is furniture — it stops being read, and then
   * it is there on the one occasion something failed.
   */
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">(
    "idle",
  );
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const markSaved = useCallback(() => {
    setSaveState("saved");
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveState("idle"), 2500);
  }, []);

  /* Cleared on unmount, or a timer fires against a component that is gone. */
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  /* Demo mode runs on `TODAY`; the real clock would open the calendar on a year
     the seed has nothing in. Same reasoning as `/people/leave`. */
  const calendarYear = Number(
    (isConnected ? todayIn(timeZone) : TODAY).slice(0, 4),
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
  /** The row whose delete confirm is open. */
  const [deleting, setDeleting] = useState<TypeRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
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
              eligibleGender: row.eligibleGender,
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
    eligibleGender: type.eligibleGender ?? null,
  }));

  const types = isConnected ? (fetched?.rows ?? []) : demoRows;
  const typesLoading = isConnected && fetched === null;

  async function editType(
    row: TypeRow,
    patch: Partial<Omit<TypeRow, "id" | "name">>,
  ) {
    if (!isConnected) {
      updateLeaveType(row.name, patch);
      /* Demo mode saves too — locally — so the indicator says so rather than
         staying silent, which would read as nothing having happened. */
      markSaved();
      return;
    }
    if (!row.id) return;
    setSaveState("saving");
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
        ...(patch.entitled !== undefined
          ? { entitledDays: patch.entitled }
          : {}),
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
        /* `!== undefined`, not truthy: `null` is a real, meaningful value
           here — it is what clears the restriction back to "everyone" — and
           this is the only shape that can say so rather than leaving it
           alone. */
        ...(patch.eligibleGender !== undefined
          ? { eligibleGender: patch.eligibleGender }
          : {}),
      });
      markSaved();
    } catch (error) {
      setSaveState("idle");
      setFetched(
        (s) =>
          s && {
            ...s,
            rows: s.rows.map((r) => (r.id === row.id ? before : r)),
          },
      );
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
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
            ? `${total} request${total === 1 ? " stays" : "s stay"} on the books: history keeps resolving, nobody can book it again.`
            : "Nobody had booked it, so nothing stays behind.",
      });
    } catch (error) {
      toast.push({
        title: "That did not switch off",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setArchiveBusy(false);
    }
  }

  /**
   * Delete a type for good — for one added by mistake. The API refuses once
   * anybody has booked it, and its message says to switch it off instead, so
   * the toast passes that on rather than a generic failure.
   */
  async function deleteType() {
    if (!deleting?.id) return;
    setDeleteBusy(true);
    try {
      const result = await leaveApi.deleteType(deleting.id);
      setDeleting(null);
      setTick((t) => t + 1);
      toast.push({
        title: `${result.name} deleted`,
        tone: "success",
        detail: "Nobody had booked it, so nothing was lost.",
      });
    } catch (error) {
      toast.push({
        title: "That was not deleted",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setDeleteBusy(false);
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
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
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

      <PageBody className="flex flex-col gap-4">
        <Callout tone="info" title="These figures are live">
          {/* A route in backticks is how the doc comments in this repo refer
              to a screen, and it had leaked into rendered prose — the one
              instance across 31 screens read by a browser. Backticks are
              markup, and `/people/leave` is a path rather than anything the
              person reading this has ever seen: the screen calls itself
              Leave, and so does the nav. */}
          Entitlement is the number every balance in the product is measured
          against. Change it here and Leave, each employee record and the
          booking form all move at once: there is no separate copy to keep in
          step.
        </Callout>

        <Tabs
          items={[
            { id: "types", label: "Leave types" },
            { id: "approval", label: "Approval" },
            { id: "holidays", label: "Public holidays" },
          ]}
          value={tab}
          onChange={changeTab}
        >
          <div key={tab} className="animate-open flex flex-col gap-4 pt-4">
            {tab === "types" && (
              <>
                <Card>
                  <CardHeader
                    title="Leave types"
                    description="Statutory minimums in Nigeria are a floor, not a ceiling: a company may grant more. Notice is how many days before the first day off someone should ask; 0 means no notice. Changes here save as you make them."
                    action={
                      <div className="flex items-center gap-2">
                        {/* Whether the last edit landed. These fields autosave on
                        change and said nothing at all, so somebody typing 26 and
                        navigating away had no way to know it took. Absent while
                        idle rather than a permanent "Saved" — a badge that is
                        always there stops being read, and then it is there on the
                        one occasion something failed. */}
                        <SaveState state={saveState} />
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-h-11 sm:min-h-8"
                          disabled={!isConnected}
                          onClick={() => setAdding(true)}
                        >
                          <Plus aria-hidden="true" className="size-3.5" />
                          Add leave type
                        </Button>
                      </div>
                    }
                  />
                  {typesLoading ? (
                    <CardBody>
                      <Skeleton className="h-40 w-full" />
                    </CardBody>
                  ) : (
                    <>
                      <div className="hidden sm:block">
                        <TableWrap className="rounded-none border-0">
                          <THead>
                            <TH>Type</TH>
                            <TH align="right">Days a year</TH>
                            <TH>Accrual</TH>
                            <TH align="right">Carry over</TH>
                            <TH align="right">Notice (days)</TH>
                            <TH>Evidence</TH>
                            <TH>Who</TH>
                            {isConnected && (
                              <TH align="right">
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
                                      if (!Number.isFinite(next) || next < 0)
                                        return;
                                      void editType(type, { entitled: next });
                                    }}
                                  />
                                </TD>
                                <TD>
                                  <Select
                                    value={type.accrual}
                                    className="min-w-32"
                                    aria-label={`${type.name} accrual`}
                                    onChange={(e) => {
                                      const next = e.target.value as Accrual;
                                      void editType(type, { accrual: next });
                                    }}
                                  >
                                    <option value="annual_upfront">
                                      Upfront
                                    </option>
                                    <option value="monthly">Monthly</option>
                                    <option value="on_completion">
                                      On event
                                    </option>
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
                                      if (!Number.isFinite(next) || next < 0)
                                        return;
                                      void editType(type, {
                                        carryOverMax: next,
                                      });
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
                                      if (!Number.isFinite(next) || next < 0)
                                        return;
                                      void editType(type, {
                                        minNoticeDays: next,
                                      });
                                    }}
                                  />
                                </TD>
                                <TD>
                                  {/* One line. "Not required" broke onto two in a column
                                  the inputs beside it had squeezed. */}
                                  <Switch
                                    className="whitespace-nowrap"
                                    checked={type.requiresEvidence}
                                    label={
                                      type.requiresEvidence
                                        ? "Required"
                                        : "Not required"
                                    }
                                    onChange={(e) =>
                                      void editType(type, {
                                        requiresEvidence: e.target.checked,
                                      })
                                    }
                                  />
                                </TD>
                                <TD>
                                  <EligibilitySelect
                                    className="min-w-28"
                                    type={type}
                                    onChange={(eligibleGender) =>
                                      void editType(type, { eligibleGender })
                                    }
                                  />
                                </TD>
                                {/* Switch off by default. Requests and balances point
                                at the row, so the API archives it: history keeps
                                resolving, the booking form drops it. Delete is for a
                                type nobody has booked; the API refuses the rest. Absent in demo
                                mode with the same reasoning as the Add button. It
                                lives in the row's menu rather than as a button of its
                                own: it is the least-used thing on the row and the
                                only one that takes anything away. */}
                                {isConnected && (
                                  <TD align="right">
                                    <RowActions
                                      label={`More actions for ${type.name}`}
                                      items={[
                                        {
                                          label: "Switch off",
                                          icon: <ArchiveX aria-hidden="true" />,
                                          tone: "danger",
                                          disabled: !type.id,
                                          onSelect: () => setArchiving(type),
                                        },
                                        {
                                          label: "Delete",
                                          icon: <Trash2 aria-hidden="true" />,
                                          tone: "danger",
                                          disabled: !type.id,
                                          onSelect: () => setDeleting(type),
                                        },
                                      ]}
                                    />
                                  </TD>
                                )}
                              </TR>
                            ))}
                          </TBody>
                        </TableWrap>
                      </div>

                      {/* On a phone each type is one closed row — name, days, how it
                      accrues — and the seven fields open under it. Five types
                      were five stacked forms, 7,000px of them. */}
                      <ul className="flex flex-col gap-2 p-3 sm:hidden">
                        {types.map((type) => (
                          <li key={type.id ?? type.name}>
                            <Disclosure
                              dense
                              level={4}
                              title={type.name}
                              hint={`${type.entitled} days a year · ${ACCRUAL_SHORT[type.accrual]}`}
                            >
                              <div className="flex flex-col gap-3">
                                <FieldRow phone="pair">
                                  <Field label="Days a year">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={365}
                                      value={type.entitled}
                                      className="h-11"
                                      aria-label={`${type.name} days per year`}
                                      onChange={(e) => {
                                        const next = Number(e.target.value);
                                        if (!Number.isFinite(next) || next < 0)
                                          return;
                                        void editType(type, { entitled: next });
                                      }}
                                    />
                                  </Field>

                                  <Field
                                    label="Notice (days)"
                                    help="Days before the first day off that someone should ask. 0 means no notice."
                                  >
                                    <Input
                                      type="number"
                                      min={0}
                                      max={90}
                                      value={type.minNoticeDays}
                                      className="h-11"
                                      aria-label={`${type.name} minimum notice in days`}
                                      onChange={(e) => {
                                        const next = Number(e.target.value);
                                        if (!Number.isFinite(next) || next < 0)
                                          return;
                                        void editType(type, {
                                          minNoticeDays: next,
                                        });
                                      }}
                                    />
                                  </Field>

                                  <Field label="Accrual">
                                    <Select
                                      value={type.accrual}
                                      className="h-11"
                                      aria-label={`${type.name} accrual`}
                                      onChange={(e) => {
                                        const next = e.target.value as Accrual;
                                        void editType(type, { accrual: next });
                                      }}
                                    >
                                      <option value="annual_upfront">
                                        Upfront
                                      </option>
                                      <option value="monthly">Monthly</option>
                                      <option value="on_completion">
                                        On event
                                      </option>
                                    </Select>
                                  </Field>

                                  <Field label="Carry over">
                                    <Input
                                      type="number"
                                      min={0}
                                      max={type.entitled}
                                      value={type.carryOverMax}
                                      className="h-11"
                                      aria-label={`${type.name} carry-over maximum`}
                                      onChange={(e) => {
                                        const next = Number(e.target.value);
                                        if (!Number.isFinite(next) || next < 0)
                                          return;
                                        void editType(type, {
                                          carryOverMax: next,
                                        });
                                      }}
                                    />
                                  </Field>
                                </FieldRow>

                                <Field label="Who">
                                  <EligibilitySelect
                                    className="h-11"
                                    type={type}
                                    onChange={(eligibleGender) =>
                                      void editType(type, { eligibleGender })
                                    }
                                  />
                                </Field>

                                <div className="flex min-h-11 items-center justify-between gap-3">
                                  <span className="text-body-sm text-muted">
                                    Evidence
                                  </span>
                                  <Switch
                                    className="items-center"
                                    checked={type.requiresEvidence}
                                    label={
                                      type.requiresEvidence
                                        ? "Required"
                                        : "Not required"
                                    }
                                    onChange={(e) =>
                                      void editType(type, {
                                        requiresEvidence: e.target.checked,
                                      })
                                    }
                                  />
                                </div>

                                {isConnected && (
                                  <div className="flex flex-wrap gap-2">
                                    <Button
                                      variant="ghost"
                                      size="md"
                                      className="min-h-11"
                                      disabled={!type.id}
                                      onClick={() => setArchiving(type)}
                                    >
                                      <ArchiveX
                                        aria-hidden="true"
                                        className="size-3.5"
                                      />
                                      Switch off
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="md"
                                      className="min-h-11"
                                      disabled={!type.id}
                                      onClick={() => setDeleting(type)}
                                    >
                                      <Trash2
                                        aria-hidden="true"
                                        className="size-3.5"
                                      />
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </Disclosure>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                  {!isConnected ? (
                    <CardBody className="border-t border-line">
                      <p className="text-body-sm leading-relaxed text-muted">
                        Adding a leave type writes to the company&rsquo;s own
                        record, so it needs a live company. Demo mode ships this
                        fixed set of five.
                      </p>
                    </CardBody>
                  ) : (
                    <CardBody className="border-t border-line py-3">
                      <p className="flex min-h-11 flex-wrap items-center gap-x-1.5 text-meta text-muted sm:min-h-0">
                        Balances move as soon as a change saves.
                        <TextLink href="/people/leave">
                          See them on Leave
                        </TextLink>
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
                      description="Off, not deleted: every request already raised keeps its record. Turn one back on and it reappears in the booking form with its entitlement unchanged."
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
                                {row.total} request{row.total === 1 ? "" : "s"}{" "}
                                kept on the books
                              </span>
                            )}
                          </span>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void restoreType(row)}
                          >
                            <RotateCcw
                              aria-hidden="true"
                              className="size-3.5"
                            />
                            Turn it back on
                          </Button>
                        </div>
                      ))}
                      <p className="text-meta leading-relaxed text-muted">
                        This list lasts as long as this page: the server does
                        not yet let the interface see switched-off types, so
                        leaving here puts turning one back on out of reach until
                        it does.
                      </p>
                    </CardBody>
                  </Card>
                )}
                {!isConnected && (
                  <Card>
                    <CardHeader
                      title="What this policy produces"
                      description={`Annual leave at ${annual?.entitled ?? 0} days, across the whole company.`}
                      level={3}
                    />
                    <CardBody className="flex flex-col gap-3.5">
                      {overdrawn > 0 && (
                        <Callout
                          tone="warning"
                          title={`${overdrawn} people are now over`}
                        >
                          Reducing the entitlement does not cancel leave already
                          approved. These balances are negative until the next
                          accrual year.
                        </Callout>
                      )}
                      {previewBalances
                        .slice(0, 6)
                        .map(({ employee, balance }) => {
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
                                value={Math.min(
                                  balance!.taken,
                                  balance!.entitled,
                                )}
                                max={Math.max(balance!.entitled, 1)}
                                size="sm"
                                tone={
                                  remaining < 0
                                    ? "danger"
                                    : remaining <= 3
                                      ? "warning"
                                      : "accent"
                                }
                              />
                            </div>
                          );
                        })}
                      <p className="mt-1 flex gap-2 text-meta leading-relaxed text-muted">
                        <Info
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                        Days taken before the tracked period are included, which
                        is why nobody starts at a full entitlement.
                      </p>
                    </CardBody>
                  </Card>
                )}
              </>
            )}

            {tab === "approval" && (
              <div className="grid items-stretch gap-4 xl:grid-cols-2">
                <ApprovalWorkflow />
                <Card>
                  <CardHeader title="Approval rules" level={3} />
                  <CardBody className="flex flex-col gap-5">
                    <Field
                      label="Allow approval into a negative balance"
                      help="Off means an approver cannot push someone past their entitlement. On means they can, and payroll treats the excess as unpaid."
                    >
                      <Switch
                        checked={policy.allowNegativeBalance}
                        label={
                          policy.allowNegativeBalance ? "Allowed" : "Blocked"
                        }
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
                        label={
                          policy.reservePendingDays
                            ? "Held back"
                            : "Not held back"
                        }
                        onChange={(e) =>
                          updateLeave({ reservePendingDays: e.target.checked })
                        }
                      />
                    </Field>
                  </CardBody>
                </Card>
              </div>
            )}

            {tab === "holidays" && <HolidaysPanel defaultYear={calendarYear} />}
          </div>
        </Tabs>

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

        <ConfirmDialog
          open={deleting !== null}
          onClose={() => setDeleting(null)}
          onConfirm={() => void deleteType()}
          loading={deleteBusy}
          tone="danger"
          title={`Delete ${deleting?.name ?? "this leave type"}?`}
          confirmLabel="Delete it"
          body={
            <span className="flex flex-col gap-2.5">
              <span>
                Gone for good, with everybody&rsquo;s balance for it. This
                cannot be undone, and the name is free to use again.
              </span>
              <span>
                Only a type nobody has booked can be deleted. If anyone has
                asked for it, even once, you will be told to switch it off
                instead, so their leave keeps its record.
              </span>
            </span>
          }
        />
      </PageBody>

      <AddLeaveTypeDialog
        open={adding}
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
    </>
  );
}

function AddLeaveTypeDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
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
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
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
        <Field
          label="Days a year"
          required
          help="Every other setting can be changed afterwards."
        >
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

/**
 * Whether the last edit landed.
 *
 * Renders **nothing** while idle. A permanent "Saved" beside a field is not an
 * indicator, it is furniture: it stops being read, and then it is still there
 * on the one occasion something failed. What somebody needs is a change of
 * state at the moment their change lands, and silence the rest of the time.
 *
 * "Saving…" is shown as well as "Saved" because on a slow connection the gap
 * between typing and landing is exactly the window the feedback describes —
 * *"users aren\'t left unsure whether their edits were captured"* — and an
 * indicator that only ever appears afterwards says nothing during it.
 */
function SaveState({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <span
      /* Polite, not assertive: this is a confirmation, and interrupting a
         screen reader mid-sentence to say "saved" is worse than telling them
         when they next pause. */
      aria-live="polite"
      className="flex items-center gap-1.5 text-meta text-muted"
    >
      {state === "saving" ? (
        <>
          <Spinner size="sm" />
          Saving
        </>
      ) : (
        <>
          <Check aria-hidden="true" className="size-3.5 text-success-text" />
          Saved
        </>
      )}
    </span>
  );
}

/**
 * Who approves a leave request, and in what order.
 *
 * ## Why this exists at all
 *
 * The two-step workflow was built — `approvalStageFor`, `AWAITING_HR`,
 * `firstApprovedAt`, a decline terminal at either step, the employee hearing
 * once — and shipped **with no way to switch it on.** `leaveTwoStepApproval`
 * defaults off on `OrgFeatures`, the API enforced it faithfully, and no screen
 * in the product mentioned it. The frontend features store did not even declare
 * the key, so a patch containing it would have been dropped on the way out.
 *
 * That is the fourth time this codebase has shipped a capability nobody could
 * find — after the company logo, the assistant, and the hand-entered tax
 * figure. The rule it keeps re-learning: **a feature that is correct and
 * unreachable is a feature the company does not have.**
 *
 * ## Why here and not `/settings/features`
 *
 * The feedback asks for it by location, twice — *"configurable from the
 * Settings → Approval Workflows section"*, and *"Under Settings → Approval
 * Workflows → Leave, the Owner/Admin should be able to configure the approval
 * process."* And it is the right place on its own merits: somebody deciding
 * whether a departmental lead approves first is looking at the leave types and
 * the entitlements, not at a list of modules.
 *
 * ## What it says when there is nobody to be the first approver
 *
 * A company with no department heads set has nothing for the first step to
 * route to, and turning it on would leave every request waiting on a person
 * who does not exist. So the consequence is named and the way to fix it is
 * beside it — rather than a switch that appears to work and quietly parks
 * everybody's leave.
 */
export function ApprovalWorkflow() {
  const features = useFeatureSettings();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const toast = useToast();

  const on = features.flags.leaveTwoStepApproval;

  const toggle = async (next: boolean) => {
    setPending(true);
    setFailed(null);
    try {
      /* `setFeature`, the same call `/settings/features` makes for every other
         switch — so the demo path, the audit entry and the dependency rules
         are the ones already in the store rather than a second copy here. */
      await features.setFeature("leaveTwoStepApproval", next);
      toast.push({
        title: next
          ? "Departmental leads approve first"
          : "HR approves leave on its own again",
        tone: "success",
        detail: next
          ? "Requests already waiting on HR are unaffected."
          : "Anything already approved by a lead and waiting on HR still needs HR.",
      });
    } catch (error) {
      /* The API's own sentence. It knows whether the flag was refused and
         why; nothing here does. */
      setFailed(
        error instanceof ApiError
          ? error.message
          : "That did not save. Try again in a moment.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Approval workflow"
        description="Who signs off a leave request, and in what order. This saves as you change it."
      />
      <CardBody className="flex flex-col gap-3">
        <Switch
          label={FEATURE_COPY.leaveTwoStepApproval.label}
          description={FEATURE_COPY.leaveTwoStepApproval.line}
          checked={on}
          disabled={!features.editable || features.loading || pending}
          onChange={(event) => void toggle(event.target.checked)}
        />

        {/* Outside the switch's own description, because it is a thing to act
            on rather than a thing to read. Only when it is on: a company that
            has not turned this on has no requests waiting on anybody. */}
        {on && (
          <NoticeLine tone="muted">
            <span>
              The first approver is whoever heads the employee&apos;s
              department.
            </span>
            <Link href="/people/departments" className={NOTICE_LINK}>
              Set department heads
            </Link>
          </NoticeLine>
        )}

        {failed && (
          <p role="status" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}

        {!features.editable && (
          <p className="text-body-sm text-muted">
            Changing this needs the settings permission.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
