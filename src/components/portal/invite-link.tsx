"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button, Callout, useToast } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { invitesApi } from "@/lib/api/invites";

/**
 * The invitation link, when no email can carry it.
 *
 * ## The failure this closes
 *
 * With no mail transport wired, an invitation was a **dead end**: the account is
 * created, nothing is sent, and the API correctly refuses to put a token in an
 * ordinary response in production. So the product could add three hundred staff
 * and sign none of them in, and every screen said the invitation had gone to
 * their email.
 *
 * `POST /invites/:userId/link` is the deliberate exception — `INVITE_STAFF`,
 * `assertCanGrant` over the roles the account holds, refused outright for an
 * account that already has a password, and audited by user. This renders it.
 *
 * ## Taking a link is an act, not a display
 *
 * It is behind a button rather than shown on arrival, and that is not
 * politeness. Each press mints a **fresh** token and invalidates the previous
 * one, so a link somebody was given yesterday stops working. Rendering it
 * automatically would silently break a link already in transit every time
 * somebody opened the dialog.
 *
 * ## And the copy says what it is
 *
 * "Anyone with this link can set the password on that account" is the whole
 * truth about what is on the clipboard, and it belongs next to the button
 * rather than in a document nobody reads. The expiry is stated for the same
 * reason: a link that quietly stopped working is a support ticket.
 */
export function InviteLinkButton({
  userId,
  name,
  /** Rendered before anything is taken. Absent once a link is on screen. */
  hint,
}: {
  userId: string;
  name: string;
  hint?: string;
}) {
  const toast = useToast();
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const take = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const result = await invitesApi.link(userId);
      setLink({ url: result.url, expiresAt: result.expiresAt });
      setCopied(false);
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "Could not get a link just now.",
      );
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.push({ title: "Link copied", tone: "success" });
    } catch {
      /* Clipboard access can be refused — an insecure origin, a browser
         setting, a permission prompt somebody dismissed. The link is on screen
         and selectable either way, so this is a note rather than a failure. */
      setFailed("Could not reach the clipboard. Select the link and copy it.");
    }
  };

  if (!link) {
    return (
      <div className="flex flex-col gap-2">
        {failed && (
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}
        <Button variant="secondary" loading={busy} onClick={() => void take()}>
          <Link2 aria-hidden="true" className="size-3.5" />
          Get a link to send them
        </Button>
        {hint && <p className="text-meta text-muted">{hint}</p>}
      </div>
    );
  }

  const expires = new Date(link.expiresAt);
  const when = Number.isNaN(expires.getTime())
    ? null
    : expires.toLocaleString([], {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      });

  return (
    <Callout tone="warning" title={`Send this to ${name} yourself`}>
      <p>
        Anyone with this link can set the password on that account, so send it
        the way you would send a password.
        {when ? ` It stops working on ${when}.` : ""}
      </p>

      {/* Readonly rather than a paragraph: it has to be selectable on a
          machine where the clipboard is refused, and a wrapped URL in prose is
          almost impossible to select cleanly. */}
      <input
        readOnly
        value={link.url}
        aria-label={`Invitation link for ${name}`}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-3 w-full rounded-md border border-line bg-surface px-2.5 py-2 font-mono text-meta text-ink"
      />

      {failed && <p className="mt-2 text-meta text-danger-text">{failed}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void copy()}>
          {copied ? (
            <Check aria-hidden="true" className="size-3.5" />
          ) : (
            <Copy aria-hidden="true" className="size-3.5" />
          )}
          {copied ? "Copied" : "Copy the link"}
        </Button>
        {/* Taking another invalidates this one, and says so before it does. */}
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={() => void take()}
        >
          Get a new one
        </Button>
      </div>
      <p className="mt-2 text-meta text-muted">
        Getting a new link stops this one working.
      </p>
    </Callout>
  );
}
