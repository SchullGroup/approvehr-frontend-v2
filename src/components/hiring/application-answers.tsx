"use client";

import { Fragment } from "react";
import { Flag, Link2, ShieldCheck } from "lucide-react";
import {
  Badge,
  Callout,
  Disclosure,
  LinkedText,
  TextLink,
} from "@/components/ui";
import { OpenCv } from "@/components/hiring/open-cv";
import {
  DUPLICATE_REASON,
  hasExtras,
  wordsLabel,
  type AnswerRow,
  type ApplicationExtras,
} from "@/lib/hiring/answers-view";

/**
 * What an applicant answered, what they agreed to, and what to look at twice.
 *
 * ## "Needs a look" is a prompt, not a verdict
 *
 * A knockout answer raises a flag, and the flag is drawn calmly — amber, a flag
 * icon, the words "Needs a look" — and never in the red of a rejection. Nobody is
 * turned down because of it; the sentence at the top says so every time, because
 * the person reading is the one who decides, and a screen that looks like a
 * decision invites them to accept it.
 *
 * ## A duplicate is a marker, not a merge
 *
 * Somebody who applied twice, or for two adverts, or from two addresses with one
 * phone number, is shown as a possible duplicate with a link to the earlier one.
 * Nothing is merged or hidden: whether they are the same person is a judgement.
 *
 * ## Files are never links
 *
 * An answer that is a file is opened the way a CV is — one audited request, one
 * short-lived address — through `openFile`. Nothing here holds an address.
 */
export function ApplicationAnswers({
  extras,
  openFile,
  compact = false,
}: {
  extras: ApplicationExtras;
  /** Opens one answer's file; absent when this reader may not, or in a demo. */
  openFile?:
    | ((
        answerId: string,
      ) => Promise<{ url: string | null; note: string | null }>)
    | undefined;
  /** For a queue row: the answers sit behind a disclosure. */
  compact?: boolean;
}) {
  const answered = extras.answers.filter(
    (row) => row.text !== null || row.file,
  );

  const answersBlock = (
    <ul className="flex list-none flex-col gap-2.5 p-0">
      {extras.answers.map((row) => (
        <li key={row.id}>
          <AnswerItem row={row} openFile={openFile} />
        </li>
      ))}
    </ul>
  );

  return (
    <div data-testid="application-answers" className="flex flex-col gap-3.5">
      {extras.flagCount > 0 && (
        <Callout tone="warning" title="Needs a look">
          {extras.flagCount === 1
            ? "One answer raised a flag."
            : `${extras.flagCount} answers raised a flag.`}{" "}
          A flag asks a person to read the answer. It is not a decision, and
          nobody is rejected because of it.
        </Callout>
      )}

      {extras.duplicate && (
        <p
          data-testid="duplicate-marker"
          className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-canvas px-3 py-2.5 text-body-sm text-body"
        >
          <Link2 aria-hidden="true" className="size-4 shrink-0 text-faint" />
          <span>
            Possible duplicate:{" "}
            {extras.duplicate.ofName ?? "an earlier application"} gave{" "}
            {DUPLICATE_REASON[extras.duplicate.reason]}.
          </span>
          <TextLink
            href={`/hiring/candidates/${extras.duplicate.ofId}`}
            className="text-body-sm"
          >
            See the earlier one
          </TextLink>
        </p>
      )}

      {(extras.reference || extras.source) && (
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-muted">
          {extras.reference && (
            <span>
              Reference{" "}
              <span className="tabular font-medium text-ink">
                {extras.reference}
              </span>
            </span>
          )}
          {extras.source && (
            <span>
              Came from{" "}
              <span className="font-medium text-ink">{extras.source}</span>
            </span>
          )}
        </p>
      )}

      {extras.answers.length > 0 &&
        (compact ? (
          <Disclosure
            title="Their answers"
            meta={
              <span className="flex items-center gap-1.5 text-meta text-muted">
                {answered.length} of {extras.answers.length} answered
                {extras.flagCount > 0 && (
                  <Badge tone="warning" size="sm">
                    Needs a look
                  </Badge>
                )}
              </span>
            }
            dense
          >
            {answersBlock}
          </Disclosure>
        ) : (
          <div>
            <h3 className="mb-2 text-meta font-semibold text-muted">
              Their answers
            </h3>
            {answersBlock}
          </div>
        ))}

      {extras.consent && <ConsentLine consent={extras.consent} />}
    </div>
  );
}

/** True when there is anything for `ApplicationAnswers` to draw. */
export { hasExtras };

/* -------------------------------------------------------------------------- */

function AnswerItem({
  row,
  openFile,
}: {
  row: AnswerRow;
  openFile:
    | ((
        answerId: string,
      ) => Promise<{ url: string | null; note: string | null }>)
    | undefined;
}) {
  return (
    <div
      data-testid="answer-row"
      data-flagged={row.flagged ? "true" : "false"}
      className="rounded-md border border-line p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-body-sm font-medium text-ink">{row.label}</p>
        {row.flagged && (
          <Badge tone="warning" size="sm">
            <Flag aria-hidden="true" className="size-3" />
            Needs a look
          </Badge>
        )}
      </div>

      {row.file ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate text-body-sm text-body">
            Attached file
            <span className="tabular text-meta text-muted">
              {" "}
              · {row.file.description}
            </span>
          </span>
          {row.file.scanStatus === "INFECTED" ? (
            <Badge tone="danger" size="sm">
              Flagged by the virus check
            </Badge>
          ) : (
            openFile && (
              <OpenCv open={() => openFile(row.id)} label="Open file" />
            )
          )}
        </div>
      ) : row.text === null ? (
        <p className="mt-1.5 text-body-sm italic text-faint">Left blank</p>
      ) : row.link ? (
        <p className="mt-1.5 break-all text-body-sm">
          <TextLink
            href={row.link}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {row.text}
          </TextLink>
        </p>
      ) : (
        <p className="mt-1.5 whitespace-pre-line text-body-sm leading-relaxed text-body">
          <LinkedText>{row.text}</LinkedText>
        </p>
      )}

      {row.words !== null && row.text !== null && (
        <p className="tabular mt-1.5 text-meta text-muted">
          {wordsLabel(row.words)}
        </p>
      )}

      {row.flagged && row.flagReason && (
        <p className="mt-1.5 text-body-sm text-warning-text">
          {row.flagReason}
        </p>
      )}
    </div>
  );
}

function ConsentLine({
  consent,
}: {
  consent: NonNullable<ApplicationExtras["consent"]>;
}) {
  return (
    <Fragment>
      <div
        data-testid="consent-record"
        className="flex flex-col gap-1.5 rounded-md border border-line p-3"
      >
        <p className="flex items-center gap-2 text-body-sm font-medium text-ink">
          <ShieldCheck aria-hidden="true" className="size-4 text-faint" />
          Agreed to the privacy notice on{" "}
          <span className="tabular">{consent.acceptedOn}</span>
        </p>
        <Disclosure
          title="The notice they were shown"
          meta={
            consent.noticeRef ? (
              <span className="text-meta text-muted">{consent.noticeRef}</span>
            ) : undefined
          }
          dense
        >
          <p className="whitespace-pre-line text-body-sm leading-relaxed text-body">
            {consent.noticeText}
          </p>
        </Disclosure>
      </div>
    </Fragment>
  );
}
