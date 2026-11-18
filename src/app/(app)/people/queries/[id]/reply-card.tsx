"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  FieldRow,
  FileField,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  ONCE_SENT,
  QUERY_LIMITS,
  type ApiQueryDetail,
} from "@/lib/api/queries";
import type { InlineFile } from "@/lib/api/uploads";
import { counter } from "@/lib/queries/draft";
import { dayLabel } from "@/lib/store/conduct";
import { useQueryActions } from "@/lib/store/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";
import { actionMessage } from "@/lib/use-action";
import { Typed } from "./letter-view";
import { QUERY_FILE_ACCEPT, QueryFiles } from "./query-files";

/**
 * The reply: the person's one written answer, frozen when it is sent.
 *
 * ## One reply, and nothing edits it afterwards
 *
 * There is no route that changes a sent reply, so the button says what it is for and the sentence
 * that matters is **on the page before the button**, not behind a hover: *Once sent, a reply cannot
 * be changed.* Until it is sent the box is a draft only the person can read: staff are never shown
 * an unsent reply, and nothing here guesses at one.
 *
 * ## A late reply is a reply
 *
 * It is accepted and labelled by the server (`replyStateLabel`). This card shows that sentence and
 * adds nothing: a late reply is never marked down, and a missing one is never described as a
 * refusal.
 *
 * ## A person with no sign-in replies on paper
 *
 * Staff type the words from the signed copy and attach the scan. The record says who entered it and
 * that it came from paper, and the server refuses it for anybody who has a sign-in: nobody replies
 * in the product in somebody else's name (`can.enterPaperReply` already says so).
 */
export function ReplyCard({
  detail,
  isSubject,
  publish,
  refresh,
}: {
  detail: ApiQueryDetail;
  isSubject: boolean;
  publish: (detail: ApiQueryDetail) => void;
  refresh: () => Promise<void>;
}) {
  const reply = detail.reply;
  const timeZone = useOrgTimezone();

  if (detail.status === "DRAFT") return null;

  const sent = reply?.sent === true;
  const replyFiles = detail.files.filter((file) => file.role === "REPLY");

  if (sent && reply) {
    return (
      <Card>
        <CardHeader
          title={isSubject ? "Your reply" : "Their reply"}
          description={
            reply.source === "FROM_PAPER"
              ? `Entered from paper${reply.enteredByName ? ` by ${reply.enteredByName}` : ""}${reply.receivedOn ? `, signed copy received on ${dayLabel(reply.receivedOn)}` : ""}.`
              : reply.sentAt
                ? `Sent in the product on ${formatDateTime(reply.sentAt, timeZone)}.`
                : "Sent in the product."
          }
        />
        <CardBody className="flex flex-col gap-4">
          <Typed>{reply.body}</Typed>
          {replyFiles.length > 0 && (
            <QueryFiles
              queryId={detail.id}
              role="REPLY"
              files={replyFiles}
              canAdd={false}
              canRemove={false}
              onChanged={refresh}
            />
          )}
          {/* The API's own sentence for how it stands against the reply-by time. */}
          {detail.replyStateLabel && (
            <p className="text-meta text-muted">{detail.replyStateLabel}</p>
          )}
          <p className="text-meta text-muted">
            A sent reply is kept as it was written. It cannot be changed.
          </p>
        </CardBody>
      </Card>
    );
  }

  if (isSubject && detail.can.reply) {
    return (
      <ReplyForm
        key={detail.id}
        detail={detail}
        publish={publish}
        refresh={refresh}
      />
    );
  }

  if (!isSubject && detail.can.enterPaperReply) {
    return <PaperReplyForm key={detail.id} detail={detail} publish={publish} />;
  }

  /* Nothing to say about a reply that has not been sent, beyond the fact. The clock is in the
     status card, in the API's words. */
  if (isSubject) return null;
  return (
    <Card>
      <CardHeader title="Their reply" />
      <CardBody>
        <p className="text-body-sm text-muted">No reply has been sent yet.</p>
      </CardBody>
    </Card>
  );
}

function ReplyForm({
  detail,
  publish,
  refresh,
}: {
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
  refresh: () => Promise<void>;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [saved, setSaved] = useState(detail.reply?.body ?? "");
  const [body, setBody] = useState(detail.reply?.body ?? "");
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = body.trim();
  const dirty = trimmed !== saved.trim();
  const over = trimmed.length > QUERY_LIMITS.reply.max;
  const replyFiles = detail.files.filter((file) => file.role === "REPLY");
  const count = counter(body, QUERY_LIMITS.reply.max, 8000);

  async function save(): Promise<boolean> {
    if (!dirty) return true;
    try {
      const next = await actions.saveReply(detail.id, trimmed);
      publish(next);
      setSaved(next.reply?.body ?? trimmed);
      return true;
    } catch (error) {
      setProblem(actionMessage(error, "your reply"));
      return false;
    }
  }

  async function saveDraft() {
    setBusy("save");
    setProblem(null);
    if (await save()) toast.push({ tone: "success", title: "Draft saved" });
    setBusy(null);
  }

  async function send() {
    setBusy("send");
    setProblem(null);
    try {
      if (!(await save())) {
        setAsking(false);
        return;
      }
      const next = await actions.sendReply(detail.id);
      publish(next);
      setAsking(false);
      toast.push({ tone: "success", title: "Your reply was sent" });
    } catch (error) {
      setProblem(actionMessage(error, "your reply"));
      setAsking(false);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Your reply"
        description="Write it in your own words. Until you send it, only you can read it."
      />
      <CardBody className="flex flex-col gap-4">
        <Field label="Your reply" required>
          <Textarea
            rows={9}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
          {count && (
            <span
              className={
                over ? "text-meta text-danger-text" : "text-meta text-muted"
              }
            >
              {count}
            </span>
          )}
        </Field>

        <div className="flex flex-col gap-2">
          <p className="text-body-sm font-medium text-ink">
            Files to go with it
          </p>
          <QueryFiles
            queryId={detail.id}
            role="REPLY"
            files={replyFiles}
            canAdd
            canRemove
            onChanged={refresh}
            addLabel="Attach a file to your reply"
          />
        </div>

        {/* On the page, before the button, and not behind an icon: it is the one fact the person
            needs before they press it. */}
        <p className="text-body-sm font-medium text-ink">{ONCE_SENT}</p>

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="secondary"
            onClick={() => void saveDraft()}
            disabled={!dirty || trimmed === "" || over || busy !== null}
            loading={busy === "save"}
          >
            Save as a draft
          </Button>
          <Button
            onClick={() => setAsking(true)}
            disabled={trimmed === "" || over || busy !== null}
          >
            Send my reply
          </Button>
        </div>
      </CardBody>

      <Modal
        open={asking}
        onClose={() => {
          if (busy !== "send") setAsking(false);
        }}
        title="Send your reply?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAsking(false)}
              disabled={busy === "send"}
            >
              Keep editing
            </Button>
            <Button onClick={() => void send()} loading={busy === "send"}>
              Send it
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-body-sm text-body">
          <p className="font-medium text-ink">{ONCE_SENT}</p>
          <p>
            A late reply is still accepted. If you need more time, ask the
            person who issued the letter to extend the reply-by time.
          </p>
        </div>
      </Modal>
    </Card>
  );
}

function PaperReplyForm({
  detail,
  publish,
}: {
  detail: ApiQueryDetail;
  publish: (detail: ApiQueryDetail) => void;
}) {
  const toast = useToast();
  const actions = useQueryActions();
  const [body, setBody] = useState("");
  const [receivedOn, setReceivedOn] = useState("");
  const [files, setFiles] = useState<InlineFile[]>([]);
  const [picked, setPicked] = useState<InlineFile | null>(null);
  const [reading, setReading] = useState(false);
  const [box, setBox] = useState(0);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const trimmed = body.trim();
  const ready =
    trimmed !== "" &&
    trimmed.length <= QUERY_LIMITS.reply.max &&
    receivedOn !== "";

  async function send() {
    setBusy(true);
    setProblem(null);
    try {
      const next = await actions.replyFromPaper(detail.id, {
        body: trimmed,
        receivedOn,
        files: files.map((file) => ({
          filename: file.filename,
          contentBase64: file.contentBase64,
        })),
      });
      publish(next);
      setAsking(false);
      toast.push({ tone: "success", title: "Reply entered from paper" });
    } catch (error) {
      setProblem(actionMessage(error, "the reply"));
      setAsking(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="Enter a reply from paper"
        description="This person has no sign-in, so they cannot reply here. Type what the signed copy says and attach the scan."
      />
      <CardBody className="flex flex-col gap-4">
        <Field label="What the signed copy says" required>
          <Textarea
            rows={8}
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <FieldRow>
          <Field label="Signed copy received on" required>
            <Input
              type="date"
              value={receivedOn}
              onChange={(event) => setReceivedOn(event.target.value)}
            />
          </Field>
        </FieldRow>

        <div className="flex flex-col gap-2">
          {files.length > 0 && (
            <ul className="flex flex-col gap-1 text-body-sm text-ink">
              {files.map((file, index) => (
                <li key={`${file.filename}-${String(index)}`}>
                  {file.filename}
                </li>
              ))}
            </ul>
          )}
          {files.length < 5 && (
            <>
              <FileField
                key={box}
                label="Signed scan"
                help="A PDF, a photo or a Word file, up to 10 MB. Up to five files."
                accept={QUERY_FILE_ACCEPT}
                maxBytes={QUERY_LIMITS.fileBytes}
                onAttached={setPicked}
                onBusyChange={setReading}
              />
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!picked || reading}
                  onClick={() => {
                    if (!picked) return;
                    setFiles((current) => [...current, picked]);
                    setPicked(null);
                    setBox((n) => n + 1);
                  }}
                >
                  Add it to the reply
                </Button>
              </div>
            </>
          )}
        </div>

        <p className="text-body-sm font-medium text-ink">
          Once entered, the reply cannot be changed. The record says it came
          from paper and who entered it.
        </p>

        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
        <div>
          <Button onClick={() => setAsking(true)} disabled={!ready || busy}>
            Enter the reply
          </Button>
        </div>
      </CardBody>

      <Modal
        open={asking}
        onClose={() => {
          if (!busy) setAsking(false);
        }}
        title="Enter this reply from paper?"
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setAsking(false)}
              disabled={busy}
            >
              Keep editing
            </Button>
            <Button onClick={() => void send()} loading={busy}>
              Enter it
            </Button>
          </>
        }
      >
        <p className="text-body-sm text-body">
          Check it against the signed copy. A reply entered from paper is kept
          exactly as typed and cannot be changed.
        </p>
      </Modal>
    </Card>
  );
}
