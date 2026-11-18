"use client";

import { SERVED_HOW_LABEL, type ApiQueryDetail } from "@/lib/api/queries";
import { useLiveCompanyProfile } from "@/lib/store/company";
import { dayLabel } from "@/lib/store/conduct";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateTime } from "@/lib/time";

/**
 * The printed letter: typed fields, laid out the way the payslip is, printed by the browser.
 *
 * ## Where it comes from
 *
 * Not the server. `lib/pdf.ts` cannot lay a letter out, and a second renderer for one page would be
 * a second place a figure could differ. So this is the page's own fields, drawn for paper, and the
 * browser's print dialog does the rest. The page hides everything else (`print:hidden`), and the
 * shell already carries `no-print`, so what comes out is the letter and nothing of the application
 * around it.
 *
 * ## What is on it, and what is not
 *
 * The company's name and logo, the reference, who issued it and when, who it is for, the typed
 * letter, the reply-by time **in the company's zone**, and how it was served. The employee's number
 * is printed so it cannot be mistaken for another person's. Nothing here says what the outcome is
 * and nothing says that anybody has replied: it is the letter as it was served. A field the server
 * did not send draws nothing, so a letter missing a rule relied on has no line for it, never a line
 * reading "None".
 *
 * The browser's own header and footer (the date, the page title, the address of this page) are the
 * browser's to draw and can be turned off in the print dialog; worth doing before handing a copy to
 * the person.
 */
export function LetterDocument({ detail }: { detail: ApiQueryDetail }) {
  const timeZone = useOrgTimezone();
  const { profile } = useLiveCompanyProfile();
  const served = detail.served;

  return (
    <article className="mx-auto hidden w-full max-w-3xl bg-white p-8 text-black print:block print:max-w-none print:p-0">
      <header className="flex items-start justify-between gap-6 border-b border-black pb-5">
        <div>
          {profile?.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logoUrl}
              alt=""
              className="mb-2 max-h-12 max-w-48 object-contain object-left"
            />
          )}
          {profile?.legalName && (
            <p className="text-lg font-semibold">{profile.legalName}</p>
          )}
          {profile?.rcNumber && <p className="text-sm">{profile.rcNumber}</p>}
          {(profile?.addressLine || profile?.city) && (
            <p className="mt-1 max-w-xs text-sm">
              {[profile.addressLine, profile.city].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
        <div className="text-right text-sm">
          {detail.reference && (
            <p className="text-base font-semibold">{detail.reference}</p>
          )}
          {detail.issuedAt && (
            <p>Issued {formatDateTime(detail.issuedAt, timeZone)}</p>
          )}
          {detail.issuedBy && <p>By {detail.issuedBy}</p>}
        </div>
      </header>

      <section className="border-b border-black py-4 text-sm">
        <p>
          <span className="font-semibold">To:</span> {detail.subject.name}
          {detail.subject.employeeNo ? ` (${detail.subject.employeeNo})` : ""}
        </p>
        <p className="mt-2 text-base font-semibold">{detail.subjectLine}</p>
      </section>

      <section className="flex flex-col gap-4 py-4 text-sm leading-relaxed">
        {detail.whatHappened && (
          <div>
            <p className="font-semibold">What happened</p>
            <p className="whitespace-pre-line break-words">
              {detail.whatHappened}
            </p>
            {detail.incidentOn && (
              <p className="mt-1">
                {detail.incidentUntil
                  ? `From ${dayLabel(detail.incidentOn)} to ${dayLabel(detail.incidentUntil)}.`
                  : `On ${dayLabel(detail.incidentOn)}.`}
              </p>
            )}
          </div>
        )}
        {detail.rulesRelied && (
          <div>
            <p className="font-semibold">Rules or policies relied on</p>
            <p className="whitespace-pre-line break-words">
              {detail.rulesRelied}
            </p>
          </div>
        )}
        {detail.question && (
          <div>
            <p className="font-semibold">You are asked to explain</p>
            <p className="whitespace-pre-line break-words">{detail.question}</p>
          </div>
        )}
        {detail.replyBy && (
          <p className="font-semibold">
            Please reply by {formatDateTime(detail.replyBy, timeZone)}.
          </p>
        )}
      </section>

      <footer className="border-t border-black pt-3 text-meta">
        {served.how && (
          <p>
            Served: {SERVED_HOW_LABEL[served.how]}
            {served.how === "IN_PERSON" && served.at
              ? `, handed over ${formatDateTime(served.at, timeZone)}${served.handedByName ? ` by ${served.handedByName}` : ""}${served.witnessName ? `, witnessed by ${served.witnessName}` : ""}`
              : ""}
            .
          </p>
        )}
        <p className="mt-1">
          A query changes no pay, no employment status and no exit. Receiving it
          is not agreeing with it.
        </p>
      </footer>
    </article>
  );
}
