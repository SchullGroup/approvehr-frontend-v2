"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquareText, ShieldAlert } from "lucide-react";
import {
  Badge,
  Callout,
  Card,
  Checkbox,
  EmptyState,
  Input,
  LoadState,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  TextLink,
  type TabItem,
} from "@/components/ui";
import {
  OUTCOME_LABEL,
  REGISTER_STATE_LABEL,
  STATUS_LABEL,
  isModuleOff,
  replyBadgeText,
  type ApiQuerySummary,
  type QueryRegisterState,
} from "@/lib/api/queries";
import { useCan } from "@/lib/permissions";
import {
  DEMO_QUERY_HEADING,
  DEMO_QUERY_REASON,
  useQueriesSwitch,
  useQueryRegister,
} from "@/lib/store/queries";
import { useDebounced } from "@/lib/use-debounced";
import { MyDrafts } from "./my-drafts";

const ALL = "all";

const TABS: TabItem[] = [
  { id: ALL, label: "All" },
  ...(
    [
      "awaiting_reply",
      "no_reply_by_deadline",
      "replied",
      "draft",
      "closed",
      "withdrawn",
    ] as const
  ).map((id) => ({ id, label: REGISTER_STATE_LABEL[id] })),
];

/**
 * The register: every query in the company, for the people who write or decide them.
 *
 * ## Who it is for, and who it is not
 *
 * `ISSUE_QUERIES` or `DECIDE_QUERIES`, either one. The person a query is addressed to never comes
 * here: their way in is the notification and the "Letters from HR" entry on their own profile, and
 * this register is **never** the caller's own query (the API leaves it out), so somebody who is
 * both staff and a subject reads theirs as the person only.
 *
 * ## "No reply in time" is a label, and the register says it in the API's words
 *
 * It is worked out from the reply-by time on every read and is not a state. It is shown as a
 * plain badge in a neutral colour and the row carries the API's own sentence
 * ("No reply by 14 Nov 2026, 5:00 pm."). It is never red and never says refused, ignored or
 * failed: a missing reply can be a missed notification, leave, or a phone with no data. A person
 * who was served on paper, or who has no sign-in, shows no more than a clock.
 */
export function QueriesScreen({ subjectId }: { subjectId?: string }) {
  const canIssue = useCan("ISSUE_QUERIES");
  const canDecide = useCan("DECIDE_QUERIES");
  const canDraft = useCan("DRAFT_QUERIES");
  const canSettings = useCan("MANAGE_SETTINGS");
  const queries = useQueriesSwitch();

  const [tab, setTab] = useState<string>(ALL);
  const [text, setText] = useState("");
  const [archived, setArchived] = useState(false);
  const [byManagers, setByManagers] = useState(false);
  const q = useDebounced(text.trim(), 250);

  const works = canIssue || canDecide;
  const register = useQueryRegister(
    {
      ...(tab !== ALL ? { state: tab as QueryRegisterState } : {}),
      ...(q ? { q } : {}),
      ...(subjectId ? { subjectId } : {}),
      ...(byManagers ? { startedByManager: true } : {}),
      ...(archived || subjectId ? { includeArchived: true } : {}),
    },
    works && queries.on,
  );

  if (register.unavailable) {
    return (
      <Callout tone="info" title={DEMO_QUERY_HEADING}>
        {DEMO_QUERY_REASON}
      </Callout>
    );
  }

  /* A line manager given the drafting permission and neither of the others: one route, a different
     reader. Their screen is their own drafts and nothing of the company's register. */
  if (!works && canDraft) {
    if (queries.known && !queries.on) return <ModuleOff canSettings={false} />;
    return <MyDrafts />;
  }

  if (!works) {
    return (
      <EmptyState
        plain
        icon={<ShieldAlert aria-hidden="true" className="size-5" />}
        title="You cannot open the queries register"
        description="Writing, reading and deciding queries is held by the people given the Issue queries or Decide queries permission."
      />
    );
  }

  /* The server is the authority on the switch, and the sidebar's copy of it is a default until the
     read lands: a refusal that says `module_off` wins over a flag that has not arrived. */
  if (isModuleOff(register.error) || (queries.known && !queries.on)) {
    return <ModuleOff canSettings={canSettings} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {subjectId && (
        <p className="text-body-sm text-body">
          Showing the queries about one person.{" "}
          <TextLink href="/people/queries">Show all queries</TextLink>
        </p>
      )}
      <Tabs items={TABS} value={tab} onChange={setTab} />
      <div className="flex flex-wrap items-center gap-4">
        <div className="min-w-0 grow sm:max-w-sm">
          <Input
            type="search"
            aria-label="Search the register"
            placeholder="Search by person, reference or subject"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Checkbox
          label="Show archived"
          checked={archived}
          onChange={(event) => setArchived(event.target.checked)}
        />
        <Checkbox
          label="Drafted by managers"
          checked={byManagers}
          onChange={(event) => setByManagers(event.target.checked)}
        />
        <TextLink href="/people/queries/counts">Counts</TextLink>
      </div>

      <Card>
        <LoadState
          loading={register.loading}
          error={register.error}
          subject="the queries register"
          onRetry={register.reload}
          hasData={register.data !== null}
          skeleton="list"
        >
          {register.data && register.data.rows.length === 0 ? (
            <EmptyState
              icon={<MessageSquareText aria-hidden="true" className="size-5" />}
              title={tab === ALL && !q ? "No queries yet" : "No queries match"}
              description={
                tab === ALL && !q
                  ? "A query you issue appears here, as a draft first."
                  : "Try another filter, or clear the search."
              }
            />
          ) : (
            register.data && (
              <TableWrap caption="Queries">
                <THead>
                  <TH>Person</TH>
                  <TH>Query</TH>
                  <TH>Where it stands</TH>
                  <TH>Reply</TH>
                  <TH>Outcome</TH>
                </THead>
                <TBody>
                  {register.data.rows.map((row) => (
                    <RegisterRow key={row.id} row={row} />
                  ))}
                </TBody>
              </TableWrap>
            )
          )}
        </LoadState>
      </Card>
    </div>
  );
}

function RegisterRow({ row }: { row: ApiQuerySummary }) {
  const badge = replyBadgeText(row.replyState);
  return (
    <TR>
      <TDPrimary
        title={
          <Link href={`/people/queries/${row.id}`} className="hover:underline">
            {row.subject.name}
          </Link>
        }
        subtitle={row.subject.employeeNo}
      />
      <TD>
        <span className="block text-body-sm text-ink">{row.subjectLine}</span>
        {row.reference && (
          <span className="block text-meta text-muted">{row.reference}</span>
        )}
      </TD>
      <TD>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.status === "WITHDRAWN" ? "neutral" : "accent"}>
            {STATUS_LABEL[row.status]}
          </Badge>
          {row.archived && <Badge tone="neutral">Archived</Badge>}
          {row.startedByManager && row.status === "DRAFT" && (
            <Badge tone="neutral">A manager&apos;s draft</Badge>
          )}
        </div>
      </TD>
      <TD>
        {/* The API's own sentence, shown as it came. The badge is the short form of the one state
            that is worked out, in a neutral colour: a missing reply is a fact about a clock. */}
        {badge && row.replyState === "no_reply_by_deadline" && (
          <Badge tone="neutral">{badge}</Badge>
        )}
        <span className="mt-1 block text-meta text-muted">
          {row.replyStateLabel}
        </span>
      </TD>
      <TD>
        {row.outcome ? (
          <span className="text-body-sm text-ink">
            {OUTCOME_LABEL[row.outcome] ?? row.outcome}
          </span>
        ) : (
          <span className="text-body-sm text-muted">None</span>
        )}
      </TD>
    </TR>
  );
}

function ModuleOff({ canSettings }: { canSettings: boolean }) {
  return (
    <EmptyState
      icon={<MessageSquareText aria-hidden="true" className="size-5" />}
      title="Queries are switched off for your company"
      description="Nothing has been deleted. An administrator can turn them on under Settings, where the rules around them are also set."
      {...(canSettings
        ? {
            action: (
              <TextLink href="/settings/queries">Open Queries settings</TextLink>
            ),
          }
        : {})}
    />
  );
}
