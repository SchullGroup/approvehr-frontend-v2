"use client";

import { Button, Modal, TextLink } from "@/components/ui";
import type { AcceptWords } from "@/lib/hiring/hired/copy";

/**
 * Recording that somebody accepted their offer, and saying what that does here.
 *
 * It used to be one press with no question. It now asks, because what it does
 * changed: the person goes on the Hired list, and an employee record is made only if
 * the company's setting says so. The sentence under the title is driven by that
 * setting and by whether the company has Core HR (`whatAcceptingDoes`), and it claims
 * nothing about an employee or an email being created: that is said afterwards, from
 * the API's answer.
 *
 * It stays mounted and is told when to show, so its exit animation runs.
 */
export function AcceptOfferDialog({
  open,
  onClose,
  name,
  words,
  known,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  words: AcceptWords;
  /** The company's setting has been read. Without it the sentence is the cautious one. */
  known: boolean;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={`Record that ${name} accepted?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="approve" loading={busy} onClick={onConfirm}>
            Record accepted
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        <p>This marks the offer as accepted and {name} as hired.</p>
        <p className="font-medium text-ink">{words.headline}</p>
        {words.detail && <p>{words.detail}</p>}
        <p>
          If this takes the last place on the job, the job is marked filled and
          everybody else still in its pipeline is rejected.
        </p>
        {!known && (
          <p>
            <TextLink href="/hiring/settings/accepted-offers">
              Check Accepted offers in Hiring settings
            </TextLink>
          </p>
        )}
      </div>
    </Modal>
  );
}
