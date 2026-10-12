"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2, Unplug } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Picker,
  Select,
  Skeleton,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
  Tabs,
  type BadgeTone,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { performanceApi } from "@/lib/api/performance";
import {
  PROVIDER_NAME,
  workTrackersApi,
  type ApiTrackerIdentity,
  type ApiWorkTrackerConnectionDetail,
  type GoalRuleMatch,
  type WorkTrackerProvider,
  type WorkTrackerStatus,
} from "@/lib/api/work-trackers";
import { usePermissions } from "@/lib/permissions";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useOrgTimezone, useSession } from "@/lib/store/session";
import {
  useRemoteProjects,
  useWorkTrackerConnection,
} from "@/lib/store/work-trackers";
import { formatDateTimeShort } from "@/lib/time";
import { useAction } from "@/lib/use-action";
import { useFetched } from "@/lib/use-fetched";

/**
 * One work-tracker connection: what it reads, who is who, which work counts
 * towards which objective, and how its syncs went.
 *
 * Laid out in the order an admin sets it up — projects first, because a
 * connection with none selected reads nothing; people second, because a
 * ticket whose assignee is unmatched is not stored; rules third, because a
 * stored ticket with no rule stays evidence and never reaches the weekly log.
 */

const STATUS: Record<WorkTrackerStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Connected", tone: "success" },
  NEEDS_REAUTH: { label: "Needs reconnecting", tone: "warning" },
  DISCONNECTED: { label: "Disconnected", tone: "neutral" },
};

/**
 * Each tool's own words for the same three ideas, and which rule kinds make
 * sense in it. monday.com items have no parent or tag the API hands over, so
 * a rule there can only name a board; Trello cards have labels but no parent.
 */
type Terms = {
  /** "project", "space", "board" — what `selectedProjects` holds. */
  unit: string;
  units: string;
  matches: Partial<
    Record<GoalRuleMatch, { label: string; placeholder: string }>
  >;
  /** Whether the tool shares people's emails, so matching can be automatic. */
  emails: boolean;
};

const TERMS: Record<WorkTrackerProvider, Terms> = {
  JIRA: {
    unit: "project",
    units: "Projects",
    matches: {
      PROJECT: { label: "Project", placeholder: "PAY" },
      EPIC: { label: "Epic", placeholder: "PAY-12" },
      LABEL: { label: "Label", placeholder: "payroll-v2" },
    },
    emails: true,
  },
  ASANA: {
    unit: "project",
    units: "Projects",
    matches: {
      PROJECT: { label: "Project", placeholder: "" },
      EPIC: { label: "Parent task", placeholder: "Parent task ID" },
      LABEL: { label: "Tag", placeholder: "payroll" },
    },
    emails: true,
  },
  CLICKUP: {
    unit: "space",
    units: "Spaces",
    matches: {
      PROJECT: { label: "Space", placeholder: "" },
      EPIC: { label: "Parent task", placeholder: "Parent task ID" },
      LABEL: { label: "Tag", placeholder: "payroll" },
    },
    emails: true,
  },
  MONDAY: {
    unit: "board",
    units: "Boards",
    matches: { PROJECT: { label: "Board", placeholder: "" } },
    emails: true,
  },
  TRELLO: {
    unit: "board",
    units: "Boards",
    matches: {
      PROJECT: { label: "Board", placeholder: "" },
      LABEL: { label: "Label", placeholder: "payroll" },
    },
    emails: false,
  },
};

type Tab = "projects" | "people" | "rules" | "history";

export function ConnectionScreen({ id }: { id: string }) {
  const { can, loading: permissionsLoading } = usePermissions();
  const state = useWorkTrackerConnection(id);
  const [tab, setTab] = useState<Tab>("projects");

  const title = state.connection
    ? `${PROVIDER_NAME[state.connection.provider]} · ${state.connection.site.name ?? "site"}`
    : "Work tracker";

  const header = (action?: React.ReactNode) => (
    <PageHeader
      title={title}
      breadcrumb={[
        { href: "/settings", label: "Settings" },
        { href: "/settings/integrations", label: "Integrations" },
      ]}
      action={action}
    />
  );

  if (permissionsLoading || state.loading) {
    return (
      <>
        {header()}
        <PageBody>
          <Skeleton className="h-64 w-full" />
        </PageBody>
      </>
    );
  }

  if (!can("MANAGE_SETTINGS")) {
    return (
      <>
        {header()}
        <PageBody>
          <Card>
            <EmptyState
              icon={<Unplug aria-hidden="true" />}
              title="You cannot manage integrations"
              description="Ask whoever manages settings to add that permission to your role."
            />
          </Card>
        </PageBody>
      </>
    );
  }

  const connection = state.connection;
  if (!connection) {
    return (
      <>
        {header()}
        <PageBody>
          <LoadFailure
            subject="this connection"
            error={state.error}
            onRetry={state.reload}
          />
        </PageBody>
      </>
    );
  }

  const unmatched = state.identities.filter(
    (i) => !i.employeeId && !i.ignored,
  ).length;

  return (
    <>
      {header(
        <HeaderActions connection={connection} onSynced={state.reload} />,
      )}
      <PageBody className="flex flex-col gap-6">
        <StatusCard connection={connection} />

        <Tabs
          items={[
            {
              id: "projects",
              label: TERMS[connection.provider].units,
              count: connection.selectedProjects.length,
            },
            {
              id: "people",
              label: "People",
              ...(unmatched ? { count: unmatched } : {}),
            },
            { id: "rules", label: "Objectives", count: state.rules.length },
            { id: "history", label: "Sync history" },
          ]}
          value={tab}
          onChange={(next) => setTab(next as Tab)}
        />

        {tab === "projects" && (
          <ProjectsPanel
            key={connection.selectedProjects.join(",")}
            connection={connection}
            onSaved={state.reload}
          />
        )}
        {tab === "people" && (
          <PeoplePanel
            connectionId={id}
            terms={TERMS[connection.provider]}
            identities={state.identities}
            onChanged={state.reloadIdentities}
          />
        )}
        {tab === "rules" && (
          <RulesPanel
            connection={connection}
            rules={state.rules}
            onChanged={state.reloadRules}
          />
        )}
        {tab === "history" && <HistoryPanel runs={state.runs} />}
      </PageBody>
    </>
  );
}

/* ------------------------------------------------------------- header */

function HeaderActions({
  connection,
  onSynced,
}: {
  connection: ApiWorkTrackerConnectionDetail;
  onSynced: () => void;
}) {
  const router = useRouter();
  const sync = useAction();
  const remove = useAction();
  const [confirming, setConfirming] = useState(false);
  const [purge, setPurge] = useState(false);

  const canSync =
    connection.status === "ACTIVE" && connection.selectedProjects.length > 0;

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        size="sm"
        disabled={!canSync}
        loading={sync.pending}
        onClick={() =>
          void sync.run(() => workTrackersApi.syncNow(connection.id), {
            subject: "the sync",
            success: "Sync finished",
            notice: (result) =>
              result.error
                ? `It stopped early: ${result.error}`
                : `${result.stored} tickets stored, ${result.linked} added to weekly tasks` +
                  (result.skippedUnmatched
                    ? `, ${result.skippedUnmatched} skipped for unmatched people.`
                    : "."),
            onDone: onSynced,
          })
        }
      >
        <RefreshCw aria-hidden="true" className="size-4" />
        Sync now
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden="true" className="size-4" />
        Disconnect
      </Button>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Disconnect ${PROVIDER_NAME[connection.provider]}?`}
        confirmLabel="Disconnect"
        loading={remove.pending}
        body={
          <div className="flex flex-col gap-3">
            <p>
              Syncing stops and the stored access is deleted. Weekly tasks that
              a manager has already graded stay on people&rsquo;s records.
            </p>
            <Checkbox
              label="Also delete the imported tickets"
              description="Removes every ticket and matched person this connection brought in, and any weekly task from it nobody has graded yet."
              checked={purge}
              onChange={(e) => setPurge(e.target.checked)}
            />
          </div>
        }
        onConfirm={() =>
          void remove.run(
            () => workTrackersApi.disconnect(connection.id, purge),
            {
              subject: "the connection",
              success: "Disconnected",
              onDone: () => router.push("/settings/integrations"),
            },
          )
        }
      />
    </div>
  );
}

function StatusCard({
  connection,
}: {
  connection: ApiWorkTrackerConnectionDetail;
}) {
  const timeZone = useOrgTimezone();
  const status = STATUS[connection.status];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 text-body-sm text-body">
        <Badge tone={status.tone} dot={status.tone === "success"}>
          {status.label}
        </Badge>
        {connection.site.url && (
          <a
            href={connection.site.url}
            target="_blank"
            rel="noreferrer"
            className="text-accent-text underline-offset-2 hover:underline"
          >
            {connection.site.url.replace(/^https?:\/\//, "")}
          </a>
        )}
        <span>
          {connection.lastSyncedAt
            ? `Last synced ${formatDateTimeShort(connection.lastSyncedAt, timeZone)}`
            : "Not synced yet"}
        </span>
        <span className="text-muted">Syncs automatically once a day.</span>
      </div>

      {connection.status === "NEEDS_REAUTH" && (
        <Callout tone="warning" title="The tool stopped accepting our access">
          Nothing syncs until it is connected again. Use Reconnect on the
          Integrations page; your projects, people and objectives are kept.
        </Callout>
      )}
      {connection.status === "ACTIVE" &&
        connection.selectedProjects.length === 0 && (
          <Callout tone="info" title="Pick the projects to read">
            A new connection reads nothing until you choose its projects below.
          </Callout>
        )}
      {connection.lastSyncError && connection.status === "ACTIVE" && (
        <Callout tone="warning" title="The last sync stopped early">
          {connection.lastSyncError}
        </Callout>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- projects */

function ProjectsPanel({
  connection,
  onSaved,
}: {
  connection: ApiWorkTrackerConnectionDetail;
  onSaved: () => void;
}) {
  const remote = useRemoteProjects(
    connection.id,
    connection.status === "ACTIVE",
  );
  const [chosen, setChosen] = useState<string[]>(connection.selectedProjects);
  const { run, pending } = useAction();

  const dirty =
    chosen.length !== connection.selectedProjects.length ||
    chosen.some((key) => !connection.selectedProjects.includes(key));

  const toggle = (key: string, on: boolean) =>
    setChosen((current) =>
      on ? [...current, key] : current.filter((k) => k !== key),
    );

  return (
    <Card>
      <CardHeader
        title={`${TERMS[connection.provider].units} to read`}
        level={3}
        description={`Only work in these ${TERMS[connection.provider].units.toLowerCase()} is read. Adding one fetches its last 90 days on the next sync.`}
        action={
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            loading={pending}
            onClick={() =>
              void run(
                () => workTrackersApi.setProjects(connection.id, chosen),
                {
                  subject: "the projects",
                  success: "Projects saved",
                  onDone: onSaved,
                },
              )
            }
          >
            Save
          </Button>
        }
      />
      <CardBody>
        <LoadFailure
          subject="the tool's projects"
          error={remote.error}
          onRetry={remote.reload}
        />
        {remote.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : remote.projects.length === 0 && !remote.error ? (
          <EmptyState
            compact
            title="No projects"
            description="This account cannot see any projects in the tool."
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {remote.projects.map((project) => (
              <Checkbox
                key={project.key}
                label={project.name}
                description={project.key}
                checked={chosen.includes(project.key)}
                onChange={(e) => toggle(project.key, e.target.checked)}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------- people */

function PeoplePanel({
  connectionId,
  terms,
  identities,
  onChanged,
}: {
  connectionId: string;
  terms: Terms;
  identities: ApiTrackerIdentity[];
  onChanged: () => void;
}) {
  const directory = useEmployeeDirectory({ pageSize: 200 });
  const { run } = useAction();

  const options = useMemo(
    () =>
      directory.people.map((person) => ({
        value: person.id,
        label: person.fullName,
        hint: person.jobTitle,
      })),
    [directory.people],
  );

  /* Unmatched first: they are the ones to act on. */
  const sorted = [...identities].sort(
    (a, b) =>
      Number(Boolean(a.employeeId) || a.ignored) -
      Number(Boolean(b.employeeId) || b.ignored),
  );

  const update = (
    identity: ApiTrackerIdentity,
    body: { employeeId?: string | null; ignored?: boolean },
  ) =>
    void run(
      () => workTrackersApi.updateIdentity(connectionId, identity.id, body),
      {
        subject: `the match for ${identity.displayName}`,
        success: "Saved. Their tickets come in on the next sync.",
        onDone: onChanged,
      },
    );

  return (
    <Card>
      <CardHeader
        title="Who is who"
        level={3}
        description={
          terms.emails
            ? "Matched by work email on the first sync. Tickets assigned to someone unmatched are not stored."
            : "This tool never shares people's emails, so match each person by hand, once. Tickets assigned to someone unmatched are not stored."
        }
      />
      <CardBody>
        {sorted.length === 0 ? (
          <EmptyState
            compact
            title="Nobody yet"
            description="People appear here after the first sync, as their tickets are read."
          />
        ) : (
          <TableWrap>
            <THead>
              <TH>In the tool</TH>
              <TH>Employee</TH>
              <TH align="right">Not one of ours</TH>
            </THead>
            <TBody>
              {sorted.map((identity) => (
                <TR key={identity.id}>
                  <TDPrimary
                    title={identity.displayName}
                    subtitle={
                      identity.externalEmail ?? "Email hidden by the tool"
                    }
                  />
                  <TD>
                    {identity.ignored ? (
                      <span className="text-muted">Ignored</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Picker
                          aria-label={`Employee for ${identity.displayName}`}
                          value={identity.employeeId ?? ""}
                          options={options}
                          loading={directory.loading}
                          placeholder="Choose an employee"
                          onChange={(employeeId) =>
                            update(identity, { employeeId })
                          }
                        />
                        {identity.matchedBy === "EMAIL" && (
                          <Badge size="sm" tone="neutral">
                            by email
                          </Badge>
                        )}
                      </div>
                    )}
                  </TD>
                  <TD align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        update(identity, { ignored: !identity.ignored })
                      }
                    >
                      {identity.ignored ? "Undo" : "Ignore"}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </CardBody>
    </Card>
  );
}

/* -------------------------------------------------------------- rules */

function RulesPanel({
  connection,
  rules,
  onChanged,
}: {
  connection: ApiWorkTrackerConnectionDetail;
  rules: ReturnType<typeof useWorkTrackerConnection>["rules"];
  onChanged: () => void;
}) {
  const { isConnected } = useSession();
  const loadGoals = useCallback(
    (signal: AbortSignal) =>
      performanceApi.goals({ approval: "AGREED", pageSize: 100 }, signal),
    [],
  );
  const goals = useFetched("wt-rule-goals", isConnected, loadGoals);
  const terms = TERMS[connection.provider];
  const kinds = Object.keys(terms.matches) as GoalRuleMatch[];
  /* Asana, ClickUp, monday and Trello key their projects by id; show names. */
  const remote = useRemoteProjects(
    connection.id,
    connection.status === "ACTIVE",
  );
  const projectName = useMemo(
    () => new Map(remote.projects.map((p) => [p.key, p.name])),
    [remote.projects],
  );
  const goalOptions = useMemo(
    () =>
      /* Personal objectives too: a rule pointed at one person's KPI counts
         their own tickets towards it, which is how a team without a shared
         department objective uses this. */
      (goals.data?.data ?? []).map((goal) => ({
        value: goal.id,
        label: goal.title,
        hint:
          goal.level === "company"
            ? "Company"
            : goal.level === "personal"
              ? (goal.ownerName ?? "Personal")
              : (goal.departmentName ?? "Department"),
      })),
    [goals.data],
  );

  const [matchType, setMatchType] = useState<GoalRuleMatch>("PROJECT");
  const [matchValue, setMatchValue] = useState("");
  const [goalId, setGoalId] = useState("");
  const add = useAction();
  const remove = useAction();

  return (
    <Card>
      <CardHeader
        title="Which work counts towards which objective"
        level={3}
        description={`Point a ${kinds.map((k) => terms.matches[k]?.label.toLowerCase()).join(", ")} at an objective: a person's own, or a company or department one with their objective beneath it. Each finished item is filed there as an ungraded weekly task for their manager to confirm.`}
      />
      <CardBody className="flex flex-col gap-5">
        {rules.length > 0 && (
          <TableWrap>
            <THead>
              <TH>Work in</TH>
              <TH>Counts towards</TH>
              <TH align="right">
                <span className="sr-only">Remove</span>
              </TH>
            </THead>
            <TBody>
              {rules.map((rule) => (
                <TR key={rule.id}>
                  <TD>
                    <span className="text-muted">
                      {terms.matches[rule.matchType]?.label ?? rule.matchType}
                    </span>{" "}
                    <span className="font-medium text-ink">
                      {rule.matchType === "PROJECT"
                        ? (projectName.get(rule.matchValue) ?? rule.matchValue)
                        : rule.matchValue}
                    </span>
                  </TD>
                  <TD>{rule.goal.title}</TD>
                  <TD align="right">
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={remove.pending}
                      onClick={() =>
                        void remove.run(
                          () =>
                            workTrackersApi.deleteRule(connection.id, rule.id),
                          {
                            subject: "the rule",
                            success: "Rule removed",
                            onDone: onChanged,
                          },
                        )
                      }
                    >
                      Remove
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}

        <form
          className="grid gap-3 md:grid-cols-[10rem_1fr_1.5fr_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void add.run(
              () =>
                workTrackersApi.createRule(connection.id, {
                  matchType,
                  matchValue: matchValue.trim(),
                  goalId,
                }),
              {
                subject: "the rule",
                success: "Rule added",
                notice: (result) =>
                  result.linked > 0
                    ? `${result.linked} of this week's finished tickets were added to weekly tasks straight away.`
                    : null,
                onDone: () => {
                  setMatchValue("");
                  setGoalId("");
                  onChanged();
                },
              },
            );
          }}
        >
          <Field label="Match on">
            <Select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as GoalRuleMatch)}
            >
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {terms.matches[kind]?.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={terms.matches[matchType]?.label ?? "Value"}>
            {matchType === "PROJECT" &&
            connection.selectedProjects.length > 0 ? (
              <Select
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                placeholder={`Choose a ${terms.unit}`}
              >
                {connection.selectedProjects.map((key) => (
                  <option key={key} value={key}>
                    {projectName.get(key) ?? key}
                  </option>
                ))}
              </Select>
            ) : (
              <Input
                value={matchValue}
                onChange={(e) => setMatchValue(e.target.value)}
                placeholder={
                  matchType === "PROJECT"
                    ? `Pick ${terms.units.toLowerCase()} on the first tab`
                    : (terms.matches[matchType]?.placeholder ?? "")
                }
              />
            )}
          </Field>
          <Field label="Objective">
            <Picker
              value={goalId}
              onChange={setGoalId}
              options={goalOptions}
              loading={goals.loading}
              placeholder="Choose an agreed objective"
            />
          </Field>
          <Button
            type="submit"
            variant="secondary"
            disabled={!matchValue.trim() || !goalId}
            loading={add.pending}
          >
            Add rule
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}

/* ------------------------------------------------------------ history */

function HistoryPanel({
  runs,
}: {
  runs: ReturnType<typeof useWorkTrackerConnection>["runs"];
}) {
  const timeZone = useOrgTimezone();
  return (
    <Card>
      <CardHeader
        title="Sync history"
        level={3}
        description="The last 30 runs, newest first."
      />
      <CardBody>
        {runs.length === 0 ? (
          <EmptyState
            compact
            title="No syncs yet"
            description="Pick projects, then press Sync now."
          />
        ) : (
          <TableWrap>
            <THead>
              <TH>Started</TH>
              <TH>How</TH>
              <TH align="right">Read</TH>
              <TH align="right">Stored</TH>
              <TH align="right">To weekly tasks</TH>
              <TH align="right">Unmatched</TH>
              <TH>Result</TH>
            </THead>
            <TBody>
              {runs.map((run) => (
                <TR key={run.id}>
                  <TD>{formatDateTimeShort(run.startedAt, timeZone)}</TD>
                  <TD>{run.trigger === "MANUAL" ? "Sync now" : "Daily"}</TD>
                  <TD align="right">{run.fetched}</TD>
                  <TD align="right">{run.stored}</TD>
                  <TD align="right">{run.linked}</TD>
                  <TD align="right">{run.skippedUnmatched}</TD>
                  <TD>
                    {run.error ? (
                      <Badge tone="danger" size="sm">
                        {run.error}
                      </Badge>
                    ) : run.finishedAt ? (
                      <Badge tone="success" size="sm">
                        Done
                      </Badge>
                    ) : (
                      <Badge tone="info" size="sm">
                        Running
                      </Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableWrap>
        )}
      </CardBody>
    </Card>
  );
}
