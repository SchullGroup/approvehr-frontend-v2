"use client";

import { useState } from "react";
import { Ban, ChartColumn, DoorOpen, PencilLine, Plus } from "lucide-react";
import {
  Button,
  ButtonLink,
  Card,
  ConfirmDialog,
  EmptyState,
  LoadState,
  RowActions,
  useToast,
  type RowActionItem,
} from "@/components/ui";
import { ChallengeCard, PillTabs, WellnessArt } from "@/components/wellness";
import { ApiError } from "@/lib/api/client";
import type { ApiChallenge, ChallengeStatus } from "@/lib/api/wellness";
import { useCan } from "@/lib/permissions";
import { useChallenges, useWellnessActions } from "@/lib/store/wellness";
import { useToday } from "@/lib/use-today";
import { STATUS_LABEL } from "@/lib/wellness/format";
import {
  CreateChallengeDialog,
  EditChallengeDialog,
  JoinDialog,
  ResultsDialog,
} from "./challenge-dialogs";

/**
 * Challenges: what is running, joining one, and (for whoever runs the
 * programme) starting and ending them.
 *
 * ## One list, narrowed by role
 *
 * Everybody sees the same list: a title, a window, a measure and whether *they*
 * joined. Nothing on a card counts anybody, because the list is open to the
 * whole company and a count is the first thing a floor exists to withhold. A
 * person who joined opens the board, which lives on the challenge's own page. An
 * administrator opens the results, which are counts and totals above a floor and
 * never a person. Those are separate doors on purpose, and an administrator who
 * wants the board has to join like anybody else (the join statement says so).
 *
 * `MANAGE_SETTINGS` gates creating, editing and cancelling here as it does in
 * the API. It decides what is worth showing; the API decides what is allowed.
 *
 * ## The filters are pills, and "mine" is only yours
 *
 * "Joined" narrows to challenges the caller is in, which is the one thing the
 * list already tells them about themselves. There is no "popular" filter and no
 * "recommended" one: both would need a count of other people, or a guess.
 */

type Filter = "all" | "joined" | ChallengeStatus;

type Dialog =
  | {
      kind: "join" | "results" | "edit" | "cancel" | "leave";
      challenge: ApiChallenge;
    }
  | { kind: "create" }
  | null;

/** Running first, then what is coming, then what is over; yours before the rest. */
const ORDER: Record<ChallengeStatus, number> = {
  ACTIVE: 0,
  UPCOMING: 1,
  ENDED: 2,
  CANCELLED: 3,
};

const challengeHref = (challenge: ApiChallenge) =>
  `/wellness/challenges/${challenge.id}`;

export function ChallengesScreen() {
  const list = useChallenges();
  const canManage = useCan("MANAGE_SETTINGS");
  const actions = useWellnessActions();
  const toast = useToast();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const close = () => setDialog(null);
  const done = () => {
    setDialog(null);
    list.reload();
  };

  const all = list.data ?? [];
  const matches = (challenge: ApiChallenge, wanted: Filter) =>
    wanted === "all"
      ? true
      : wanted === "joined"
        ? challenge.joined
        : challenge.status === wanted;
  const rows = all
    .filter((challenge) => matches(challenge, filter))
    .sort(
      (a, b) =>
        ORDER[a.status] - ORDER[b.status] ||
        Number(b.joined) - Number(a.joined) ||
        a.startsOn.localeCompare(b.startsOn),
    );
  const count = (wanted: Filter) =>
    all.filter((challenge) => matches(challenge, wanted)).length;

  const run = async (act: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await act();
      toast.push({ tone: "info", title: success });
      done();
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PillTabs
          label="Show challenges"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "all",
              label: "All",
              ...(list.data ? { count: count("all") } : {}),
            },
            {
              value: "joined",
              label: "Joined",
              ...(list.data ? { count: count("joined") } : {}),
            },
            ...(["ACTIVE", "UPCOMING", "ENDED", "CANCELLED"] as const).map(
              (status) => ({
                value: status,
                label: STATUS_LABEL[status],
                ...(list.data ? { count: count(status) } : {}),
              }),
            ),
          ]}
        />
        {canManage && (
          <Button
            variant="accent"
            onClick={() => setDialog({ kind: "create" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            New challenge
          </Button>
        )}
      </div>

      <LoadState
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasData={list.data !== null}
        subject="the challenges"
        skeleton="list"
      >
        {rows.length === 0 ? (
          <Card>
            <EmptyState
              icon={<WellnessArt name="cherries" mood="sleepy" size={96} />}
              title={
                list.data && list.data.length > 0
                  ? "No challenge matches"
                  : "No challenges yet"
              }
              description={
                list.data && list.data.length > 0
                  ? undefined
                  : canManage
                    ? "Start one and people can join it."
                    : "When one starts, you can join it here."
              }
              compact
            />
          </Card>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {rows.map((challenge) => (
              <Row
                key={challenge.id}
                challenge={challenge}
                today={today}
                canManage={canManage}
                onOpen={(kind) => setDialog({ kind, challenge })}
              />
            ))}
          </ul>
        )}
      </LoadState>

      {dialog?.kind === "create" && (
        <CreateChallengeDialog onClose={close} onCreated={done} />
      )}
      {dialog?.kind === "join" && (
        <JoinDialog
          challenge={dialog.challenge}
          onClose={close}
          onJoined={list.reload}
          boardHref={challengeHref(dialog.challenge)}
        />
      )}
      {dialog?.kind === "results" && (
        <ResultsDialog challenge={dialog.challenge} onClose={close} />
      )}
      {dialog?.kind === "edit" && (
        <EditChallengeDialog
          challenge={dialog.challenge}
          onClose={close}
          onSaved={done}
        />
      )}
      {dialog?.kind === "leave" && (
        <ConfirmDialog
          open
          onClose={close}
          loading={busy}
          tone="primary"
          title={`Leave ${dialog.challenge.title}?`}
          body="You disappear from its board at once. What you logged stays yours, and you can join again later."
          confirmLabel="Leave"
          onConfirm={() => {
            const target = dialog.challenge;
            void run(
              () => actions.leaveChallenge(target.id),
              `You left ${target.title}`,
            );
          }}
        />
      )}
      {dialog?.kind === "cancel" && (
        <ConfirmDialog
          open
          onClose={close}
          loading={busy}
          title={`Cancel ${dialog.challenge.title}?`}
          body="It stops for everybody and no totals are ever released. This cannot be undone."
          confirmLabel="Cancel challenge"
          onConfirm={() => {
            const target = dialog.challenge;
            void run(
              () => actions.cancelChallenge(target.id),
              `${target.title} was cancelled`,
            );
          }}
        />
      )}
    </div>
  );
}

function Row({
  challenge,
  today,
  canManage,
  onOpen,
}: {
  challenge: ApiChallenge;
  today: string;
  canManage: boolean;
  onOpen: (kind: "join" | "results" | "edit" | "cancel" | "leave") => void;
}) {
  const open = challenge.status === "UPCOMING" || challenge.status === "ACTIVE";
  const cancelled = challenge.status === "CANCELLED";

  const items: RowActionItem[] = [
    ...(challenge.joined
      ? [
          {
            key: "leave",
            label: "Leave challenge",
            icon: <DoorOpen aria-hidden="true" className="size-4" />,
            onSelect: () => onOpen("leave"),
          },
        ]
      : []),
    ...(canManage
      ? [
          ...(challenge.joined ? (["separator"] as const) : []),
          {
            key: "results",
            label: "Results",
            icon: <ChartColumn aria-hidden="true" className="size-4" />,
            onSelect: () => onOpen("results"),
          },
          ...(!cancelled
            ? [
                {
                  key: "edit",
                  label: "Edit",
                  icon: <PencilLine aria-hidden="true" className="size-4" />,
                  onSelect: () => onOpen("edit"),
                },
                {
                  key: "cancel",
                  label: "Cancel challenge",
                  icon: <Ban aria-hidden="true" className="size-4" />,
                  tone: "danger" as const,
                  onSelect: () => onOpen("cancel"),
                },
              ]
            : []),
        ]
      : []),
  ];

  return (
    <ChallengeCard
      challenge={challenge}
      today={today}
      href={challengeHref(challenge)}
      menu={
        items.length > 0 ? (
          <RowActions label={`Actions for ${challenge.title}`} items={items} />
        ) : undefined
      }
      actions={
        <>
          {open && !challenge.joined && (
            <Button
              size="sm"
              variant="accent"
              onClick={() => onOpen("join")}
              aria-label={`Join ${challenge.title}`}
            >
              Join
            </Button>
          )}
          {challenge.joined && !cancelled && (
            <ButtonLink
              size="sm"
              variant="secondary"
              href={challengeHref(challenge)}
              aria-label={`Board for ${challenge.title}`}
            >
              Board
            </ButtonLink>
          )}
        </>
      }
    />
  );
}
