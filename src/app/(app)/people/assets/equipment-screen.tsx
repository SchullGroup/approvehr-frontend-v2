"use client";

import { useMemo, useState } from "react";
import { Plus, Upload } from "lucide-react";
import {
  Badge,
  Button,
  ButtonLink,
  ConfirmDialog,
  Field,
  FilterBar,
  SegmentedControl,
  Select,
  Spinner,
  Stat,
  Switch,
  Tabs,
  formatMoney,
  type AppliedFilter,
  type TabItem,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { usePermissions } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";
import {
  today,
  useEquipment,
  useEquipmentKinds,
  useEquipmentSummary,
  useRepairs,
  type AssetListParams,
  type EquipmentItem,
  type Repair,
  type SettableStatus,
} from "@/lib/store/assets";
import { HandOverDialog } from "./hand-over-dialog";
import { ItemForm } from "./item-form";
import { ItemPanel } from "./item-panel";
import { AddKindDialog, KindsPanel } from "./kinds-panel";
import { MyAssets } from "./my-equipment";
import { useListQuery } from "@/lib/use-list-query";
import { RegisterTable } from "./register-table";
import { RepairDialog } from "./repair-dialog";
import { RepairsPanel, type RepairFilter } from "./repairs-panel";
import { TakeBackDialog } from "./take-back-dialog";

/**
 * Equipment — one route, rendered by role.
 *
 * PARITY.md's Rule 1. Somebody with `EDIT_RECORDS` opens `/people/assets` and
 * gets the register: every laptop, phone and SIM card, who has each one, and a
 * button to hand one over or take it back. Somebody without it gets **their
 * own** equipment, because `GET /assets/employees/:id` needs no permission for
 * your own id and a 403 wall would be the wrong answer to a fair question.
 * Same URL either way, so a link shared with a colleague works for them too.
 *
 * ## Why the register exists at all
 *
 * Offboarding. "Return company property" is only a checkable instruction if
 * something knows what somebody has, and the exit checklist is built from the
 * open assignments this screen creates. That is also why "who has it" is the
 * column the table is arranged around, and why every refusal here names a
 * person rather than reporting a failure.
 *
 * ## The word "asset" does not appear on this screen
 *
 * A Nigerian small-business owner says "the laptop". The backend module is
 * called `assets` because the tables are; `lib/api/assets.ts` is the only place
 * in the frontend that word belongs.
 */

/** The filter row. `FREE` is the API's `unassigned`, not `status=AVAILABLE`. */
type Filter = "ALL" | "FREE" | "ASSIGNED" | "IN_REPAIR" | "LOST";

/** The chip's wording, in the same words the control uses. */
const FILTER_LABEL: Record<Filter, string> = {
  ALL: "All",
  FREE: "Nobody has it",
  ASSIGNED: "With somebody",
  IN_REPAIR: "Being fixed",
  LOST: "Lost",
};

const money = (amount: number) => formatMoney(amount, "NGN", { decimals: true });

export function EquipmentScreen() {
  const { can, loading: permissionsLoading } = usePermissions();
  const canEdit = can("EDIT_RECORDS");

  /* Nothing is granted while the session resolves, so a register that rendered
     on the first pass would flash the employee's own view at an HR user. */
  if (permissionsLoading) {
    return (
      <>
        <PageHeader title="Equipment" />
        <PageBody className="flex items-center gap-2 py-16 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </PageBody>
      </>
    );
  }

  return canEdit ? <Register /> : <OwnKitOnly />;
}

/* ------------------------------------------------------------ staff view */

/**
 * What a member of staff sees at this URL.
 *
 * Their own kit and nothing else. No "you do not have permission" — they asked
 * a reasonable question and this is the honest answer to it.
 */
function OwnKitOnly() {
  return (
    <>
      <PageHeader
        title="Equipment"
      />
      <PageBody>
        <MyAssets />
      </PageBody>
    </>
  );
}

/* --------------------------------------------------------------- HR view */

function Register() {
  const { mode } = useSession();
  const toast = useToast();

  const [tab, setTab] = useState<"register" | "repairs" | "kinds">("register");
  const [includeInactiveKinds, setIncludeInactiveKinds] = useState(false);
  const [repairFilter, setRepairFilter] = useState<RepairFilter>("open");

  /**
   * The register's query — filter, sort and page, all sent to the API.
   *
   * The filters were already server-side; what was missing was the other two.
   * `useEquipment` sent no page at all, so the wrapper's `pageSize: 100` decided
   * how much of the register anybody could ever see: a company with 300 laptops
   * had 200 of them unreachable, with no control on screen to say so and a table
   * that looked complete. Sorting was a `localeCompare` on whatever arrived.
   */
  const list = useListQuery<{ filter: Filter; kindId: string; archived: boolean }>({
    filters: { filter: "ALL", kindId: "", archived: false },
    sort: "tag",
    pageSize: 25,
  });
  const { filter, kindId, archived: includeArchived } = list.filters;

  const [panelId, setPanelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingKind, setAddingKind] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [handingOver, setHandingOver] = useState<EquipmentItem | null>(null);
  const [takingBack, setTakingBack] = useState<EquipmentItem | null>(null);
  const [repairing, setRepairing] = useState<EquipmentItem | null>(null);
  const [archiving, setArchiving] = useState<EquipmentItem | null>(null);

  /* Debouncing lives in `useListQuery` now — typing is one request per pause,
     not one per keystroke, and the answers cannot arrive out of order because
     the store keys its state on the query it asked. */
  const params: AssetListParams = useMemo(
    () => ({
      page: list.page,
      pageSize: list.pageSize,
      ...(filter === "FREE" ? { unassigned: true } : {}),
      ...(filter === "ASSIGNED" ? { status: "ASSIGNED" as const } : {}),
      ...(filter === "IN_REPAIR" ? { status: "IN_REPAIR" as const } : {}),
      ...(filter === "LOST" ? { status: "LOST" as const } : {}),
      ...(kindId ? { categoryId: kindId } : {}),
      ...(list.params.q ? { q: list.params.q } : {}),
      ...(includeArchived ? { includeArchived: true } : {}),
      ...(list.sort ? { sort: list.sort as AssetListParams["sort"] } : {}),
      order: list.order,
    }),
    [
      list.page,
      list.pageSize,
      list.params.q,
      list.sort,
      list.order,
      filter,
      kindId,
      includeArchived,
    ],
  );

  const kinds = useEquipmentKinds(includeInactiveKinds);
  const register = useEquipment(params);
  const summary = useEquipmentSummary();
  const repairs = useRepairs({ state: repairFilter });

  const loadError =
    register.error ?? summary.error ?? repairs.error ?? kinds.error;

  /** Every mutation reports its own outcome. The API's messages are the point. */
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

  /**
   * The filters currently narrowing the register, as removable chips.
   *
   * Rendered outside the reveal by `FilterBar`, deliberately: a register showing
   * 12 laptops because somebody left "Being fixed" selected last week, with the
   * count above it agreeing, is the Rule 5 failure mode. The chips are how a
   * reader sees why the number is what it is.
   */
  const appliedFilters: AppliedFilter[] = [
    ...(filter !== "ALL"
      ? [
          {
            label: "Who has it",
            value: FILTER_LABEL[filter],
            onClear: () => list.setFilter("filter", "ALL" as Filter),
          },
        ]
      : []),
    ...(kindId
      ? [
          {
            label: "Kind",
            value: kinds.kinds.find((k) => k.id === kindId)?.name ?? "Selected",
            onClear: () => list.setFilter("kindId", ""),
          },
        ]
      : []),
    ...(includeArchived
      ? [
          {
            label: "Archived",
            value: "Included",
            onClear: () => list.setFilter("archived", false),
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

  const tabs = useMemo<TabItem[]>(
    () => [
      { id: "register", label: "Everything" },
      {
        id: "repairs",
        label: "Repairs",
        ...(summary.counts.openRepairs > 0
          ? { count: summary.counts.openRepairs }
          : {}),
      },
      { id: "kinds", label: "Kinds" },
    ],
    [summary.counts.openRepairs],
  );

  /* One place decides what a status button does, so the register table, the
     item panel and a toast cannot describe the same act differently. */
  async function setStatus(item: EquipmentItem, status: SettableStatus) {
    const message =
      status === "LOST"
        ? `${item.name} marked lost`
        : status === "RETIRED"
          ? `${item.name} written off`
          : `${item.name} back in use`;
    await run(() => register.editItem(item.id, { status }), message);
  }

  async function finishRepair(repair: Repair) {
    await run(
      () => repairs.saveRepair(repair.id, { completedOn: today() }),
      `${repair.itemName ?? "It"} is fixed`,
    );
  }

  return (
    <>
      <PageHeader
        title="Equipment"
        action={
          /*
            Two ways in, because there are two situations.
            `/people/assets/import` has existed since the import framework
            landed and **nothing linked to it** — the sixth feature in this
            product to be built and then left unreachable. A register is the
            screen somebody arrives at with a spreadsheet of forty items, so
            the bulk path belongs here and not only in a nav somebody has to
            already know about.
          */
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/people/assets/import" variant="secondary" size="sm">
              <Upload aria-hidden="true" className="size-4" />
              Import from a spreadsheet
            </ButtonLink>
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add equipment
            </Button>
          </div>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {DEMO_ENABLED && mode === "offline" && (
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted">
            <Badge tone="warning" size="sm">
              Demo
            </Badge>
            This register lives in this browser only, and refuses exactly what
            the real one refuses — including handing out a laptop somebody
            already has.
          </p>
        )}

        {loadError && (
          <LoadFailure subject="the equipment register" error={loadError} />
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* "Free to hand out" and the filter's "Nobody has it" are
              deliberately different words, because they are different sets: this
              is `status = AVAILABLE`, and the filter is the API's `unassigned`,
              which also catches whatever is in the workshop or written off. Two
              numbers under one label would be the worse mistake. */}
          <Stat
            label="Free to hand out"
            value={String(summary.counts.available)}
            hint="in the store, working"
          />
          <Stat
            label="With somebody"
            value={String(summary.counts.assigned)}
            hint={`${summary.counts.peopleHolding} ${
              summary.counts.peopleHolding === 1 ? "person" : "people"
            } holding something`}
          />
          <Stat
            label="Being fixed"
            value={String(summary.counts.inRepair)}
            hint={`${summary.counts.openRepairs} ${
              summary.counts.openRepairs === 1 ? "job" : "jobs"
            } still open`}
          />
          <Stat
            label="What it is all worth"
            value={money(summary.totalValue)}
            hint={`${summary.counts.total} ${
              summary.counts.total === 1 ? "thing" : "things"
            } on the register`}
          />
        </div>

        {/*
          A callout naming lost items used to sit here, full width, on every
          tab. It cost more space than it earned: the register's own "Lost"
          filter (below, in the tab bar) already reaches the same list in one
          click, so the banner was a second route to something one tab away.
        */}

        <Tabs items={tabs} value={tab} onChange={(next) => setTab(next as typeof tab)}>
          {tab === "register" && (
            <RegisterTable
              title="The register"
              description="Sorted by tag. Click any row for its history."
              items={register.items}
              loading={register.loading}
              /* Hand over, take back and bring back are on the item's own
                 panel, which the row opens. They were here too, which put four
                 buttons on every row of a list somebody scans to find one
                 thing — and the panel already had all three. */
              onOpen={(item) => setPanelId(item.id)}
              emptyAction={
                <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                  Add equipment
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
                  searchPlaceholder="Tag, name or serial"
                  searchLabel="Search by tag, name, serial number, make or model"
                  applied={appliedFilters}
                  onClearAll={list.clearFilters}
                  count={register.total}
                  noun={["thing", "things"]}
                  actions={
                    <SegmentedControl<Filter>
                      label="Who has it"
                      value={filter}
                      onChange={(value) => list.setFilter("filter", value)}
                      options={[
                        { value: "ALL", label: "All" },
                        { value: "FREE", label: "Nobody has it" },
                        { value: "ASSIGNED", label: "With somebody" },
                        { value: "IN_REPAIR", label: "Being fixed" },
                        { value: "LOST", label: "Lost" },
                      ]}
                    />
                  }
                >
                  <Field label="Kind of equipment">
                    <Select
                      value={kindId}
                      onChange={(event) =>
                        list.setFilter("kindId", event.target.value)
                      }
                    >
                      <option value="">Every kind</option>
                      {kinds.kinds.map((kind) => (
                        <option key={kind.id} value={kind.id}>
                          {kind.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Archived equipment"
                    help="Written off or retired. Hidden unless you ask."
                  >
                    <Switch
                      label="Show archived too"
                      checked={includeArchived}
                      onChange={(event) =>
                        list.setFilter("archived", event.target.checked)
                      }
                    />
                  </Field>
                </FilterBar>
              }
            />
          )}

          {tab === "repairs" && (
            <RepairsPanel
              repairs={repairs.repairs}
              loading={repairs.loading}
              canEdit
              filter={repairFilter}
              onFilterChange={setRepairFilter}
              onFinish={(repair) => void finishRepair(repair)}
            />
          )}

          {tab === "kinds" && (
            <KindsPanel
              kinds={kinds.kinds}
              loading={kinds.loading}
              canManage
              includeInactive={includeInactiveKinds}
              onIncludeInactiveChange={setIncludeInactiveKinds}
              onAdd={(input) =>
                run(() => kinds.addKind(input), `${input.name} added`)
              }
              onEdit={(id, input) => run(() => kinds.editKind(id, input), "Saved")}
            />
          )}
        </Tabs>
      </PageBody>

      {panelId && (
        <ItemPanel
          itemId={panelId}
          canEdit
          onClose={() => setPanelId(null)}
          onEdit={setEditing}
          onHandOver={setHandingOver}
          onTakeBack={setTakingBack}
          onLogRepair={setRepairing}
          onArchive={setArchiving}
          onRestore={(item) =>
            void run(
              () => register.restoreItem(item.id),
              `${item.name} is back on the register`,
            )
          }
          onSetStatus={(item, status) => void setStatus(item, status)}
          onFixed={(item) =>
            void run(
              () =>
                register.editItem(item.id, {
                  status: "AVAILABLE",
                  condition: "GOOD",
                }),
              `${item.name} is back in the store`,
            )
          }
          onFinishRepair={(repair) => void finishRepair(repair)}
        />
      )}

      {adding && (
        <ItemForm
          kinds={kinds.usable}
          onCreateKind={() => setAddingKind(true)}
          onClose={() => setAdding(false)}
          onCreate={async (input, assignTo) => {
            const id = await register.addItem(input);
            if (!assignTo) {
              toast.push({ title: `${input.name} added`, tone: "success" });
              return;
            }
            /* The register write already succeeded — a refusal past this
               point (an employee archived between opening the form and
               submitting it, say) must not read as "not saved" when the item
               plainly is. Named, and pointed at the door that still works. */
            try {
              await register.handOver(id, {
                employeeId: assignTo.employeeId,
                ...(input.condition ? { condition: input.condition } : {}),
              });
              toast.push({
                title: `${input.name} added and handed over`,
                tone: "success",
              });
            } catch (error) {
              toast.push({
                title: `${input.name} added, but could not be handed over`,
                tone: "warning",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Hand it over from its own page instead.",
              });
            }
          }}
        />
      )}

      {addingKind && (
        /* Over the item form, which stays mounted behind it and keeps what was
           typed. `addKind` refetches, so the new kind is in the picker as soon
           as this closes. */
        <AddKindDialog
          onClose={() => setAddingKind(false)}
          onAdd={(input) => run(() => kinds.addKind(input), `${input.name} added`)}
        />
      )}

      {editing && (
        <ItemForm
          item={editing}
          kinds={kinds.usable}
          onCreateKind={() => setAddingKind(true)}
          onClose={() => setEditing(null)}
          onSave={async (patch) => {
            await register.editItem(editing.id, patch);
            toast.push({ title: "Saved", tone: "success" });
          }}
        />
      )}

      {handingOver && (
        <HandOverDialog
          item={handingOver}
          onClose={() => setHandingOver(null)}
          onHandOver={async (input) => {
            await register.handOver(handingOver.id, input);
            toast.push({
              title: `${handingOver.name} handed over`,
              tone: "success",
            });
          }}
        />
      )}

      {takingBack && (
        <TakeBackDialog
          item={takingBack}
          onClose={() => setTakingBack(null)}
          onTakeBack={async (input) => {
            await register.takeBack(takingBack.id, input);
            toast.push({
              title:
                input.outcome === "DAMAGED"
                  ? `${takingBack.name} came back broken — it is in the workshop`
                  : `${takingBack.name} is back in the store`,
              tone: "success",
            });
          }}
        />
      )}

      {repairing && (
        <RepairDialog
          item={repairing}
          onClose={() => setRepairing(null)}
          onLog={async (input) => {
            await register.logRepair(repairing.id, input);
            toast.push({ title: "Repair logged", tone: "success" });
          }}
        />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name ?? ""}?`}
        confirmLabel="Archive"
        tone="danger"
        onConfirm={() => {
          if (!archiving) return;
          const item = archiving;
          void (async () => {
            try {
              const note = await register.archiveItem(item.id);
              toast.push({
                title: `${item.name} archived`,
                tone: "success",
                detail: note,
              });
              setArchiving(null);
              setPanelId(null);
            } catch (error) {
              toast.push({
                title: "Could not archive it",
                tone: "danger",
                detail:
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
              });
            }
          })();
        }}
        body="Archived, not deleted. Past assignments still show who had it."
      />
    </>
  );
}
