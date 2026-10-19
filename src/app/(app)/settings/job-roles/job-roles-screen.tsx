"use client";

import { useMemo, useState } from "react";
import { BriefcaseBusiness } from "lucide-react";
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
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { Can, useCan } from "@/lib/permissions";
import { ApiError } from "@/lib/api/client";
import {
  ARCHIVE_ROLE_EFFECTS,
  type ApiJobRole,
  type JobRoleBody,
} from "@/lib/api/job-roles";
import {
  DEMO_ROLE_HEADING,
  DEMO_ROLE_REASON,
  useJobRoleActions,
  useJobRoles,
} from "@/lib/store/job-roles";

/**
 * What jobs this company has.
 *
 * ## Why this is in Settings and not under People
 *
 * A catalogue is job *architecture* — it decides what a job involves and what
 * somebody on it is judged against — which puts it beside the other things a
 * company configures once and then uses, rather than beside the people who
 * happen to hold the jobs today. The pay side of the same question already
 * lives under `/payroll/pay-setup` for the same reason.
 *
 * The name is "Job roles", never "Roles", because `/settings/roles` is
 * permissions. Two things called Roles in one Settings menu is the ambiguity
 * the departments/sub-departments rename already had to fix once.
 *
 * ## Archived roles are listed, not hidden
 *
 * A switched-off role that vanishes the moment it is switched off leaves the
 * Restore button on its row unreachable — the exact defect `/people/departments`
 * carried until somebody noticed. They get their own card.
 */
export function JobRolesScreen() {
  const { roles, loading, error, readOnly, reload } = useJobRoles();
  const actions = useJobRoleActions();
  const canManage = useCan("MANAGE_SETTINGS");
  const [editing, setEditing] = useState<ApiJobRole | "new" | null>(null);
  const [archiving, setArchiving] = useState<ApiJobRole | null>(null);
  const toast = useToast();

  const live = useMemo(() => roles.filter((r) => !r.archived), [roles]);
  const archived = useMemo(() => roles.filter((r) => r.archived), [roles]);

  if (error) {
    return (
      <LoadFailure
        subject="the job role catalogue"
        error={error}
        onRetry={reload}
      />
    );
  }

  async function confirmArchive() {
    if (!archiving) return;
    try {
      const result = await actions.archive(archiving.id);
      toast.push({
        tone: "info",
        title: `${archiving.title} is switched off`,
        /* Named rather than counted away. Somebody switching off a role wants
           to know who is left standing on it. */
        ...(result.stillOnIt > 0
          ? {
              detail: `${result.stillOnIt} ${result.stillOnIt === 1 ? "person is" : "people are"} still on it, and their records are unchanged.`,
            }
          : {}),
      });
    } catch (e) {
      toast.push({
        tone: "danger",
        title: "That was refused",
        ...(e instanceof Error ? { detail: e.message } : {}),
      });
    } finally {
      setArchiving(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {readOnly && (
        <Callout tone="info" title={DEMO_ROLE_HEADING}>
          {DEMO_ROLE_REASON}
        </Callout>
      )}

      <Card>
        <CardHeader
          title="The catalogue"
          description={
            live.length === 0
              ? undefined
              : `${live.length} ${live.length === 1 ? "role" : "roles"} in use.`
          }
          action={
            <Can permission="MANAGE_SETTINGS">
              <Button
                size="sm"
                variant="accent"
                disabled={readOnly}
                onClick={() => setEditing("new")}
              >
                Add a role
              </Button>
            </Can>
          }
        />
        {loading ? (
          <CardBody className="text-body-sm text-muted">Loading…</CardBody>
        ) : live.length === 0 ? (
          <EmptyState
            icon={<BriefcaseBusiness aria-hidden="true" className="size-5" />}
            title="No job roles yet"
            description="Job titles stay free text until there are some. Adding roles is what makes a competency set assignable per job and headcount by role a question you can ask."
          />
        ) : (
          <TableWrap caption="Job roles in this company">
            <THead>
              <TH>Role</TH>
              <TH>Family</TH>
              <TH>On it</TH>
              <TH>Recruiting</TH>
              <TH />
            </THead>
            <TBody>
              {live.map((role) => (
                <TR key={role.id}>
                  <TDPrimary
                    title={role.title}
                    subtitle={role.summary ?? undefined}
                  />
                  <TD>
                    {role.family ? (
                      <Badge tone="neutral">{role.family}</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  <TD className="tabular-nums">{role.headcount}</TD>
                  <TD className="tabular-nums">
                    {role.openRequisitions > 0 ? (
                      <Badge tone="accent">{role.openRequisitions} open</Badge>
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  <TD className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={readOnly}
                          onClick={() => setEditing(role)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={readOnly}
                          onClick={() => setArchiving(role)}
                        >
                          Switch off
                        </Button>
                      </div>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </Card>

      {archived.length > 0 && (
        <Card>
          <CardHeader
            title="Switched off"
            level={3}
            description="Still on the records of anybody who holds them. Not offered when adding somebody or raising a requisition."
          />
          <TableWrap caption="Job roles switched off">
            <THead>
              <TH>Role</TH>
              <TH>On it</TH>
              <TH />
            </THead>
            <TBody>
              {archived.map((role) => (
                <TR key={role.id}>
                  <TDPrimary
                    title={role.title}
                    subtitle={role.family ?? undefined}
                  />
                  <TD className="tabular-nums">{role.headcount}</TD>
                  <TD className="text-right">
                    {canManage && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={readOnly}
                        onClick={() => {
                          void actions
                            .restore(role.id)
                            .then(() =>
                              toast.push({
                                tone: "success",
                                title: `${role.title} is back on`,
                              }),
                            )
                            .catch((e: unknown) =>
                              toast.push({
                                tone: "danger",
                                title: "That was refused",
                                ...(e instanceof Error
                                  ? { detail: e.message }
                                  : {}),
                              }),
                            );
                        }}
                      >
                        Turn back on
                      </Button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        </Card>
      )}

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}

      {archiving && (
        <ConfirmDialog
          open
          title={`Switch off ${archiving.title}?`}
          body={ARCHIVE_ROLE_EFFECTS}
          confirmLabel="Switch it off"
          onClose={() => setArchiving(null)}
          onConfirm={() => void confirmArchive()}
        />
      )}
    </div>
  );
}

/** Add or edit one role. The competency set is its own act — see below. */
function RoleDialog({
  role,
  onClose,
}: {
  role: ApiJobRole | null;
  onClose: () => void;
}) {
  const actions = useJobRoleActions();
  const toast = useToast();
  const [draft, setDraft] = useState<JobRoleBody>({
    title: role?.title ?? "",
    family: role?.family ?? "",
    summary: role?.summary ?? "",
    responsibilities: role?.responsibilities ?? "",
    requirements: role?.requirements ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setFailure(null);
    try {
      /* Empty strings become null rather than being sent as "". A role whose
         family is the empty string renders as a blank badge; one whose family
         is null renders as nothing, which is the fact. */
      const body: JobRoleBody = {
        title: draft.title?.trim(),
        family: draft.family?.trim() || null,
        summary: draft.summary?.trim() || null,
        responsibilities: draft.responsibilities?.trim() || null,
        requirements: draft.requirements?.trim() || null,
      };
      if (role) await actions.update(role.id, body);
      else await actions.create(body);
      toast.push({
        tone: "success",
        title: role ? `${body.title} saved` : `${body.title} added`,
      });
      onClose();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Something went wrong. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={role ? `Edit ${role.title}` : "Add a job role"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={saving || actions.readOnly || !draft.title?.trim()}
            onClick={() => void save()}
          >
            {saving ? "Saving…" : role ? "Save" : "Add it"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {role && (
          /* The one thing somebody editing a title needs to know before they
             do it, and the reason both columns exist. */
          <Callout tone="info" title="Renaming this does not retitle anybody">
            The {role.headcount} {role.headcount === 1 ? "person" : "people"} on
            it keep the title on their own record, which is what they were
            called at the time.
          </Callout>
        )}

        <Field label="Title" required>
          <Input
            value={draft.title ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, title: value }));
            }}
          />
        </Field>

        <Field label="Family" optional help="Engineering, Finance, Operations.">
          <Input
            value={draft.family ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, family: value }));
            }}
          />
        </Field>

        <Field label="What the job involves" optional>
          <Textarea
            rows={2}
            value={draft.summary ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, summary: value }));
            }}
          />
        </Field>

        <Field label="Responsibilities" optional help="One per line.">
          <Textarea
            rows={4}
            value={draft.responsibilities ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, responsibilities: value }));
            }}
          />
        </Field>

        <Field label="What it takes" optional help="One per line.">
          <Textarea
            rows={3}
            value={draft.requirements ?? ""}
            onChange={(e) => {
              const value = e.currentTarget.value;
              setDraft((d) => ({ ...d, requirements: value }));
            }}
          />
        </Field>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
