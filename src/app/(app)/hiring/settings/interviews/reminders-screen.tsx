"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  FieldRow,
  Input,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { useInterviewsGateway } from "@/lib/hiring/interviews/use-interviews";
import {
  UNITS,
  draftOf,
  durationWords,
  fieldOfPath,
  hoursWords,
  sameDraft,
  settingsFromDraft,
  type BeforeDraft,
  type ReminderSettingsView,
  type SettingsDraft,
  type SettingsField,
  type Unit,
} from "@/lib/hiring/interviews/reminders";
import { useLoaded } from "@/lib/use-loaded";
import { HiringSettingsShell } from "../settings-shell";

/**
 * When people are reminded about an interview, and when a scorecard is chased.
 *
 * ## These are defaults, and they only ever follow an invitation that was sent
 *
 * Nothing on this page sends anything. Each line says, in the same words, the one
 * condition that applies to all of them: a reminder goes only for an interview where the
 * invitation was sent. An interview booked with "Don't send" has none, whatever is set
 * here.
 *
 * ## What a change here reaches
 *
 * What is chosen here decides what is planned **when an invitation is sent**. Reminders
 * already planned keep the times they were planned with; one switched off here is not
 * sent when its time comes. The page says so once, near the top.
 *
 * ## Saved on purpose, checked against the server's own limits
 *
 * A change is a button, not a keystroke: what is typed is checked against the limits the
 * server gave (how long before, how many hours after) and put under its box before
 * anything is sent, and a refusal from the server lands under the same box with what was
 * typed kept.
 */

const ONLY_AFTER_INVITATION =
  "Only sent for interviews where you chose to send the invitation.";

type Section = {
  title: string;
  slots: {
    key: "candidateEarly" | "candidateLate" | "panelistEarly" | "panelistLate";
    field: SettingsField;
    label: string;
    help: string;
    range: "earlyMinutes" | "lateMinutes";
  }[];
};

const SECTIONS: Section[] = [
  {
    title: "Reminders to the candidate",
    slots: [
      {
        key: "candidateEarly",
        field: "candidate.early",
        label: "Earlier reminder",
        help: ONLY_AFTER_INVITATION,
        range: "earlyMinutes",
      },
      {
        key: "candidateLate",
        field: "candidate.late",
        label: "Later reminder",
        help: ONLY_AFTER_INVITATION,
        range: "lateMinutes",
      },
    ],
  },
  {
    title: "Reminders to the panel",
    slots: [
      {
        key: "panelistEarly",
        field: "panelist.early",
        label: "Earlier reminder",
        help: ONLY_AFTER_INVITATION,
        range: "earlyMinutes",
      },
      {
        key: "panelistLate",
        field: "panelist.late",
        label: "Later reminder",
        help: ONLY_AFTER_INVITATION,
        range: "lateMinutes",
      },
    ],
  },
];

const UNIT_LABEL: Record<Unit, string> = {
  minutes: "minutes",
  hours: "hours",
  days: "days",
};

function Before({
  slot,
  box,
  view,
  error,
  disabled,
  onChange,
}: {
  slot: Section["slots"][number];
  box: BeforeDraft;
  view: ReminderSettingsView;
  error: string | undefined;
  disabled: boolean;
  onChange: (next: BeforeDraft) => void;
}) {
  const range = view.bounds[slot.range];
  return (
    <div className="flex flex-col gap-3">
      <Switch
        label={slot.label}
        description={slot.help}
        checked={box.enabled}
        disabled={disabled}
        onChange={(event) =>
          onChange({ ...box, enabled: event.currentTarget.checked })
        }
      />
      <div className="max-w-sm">
        <FieldRow phone="pair">
          <Field label="How long before" {...(error ? { error } : {})}>
            <Input
              inputMode="decimal"
              value={box.amount}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...box, amount: event.currentTarget.value })
              }
            />
          </Field>
          <Field label="Unit">
            <Select
              value={box.unit}
              disabled={disabled}
              onChange={(event) =>
                onChange({ ...box, unit: event.currentTarget.value as Unit })
              }
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>
        <p className="mt-1.5 text-meta text-muted">
          From {durationWords(range.min)} to {durationWords(range.max)} before
          the interview.
        </p>
      </div>
    </div>
  );
}

export function InterviewRemindersScreen() {
  const gateway = useInterviewsGateway();
  const toast = useToast();
  const loaded = useLoaded(
    `reminder-settings-page:${gateway.mode}`,
    true,
    (signal) => gateway.reminderSettings(signal),
  );
  const [edited, setEdited] = useState<SettingsDraft | null>(null);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<{
    fields: Partial<Record<SettingsField, string>>;
    general: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const view = loaded.data;
  const saved = view ? draftOf(view.values) : null;
  const draft = edited ?? saved;
  const dirty = draft !== null && saved !== null && !sameDraft(draft, saved);
  const checked = view && draft ? settingsFromDraft(draft, view.bounds) : null;
  const problemOf = (field: SettingsField): string | undefined =>
    refused?.fields[field] ??
    (tried
      ? checked?.problems.find((p) => p.field === field)?.message
      : undefined);
  const standard = view ? draftOf(view.defaults) : null;
  const isStandard =
    draft !== null && standard !== null && sameDraft(draft, standard);

  async function save() {
    if (!view || !draft || !checked) return;
    setTried(true);
    setRefused(null);
    if (!checked.values) return;
    setBusy(true);
    try {
      await gateway.saveReminderSettings(checked.values);
      setEdited(null);
      setTried(false);
      loaded.reload();
      toast.push({ title: "Interview reminders saved", tone: "success" });
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const fields: Partial<Record<SettingsField, string>> = {};
        let general: string | null = null;
        for (const detail of error.fieldErrors) {
          const field = fieldOfPath(detail.field);
          if (field) fields[field] = fields[field] ?? detail.message;
          else general = general ?? detail.message;
        }
        setRefused({ fields, general });
      } else {
        setRefused({
          fields: {},
          general:
            error instanceof ApiError
              ? error.message
              : "Something went wrong. Try again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  const update = (next: SettingsDraft) => {
    setEdited(next);
    setRefused(null);
  };

  return (
    <HiringSettingsShell
      active="/hiring/settings/interviews"
      title="Interview reminders"
      description={`The company's defaults for reminding people about an interview, and for chasing a scorecard. A reminder goes only for an interview where you chose to send the invitation, and nothing here sends anything by itself.${gateway.mode === "api" ? " Changes are written to the audit log." : ""}${DEMO_ENABLED && gateway.mode === "demo" ? " This is a practice workspace: nothing is sent, and these choices stay in this browser." : ""}`}
    >
      {loaded.loading ? (
        <>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only-focusable">Loading the reminders</span>
        </>
      ) : loaded.error ? (
        <LoadFailure
          subject="interview reminders"
          error={loaded.error}
          onRetry={loaded.reload}
          missingMeans="module"
        />
      ) : !view || !draft ? (
        <Card>
          <CardBody>
            <p className="text-body-sm text-body">
              This server does not keep reminder settings yet, so there is
              nothing to change here.
            </p>
          </CardBody>
        </Card>
      ) : (
        <>
          {view.willSend === false && (
            <Callout tone="warning" title="No reminder would be sent right now">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {view.blockedBy.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2">
                Each one is recorded as skipped, with the reason, instead of
                being sent.
              </p>
            </Callout>
          )}

          {refused?.general && (
            <Callout tone="danger" title="The reminders were not saved">
              {refused.general}
            </Callout>
          )}

          <p className="text-body-sm text-muted">
            What you choose here is used when an invitation is sent. Reminders
            already planned keep their times. One you switch off is not sent
            when its time comes.
          </p>

          {SECTIONS.map((section) => (
            <Card key={section.title}>
              <CardHeader title={section.title} />
              <CardBody className="flex flex-col gap-6">
                {section.slots.map((slot) => (
                  <Before
                    key={slot.key}
                    slot={slot}
                    box={draft[slot.key]}
                    view={view}
                    error={problemOf(slot.field)}
                    disabled={busy}
                    onChange={(next) => update({ ...draft, [slot.key]: next })}
                  />
                ))}
              </CardBody>
            </Card>
          ))}

          <Card>
            <CardHeader title="Scorecard nudges" />
            <CardBody className="flex flex-col gap-5">
              <Switch
                label="Nudge a panelist whose scorecard is not in"
                description={`${ONLY_AFTER_INVITATION} A nudge is not sent once the scorecard is in.`}
                checked={draft.nudge.enabled}
                disabled={busy}
                onChange={(event) =>
                  update({
                    ...draft,
                    nudge: {
                      ...draft.nudge,
                      enabled: event.currentTarget.checked,
                    },
                  })
                }
              />
              <div className="max-w-xs">
                <Field
                  label="First nudge, hours after the interview ends"
                  {...(problemOf("nudge.first")
                    ? { error: problemOf("nudge.first") as string }
                    : {})}
                >
                  <Input
                    inputMode="numeric"
                    suffix="hours"
                    value={draft.nudge.first}
                    disabled={busy}
                    onChange={(event) =>
                      update({
                        ...draft,
                        nudge: {
                          ...draft.nudge,
                          first: event.currentTarget.value,
                        },
                      })
                    }
                  />
                </Field>
                <p className="mt-1.5 text-meta text-muted">
                  From {hoursWords(view.bounds.nudgeFirstHours.min)} to{" "}
                  {hoursWords(view.bounds.nudgeFirstHours.max)}.
                </p>
              </div>
              <Switch
                label="A second nudge"
                description="If the scorecard is still not in."
                checked={draft.nudge.secondOn}
                disabled={busy}
                onChange={(event) =>
                  update({
                    ...draft,
                    nudge: {
                      ...draft.nudge,
                      secondOn: event.currentTarget.checked,
                    },
                  })
                }
              />
              {draft.nudge.secondOn && (
                <div className="max-w-xs">
                  <Field
                    label="Second nudge, hours after the interview ends"
                    {...(problemOf("nudge.second")
                      ? { error: problemOf("nudge.second") as string }
                      : {})}
                  >
                    <Input
                      inputMode="numeric"
                      suffix="hours"
                      value={draft.nudge.second}
                      disabled={busy}
                      onChange={(event) =>
                        update({
                          ...draft,
                          nudge: {
                            ...draft.nudge,
                            second: event.currentTarget.value,
                          },
                        })
                      }
                    />
                  </Field>
                  <p className="mt-1.5 text-meta text-muted">
                    After the first, and at most{" "}
                    {hoursWords(view.bounds.nudgeSecondHours.max)}.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>

          {view.usage && (
            <Card>
              <CardHeader title="Sending today" />
              <CardBody className="flex flex-col gap-1.5 text-body-sm text-body">
                <p>
                  {view.usage.sentLast24Hours.toLocaleString()} of{" "}
                  {view.usage.dailyLimit.toLocaleString()} emails to candidates
                  and panelists were sent in the last 24 hours. That is the most
                  your company may send in a day.
                </p>
                <p>
                  {view.usage.waiting.toLocaleString()} waiting to go,{" "}
                  {view.usage.remindersPlanned.toLocaleString()} of them
                  reminders planned for a time that has not come.
                  {view.usage.dueNow > 0
                    ? ` ${view.usage.dueNow.toLocaleString()} are due now and held back, by the daily limit or because mail is down.`
                    : ""}
                </p>
              </CardBody>
            </Card>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="accent"
              loading={busy}
              disabled={!dirty}
              onClick={() => void save()}
            >
              Save reminders
            </Button>
            <Button
              variant="ghost"
              disabled={!dirty || busy}
              onClick={() => {
                setEdited(null);
                setTried(false);
                setRefused(null);
              }}
            >
              Discard changes
            </Button>
            {!isStandard && standard && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  update(standard);
                  setTried(false);
                }}
              >
                Use the standard times
              </Button>
            )}
            {dirty && (
              <span className="text-body-sm text-muted">Unsaved changes</span>
            )}
          </div>
        </>
      )}
    </HiringSettingsShell>
  );
}
