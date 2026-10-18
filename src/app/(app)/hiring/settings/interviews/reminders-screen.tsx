"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Skeleton,
  Switch,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { ApiError } from "@/lib/api/client";
import { useInterviewsGateway } from "@/lib/hiring/interviews/use-interviews";
import {
  KIND_LINE,
  KIND_TITLE,
  settingsProblems,
  type ReminderKind,
  type ReminderSettings,
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
 * here, and one interview can be taken off the list on its own card.
 *
 * ## Saved on purpose, checked against the server's own limits
 *
 * A change is a button, not a keystroke: what is typed is checked against the limits the
 * server gave (the hours, the most nudges) and put under its box before anything is
 * sent, and a refusal from the server lands under the same box with what was typed kept.
 */

type Draft = {
  enabled: Record<string, boolean>;
  hours: Record<string, string>;
  max: string;
};

const draftOf = (settings: ReminderSettings): Draft => ({
  enabled: Object.fromEntries(settings.rules.map((r) => [r.kind, r.enabled])),
  hours: Object.fromEntries(
    settings.rules.map((r) => [r.kind, String(r.hours)]),
  ),
  max: String(settings.nudges.max),
});

/** What is typed, as settings. A box that is not a number is `NaN`, which fails the bounds. */
const settingsOf = (
  base: ReminderSettings,
  draft: Draft,
): ReminderSettings => ({
  rules: base.rules.map((rule) => ({
    ...rule,
    enabled: draft.enabled[rule.kind] ?? rule.enabled,
    hours:
      draft.hours[rule.kind]?.trim() === ""
        ? NaN
        : Number(draft.hours[rule.kind]),
  })),
  nudges: {
    ...base.nudges,
    max: draft.max.trim() === "" ? NaN : Number(draft.max),
  },
});

const same = (a: Draft, b: Draft): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

const ORDER: ReminderKind[] = [
  "CANDIDATE_EARLY",
  "CANDIDATE_FINAL",
  "PANELIST",
  "SCORECARD_NUDGE",
];

export function InterviewRemindersScreen() {
  const gateway = useInterviewsGateway();
  const toast = useToast();
  const loaded = useLoaded(
    `reminder-settings-page:${gateway.mode}`,
    true,
    (signal) => gateway.reminderSettings(signal),
  );
  const [edited, setEdited] = useState<Draft | null>(null);
  const [tried, setTried] = useState(false);
  const [refused, setRefused] = useState<{
    fields: Record<string, string>;
    general: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const base = loaded.data;
  const saved = base ? draftOf(base) : null;
  const draft = edited ?? saved;
  const dirty = draft !== null && saved !== null && !same(draft, saved);
  const problems =
    base && draft ? settingsProblems(settingsOf(base, draft)) : [];
  const problemOf = (field: string): string | undefined => {
    const found =
      refused?.fields[field] ??
      (tried ? problems.find((p) => p.field === field)?.message : undefined);
    return found;
  };

  async function save() {
    if (!base || !draft) return;
    setTried(true);
    setRefused(null);
    if (problems.length > 0) return;
    setBusy(true);
    try {
      await gateway.saveReminderSettings(settingsOf(base, draft));
      setEdited(null);
      setTried(false);
      loaded.reload();
      toast.push({ title: "Interview reminders saved", tone: "success" });
    } catch (error) {
      if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const fields: Record<string, string> = {};
        let general: string | null = null;
        for (const detail of error.fieldErrors) {
          const kind =
            ORDER.find((k) => detail.field.includes(k)) ??
            (/nudge/i.test(detail.field) ? "nudges" : null);
          if (kind) fields[kind] = fields[kind] ?? detail.message;
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

  return (
    <HiringSettingsShell
      active="/hiring/settings/interviews"
      title="Interview reminders"
      description={`The company's defaults for reminding people about an interview, and for chasing a scorecard. A reminder goes only for an interview where you chose to send the invitation, and nothing here sends anything by itself.${gateway.mode === "api" ? " Changes are written to the audit log." : ""}`}
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
      ) : !base || !draft ? (
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
          {refused?.general && (
            <Callout tone="danger" title="The reminders were not saved">
              {refused.general}
            </Callout>
          )}

          {ORDER.map((kind) => {
            const rule = base.rules.find((r) => r.kind === kind);
            if (!rule) return null;
            const after = kind === "SCORECARD_NUDGE";
            const error = problemOf(kind);
            return (
              <Card key={kind}>
                <CardHeader title={KIND_TITLE[kind]} />
                <CardBody className="flex flex-col gap-4">
                  <Switch
                    label={after ? "Nudge for the scorecard" : "Send it"}
                    description={KIND_LINE[kind]}
                    checked={draft.enabled[kind] ?? false}
                    disabled={busy}
                    onChange={(event) =>
                      setEdited({
                        ...draft,
                        enabled: {
                          ...draft.enabled,
                          [kind]: event.target.checked,
                        },
                      })
                    }
                  />
                  <div className="max-w-xs">
                    <Field
                      label={
                        after
                          ? "Hours after the interview"
                          : "Hours before the interview"
                      }
                      {...(error ? { error } : {})}
                    >
                      <Input
                        inputMode="numeric"
                        suffix="hours"
                        value={draft.hours[kind] ?? ""}
                        disabled={busy}
                        onChange={(event) =>
                          setEdited({
                            ...draft,
                            hours: {
                              ...draft.hours,
                              [kind]: event.target.value,
                            },
                          })
                        }
                      />
                    </Field>
                    <p className="mt-1.5 text-meta text-muted">
                      From {String(rule.bounds.min)} to{" "}
                      {String(rule.bounds.max)} hours.
                    </p>
                  </div>
                  {after && (
                    <div className="max-w-xs">
                      <Field
                        label="Most nudges for one interview"
                        {...(problemOf("nudges")
                          ? { error: problemOf("nudges") as string }
                          : {})}
                      >
                        <Input
                          inputMode="numeric"
                          value={draft.max}
                          disabled={busy}
                          onChange={(event) =>
                            setEdited({ ...draft, max: event.target.value })
                          }
                        />
                      </Field>
                      <p className="mt-1.5 text-meta text-muted">
                        From {String(base.nudges.bounds.min)} to{" "}
                        {String(base.nudges.bounds.max)}. A nudge goes each time
                        this many hours more have passed, until the scorecard is
                        in or this many have gone.
                      </p>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}

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
            {dirty && (
              <span className="text-body-sm text-muted">Unsaved changes</span>
            )}
          </div>
        </>
      )}
    </HiringSettingsShell>
  );
}
