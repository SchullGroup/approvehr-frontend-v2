"use client";

import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  ChartColumn,
  DoorOpen,
  Droplets,
  Footprints,
  User,
  Users,
} from "lucide-react";
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  ConfirmDialog,
  LoadState,
  useToast,
} from "@/components/ui";
import {
  Chip,
  MascotPromoCard,
  StatTile,
  TONE_WASH,
  WellnessArt,
  artFor,
  moodFor,
} from "@/components/wellness";
import { ApiError } from "@/lib/api/client";
import {
  METRIC_LABEL,
  MODE_LABEL,
  type ApiChallengeDetail,
} from "@/lib/api/wellness";
import { cn } from "@/lib/cn";
import { useCan } from "@/lib/permissions";
import {
  useChallengeBoard,
  useChallengeDetail,
  useWellnessActions,
} from "@/lib/store/wellness";
import { shortDate } from "@/lib/today";
import { useToday } from "@/lib/use-today";
import {
  STATUS_LABEL,
  daysText,
  durationDays,
  statusText,
  windowText,
} from "@/lib/wellness/format";
import { IndividualBoardView, TeamBoardView } from "./board";
import { JoinDialog, ResultsDialog } from "./challenge-dialogs";

/**
 * One challenge: what it is, joining it, and (for people who joined) its board.
 *
 * ## The trio, and the one door to the board
 *
 * What is measured, how long it runs and who it is for are the whole definition,
 * so they sit first, in three tiles. Under them is the description and then the
 * join flow, which is the API's own statement in full. The board is on this page
 * only for somebody who joined: the page never asks for it otherwise, so a
 * refusal is not a state anybody sees, and an administrator who has not joined
 * is offered results instead, which are counts and never a person.
 */

export function ChallengeScreen({ id }: { id: string }) {
  const detail = useChallengeDetail(id);
  const d = detail.data;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <ButtonLink href="/wellness/challenges" variant="ghost" size="sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          All challenges
        </ButtonLink>
      </div>
      <LoadState
        loading={detail.loading}
        error={detail.error}
        onRetry={detail.reload}
        hasData={d !== null}
        subject="this challenge"
        skeleton="detail"
      >
        {d && <Challenge challenge={d} onChanged={detail.reload} />}
      </LoadState>
    </div>
  );
}

function Challenge({
  challenge,
  onChanged,
}: {
  challenge: ApiChallengeDetail;
  onChanged: () => void;
}) {
  const today = useToday();
  const canManage = useCan("MANAGE_SETTINGS");
  const actions = useWellnessActions();
  const toast = useToast();
  const [dialog, setDialog] = useState<"join" | "leave" | "results" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const art = artFor(challenge);
  const open = challenge.status === "UPCOMING" || challenge.status === "ACTIVE";
  const cancelled = challenge.status === "CANCELLED";
  const team = challenge.mode === "TEAM";
  const days = durationDays(challenge.startsOn, challenge.endsOn);

  const leave = async () => {
    setBusy(true);
    try {
      await actions.leaveChallenge(challenge.id);
      toast.push({ tone: "info", title: `You left ${challenge.title}` });
      setDialog(null);
      onChanged();
    } catch (error) {
      toast.push({
        tone: "warning",
        title: "That did not work",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card className="overflow-hidden">
        <div
          className={cn(
            "flex items-center gap-4 p-5 sm:gap-6 sm:p-6",
            TONE_WASH[art.tone],
          )}
        >
          <WellnessArt
            name={art.name}
            mood={moodFor(challenge.status, challenge.joined)}
            size={104}
          />
          <div className="min-w-0">
            <h2 className="text-h3 text-ink [overflow-wrap:anywhere]">
              {challenge.title}
            </h2>
            <p className="mt-1 text-body-sm text-body">
              {statusText(challenge, today)}
              {" · "}
              {windowText(challenge.startsOn, challenge.endsOn)}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {challenge.status !== "ACTIVE" && (
                <Chip tone="peri">{STATUS_LABEL[challenge.status]}</Chip>
              )}
              {challenge.joined && <Chip tone="green">Joined</Chip>}
              {challenge.team && (
                <Chip tone="green">{challenge.team.name}</Chip>
              )}
            </div>
          </div>
        </div>

        <CardBody className="flex flex-col gap-5">
          <dl className="grid grid-cols-3 gap-2 sm:gap-3">
            <div>
              <dt className="sr-only">Measures</dt>
              <dd>
                <StatTile
                  compact
                  tone="green"
                  icon={
                    challenge.metric === "STEPS" ? <Footprints /> : <Droplets />
                  }
                  value={METRIC_LABEL[challenge.metric]}
                  label="Measures"
                />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Duration</dt>
              <dd>
                <StatTile
                  compact
                  tone="peri"
                  icon={<CalendarDays />}
                  value={daysText(days)}
                  label="Duration"
                />
              </dd>
            </div>
            <div>
              <dt className="sr-only">Mode</dt>
              <dd>
                <StatTile
                  compact
                  tone="pink"
                  icon={team ? <Users /> : <User />}
                  value={MODE_LABEL[challenge.mode]}
                  label="Mode"
                />
              </dd>
            </div>
          </dl>

          {challenge.description && (
            <p className="max-w-prose whitespace-pre-line text-body-md text-body">
              {challenge.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {open && !challenge.joined && (
              <Button variant="accent" onClick={() => setDialog("join")}>
                Join challenge
              </Button>
            )}
            {challenge.joined && !cancelled && (
              <Button variant="secondary" onClick={() => setDialog("leave")}>
                <DoorOpen aria-hidden="true" className="size-4" />
                Leave challenge
              </Button>
            )}
            {canManage && (
              <Button variant="ghost" onClick={() => setDialog("results")}>
                <ChartColumn aria-hidden="true" className="size-4" />
                Results
              </Button>
            )}
            {!open && !challenge.joined && (
              <p className="text-body-sm text-muted">
                {cancelled
                  ? "This challenge was cancelled."
                  : "This challenge has ended, so it can no longer be joined."}
              </p>
            )}
          </div>
        </CardBody>
      </Card>

      {challenge.joined && !cancelled && <Board challenge={challenge} />}

      {!challenge.joined && open && (
        <MascotPromoCard
          tone="peri"
          title="The board is for people taking part"
          text={
            team
              ? "Join for a team of yours and you will see how the teams are doing. Nobody sees anyone else's own number."
              : "Join and you will see who else is in and where you stand. They see you too."
          }
          art={<WellnessArt name="apple" mood="happy" size={96} />}
        />
      )}

      {dialog === "join" && (
        <JoinDialog
          challenge={challenge}
          onClose={() => setDialog(null)}
          onJoined={onChanged}
          boardHref={`/wellness/challenges/${challenge.id}`}
        />
      )}
      {dialog === "results" && (
        <ResultsDialog challenge={challenge} onClose={() => setDialog(null)} />
      )}
      {dialog === "leave" && (
        <ConfirmDialog
          open
          onClose={() => setDialog(null)}
          loading={busy}
          tone="primary"
          title={`Leave ${challenge.title}?`}
          body="You disappear from its board at once. What you logged stays yours, and you can join again later."
          confirmLabel="Leave"
          onConfirm={() => void leave()}
        />
      )}
    </>
  );
}

function Board({ challenge }: { challenge: ApiChallengeDetail }) {
  const board = useChallengeBoard(challenge.id);
  const b = board.data;
  return (
    <section aria-labelledby="board-heading" className="flex flex-col gap-3">
      <h2 id="board-heading" className="text-h4 text-ink">
        The board
      </h2>
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
            <IndividualBoardView
              board={b}
              status={challenge.status}
              endsOn={shortDate(challenge.endsOn)}
            />
          ) : (
            <TeamBoardView board={b} />
          ))}
      </LoadState>
    </section>
  );
}
