"use client";

import { useState } from "react";
import { ListChecks, Plus } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  EXIT_KINDS,
  TASK_KIND_LABELS,
  TASK_KIND_ORDER,
  ownerLabel,
  type ApiExitTemplate,
  type ExitKind,
  type ExitTaskKind,
} from "@/lib/api/offboarding";
import { Can, useCan } from "@/lib/permissions";
import { useExitTemplates } from "@/lib/store/offboarding";

/**
 * The checklist every leaver works through.
 *
 * ## Why this screen is a link and not a step
 *
 * `ExitTaskTemplate` had five endpoints and no screen, which meant a company
 * could not add "hand back the fuel card" without somebody calling the API by
 * hand. But it must not become a *setup* screen either: the seven defaults are
 * seeded on first read precisely so that nobody has to build a checklist before
 * processing their first leaver. A five-person business should get through an
 * entire exit without ever arriving here.
 *
 * So it lives one click off the exit list, phrased as "what everyone works
 * through" rather than as configuration, and it opens with the list already
 * populated rather than with an empty state and an invitation.
 *
 * ## Off, never deleted
 *
 * Switching a line off keeps it. The reason is not sentiment: a company with no
 * templates at all used to get the defaults seeded, so a real delete would put the line
 * they just removed straight back the next time somebody resigned. The switch
 * says "on new checklists", because that is exactly what it changes — an exit
 * already running keeps the lines it was given.
 */
export function ChecklistSettingsScreen() {
  const [showOff, setShowOff] = useState(false);
  const [adding, setAdding] = useState(false);
  const [adopting, setAdopting] = useState(false);
  const [editing, setEditing] = useState<ApiExitTemplate | null>(null);

  const templates = useExitTemplates(showOff);
  const toast = useToast();
  const canEdit = useCan("MANAGE_SETTINGS");

  async function adoptDefaults() {
    setAdopting(true);
    try {
      await run(
        () => templates.adoptDefaults(),
        "Suggested checklist added. Edit or remove any line",
      );
    } finally {
      setAdopting(false);
    }
  }

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await action();
      toast.push({ title: success, tone: "success" });
      return true;
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
      return false;
    }
  }

  /* Grouped in the order the checklist itself reads in, so this screen and a
     leaver's page cannot present the same seven lines in two different orders. */
  const groups = TASK_KIND_ORDER.map((kind) => ({
    kind,
    label: TASK_KIND_LABELS[kind],
    rows: templates.rows.filter((row) => row.kind === kind),
  })).filter((group) => group.rows.length > 0);

  return (
    <>
      <PageHeader
        title="Exit checklist"
        breadcrumb={[{ href: "/people/offboarding", label: "Exit management" }]}
        meta={
          DEMO_ENABLED && templates.source === "demo" ? (
            <Badge tone="warning" size="sm">
              Demo · this browser only
            </Badge>
          ) : undefined
        }
        action={
          <Can permission="MANAGE_SETTINGS">
            <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" className="size-4" />
              Add a line
            </Button>
          </Can>
        }
      />

      <PageBody className="flex flex-col gap-6">
        {templates.error && (
          <LoadFailure subject="the checklist" error={templates.error}  onRetry={templates.reload}/>
        )}

        <Callout tone="info" title="These apply to the next exit, not to one already running">
          Somebody already working through their checklist keeps the lines they
          were given. Changing this list would rewrite a record somebody has
          already signed off.
        </Callout>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            {templates.counts.active} on the list · {" "}
            {templates.counts.mandatory} must be done before an exit can close
          </p>
          <Switch
            checked={showOff}
            onChange={(e) => setShowOff(e.target.checked)}
            label="Show switched-off lines"
          />
        </div>

        {templates.loading ? (
          <Card>
            <CardBody className="flex flex-col gap-3">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </CardBody>
          </Card>
        ) : groups.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ListChecks aria-hidden="true" />}
              title="Nothing on the checklist yet"
              description="What somebody has to do before they leave: hand back a laptop, agree the final pay, notify the pension provider. Write your own, or start from the seven most companies need and edit from there."
              action={
                canEdit ? (
                  <span className="flex flex-wrap items-center justify-center gap-2">
                    <Button
                      variant="accent"
                      loading={adopting}
                      onClick={() => void adoptDefaults()}
                    >
                      Use the suggested checklist
                    </Button>
                    <Button variant="secondary" onClick={() => setAdding(true)}>
                      Write my own
                    </Button>
                  </span>
                ) : undefined
              }
            />
          </Card>
        ) : (
          groups.map((group) => (
            <Card key={group.kind}>
              <CardHeader title={group.label} level={3} />
              <CardBody className="flex flex-col gap-2">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-md border border-line p-3 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                        <span className={row.active ? "" : "text-muted"}>
                          {row.label}
                        </span>
                        {!row.mandatory && (
                          <Badge tone="neutral" size="sm">
                            Optional
                          </Badge>
                        )}
                        {!row.active && (
                          <Badge tone="neutral" size="sm">
                            Switched off
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-body-sm text-muted">
                        {ownerLabel(row.owner)} · {row.appliesToLabel}
                      </p>
                    </div>

                    {canEdit && (
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(row)}
                        >
                          Change
                        </Button>
                        {row.active ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              void run(
                                () => templates.switchOff(row.id),
                                "Switched off",
                              )
                            }
                          >
                            Switch off
                          </Button>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() =>
                              void run(
                                () => templates.edit(row.id, { active: true }),
                                "Switched back on",
                              )
                            }
                          >
                            Switch on
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </CardBody>
            </Card>
          ))
        )}
      </PageBody>

      {adding && (
        <LineDialog
          onClose={() => setAdding(false)}
          onSave={async (body) => {
            const ok = await run(
              () =>
                templates.add({
                  kind: body.kind,
                  label: body.label,
                  owner: body.owner,
                  mandatory: body.mandatory,
                  appliesTo: body.appliesTo,
                }),
              "Added to the checklist",
            );
            if (ok) setAdding(false);
          }}
        />
      )}

      {editing && (
        <LineDialog
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={async (body) => {
            const ok = await run(
              () => templates.edit(editing.id, body),
              "Saved",
            );
            if (ok) setEditing(null);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** The five roles the checklist knows, in the words the leaver's page uses. */
const OWNERS: { value: string; label: string }[] = [
  { value: "employee", label: "The person leaving" },
  { value: "manager", label: "Their manager" },
  { value: "hr", label: "HR" },
  { value: "it", label: "IT" },
  { value: "finance", label: "Finance" },
];

/**
 * One line, added or changed.
 *
 * `appliesTo` is offered as "every exit" plus a per-kind narrowing rather than as
 * five checkboxes, because "every exit" is the answer nine times out of ten and a
 * form whose common case is five clicks is a form people fill in wrongly. The
 * narrowing that matters — a reference letter is not part of a dismissal — is
 * still one click away.
 */
function LineDialog({
  existing,
  onClose,
  onSave,
}: {
  existing?: ApiExitTemplate;
  onClose: () => void;
  onSave: (body: {
    kind: ExitTaskKind;
    label: string;
    owner: string;
    mandatory: boolean;
    appliesTo: ExitKind[];
  }) => Promise<void>;
}) {
  const [kind, setKind] = useState<ExitTaskKind>(existing?.kind ?? "PAPERWORK");
  const [label, setLabel] = useState(existing?.label ?? "");
  const [owner, setOwner] = useState(existing?.owner ?? "hr");
  const [mandatory, setMandatory] = useState(existing?.mandatory ?? true);
  const [everyKind, setEveryKind] = useState(
    existing ? existing.appliesTo.length === 0 : true,
  );
  const [appliesTo, setAppliesTo] = useState<ExitKind[]>(existing?.appliesTo ?? []);
  const [busy, setBusy] = useState(false);

  const ready = label.trim().length >= 3 && (everyKind || appliesTo.length > 0);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={existing ? "Change this line" : "Add a line"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => {
              setBusy(true);
              void onSave({
                kind,
                label: label.trim(),
                owner,
                mandatory,
                appliesTo: everyKind ? [] : appliesTo,
              }).finally(() => setBusy(false));
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What has to happen" required help="Write it as something done.">
          <Input
            value={label}
            autoFocus
            maxLength={160}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Fuel card handed back"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Which part of the exit">
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as ExitTaskKind)}
            >
              {TASK_KIND_ORDER.map((value) => (
                <option key={value} value={value}>
                  {TASK_KIND_LABELS[value]}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Whose job it is">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {OWNERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Checkbox
          checked={mandatory}
          onChange={(e) => setMandatory(e.target.checked)}
          label="An exit cannot close until this is done"
          description="Leave it off for something that would be good to do but should never hold up somebody's last day, a reference letter, for instance."
        />

        <Checkbox
          checked={everyKind}
          onChange={(e) => {
            setEveryKind(e.target.checked);
            if (e.target.checked) setAppliesTo([]);
          }}
          label="On every kind of exit"
        />

        {!everyKind && (
          <div className="ml-7 flex flex-col gap-2.5">
            {EXIT_KINDS.map((option) => (
              <Checkbox
                key={option.value}
                checked={appliesTo.includes(option.value)}
                onChange={(e) =>
                  setAppliesTo((current) =>
                    e.target.checked
                      ? [...current, option.value]
                      : current.filter((value) => value !== option.value),
                  )
                }
                label={option.label}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
