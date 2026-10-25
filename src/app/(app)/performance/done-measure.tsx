"use client";

import { createContext, useContext, useState } from "react";
import { Check } from "lucide-react";
import { Badge, Button, Textarea } from "@/components/ui";
import { LinkedText } from "@/components/ui/linked-text";
import type { ApiKeyResult } from "@/lib/api/performance";
import { useCan } from "@/lib/permissions";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * A measure that is done or not done.
 *
 * ## Who says it is done is not the person it is about
 *
 * A manager confirms it, with an optional note or a link to the evidence; the
 * person whose work it is cannot, and sees a sentence saying who will. A yes
 * typed by the person being judged is the weakest evidence there is, which is
 * why this is its own act and not a number to type into a box. The API enforces
 * it and says why in words about confirming; the screen only declines to offer
 * a button that could never work for this reader.
 *
 * ## Until it is confirmed it counts as not done
 *
 * It is "Not done yet", at 0% in the objective's progress, from the day it is
 * made. That is a real answer rather than a missing one, so it is not "unread"
 * and is not left out: a milestone nobody confirmed by the end of the period was
 * not met.
 *
 * ## The two actions arrive by context
 *
 * Both need the screen's reload and its toast, and the row sits five components
 * below the screen that owns them. The prop is `onRecord`'s sibling for every
 * other kind of measure, and drilling a second and third of them through each of
 * those components would have touched every one of them for no reason.
 */
export type MeasureConfirmActions = {
  /** Resolves true when it was saved; false when the screen already said why not. */
  confirm: (measureId: string, note?: string) => Promise<boolean>;
  unconfirm: (measureId: string) => Promise<boolean>;
};

const MeasureConfirmContext = createContext<MeasureConfirmActions | null>(null);
export const MeasureConfirmProvider = MeasureConfirmContext.Provider;

export function DoneMeasureRow({
  measure,
  goalOwnerId,
}: {
  measure: ApiKeyResult;
  /** Whose objective this is. Null is a company or department objective. */
  goalOwnerId: string | null;
}) {
  const actions = useContext(MeasureConfirmContext);
  const { actingId } = useSession();
  const timeZone = useOrgTimezone();
  const records = useCan("EDIT_RECORDS");

  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const confirmed = Boolean(measure.confirmedAt);
  const isOwner = goalOwnerId !== null && goalOwnerId === actingId;

  /* A button is offered only where it could work. The owner never; a company or
     department objective, which has no owner, only to somebody holding the
     records permission, which is the API's own rule for agreeing one. The
     person who may not is not shown a control that returns a refusal. */
  const act =
    actions !== null && !isOwner && (goalOwnerId !== null || records)
      ? actions
      : null;

  const when = measure.confirmedAt
    ? formatDateShort(measure.confirmedAt, timeZone)
    : null;

  const run = async (act: () => Promise<boolean>) => {
    setBusy(true);
    try {
      return await act();
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-body-sm font-medium text-ink">
          {measure.label}
        </span>
        <Badge
          tone={confirmed ? "accent" : "neutral"}
          size="sm"
          {...(confirmed ? { icon: <Check aria-hidden="true" /> } : {})}
        >
          {confirmed ? "Done" : "Not done yet"}
        </Badge>
      </div>

      {confirmed ? (
        <>
          <p className="text-body-sm text-body">
            Confirmed
            {measure.confirmedByName ? ` by ${measure.confirmedByName}` : ""}
            {when ? ` on ${when}` : ""}.
          </p>
          {measure.confirmNote && (
            <p className="text-body-sm text-body">
              <LinkedText>{measure.confirmNote}</LinkedText>
            </p>
          )}
        </>
      ) : isOwner ? (
        <p className="text-body-sm text-muted">
          Your manager confirms it when it is done.
        </p>
      ) : null}

      {act && !confirmed && !asking && (
        <div>
          <Button size="sm" onClick={() => setAsking(true)}>
            Confirm it is done
            <span className="sr-only">: {measure.label}</span>
          </Button>
        </div>
      )}

      {act && !confirmed && asking && (
        <div className="flex flex-col gap-2">
          <Textarea
            rows={2}
            aria-label={`Note or link for ${measure.label}`}
            placeholder="A note, or a link to the evidence (optional)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="accent"
              size="sm"
              loading={busy}
              onClick={() =>
                void run(async () => {
                  const saved = await act.confirm(
                    measure.id,
                    note.trim() || undefined,
                  );
                  if (saved) {
                    setAsking(false);
                    setNote("");
                  }
                  return saved;
                })
              }
            >
              Confirm<span className="sr-only"> {measure.label}</span>
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setAsking(false);
                setNote("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {act && confirmed && (
        <div>
          <Button
            size="sm"
            loading={busy}
            onClick={() => void run(() => act.unconfirm(measure.id))}
          >
            Take it back
            <span className="sr-only">: {measure.label}</span>
          </Button>
        </div>
      )}
    </li>
  );
}
