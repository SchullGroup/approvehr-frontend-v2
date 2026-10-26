"use client";

import { useState } from "react";
import { Heart, Lock, Trash2 } from "lucide-react";
import {
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  LoadState,
  Modal,
  Picker,
  Select,
  Switch,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadMore } from "@/components/portal/load-more";
import { ApiError } from "@/lib/api/client";
import type { ApiRecognition } from "@/lib/api/wellness";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import {
  useRecognitions,
  useWellnessActions,
  type RecognitionKind,
} from "@/lib/store/wellness";
import { formatDateShort } from "@/lib/time";

/**
 * Recognition: thanking a colleague, in public or in private.
 *
 * ## Private means two people
 *
 * A private kudos is read by the person who gave it and the person who got it.
 * Not HR, not an administrator: to anybody else it is not there at all, and the
 * API answers a 404 rather than a refusal that would confirm it exists. That is
 * why "Received" and "Given" are the only lists that show private ones, and why
 * the company feed never does.
 *
 * ## Why there is no leaderboard
 *
 * A count of kudos per person would invite people to farm it, and the API caps
 * a giver at ten in any rolling day for the same reason. This screen lists
 * thanks as sentences and counts nobody.
 *
 * This is not health data, so there is no consent: the default is shared, and
 * the other choice is one switch in the form.
 */

const KINDS: { value: RecognitionKind; label: string }[] = [
  { value: "feed", label: "Company feed" },
  { value: "received", label: "Given to me" },
  { value: "given", label: "Given by me" },
];

const EMPTY: Record<RecognitionKind, { title: string; description: string }> = {
  feed: {
    title: "No kudos yet",
    description: "Thank somebody and it shows up here.",
  },
  received: {
    title: "Nobody has thanked you yet",
    description: "Private and shared thanks both show here.",
  },
  given: {
    title: "You have not thanked anybody yet",
    description: "What you send shows here, private ones too.",
  },
};

export function RecognitionScreen() {
  const [kind, setKind] = useState<RecognitionKind>("feed");
  const [giving, setGiving] = useState(false);
  const [removing, setRemoving] = useState<ApiRecognition | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useRecognitions(kind);
  const actions = useWellnessActions();
  const toast = useToast();
  const { employeeId } = useSession();

  const remove = async (row: ApiRecognition) => {
    setBusy(true);
    try {
      await actions.removeRecognition(row.id);
      list.remove(row.id);
      setRemoving(null);
      toast.push({ tone: "info", title: "Kudos deleted" });
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
          kind === "feed"
            ? []
            : [
                {
                  label: "Show",
                  value:
                    KINDS.find((entry) => entry.value === kind)?.label ?? "",
                  onClear: () => setKind("feed"),
                },
              ]
        }
        actions={
          <Button variant="accent" onClick={() => setGiving(true)}>
            <Heart aria-hidden="true" className="size-4" />
            Give kudos
          </Button>
        }
      >
        <Field label="Show">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as RecognitionKind)}
          >
            {KINDS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <LoadState
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasData={list.rows.length > 0}
        subject="the kudos"
        skeleton="list"
      >
        <Card>
          {list.rows.length === 0 ? (
            <EmptyState
              icon={<Heart aria-hidden="true" />}
              title={EMPTY[kind].title}
              description={EMPTY[kind].description}
              compact
            />
          ) : (
            <ul className="divide-y divide-line">
              {list.rows.map((row) => (
                <KudosRow
                  key={row.id}
                  row={row}
                  me={employeeId}
                  onRemove={() => setRemoving(row)}
                />
              ))}
            </ul>
          )}
        </Card>
        {list.rows.length > 0 && (
          <LoadMore
            shown={list.rows.length}
            total={list.total}
            noun={["kudos", "kudos"]}
            hasMore={list.hasMore}
            loading={list.loadingMore}
            error={list.moreError}
            onLoadMore={list.loadMore}
          />
        )}
      </LoadState>

      {giving && (
        <GiveDialog
          onClose={() => setGiving(false)}
          onSent={() => {
            setGiving(false);
            list.reload();
          }}
        />
      )}

      {removing && (
        <ConfirmDialog
          open
          onClose={() => setRemoving(null)}
          loading={busy}
          title="Delete this kudos?"
          body={
            removing.shared
              ? "It comes off the company feed for everybody."
              : "It is deleted for you and for them."
          }
          confirmLabel="Delete"
          onConfirm={() => void remove(removing)}
        />
      )}
    </div>
  );
}

function KudosRow({
  row,
  me,
  onRemove,
}: {
  row: ApiRecognition;
  /** The signed-in person's employee id, to say "You" instead of their name. */
  me: string | null;
  onRemove: () => void;
}) {
  const timeZone = useOrgTimezone();
  const [open, setOpen] = useState(false);
  const from = row.fromEmployeeId === me ? "You" : row.fromName;
  const to = row.toEmployeeId === me ? "you" : row.toName;
  const long = row.message.length > 120;

  return (
    <li className="flex items-start gap-3 px-5 py-3.5">
      <Avatar name={row.fromName} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-body">
          <span>
            <span className="font-medium text-ink">{from}</span> thanked{" "}
            <span className="font-medium text-ink">{to}</span>
          </span>
          {!row.shared && (
            <Badge tone="neutral" size="sm" icon={<Lock className="size-3" />}>
              Private
            </Badge>
          )}
        </p>
        <p
          className={
            open || !long
              ? "whitespace-pre-line text-body-sm text-muted"
              : "line-clamp-2 whitespace-pre-line text-body-sm text-muted"
          }
        >
          {row.message}
        </p>
        {long && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((was) => !was)}
            className="mt-0.5 text-meta font-medium text-accent-text underline underline-offset-2"
          >
            {open ? "Show less" : "Read all"}
          </button>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-meta text-muted">
          {formatDateShort(row.createdAt, timeZone)}
        </span>
        {row.canDelete && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label={`Delete the kudos from ${row.fromName} to ${row.toName}`}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------- give */

const MESSAGE_MAX = 500;

function GiveDialog({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent: () => void;
}) {
  const actions = useWellnessActions();
  const toast = useToast();
  const { employeeId } = useSession();
  /* The first two hundred, which is the API's page ceiling. The same call the
     signature dialog makes; a company larger than that needs a search that asks
     the server, and the picker's own filter only narrows what is here. */
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const people = directory.people.filter((person) => person.id !== employeeId);
  const recipient = people.find((person) => person.id === to);
  const ready = to !== "" && message.trim() !== "";

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setProblem(null);
    try {
      await actions.giveRecognition({
        toEmployeeId: to,
        message: message.trim(),
        shared,
      });
      toast.push({ tone: "success", title: "Kudos sent" });
      onSent();
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
      title="Give kudos"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={busy}
            disabled={!ready}
            onClick={() => void send()}
          >
            Send kudos
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Who" required>
          <Picker
            value={to}
            onChange={setTo}
            placeholder="Choose a colleague"
            loading={directory.loading}
            aria-label="Who"
            options={people.map((person) => ({
              value: person.id,
              label: person.fullName,
              ...(person.jobTitle ? { hint: person.jobTitle } : {}),
            }))}
          />
        </Field>
        <Field label="What for" required>
          <Textarea
            rows={4}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <span className="text-meta text-muted tabular">
            {message.length}/{MESSAGE_MAX}
          </span>
        </Field>
        <Switch
          label="Share on the company feed"
          description={
            recipient
              ? `Off, and only you and ${recipient.fullName} can read it.`
              : "Off, and only you and the person you thank can read it."
          }
          checked={shared}
          onChange={(event) => setShared(event.target.checked)}
        />
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
