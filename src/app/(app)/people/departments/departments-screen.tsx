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
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { useDepartments, type DepartmentNode } from "@/lib/store/departments";
import { useEmployeeDirectory } from "@/lib/store/employees-api";

/**
 * Departments and teams.
 *
 * ## Why one tree and not two lists
 *
 * A team is a department with a parent. The interface labels by depth — top
 * level reads "Department", anything nested reads "Team" — so the model stays
 * simple and a company that wants Division → Department → Team is not blocked by
 * a two-level ceiling.
 *
 * ## The two numbers
 *
 * Every row shows **direct** and **rolled-up** headcount, always both. They
 * answer different questions: payroll reports by direct assignment, a head is
 * responsible for the roll-up. Showing one and labelling it "employees" is how
 * the two get confused, and the confusion is expensive when it is a cost centre.
 */
export function DepartmentsScreen() {
  const departments = useDepartments();
  const { employees } = useEmployeeDirectory({ pageSize: 200 });
  const toast = useToast();

  const [creating, setCreating] = useState<{ parentId?: string } | null>(null);
  const [editing, setEditing] = useState<DepartmentNode | null>(null);
  const [archiving, setArchiving] = useState<DepartmentNode | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const totalPayroll = useMemo(
    () => departments.tree.reduce((sum, node) => sum + node.payrollKobo, 0),
    [departments.tree],
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

  return (
    <>
      <PageHeader
        title="Departments and teams"
        description="Your org structure, and what each unit costs a month."
        action={
          departments.editable ? (
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
        {!departments.editable && (
          <Callout tone="warning" title="Read-only in demo mode">
            This tree is derived from the seed data. Changing the org structure
            needs the API, because a department is a payroll reporting boundary —
            a tree kept in this browser would never reach a real run.
          </Callout>
        )}

        {departments.error && (
          <Callout tone="danger" title="Could not load the structure">
            {departments.error.message}
          </Callout>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Departments"
            value={String(departments.counts.departments)}
          />
          <Stat label="Teams" value={String(departments.counts.teams)} />
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
            They will not appear in any department payroll report, and no head is
            responsible for them. Assign them from a person&rsquo;s record, or from
            the directory.
          </Callout>
        )}

        <Card>
          <CardHeader
            title="Structure"
            description="Top level is a department. Anything nested inside one is a team."
          />
          {departments.tree.length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title={departments.loading ? "Loading…" : "No departments yet"}
              description={
                departments.loading
                  ? "Reading your structure."
                  : "Add your first department to start grouping people and reporting payroll by cost centre."
              }
            />
          ) : (
            <CardBody className="flex flex-col gap-1.5">
              {departments.tree.map((node) => (
                <DepartmentRow
                  key={node.id}
                  node={node}
                  expanded={expanded}
                  onToggle={toggle}
                  editable={departments.editable}
                  onAddTeam={(parentId) => setCreating({ parentId })}
                  onEdit={setEditing}
                  onArchive={setArchiving}
                  onRestore={(id) =>
                    void run(() => departments.restore(id), "Restored")
                  }
                />
              ))}
            </CardBody>
          )}
        </Card>
      </PageBody>

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
              body.parentId ? "Team added" : "Department added",
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

function DepartmentRow({
  node,
  expanded,
  onToggle,
  editable,
  onAddTeam,
  onEdit,
  onArchive,
  onRestore,
}: {
  node: DepartmentNode;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  editable: boolean;
  onAddTeam: (parentId: string) => void;
  onEdit: (node: DepartmentNode) => void;
  onArchive: (node: DepartmentNode) => void;
  onRestore: (id: string) => void;
}) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isTeam = node.depth > 0;

  return (
    <div>
      <div
        className={cn(
          "flex flex-wrap items-center gap-3 rounded-md border border-line p-3 transition-colors",
          node.archived ? "opacity-60" : "hover:bg-canvas",
        )}
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
            {isTeam && (
              <CornerDownRight className="size-4 text-faint" aria-hidden="true" />
            )}
          </span>
        )}

        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4",
            isTeam ? "bg-sunken text-muted" : "bg-accent-soft text-accent-text",
          )}
        >
          {isTeam ? <Users aria-hidden="true" /> : <Building2 aria-hidden="true" />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-ink">
            {node.name}
            <Badge tone={isTeam ? "neutral" : "accent"} size="sm">
              {isTeam ? "Team" : "Department"}
            </Badge>
            {node.archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
            {node.costCentre && (
              <span className="tabular text-[0.75rem] text-muted">
                {node.costCentre}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[0.875rem] text-muted">
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

        {/* Both numbers, always. They answer different questions. */}
        <div className="flex shrink-0 items-center gap-5 text-right">
          <div>
            <p className="text-[0.75rem] uppercase tracking-wide text-faint">
              Direct
            </p>
            <p className="tabular text-[0.9375rem] font-medium text-ink">
              {node.directEmployees}
            </p>
          </div>
          <div>
            <p className="text-[0.75rem] uppercase tracking-wide text-faint">
              With teams
            </p>
            <p className="tabular text-[0.9375rem] font-medium text-ink">
              {node.totalEmployees}
            </p>
          </div>
          <div className="hidden sm:block">
            <p className="text-[0.75rem] uppercase tracking-wide text-faint">
              Monthly
            </p>
            <p className="tabular text-[0.9375rem] font-medium text-ink">
              <Money amount={node.payrollKobo / 100} compact />
            </p>
          </div>
        </div>

        {editable && (
          <div className="flex shrink-0 gap-1.5">
            {node.archived ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onRestore(node.id)}
              >
                <RotateCcw aria-hidden="true" className="size-3.5" />
                Restore
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddTeam(node.id)}
                  aria-label={`Add a team inside ${node.name}`}
                >
                  <Plus aria-hidden="true" className="size-3.5" />
                  Team
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
              editable={editable}
              onAddTeam={onAddTeam}
              onEdit={onEdit}
              onArchive={onArchive}
              onRestore={onRestore}
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
      title={parentId ? `Add a team in ${parentName}` : "Add a department"}
      description={
        parentId
          ? "A team sits inside a department and rolls its headcount and payroll up into it."
          : "A top-level unit. You can add teams inside it afterwards."
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
            {busy ? "Adding…" : parentId ? "Add team" : "Add department"}
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
