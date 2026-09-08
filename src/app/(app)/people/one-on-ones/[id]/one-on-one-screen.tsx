"use client";

import { useState } from "react";
import { Check, Lock, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ApiError } from "@/lib/api/client";
import {
  SHARED_NOTES_NOTE,
  type ApiItemKind,
  type ApiOneOnOneItem,
  type ApiOneOnOneMeeting,
} from "@/lib/api/one-on-ones";
import {
  useMyOneOnOnes,
  useOneOnOneMeetings,
  useOneOnOneMutations,
} from "@/lib/store/one-on-ones";

/**
 * One standing one-to-one.
 *
 * ## The refusal is the interesting state
 *
 * Anybody who is not one of the two people gets a 403 with the API's own
 * sentence, and it is rendered **verbatim** rather than as a generic "could not
 * load". "A one-to-one is between two people, and only those two can read it"
 * is the whole explanation, and a reader needs to understand it is the design
 * rather than a bug — otherwise the first thing they do is ask somebody to
 * grant them a permission that does not exist.
 *
 * ## Notes and "we met" are two separate acts
 *
 * Typing an agenda three days early must not mark a meeting as having happened:
 * held is what the coverage report counts. So the notes save on their own
 * button and there is a separate checkbox, and the API keeps them apart too.
 */
export function OneOnOneScreen({ seriesId }: { seriesId: string }) {
  const mine = useMyOneOnOnes();
  const read = useOneOnOneMeetings(seriesId);
  const [scheduling, setScheduling] = useState(false);

  const series = mine.data?.find((each) => each.id === seriesId) ?? null;

  return (
    <>
      <PageHeader
        breadcrumb={[
          { href: "/people", label: "People" },
          { href: "/people/one-on-ones", label: "One-to-ones" },
        ]}
        title={series ? series.employeeName : "One-to-one"}
        meta={
          <span className="inline-flex items-center gap-1 text-meta text-faint">
            <Lock aria-hidden="true" className="size-3.5" />
            {series
              ? `${series.managerName} and ${series.employeeName} · ${series.cadenceLabel}`
              : "Private to the two people in it"}
          </span>
        }
        action={
          read.data ? (
            <Button
              size="sm"
              variant="accent"
              onClick={() => setScheduling(true)}
            >
              <Plus aria-hidden="true" className="size-4" />
              Put one in the diary
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        {!read.available ? (
          <Callout tone="info" title="This needs the API">
            {read.refusal}
          </Callout>
        ) : read.error ? (
          /* The 403 sentence is the API's and is shown as written — see the
             header. `LoadFailure` renders a 4xx message verbatim. */
          <LoadFailure
            subject="this one-to-one"
            error={read.error}
            onRetry={read.reload}
          />
        ) : read.loading || !read.data ? (
          <Spinner label="Loading" />
        ) : read.data.length === 0 ? (
          <EmptyState
            title="Nothing in the diary yet"
            description="Put the first one in. Either of you can, and both of you will see it."
          />
        ) : (
          <div className="flex flex-col gap-5">
            {read.data.map((meeting) => (
              <Meeting
                key={meeting.id}
                meeting={meeting}
                onChanged={read.reload}
              />
            ))}
          </div>
        )}
      </PageBody>
      {scheduling && (
        <ScheduleDialog
          seriesId={seriesId}
          onClose={() => setScheduling(false)}
          onDone={() => {
            setScheduling(false);
            read.reload();
          }}
        />
      )}
    </>
  );
}

function Meeting({
  meeting,
  onChanged,
}: {
  meeting: ApiOneOnOneMeeting;
  onChanged: () => void;
}) {
  const mutations = useOneOnOneMutations();
  const toast = useToast();
  const [notes, setNotes] = useState(meeting.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const dirty = notes !== (meeting.notes ?? "");

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setFailure(null);
    try {
      await work();
      toast.push({ tone: "success", title: done });
      onChanged();
    } catch (error) {
      setFailure(
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const actions = meeting.items.filter((item) => item.kind === "ACTION");
  const points = meeting.items.filter((item) => item.kind === "TALKING_POINT");

  return (
    <Card>
      <CardHeader
        level={2}
        title={meeting.scheduledFor}
        description={
          meeting.heldAt
            ? "Held"
            : "In the diary — not marked as held yet, so it does not count towards coverage."
        }
        action={
          <Badge tone={meeting.heldAt ? "success" : "neutral"} size="sm" dot>
            {meeting.heldAt ? "Held" : "Coming up"}
          </Badge>
        }
      />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <Field label="Notes" help={SHARED_NOTES_NOTE}>
            <Textarea
              rows={4}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="What you talked about."
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={!dirty}
              onClick={() =>
                void run(
                  () => mutations.updateMeeting(meeting.id, { notes }),
                  "Notes saved",
                )
              }
            >
              Save the notes
            </Button>
            {/* Deliberately its own control. Saving notes must never mark a
                meeting held — held is what the coverage report counts. */}
            <Checkbox
              label="We had this one"
              checked={meeting.heldAt !== null}
              disabled={busy}
              onChange={(event) =>
                void run(
                  () =>
                    mutations.updateMeeting(meeting.id, {
                      held: event.target.checked,
                    }),
                  event.target.checked ? "Marked as held" : "No longer held",
                )
              }
            />
            {!meeting.heldAt && (
              <Button
                size="sm"
                variant="ghost"
                loading={busy}
                onClick={() =>
                  void run(
                    () => mutations.cancelMeeting(meeting.id),
                    "Taken out of the diary",
                  )
                }
              >
                Cancel it
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-medium text-body">
              Actions and talking points
            </p>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding(true)}
            >
              <Plus aria-hidden="true" className="size-4" />
              Add
            </Button>
          </div>
          {meeting.items.length === 0 ? (
            <p className="text-meta text-faint">Nothing yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {actions.map((item) => (
                <Item
                  key={item.id}
                  item={item}
                  busy={busy}
                  onDone={(done) =>
                    void run(
                      () => mutations.setItemDone(item.id, done),
                      done ? "Done" : "Put back",
                    )
                  }
                  onRemove={() =>
                    void run(() => mutations.removeItem(item.id), "Removed")
                  }
                />
              ))}
              {points.map((item) => (
                <Item
                  key={item.id}
                  item={item}
                  busy={busy}
                  onRemove={() =>
                    void run(() => mutations.removeItem(item.id), "Removed")
                  }
                />
              ))}
            </ul>
          )}
        </div>

        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </CardBody>
      {adding && (
        <AddItemDialog
          meetingId={meeting.id}
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            onChanged();
          }}
        />
      )}
    </Card>
  );
}

function Item({
  item,
  busy,
  onDone,
  onRemove,
}: {
  item: ApiOneOnOneItem;
  busy: boolean;
  onDone?: (done: boolean) => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-2">
      {item.kind === "ACTION" && onDone ? (
        <Checkbox
          label={item.text}
          checked={item.doneAt !== null}
          disabled={busy}
          onChange={(event) => onDone(event.target.checked)}
        />
      ) : (
        <span className="text-body-sm text-body">{item.text}</span>
      )}
      {item.kind === "ACTION" ? (
        <>
          {/* An action always has an owner — the API refuses one without. */}
          <Badge tone="neutral" size="sm">
            {item.ownerName}
          </Badge>
          {item.dueDate && (
            <span className="text-meta text-faint">by {item.dueDate}</span>
          )}
        </>
      ) : (
        <Badge tone="neutral" size="sm">
          To discuss
        </Badge>
      )}
      <button
        type="button"
        onClick={onRemove}
        disabled={busy}
        aria-label={`Remove: ${item.text}`}
        className="ml-auto text-faint hover:text-body"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>
    </li>
  );
}

function ScheduleDialog({
  seriesId,
  onClose,
  onDone,
}: {
  seriesId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useOneOnOneMutations();
  const toast = useToast();
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Put one in the diary"
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={day === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.schedule(seriesId, day);
                  toast.push({ tone: "success", title: "In the diary" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Add it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Which day"
          help="A one-to-one is a day, not a time — moving it from two o'clock to four is the same meeting."
        >
          <Input
            type="date"
            value={day}
            onChange={(event) => setDay(event.target.value)}
          />
        </Field>
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

/**
 * Add an action or a talking point.
 *
 * The owner is not offered: the API defaults an action to whoever adds it and
 * **refuses an owner who was not in the room**. Offering a picker of the whole
 * company here would put a control on screen whose only outcome, for most of
 * its options, is a refusal.
 */
function AddItemDialog({
  meetingId,
  onClose,
  onDone,
}: {
  meetingId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const mutations = useOneOnOneMutations();
  const toast = useToast();
  const [kind, setKind] = useState<ApiItemKind>("ACTION");
  const [text, setText] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <Modal
      open
      onClose={onClose}
      title="Add to this one-to-one"
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="accent"
            loading={busy}
            disabled={text.trim() === ""}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setFailure(null);
                try {
                  await mutations.addItem(meetingId, {
                    kind,
                    text,
                    ...(kind === "ACTION" && dueDate ? { dueDate } : {}),
                  });
                  toast.push({ tone: "success", title: "Added" });
                  onDone();
                } catch (error) {
                  setFailure(
                    error instanceof ApiError
                      ? error.message
                      : "Something went wrong. Try again.",
                  );
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Check aria-hidden="true" className="size-4" />
            Add it
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What kind">
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value as ApiItemKind)}
          >
            <option value="ACTION">Something to do</option>
            <option value="TALKING_POINT">Something to discuss</option>
          </Select>
        </Field>
        <Field label="What">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={
              kind === "ACTION" ? "Send the Kano numbers" : "The Kano rollout"
            }
          />
        </Field>
        {kind === "ACTION" && (
          <>
            <Field label="By when" help="Optional.">
              <Input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
              />
            </Field>
            <p className="text-meta text-faint">
              It will be yours. An action belongs to one of the two people in
              the one-to-one — work for anybody else belongs where they will see
              it.
            </p>
          </>
        )}
        {failure && (
          <Callout tone="danger" title="That was refused">
            {failure}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
