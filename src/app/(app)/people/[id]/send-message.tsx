"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
} from "@/components/ui";
import { NoticeImageField } from "@/components/announcements/notice-image-field";
import {
  announcementsApi,
  type NoticeImageUpload,
} from "@/lib/api/announcements";
import { ApiError } from "@/lib/api/client";

/** The API's caps, the same ones the noticeboard form uses. */
const TITLE_LIMIT = 140;
const BODY_LIMIT = 4_000;

/**
 * "Send message", from a staff record.
 *
 * A notice addressed to this one person (`audience: PEOPLE`), published as it
 * is sent: it goes in their bell, to their email with the picture inline, and
 * onto their dashboard, where nobody else sees it. It is listed under
 * Settings → Announcements with everything else the company has said, and the
 * reader list there shows whether they opened it.
 */
export function SendMessageDialog({
  open,
  onClose,
  employeeId,
  name,
  canSignIn,
}: {
  open: boolean;
  onClose: () => void;
  employeeId: string;
  name: string;
  /** False when we know they cannot sign in; the API would refuse. */
  canSignIn: boolean;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [image, setImage] = useState<NoticeImageUpload | null | undefined>(
    undefined,
  );
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  const titleError =
    trimmedTitle.length > 0 && trimmedTitle.length < 3
      ? "Give it a title of at least three characters."
      : title.length > TITLE_LIMIT
        ? "Shorten the title."
        : undefined;
  const bodyError =
    body.length > BODY_LIMIT ? "That is too long for a message." : undefined;
  const complete =
    canSignIn &&
    trimmedTitle.length >= 3 &&
    trimmedBody.length > 0 &&
    !titleError &&
    !bodyError &&
    !reading;

  function close() {
    setTitle("");
    setBody("");
    setImage(undefined);
    onClose();
  }

  async function send() {
    setBusy(true);
    try {
      const sent = await announcementsApi.create({
        title: trimmedTitle,
        body: trimmedBody,
        audience: "PEOPLE",
        employeeIds: [employeeId],
        ...(image ? { image } : {}),
        publish: true,
      });
      toast.push({
        title: `Sent to ${name}`,
        tone: "success",
        detail:
          sent.delivery && sent.delivery.emailing > 0
            ? "It is in their notifications and on its way to their email."
            : "It is in their notifications. Email is not set up, so no email went out.",
      });
      close();
    } catch (error) {
      toast.push({
        title: "The message was not sent",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={`Send ${name} a message`}
      description="They get it as a notification and by email. Only they can see it."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!complete || busy}
            loading={busy}
            onClick={() => void send()}
          >
            Send message
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        {!canSignIn && (
          <Callout tone="warning" title={`${name} cannot sign in yet`}>
            A message lands in their notifications, which they cannot open
            without an account. Invite them to sign in first.
          </Callout>
        )}

        <Field label="Title" required error={titleError}>
          <Input
            value={title}
            autoFocus
            maxLength={TITLE_LIMIT + 20}
            placeholder="Your new desk from Monday"
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
            }}
          />
        </Field>

        <Field
          label="Message"
          required
          error={bodyError}
          help={`Plain text. A blank line starts a new paragraph. ${
            BODY_LIMIT - body.length
          } characters left.`}
        >
          <Textarea
            value={body}
            rows={7}
            onChange={(event) => {
              const next = event.target.value;
              setBody(next);
            }}
          />
        </Field>

        <NoticeImageField
          value={image}
          onChange={setImage}
          onBusyChange={setReading}
        />
      </div>
    </Modal>
  );
}
