"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  Modal,
  Money,
  Select,
  Spinner,
  Stat,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { membershipEffect, type ApiMoved, type ApiTeam } from "@/lib/api/teams";
import { useCan } from "@/lib/permissions";
import { useTeam, useTeamMutations, useTeams } from "@/lib/store/teams";
import { AssignPeopleDialog } from "./assign-people-dialog";

/**
 * Teams — the working groups, beside the cost-centre tree rather than inside it.
 *
 * ## Why this is not the same thing as a nested department
 *
 * The tree on the other tab is one column on the employee: `departmentId`. A
 * person is in exactly one node of it, and every payroll report and every past
 * payslip depends on that. What that shape cannot express is somebody being in
 * Engineering **and** on the Platform team, which is the shape every company
 * with more than one project actually has — so a team is its own table with its
 * own membership list, and joining one does not move anybody's pay.
 *
 * The two words were colliding before this existed: the tree labelled a nested
 * department "Team". It now says "Sub-department", and this tab owns the word.
 *
 * ## The rule, stated before the write and again after it
 *
 * A team that belongs to a department implies its members are in that
 * department, and the API enforces it by **moving people**. Every write that can
 * trigger the move returns `moved` — names, not a count — and every one of them
 * is rendered here, because a cost centre changing silently is the bug and a
 * screen that drops the list is that bug arriving anyway.
 *
 * `membershipEffect` is the sentence shown *before* the write. It comes from the
 * API wrapper so the dialog and the toast cannot describe the same act
 * differently.
 *
 * ## Demo mode used to render a refusal where this list is
 *
 * It did — one callout saying the teams surface could only be demonstrated
 * against a running API, because putting somebody on a departmental team moves
 * their department and a cost centre built in a browser reaches no payroll run.
 * `store/teams.ts` now implements the whole surface locally, including that move
 * and the `moved` list it reports; read its header and `store/departments.ts`'s
 * for why the argument was right and the conclusion was wrong. The warning that
 * replaced the refusal is rendered once, above both tabs, by the screen.
 */
export function TeamsPanel({
  departments,
  employees,
}: {
  departments: { id: string; name: string; depth: number; archived: boolean }[];
  employees: { id: string; name: string; jobTitle?: string | null; departmentName?: string | null }[];
}) {
  const teams = useTeams({ includeArchived: true });
  const mutations = useTeamMutations();
  const canManage = useCan("MANAGE_SETTINGS");
  const canEditRecords = useCan("EDIT_RECORDS");
  const toast = useToast();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ApiTeam | null>(null);
  const [archiving, setArchiving] = useState<ApiTeam | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const active = useMemo(() => teams.teams.filter((team) => !team.archived), [teams.teams]);
  const archived = useMemo(() => teams.teams.filter((team) => team.archived), [teams.teams]);

  /**
   * Every mutation reports its own failure in the API's words, and its own
   * `moved` list when it has one.
   *
   * The names go in the toast `detail` rather than being summarised as a count:
   * "3 people moved department" is not something anybody can check, and the
   * person whose cost centre moved is the one who needs it to be checkable.
   */
  const run = async <T,>(
    action: () => Promise<T>,
    success: string,
    movedOf?: (result: T) => ApiMoved[],
  ): Promise<T | null> => {
    try {
      const result = await action();
      const moved = movedOf?.(result) ?? [];
      toast.push({
        title: success,
        tone: "success",
        ...(moved.length > 0
          ? {
              detail: `Moved into this team's department: ${moved
                .map((one) => (one.from ? `${one.name} (was ${one.from})` : one.name))
                .join(", ")}.`,
            }
          : {}),
      });
      teams.reload();
      return result;
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return null;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {teams.error && (
        <LoadFailure subject="the teams" error={teams.error} />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Teams" value={String(teams.counts.teams)} />
        <Stat
          label="Cross-functional"
          value={String(teams.counts.crossFunctional)}
          hint="belong to no department"
        />
        <Stat
          label="People on a team"
          value={String(teams.counts.peopleOnATeam)}
          hint="counted once, however many teams"
        />
      </div>

      <Card>
        <CardHeader
          title="Teams"
          description="Joining one does not move anybody's pay — unless the team belongs to a department."
          {...(canManage
            ? {
                action: (
                  <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
                    <UsersRound aria-hidden="true" className="size-4" />
                    Add team
                  </Button>
                ),
              }
            : {})}
        />
        {teams.loading ? (
          <CardBody className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the teams
          </CardBody>
        ) : active.length === 0 ? (
          <EmptyState
            icon={<UsersRound aria-hidden="true" />}
            title="No teams yet"
            description="A team is for the group that actually works together — which is not always a department. Somebody can be on two."
            action={
              canManage ? (
                <Button variant="accent" onClick={() => setCreating(true)}>
                  Add the first team
                </Button>
              ) : undefined
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-1.5">
            {active.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                canManage={canManage}
                onOpen={() => setOpened(team.id)}
                onEdit={() => setEditing(team)}
                onArchive={() => setArchiving(team)}
                onRestore={() =>
                  void run(() => mutations.restore(team.id), `${team.name} restored`)
                }
              />
            ))}
          </CardBody>
        )}
      </Card>

      {archived.length > 0 && (
        <Card>
          <CardHeader
            title="Archived"
            description="Hidden, not deleted. An appraiser mapping made because somebody led one of these still has to explain itself."
          />
          <CardBody className="flex flex-col gap-1.5">
            {archived.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                canManage={canManage}
                onOpen={() => setOpened(team.id)}
                onEdit={() => setEditing(team)}
                onArchive={() => setArchiving(team)}
                onRestore={() =>
                  void run(() => mutations.restore(team.id), `${team.name} restored`)
                }
              />
            ))}
          </CardBody>
        </Card>
      )}

      {opened && (
        <TeamDrawer
          teamId={opened}
          canEditRecords={canEditRecords}
          employees={employees}
          onClose={() => setOpened(null)}
          onAdd={(id, employeeIds) =>
            run(
              () => mutations.addMembers(id, employeeIds),
              employeeIds.length === 1 ? "Added to the team" : "Added to the team",
              (result) => result.moved,
            )
          }
          onRemove={(id, employeeId, name) =>
            run(
              () => mutations.removeMembers(id, [employeeId]),
              `${name} taken off the team`,
            )
          }
        />
      )}

      {creating && (
        <TeamDialog
          mode="create"
          departments={departments}
          employees={employees}
          onClose={() => setCreating(false)}
          onSave={async (body) => {
            const ok = await run(
              () =>
                mutations.create({
                  name: body.name,
                  ...(body.departmentId ? { departmentId: body.departmentId } : {}),
                  ...(body.leadId ? { leadId: body.leadId } : {}),
                  ...(body.purpose ? { purpose: body.purpose } : {}),
                }),
              `${body.name} added`,
            );
            if (ok) setCreating(false);
          }}
        />
      )}

      {editing && (
        <TeamDialog
          mode="edit"
          team={editing}
          departments={departments}
          employees={employees}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(
              () =>
                mutations.update(editing.id, {
                  ...(body.name !== editing.name ? { name: body.name } : {}),
                  departmentId: body.departmentId === "" ? null : body.departmentId,
                  leadId: body.leadId === "" ? null : body.leadId,
                  purpose: body.purpose === "" ? null : body.purpose,
                }),
              "Saved",
              (result) => result.moved,
            );
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
            () => mutations.archive(archiving.id),
            `${archiving.name} archived`,
          );
          if (ok) setArchiving(null);
        }}
        body="Hidden, not deleted — an appraiser mapping made through this team still resolves afterwards. Everybody has to be taken off it first, and nobody's department changes when they are."
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function TeamRow({
  team,
  canManage,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
}: {
  team: ApiTeam;
  canManage: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3 transition-colors hover:bg-canvas">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text [&>svg]:size-4"
      >
        <UsersRound aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
          {team.name}
          {/* Cross-functional is the fact worth a badge: it is the one that says
              membership implies nothing about anybody's pay. */}
          {team.crossFunctional ? (
            <Badge tone="neutral" size="sm">
              Cross-functional
            </Badge>
          ) : (
            <Badge tone="accent" size="sm">
              {team.departmentName}
            </Badge>
          )}
          {team.archived && (
            <Badge tone="warning" size="sm">
              Archived
            </Badge>
          )}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">
          {team.leadName ? (
            <>
              Led by{" "}
              <Link
                href={`/people/${team.leadId}`}
                className="hover:text-accent-text hover:underline underline-offset-4"
              >
                {team.leadName}
              </Link>
            </>
          ) : (
            <span className="text-faint">No lead assigned</span>
          )}
          {team.purpose ? ` · ${team.purpose}` : ""}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-meta uppercase tracking-wide text-faint">Members</p>
        <p className="tabular text-body font-medium text-ink">
          {team.memberCount}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5">
        <Button variant="secondary" size="sm" onClick={onOpen}>
          <Users aria-hidden="true" className="size-3.5" />
          People
        </Button>
        {canManage &&
          (team.archived ? (
            <Button variant="ghost" size="sm" onClick={onRestore}>
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Restore
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onArchive}
                aria-label={`Archive ${team.name}`}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            </>
          ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One team, opened: who is on it, and what adding somebody would do.
 *
 * `departmentMismatch` is rendered rather than repaired. It should be false
 * everywhere the rule has run; a true one is a row written before the rule
 * existed, or somebody's department changed on their own record afterwards.
 * Silently re-aligning it would be moving a cost centre without being asked.
 */
function TeamDrawer({
  teamId,
  canEditRecords,
  employees,
  onClose,
  onAdd,
  onRemove,
}: {
  teamId: string;
  canEditRecords: boolean;
  employees: { id: string; name: string; jobTitle?: string | null; departmentName?: string | null }[];
  onClose: () => void;
  onAdd: (teamId: string, employeeIds: string[]) => Promise<unknown>;
  onRemove: (teamId: string, employeeId: string, name: string) => Promise<unknown>;
}) {
  const { team, loading, error, reload } = useTeam(teamId);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const memberIds = new Set((team?.members ?? []).map((member) => member.employeeId));
  const mismatches = (team?.members ?? []).filter((member) => member.departmentMismatch);

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={team?.name ?? "Team"}
        {...(team
          ? {
              description: team.crossFunctional
                ? "Cross-functional — belongs to no department, so membership implies nothing about pay."
                : `Part of ${team.departmentName}. Anybody on it is reported under that department.`,
            }
          : {})}
        size="lg"
        footer={
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <p className="text-body-sm text-muted">
              {team
                ? team.members.length === 1
                  ? "1 person"
                  : `${team.members.length} people`
                : ""}
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {canEditRecords && team && !team.archived && (
                <Button variant="accent" onClick={() => setAdding(true)}>
                  <UserPlus aria-hidden="true" className="size-4" />
                  Add people
                </Button>
              )}
            </div>
          </div>
        }
      >
        {loading ? (
          <span className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the team
          </span>
        ) : !team ? (
          <p className="text-body-sm text-body">
            {error?.message ?? "That team is not available."}
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border border-line p-3">
                <p className="text-meta uppercase tracking-wide text-faint">
                  Lead
                </p>
                <p className="mt-0.5 text-body-sm text-ink">
                  {team.leadName ?? "Nobody assigned"}
                </p>
              </div>
              <div className="rounded-md border border-line p-3">
                <p className="text-meta uppercase tracking-wide text-faint">
                  Monthly cost
                </p>
                <p className="tabular mt-0.5 text-body-sm text-ink">
                  <Money amount={team.payrollKobo / 100} compact />
                </p>
              </div>
            </div>

            {mismatches.length > 0 && (
              <Callout tone="warning" title="Somebody's department disagrees">
                {mismatches.map((member) => member.name).join(", ")}{" "}
                {mismatches.length === 1 ? "is" : "are"} on this team but recorded
                under a different department. Nothing has been changed for them —
                moving a cost centre is not a repair. Fix it on their record, or move
                the team.
              </Callout>
            )}

            {team.members.length === 0 ? (
              <EmptyState
                compact
                icon={<Users aria-hidden="true" />}
                title="Nobody on it yet"
                description="Add the people who actually work together here."
              />
            ) : (
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                {team.members.map((member) => (
                  <li
                    key={member.membershipId}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-body-sm font-medium text-ink">
                        <Link
                          href={`/people/${member.employeeId}`}
                          className="hover:text-accent-text hover:underline underline-offset-4"
                        >
                          {member.name}
                        </Link>
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-meta text-muted">
                        <span>{member.jobTitle}</span>
                        {member.departmentName && (
                          <span className="flex items-center gap-1">
                            <Building2 aria-hidden="true" className="size-3" />
                            {member.departmentName}
                          </span>
                        )}
                        {member.roleLabel && (
                          <Badge tone="neutral" size="sm">
                            {member.roleLabel}
                          </Badge>
                        )}
                      </p>
                    </div>
                    {canEditRecords && !team.archived && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          void onRemove(team.id, member.employeeId, member.name)
                            .then(() => reload())
                            .finally(() => setBusy(false));
                        }}
                      >
                        Take off
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="text-body-sm text-muted">
              Taking somebody off a team leaves their department exactly where it is.
              Leaving a team is not leaving a cost centre.
            </p>
          </div>
        )}
      </Drawer>

      {adding && team && (
        <AssignPeopleDialog
          title={`Add people to ${team.name}`}
          description="Everybody on a team at once, rather than one at a time."
          effect={membershipEffect(team)}
          confirmLabel="Add to the team"
          busy={busy}
          candidates={employees.map((person) => ({
            id: person.id,
            name: person.name,
            jobTitle: person.jobTitle ?? null,
            currentLabel: person.departmentName ?? null,
            already: memberIds.has(person.id),
          }))}
          onClose={() => setAdding(false)}
          onAssign={(employeeIds) => {
            setBusy(true);
            void onAdd(team.id, employeeIds)
              .then(() => {
                reload();
                setAdding(false);
              })
              .finally(() => setBusy(false));
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

type TeamDraft = {
  name: string;
  departmentId: string;
  leadId: string;
  purpose: string;
};

/**
 * Create or edit. One dialog, because the fields are the same fields.
 *
 * The department picker's empty option is a real answer — "no department,
 * cross-functional" — not a placeholder, and it says what it means. On edit,
 * changing it warns before the write, because that write moves everybody on the
 * team into the new department.
 */
function TeamDialog({
  mode,
  team,
  departments,
  employees,
  onClose,
  onSave,
}: {
  mode: "create" | "edit";
  team?: ApiTeam;
  departments: { id: string; name: string; depth: number; archived: boolean }[];
  employees: { id: string; name: string }[];
  onClose: () => void;
  onSave: (draft: TeamDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<TeamDraft>({
    name: team?.name ?? "",
    departmentId: team?.departmentId ?? "",
    leadId: team?.leadId ?? "",
    purpose: team?.purpose ?? "",
  });
  const [busy, setBusy] = useState(false);

  const departmentChanged =
    mode === "edit" && draft.departmentId !== (team?.departmentId ?? "");
  const targetName = departments.find((one) => one.id === draft.departmentId)?.name;

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Add a team" : `Edit ${team?.name ?? ""}`}
      description={
        mode === "create"
          ? "A working group. It can sit in a department, or span several."
          : undefined
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={draft.name.trim().length < 2 || busy}
            onClick={() => {
              setBusy(true);
              void onSave({
                ...draft,
                name: draft.name.trim(),
                purpose: draft.purpose.trim(),
              }).finally(() => setBusy(false));
            }}
          >
            {mode === "create" ? "Add team" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required>
          <Input
            value={draft.name}
            autoFocus
            placeholder="Platform"
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, name: value }));
            }}
          />
        </Field>

        <Field
          label="Department"
          help="Leave it cross-functional for a team that spans several departments. A departmental team moves its members' pay reporting with it."
        >
          <Select
            value={draft.departmentId}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, departmentId: value }));
            }}
          >
            <option value="">No department — cross-functional</option>
            {departments
              .filter((one) => !one.archived)
              .map((one) => (
                <option key={one.id} value={one.id}>
                  {"— ".repeat(one.depth)}
                  {one.name}
                </option>
              ))}
          </Select>
        </Field>

        {departmentChanged && (
          <Callout tone="warning" title="This moves people">
            {draft.departmentId === ""
              ? "Everybody on the team keeps the department they have now. Nothing moves — but new members will stop being moved."
              : `Everybody on the team moves into ${targetName ?? "that department"}, which is where their pay will be reported. You will be told who.`}
          </Callout>
        )}

        <Field label="Lead" help="Who runs it. Not necessarily anybody's manager.">
          <Select
            value={draft.leadId}
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, leadId: value }));
            }}
          >
            <option value="">Nobody assigned</option>
            {employees.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field optional label="What it is for" help="One line.">
          <Input
            value={draft.purpose}
            placeholder="Keeps the deployment pipeline and the shared services"
            onChange={(event) => {
              const value = event.target.value;
              setDraft((current) => ({ ...current, purpose: value }));
            }}
          />
        </Field>
      </div>
    </Modal>
  );
}
