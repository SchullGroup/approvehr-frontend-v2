"use client";

import { useState } from "react";
import { MessageSquare, Plus } from "lucide-react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  FilterBar,
  LoadState,
  Pagination,
  RowActions,
  Select,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  useToast,
  type AppliedFilter,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  hrMayRecordConsent,
  hrMayRecordOptOut,
  howOptedIn,
  howOptedOut,
  lastTextSummary,
  smsApi,
  type ApiSmsChange,
  type ApiSmsSubscription,
  type SmsSubscriptionState,
} from "@/lib/api/sms";
import { useOrgTimezone } from "@/lib/store/session";
import { useSmsSubscriptions } from "@/lib/store/sms";
import { formatDateShort } from "@/lib/time";
import { useListQuery } from "@/lib/use-list-query";
import { useAction } from "@/lib/use-action";
import { RecordConsentDialog, type ConsentTarget } from "./consent-dialog";

/**
 * Who has said yes, who has said no, and how.
 *
 * ## What each row says
 *
 * A person, the state, the number masked to its last four digits, how consent was
 * given (or how it was withdrawn), and what happened to their last text. Two short
 * lines at most in a cell. The number is never shown in full to anybody but the
 * person it belongs to.
 *
 * ## The menu says what HR cannot do
 *
 * **HR cannot undo an opt-out the employee made**, by the app, by STOP or by the
 * stop link. Only they can opt back in. That row's "Record written consent" is
 * listed and dimmed with the reason, and not hidden: hiding it would leave a reader
 * wondering where it went. An opt-out HR recorded can be taken back by HR. Opting
 * somebody out is always open.
 *
 * ## What is not here, and why
 *
 * No search: the API's list takes a page and a state and nothing else. The state
 * filter is behind the icon, with the chip outside it, so a narrowed list says so.
 */

const STATE_FILTERS: { value: "" | SmsSubscriptionState; label: string }[] = [
  { value: "", label: "Everyone" },
  { value: "OPTED_IN", label: "Opted in" },
  { value: "OPTED_OUT", label: "Opted out" },
];

type Filters = { state: "" | SmsSubscriptionState };

export function PeopleTab({ onChanged }: { onChanged: () => void }) {
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const { run, pending } = useAction();
  const list = useListQuery<Filters>({ filters: { state: "" }, pageSize: 25 });
  const subs = useSmsSubscriptions({
    page: list.page,
    pageSize: list.pageSize,
    ...(list.filters.state ? { state: list.filters.state } : {}),
  });

  /* `"choose"` is HR picking a person, an object is a row's own. */
  const [consenting, setConsenting] = useState<ConsentTarget | "choose" | null>(
    null,
  );
  const [stopping, setStopping] = useState<ApiSmsSubscription | null>(null);

  const applied: AppliedFilter[] = list.filters.state
    ? [
        {
          label: "State",
          value:
            STATE_FILTERS.find((option) => option.value === list.filters.state)
              ?.label ?? list.filters.state,
          onClear: () => list.setFilter("state", ""),
        },
      ]
    : [];

  const changed = () => {
    subs.reload();
    onChanged();
  };

  function recorded(result: ApiSmsChange) {
    setConsenting(null);
    changed();
    toast.push({
      /* A consent that nothing can act on yet is worth a second look; one that
         will be confirmed by text is the system working. */
      tone: result.confirmationQueued ? "success" : "warning",
      title: result.changed ? "Consent recorded" : "Already on",
      detail: result.note,
    });
  }

  async function confirmOptOut() {
    if (!stopping) return;
    const row = stopping;
    const outcome = await run(() => smsApi.recordOptOut(row.employeeId), {
      success: `${row.name} is opted out`,
      subject: "the opt-out",
      onDone: changed,
    });
    if (outcome.ok) setStopping(null);
  }

  const rows = subs.data?.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <FilterBar
        applied={applied}
        onClearAll={list.clearFilters}
        count={subs.data?.meta.total}
        noun={["person", "people"]}
        actions={
          <Button
            size="sm"
            variant="accent"
            onClick={() => setConsenting("choose")}
          >
            <Plus aria-hidden="true" className="size-4" />
            Record written consent
          </Button>
        }
      >
        <Field label="State">
          <Select
            value={list.filters.state}
            onChange={(event) =>
              list.setFilter("state", event.target.value as Filters["state"])
            }
          >
            {STATE_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </FilterBar>

      <LoadState
        loading={subs.loading}
        error={subs.error}
        subject="the people who have opted in"
        onRetry={subs.reload}
        missingMeans="module"
        skeleton="table"
      >
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={<MessageSquare aria-hidden="true" />}
            title={applied.length > 0 ? "Nothing matches" : "Nobody yet"}
            description={
              applied.length > 0
                ? "Clear the filter to see everyone."
                : "People opt in on their own profile. You can record a signed form for them."
            }
          />
        ) : (
          <div
            aria-busy={subs.refreshing}
            className={cn(
              "overflow-hidden rounded-lg border border-line bg-surface transition-opacity",
              subs.refreshing && "opacity-60",
            )}
          >
            <TableWrap
              caption="People and their text message consent"
              className="rounded-none border-0"
            >
              <THead>
                <TH>Person</TH>
                <TH>State</TH>
                <TH>Number</TH>
                <TH>Consent</TH>
                <TH>Last text</TH>
                <TH />
              </THead>
              <TBody>
                {rows.map((row) => (
                  <Row
                    key={row.employeeId}
                    row={row}
                    timeZone={timeZone}
                    onConsent={() =>
                      setConsenting({ id: row.employeeId, name: row.name })
                    }
                    onOptOut={() => setStopping(row)}
                  />
                ))}
              </TBody>
            </TableWrap>
            <Pagination
              page={list.page}
              pageSize={list.pageSize}
              total={subs.data?.meta.total}
              onPageChange={list.setPage}
              onPageSizeChange={list.setPageSize}
              noun={["person", "people"]}
              loading={subs.refreshing}
            />
          </div>
        )}
      </LoadState>

      {consenting !== null && (
        <RecordConsentDialog
          target={consenting === "choose" ? null : consenting}
          onClose={() => setConsenting(null)}
          onDone={recorded}
        />
      )}

      {stopping && (
        <ConfirmDialog
          open
          tone="primary"
          title={`Record an opt-out for ${stopping.name}?`}
          body="They stop getting the weekly text straight away. You can record written consent again later."
          confirmLabel="Record opt-out"
          loading={pending}
          onClose={() => setStopping(null)}
          onConfirm={() => void confirmOptOut()}
        />
      )}
    </div>
  );
}

function Row({
  row,
  timeZone,
  onConsent,
  onOptOut,
}: {
  row: ApiSmsSubscription;
  timeZone: string;
  onConsent: () => void;
  onOptOut: () => void;
}) {
  const optedIn = row.state === "OPTED_IN";
  const how = optedIn ? howOptedIn(row) : howOptedOut(row);
  const at = optedIn ? row.optedInAt : row.optedOutAt;
  const detail = [how.by, at ? formatDateShort(at, timeZone) : ""]
    .filter((part) => part !== "")
    .join(", ");

  const consent = hrMayRecordConsent(row);
  const stop = hrMayRecordOptOut(row);
  const last = row.lastMessage ? lastTextSummary(row.lastMessage) : null;

  return (
    <TR>
      <TDPrimary title={row.name} subtitle={row.employeeNo} />
      <TD>
        <Badge tone={optedIn ? "accent" : "neutral"} size="sm">
          {optedIn ? "Opted in" : "Opted out"}
        </Badge>
      </TD>
      <TD className="tabular whitespace-nowrap">{row.phoneMasked}</TD>
      <TD>
        <span className="block whitespace-nowrap text-body-sm text-ink">
          {how.how}
        </span>
        {detail && (
          <span className="mt-0.5 block whitespace-nowrap text-meta text-muted">
            {detail}
          </span>
        )}
      </TD>
      <TD>
        {last && row.lastMessage ? (
          <>
            <Badge tone={last.attention ? "warning" : "neutral"} size="sm">
              {last.label}
            </Badge>
            <span className="mt-1 block whitespace-nowrap text-meta text-muted">
              {last.kind}, {formatDateShort(row.lastMessage.at, timeZone)}
            </span>
          </>
        ) : (
          <span className="text-body-sm text-muted">No text yet</span>
        )}
      </TD>
      <TD align="right">
        <RowActions
          label={`More actions for ${row.name}`}
          items={[
            {
              label: "Record written consent",
              onSelect: onConsent,
              disabled: !consent.allowed,
              ...(consent.allowed ? {} : { hint: consent.why }),
            },
            {
              label: "Record opt-out",
              onSelect: onOptOut,
              disabled: !stop.allowed,
              ...(stop.allowed ? {} : { hint: stop.why }),
            },
          ]}
        />
      </TD>
    </TR>
  );
}
