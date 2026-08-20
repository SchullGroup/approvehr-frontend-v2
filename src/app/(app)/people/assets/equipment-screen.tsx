"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  ConfirmDialog,
  Input,
  SegmentedControl,
  Select,
  Spinner,
  Stat,
  Tabs,
  formatMoney,
  useToast,
  type TabItem,
} from "@/components/ui";
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
import { KindsPanel } from "./kinds-panel";
import { MyAssets } from "./my-equipment";
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
        <PageBody className="flex items-center gap-2 py-16 text-[0.875rem] text-muted">
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
        description="What the company has given you, and what you would hand back."
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
  const [filter, setFilter] = useState<Filter>("ALL");
  const [kindId, setKindId] = useState("");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [includeInactiveKinds, setIncludeInactiveKinds] = useState(false);
  const [repairFilter, setRepairFilter] = useState<RepairFilter>("open");

  const [panelId, setPanelId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EquipmentItem | null>(null);
  const [handingOver, setHandingOver] = useState<EquipmentItem | null>(null);
  const [takingBack, setTakingBack] = useState<EquipmentItem | null>(null);
  const [repairing, setRepairing] = useState<EquipmentItem | null>(null);
  const [archiving, setArchiving] = useState<EquipmentItem | null>(null);

  /* Typing is not a query. Without this every keystroke is a request and the
     answers arrive out of order. */
  useEffect(() => {
    const timer = setTimeout(() => setQ(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const params: AssetListParams = {
    ...(filter === "FREE" ? { unassigned: true } : {}),
    ...(filter === "ASSIGNED" ? { status: "ASSIGNED" as const } : {}),
    ...(filter === "IN_REPAIR" ? { status: "IN_REPAIR" as const } : {}),
    ...(filter === "LOST" ? { status: "LOST" as const } : {}),
    ...(kindId ? { categoryId: kindId } : {}),
    ...(q ? { q } : {}),
    ...(includeArchived ? { includeArchived: true } : {}),
  };

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
        description="Every laptop, phone and SIM card the company owns, and who has each one."
        action={
          <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add equipment
          </Button>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {mode === "offline" && (
          <p className="flex flex-wrap items-center gap-2 text-[0.875rem] text-muted">
            <Badge tone="warning" size="sm">
              Demo
            </Badge>
            This register lives in this browser only, and refuses exactly what
            the real one refuses — including handing out a laptop somebody
            already has.
          </p>
        )}

        {loadError && (
          <Callout tone="danger" title="Could not load the register">
            {loadError.message}
          </Callout>
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

        {summary.counts.lost > 0 && (
          <Card>
            <CardBody className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-[0.9375rem] text-ink">
                {summary.counts.lost}{" "}
                {summary.counts.lost === 1 ? "thing is" : "things are"} marked
                lost. Whoever had it still owes it.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setFilter("LOST");
                  setTab("register");
                }}
              >
                Show them
              </Button>
            </CardBody>
          </Card>
        )}

        <Tabs items={tabs} value={tab} onChange={(next) => setTab(next as typeof tab)}>
          {tab === "register" && (
            <RegisterTable
              title="The register"
              description="Sorted by tag. Click any row for its history."
              items={register.items}
              loading={register.loading}
              canEdit
              onOpen={(item) => setPanelId(item.id)}
              onHandOver={setHandingOver}
              onTakeBack={setTakingBack}
              onRestore={(item) =>
                void run(
                  () => register.restoreItem(item.id),
                  `${item.name} is back on the register`,
                )
              }
              emptyAction={
                <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                  Add equipment
                </Button>
              }
              filters={
                <>
                  <SegmentedControl<Filter>
                    label="Filter equipment"
                    value={filter}
                    onChange={setFilter}
                    options={[
                      { value: "ALL", label: "All" },
                      { value: "FREE", label: "Nobody has it" },
                      { value: "ASSIGNED", label: "With somebody" },
                      { value: "IN_REPAIR", label: "Being fixed" },
                      { value: "LOST", label: "Lost" },
                    ]}
                  />
                  <Select
                    className="w-44"
                    aria-label="Filter by kind of equipment"
                    value={kindId}
                    onChange={(e) => {
                      const value = e.target.value;
                      setKindId(value);
                    }}
                  >
                    <option value="">Every kind</option>
                    {kinds.kinds.map((kind) => (
                      <option key={kind.id} value={kind.id}>
                        {kind.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    className="w-52"
                    icon={<Search aria-hidden="true" />}
                    placeholder="Tag, name or serial"
                    aria-label="Search by tag, name, serial number, make or model"
                    value={search}
                    onChange={(e) => {
                      const value = e.target.value;
                      setSearch(value);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-pressed={includeArchived}
                    onClick={() => setIncludeArchived((value) => !value)}
                  >
                    {includeArchived ? "Hide archived" : "Show archived"}
                  </Button>
                </>
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
          onClose={() => setAdding(false)}
          onCreate={async (input) => {
            await register.addItem(input);
            toast.push({ title: `${input.name} added`, tone: "success" });
          }}
        />
      )}

      {editing && (
        <ItemForm
          item={editing}
          kinds={kinds.usable}
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
