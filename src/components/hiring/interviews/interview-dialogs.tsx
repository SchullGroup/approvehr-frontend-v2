"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  FieldRow,
  Input,
  Modal,
  Select,
  TextLink,
  Textarea,
} from "@/components/ui";
import { PeopleEditor, type Person } from "@/components/hiring/people-editor";
import { ApiError } from "@/lib/api/client";
import {
  INTERVIEW_KIND_LABEL,
  type InterviewKind,
} from "@/lib/api/recruitment";
import type { EmailReadiness } from "@/lib/hiring/comms/model";
import { splitSeats } from "@/lib/hiring/comms/seats";
import type { CalendarFile } from "@/lib/hiring/interviews/gateway";
import {
  JOIN_LINK_HINT,
  cleanJoinLink,
  joinLinkProblem,
  joinLinkProvider,
} from "@/lib/hiring/interviews/join-link";
import type {
  CancelInput,
  ChangeInput,
  ChangeResult,
  InterviewView,
  InviteExplainer,
  ScheduleInput,
} from "@/lib/hiring/interviews/model";
import {
  candidateIsTold,
  describeChanges,
  outcomeHeadline,
  outcomeLines,
  senderLine,
} from "@/lib/hiring/interviews/words";
import { replanSentence } from "@/lib/hiring/interviews/reminders";
import {
  formatWeekdayTime,
  instantFromWall,
  wallClockIn,
  zoneLabel,
} from "@/lib/time";
import { CalendarMenu } from "./calendar-menu";
import { SendChoice } from "./send-choice";
import { WhatTheyWillSee, WhenFields } from "./when-fields";

/**
 * Booking, changing and cancelling an interview.
 *
 * Three dialogs with one shape: say what is changing, ask whether to send the message
 * about it (**Don't send** is what is selected on opening), do it, and then say what the
 * API said about each message in plain words. They never say a message went out unless
 * the API says it did; `words.ts` is the one place that decides what a status is called.
 *
 * A refusal is shown where the person is looking: under the box it is about when the
 * API names one, and as one sentence at the top otherwise, with what they typed kept.
 */

/* ---------------------------------------------------------------- refusals */

type Refusal = {
  /** Sentences under boxes, keyed by what the box is. */
  fields: Partial<
    Record<"when" | "duration" | "joinUrl" | "location" | "reason", string>
  >;
  /** A sentence about the whole thing, or `null` when every message has a box. */
  general: string | null;
};

const BOX_OF: Record<string, keyof Refusal["fields"]> = {
  scheduledFor: "when",
  date: "when",
  time: "when",
  durationMins: "duration",
  duration: "duration",
  joinUrl: "joinUrl",
  joinLink: "joinUrl",
  join_url: "joinUrl",
  location: "location",
  reason: "reason",
};

/** The API's refusal, sorted onto the boxes it names. Anything else is said once. */
export function refusalOf(error: unknown): Refusal {
  if (!(error instanceof ApiError))
    return { fields: {}, general: "Something went wrong. Try again." };
  const fields: Refusal["fields"] = {};
  let unplaced = false;
  for (const detail of error.fieldErrors) {
    const box = BOX_OF[detail.field];
    if (box) fields[box] = fields[box] ?? detail.message;
    else unplaced = true;
  }
  const placed = Object.keys(fields).length > 0;
  return {
    fields,
    general: placed && !unplaced ? null : error.message,
  };
}

const kinds = Object.keys(INTERVIEW_KIND_LABEL) as InterviewKind[];
const KIND_LABEL = (kind: string): string =>
  INTERVIEW_KIND_LABEL[kind as InterviewKind] ?? kind;

/* ------------------------------------------------------------ the result view */

function Outcome({
  result,
  done,
  getFile,
}: {
  result: ChangeResult;
  done: "booked" | "updated" | "cancelled" | "invited";
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
}) {
  const headline = outcomeHeadline(result.outcome, done);
  const lines = outcomeLines(result.outcome);
  /* What the change did to the reminders, once the API has said. */
  const replan =
    done === "updated" || done === "cancelled"
      ? replanSentence(
          done === "updated" ? "rescheduled" : "cancelled",
          result.outcome.reminders ?? null,
        )
      : null;
  return (
    <div className="flex flex-col gap-3">
      <Callout
        tone={headline.tone}
        title={
          headline.tone === "success"
            ? "Done"
            : headline.tone === "info"
              ? "Done, with messages waiting"
              : "Done, with a note"
        }
      >
        {headline.text}
      </Callout>
      {lines.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-body-sm text-body">
          {lines.map((line) => (
            <li key={line.text}>{line.text}</li>
          ))}
        </ul>
      )}
      {replan && <p className="text-body-sm text-body">{replan}</p>}
      {done !== "cancelled" && (
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-body-sm text-muted">
            Add it to your own calendar:
          </p>
          <CalendarMenu
            interview={result.interview}
            who="staff"
            getFile={() => getFile(result.interview)}
          />
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ schedule */

export function ScheduleInterviewDialog({
  open,
  onClose,
  onConfirm,
  getFile,
  candidateName,
  timeZone,
  now,
  stagePanel,
  people,
  peopleLoading,
  panelSupported,
  readiness,
  explainer,
}: {
  open: boolean;
  onClose: () => void;
  /** Rejects with the API's refusal. */
  onConfirm: (input: ScheduleInput) => Promise<ChangeResult>;
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
  candidateName: string;
  /** The company's zone: the time typed here is on this clock. */
  timeZone: string;
  /** The time right now, as an ISO instant. */
  now: string;
  /** The panel of the stage they are in, when it is an interview stage with one. */
  stagePanel: Person[] | null;
  people: Person[];
  peopleLoading: boolean;
  /** Whether this server knows about panels and emails at all. */
  panelSupported: boolean;
  readiness: EmailReadiness | null;
  explainer: InviteExplainer | null;
}) {
  const [kind, setKind] = useState<InterviewKind>("SCREEN");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [joinUrl, setJoinUrl] = useState("");
  const [location, setLocation] = useState("");
  /* `null` is "whoever is on the stage's panel now", which the API works out; a
     list is people somebody picked for this one interview. */
  const [chosen, setChosen] = useState<Person[] | null>(null);
  const [send, setSend] = useState(false);
  const [tried, setTried] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [result, setResult] = useState<ChangeResult | null>(null);
  const [wasOpen, setWasOpen] = useState(false);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind("SCREEN");
      setDay("");
      setTime("");
      setDuration("60");
      setJoinUrl("");
      setLocation("");
      setChosen(null);
      setSend(false);
      setTried(false);
      setLinkTouched(false);
      setBusy(false);
      setRefusal(null);
      setResult(null);
    }
  }

  const invited = chosen ?? stagePanel ?? [];
  const scheduledFor =
    day && time ? instantFromWall(day, time, timeZone) : null;
  const length = Number(duration);

  const dayProblem = tried && !day ? "Choose a day." : null;
  const timeProblem = !tried
    ? null
    : !time
      ? "Choose a time."
      : day && !scheduledFor
        ? "That time does not exist on your company's clock. Choose another."
        : send && scheduledFor && Date.parse(scheduledFor) < Date.parse(now)
          ? "That time has passed, so an invitation for it would be no use. Choose a later time, or choose Don't send."
          : null;
  const durationProblem =
    tried && (!Number.isInteger(length) || length < 5 || length > 480)
      ? "An interview is 5 to 480 minutes."
      : null;
  const linkProblem = linkTouched || tried ? joinLinkProblem(joinUrl) : null;
  const provider = joinLinkProvider(joinUrl);

  const blocked = Boolean(
    dayProblem || timeProblem || durationProblem || linkProblem,
  );

  async function submit() {
    setTried(true);
    setRefusal(null);
    const pastWhenSending =
      send &&
      scheduledFor !== null &&
      Date.parse(scheduledFor) < Date.parse(now);
    if (
      !day ||
      !time ||
      !scheduledFor ||
      pastWhenSending ||
      !Number.isInteger(length) ||
      length < 5 ||
      length > 480 ||
      joinLinkProblem(joinUrl)
    )
      return;
    setBusy(true);
    try {
      const made = await onConfirm({
        kind,
        scheduledFor,
        timeZone,
        durationMins: length,
        location: location.trim() === "" ? null : location.trim(),
        joinUrl: cleanJoinLink(joinUrl),
        panel: chosen ? splitSeats(chosen.map((p) => p.id)) : null,
        sendInvite: send,
      });
      setResult(made);
    } catch (error) {
      setRefusal(refusalOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={result ? "Interview booked" : "Schedule an interview"}
      description={result ? undefined : `With ${candidateName}.`}
      footer={
        result ? (
          <Button variant="accent" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={tried && blocked}
              onClick={() => void submit()}
            >
              Schedule
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Outcome result={result} done="booked" getFile={getFile} />
      ) : (
        <div className="flex flex-col gap-4">
          {refusal?.general && (
            <Callout tone="danger" title="The interview was not booked">
              {refusal.general}
            </Callout>
          )}

          <FieldRow>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(e) =>
                  setKind(e.currentTarget.value as InterviewKind)
                }
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {INTERVIEW_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Duration (minutes)"
              {...(durationProblem || refusal?.fields.duration
                ? { error: durationProblem ?? refusal?.fields.duration ?? "" }
                : {})}
            >
              <Input
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.currentTarget.value)}
              />
            </Field>
          </FieldRow>

          <WhenFields
            day={day}
            time={time}
            onDay={setDay}
            onTime={setTime}
            timeZone={timeZone}
            dayError={dayProblem}
            timeError={timeProblem ?? refusal?.fields.when}
          />

          <WhatTheyWillSee
            day={day}
            time={time}
            timeZone={timeZone}
            durationMins={
              Number.isInteger(length) && length > 0 ? length : null
            }
            location={location.trim() === "" ? null : location.trim()}
            online={
              cleanJoinLink(joinUrl) !== null && !joinLinkProblem(joinUrl)
            }
          />

          <Field
            label="Join link"
            optional
            {...(linkProblem || refusal?.fields.joinUrl
              ? { error: linkProblem ?? refusal?.fields.joinUrl ?? "" }
              : {})}
          >
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.currentTarget.value)}
              onBlur={() => setLinkTouched(true)}
            />
            <p className="text-meta text-muted">
              {linkProblem || refusal?.fields.joinUrl
                ? null
                : provider
                  ? `This looks like a ${provider} link.`
                  : JOIN_LINK_HINT}
            </p>
          </Field>

          <Field
            label="Location"
            optional
            help="A room or an address, for an interview in person."
            {...(refusal?.fields.location
              ? { error: refusal.fields.location }
              : {})}
          >
            <Input
              value={location}
              maxLength={200}
              onChange={(e) => setLocation(e.currentTarget.value)}
            />
          </Field>

          {panelSupported && (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3">
              <p className="text-body-sm font-medium text-ink">Who scores it</p>
              {chosen === null ? (
                <>
                  <p className="text-body-sm text-muted">
                    {invited.length > 0
                      ? `The stage's panel is invited: ${invited.map((p) => p.name).join(", ")}.`
                      : "Nobody is invited to score it, so anybody who manages hiring can."}
                  </p>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setChosen(stagePanel ?? [])}
                    >
                      Choose who is invited
                    </Button>
                  </div>
                </>
              ) : (
                <PeopleEditor
                  label="Invited to score this interview"
                  empty="Nobody is invited, so anybody who manages hiring can score it."
                  members={chosen}
                  people={people}
                  loading={peopleLoading}
                  addPlaceholder="Invite somebody to score it"
                  onAdd={(person) => setChosen([...chosen, person])}
                  onRemove={(person) =>
                    setChosen(chosen.filter((p) => p.id !== person.id))
                  }
                />
              )}
            </div>
          )}

          {readiness?.supported && (
            <SendChoice
              legend="Tell them about it"
              dontLabel="Don't send"
              dontDescription="Nothing is emailed. The interview is saved, and you can still add it to a calendar yourself."
              sendLabel="Send the invitation with a calendar file"
              sendDescription={`To ${candidateName}${
                invited.length > 0
                  ? `, and a note to ${invited.length === 1 ? "the panelist" : `each of the ${String(invited.length)} panelists`}`
                  : ""
              }.`}
              value={send}
              onChange={setSend}
              readiness={readiness}
              explainer={explainer}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------------- reschedule */

export function RescheduleInterviewDialog({
  open,
  interview,
  onClose,
  onConfirm,
  getFile,
  timeZone: companyZone,
  now,
  readiness,
  explainer,
}: {
  open: boolean;
  /** `null` before anything has been picked: the dialog stays mounted either way. */
  interview: InterviewView | null;
  onClose: () => void;
  /** Rejects with the API's refusal. */
  onConfirm: (input: ChangeInput) => Promise<ChangeResult>;
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
  timeZone: string;
  now: string;
  readiness: EmailReadiness | null;
  explainer: InviteExplainer | null;
}) {
  /* The time is read and written on the clock the interview was booked on, which is
     the company's unless it was booked on another. */
  const timeZone = interview?.timeZone ?? companyZone;
  const [kind, setKind] = useState<InterviewKind>("SCREEN");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("60");
  const [joinUrl, setJoinUrl] = useState("");
  const [location, setLocation] = useState("");
  const [send, setSend] = useState(false);
  const [tried, setTried] = useState(false);
  const [linkTouched, setLinkTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [result, setResult] = useState<ChangeResult | null>(null);

  /* One dialog serves every interview on the record, so the form is re-seeded during
     render whenever a different one is picked or it is opened again: keyed on the id
     and the open flag, not the object, because the list is a fresh array on every
     reload and would otherwise overwrite a draft mid-edit. */
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = open && interview ? interview.id : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (interview && key) {
      const wall = wallClockIn(interview.scheduledFor, timeZone);
      setKind(interview.kind);
      setDay(wall?.day ?? "");
      setTime(wall?.time ?? "");
      setDuration(String(interview.durationMins));
      setJoinUrl(interview.joinUrl ?? "");
      setLocation(interview.location ?? "");
      setSend(false);
      setTried(false);
      setLinkTouched(false);
      setBusy(false);
      setRefusal(null);
      setResult(null);
    }
  }

  const scheduledFor =
    day && time ? instantFromWall(day, time, timeZone) : null;
  const length = Number(duration);
  const next = interview
    ? {
        kind,
        scheduledFor: scheduledFor ?? interview.scheduledFor,
        durationMins:
          Number.isInteger(length) && length > 0
            ? length
            : interview.durationMins,
        location: location.trim() === "" ? null : location.trim(),
        joinUrl: cleanJoinLink(joinUrl),
      }
    : null;
  const changes =
    interview && next
      ? describeChanges(
          interview,
          next,
          (iso) => formatWeekdayTime(iso, timeZone),
          KIND_LABEL,
        )
      : [];

  const timeProblem = !tried
    ? null
    : !day || !time
      ? "Choose a day and a time."
      : !scheduledFor
        ? "That time does not exist on your company's clock. Choose another."
        : send && Date.parse(scheduledFor) < Date.parse(now)
          ? "That time has passed, so an updated invitation for it would be no use. Choose a later time, or choose Don't send."
          : null;
  const durationProblem =
    tried && (!Number.isInteger(length) || length < 5 || length > 480)
      ? "An interview is 5 to 480 minutes."
      : null;
  const linkProblem = linkTouched || tried ? joinLinkProblem(joinUrl) : null;
  const provider = joinLinkProvider(joinUrl);
  const blocked = Boolean(timeProblem || durationProblem || linkProblem);

  const firstEmail =
    interview && !candidateIsTold(interview.notices)
      ? "They have not been sent an invitation for this interview, so what would be sent is the invitation itself, not a change."
      : null;

  async function submit() {
    setTried(true);
    setRefusal(null);
    if (!interview || !next || changes.length === 0) return;
    if (!day || !time || !scheduledFor) return;
    if (send && Date.parse(scheduledFor) < Date.parse(now)) return;
    if (!Number.isInteger(length) || length < 5 || length > 480) return;
    if (joinLinkProblem(joinUrl)) return;

    const input: ChangeInput = { sendUpdate: send };
    if (kind !== interview.kind) input.kind = kind;
    if (next.scheduledFor !== interview.scheduledFor)
      input.scheduledFor = next.scheduledFor;
    if (next.durationMins !== interview.durationMins)
      input.durationMins = next.durationMins;
    if (next.location !== interview.location) input.location = next.location;
    if (next.joinUrl !== interview.joinUrl) input.joinUrl = next.joinUrl;

    setBusy(true);
    try {
      setResult(await onConfirm(input));
    } catch (error) {
      setRefusal(refusalOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={result ? "Interview updated" : "Reschedule this interview"}
      description={
        result || !interview ? undefined : `With ${interview.candidateName}.`
      }
      footer={
        result ? (
          <Button variant="accent" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={
                !interview || changes.length === 0 || (tried && blocked)
              }
              onClick={() => void submit()}
            >
              Save
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Outcome result={result} done="updated" getFile={getFile} />
      ) : (
        <div className="flex flex-col gap-4">
          {refusal?.general && (
            <Callout tone="danger" title="The interview was not changed">
              {refusal.general}
            </Callout>
          )}

          <FieldRow>
            <Field label="Kind">
              <Select
                value={kind}
                onChange={(e) =>
                  setKind(e.currentTarget.value as InterviewKind)
                }
              >
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {INTERVIEW_KIND_LABEL[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Duration (minutes)"
              {...(durationProblem || refusal?.fields.duration
                ? { error: durationProblem ?? refusal?.fields.duration ?? "" }
                : {})}
            >
              <Input
                inputMode="numeric"
                value={duration}
                onChange={(e) => setDuration(e.currentTarget.value)}
              />
            </Field>
          </FieldRow>

          <WhenFields
            day={day}
            time={time}
            onDay={setDay}
            onTime={setTime}
            timeZone={timeZone}
            timeError={timeProblem ?? refusal?.fields.when}
          />

          <Field
            label="Join link"
            optional
            {...(linkProblem || refusal?.fields.joinUrl
              ? { error: linkProblem ?? refusal?.fields.joinUrl ?? "" }
              : {})}
          >
            <Input
              type="url"
              inputMode="url"
              autoComplete="off"
              placeholder="https://"
              value={joinUrl}
              onChange={(e) => setJoinUrl(e.currentTarget.value)}
              onBlur={() => setLinkTouched(true)}
            />
            <p className="text-meta text-muted">
              {linkProblem || refusal?.fields.joinUrl
                ? null
                : provider
                  ? `This looks like a ${provider} link.`
                  : `${JOIN_LINK_HINT}. Clear it if it no longer applies.`}
            </p>
          </Field>

          <Field
            label="Location"
            optional
            help="A room or an address. Clear it if it no longer applies."
            {...(refusal?.fields.location
              ? { error: refusal.fields.location }
              : {})}
          >
            <Input
              value={location}
              maxLength={200}
              onChange={(e) => setLocation(e.currentTarget.value)}
            />
          </Field>

          {interview && changes.length === 0 ? (
            <p className="text-meta text-muted">
              Nothing here differs from what is already booked.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5 rounded-md bg-sunken px-3 py-2 text-body-sm text-body">
              <p className="font-medium text-ink">What changes</p>
              <ul className="flex list-disc flex-col gap-0.5 pl-5">
                {changes.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-meta text-muted">
                Times are on {zoneLabel(timeZone)}.
              </p>
            </div>
          )}

          {readiness?.supported && changes.length > 0 && (
            <SendChoice
              legend="Tell them about the change"
              dontLabel="Don't send"
              dontDescription="Nothing is emailed. The change is saved, and anybody who already has the old time keeps it until you tell them."
              sendLabel="Send an updated invitation"
              sendDescription="A new calendar file replaces the old entry in their calendar."
              value={send}
              onChange={setSend}
              readiness={readiness}
              explainer={explainer}
              firstEmailNote={firstEmail}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------- cancel */

export function CancelInterviewDialog({
  open,
  interview,
  onClose,
  onConfirm,
  getFile,
  timeZone,
  readiness,
  explainer,
  askReason = false,
}: {
  open: boolean;
  interview: InterviewView | null;
  onClose: () => void;
  /** Rejects with the API's refusal. */
  onConfirm: (input: CancelInput) => Promise<ChangeResult>;
  /** Only where the server keeps what is written: otherwise the box would be a promise broken. */
  askReason?: boolean;
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
  timeZone: string;
  readiness: EmailReadiness | null;
  explainer: InviteExplainer | null;
}) {
  const [reason, setReason] = useState("");
  const [send, setSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [result, setResult] = useState<ChangeResult | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = open && interview ? interview.id : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (key) {
      setReason("");
      setSend(false);
      setBusy(false);
      setRefusal(null);
      setResult(null);
    }
  }

  const firstEmail =
    interview && !candidateIsTold(interview.notices)
      ? "They were never sent an invitation for this interview, so a cancellation would tell them nothing: there is nothing for them to cancel."
      : null;

  async function submit() {
    setRefusal(null);
    setBusy(true);
    try {
      setResult(
        await onConfirm({
          reason: reason.trim() === "" ? null : reason.trim(),
          sendCancellation: send,
        }),
      );
    } catch (error) {
      setRefusal(refusalOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={result ? "Interview cancelled" : "Cancel this interview?"}
      description={
        result || !interview
          ? undefined
          : `${KIND_LABEL(interview.kind)} with ${interview.candidateName}, ${formatWeekdayTime(interview.scheduledFor, interview.timeZone ?? timeZone)}.`
      }
      footer={
        result ? (
          <Button variant="accent" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!interview}
              onClick={() => void submit()}
            >
              Cancel the interview
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Outcome result={result} done="cancelled" getFile={getFile} />
      ) : (
        <div className="flex flex-col gap-4">
          {refusal?.general && (
            <Callout tone="danger" title="The interview was not cancelled">
              {refusal.general}
            </Callout>
          )}
          {askReason && (
            <Field
              label="Reason"
              optional
              help="Kept on the interview. It is not put in the email unless the email's own words use it."
              {...(refusal?.fields.reason
                ? { error: refusal.fields.reason }
                : {})}
            >
              <Textarea
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            </Field>
          )}
          {readiness?.supported && (
            <SendChoice
              legend="Tell them it is cancelled"
              dontLabel="Don't send"
              dontDescription="Nothing is emailed. Whoever was told about the interview is not told it is off, so tell them yourself."
              sendLabel="Send a cancellation"
              sendDescription="A cancellation removes the entry from their calendar."
              value={send}
              onChange={setSend}
              readiness={readiness}
              explainer={explainer}
              firstEmailNote={firstEmail}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------- notify */

/**
 * "Send the invitation": for an interview that was booked without one.
 *
 * Nothing about this is a default. It opens only because somebody pressed the button that
 * names it, it says what goes to whom and from whom, and the answer that closes it
 * without sending is the first button.
 */
export function NotifyInterviewDialog({
  open,
  interview,
  onClose,
  onConfirm,
  getFile,
  timeZone,
  readiness,
  explainer,
}: {
  open: boolean;
  interview: InterviewView | null;
  onClose: () => void;
  /** Rejects with the API's refusal. */
  onConfirm: () => Promise<ChangeResult>;
  getFile: (interview: InterviewView) => Promise<CalendarFile>;
  timeZone: string;
  readiness: EmailReadiness | null;
  explainer: InviteExplainer | null;
}) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [result, setResult] = useState<ChangeResult | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const key = open && interview ? interview.id : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    if (key) {
      setBusy(false);
      setRefusal(null);
      setResult(null);
    }
  }

  const sender = readiness?.sender ?? null;
  const reasons = (readiness?.blockedBy ?? []).filter(
    (reason) => !/reply-to/i.test(reason),
  );

  async function submit() {
    setRefusal(null);
    setBusy(true);
    try {
      setResult(await onConfirm());
    } catch (error) {
      setRefusal(refusalOf(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={result ? "Invitation asked for" : "Send the invitation?"}
      description={
        result || !interview
          ? undefined
          : `${KIND_LABEL(interview.kind)} with ${interview.candidateName}, ${formatWeekdayTime(interview.scheduledFor, interview.timeZone ?? timeZone)}.`
      }
      footer={
        result ? (
          <Button variant="accent" onClick={onClose}>
            Close
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Don&apos;t send
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={!interview}
              onClick={() => void submit()}
            >
              Send the invitation with a calendar file
            </Button>
          </>
        )
      }
    >
      {result ? (
        <Outcome result={result} done="invited" getFile={getFile} />
      ) : (
        <div className="flex flex-col gap-3 text-body-sm text-body">
          {refusal?.general && (
            <Callout tone="danger" title="The invitation was not sent">
              {refusal.general}
            </Callout>
          )}
          <p>
            This interview was booked without an invitation, so nobody has been
            told about it by email. Nothing is sent unless you press the button.
          </p>
          {explainer && (
            <div className="flex flex-col gap-1.5">
              <p>
                <span className="font-medium text-ink">The candidate: </span>
                {explainer.candidate}
              </p>
              <p>
                <span className="font-medium text-ink">Each panelist: </span>
                {explainer.panelist}
              </p>
            </div>
          )}
          {sender && (
            <div>
              <p>{senderLine(sender)}</p>
              {!sender.replyTo && (
                <p className="mt-1 text-warning-text">
                  Without one, nothing is sent: an email whose replies go
                  nowhere is not sent.{" "}
                  <TextLink href="/hiring/postings/settings">
                    Add it in Careers settings
                  </TextLink>
                  .
                </p>
              )}
            </div>
          )}
          {reasons.length > 0 && (
            <Callout tone="warning" title="It would not be sent right now">
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2">
                You can still ask. Each message is recorded as skipped, with the
                reason.
              </p>
            </Callout>
          )}
        </div>
      )}
    </Modal>
  );
}
