"use client";

import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ClipboardCopy,
  FileText,
  Plus,
  Search,
  Users,
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
  SegmentedControl,
  Spinner,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import type { ApiPolicy } from "@/lib/api/conduct";
import { useCan } from "@/lib/permissions";
import {
  acceptanceLabel,
  dayLabel,
  useAcknowledgements,
  usePolicies,
  usePolicyText,
} from "@/lib/store/conduct";
import { PolicyDrawer } from "./policy-drawer";

/**
 * The handbook.
 *
 * ## One route, two readers
 *
 * Reading the handbook needs no permission — a policy you are required to
 * accept but not allowed to open would be an absurd product — so this screen
 * renders the list for anybody and the authoring controls only for
 * `MANAGE_SETTINGS`. That is PARITY Rule 1: one route per concept, rendered by
 * role.
 *
 * ## Why the wording of a published section is not on the Edit form
 *
 * Changing the words under an acceptance means somebody accepted text that no
 * longer exists, so the API refuses it. Rather than say that in a paragraph,
 * the Edit form puts a **button** where the wording field would be, and the
 * button publishes a new version — which is the one change that re-asks
 * everybody. The rule is enforced by the shape of the form, not explained by it.
 *
 * ## The fraction
 *
 * "22 of 31 accepted" counts acceptances of the version *in force* against
 * current staff. Somebody who accepted version 1 of a section now on version 2
 * is in the 9, not the 22, and that is the entire point of the number.
 */
export function PoliciesScreen() {
  const canManage = useCan("MANAGE_SETTINGS");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const toast = useToast();

  const policies = usePolicies({
    pageSize: 100,
    q: query.trim() || undefined,
    includeDrafts: canManage && showAll,
    includeArchived: canManage && showAll,
  });

  const [writing, setWriting] = useState(false);
  const [editing, setEditing] = useState<ApiPolicy | null>(null);
  const [publishing, setPublishing] = useState<ApiPolicy | null>(null);
  const [reading, setReading] = useState<ApiPolicy | null>(null);
  const [chasing, setChasing] = useState<ApiPolicy | null>(null);
  const [withdrawing, setWithdrawing] = useState<ApiPolicy | null>(null);

  /** Every write reports its own failure — the API messages are the useful part. */
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

  const grouped = useMemo(() => {
    const groups = new Map<string, ApiPolicy[]>();
    for (const policy of policies.policies) {
      const name = policy.category ?? "Everything else";
      const list = groups.get(name);
      if (list) list.push(policy);
      else groups.set(name, [policy]);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [policies.policies]);

  return (
    <>
      <PageHeader
        title="Handbook"
        description="Your policies, and who has accepted each one."
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        action={
          canManage && policies.editable ? (
            <Button variant="accent" size="sm" onClick={() => setWriting(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Write a section
            </Button>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-6">
        {!policies.editable && (
          <Callout tone="warning" title="Demo handbook">
            These sections are seed data. Writing and publishing needs the API.
          </Callout>
        )}

        {policies.error && (
          <LoadFailure subject="the handbook" error={policies.error} />
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative w-full max-w-xs">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            />
            <Input
              value={query}
              onChange={(e) => {
                const v = e.target.value;
                setQuery(v);
              }}
              className="pl-9"
              placeholder="Search the handbook"
              aria-label="Search the handbook"
            />
          </div>

          {canManage && policies.editable && (
            <Switch
              label="Show drafts and withdrawn sections"
              checked={showAll}
              onChange={(e) => {
                const on = e.target.checked;
                setShowAll(on);
              }}
              className="max-w-sm"
            />
          )}
        </div>

        {policies.loading && policies.policies.length === 0 ? (
          <Card>
            <CardBody className="flex items-center gap-2 text-body-sm text-muted">
              <Spinner size="sm" />
              Loading the handbook
            </CardBody>
          </Card>
        ) : policies.policies.length === 0 ? (
          <Card>
            <EmptyState
              icon={<BookOpen aria-hidden="true" />}
              title={query ? "Nothing matched" : "No sections yet"}
              description={
                query
                  ? "Try a shorter search."
                  : "Working hours, expenses, company phones — write the first one and everybody is asked to accept it."
              }
              action={
                canManage && policies.editable && !query ? (
                  <Button variant="accent" onClick={() => setWriting(true)}>
                    Write a section
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          grouped.map(([group, rows]) => (
            <Card key={group}>
              <CardHeader
                title={group}
                level={2}
                description={`${rows.length} ${rows.length === 1 ? "section" : "sections"}`}
              />
              <CardBody className="flex flex-col gap-2">
                {rows.map((policy) => (
                  <PolicyRow
                    key={policy.id}
                    policy={policy}
                    canManage={canManage && policies.editable}
                    onRead={() => setReading(policy)}
                    onEdit={() => setEditing(policy)}
                    onPublish={() => setPublishing(policy)}
                    onChase={() => setChasing(policy)}
                    onRestore={() =>
                      void run(
                        () => policies.update(policy.id, { archived: false }),
                        `${policy.title} is back in the handbook`,
                      )
                    }
                  />
                ))}
              </CardBody>
            </Card>
          ))
        )}
      </PageBody>

      {writing && (
        <WriteSectionModal
          onClose={() => setWriting(false)}
          onSave={async (body) => {
            const ok = await run(
              () => policies.create(body),
              body.publish ? "Published" : "Saved as a draft",
            );
            if (ok) setWriting(false);
          }}
        />
      )}

      {editing && (
        <EditSectionModal
          key={editing.id}
          policy={editing}
          onClose={() => setEditing(null)}
          onPublishInstead={() => {
            const target = editing;
            setEditing(null);
            setPublishing(target);
          }}
          onWithdraw={() => {
            const target = editing;
            setEditing(null);
            setWithdrawing(target);
          }}
          onSave={async (body) => {
            const ok = await run(() => policies.update(editing.id, body), "Saved");
            if (ok) setEditing(null);
          }}
        />
      )}

      {publishing && (
        <PublishModal
          key={publishing.id}
          policy={publishing}
          onClose={() => setPublishing(null)}
          onPublish={async (wording) => {
            const target = publishing;
            let outcome: string | null = null;
            const ok = await run(async () => {
              const result = await policies.publish(
                target.id,
                wording === undefined ? {} : { body: wording },
              );
              outcome = result.republished
                ? `Version ${result.version} is live. ${result.acceptancesInvalidated} ${
                    result.acceptancesInvalidated === 1 ? "person" : "people"
                  } will be asked again.`
                : `Version ${result.version} is live. ${result.notified} ${
                    result.notified === 1 ? "person" : "people"
                  } told.`;
            }, "Published");
            if (ok) {
              setPublishing(null);
              if (outcome) toast.push({ title: outcome, tone: "info" });
            }
          }}
        />
      )}

      {reading && (
        <PolicyDrawer
          key={reading.id}
          policyId={reading.id}
          title={reading.title}
          subtitle={
            reading.published
              ? `Version ${reading.version}${
                  reading.publishedAt
                    ? `, published ${dayLabel(reading.publishedAt.slice(0, 10))}`
                    : ""
                }`
              : "Draft — not published"
          }
          onClose={() => setReading(null)}
        />
      )}

      {chasing && (
        <ChaseDrawer
          key={chasing.id}
          policy={chasing}
          onClose={() => setChasing(null)}
        />
      )}

      <ConfirmDialog
        open={withdrawing !== null}
        onClose={() => setWithdrawing(null)}
        title={`Withdraw ${withdrawing?.title ?? ""}?`}
        confirmLabel="Withdraw"
        tone="danger"
        body="It leaves the handbook and nobody is asked for it again. Who accepted it is kept."
        onConfirm={async () => {
          if (!withdrawing) return;
          const ok = await run(
            () => policies.update(withdrawing.id, { archived: true }),
            `${withdrawing.title} withdrawn`,
          );
          if (ok) setWithdrawing(null);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function PolicyRow({
  policy,
  canManage,
  onRead,
  onEdit,
  onPublish,
  onChase,
  onRestore,
}: {
  policy: ApiPolicy;
  canManage: boolean;
  onRead: () => void;
  onEdit: () => void;
  onPublish: () => void;
  onChase: () => void;
  onRestore: () => void;
}) {
  const chaseable =
    policy.published &&
    !policy.archived &&
    policy.requiresAcknowledgement &&
    policy.outstandingCount > 0;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-text [&>svg]:size-4"
      >
        <FileText aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body font-medium text-ink">
          {policy.title}
          {policy.published ? (
            <Badge tone="neutral" size="sm">
              Version {policy.version}
            </Badge>
          ) : (
            <Badge tone="warning" size="sm" dot>
              Draft
            </Badge>
          )}
          {policy.archived && (
            <Badge tone="neutral" size="sm">
              Withdrawn
            </Badge>
          )}
          {/* Only where there was somebody to chase. A reference section is
              "fully accepted" by construction, and badging it would read as an
              achievement rather than a category. */}
          {policy.published &&
            !policy.archived &&
            policy.requiresAcknowledgement &&
            policy.fullyAccepted && (
              <Badge tone="success" size="sm" icon={<Check aria-hidden="true" />}>
                Everyone
              </Badge>
            )}
        </p>
        <p className="mt-0.5 text-body-sm text-muted">
          {acceptanceLabel(policy)}
          {policy.publishedAt && (
            <> · published {dayLabel(policy.publishedAt.slice(0, 10))}</>
          )}
        </p>
      </div>

      {/* `w-full` below `sm` so the controls take their own line rather than
          squeezing the title into a two-word column on a phone. */}
      <div className="flex w-full flex-wrap gap-1.5 sm:w-auto sm:shrink-0">
        <Button variant="ghost" size="sm" onClick={onRead}>
          Read
        </Button>

        {chaseable && canManage && (
          <Button variant="secondary" size="sm" onClick={onChase}>
            <Users aria-hidden="true" className="size-3.5" />
            Nudge {policy.outstandingCount}{" "}
            {policy.outstandingCount === 1 ? "person" : "people"}
          </Button>
        )}

        {canManage && policy.archived && (
          <Button variant="secondary" size="sm" onClick={onRestore}>
            Bring back
          </Button>
        )}

        {/* Three controls at most. Changing the wording and withdrawing both
            live inside Edit, because a row with five verbs on it makes the
            reader choose before they have read anything. */}
        {canManage && !policy.archived && (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              Edit
            </Button>
            {!policy.published && (
              <Button variant="accent" size="sm" onClick={onPublish}>
                Publish
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const MIN_BODY = 20;
const MIN_TITLE = 3;

function WriteSectionModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: {
    title: string;
    category?: string;
    body: string;
    requiresAcknowledgement: boolean;
    publish?: boolean;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [wording, setWording] = useState("");
  const [mustAccept, setMustAccept] = useState(true);
  const [busy, setBusy] = useState(false);

  const ready = title.trim().length >= MIN_TITLE && wording.trim().length >= MIN_BODY;

  const submit = (publish: boolean) => {
    setBusy(true);
    void onSave({
      title: title.trim(),
      ...(category.trim() ? { category: category.trim() } : {}),
      body: wording.trim(),
      requiresAcknowledgement: mustAccept,
      ...(publish ? { publish: true } : {}),
    }).finally(() => setBusy(false));
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Write a section"
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-muted">
            {mustAccept
              ? "Publishing asks everyone to accept it."
              : "Publishing puts it in the handbook to read."}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" disabled={!ready || busy} onClick={() => submit(false)}>
              Save as a draft
            </Button>
            <Button variant="accent" disabled={!ready || busy} onClick={() => submit(true)}>
              {busy ? "Working…" : "Publish now"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" required>
          <Input
            value={title}
            autoFocus
            placeholder="Working hours and pay day"
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
            }}
          />
        </Field>

        <Field label="Group" help="Optional. Groups it in the handbook.">
          <Input
            value={category}
            placeholder="Company"
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
            }}
          />
        </Field>

        <Field label="Wording" required>
          <Textarea
            rows={12}
            value={wording}
            placeholder="Write it the way you would say it to a new starter."
            onChange={(e) => {
              const v = e.target.value;
              setWording(v);
            }}
          />
        </Field>

        <Switch
          label="People have to accept this"
          description="Off means it is there to read, and nobody is chased."
          checked={mustAccept}
          onChange={(e) => {
            const on = e.target.checked;
            setMustAccept(on);
          }}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Editing everything except the words of a published section.
 *
 * The wording field is replaced by a button that opens the publish flow. That
 * is the whole rule made visible: there is exactly one way to change published
 * text, and it is the way that asks everybody again.
 */
function EditSectionModal({
  policy,
  onClose,
  onSave,
  onPublishInstead,
  onWithdraw,
}: {
  policy: ApiPolicy;
  onClose: () => void;
  onSave: (body: {
    title?: string;
    category?: string | null;
    body?: string;
    requiresAcknowledgement?: boolean;
  }) => Promise<void>;
  onPublishInstead: () => void;
  onWithdraw: () => void;
}) {
  const draft = usePolicyText(policy.published ? null : policy.id);
  const [title, setTitle] = useState(policy.title);
  const [category, setCategory] = useState(policy.category ?? "");
  const [mustAccept, setMustAccept] = useState(policy.requiresAcknowledgement);
  const [wording, setWording] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* The stored wording arrives after the modal opens, so the textarea shows it
     until somebody types — at which point the typed value takes over. No
     effect, no setState during a render. */
  const shown = wording ?? draft.policy?.body ?? "";
  const wordingReady = policy.published || shown.trim().length >= MIN_BODY;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Edit ${policy.title}`}
      size={policy.published ? "md" : "lg"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" onClick={onWithdraw}>
            Withdraw it
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={busy || title.trim().length < MIN_TITLE || !wordingReady}
              onClick={() => {
                setBusy(true);
                void onSave({
                  ...(title.trim() !== policy.title
                    ? { title: title.trim() }
                    : {}),
                  category: category.trim() === "" ? null : category.trim(),
                  ...(mustAccept !== policy.requiresAcknowledgement
                    ? { requiresAcknowledgement: mustAccept }
                    : {}),
                  ...(!policy.published && wording !== null
                    ? { body: wording.trim() }
                    : {}),
                }).finally(() => setBusy(false));
              }}
            >
              {busy ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Title" required>
          <Input
            value={title}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
            }}
          />
        </Field>

        <Field label="Group">
          <Input
            value={category}
            onChange={(e) => {
              const v = e.target.value;
              setCategory(v);
            }}
          />
        </Field>

        {policy.published ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-canvas p-4">
            <p className="text-body-sm text-body">
              Wording — version {policy.version}
            </p>
            <Button variant="secondary" size="sm" onClick={onPublishInstead}>
              Change the wording
            </Button>
          </div>
        ) : (
          <Field label="Wording" required>
            <Textarea
              rows={12}
              value={shown}
              onChange={(e) => {
                const v = e.target.value;
                setWording(v);
              }}
            />
          </Field>
        )}

        <Switch
          label="People have to accept this"
          description="Off means it is there to read, and nobody is chased."
          checked={mustAccept}
          onChange={(e) => {
            const on = e.target.checked;
            setMustAccept(on);
          }}
        />
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/** One line, and it is the truth about what the button is about to do. */
function publishLine(policy: ApiPolicy): string {
  if (!policy.published) {
    return policy.requiresAcknowledgement
      ? "Everyone will be asked to accept it."
      : "It goes into the handbook for people to read.";
  }
  if (!policy.requiresAcknowledgement) {
    return `The new wording replaces version ${policy.version}.`;
  }
  if (policy.acceptedCount === 0) {
    return `Everyone will be asked to accept version ${policy.version + 1}.`;
  }
  return `The ${policy.acceptedCount} ${
    policy.acceptedCount === 1 ? "person" : "people"
  } who accepted version ${policy.version} will be asked again.`;
}

function PublishModal({
  policy,
  onClose,
  onPublish,
}: {
  policy: ApiPolicy;
  onClose: () => void;
  /** `undefined` publishes the stored wording unchanged. */
  onPublish: (wording?: string) => Promise<void>;
}) {
  const current = usePolicyText(policy.published ? policy.id : null);
  const [wording, setWording] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = wording ?? current.policy?.body ?? "";
  const changed = wording !== null && wording.trim() !== (current.policy?.body ?? "");
  const ready = policy.published
    ? !current.loading && shown.trim().length >= MIN_BODY
    : true;

  return (
    <Modal
      open
      onClose={onClose}
      title={
        policy.published
          ? `Publish version ${policy.version + 1} of ${policy.title}`
          : `Publish ${policy.title}`
      }
      size={policy.published ? "lg" : "sm"}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-body">{publishLine(policy)}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="accent"
              disabled={busy || !ready}
              onClick={() => {
                setBusy(true);
                void onPublish(changed ? shown.trim() : undefined).finally(() =>
                  setBusy(false),
                );
              }}
            >
              {busy
                ? "Publishing…"
                : policy.published
                  ? `Publish version ${policy.version + 1}`
                  : "Publish"}
            </Button>
          </div>
        </div>
      }
    >
      {policy.published ? (
        current.loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the current wording
          </div>
        ) : (
          <Field
            label="Wording"
            required
            help="Edit it here, or publish it unchanged to ask everybody again."
          >
            <Textarea
              rows={14}
              value={shown}
              onChange={(e) => {
                const v = e.target.value;
                setWording(v);
              }}
            />
          </Field>
        )
      ) : (
        <p className="text-body leading-relaxed text-body">
          It becomes version {policy.version} of your handbook.
        </p>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Who has not accepted, and the honest limit of what we can do about it.
 *
 * **There is no reminder transport.** Publishing notifies every account through
 * the notifications module; there is no "remind the outstanding" endpoint and no
 * mail transport behind it either — see `src/modules/auth/delivery.ts` on the
 * API. So the useful capability is the list itself: copy the names and message
 * them, which is what actually happens in a Nigerian small business.
 *
 * TODO(reminders): when a transport exists, the adapter goes in the API's
 * notifications module as a "notify these employees about this policy" call,
 * and this button posts to it instead of writing to the clipboard. Nothing else
 * on this screen changes.
 */
function ChaseDrawer({
  policy,
  onClose,
}: {
  policy: ApiPolicy;
  onClose: () => void;
}) {
  const [state, setState] = useState<"outstanding" | "accepted">("outstanding");
  const list = useAcknowledgements(policy.id, state);
  const toast = useToast();

  const copy = async () => {
    const names = list.rows.map((row) => row.name).join(", ");
    try {
      await navigator.clipboard.writeText(names);
      toast.push({
        title: `${list.rows.length} ${list.rows.length === 1 ? "name" : "names"} copied`,
        tone: "success",
      });
    } catch {
      toast.push({
        title: "Could not copy",
        tone: "warning",
        detail: "Select the names below and copy them by hand.",
      });
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={policy.title}
      description={`Version ${policy.version} · ${acceptanceLabel(policy)}`}
      size="lg"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <p className="text-meta text-muted">
            ApproveHR cannot send the reminder itself yet.
          </p>
          <Button
            variant="accent"
            size="sm"
            disabled={list.rows.length === 0}
            onClick={() => void copy()}
          >
            <ClipboardCopy aria-hidden="true" className="size-3.5" />
            Copy the names
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          label="Who to show"
          value={state}
          onChange={setState}
          options={[
            { value: "outstanding", label: `Not accepted (${policy.outstandingCount})` },
            { value: "accepted", label: `Accepted (${policy.acceptedCount})` },
          ]}
        />

        {!list.available ? (
          <p className="text-body-sm text-body">
            The register of who has accepted needs the API.
          </p>
        ) : list.loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading
          </div>
        ) : list.error ? (
          <LoadFailure subject="the list" error={list.error} />
        ) : list.rows.length === 0 ? (
          <p className="text-body-sm text-body">
            {state === "outstanding"
              ? "Everybody has accepted this version."
              : "Nobody has accepted this version yet."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
            {list.rows.map((row) => (
              <li
                key={row.employeeId}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-body-sm font-medium text-ink">
                    {row.name}
                  </span>
                  <span className="block text-meta text-muted">
                    {row.employeeNo} · {row.jobTitle}
                  </span>
                </span>
                <span className="text-right text-meta text-muted">
                  {row.accepted ? (
                    <>
                      Accepted {dayLabel(row.acceptedAt?.slice(0, 10) ?? null)}
                      {row.ipAddress && (
                        <span className="block text-faint">from {row.ipAddress}</span>
                      )}
                    </>
                  ) : row.previouslyAcceptedVersion !== null ? (
                    <>Accepted version {row.previouslyAcceptedVersion}</>
                  ) : (
                    <>Never accepted</>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {state === "accepted" && list.rows.length > 0 && (
          <p className="text-meta text-muted">
            A click and an IP address, not a signature.
          </p>
        )}
      </div>
    </Drawer>
  );
}
