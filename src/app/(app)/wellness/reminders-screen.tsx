"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Field,
  FieldRow,
  Input,
  LoadState,
  Modal,
  Switch,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ReminderDelivery } from "./reminders-delivery";
import { ApiError } from "@/lib/api/client";
import type { ApiReminderPolicy } from "@/lib/api/wellness";
import { useCan } from "@/lib/permissions";
import {
  useMyReminders,
  useWellnessActions,
  useWellnessSettings,
} from "@/lib/store/wellness";
import {
  BREAKS_MAX_COUNT,
  SOURCE_LABEL,
  breakText,
  intervalsText,
  toDrafts,
  toPolicyBody,
  type BreakDraft,
} from "@/lib/wellness/reminders";

/**
 * Reminders: when to be told to take a break, and which breaks have a name.
 *
 * ## Yours replaces the company's, as a whole
 *
 * A person's settings are written whole and deleted whole. Inheriting field by
 * field would let a change to the company default quietly alter the reminders of
 * somebody who had said what they wanted, so the cost is that their own settings
 * do not follow later changes to the default. The tooltip on the badge says so,
 * once, where somebody who set their own would look.
 *
 * ## Nobody else's are shown to anybody
 *
 * That a person turned reminders off is itself a wellness fact, so there is no
 * list of who has their own and no way to read one. The company default is the
 * only policy more than one person can see.
 *
 * ## Nothing is sent until something is saved
 *
 * The API sends reminders from a scheduler, and only for a **saved** policy: a
 * person's own, else the company's. Before either exists the API still answers
 * with the built-in 15 and 30 minutes (`source: "DEFAULT"`) so the form has
 * something to start from, and this screen used to draw that answer exactly as it
 * draws a saved one, "Reminders: On, every 15 and 30 minutes", for somebody who
 * would never be sent one. A policy that has not been saved is now drawn as
 * suggestions, says nothing is being sent, and its button is the call to action
 * ("Set up reminders", and then Save). The company default says the same about
 * itself to the person who can save it.
 *
 * What delivery looks like, and its limits, is in `reminders-delivery.tsx`.
 */

export function RemindersScreen() {
  const mine = useMyReminders();
  const settings = useWellnessSettings();
  const canManage = useCan("MANAGE_SETTINGS");
  const [editing, setEditing] = useState<"personal" | "organisation" | null>(
    null,
  );

  const reload = () => {
    mine.reload();
    settings.reload();
  };
  const own = mine.data?.source === "PERSONAL";

  return (
    <LoadState
      loading={mine.loading || settings.loading}
      error={mine.error ?? settings.error}
      onRetry={reload}
      hasData={mine.data !== null && settings.data !== null}
      subject="your reminders"
      skeleton="list"
    >
      {mine.data && settings.data && (
        <div className="grid gap-5 lg:grid-cols-2">
          <PolicyCard
            title="Your reminders"
            policy={mine.data}
            description={SOURCE_LABEL[mine.data.source]}
            notSent="Nothing is sent to you until you save reminders. These are the suggested times."
            setUp="Set up reminders"
            onEdit={() => setEditing("personal")}
          />
          {canManage && (
            <PolicyCard
              title="Company default"
              policy={settings.data.reminders}
              description="For people who set none of their own."
              notSent="Nothing is sent to anybody until a default is saved. These are the suggested times."
              setUp="Set up the default"
              onEdit={() => setEditing("organisation")}
            />
          )}
        </div>
      )}
      {mine.data && settings.data && (
        <div className="mt-5">
          <ReminderDelivery />
        </div>
      )}

      {editing && mine.data && settings.data && (
        <PolicyDialog
          scope={editing}
          policy={editing === "personal" ? mine.data : settings.data.reminders}
          hasOwn={own}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </LoadState>
  );
}

function PolicyCard({
  title,
  policy,
  description,
  notSent,
  setUp,
  onEdit,
  tooltip,
}: {
  title: string;
  policy: ApiReminderPolicy;
  /** One line under the title: whose it is, or who it applies to. */
  description: string;
  /** What to say while nothing has been saved: that nothing is being sent. */
  notSent: string;
  /** The button's words while nothing has been saved. */
  setUp: string;
  onEdit: () => void;
  tooltip?: string;
}) {
  /* The built-in answer is a starting point and not a policy: nothing is sent
     for it. Every other source has been saved by somebody. */
  const saved = policy.source !== "DEFAULT";
  const note =
    tooltip ??
    (policy.source === "PERSONAL"
      ? "Your own settings replace the company default as a whole, and do not follow later changes to it."
      : undefined);

  return (
    <Card>
      <CardHeader
        level={2}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {title}
            {note && (
              <InfoTooltip
                id={`wellness-policy-${title.toLowerCase().replace(/\s+/g, "-")}`}
                label={`About ${title.toLowerCase()}`}
                text={note}
              />
            )}
          </span>
        }
        description={description}
        action={
          saved ? (
            <Button size="sm" variant="secondary" onClick={onEdit}>
              Edit
            </Button>
          ) : (
            <Button size="sm" variant="accent" onClick={onEdit}>
              {setUp}
            </Button>
          )
        }
      />
      <CardBody className="flex flex-col gap-3">
        {!saved && <p className="text-body-sm text-warning-text">{notSent}</p>}
        <DescriptionList
          layout="rows"
          items={[
            {
              term: "Reminders",
              value: !saved ? (
                <span className="text-warning-text">Not set up</span>
              ) : policy.enabled ? (
                "On"
              ) : (
                "Off"
              ),
            },
            {
              term: saved ? "Every" : "Suggested",
              value: intervalsText(policy.intervals),
            },
            {
              term: "Named breaks",
              value:
                policy.breaks.length === 0 ? (
                  <span className="text-muted">None</span>
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {policy.breaks.map((entry) => (
                      <li key={entry.name}>{breakText(entry)}</li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------------ editor */

function PolicyDialog({
  scope,
  policy,
  hasOwn,
  onClose,
  onSaved,
}: {
  scope: "personal" | "organisation";
  policy: ApiReminderPolicy;
  /** Whether the person already has their own, so there is something to give up. */
  hasOwn: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const [enabled, setEnabled] = useState(policy.enabled);
  const [intervals, setIntervals] = useState(policy.intervals.join(", "));
  const [breaks, setBreaks] = useState<BreakDraft[]>(toDrafts(policy.breaks));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const personal = scope === "personal";

  const change = (index: number, patch: Partial<BreakDraft>) =>
    setBreaks((current) =>
      current.map((entry, at) =>
        at === index ? { ...entry, ...patch } : entry,
      ),
    );

  const save = async () => {
    const body = toPolicyBody({ enabled, intervalsText: intervals, breaks });
    if (!body.ok) {
      setProblem(body.message);
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      if (personal) await actions.setMyReminders(body.value);
      else await actions.setOrganisationReminders(body.value);
      toast.push({
        tone: "success",
        title: personal ? "Your reminders are saved" : "The default is saved",
      });
      onSaved();
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const revertToDefault = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await actions.clearMyReminders();
      toast.push({ tone: "info", title: "You are on the company default" });
      onSaved();
    } catch (error) {
      setProblem(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={personal ? "Your reminders" : "Company default"}
      description={
        personal
          ? policy.source === "DEFAULT"
            ? "These are suggestions. Nothing is sent until you press Save."
            : "Saving makes these your own settings."
          : policy.source === "DEFAULT"
            ? "Applies to everybody who has not set their own. Nothing is sent until you press Save."
            : "Applies to everybody who has not set their own."
      }
      footer={
        <>
          {personal && hasOwn && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => void revertToDefault()}
              disabled={busy}
            >
              Use company default
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void save()}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Switch
          label="Reminders"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />

        <Field
          label="Remind every"
          help="Minutes between reminders, from 5 to 240. Give up to six, each different, like 15, 30."
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            suffix="minutes"
            value={intervals}
            onChange={(event) => {
              setIntervals(event.target.value);
              setProblem(null);
            }}
          />
        </Field>

        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
            Named breaks
            <InfoTooltip
              id="wellness-breaks"
              label="About named breaks"
              text="Times are in the company's time zone. A break cannot overlap another or run past midnight, and each name is used once."
            />
          </p>
          {breaks.map((entry, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 rounded-lg border border-line p-3"
            >
              <FieldRow cols={3} phone="stack">
                <Field label="Name">
                  <Input
                    value={entry.name}
                    maxLength={40}
                    onChange={(event) =>
                      change(index, { name: event.target.value })
                    }
                  />
                </Field>
                <Field label="Starts at">
                  <Input
                    type="time"
                    value={entry.startsAt}
                    onChange={(event) =>
                      change(index, { startsAt: event.target.value })
                    }
                  />
                </Field>
                <Field label="Length">
                  <Input
                    inputMode="numeric"
                    suffix="min"
                    value={entry.minutes}
                    onChange={(event) =>
                      change(index, { minutes: event.target.value })
                    }
                  />
                </Field>
              </FieldRow>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setBreaks((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Remove
                </Button>
              </div>
            </div>
          ))}
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={breaks.length >= BREAKS_MAX_COUNT}
              onClick={() =>
                setBreaks((current) => [
                  ...current,
                  { name: "", startsAt: "13:00", minutes: "30" },
                ])
              }
            >
              <Plus aria-hidden="true" className="size-4" />
              Add a break
            </Button>
          </div>
        </div>

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
