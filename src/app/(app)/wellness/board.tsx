"use client";

import { Card, CardBody } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import {
  METRIC_LABEL,
  type ApiBoardTeam,
  type ApiIndividualBoard,
  type ApiTeamBoard,
  type ChallengeStatus,
} from "@/lib/api/wellness";
import { cn } from "@/lib/cn";
import {
  Podium,
  RankBadge,
  RankRow,
  WellnessArt,
  YouRow,
  rankWords,
  tiedRanks,
  type RankedPerson,
} from "@/components/wellness";
import { TONE_WASH } from "@/components/wellness";
import { amountText } from "@/lib/wellness/format";

/**
 * The board of one challenge, for somebody who joined it.
 *
 * ## What is on it, and what is deliberately not
 *
 * An individual board is the people who joined, by name, ranked by the
 * challenge's own measure (steps or millilitres, exactly as the API gives it).
 * They agreed to appear to each other when they joined, and nobody else is ever
 * sent it. A team board is teams ranked by their average, and never carries a
 * person's number but your own. There is no points system, no company-wide table
 * and no "just now" feed: a board belongs to one challenge.
 *
 * ## Kind about the quiet states
 *
 * Fewer than three people, a team that is not shown yet, a board nobody has
 * logged on: none of these is an error, so none is drawn as one. They get a
 * resting mascot and a plain sentence.
 *
 * ## Your place stays in view
 *
 * Your row is highlighted where it sits and pinned at the bottom of the board as
 * you scroll, from the API's `me` block. It is there even when you are further
 * down than the list the API sent.
 */

/** The people the API listed, ready for the podium and the rows. */
export function peopleOf(board: ApiIndividualBoard): RankedPerson[] {
  return board.entries.map((entry, index) => ({
    key: `${String(index)}-${entry.name}`,
    rank: entry.rank,
    name: entry.name,
    total: amountText(board.metric, entry.total),
    mine: entry.mine,
  }));
}

export function IndividualBoardView({
  board,
  status,
  endsOn,
}: {
  board: ApiIndividualBoard;
  status: ChallengeStatus;
  /** The challenge's last day, worded, for the open seats note. */
  endsOn: string;
}) {
  const people = peopleOf(board);
  const tied = tiedRanks(people.map((person) => person.rank));
  const top = people.slice(0, 3);
  const rest = people.slice(3);
  const open = status === "ACTIVE" || status === "UPCOMING";
  const alone = board.participants === 1;
  const hidden = Math.max(0, board.participants - people.length);

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-body-sm text-muted">
        {board.participants} taking part
        <InfoTooltip
          id="wellness-board-who"
          label="Who sees this board"
          text="Only people who joined this challenge see it, and they agreed to appear to each other. Leave and you disappear from it."
        />
      </p>

      <Card>
        <CardBody>
          <Podium
            people={top}
            tied={tied}
            label={`Top ${top.length === 1 ? "place" : "three"}`}
          />
          {board.participants < 3 && (
            <p className="mx-auto mt-5 flex max-w-sm items-center justify-center gap-3 text-center text-body-sm text-muted">
              <WellnessArt
                name="cherries"
                mood="sleepy"
                size={44}
                animate={false}
              />
              <span>
                {alone ? "You are the first one here. " : "Room for one more. "}
                {open
                  ? `Others can join until ${endsOn}.`
                  : "The challenge is over."}
              </span>
            </p>
          )}
        </CardBody>
      </Card>

      {rest.length > 0 && (
        <ol
          aria-label={`${METRIC_LABEL[board.metric]} board, from fourth place`}
          className="flex flex-col gap-2"
        >
          {rest.map((person) => (
            <RankRow
              key={person.key}
              person={person}
              tied={tied.has(person.rank)}
            />
          ))}
        </ol>
      )}

      {hidden > 0 && (
        <p className="text-body-sm text-muted">
          The top {people.length} are shown. Your place is pinned below.
        </p>
      )}

      <YouRow
        rank={board.me.rank}
        tied={tied.has(board.me.rank)}
        total={amountText(board.metric, board.me.total)}
      />
    </div>
  );
}

/* --------------------------------------------------------------------- teams */

type ShownTeam = Extract<ApiBoardTeam, { withheld: false }>;
type WithheldTeam = Extract<ApiBoardTeam, { withheld: true }>;

/** Teams share a rank when their averages match; the next rank skips. */
function rankTeams(
  teams: readonly ShownTeam[],
): (ShownTeam & { rank: number })[] {
  return teams.map((team) => ({
    ...team,
    rank: teams.findIndex((other) => other.average === team.average) + 1,
  }));
}

function TeamRow({
  team,
  metric,
  tied,
}: {
  team: ShownTeam & { rank: number };
  metric: ApiTeamBoard["metric"];
  tied: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl border px-3 py-2.5 sm:gap-4 sm:px-4",
        team.mine
          ? "border-well-peri bg-well-peri-soft"
          : "border-line bg-surface",
      )}
    >
      <span className="sr-only">
        {rankWords(team.rank, tied)}: {team.name}, average{" "}
        {amountText(metric, team.average)} over {team.participants} taking part
        {team.mine ? ", your team" : ""}.
      </span>
      <RankBadge rank={team.rank} tone={team.mine ? "green" : "plain"} />
      <div aria-hidden="true" className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-body-md font-medium text-ink">
          <span className="truncate" title={team.name}>
            {team.name}
          </span>
          {team.mine && (
            <span className="shrink-0 rounded-full bg-well-green px-2 py-0.5 text-meta font-semibold text-well-ink">
              Your team
            </span>
          )}
        </p>
        <p className="tabular text-body-sm text-muted">
          {team.participants} taking part, {amountText(metric, team.total)} in
          all
        </p>
      </div>
      <div aria-hidden="true" className="shrink-0 text-right">
        <p className="tabular text-body-md font-semibold text-ink">
          {team.average.toLocaleString("en-NG")}
        </p>
        <p className="text-meta text-muted">average</p>
      </div>
    </li>
  );
}

function WithheldRow({ team }: { team: WithheldTeam }) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-2xl p-4",
        team.mine
          ? "border border-well-peri bg-well-peri-soft"
          : TONE_WASH.peri,
      )}
    >
      <WellnessArt name="cherries" mood="sleepy" size={56} animate={false} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-md font-medium text-ink">
          <span className="[overflow-wrap:anywhere]">{team.name}</span>
          {team.mine && (
            <span className="rounded-full bg-well-green px-2 py-0.5 text-meta font-semibold text-well-ink">
              Your team
            </span>
          )}
        </p>
        <p className="text-body-sm text-body">{team.note}</p>
      </div>
    </li>
  );
}

export function TeamBoardView({ board }: { board: ApiTeamBoard }) {
  const shown = rankTeams(
    board.teams.filter((team): team is ShownTeam => !team.withheld),
  );
  const withheld = board.teams.filter(
    (team): team is WithheldTeam => team.withheld,
  );
  const tied = tiedRanks(shown.map((team) => team.rank));
  const podium: RankedPerson[] = shown.slice(0, 3).map((team) => ({
    key: team.teamId,
    rank: team.rank,
    name: team.name,
    total: `${team.average.toLocaleString("en-NG")} avg`,
    mine: team.mine,
  }));
  const rest = shown.slice(podium.length >= 3 ? 3 : 0);
  const explain = `Teams appear once at least ${String(board.floor)} of their members have joined and logged something. Nobody is shown anyone else's own number.`;

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-body-sm text-muted">
        Your total, {amountText(board.metric, board.mine.total)}
        <InfoTooltip
          id="wellness-team-board"
          label="About this board"
          text={explain}
        />
      </p>

      {shown.length === 0 ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
            <WellnessArt name="cherries" mood="sleepy" size={96} />
            <p className="text-h4 text-ink">No team is on the board yet</p>
            <p className="max-w-md text-body-sm text-muted">{explain}</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {podium.length >= 3 && (
            <Card>
              <CardBody>
                <Podium
                  people={podium}
                  tied={tied}
                  label="Top three teams, by average"
                  mineLabel="Your team"
                />
                <p className="mt-4 text-center text-meta text-muted">
                  Ranked by the average per person who joined.
                </p>
              </CardBody>
            </Card>
          )}
          <ol
            aria-label={`Teams, ranked by average ${METRIC_LABEL[board.metric].toLowerCase()}`}
            className="flex flex-col gap-2"
          >
            {rest.map((team) => (
              <TeamRow
                key={team.teamId}
                team={team}
                metric={board.metric}
                tied={tied.has(team.rank)}
              />
            ))}
          </ol>
        </>
      )}

      {withheld.length > 0 && (
        <ul aria-label="Teams not shown yet" className="flex flex-col gap-2">
          {withheld.map((team) => (
            <WithheldRow key={team.teamId} team={team} />
          ))}
        </ul>
      )}
    </div>
  );
}
