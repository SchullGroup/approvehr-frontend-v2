"use client";

import { useState } from "react";
import { Heart, Lock, Trash2 } from "lucide-react";
import {
  type PickerOption,
  Avatar,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  LoadState,
  Modal,
  SearchPicker,
  Switch,
  SuccessMoment,
  Textarea,
  useToast,
} from "@/components/ui";
import { PillTabs, SceneImage, WellnessArt } from "@/components/wellness";
import { LoadMore } from "@/components/portal/load-more";
import { ApiError } from "@/lib/api/client";
import type { ApiRecognition } from "@/lib/api/wellness";
import { useEmployeeSearch } from "@/lib/store/employees-api";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PillTabs
          label="Show"
          value={kind}
          onChange={setKind}
          options={KINDS}
        />
        <Button variant="accent" onClick={() => setGiving(true)}>
          <Heart aria-hidden="true" className="size-4" />
          Give kudos
        </Button>
      </div>

      <LoadState
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        hasData={list.rows.length > 0}
        subject="the kudos"
        skeleton="list"
      >
        {list.rows.length === 0 ? (
          <Card>
            <EmptyState
              art={<SceneImage name="ice-cream" size={140} />}
              title={EMPTY[kind].title}
              description={EMPTY[kind].description}
              compact
            />
          </Card>
        ) : (
          <ul className="flex flex-col gap-3">
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
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start gap-3">
        <Avatar
          name={row.fromName}
          size="md"
          className="bg-well-pink-soft text-well-pink-text"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm text-body">
            <span>
              <span className="font-medium text-ink">{from}</span> thanked{" "}
              <span className="font-medium text-ink">{to}</span>
            </span>
            {!row.shared && (
              <Badge
                tone="neutral"
                size="sm"
                icon={<Lock className="size-3" />}
              >
                Private
              </Badge>
            )}
          </p>
          <p className="text-meta text-muted">
            {formatDateShort(row.createdAt, timeZone)}
          </p>
        </div>
        {row.canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="-mr-2 -mt-1 shrink-0"
            onClick={onRemove}
            aria-label={`Delete the kudos from ${row.fromName} to ${row.toName}`}
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </Button>
        )}
      </div>
      <p
        className={
          open || !long
            ? "mt-3 whitespace-pre-line rounded-2xl rounded-tl-md bg-well-pink-soft px-4 py-3 text-body-md text-ink"
            : "mt-3 line-clamp-2 whitespace-pre-line rounded-2xl rounded-tl-md bg-well-pink-soft px-4 py-3 text-body-md text-ink"
        }
      >
        {row.message}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((was) => !was)}
          className="mt-1.5 text-meta font-medium text-accent-text underline underline-offset-2"
        >
          {open ? "Show less" : "Read all"}
        </button>
      )}
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
  const { employeeId } = useSession();
  /* Found by typing, a handful at a time. This used to read the first two
     hundred people and filter them in the browser, so in a company of two
     hundred and one the last colleague could not be thanked. Yourself is left
     out here, and the chosen person is held below, not looked up in a list
     that changes under every search. */
  const search = useEmployeeSearch({ excludeId: employeeId });
  const [recipient, setRecipient] = useState<PickerOption | null>(null);
  const [message, setMessage] = useState("");
  const [shared, setShared] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<{
    name: string;
    shared: boolean;
  } | null>(null);

  const to = recipient?.value ?? "";
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
      /* The API has answered with the saved kudos, so "sent" is true. The dialog
         says so itself rather than closing under a toast. */
      setSentTo({ name: recipient?.label ?? "your colleague", shared });
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

  if (sentTo) {
    return (
      <Modal
        open
        onClose={onSent}
        title="Give kudos"
        footer={
          <Button variant="accent" onClick={onSent}>
            Done
          </Button>
        }
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <WellnessArt name="pear" mood="cheering" size={120} />
          <SuccessMoment
            align="center"
            markSize="sm"
            headingLevel={3}
            title={`Kudos sent to ${sentTo.name}`}
            lead={
              sentTo.shared
                ? "It is on the company feed."
                : `Only you and ${sentTo.name} can read it.`
            }
          />
        </div>
      </Modal>
    );
  }

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
        <div
          aria-hidden="true"
          className="flex items-center justify-center rounded-2xl bg-well-pink-soft py-2"
        >
          <WellnessArt name="pear" mood="happy" size={80} />
        </div>
        <Field label="Who" required>
          <SearchPicker
            selected={recipient}
            onSelect={setRecipient}
            onQueryChange={search.search}
            options={search.options}
            pending={search.pending}
            failed={search.failed}
            onRetry={search.retry}
            more={search.more}
            placeholder="Search for a colleague"
            aria-label="Who"
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
              ? `Off, and only you and ${recipient.label} can read it.`
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
