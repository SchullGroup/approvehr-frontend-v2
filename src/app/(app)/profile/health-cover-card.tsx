"use client";

import { Copy } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  LoadState,
  Money,
  Skeleton,
  useToast,
} from "@/components/ui";
import type { ApiHealthCover, ApiMyHealthCover } from "@/lib/api/benefits";
import { useMyHealthCover } from "@/lib/store/benefits";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * Your HMO: who it is with, the number on your card, and what it costs you.
 *
 * ## Who it is for
 *
 * Every member of staff, on their own profile. The API reads the employee from
 * the session, so there is no id to pass and nobody else's cover to reach — the
 * same reason `/profile` may show loans and a rota to a person with no
 * permissions at all.
 *
 * ## Absent is absent
 *
 * A provider, a member ID or a start date nobody has entered reads **"Not on
 * file"** — never a blank and never a zero. Both are optional for the company, so
 * none of it is styled as a gap: a company that has not entered member IDs is not
 * doing anything wrong, and an employee should not read their own empty card as
 * an alarm.
 *
 * ## Two figures, kept apart
 *
 * What comes off your pay and what the company pays are different sentences, the
 * second of which only exists for a plan in Benefits. Merging them into one
 * "cost" would claim the company's premium reduced somebody's salary (see the
 * header of `lib/api/benefits.ts`).
 *
 * ## Offline
 *
 * Renders nothing. Benefits has no demo mode — see `store/benefits.ts` — because
 * an invented provider and member ID are exactly what somebody would copy into an
 * HMO's portal.
 */
export function HealthCoverCard() {
  const mine = useMyHealthCover();

  /* Demo or offline: nothing, not an empty card. */
  if (!mine.available) return null;
  /* An API that predates this answers 404. That is "not available here", not a
     failure the person can do anything about. */
  if (mine.error?.status === 404) return null;

  return (
    <LoadState
      loading={mine.loading}
      error={mine.error}
      subject="your HMO"
      onRetry={mine.reload}
      hasData={mine.data !== null}
      skeleton={<Skeleton className="h-40 w-full" />}
    >
      {mine.data && <HealthCover data={mine.data} />}
    </LoadState>
  );
}

function HealthCover({ data }: { data: ApiMyHealthCover }) {
  const nothing = data.covers.length === 0 && data.memberNumber === null;

  return (
    <Card>
      <CardHeader
        title="Your HMO"
        level={3}
        description="What your company has set up for you. Ask your people team to change any of it."
      />
      <CardBody className="flex flex-col gap-5">
        {nothing ? (
          <p className="text-body-sm text-muted">
            Your company hasn&apos;t set up an HMO for you.
          </p>
        ) : (
          <>
            <MemberId value={data.memberNumber} />
            {data.covers.map((cover, index) => (
              <CoverBlock
                key={`${cover.source}-${cover.name}-${String(index)}`}
                cover={cover}
                /* Only name the cover when there is more than one to tell apart. */
                titled={data.covers.length > 1}
              />
            ))}
            {data.covers.length === 0 && (
              <p className="text-body-sm text-muted">
                You are not on an HMO plan right now.
              </p>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}

/** The one thing somebody opens this card to copy. */
function MemberId({ value }: { value: string | null }) {
  const toast = useToast();

  const copy = async () => {
    if (value === null) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.push({ title: "Member ID copied", tone: "success" });
    } catch {
      toast.push({
        title: "Could not copy it",
        tone: "danger",
        detail: "Select the number and copy it by hand.",
      });
    }
  };

  return (
    <div>
      <p className="text-body-sm text-muted">Member ID</p>
      {value === null ? (
        <p className="mt-0.5 text-body-sm text-muted">
          Not on file. Ask your people team to add the number on your HMO card.
        </p>
      ) : (
        <div className="mt-0.5 flex flex-wrap items-center gap-3">
          <p className="tabular select-all break-all text-[1.25rem] font-semibold text-ink">
            {value}
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-label="Copy your member ID"
            onClick={() => void copy()}
          >
            <Copy aria-hidden="true" className="size-4" />
            Copy
          </Button>
        </div>
      )}
    </div>
  );
}

function CoverBlock({
  cover,
  titled,
}: {
  cover: ApiHealthCover;
  titled: boolean;
}) {
  const timeZone = useOrgTimezone();

  const items = [
    {
      term: "Provider",
      value: cover.provider ?? <span className="text-muted">Not on file</span>,
    },
    ...(cover.since === null
      ? []
      : [
          {
            term: "Covered since",
            value: formatDateShort(cover.since, timeZone),
          },
        ]),
    {
      term: "Comes off your pay each month",
      value: (
        <Money
          amount={
            cover.employeeMonthlyKobo === null
              ? null
              : cover.employeeMonthlyKobo / 100
          }
          decimals
          absent="Not on file"
        />
      ),
    },
    /* Plans only. The pay-component HMO records what a person pays and not what
       the company does, so for that one there is no such line rather than a
       "Not on file" that suggests somebody forgot. */
    ...(cover.employerMonthlyKobo === null
      ? []
      : [
          {
            term: "Paid by your company each month",
            value: <Money amount={cover.employerMonthlyKobo / 100} decimals />,
          },
        ]),
    ...(cover.dependants === null
      ? []
      : [
          {
            term: "People covered besides you",
            value: String(cover.dependants),
          },
        ]),
  ];

  return (
    <div className="flex flex-col gap-3">
      {titled && (
        <p className="text-body-sm font-semibold text-ink">{cover.name}</p>
      )}
      <DescriptionList items={items} />
    </div>
  );
}
