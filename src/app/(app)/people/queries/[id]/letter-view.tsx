"use client";

import { Card, CardBody, CardHeader } from "@/components/ui";
import {
  QUERY_CHANGES_NOTHING,
  SERVED_HOW_LABEL,
  type ApiQueryDetail,
} from "@/lib/api/queries";
import { useOrgTimezone } from "@/lib/store/session";
import { dayLabel } from "@/lib/store/conduct";
import { formatDateTime } from "@/lib/time";
import { QueryFiles } from "./query-files";

/**
 * The letter as it was issued, read only.
 *
 * Typed text is shown as typed (line breaks kept) and **never turned into links**. A letter about
 * somebody's conduct is not a place for a clickable address somebody pasted in, and what was
 * written is what is on the record.
 *
 * Every field is shown only if the server sent it: a rule relied on that was left empty draws no
 * row, never a row reading "None". The reply-by time is the **current** one, and an extension is
 * listed with its reason beside the original, so a reader sees both.
 */
export function LetterView({
  detail,
  refresh,
}: {
  detail: ApiQueryDetail;
  refresh: () => Promise<void>;
}) {
  const timeZone = useOrgTimezone();
  const letterFiles = detail.files.filter((file) => file.role === "LETTER");
  const served = detail.served;
  const told =
    served.how === "IN_PRODUCT" && !served.nobodyToldInProduct
      ? null
      : "Nobody was told in the product.";

  return (
    <Card>
      <CardHeader
        title="The letter"
        description={
          detail.reference
            ? `${detail.reference}${detail.issuedBy ? `, issued by ${detail.issuedBy}` : ""}${detail.issuedAt ? ` on ${formatDateTime(detail.issuedAt, timeZone)}` : ""}.`
            : undefined
        }
      />
      <CardBody className="flex flex-col gap-5">
        <Block label="Subject">
          <p className="text-h4 text-ink">{detail.subjectLine}</p>
        </Block>

        {detail.whatHappened && (
          <Block label="What happened">
            <Typed>{detail.whatHappened}</Typed>
            {detail.incidentOn && (
              <p className="mt-1 text-meta text-muted">
                {detail.incidentUntil
                  ? `From ${dayLabel(detail.incidentOn)} to ${dayLabel(detail.incidentUntil)}`
                  : `On ${dayLabel(detail.incidentOn)}`}
              </p>
            )}
          </Block>
        )}

        {detail.rulesRelied && (
          <Block label="Rules or policies relied on">
            <Typed>{detail.rulesRelied}</Typed>
          </Block>
        )}

        {detail.question && (
          <Block label="The question">
            <Typed>{detail.question}</Typed>
          </Block>
        )}

        <dl className="grid gap-x-8 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
          {detail.replyBy && (
            <Fact label="Reply by">
              {formatDateTime(detail.replyBy, timeZone)}
            </Fact>
          )}
          {served.how && (
            <Fact label="Served">
              {SERVED_HOW_LABEL[served.how]}
              {served.how === "IN_PERSON" && served.at && (
                <span className="block text-meta text-muted">
                  Handed over {formatDateTime(served.at, timeZone)}
                  {served.handedByName ? ` by ${served.handedByName}` : ""}
                  {served.witnessName
                    ? `, witnessed by ${served.witnessName}`
                    : ""}
                </span>
              )}
              {served.refusedToReceive && (
                <span className="block text-meta text-muted">
                  Recorded: they refused to receive it at the hand-over.
                </span>
              )}
              {served.note && (
                <span className="block text-meta text-muted">
                  {served.note}
                </span>
              )}
              {told && (
                <span className="block text-meta text-muted">{told}</span>
              )}
            </Fact>
          )}
        </dl>

        {detail.extensions.length > 0 && (
          <div className="flex flex-col gap-1 text-body-sm text-body">
            {detail.extensions.map((extension) => (
              <p key={extension.createdAt + extension.newReplyBy}>
                The reply-by time was moved from{" "}
                {formatDateTime(extension.previousReplyBy, timeZone)} to{" "}
                {formatDateTime(extension.newReplyBy, timeZone)}
                {extension.reason ? `: ${extension.reason}` : "."}
              </p>
            ))}
          </div>
        )}

        {letterFiles.length > 0 && (
          <Block label="Attached to the letter">
            <QueryFiles
              queryId={detail.id}
              role="LETTER"
              files={letterFiles}
              canAdd={false}
              canRemove={false}
              onChanged={refresh}
            />
          </Block>
        )}

        <p className="text-meta text-muted">{QUERY_CHANGES_NOTHING}</p>
      </CardBody>
    </Card>
  );
}

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-meta font-semibold text-muted">{label}</p>
      {children}
    </div>
  );
}

function Typed({ children }: { children: string }) {
  return (
    <p className="whitespace-pre-line break-words text-body-sm text-ink">
      {children}
    </p>
  );
}

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-meta font-semibold text-muted">{label}</dt>
      <dd className="text-body-sm text-ink">{children}</dd>
    </div>
  );
}

export { Block, Fact, Typed };
