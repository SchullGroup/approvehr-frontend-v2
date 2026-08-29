"use client";

import { useMemo, useState } from "react";
import {
  Copy,
  Eye,
  Lock,
  Mail,
  Plus,
  ShieldCheck,
  Trash2,
  TriangleAlert,
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
  Select,
  Stat,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import { invitesApi, type PendingInvite } from "@/lib/api/invites";
import { sourceNote } from "@/lib/demo";
import type { Catalogue } from "@/lib/api/permissions";
import { usePermissions } from "@/lib/permissions";
import { useInvites, type InvitesState } from "@/lib/store/invites";
import {
  useRolePreview,
  useRoles,
  type RoleView,
} from "@/lib/store/permissions";
import { CreateRoleDialog } from "./create-role";
import { RoleEditor } from "./role-editor";
import { SendInviteDialog } from "./send-invite";

/**
 * Roles and permissions.
 *
 * This replaced a read-only grid of checkboxes. Four things changed, and each was
 * a decision rather than a redesign.
 *
 * ## 1. A role is a thing you open, not a column
 *
 * The matrix put fifteen permissions against six roles and asked the reader to
 * hold both axes in their head. It looked authoritative and it answered no
 * question anybody has. The questions people actually arrive with are "what can
 * Payroll officer do?" and "who is in it?" — both about **one** role, which is
 * why one role is now the unit of the interface.
 *
 * ## 2. Locked means locked, before the save
 *
 * The old grid rendered Administrator's checkboxes disabled and every other
 * role's editable, including four more built-in roles the backend will refuse to
 * change. A form that fails on save teaches the reader not to trust the form.
 *
 * ## 3. The guards are visible, not just enforced
 *
 * Three API refusals are surfaced here before they can fire: a permission you do
 * not hold renders disabled with one line of reason; a role with people in it
 * says so where the delete button is; and the count of people who can manage
 * access is on the page, because zero is unrecoverable and one is fragile.
 *
 * ## 4. No callout explaining that permissions are not enforced
 *
 * The old page carried a paragraph explaining that these permissions were stored
 * and not applied. It was true and it was the wrong thing to write: the fix was
 * to apply them, which `lib/permissions.ts` now does. What remains is a demo-mode
 * badge, because "connected" and "in this browser" genuinely differ and every
 * screen in this product says which one it is on.
 */
export function RolesScreen({
  initialOpenId = null,
}: {
  /** From `?open=<roleId>` — see `RolesPage`. */
  initialOpenId?: string | null;
}) {
  const access = usePermissions();
  const held = useMemo(() => [...access.permissions], [access.permissions]);
  const roles = useRoles(held);
  const preview = useRolePreview();
  const invites = useInvites();
  const toast = useToast();

  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [creating, setCreating] = useState<{ from: RoleView | null } | null>(
    null,
  );
  const [deleting, setDeleting] = useState<RoleView | null>(null);
  const [removing, setRemoving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [revoking, setRevoking] = useState<PendingInvite | null>(null);
  const [revokingBusy, setRevokingBusy] = useState(false);

  const canManage = access.can("MANAGE_ROLES");
  /* Its own permission, split from `MANAGE_ROLES` — see the header of
     `modules/invites/router.ts` on the API. Somebody who can edit roles
     cannot necessarily hand one out, and the reverse. */
  const canInvite = access.can("INVITE_STAFF");
  const open = roles.roles.find((role) => role.id === openId) ?? null;
  const roleIds = roles.roles.map((role) => role.id);

  /*
   * Only roles somebody can actually split.
   *
   * `Owner` holds every permission by construction, so it trips both
   * separation-of-duties rules and always will — and its permissions are frozen,
   * so an alarm about it is an alarm with no action behind it. The note still
   * appears inside the editor, where it reads as context rather than as a task.
   */
  const conflicted = roles.roles.filter(
    (role) => role.warnings.length > 0 && !role.isSystem,
  );

  /** Every mutation reports its own outcome. The API's refusals are the copy. */
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
        title="Roles and permissions"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        meta={
          sourceNote(roles.connected) ? (
            <Badge tone="warning" size="sm" dot>
              {sourceNote(roles.connected)}
            </Badge>
          ) : undefined
        }
        action={
          canManage ? (
            <Button
              variant="accent"
              size="sm"
              onClick={() => setCreating({ from: null })}
            >
              <Plus aria-hidden="true" className="size-4" />
              New role
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {preview.role && (
          <Callout tone="accent" icon={<Eye aria-hidden="true" />}>
            <p className="font-medium text-ink">
              You are seeing the app as {preview.role.name}.
            </p>
            <div className="mt-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => preview.set(null)}
              >
                Stop previewing
              </Button>
            </div>
          </Callout>
        )}

        {roles.error && (
          <LoadFailure subject="your roles" error={roles.error}  onRetry={roles.reload}/>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Stat label="Roles" value={String(roles.counts.roles)} />
          <Stat
            label="Can manage access"
            value={String(roles.counts.peopleWhoCanManageAccess)}
            hint="people who can change this page"
            {...(roles.counts.peopleWhoCanManageAccess < 2
              ? { trend: { direction: "down" as const, label: "Add one more" } }
              : {})}
          />
          <Stat
            label="Built-in roles"
            value={String(roles.roles.filter((role) => role.isSystem).length)}
            hint="fixed, and cannot be deleted"
          />
        </div>

        {roles.counts.peopleWhoCanManageAccess === 1 && (
          <Callout tone="warning">
            <p className="font-medium text-ink">
              One person can manage access. If they leave, nobody can change
              these roles.
            </p>
            <div className="mt-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const owner = roles.roles.find((role) =>
                    role.permissions.includes("MANAGE_ROLES"),
                  );
                  if (owner) setOpenId(owner.id);
                }}
              >
                <Users aria-hidden="true" className="size-3.5" />
                Add somebody
              </Button>
            </div>
          </Callout>
        )}

        {conflicted.map((role) => (
          <Callout key={role.id} tone="warning">
            <p className="font-medium text-ink">
              {role.name}: {role.warnings[0]}
            </p>
            <div className="mt-2.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpenId(role.id)}
              >
                Split it
              </Button>
            </div>
          </Callout>
        ))}

        <Card>
          <CardHeader title="Roles" />
          {roles.roles.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck aria-hidden="true" />}
              title={roles.loading ? "Loading…" : "No roles yet"}
              {...(roles.loading
                ? {}
                : {
                    description:
                      "Every company gets four to start with. If this is empty, the workspace was not set up.",
                  })}
            />
          ) : (
            <CardBody className="flex flex-col gap-2">
              {roles.roles.map((role) => (
                <RoleRow
                  key={role.id}
                  role={role}
                  canManage={canManage}
                  onOpen={() => setOpenId(role.id)}
                  onDuplicate={() => setCreating({ from: role })}
                  onDelete={() => setDeleting(role)}
                />
              ))}
            </CardBody>
          )}
        </Card>

        <InvitationsCard
          invites={invites}
          canInvite={canInvite}
          onInvite={() => setInviting(true)}
          onResend={(userId) =>
            void run(() => invites.resend(userId), "Invitation sent again")
          }
          onRevoke={(invite) => setRevoking(invite)}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <YourAccess access={access} catalogue={roles.catalogue} />
          {preview.available && (
            <PreviewCard
              roles={roles.roles}
              currentId={preview.role?.id ?? ""}
              onChange={preview.set}
            />
          )}
        </div>
      </PageBody>

      {open && (
        <RoleEditor
          key={open.id}
          role={open}
          catalogue={roles.catalogue}
          held={access.permissions}
          canManage={canManage}
          roleIds={roleIds}
          onClose={() => setOpenId(null)}
          onSave={(patch) =>
            run(async () => {
              if (Object.keys(patch).length > 0) {
                await roles.update(open.id, patch);
              }
            }, "Saved")
          }
          onDuplicate={() => {
            setOpenId(null);
            setCreating({ from: open });
          }}
          onAddPeople={(userIds) =>
            run(async () => {
              const result = await roles.addMembers(open.id, userIds);
              if (result.added === 0) {
                throw new ApiError(
                  409,
                  "already_in",
                  "They are already in this role.",
                );
              }
            }, "Added")
          }
          onRemovePerson={(userId, name) =>
            run(() => roles.removeMember(open.id, userId), `${name} removed`)
          }
        />
      )}

      {creating && (
        <CreateRoleDialog
          roles={roles.roles}
          held={access.permissions}
          from={creating.from}
          onClose={() => setCreating(null)}
          onCreate={async (body, people) => {
            const ok = await run(async () => {
              const made = await roles.create(body);
              /* Two requests, and the order matters: the role is the one that
                 cannot be retried cleanly (a second attempt collides on the
                 name), so it goes first and a refused address leaves it
                 standing. Every refusal comes back named. */
              if (people.length > 0) {
                const result = await invitesApi.sendByEmail(people, [made.id]);
                if (result.failed.length > 0) {
                  throw new ApiError(
                    409,
                    "some_not_invited",
                    `${body.name} was created. ${result.failed
                      .map((one) => `${one.name}: ${one.message}`)
                      .join(" ")}`,
                  );
                }
              }
              setOpenId(made.id);
            }, `${body.name} created`);
            if (ok) setCreating(null);
            return ok;
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        confirmLabel="Delete"
        tone="danger"
        loading={removing}
        body={
          deleting && deleting.memberCount > 0
            ? `${deleting.memberCount} ${deleting.memberCount === 1 ? "person is" : "people are"} in it. Move them to another role first — this will refuse until you do.`
            : "A role is not referenced by a past payslip, so this is a real delete rather than an archive. Nothing else changes."
        }
        onConfirm={() => {
          if (!deleting) return;
          setRemoving(true);
          void run(() => roles.remove(deleting.id), `${deleting.name} deleted`)
            .then((ok) => {
              if (ok) setDeleting(null);
            })
            .finally(() => setRemoving(false));
        }}
      />

      {inviting && (
        <SendInviteDialog
          roles={roles.roles}
          pending={invites.invites}
          onClose={() => setInviting(false)}
          onSend={(employeeId, roleIds) =>
            run(() => invites.send(employeeId, roleIds), "Invitation sent")
          }
        />
      )}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        title={`Revoke the invitation to ${revoking?.name ?? ""}?`}
        confirmLabel="Revoke"
        tone="danger"
        loading={revokingBusy}
        body="An invitation emailed to a work address is a live key to your company's payroll until somebody opens it. Revoking deletes it — inviting them again starts fresh."
        onConfirm={() => {
          if (!revoking) return;
          setRevokingBusy(true);
          void run(
            () => invites.revoke(revoking.userId),
            `Invitation to ${revoking.name} revoked`,
          )
            .then((ok) => {
              if (ok) setRevoking(null);
            })
            .finally(() => setRevokingBusy(false));
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function RoleRow({
  role,
  canManage,
  onOpen,
  onDuplicate,
  onDelete,
}: {
  role: RoleView;
  canManage: boolean;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3 transition-colors hover:bg-canvas">
      <span
        aria-hidden="true"
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md [&>svg]:size-4",
          role.isSystem
            ? "bg-accent-soft text-accent-text"
            : "bg-sunken text-muted",
        )}
      >
        {role.isSystem ? (
          <Lock aria-hidden="true" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
          <button
            type="button"
            onClick={onOpen}
            className="rounded text-left hover:text-accent-text hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
          >
            {role.name}
          </button>
          {role.isSystem && (
            <Badge tone="neutral" size="sm">
              Built in
            </Badge>
          )}
          {role.warnings.length > 0 && (
            <TriangleAlert
              aria-label="Holds two duties that are usually kept apart"
              className="size-3.5 text-warning-text"
            />
          )}
        </p>
        <p className="mt-0.5 text-body-sm leading-relaxed text-muted">
          {role.description ?? "No description yet."}
        </p>
        <p className="mt-1 text-body-sm text-faint">
          {role.labels.length === 0
            ? "Their own record only"
            : role.labels.slice(0, 3).join(" · ") +
              (role.labels.length > 3
                ? ` · +${role.labels.length - 3} more`
                : "")}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className="text-meta text-faint">People</p>
        <p className="tabular text-body-sm font-medium text-ink">
          {role.memberCount}
        </p>
      </div>

      <div className="flex shrink-0 gap-1.5">
        <Button variant="ghost" size="sm" onClick={onOpen}>
          {role.isSystem || !canManage ? "Open" : "Edit"}
        </Button>
        {canManage && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDuplicate}
              aria-label={`Duplicate ${role.name}`}
            >
              <Copy aria-hidden="true" className="size-3.5" />
            </Button>
            {!role.isSystem && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onDelete}
                aria-label={`Delete ${role.name}`}
              >
                <Trash2 aria-hidden="true" className="size-3.5" />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Everybody invited to sign in who has not yet accepted.
 *
 * No demo mirror — see `lib/store/invites.ts`'s own header for why. Not
 * connected renders the same honest "needs a live API" message
 * `profile-screen.tsx`'s Security card already uses for the same reason.
 */
function InvitationsCard({
  invites,
  canInvite,
  onInvite,
  onResend,
  onRevoke,
}: {
  invites: InvitesState;
  canInvite: boolean;
  onInvite: () => void;
  onResend: (userId: string) => void;
  onRevoke: (invite: PendingInvite) => void;
}) {
  if (!invites.connected) {
    return (
      <Card>
        <CardHeader title="Invitations" level={3} />
        <CardBody>
          <p className="text-body-sm text-muted">
            Nothing here works without a server. Sign in against the real API
            to invite somebody to sign in.
          </p>
        </CardBody>
      </Card>
    );
  }

  /*
   * Never looked, so never claim. `useInvites` no longer fetches without
   * INVITE_STAFF, which stopped five of the six roles firing a doomed request
   * — and left this panel about to fall through to "No pending invitations",
   * which asserts a count nobody read. Absent is not zero, and it is not an
   * error either: the old behaviour rendered the 403 through `LoadFailure` as
   * "Invitations did not load" over the API's raw "You need the following to
   * do that: INVITE_STAFF."
   *
   * A permission is named the way the rest of the app names one — in words,
   * with who to ask — not as the enum the API sends.
   */
  if (!canInvite) {
    return (
      <Card>
        <CardHeader title="Invitations" level={3} />
        <CardBody>
          <p className="text-body-sm text-muted">
            Seeing who has been invited to sign in needs the “Invite staff”
            permission. Ask somebody who manages roles.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Invitations"
        description="Everybody invited to sign in who has not yet accepted."
        action={
          canInvite ? (
            <Button variant="secondary" size="sm" onClick={onInvite}>
              <Mail aria-hidden="true" className="size-4" />
              Invite someone
            </Button>
          ) : undefined
        }
      />
      {invites.error ? (
        <CardBody>
          <LoadFailure subject="invitations" error={invites.error} />
        </CardBody>
      ) : invites.invites.length === 0 ? (
        <EmptyState
          icon={<Mail aria-hidden="true" />}
          title={invites.loading ? "Loading…" : "No pending invitations"}
          {...(invites.loading
            ? {}
            : {
                description:
                  "Everybody entitled to sign in either already has an account, or has not been invited yet.",
              })}
        />
      ) : (
        <CardBody className="flex flex-col gap-2">
          {invites.invites.map((invite) => (
            <div
              key={invite.userId}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-body-sm font-medium text-ink">
                  {invite.name}
                </p>
                <p className="mt-0.5 text-meta text-muted">
                  {invite.email} · {invite.roles.join(", ")}
                </p>
              </div>
              <Badge tone={invite.expired ? "warning" : "neutral"} size="sm">
                {invite.expired ? "Link expired" : "Pending"}
              </Badge>
              {canInvite && (
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onResend(invite.userId)}
                  >
                    Resend
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(invite)}
                  >
                    Revoke
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardBody>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * What the signed-in person holds, and which role gave it to them.
 *
 * The one panel on this page that is about the reader. It is also the check
 * nobody else can do for them: whether the matrix is set up the way they think
 * it is only shows in what they themselves can do.
 */
function YourAccess({
  access,
  catalogue,
}: {
  access: ReturnType<typeof usePermissions>;
  catalogue: Catalogue;
}) {
  /* Labelled, never keyed. `APPROVE_PAYROLL` on a settings page is a leak of the
     enum into the product, and the catalogue exists so it cannot happen. */
  const labels = new Map(
    catalogue.permissions.map((entry) => [entry.key, entry.label]),
  );
  const held = [...access.permissions];

  return (
    <Card>
      <CardHeader
        title="What you can do"
        level={3}
        {...(access.roles.length > 0
          ? { description: access.roles.map((role) => role.name).join(", ") }
          : {})}
      />
      <CardBody className="flex flex-col gap-3">
        {/* Suppressed while previewing: the list below is then one role's, not
            everything, and the sentence would contradict what is on screen. The
            banner at the top of the page carries the way out. */}
        {DEMO_ENABLED && !access.enforced && !access.previewingRole && (
          <p className="text-body-sm leading-relaxed text-body">
            A demo session holds everything, so this list is every permission
            there is. Use <strong>See it as somebody else</strong> to see a real
            role&rsquo;s view.
          </p>
        )}

        {held.length === 0 ? (
          <p className="text-body-sm leading-relaxed text-muted">
            Nothing yet — you can see your own record, your own payslips and
            your own requests.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {held.map((permission) => {
              const via = access.grantedBy(permission);
              return (
                <li key={permission} className="text-body-sm leading-relaxed">
                  <span className="text-ink">
                    {labels.get(permission) ?? permission}
                  </span>
                  {via.length > 0 && (
                    <span className="text-muted"> — via {via.join(", ")}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Preview the app as a role. Demo only, and loud about being on.
 *
 * This exists because the demo session holds every permission — right for
 * showing the product, useless for showing what a *role* sees. It is the only
 * way to demonstrate the escalation guard on this page, and the only way to see
 * the navigation a member of staff gets.
 */
function PreviewCard({
  roles,
  currentId,
  onChange,
}: {
  roles: RoleView[];
  currentId: string;
  onChange: (roleId: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="See it as somebody else"
        description="Demo only."
        level={3}
      />
      <CardBody className="flex flex-col gap-3">
        <Select
          value={currentId}
          aria-label="Preview the app as a role"
          onChange={(e) => {
            const value = e.target.value;
            onChange(value === "" ? null : value);
          }}
        >
          <option value="">Yourself — everything switched on</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        <p className="text-body-sm leading-relaxed text-muted">
          It stays on until you turn it off, including after a reload.
        </p>
      </CardBody>
    </Card>
  );
}
