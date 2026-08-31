"use client";

import { useEffect, useMemo, useState } from "react";
import { Lock, Search, ShieldCheck } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Select,
  Skeleton,
  Stat,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import type { AuditEntry, AuditListParams } from "@/lib/api/audit";
import { dayHeading, dayKey, readableDate } from "@/lib/audit/language";
import { usePermissions } from "@/lib/permissions";
import { useAuditFilterOptions, useAuditTrail } from "@/lib/store/audit";
import { TrailEntry } from "./entry";

/**
 * The audit log.
 *
 * We have been writing `AuditEvent` rows correctly since the first module and
 * showing them nowhere. A control nobody can look at is not a control, so this
 * screen is the other half of the feature.
 *
 * ## A timeline, not a table
 *
 * The rows were always available as JSON and that was never the problem. The
 * problem is that a table of `action`, `subject_type`, `subject_id` and `diff`
 * asks its reader to be a developer, and the person who needs to audit a
 * Nigerian small business is the person who owns it. So every row is a sentence
 * — "Grace Effiong changed Amara Nwachukwu’s bank account" — and the machine
 * verb never appears on screen at all. `lib/audit/language.ts` is where that
 * translation lives and is worth reading before changing any of this.
 *
 * ## Four filters and a search box, and no more
 *
 * Who, what kind of thing, and between which dates — plus free text. That is
 * the whole of what somebody asks an audit log, and every one of them maps to a
 * filter the API already applies in the database rather than something narrowed
 * after the fact in the browser.
 *
 * The dropdown options come from the data: the person list is who has actually
 * generated events, and the kind list is the types actually present. Neither can
 * fall behind a module that ships next month, and neither offers a filter that
 * would return nothing.
 *
 * ## "Times the log was opened" is a tile, not a footnote
 *
 * Reading this log is itself recorded, because a permission only stops the
 * people who do not hold it. The guard against the person who does is that
 * looking leaves a mark. That count is on the dashboard for the same reason —
 * and the API reports it whatever the filters say, so it cannot be made to
 * disappear from this screen.
 */

type ScreenProps = {
  /**
   * A record page links here with its own record preselected, which is what
   * makes "All 12" on an employee's history resolve to something useful. Both
   * are starting points for the filters rather than controlled bindings: the
   * dropdowns own them from the first interaction onwards.
   */
  initialEntityType?: string;
  initialEntityId?: string;
};

/**
 * The permission check is a separate component from the log for one reason:
 * hooks cannot be skipped.
 *
 * Checking `VIEW_AUDIT` inside the screen and returning early still runs
 * `useAuditTrail` first, which fires three requests the API will refuse — and
 * asking an audit endpoint a question you are not allowed to ask is a
 * particularly poor thing to do repeatedly. So the gate is above the hooks.
 *
 * `usePermissions().loading` rather than a bare `useCan`: the set is empty until
 * the session resolves, so a bare check would flash "you cannot see this" at
 * somebody who can.
 */
export function AuditScreen(props: ScreenProps = {}) {
  const { can, loading } = usePermissions();

  if (loading) {
    return (
      <>
        <PageHeader
          title="Audit log"
          breadcrumb={[{ href: "/settings", label: "Settings" }]}
        />
        <PageBody>
          <Skeleton className="h-40 w-full" />
          <span className="sr-only">Loading the audit log</span>
        </PageBody>
      </>
    );
  }

  if (!can("VIEW_AUDIT")) {
    return (
      <>
        <PageHeader
          title="Audit log"
          breadcrumb={[{ href: "/settings", label: "Settings" }]}
        />
        <PageBody>
          <Card>
            <EmptyState
              icon={<Lock aria-hidden="true" />}
              title="You cannot see the audit log"
              description="It shows who looked at whose pay, so it is kept to specific people. Ask whoever manages access to add the audit permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  return <Trail {...props} />;
}

function Trail({ initialEntityType = "", initialEntityId = "" }: ScreenProps) {
  const [entityType, setEntityType] = useState(initialEntityType);
  const [entityId, setEntityId] = useState(initialEntityId);
  const [actor, setActor] = useState("");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeReads, setIncludeReads] = useState(false);

  /**
   * The number beside a name in the "Who" dropdown.
   *
   * With reads shown, every event counts. With them hidden, the list below
   * counts only changes, so the dropdown has to as well — `changes` when the
   * API sends it, and `events` rather than a fabricated nought when it does
   * not. See the comment on the field itself for why that fallback is the
   * honest one.
   */
  const countFor = (person: { events: number; changes?: number }) =>
    includeReads ? person.events : (person.changes ?? person.events);

  /* One request per pause, not one per keystroke. Only matters when connected;
     in demo mode the filter runs over a fixture and is free. */
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  /* Stable identity, because `useAuditTrail` keys both its request and its
     "show older" window off this object. */
  const filters = useMemo<AuditListParams>(
    () => ({
      ...(query ? { q: query } : {}),
      ...(actor ? { actorUserId: actor } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(includeReads ? { includeReads: true } : {}),
    }),
    [query, actor, entityType, entityId, from, to, includeReads],
  );

  const range = useMemo(
    () => ({ ...(from ? { from } : {}), ...(to ? { to } : {}) }),
    [from, to],
  );

  const trail = useAuditTrail(filters);
  const options = useAuditFilterOptions(range);

  /**
   * True only when the dropdown is counting something the list is not — reads
   * are hidden, and no actor carries a `changes` figure to count instead.
   *
   * Checked across the rows rather than assumed from one, because an API
   * either computes the field for every actor or for none; either way this
   * asks the rows in front of it rather than the deployment behind them.
   */
  const countsIncludeReads =
    !includeReads &&
    options.actors.length > 0 &&
    options.actors.every((person) => person.changes === undefined);

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; heading: string; entries: AuditEntry[] }
    >();
    for (const entry of trail.entries) {
      const key = dayKey(entry.at);
      const group = map.get(key);
      if (group) {
        group.entries.push(entry);
        continue;
      }
      map.set(key, {
        key,
        heading: dayHeading(entry.at, trail.now),
        entries: [entry],
      });
    }
    return [...map.values()];
  }, [trail.entries, trail.now]);

  const filtered =
    Boolean(query || actor || entityType || entityId || from || to || includeReads);

  const clear = () => {
    setSearch("");
    setQuery("");
    setActor("");
    setEntityType("");
    setEntityId("");
    setFrom("");
    setTo("");
    setIncludeReads(false);
  };

  /* Arriving from a record's own history means one record is filtered for with
     no dropdown showing it. Naming it, with the button that widens the view, is
     the difference between a log that looks empty and a log that says why. */
  const oneRecord = entityId
    ? trail.entries[0]?.entity.label ?? "this record"
    : null;

  return (
    <>
      <PageHeader
        title="Audit log"
        breadcrumb={[{ href: "/settings", label: "Settings" }]}
        /* Connected says nothing a real customer needs told — "this is your
           real log" is not information — and in a production build
           `DEMO_ENABLED` is false, so the badge would otherwise be a
           permanent, unremovable fixture on every live company's audit
           screen. Only the demo case, where looking connected would be the
           one thing worse than a demo, still earns a badge. */
        meta={
          !trail.live && DEMO_ENABLED ? (
            <Badge tone="neutral" size="sm">
              Demo data, this browser only
            </Badge>
          ) : undefined
        }
      />

      <PageBody className="flex flex-col gap-5">
        {trail.error && (
          <LoadFailure subject="the audit log" error={trail.error}  onRetry={trail.reload}/>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Changes"
            value={String(options.summary?.changes ?? 0)}
            hint={periodHint(options.summary?.from, options.summary?.to)}
          />
          <Stat label="People" value={String(options.summary?.actors ?? 0)} />
          <Stat
            label="Times the log was opened"
            value={String(options.summary?.reads ?? 0)}
          />
          <Stat label="Matching your filters" value={String(trail.total)} />
        </div>

        <Card>
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
            <Field label="Search" className="xl:col-span-2">
              <Input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="A name, a kind of record, an action"
                icon={<Search aria-hidden="true" />}
                /* The API caps `q` at 120 characters and answers 400 above it. */
                maxLength={120}
              />
            </Field>

            {/* The count beside each name has to match the list beneath it.
                ------------------------------------------------------------
                The list leaves record views out unless "Show who read the
                log" is ticked, so a dropdown that always shows `events` sits
                above a shorter list for the same person — "Grace Effiong
                (47)" selecting to 31 rows.

                `changes` is the figure that matches, and an API that computes
                it sends it. One that does not omits the field entirely, and
                **absent is not zero**: falling back to `events` shows a true
                number that happens to count more than the list, which is
                worth explaining; `?? 0` would show a false one. So the help
                line appears in exactly the case where it is true — reads
                hidden, and no `changes` to use — and retires itself the day
                the API starts sending it. */}
            <Field
              label="Who"
              {...(countsIncludeReads
                ? {
                    help: "Counts include record views, which the list leaves out until you tick Show who read the log.",
                  }
                : {})}
            >
              <Select
                value={actor}
                onChange={(event) => setActor(event.target.value)}
              >
                <option value="">Anyone</option>
                {options.actors.map((person) => (
                  <option
                    key={person.id ?? "system"}
                    value={person.isSystem ? "system" : person.id ?? ""}
                  >
                    {person.name} ({countFor(person)})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Kind of record">
              <Select
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
              >
                <option value="">Everything</option>
                {options.kinds.map((kind) => (
                  <option key={kind.type} value={kind.type}>
                    {sentenceCase(kind.noun)} ({kind.count})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="From">
              <Input
                type="date"
                value={from}
                /* Bounded by each other and not by today: reading the clock in
                   render is the hydration trap `HANDOVER.md` documents, and a
                   date in the future simply matches nothing. */
                max={to || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>

            <Field label="To">
              <Input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>

            <div className="flex items-end justify-between gap-3 sm:col-span-2">
              <Checkbox
                label="Show who read the log"
                checked={includeReads}
                onChange={(event) => setIncludeReads(event.target.checked)}
              />
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        </Card>

        {oneRecord && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-canvas px-4 py-3">
            <p className="text-body-sm text-body">
              One record: <span className="font-medium text-ink">{oneRecord}</span>
            </p>
            <Button variant="secondary" size="sm" onClick={() => setEntityId("")}>
              Show everything
            </Button>
          </div>
        )}

        {trail.loading && trail.entries.length === 0 ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <span className="sr-only">Loading the audit log</span>
          </div>
        ) : trail.entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={<ShieldCheck aria-hidden="true" />}
              title={filtered ? "Nothing matches those filters" : "Nothing recorded yet"}
              description={
                filtered
                  ? "Widen the dates, or clear the filters and start again."
                  : "Every change anyone makes will appear here as it happens."
              }
              action={
                filtered ? (
                  <Button variant="secondary" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-labelledby={`audit-day-${group.key}`}>
                <h2
                  id={`audit-day-${group.key}`}
                  className="mb-3 text-meta font-semibold text-faint"
                >
                  {group.heading}
                </h2>
                <ol role="list" className="flex flex-col">
                  {group.entries.map((entry, index) => (
                    <TrailEntry
                      key={entry.id}
                      entry={entry}
                      now={trail.now}
                      rail={index < group.entries.length - 1}
                    />
                  ))}
                </ol>
              </section>
            ))}

            {trail.hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={trail.loading}
                  onClick={trail.showMore}
                >
                  {trail.loading ? "Loading…" : "Show older"}
                </Button>
              </div>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

/** "employee" → "Employee". The nouns arrive lower case for use in sentences. */
const sentenceCase = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1);

function periodHint(from?: string, to?: string): string | undefined {
  if (!from || !to) return undefined;
  return `${readableDate(from)} to ${readableDate(to)}`;
}
