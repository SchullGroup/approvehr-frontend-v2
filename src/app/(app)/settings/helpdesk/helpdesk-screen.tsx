"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Tag, Timer } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  helpdeskApi,
  type ApiSlaPolicy,
  type ApiTicketCategory,
  type TicketPriority,
} from "@/lib/api/helpdesk";
import { useCan } from "@/lib/permissions";
import { useSession } from "@/lib/store/session";

/**
 * Ticket categories, and the promises behind them.
 *
 * ## The half of the help desk that had no interface
 *
 * The API has had `POST`, `PATCH` and `DELETE` on `/helpdesk/categories` and
 * `/helpdesk/sla` since the module was written — permissioned, tested, and
 * called by **nothing in this product**. So a company could read the categories
 * it did not have and had no way to create one.
 *
 * That was not merely a missing settings screen. The Get help form required a
 * category, the API never did, and a company with none therefore had a Send
 * button that could not be pressed — an employee could not raise a help request
 * at all. That form no longer requires one; this is where the categories it
 * offers come from.
 *
 * ## Categories are switched off, not deleted
 *
 * `DELETE` exists and this screen does not offer it. Every ticket ever raised
 * carries its category, and the ticket list, the analytics and the SLA clock
 * all read it — removing one would strand history the same way deleting a
 * department would. `active: false` takes it out of the picker and leaves every
 * ticket that used it resolvable, which is the same choice `archive` makes
 * everywhere else in this product.
 *
 * ## Working minutes, and why the form says so
 *
 * An SLA's targets are counted in **working** minutes: the clock stops outside
 * working hours and on the company's own holidays, so "8 hours" is the next
 * working day rather than tomorrow morning. A form that took a number and said
 * nothing would have somebody promise a two-hour reply and mean 9am Monday.
 */
export function HelpdeskSettingsScreen() {
  const { isConnected } = useSession();
  const canManage = useCan("MANAGE_SETTINGS");
  const toast = useToast();

  const [categories, setCategories] = useState<ApiTicketCategory[] | null>(null);
  const [policies, setPolicies] = useState<ApiSlaPolicy[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState<ApiTicketCategory | "new" | null>(null);
  const [editingSla, setEditingSla] = useState<ApiSlaPolicy | "new" | null>(
    null,
  );

  /**
   * Bumped to reload. The effect owns the request, not a callback it calls.
   *
   * `useEffect(() => void load())` reads more directly and the React compiler
   * refuses it: from outside, `load` may setState before its first await, which
   * is a cascading render. A counter in the dependency list keeps the fetch
   * inside the effect, where the cancelled guard belongs anyway.
   */
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void (async () => {
      try {
        const [cats, sla] = await Promise.all([
          /* `includeInactive` on: this is the screen where somebody turns one
             back on, and a switched-off category that vanished from its own
             settings page could never be recovered. */
          helpdeskApi.categories(true),
          helpdeskApi.sla(true),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setPolicies(sla.policies);
        setError(null);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof ApiError ? caught : null);
        setCategories([]);
        setPolicies([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected, revision]);

  if (!isConnected) {
    return (
      <>
        <PageHeader title="Help desk" />
        <PageBody>
          <Callout tone="neutral" title="This needs the API">
            Categories and reply targets decide where a real ticket lands and
            when it is late. One kept in this browser would route nothing.
          </Callout>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Help desk" />

      <PageBody className="flex flex-col gap-6">
        <p className="text-body-sm text-body">
          What people can raise a request about, and how quickly you have
          promised to answer.
        </p>

        {error && <LoadFailure subject="the help desk settings" error={error} />}

        <Card>
          <CardHeader
            title="Categories"
            description="What a request can be about. Somebody raising one picks from this list, and the category decides who it lands with."
            action={
              canManage ? (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => setEditing("new")}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  New category
                </Button>
              ) : undefined
            }
          />
          <CardBody className="flex flex-col gap-3">
            {categories === null ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading
              </span>
            ) : categories.length === 0 ? (
              <EmptyState
                compact
                icon={<Tag aria-hidden="true" />}
                title="No categories yet"
                description="Requests still reach the help desk without one — they arrive unsorted, and nothing routes them."
                {...(canManage
                  ? {
                      action: (
                        <Button
                          variant="accent"
                          size="sm"
                          onClick={() => setEditing("new")}
                        >
                          Add the first one
                        </Button>
                      ),
                    }
                  : {})}
              />
            ) : (
              categories.map((category) => (
                <CategoryRow
                  key={category.id}
                  category={category}
                  canManage={canManage}
                  onEdit={() => setEditing(category)}
                  onToggled={reload}
                />
              ))
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Reply targets"
            description="How long you have to answer, and to finish. Counted in working hours, so the clock stops overnight and on your holidays."
            action={
              canManage ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setEditingSla("new")}
                >
                  <Plus aria-hidden="true" className="size-4" />
                  New target
                </Button>
              ) : undefined
            }
          />
          <CardBody className="flex flex-col gap-3">
            {policies === null ? (
              <span className="flex items-center gap-2 text-body-sm text-muted">
                <Spinner size="sm" />
                Loading
              </span>
            ) : policies.length === 0 ? (
              <EmptyState
                compact
                icon={<Timer aria-hidden="true" />}
                title="No targets set"
                description="Without one, nothing is ever late — a ticket has no promise to measure against."
              />
            ) : (
              policies.map((policy) => (
                <SlaRow
                  key={policy.id}
                  policy={policy}
                  canManage={canManage}
                  onEdit={() => setEditingSla(policy)}
                />
              ))
            )}
          </CardBody>
        </Card>
      </PageBody>

      {editing && (
        <CategoryDialog
          category={editing === "new" ? null : editing}
          policies={policies ?? []}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null);
            toast.push({ title: `${name} saved`, tone: "success" });
            reload();
          }}
        />
      )}

      {editingSla && (
        <SlaDialog
          policy={editingSla === "new" ? null : editingSla}
          onClose={() => setEditingSla(null)}
          onSaved={(name) => {
            setEditingSla(null);
            toast.push({ title: `${name} saved`, tone: "success" });
            reload();
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function CategoryRow({
  category,
  canManage,
  onEdit,
  onToggled,
}: {
  category: ApiTicketCategory;
  canManage: boolean;
  onEdit: () => void;
  onToggled: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await helpdeskApi.updateCategory(category.id, {
        active: !category.active,
      });
      onToggled();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError ? caught.message : "Try again in a moment.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-medium text-ink">
            {category.name}
          </span>
          {!category.active && (
            <Badge tone="neutral" size="sm">
              Switched off
            </Badge>
          )}
          {category.sla && (
            <Badge tone="accent" size="sm">
              {category.sla.name}
            </Badge>
          )}
        </span>
        {category.description && (
          <span className="mt-1 block text-meta text-muted">
            {category.description}
          </span>
        )}
        <span className="mt-1 block text-meta text-muted">
          {category.defaultAssignee
            ? `Goes to ${category.defaultAssignee.name}.`
            : "Nobody is assigned by default."}
          {/* Both counts, because they answer different questions: how much
              history switching this off would strand, and how much is live. */}
          {category.tickets > 0
            ? ` ${String(category.tickets)} ${category.tickets === 1 ? "request" : "requests"} so far, ${String(category.openTickets)} still open.`
            : " Nothing raised under it yet."}
        </span>
      </span>

      {canManage && (
        <span className="flex shrink-0 gap-2">
          <Button size="sm" onClick={onEdit}>
            Edit
          </Button>
          {/* Switched off rather than deleted — every ticket ever raised
              carries its category, and the list, the analytics and the SLA
              clock all read it. */}
          <Button
            variant="ghost"
            size="sm"
            loading={busy}
            onClick={() => void toggle()}
          >
            {category.active ? "Switch off" : "Turn back on"}
          </Button>
        </span>
      )}
    </div>
  );
}

function SlaRow({
  policy,
  canManage,
  onEdit,
}: {
  policy: ApiSlaPolicy;
  canManage: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-line p-3">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-sm font-medium text-ink">
            {policy.name}
          </span>
          <Badge tone="neutral" size="sm">
            {policy.priority}
          </Badge>
          {!policy.active && (
            <Badge tone="neutral" size="sm">
              Switched off
            </Badge>
          )}
        </span>
        <span className="mt-1 block text-meta text-muted">
          Reply within {workingHours(policy.firstResponseMinutes)}, finish
          within {workingHours(policy.resolutionMinutes)}. Working hours only.
        </span>
      </span>
      {canManage && (
        <Button size="sm" onClick={onEdit}>
          Edit
        </Button>
      )}
    </div>
  );
}

/**
 * Minutes as something a person would say.
 *
 * "480 minutes" is a figure somebody has to divide before it means anything,
 * and the thing being described is a promise made to a colleague.
 */
function workingHours(minutes: number): string {
  if (minutes < 60) return `${String(minutes)} minutes`;
  const hours = minutes / 60;
  if (hours < 8) {
    const whole = Math.floor(hours);
    const rest = minutes % 60;
    return rest === 0
      ? `${String(whole)} ${whole === 1 ? "hour" : "hours"}`
      : `${String(whole)}h ${String(rest)}m`;
  }
  /* Past a working day, days are the unit people actually think in — and these
     are working days, which is the whole point of a working-minutes clock. */
  const days = hours / 8;
  return days === 1
    ? "1 working day"
    : `${days % 1 === 0 ? String(days) : days.toFixed(1)} working days`;
}

/* -------------------------------------------------------------------------- */

function CategoryDialog({
  category,
  policies,
  onClose,
  onSaved,
}: {
  category: ApiTicketCategory | null;
  policies: ApiSlaPolicy[];
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [slaId, setSlaId] = useState(category?.sla?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    if (name.trim().length < 2) {
      setFailed("Give it a name people will recognise.");
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      if (category) {
        await helpdeskApi.updateCategory(category.id, {
          name: name.trim(),
          /* `null` clears, an absent key leaves alone — so an emptied box has
             to send null rather than "". */
          description: description.trim() || null,
          slaPolicyId: slaId || null,
        });
      } else {
        await helpdeskApi.createCategory({
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(slaId ? { slaPolicyId: slaId } : {}),
        });
      }
      onSaved(name.trim());
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={category ? "Edit category" : "New category"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="What it is called"
          required
          {...(failed ? { error: failed } : {})}
          help="What somebody raising a request will see in the list."
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Payslips and pay"
          />
        </Field>

        <Field optional label="What belongs here">
          <Textarea
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Anything about a payslip, a deduction or a payment that has not arrived."
          />
        </Field>

        <Field
          optional
          label="Reply target"
          help={
            policies.length === 0
              ? "No targets set yet, so nothing raised under this will ever count as late."
              : "How quickly a request in this category has to be answered."
          }
        >
          <Select
            value={slaId}
            disabled={policies.length === 0}
            onChange={(event) => setSlaId(event.target.value)}
          >
            <option value="">No target</option>
            {policies.map((policy) => (
              <option key={policy.id} value={policy.id}>
                {policy.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* The enum's own three. There is no URGENT — see `TicketPriority`. */
const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH"];

function SlaDialog({
  policy,
  onClose,
  onSaved,
}: {
  policy: ApiSlaPolicy | null;
  onClose: () => void;
  onSaved: (name: string) => void;
}) {
  const [name, setName] = useState(policy?.name ?? "");
  const [priority, setPriority] = useState<TicketPriority>(
    policy?.priority ?? "NORMAL",
  );
  /* Hours in the form, minutes on the wire. Nobody promises a colleague "four
     hundred and eighty minutes". */
  const [replyHours, setReplyHours] = useState(
    policy ? String(policy.firstResponseMinutes / 60) : "4",
  );
  const [finishHours, setFinishHours] = useState(
    policy ? String(policy.resolutionMinutes / 60) : "16",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const save = async () => {
    const reply = Number(replyHours) * 60;
    const finish = Number(finishHours) * 60;
    if (name.trim().length < 2) {
      setFailed("Give it a name.");
      return;
    }
    if (!Number.isFinite(reply) || reply < 1) {
      setFailed("Say how long you have to reply.");
      return;
    }
    /* The API's own rule, said here before it refuses: a promise to finish
       before you have replied is not a promise anybody can keep. */
    if (finish < reply) {
      setFailed(
        "The finish target has to be at least as long as the reply target.",
      );
      return;
    }
    setBusy(true);
    setFailed(null);
    try {
      if (policy) {
        await helpdeskApi.updateSla(policy.id, {
          name: name.trim(),
          priority,
          firstResponseMinutes: Math.round(reply),
          resolutionMinutes: Math.round(finish),
        });
      } else {
        await helpdeskApi.createSla({
          name: name.trim(),
          priority,
          firstResponseMinutes: Math.round(reply),
          resolutionMinutes: Math.round(finish),
        });
      }
      onSaved(name.trim());
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not save. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={policy ? "Edit reply target" : "New reply target"}
      size="sm"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="What it is called"
          required
          {...(failed ? { error: failed } : {})}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Standard"
          />
        </Field>

        <Field label="Which requests" required>
          <Select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as TicketPriority)
            }
          >
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {option.charAt(0) + option.slice(1).toLowerCase()}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Reply within" required>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0.25}
                step={0.25}
                inputMode="decimal"
                className="w-24"
                value={replyHours}
                onChange={(event) => setReplyHours(event.target.value)}
              />
              <span className="text-body-sm text-muted">hours</span>
            </div>
          </Field>
          <Field label="Finish within" required>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0.25}
                step={0.25}
                inputMode="decimal"
                className="w-24"
                value={finishHours}
                onChange={(event) => setFinishHours(event.target.value)}
              />
              <span className="text-body-sm text-muted">hours</span>
            </div>
          </Field>
        </div>

        <p className="text-meta text-muted">
          Both are <strong>working</strong> hours. The clock stops overnight, at
          the weekend and on your public holidays — so eight hours is the next
          working day, not tomorrow morning.
        </p>
      </div>
    </Modal>
  );
}
