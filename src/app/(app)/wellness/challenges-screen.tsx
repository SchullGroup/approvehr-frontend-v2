"use client";

import { useState } from "react";
import {
  Ban,
  ChartColumn,
  DoorOpen,
  Medal,
  PencilLine,
  Plus,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  LoadState,
  RowActions,
  Select,
  useToast,
  type BadgeTone,
  type RowActionItem,
} from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { ApiError } from "@/lib/api/client";
import {
  METRIC_LABEL,
  MODE_LABEL,
  type ApiChallenge,
  type ChallengeStatus,
} from "@/lib/api/wellness";
import { useCan } from "@/lib/permissions";
import { useChallenges, useWellnessActions } from "@/lib/store/wellness";
import { STATUS_LABEL, windowText } from "@/lib/wellness/format";
import {
  BoardDialog,
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
 * joined. Nothing on a row counts anybody, because the list is open to the whole
 * company and a count is the first thing a floor exists to withhold. A person
 * who joined opens the board. An administrator opens the results, which are
 * counts and totals above a floor and never a person. Those are separate doors
 * on purpose, and an administrator who wants the board has to join like anybody
 * else (the join statement says so).
 *
 * `MANAGE_SETTINGS` gates creating, editing and cancelling here as it does in
 * the API. It decides what is worth showing; the API decides what is allowed.
 */

const STATUS_TONE: Record<ChallengeStatus, BadgeTone> = {
  UPCOMING: "neutral",
  ACTIVE: "accent",
  ENDED: "neutral",
  CANCELLED: "warning",
};

type Dialog =
  | {
      kind: "join" | "board" | "results" | "edit" | "cancel" | "leave";
      challenge: ApiChallenge;
    }
  | { kind: "create" }
  | null;

export function ChallengesScreen() {
  const list = useChallenges();
  const canManage = useCan("MANAGE_SETTINGS");
  const actions = useWellnessActions();
  const toast = useToast();
  const [status, setStatus] = useState<"all" | ChallengeStatus>("all");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const close = () => setDialog(null);
  const done = () => {
    setDialog(null);
    list.reload();
  };

  const rows = (list.data ?? []).filter(
    (challenge) => status === "all" || challenge.status === status,
  );

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
    <div className="flex flex-col gap-4">
      <FilterBar
        applied={
          status === "all"
            ? []
            : [
                {
                  label: "Status",
                  value: STATUS_LABEL[status],
                  onClear: () => setStatus("all"),
                },
              ]
        }
        count={list.data ? rows.length : undefined}
        noun={["challenge", "challenges"]}
        actions={
          canManage ? (
            <Button
              variant="accent"
              onClick={() => setDialog({ kind: "create" })}
            >
              <Plus aria-hidden="true" className="size-4" />
              New challenge
            </Button>
          ) : undefined
        }
      >
        <Field label="Status">
          <Select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "all" | ChallengeStatus)
            }
          >
            <option value="all">All</option>
            {(Object.keys(STATUS_LABEL) as ChallengeStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABEL[key]}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <LoadState
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasData={list.data !== null}
        subject="the challenges"
        skeleton="list"
      >
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              icon={<Medal aria-hidden="true" />}
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
          ) : (
            <ul className="divide-y divide-line">
              {rows.map((challenge) => (
                <ChallengeRow
                  key={challenge.id}
                  challenge={challenge}
                  canManage={canManage}
                  onOpen={(kind) => setDialog({ kind, challenge })}
                />
              ))}
            </ul>
          )}
        </Card>
      </LoadState>

      {dialog?.kind === "create" && (
        <CreateChallengeDialog onClose={close} onCreated={done} />
      )}
      {dialog?.kind === "join" && (
        <JoinDialog
          challenge={dialog.challenge}
          onClose={close}
          onJoined={done}
        />
      )}
      {dialog?.kind === "board" && (
        <BoardDialog challenge={dialog.challenge} onClose={close} />
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

function ChallengeRow({
  challenge,
  canManage,
  onOpen,
}: {
  challenge: ApiChallenge;
  canManage: boolean;
  onOpen: (
    kind: "join" | "board" | "results" | "edit" | "cancel" | "leave",
  ) => void;
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
    <li className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
          {challenge.title}
          {challenge.description && (
            <InfoTooltip
              id={`wellness-challenge-${challenge.id}`}
              label={`About ${challenge.title}`}
              text={challenge.description}
            />
          )}
          <Badge tone={STATUS_TONE[challenge.status]} size="sm">
            {STATUS_LABEL[challenge.status]}
          </Badge>
          {challenge.joined && (
            <Badge tone="accent" size="sm">
              Joined
            </Badge>
          )}
        </p>
        <p className="text-meta text-muted">
          {METRIC_LABEL[challenge.metric]}, {MODE_LABEL[challenge.mode]},{" "}
          {windowText(challenge.startsOn, challenge.endsOn)}
        </p>
      </div>
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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onOpen("board")}
          aria-label={`Board for ${challenge.title}`}
        >
          Board
        </Button>
      )}
      {items.length > 0 && (
        <RowActions label={`Actions for ${challenge.title}`} items={items} />
      )}
    </li>
  );
}
