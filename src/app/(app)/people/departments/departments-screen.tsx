"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronRight,
  CornerDownRight,
  Plus,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
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
  Money,
  Select,
  Stat,
  Tabs,
  useToast,
  type TabItem,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { isUnassigned } from "@/lib/store/demo-structure";
import { useDepartments, type DepartmentNode } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { AssignPeopleDialog } from "./assign-people-dialog";
import { TeamsPanel } from "./teams-panel";

/**
 * Departments and teams — two tabs, because they are two different things.
 *
 * ## Why the tree is one table and the teams are another
 *
 * The tree is the **cost-centre structure**, and it is one column on the
 * employee: `departmentId`. A person sits in exactly one node of it, and every
 * payroll report and every past payslip depends on that. Nesting is still
 * allowed — Division → Department → Sub-department is a shape a group company
 * needs — so it stays one table.
 *
 * What that shape cannot express is somebody being in Engineering **and** on the
 * Platform team, which is the shape every company with more than one project
 * actually has. So a team is its own thing, on the other tab, and joining one
 * does not move anybody's pay.
 *
 * **This screen used to call a nested department a "Team", and that was a name
 * collision waiting to happen.** It says "Sub-department" now: two things called
 * a team, one of which moves your cost centre and one of which does not, is the
 * kind of ambiguity somebody eventually gets paid wrong over.
 *
 * ## The two numbers
 *
 * Every row shows **direct** and **rolled-up** headcount, always both. They
 * answer different questions: payroll reports by direct assignment, a head is
 * responsible for the roll-up. Showing one and labelling it "employees" is how
 * the two get confused, and the confusion is expensive when it is a cost centre.
 *
 * ## Demo mode edits now, and says what it cannot do
 *
 * This screen used to render a "Read-only in demo mode" callout and no buttons,
 * because `store/departments.ts` refused every write without an API. It does
 * not any more — read that file's header for why the argument was right and the
 * conclusion was wrong. The warning it replaced the refusal with is
 * `departments.demoNote`, rendered on both tabs.
 *
 * ## Archived units are fetched, and that is what makes Restore reachable
 *
 * `useDepartments(true)`. With the default `false` an archived unit vanished
 * from the tree the moment it was archived, so the Restore button on the row
 * could never render and archiving was one-way from the interface. Archived
 * units are listed in their own card instead of dimmed inside the tree — the
 * same shape the Teams tab uses, and it keeps a live parent's children list to
 * live children.
 */
export function DepartmentsScreen() {
  const departments = useDepartments(true);
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();
  /* The same split the API enforces and the Teams tab already renders:
     `MANAGE_SETTINGS` changes the structure, `EDIT_RECORDS` moves people into
     it — because that write moves a cost centre. This screen had no gate at all
     before, so it offered an office manager buttons the API would refuse. */
  const canManage = useCan("MANAGE_SETTINGS");
  const canAssign = useCan("EDIT_RECORDS");

  const [tab, setTab] = useState<"structure" | "teams">("structure");
  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [editing, setEditing] = useState<DepartmentNode | null>(null);
  const [archiving, setArchiving] = useState<DepartmentNode | null>(null);
  const [assigning, setAssigning] = useState<DepartmentNode | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignFailed, setAssignFailed] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /**
   * Name, id, job title and where they are now, for both assignment dialogs.
   *
   * `toEmployee` in `lib/api/endpoints.ts` renders a missing department as the
   * em-dash placeholder `"—"` rather than null, because most screens print the
   * field straight into a table cell. Here it has to be **absent**, so the
   * dialog can say "No department" instead of "Now in —", which reads as a
   * department somebody named after a punctuation mark. `isUnassigned` is that
   * test, shared with the store, because the placeholder has been three
   * different strings and a hand-written `!== "—"` here caught one of them.
   */
  const people = useMemo(
    () =>
      employees.map((person) => ({
        id: person.id,
        name: `${person.firstName} ${person.lastName}`,
        jobTitle: person.jobTitle,
        departmentName: isUnassigned(person.department) ? null : person.department,
      })),
    [employees],
  );

  /**
   * The live tree, the archived list, and the two counts, all derived.
   *
   * `counts` from the endpoint is computed over the rows it returned, and this
   * screen asks for the archived ones — so `counts.departments` would include
   * an archived department and the stat would read one higher than the tree
   * shows. `unassignedEmployees` is taken from `counts` because it is a fact
   * about people rather than about the rows returned.
   */
  const liveTree = useMemo(() => withoutArchived(departments.tree), [departments.tree]);
  const archivedUnits = useMemo(
    () => departments.flat.filter((unit) => unit.archived),
    [departments.flat],
  );
  const liveUnits = useMemo(
    () => departments.flat.filter((unit) => !unit.archived),
    [departments.flat],
  );
  const departmentCount = liveUnits.filter((unit) => unit.depth === 0).length;
  const subDepartmentCount = liveUnits.length - departmentCount;

  const totalPayroll = useMemo(
    () => liveTree.reduce((sum, node) => sum + node.payrollKobo, 0),
    [liveTree],
  );

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** Every mutation reports its own failure — the API messages are the useful part. */
  const run = async (action: () => Promise<unknown>, success: string) => {
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
  };

  const tabs: TabItem[] = [
    { id: "structure", label: "Structure", count: departmentCount },
    { id: "teams", label: "Teams" },
  ];

  return (
    <>
      <PageHeader
        title="Departments and teams"
        description="Your org structure, and what each unit costs a month."
        meta={
          DEMO_ENABLED && departments.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · this browser only
            </Badge>
          ) : undefined
        }
        action={
          canManage && tab === "structure" ? (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setCreating({})}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add department
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {/* The warning that replaced the refusal. It is the honest half of the
            old callout: local structure is real and editable, and it does not
            reach a payroll run. Rendered on both tabs because both write to the
            same local data. */}
        {DEMO_ENABLED && departments.source === "demo" && (
          <Callout tone="warning" title="Demo structure, this browser only">
            {departments.demoNote}
          </Callout>
        )}

        {departments.error && (
          <LoadFailure subject="the company structure" error={departments.error} />
        )}

        <Tabs
          items={tabs}
          value={tab}
          onChange={(next) => setTab(next === "teams" ? "teams" : "structure")}
        >
          {tab === "structure" ? (
            <div className="flex flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Stat label="Departments" value={String(departmentCount)} />
                {/* The API still calls a nested department a "team" in its own
                    count. The label does not, because the Teams tab owns that
                    word now — see the header. Counted here from the flat list
                    rather than taken from `counts`, which includes the archived
                    rows this screen asks for. */}
                <Stat
                  label="Sub-departments"
                  value={String(subDepartmentCount)}
                  hint="nested inside another"
                />
                <Stat
                  label="Monthly payroll"
                  value={<Money amount={totalPayroll / 100} compact />}
                  hint="across every unit"
                />
                <Stat
                  label="Unassigned"
                  value={String(departments.counts.unassignedEmployees)}
                  trend={
                    departments.counts.unassignedEmployees > 0
                      ? { direction: "down", label: "No cost centre" }
                      : undefined
                  }
                  hint="people in no department"
                />
              </div>

              {departments.counts.unassignedEmployees > 0 && (
                <Callout tone="warning" title="Some people are in no department">
                  They will not appear in any department payroll report, and no
                  head is responsible for them. Use{" "}
                  <strong>Assign people</strong> on the department they belong
                  to, or set it on their own record.
                </Callout>
              )}

              <Card>
                <CardHeader
                  title="Structure"
                  description="Top level is a department. Anything nested inside one is a sub-department, and it rolls up into its parent."
                />
                {liveTree.length === 0 ? (
                  <EmptyState
                    icon={<Building2 aria-hidden="true" />}
                    title={departments.loading ? "Loading…" : "No departments yet"}
                    description={
                      departments.loading
                        ? "Reading your structure."
                        : "Add your first department to start grouping people and reporting payroll by cost centre."
                    }
                    action={
                      canManage && !departments.loading ? (
                        <Button variant="accent" onClick={() => setCreating({})}>
                          Add the first department
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <CardBody className="flex flex-col gap-1.5">
                    {liveTree.map((node) => (
                      <DepartmentRow
                        key={node.id}
                        node={node}
                        expanded={expanded}
                        onToggle={toggle}
                        canManage={canManage}
                        canAssign={canAssign}
                        onAddChild={(parentId) => setCreating({ parentId })}
                        onEdit={setEditing}
                        onArchive={setArchiving}
                        onAssign={setAssigning}
                      />
                    ))}
                  </CardBody>
                )}
              </Card>

              {archivedUnits.length > 0 && (
                <Card>
                  <CardHeader
                    title="Archived"
                    description="Hidden, not deleted. Past payslips still reference the department they were run against, so nothing is ever spliced out."
                  />
                  <CardBody className="flex flex-col gap-1.5">
                    {archivedUnits.map((unit) => (
                      <ArchivedRow
                        key={unit.id}
                        unit={unit}
                        canManage={canManage}
                        onRestore={() =>
                          void run(
                            () => departments.restore(unit.id),
                            `${unit.name} restored`,
                          )
                        }
                      />
                    ))}
                  </CardBody>
                </Card>
              )}
            </div>
          ) : (
            <TeamsPanel
              departments={departments.flat.map((one) => ({
                id: one.id,
                name: one.name,
                depth: one.depth,
                archived: one.archived,
              }))}
              employees={people}
            />
          )}
        </Tabs>
      </PageBody>

      {assigning && (
        <AssignPeopleDialog
          title={`Assign people to ${assigning.name}`}
          description="Move a group into this department in one go, rather than editing records one at a time."
          effect={`Everybody chosen is reported under ${assigning.name} from now on. Past payslips keep the department they were run with.`}
          confirmLabel="Move them here"
          busy={assignBusy}
          failed={assignFailed}
          candidates={people.map((person) => ({
            id: person.id,
            name: person.name,
            jobTitle: person.jobTitle,
            currentLabel: person.departmentName || null,
            already: person.departmentName === assigning.name,
          }))}
          onClose={() => {
            setAssigning(null);
            setAssignFailed(null);
          }}
          onAssign={(employeeIds) => {
            setAssignBusy(true);
            setAssignFailed(null);
            void (async () => {
              try {
                const result = await departments.assign(assigning.id, employeeIds);
                toast.push({
                  title:
                    result.moved === 1
                      ? `1 person moved into ${assigning.name}`
                      : `${result.moved} people moved into ${assigning.name}`,
                  tone: "success",
                });
                setAssigning(null);
              } catch (error) {
                setAssignFailed(
                  error instanceof ApiError
                    ? error.message
                    : "Something went wrong. Try again.",
                );
              } finally {
                setAssignBusy(false);
              }
            })();
          }}
        />
      )}

      {creating && (
        <CreateDialog
          parentId={creating.parentId}
          parentName={
            creating.parentId
              ? departments.flat.find((d) => d.id === creating.parentId)?.name
              : undefined
          }
          onClose={() => setCreating(null)}
          onCreate={async (body) => {
            const ok = await run(
              () => departments.create(body),
              body.parentId ? "Sub-department added" : "Department added",
            );
            if (ok) setCreating(null);
          }}
        />
      )}

      {editing && (
        <EditDialog
          node={editing}
          options={departments.flat}
          employees={employees.map((e) => ({
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
          }))}
          onClose={() => setEditing(null)}
          onSave={async (body, parentId) => {
            const ok = await run(async () => {
              await departments.update(editing.id, body);
              if (parentId !== undefined && parentId !== editing.parentId) {
                await departments.move(editing.id, parentId);
              }
            }, "Saved");
            if (ok) setEditing(null);
          }}
        />
      )}

      <ConfirmDialog
        open={archiving !== null}
        onClose={() => setArchiving(null)}
        title={`Archive ${archiving?.name ?? ""}?`}
        confirmLabel="Archive"
        tone="danger"
        onConfirm={async () => {
          if (!archiving) return;
          const ok = await run(
            () => departments.archive(archiving.id),
            `${archiving.name} archived`,
          );
          if (ok) setArchiving(null);
        }}
        body="Hidden, not deleted. Move anyone still in it first."
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The tree with archived units taken out, at every level.
 *
 * `useDepartments(true)` is what makes Restore reachable, and the cost is that
 * an archived unit would otherwise appear inside the tree. Archiving refuses
 * while a unit has live children, so everything pruned here is a leaf.
 */
function withoutArchived(nodes: DepartmentNode[]): DepartmentNode[] {
  return nodes
    .filter((node) => !node.archived)
    .map((node) => ({ ...node, children: withoutArchived(node.children) }));
}

/**
 * An archived unit, in its own card.
 *
 * Deliberately not the full row: an archived department has nobody in it —
 * archiving refuses otherwise — so People and Monthly would both read zero, and
 * zeroes beside a name look like a figure that failed to load rather than a unit
 * that is empty by definition.
 */
function ArchivedRow({
  unit,
  canManage,
  onRestore,
}: {
  unit: Omit<DepartmentNode, "children">;
  canManage: boolean;
  onRestore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-canvas p-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sunken text-muted [&>svg]:size-4"
      >
        {unit.parentId ? (
          <Users aria-hidden="true" />
        ) : (
          <Building2 aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
          {unit.name}
          <Badge tone="neutral" size="sm">
            {unit.parentId ? "Sub-department" : "Department"}
          </Badge>
          <Badge tone="warning" size="sm">
            Archived
          </Badge>
          {unit.costCentre && (
            <span className="tabular text-meta text-muted">{unit.costCentre}</span>
          )}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">
          Nobody is in it. Restoring puts it back where it was, or at the top if
          its parent is archived too.
        </p>
      </div>

      {canManage && (
        <Button variant="secondary" size="sm" onClick={onRestore}>
          <RotateCcw aria-hidden="true" className="size-3.5" />
          Restore
        </Button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function DepartmentRow({
  node,
  expanded,
  onToggle,
  canManage,
  canAssign,
  onAddChild,
  onEdit,
  onArchive,
  onAssign,
}: {
  node: DepartmentNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  /** Changes the structure: add, rename, re-home, archive. */
  canManage: boolean;
  /** Moves people into it, which moves a cost centre. */
  canAssign: boolean;
  onAddChild: (parentId: string) => void;
  onEdit: (node: DepartmentNode) => void;
  onArchive: (node: DepartmentNode) => void;
  onAssign: (node: DepartmentNode) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  /* Nested means sub-department, not "team". The Teams tab owns that word. */
  const isNested = node.depth > 0;

  return (
    <div>
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3 transition-colors hover:bg-canvas"
        style={{ marginLeft: node.depth * 20 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={isOpen}
            aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.name}`}
            className="rounded p-0.5 text-muted hover:bg-sunken hover:text-ink"
          >
            <ChevronRight
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform duration-150",
                isOpen && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="inline-block size-5">
            {isNested && (
              <CornerDownRight className="size-4 text-faint" aria-hidden="true" />
            )}
          </span>
        )}

        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4",
            isNested ? "bg-sunken text-muted" : "bg-accent-soft text-accent-text",
          )}
        >
          {isNested ? <Users aria-hidden="true" /> : <Building2 aria-hidden="true" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
            {node.name}
            <Badge tone={isNested ? "neutral" : "accent"} size="sm">
              {isNested ? "Sub-department" : "Department"}
            </Badge>
            {node.costCentre && (
              <span className="tabular text-meta text-muted">
                {node.costCentre}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-body-sm text-muted">
            {node.headName ? (
              <>
                Led by{" "}
                <Link
                  href={`/people/${node.headId}`}
                  className="hover:text-accent-text hover:underline underline-offset-4"
                >
                  {node.headName}
                </Link>
              </>
            ) : (
              <span className="text-faint">No head assigned</span>
            )}
          </p>
        </div>

{/*
         * Two numbers, not four.
         *
         * `Direct` and `Rolled up` answered different questions and were shown
         * side by side to make the difference legible. In practice they are equal
         * on every row until somebody nests a sub-department, so the row carried
         * two identical figures under two headings nobody had asked about.
         *
         * `totalEmployees` is the one kept: "how many people are in this
         * department" includes the people in its sub-departments, which is what
         * the word means to whoever is reading. `directEmployees` is still on the
         * node and still what the sub-unit rows below express by being nested.
         *
         * **The cost of the choice, stated:** a rolled-up figure counts a person
         * once per ancestor, so once nesting exists these rows no longer sum to
         * the company total — the "Monthly payroll across every unit" stat above
         * is computed separately and remains the honest total. Showing both
         * columns is what used to make that visible. If a nested structure ever
         * makes the discrepancy confusing, the fix is a sub-unit's figure shown
         * as a share of its parent, not the second column back.
         */}
        <div className="flex shrink-0 items-center gap-6 text-right">
          <div>
            <p className="text-meta uppercase tracking-wide text-faint">
              People
            </p>
            <p className="tabular text-body font-medium text-ink">
              {node.totalEmployees}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-meta uppercase tracking-wide text-faint">
              Monthly
            </p>
            <p className="tabular text-body font-medium text-ink">
              <Money amount={node.payrollKobo / 100} compact />
            </p>
          </div>
        </div>

        {(canAssign || canManage) && (
          <div className="flex shrink-0 gap-1.5">
            {canAssign && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onAssign(node)}
                aria-label={`Assign people to ${node.name}`}
              >
                <UserPlus aria-hidden="true" className="size-3.5" />
                Assign people
              </Button>
            )}
            {canManage && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddChild(node.id)}
                  aria-label={`Add a sub-department inside ${node.name}`}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Sub-unit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onEdit(node)}>
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onArchive(node)}
                  aria-label={`Archive ${node.name}`}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      {isOpen &&
        node.children.map((child) => (
          <div key={child.id} className="mt-1.5">
            <DepartmentRow
              node={child}
              expanded={expanded}
              onToggle={onToggle}
              canManage={canManage}
              canAssign={canAssign}
              onAddChild={onAddChild}
              onEdit={onEdit}
              onArchive={onArchive}
              onAssign={onAssign}
            />
          </div>
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function CreateDialog({
  parentId,
  parentName,
  onClose,
  onCreate,
}: {
  parentId?: string;
  parentName?: string;
  onClose: () => void;
  onCreate: (body: {
    name: string;
    parentId?: string;
    costCentre?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [costCentre, setCostCentre] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={
        parentId ? `Add a sub-department in ${parentName}` : "Add a department"
      }
      description={
        parentId
          ? "It sits inside its parent and rolls its headcount and payroll up into it. For a working group that spans departments, use the Teams tab instead."
          : "A top-level cost centre. You can nest units inside it afterwards."
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={name.trim().length < 2 || busy}
            onClick={() => {
              setBusy(true);
              void onCreate({
                name: name.trim(),
                ...(parentId ? { parentId } : {}),
                ...(costCentre.trim() ? { costCentre: costCentre.trim() } : {}),
              }).finally(() => setBusy(false));
            }}
          >
            {busy ? "Adding…" : parentId ? "Add sub-department" : "Add department"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required>
          <Input
            value={name}
            autoFocus
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
            }}
          />
        </Field>
        <Field
          label="Cost centre"
          help="Optional. Used to group this unit in payroll reporting."
        >
          <Input
            value={costCentre}
            placeholder="CC-ENG-01"
            onChange={(e) => {
              const v = e.target.value;
              setCostCentre(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditDialog({
  node,
  options,
  employees,
  onClose,
  onSave,
}: {
  node: DepartmentNode;
  options: Omit<DepartmentNode, "children">[];
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSave: (
    body: { name?: string; headId?: string | null; costCentre?: string | null },
    parentId?: string | null,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(node.name);
  const [headId, setHeadId] = useState(node.headId ?? "");
  const [costCentre, setCostCentre] = useState(node.costCentre ?? "");
  const [parentId, setParentId] = useState(node.parentId ?? "");
  const [busy, setBusy] = useState(false);

  /* A unit cannot be moved under itself or its own descendants. The API refuses
     it too — this just keeps the impossible option out of the list. */
  const descendantIds = useMemo(() => {
    const ids = new Set<string>([node.id]);
    const walk = (parent: string) => {
      for (const candidate of options) {
        if (candidate.parentId === parent && !ids.has(candidate.id)) {
          ids.add(candidate.id);
          walk(candidate.id);
        }
      }
    };
    walk(node.id);
    return ids;
  }, [node.id, options]);

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${node.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={name.trim().length < 2 || busy}
            onClick={() => {
              setBusy(true);
              void onSave(
                {
                  ...(name.trim() !== node.name ? { name: name.trim() } : {}),
                  headId: headId === "" ? null : headId,
                  costCentre: costCentre.trim() === "" ? null : costCentre.trim(),
                },
                parentId === "" ? null : parentId,
              ).finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required>
          <Input
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
            }}
          />
        </Field>

        <Field
          label="Head"
          help="Who leads it. A head is responsible for everyone beneath the unit, not only their direct reports."
        >
          <Select
            value={headId}
            onChange={(e) => {
              const v = e.target.value;
              setHeadId(v);
            }}
          >
            <option value="">Nobody assigned</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Sits inside"
          help="Move it under another unit, or make it a top-level department."
        >
          <Select
            value={parentId}
            onChange={(e) => {
              const v = e.target.value;
              setParentId(v);
            }}
          >
            <option value="">Top level — a department</option>
            {options
              .filter((option) => !descendantIds.has(option.id) && !option.archived)
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {"— ".repeat(option.depth)}
                  {option.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Cost centre">
          <Input
            value={costCentre}
            onChange={(e) => {
              const v = e.target.value;
              setCostCentre(v);
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
