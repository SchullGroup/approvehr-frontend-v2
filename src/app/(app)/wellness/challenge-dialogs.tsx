"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Badge,
  Button,
  Field,
  FieldRow,
  Input,
  LoadState,
  Modal,
  Select,
  Stat,
  StatGrid,
  TBody,
  TD,
  TH,
  THead,
  TR,
  TableWrap,
  Textarea,
  useToast,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  MAX_CHALLENGE_DAYS,
  METRIC_LABEL,
  MODE_LABEL,
  consentRequired,
  consentStale,
  type ApiChallenge,
  type ApiIndividualBoard,
  type ApiIndividualResults,
  type ApiTeamBoard,
  type ApiTeamResults,
  type ChallengeMode,
  type WellnessMetric,
} from "@/lib/api/wellness";
import { addDays, daysBetween } from "@/lib/projects/dates";
import {
  useChallengeBoard,
  useChallengeDetail,
  useChallengeResults,
  useMyConsents,
  useWellnessActions,
} from "@/lib/store/wellness";
import { useToday } from "@/lib/use-today";
import { amountText, lastAllowedEnd, windowText } from "@/lib/wellness/format";

/**
 * The dialogs a challenge opens: join, board, results, edit and create.
 *
 * ## Joining is a consent of its own
 *
 * Tracking consent is per purpose and joining is a second, specific agreement,
 * so the dialog shows the API's own statement for this mode and the floor in
 * force, in full, and sends back the wording version it showed. The statement is
 * not a banner to be shortened: it says what everybody who joins sees, what an
 * employer can come to see and that a manager or HR who joins an individual
 * challenge sees its board. That is the promise, and it is only as good as its
 * words.
 *
 * ## Two audiences, two different dialogs, and no person in the second
 *
 * A **board** is for people who joined and shows them each other. **Results**
 * are for whoever runs the programme and are counts and totals, above a floor,
 * with nothing shaped like a person: no name, no list, no single figure. A role
 * never opens a board, and a board never opens for a role.
 */

const failure = (error: unknown): string =>
  error instanceof ApiError
    ? error.message
    : "Something went wrong. Try again.";

/* -------------------------------------------------------------------- join */

export function JoinDialog({
  challenge,
  onClose,
  onJoined,
}: {
  challenge: ApiChallenge;
  onClose: () => void;
  onJoined: () => void;
}) {
  const detail = useChallengeDetail(challenge.id);
  const consents = useMyConsents();
  const actions = useWellnessActions();
  const toast = useToast();
  const [teamId, setTeamId] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const d = detail.data;
  const trackingOn =
    consents.data?.consents.some(
      (consent) => consent.purpose === "SELF_TRACKING" && consent.granted,
    ) ?? false;
  const teams = d?.myTeams ?? [];
  const isTeam = d?.mode === "TEAM";
  const ready =
    d !== null &&
    trackingOn &&
    (!isTeam || (teams.length > 0 && teamId !== ""));

  const join = async () => {
    if (!d) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.joinChallenge(
        challenge.id,
        d.consentVersion,
        isTeam ? teamId : undefined,
      );
      toast.push({ tone: "success", title: `You joined ${challenge.title}` });
      onJoined();
    } catch (error) {
      if (consentStale(error)) {
        toast.push({
          tone: "info",
          title: "The wording changed",
          detail: "Read it again before you join.",
        });
        detail.reload();
      } else {
        setProblem(failure(error));
        if (consentRequired(error)) consents.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Join ${challenge.title}`}
      description={`${METRIC_LABEL[challenge.metric]}, ${MODE_LABEL[challenge.mode].toLowerCase()}, ${windowText(challenge.startsOn, challenge.endsOn)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready}
            onClick={() => void join()}
          >
            Join challenge
          </Button>
        </>
      }
    >
      <LoadState
        loading={detail.loading || consents.loading}
        error={detail.error ?? consents.error}
        onRetry={() => {
          detail.reload();
          consents.reload();
        }}
        hasData={d !== null && consents.data !== null}
        subject="this challenge"
        skeleton="detail"
      >
        {d && (
          <div className="flex flex-col gap-4">
            <p className="text-body-sm leading-relaxed text-body">
              {d.joinStatement}
            </p>

            {isTeam &&
              (teams.length === 0 ? (
                <p className="text-body-sm text-muted">
                  You are not on a team, so you cannot join this one.
                </p>
              ) : (
                <Field
                  label="The team you compete for"
                  help="You name it every time, and it cannot be changed after you join."
                >
                  <Select
                    value={teamId}
                    placeholder="Choose your team"
                    onChange={(event) => setTeamId(event.target.value)}
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}, {team.members}{" "}
                        {team.members === 1 ? "person" : "people"}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}

            {!trackingOn && (
              <p className="text-body-sm text-muted">
                Turn on tracking first.{" "}
                <Link
                  href="/wellness"
                  className="font-medium text-accent-text underline underline-offset-2"
                >
                  Go to Overview
                </Link>
              </p>
            )}

            {problem && (
              <p role="alert" className="text-body-sm text-danger-text">
                {problem}
              </p>
            )}
          </div>
        )}
      </LoadState>
    </Modal>
  );
}

/* ------------------------------------------------------------------- board */

export function BoardDialog({
  challenge,
  onClose,
}: {
  challenge: ApiChallenge;
  onClose: () => void;
}) {
  const board = useChallengeBoard(challenge.id);
  const b = board.data;

  return (
    <Modal
      open
      onClose={onClose}
      title={challenge.title}
      description={`${METRIC_LABEL[challenge.metric]}, ${windowText(challenge.startsOn, challenge.endsOn)}`}
      size="md"
    >
      <LoadState
        loading={board.loading}
        error={board.error}
        onRetry={board.reload}
        hasData={b !== null}
        subject="the board"
        skeleton="list"
      >
        {b &&
          (b.mode === "INDIVIDUAL" ? (
            <IndividualBoard board={b} />
          ) : (
            <TeamBoard board={b} />
          ))}
      </LoadState>
    </Modal>
  );
}

function IndividualBoard({ board }: { board: ApiIndividualBoard }) {
  const listed = board.entries.some((entry) => entry.mine);
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body-sm text-muted">
        {board.participants} taking part
        <InfoTooltip
          id="wellness-board-who"
          label="Who sees this board"
          text="Only people who joined this challenge see it, and they agreed to appear to each other. Leave and you disappear from it."
        />
      </p>
      <TableWrap caption="Board">
        <THead>
          <TH className="w-16">Rank</TH>
          <TH>Name</TH>
          <TH align="right">{METRIC_LABEL[board.metric]}</TH>
        </THead>
        <TBody>
          {board.entries.map((entry) => (
            <TR key={`${String(entry.rank)}-${entry.name}`}>
              <TD className="tabular text-muted">{entry.rank}</TD>
              <TD className="font-medium text-ink">
                {entry.name}
                {entry.mine && (
                  <Badge tone="accent" size="sm" className="ml-2">
                    You
                  </Badge>
                )}
              </TD>
              <TD align="right" className="tabular">
                {amountText(board.metric, entry.total)}
              </TD>
            </TR>
          ))}
        </TBody>
      </TableWrap>
      {!listed && (
        <p className="text-body-sm text-muted">
          You are ranked {board.me.rank}, with{" "}
          {amountText(board.metric, board.me.total)}.
        </p>
      )}
    </div>
  );
}

function TeamBoard({ board }: { board: ApiTeamBoard }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body-sm text-muted">
        Your total, {amountText(board.metric, board.mine.total)}
        <InfoTooltip
          id="wellness-team-board"
          label="About this board"
          text={`Teams appear once at least ${String(board.floor)} of their members have joined and logged something. Nobody is shown anyone else's own number.`}
        />
      </p>
      <TableWrap caption="Team board">
        <THead>
          <TH>Team</TH>
          <TH align="right">Taking part</TH>
          <TH align="right">Total</TH>
          <TH align="right">Average</TH>
        </THead>
        <TBody>
          {board.teams.map((team) => (
            <TR key={team.teamId}>
              <TD className="font-medium text-ink">
                {team.name}
                {team.mine && (
                  <Badge tone="accent" size="sm" className="ml-2">
                    Your team
                  </Badge>
                )}
              </TD>
              {team.withheld ? (
                <TD colSpan={3} className="text-muted">
                  {team.note}
                </TD>
              ) : (
                <>
                  <TD align="right" className="tabular">
                    {team.participants}
                  </TD>
                  <TD align="right" className="tabular">
                    {amountText(board.metric, team.total)}
                  </TD>
                  <TD align="right" className="tabular">
                    {amountText(board.metric, team.average)}
                  </TD>
                </>
              )}
            </TR>
          ))}
        </TBody>
      </TableWrap>
    </div>
  );
}

/* ----------------------------------------------------------------- results */

export function ResultsDialog({
  challenge,
  onClose,
}: {
  challenge: ApiChallenge;
  onClose: () => void;
}) {
  const results = useChallengeResults(challenge.id);
  const r = results.data;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Results, ${challenge.title}`}
      description={`${METRIC_LABEL[challenge.metric]}, ${MODE_LABEL[challenge.mode].toLowerCase()}, ${windowText(challenge.startsOn, challenge.endsOn)}`}
      size="lg"
    >
      <LoadState
        loading={results.loading}
        error={results.error}
        onRetry={results.reload}
        hasData={r !== null}
        subject="the results"
        skeleton="detail"
      >
        {r && (
          <div className="flex flex-col gap-4">
            <p className="flex items-center gap-2 text-body-sm text-muted">
              Counts and totals only, shown from {r.floor} people.
              <InfoTooltip
                id="wellness-results-rule"
                label="About these results"
                text="Nobody's own figures are ever shown here. A number appears once enough people have joined, and a total only once enough have logged something and a week after the challenge ends."
              />
            </p>
            {r.participation === null ? (
              <TeamResults results={r} metric={challenge.metric} />
            ) : (
              <IndividualResults results={r} metric={challenge.metric} />
            )}
          </div>
        )}
      </LoadState>
    </Modal>
  );
}

const heldBack = <span className="text-muted">Held back</span>;
const notYet = <span className="text-muted">Not yet</span>;

function IndividualResults({
  results,
  metric,
}: {
  results: ApiIndividualResults;
  metric: WellnessMetric;
}) {
  const { participation, totals } = results;
  const figure = (value: number | null): React.ReactNode =>
    !totals.released
      ? notYet
      : totals.withheld || value === null
        ? heldBack
        : amountText(metric, value);

  return (
    <StatGrid columns={3}>
      <Stat
        label="Taking part"
        value={
          participation.withheld
            ? heldBack
            : participation.participants.toLocaleString("en-NG")
        }
        {...(participation.withheld ? { hint: participation.note } : {})}
      />
      <Stat
        label="Total"
        value={figure(totals.total)}
        {...(totals.note ? { hint: totals.note } : {})}
      />
      <Stat label="Average per person" value={figure(totals.average)} />
    </StatGrid>
  );
}

function TeamResults({
  results,
  metric,
}: {
  results: ApiTeamResults;
  metric: WellnessMetric;
}) {
  const { totals } = results;
  const cell = (value: number | null, withheld: boolean): React.ReactNode =>
    !totals.released
      ? notYet
      : withheld || value === null
        ? heldBack
        : amountText(metric, value);

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
        Teams
        <InfoTooltip
          id="wellness-team-results"
          label="About team results"
          text={totals.note}
        />
      </p>
      {totals.teams.length === 0 ? (
        <p className="text-body-sm text-muted">No team is shown yet.</p>
      ) : (
        <TableWrap caption="Team results">
          <THead>
            <TH>Team</TH>
            <TH align="right">Taking part</TH>
            <TH align="right">Total</TH>
            <TH align="right">Average</TH>
          </THead>
          <TBody>
            {totals.teams.map((team) => (
              <TR key={team.teamId}>
                <TD className="font-medium text-ink">{team.name}</TD>
                <TD align="right" className="tabular">
                  {team.participants}
                </TD>
                <TD align="right" className="tabular">
                  {cell(team.total, team.withheld)}
                </TD>
                <TD align="right" className="tabular">
                  {cell(team.average, team.withheld)}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- edit */

export function EditChallengeDialog({
  challenge,
  onClose,
  onSaved,
}: {
  challenge: ApiChallenge;
  onClose: () => void;
  onSaved: () => void;
}) {
  const actions = useWellnessActions();
  const [title, setTitle] = useState(challenge.title);
  const [description, setDescription] = useState(challenge.description ?? "");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const titleProblem =
    title.trim() === ""
      ? "Give it a name."
      : title.trim().length > 80
        ? "A name is at most 80 characters."
        : null;
  const descriptionProblem =
    description.trim().length > 500
      ? "A description is at most 500 characters."
      : null;
  const changed =
    title.trim() !== challenge.title ||
    description.trim() !== (challenge.description ?? "");

  const save = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await actions.updateChallenge(challenge.id, {
        ...(title.trim() !== challenge.title ? { title: title.trim() } : {}),
        ...(description.trim() !== (challenge.description ?? "")
          ? {
              description:
                description.trim() === "" ? null : description.trim(),
            }
          : {}),
      });
      onSaved();
    } catch (error) {
      setProblem(failure(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit challenge"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={
              !changed || titleProblem !== null || descriptionProblem !== null
            }
            onClick={() => void save()}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Name"
          required
          {...(titleProblem && title !== challenge.title
            ? { error: titleProblem }
            : {})}
        >
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field
          label="Description"
          optional
          help="The dates, the measure and the mode cannot change once people may have joined. Cancel it and start a new one for that."
          {...(descriptionProblem ? { error: descriptionProblem } : {})}
        >
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ create */

export function CreateChallengeDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const today = useToday();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<WellnessMetric>("STEPS");
  const [mode, setMode] = useState<ChallengeMode>("INDIVIDUAL");
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(addDays(today, 6));
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const span = (daysBetween(startsOn, endsOn) ?? 0) + 1;
  const problems = {
    title:
      title.trim() === ""
        ? "Give it a name."
        : title.trim().length > 80
          ? "A name is at most 80 characters."
          : null,
    description:
      description.trim().length > 500
        ? "A description is at most 500 characters."
        : null,
    startsOn:
      startsOn === ""
        ? "Choose a start day."
        : startsOn < today
          ? "A challenge cannot start in the past."
          : null,
    endsOn:
      endsOn === ""
        ? "Choose an end day."
        : endsOn < startsOn
          ? "It cannot end before it starts."
          : span > MAX_CHALLENGE_DAYS
            ? `It can run for at most ${String(MAX_CHALLENGE_DAYS)} days.`
            : null,
  };
  const invalid = Object.values(problems).some((p) => p !== null);

  const create = async () => {
    setShown(true);
    if (invalid) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.createChallenge({
        title: title.trim(),
        ...(description.trim() !== ""
          ? { description: description.trim() }
          : {}),
        metric,
        mode,
        startsOn,
        endsOn,
      });
      toast.push({ tone: "success", title: "Challenge created" });
      onCreated();
    } catch (error) {
      setProblem(failure(error));
    } finally {
      setBusy(false);
    }
  };

  const show = (key: keyof typeof problems) =>
    shown && problems[key] ? { error: problems[key] as string } : {};

  return (
    <Modal
      open
      onClose={onClose}
      title="New challenge"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="accent" loading={busy} onClick={() => void create()}>
            Create challenge
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <Field label="Name" required {...show("title")}>
          <Input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Description" optional {...show("description")}>
          <Textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <FieldRow>
          <Field label="Measure">
            <Select
              value={metric}
              onChange={(e) => setMetric(e.target.value as WellnessMetric)}
            >
              <option value="STEPS">{METRIC_LABEL.STEPS}</option>
              <option value="WATER_ML">{METRIC_LABEL.WATER_ML}</option>
            </Select>
          </Field>
          <Field
            label="Mode"
            help="Individual shows a board of the people who joined. In teams, people compete for a team of theirs and nobody is shown anyone else's own number."
          >
            <Select
              value={mode}
              onChange={(e) => setMode(e.target.value as ChallengeMode)}
            >
              <option value="INDIVIDUAL">{MODE_LABEL.INDIVIDUAL}</option>
              <option value="TEAM">{MODE_LABEL.TEAM}</option>
            </Select>
          </Field>
        </FieldRow>
        <FieldRow>
          <Field label="Starts on" required {...show("startsOn")}>
            <Input
              type="date"
              value={startsOn}
              min={today}
              onChange={(e) => setStartsOn(e.target.value)}
            />
          </Field>
          <Field
            label="Ends on"
            required
            help="It starts today or later and runs at most 90 days. The dates cannot be moved afterwards."
            {...show("endsOn")}
          >
            <Input
              type="date"
              value={endsOn}
              min={startsOn}
              max={
                startsOn
                  ? lastAllowedEnd(startsOn, MAX_CHALLENGE_DAYS)
                  : undefined
              }
              onChange={(e) => setEndsOn(e.target.value)}
            />
          </Field>
        </FieldRow>
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </form>
    </Modal>
  );
}
