"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Users } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  LoadState,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { PersonalIssueDrawer } from "@/components/projects/personal-issue-drawer";
import { ReducedIssueDrawer } from "@/components/projects/reduced-issue-drawer";
import { ApiError } from "@/lib/api/client";
import {
  isModuleOff,
  projectsApi,
  type ReducedIssueDetail,
  type TeamFilter,
  type TeamPerson,
  type TeamTask,
} from "@/lib/api/projects";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort } from "@/lib/time";

/**
 * `/projects/team`: what the people you lead have on, as load rather than cards.
 *
 * Each person is one row: who they are, one strip of their open work split into
 * overdue, due this week and the rest (overdue is the only red on the page), and
 * the counts written out. The strip has a text equivalent for a screen reader.
 * A row with overdue work opens by itself; the rest stay closed until asked.
 *
 * ## Opening a task
 *
 * - A personal task opens `PersonalIssueDrawer`; leaders may read it.
 * - A board task asks the API how much of it this reader may see. In full (they
 *   are on the project): go to the board with the task open. Reduced (they only
 *   lead the assignee): a read-only viewer saying why they can see it.
 */

/* Keyed by the filter it answers, so one filter's rows are never shown under another's. */
type Loaded =
  | { status: "loading" }
  | { status: "error"; filter: TeamFilter; error: unknown }
  | { status: "ready"; filter: TeamFilter; people: TeamPerson[] };

const EMPTY_BY_FILTER: Record<TeamFilter, string> = {
  overdue: "Nothing overdue in your team.",
  "due-week": "Nothing due this week in your team.",
  open: "Nobody on your team has open tasks.",
};

/** Most overdue first, then by name; the API sorts the same way, and so does a refetch. */
const byLoad = (a: TeamPerson, b: TeamPerson) =>
  b.counts.overdue - a.counts.overdue ||
  a.employee.name.localeCompare(b.employee.name);

export function TeamTasksScreen() {
  const gate = useProjectsGate();
  if (gate.loading) {
    return (
      <>
        <PageHeader title="Team tasks" />
        <PageBody>
          <Skeleton className="h-40" aria-label="Loading team tasks" />
        </PageBody>
      </>
    );
  }
  if (!gate.enabled) return <ProjectsOff />;
  return <Team />;
}

function Team() {
  const toast = useToast();
  const router = useRouter();
  const timeZone = useOrgTimezone();
  const [filter, setFilter] = useState<TeamFilter>("open");
  const [loaded, setData] = useState<Loaded>({ status: "loading" });
  /* Another filter's answer is not this one's: show it loading until it lands. */
  const data = useMemo<Loaded>(
    () =>
      loaded.status !== "loading" && loaded.filter !== filter
        ? { status: "loading" }
        : loaded,
    [loaded, filter],
  );
  const [opening, setOpening] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const [giving, setGiving] = useState<TeamPerson["employee"] | null>(null);
  const [moving, setMoving] = useState<{
    task: TeamTask;
    ownerId: string;
  } | null>(null);
  const [personalId, setPersonalId] = useState<string | null>(null);
  const [reduced, setReduced] = useState<{
    detail: ReducedIssueDetail;
    assignee: string;
  } | null>(null);
  /* The team as the unfiltered answer last gave it: who a task can be moved to. */
  const [team, setTeam] = useState<TeamPerson["employee"][]>([]);

  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .teamTasks(filter, controller.signal)
      .then((people) => {
        setData({ status: "ready", filter, people });
        setTeam((prev) =>
          filter === "open" || prev.length === 0
            ? people.map((p) => p.employee)
            : prev,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        /* With people already on screen a failed refresh stays quiet. */
        setData((prev) =>
          prev.status === "ready" && prev.filter === filter
            ? prev
            : { status: "error", filter, error },
        );
      });
    return () => controller.abort();
  }, [filter, version]);

  const people = useMemo(
    () =>
      data.status === "ready"
        ? [...data.people]
            .filter((p) => filter === "open" || p.tasks.length > 0)
            .sort(byLoad)
        : [],
    [data, filter],
  );

  if (data.status === "error" && isModuleOff(data.error)) {
    return <ProjectsOff />;
  }

  async function open(task: TeamTask, person: TeamPerson) {
    if (task.personal) {
      setPersonalId(task.id);
      return;
    }
    if (opening) return;
    setOpening(true);
    try {
      const read = await projectsApi.leaderRead(task.id);
      if (read.reduced) {
        setReduced({ detail: read, assignee: person.employee.name });
      } else if (task.projectId) {
        router.push(`/projects/${task.projectId}?issue=${task.key}`);
      } else {
        toast.push({
          tone: "danger",
          title: "Could not open that task",
          detail: "It has no project to open it in.",
        });
      }
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "Could not open that task",
        detail:
          error instanceof ApiError ? error.message : "Try again in a moment.",
      });
    } finally {
      setOpening(false);
    }
  }

  const maxOpen = Math.max(1, ...people.map((p) => p.counts.open));
  const nobodyLed =
    data.status === "ready" && data.people.length === 0 && filter === "open";

  return (
    <>
      <PageHeader
        title="Team tasks"
        description="Everyone you manage or whose department you run."
        action={
          <SegmentedControl<TeamFilter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "overdue", label: "Overdue" },
              { value: "due-week", label: "Due this week" },
              { value: "open", label: "All open" },
            ]}
          />
        }
      />
      <PageBody>
        <LoadState
          loading={data.status === "loading"}
          error={data.status === "error" ? data.error : null}
          onRetry={reload}
          subject="team tasks"
          skeleton="list"
        >
          {nobodyLed && (
            <EmptyState
              icon={<Users />}
              title="Nobody reports to you yet"
              description="When someone does, their tasks show here."
            />
          )}

          {data.status === "ready" && !nobodyLed && people.length === 0 && (
            <EmptyState icon={<Users />} title={EMPTY_BY_FILTER[filter]} />
          )}

          {people.length > 0 && (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {people.map((person) => (
                <PersonRow
                  key={person.employee.id}
                  person={person}
                  maxOpen={maxOpen}
                  timeZone={timeZone}
                  onGive={() => setGiving(person.employee)}
                  onOpen={(task) => void open(task, person)}
                  onMove={(task) =>
                    setMoving({ task, ownerId: person.employee.id })
                  }
                />
              ))}
            </ul>
          )}
        </LoadState>
      </PageBody>

      <GiveTaskDialog
        key={`give-${giving?.id ?? "none"}`}
        person={giving}
        onClose={() => setGiving(null)}
        onGiven={(name) => {
          setGiving(null);
          toast.push({ tone: "success", title: `Task given to ${name}` });
          reload();
        }}
      />
      <MoveDialog
        key={`move-${moving?.task.id ?? "none"}`}
        task={moving?.task ?? null}
        team={team.filter((p) => p.id !== moving?.ownerId)}
        onClose={() => setMoving(null)}
        onMoved={(name) => {
          setMoving(null);
          toast.push({ tone: "success", title: `Moved to ${name}` });
          reload();
        }}
      />
      <PersonalIssueDrawer
        issueId={personalId}
        issues={[]}
        onClose={() => setPersonalId(null)}
        onChanged={reload}
      />
      <ReducedIssueDrawer
        detail={reduced?.detail ?? null}
        assigneeName={reduced?.assignee ?? ""}
        onClose={() => setReduced(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ one person */

function PersonRow({
  person,
  maxOpen,
  timeZone,
  onGive,
  onOpen,
  onMove,
}: {
  person: TeamPerson;
  maxOpen: number;
  timeZone: string;
  onGive: () => void;
  onOpen: (task: TeamTask) => void;
  onMove: (task: TeamTask) => void;
}) {
  const { employee, counts, tasks } = person;
  /* Overdue work is open on arrival; a choice made here wins after that. */
  const [choice, setChoice] = useState<boolean | null>(null);
  const expanded = choice ?? counts.overdue > 0;
  const panel = `team-${employee.id}`;

  return (
    <li data-person-row>
      <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panel}
          onClick={() => setChoice(!expanded)}
          className="flex min-w-0 items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text sm:w-64 sm:shrink-0"
        >
          <ChevronRight
            aria-hidden="true"
            className={
              expanded
                ? "size-4 shrink-0 rotate-90 text-muted motion-safe:transition-transform"
                : "size-4 shrink-0 text-muted motion-safe:transition-transform"
            }
          />
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-medium text-ink">
              {employee.name}
            </span>
            {employee.jobTitle && (
              <span className="block truncate text-meta text-muted">
                {employee.jobTitle}
              </span>
            )}
          </span>
        </button>

        <LoadStrip name={employee.name} counts={counts} maxOpen={maxOpen} />

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-muted">
          <span
            className={
              counts.overdue > 0
                ? "tabular font-medium text-danger-text"
                : "tabular"
            }
          >
            {counts.overdue} overdue
          </span>
          <span className="tabular">{counts.dueThisWeek} this week</span>
          <span className="tabular">{counts.open} open</span>
          <span className="tabular">{counts.doneThisWeek} done this week</span>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="self-start sm:ml-auto sm:self-auto"
          onClick={onGive}
        >
          Give a task
        </Button>
      </div>

      {expanded && (
        <div id={panel} className="border-t border-line bg-canvas">
          {tasks.length === 0 ? (
            <p className="px-9 py-3 text-body-sm text-muted">
              Nothing open for {employee.name}.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {tasks.map((task) => (
                <TaskLine
                  key={task.id}
                  task={task}
                  timeZone={timeZone}
                  onOpen={() => onOpen(task)}
                  onMove={() => onMove(task)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The one bold element: a person's open work as a bar, overdue first. Its length
 * says how much they hold against the busiest person here; its colours say how
 * late it is. The text is the same facts for a reader who cannot see it.
 */
function LoadStrip({
  name,
  counts,
  maxOpen,
}: {
  name: string;
  counts: TeamPerson["counts"];
  maxOpen: number;
}) {
  const text = `${name}: ${counts.overdue} overdue, ${counts.dueThisWeek} due this week, ${counts.open} open`;
  const seg = (n: number) => ({ flexGrow: n, flexBasis: 0 });
  return (
    <div
      role="img"
      aria-label={text}
      className="h-3 w-full min-w-24 flex-1 overflow-hidden rounded-full bg-sunken sm:max-w-sm"
    >
      <div
        className="flex h-full"
        style={{ width: `${(counts.open / maxOpen) * 100}%` }}
      >
        <span className="bg-danger" style={seg(counts.overdue)} />
        <span className="bg-accent" style={seg(counts.dueThisWeek)} />
        <span className="bg-line-strong" style={seg(counts.laterOrNoDate)} />
      </div>
    </div>
  );
}

function TaskLine({
  task,
  timeZone,
  onOpen,
  onMove,
}: {
  task: TeamTask;
  timeZone: string;
  onOpen: () => void;
  onMove: () => void;
}) {
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 py-1 pl-9 pr-3 sm:grid-cols-[5rem_minmax(0,1fr)_8rem_auto_auto]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open ${task.key} ${task.title}`}
        className="col-span-2 grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-4 py-2 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text sm:col-span-3 sm:grid-cols-subgrid"
      >
        <span className="tabular text-meta text-muted">{task.key}</span>
        <span className="min-w-0 truncate text-body-sm text-ink">
          {task.title}
        </span>
        <span className="col-start-2 text-meta text-muted sm:col-start-auto">
          {task.projectName}
        </span>
      </button>
      <span className="flex items-center gap-2 text-meta text-muted">
        {task.dueDate ? (
          <>
            <span>Due {formatDateShort(task.dueDate, timeZone)}</span>
            {task.overdue && (
              <Badge tone="danger" size="sm">
                Overdue
              </Badge>
            )}
          </>
        ) : (
          <span>No date</span>
        )}
      </span>
      <span className="justify-self-end">
        {task.personal && (
          <Button type="button" size="sm" variant="ghost" onClick={onMove}>
            Move to…
          </Button>
        )}
      </span>
    </li>
  );
}

/* --------------------------------------------------------------------- dialogs */

function failure(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "Check your connection and try again.";
}

function GiveTaskDialog({
  person,
  onClose,
  onGiven,
}: {
  person: TeamPerson["employee"] | null;
  onClose: () => void;
  onGiven: (name: string) => void;
}) {
  const toast = useToast();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!person || !title.trim() || busy) return;
    setBusy(true);
    try {
      await projectsApi.giveTask({
        employeeId: person.id,
        title: title.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(due ? { dueDate: due } : {}),
      });
      setTitle("");
      setDue("");
      setDescription("");
      onGiven(person.name);
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "Could not give the task",
        detail: failure(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={person !== null}
      onClose={onClose}
      title={person ? `Give a task to ${person.name}` : "Give a task"}
      description="It goes on their own list, and shows that you set it."
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!title.trim() || busy}
            onClick={() => void submit()}
          >
            Give task
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Task title"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="What needs doing?"
          autoComplete="off"
          maxLength={240}
        />
        <Input
          type="date"
          value={due}
          onChange={(event) => setDue(event.target.value)}
          aria-label="Due date"
          className="w-auto"
        />
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          aria-label="Description"
          placeholder="Say more about it, if that helps"
        />
      </form>
    </Modal>
  );
}

function MoveDialog({
  task,
  team,
  onClose,
  onMoved,
}: {
  task: TeamTask | null;
  team: TeamPerson["employee"][];
  onClose: () => void;
  onMoved: (name: string) => void;
}) {
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const to = team.find((p) => p.id === target);
    if (!task || !to || busy) return;
    setBusy(true);
    try {
      await projectsApi.moveTask(task.id, to.id);
      setTarget("");
      onMoved(to.name);
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "Could not move the task",
        detail: failure(error),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={task !== null}
      onClose={onClose}
      title="Move to…"
      description={task ? `${task.key} ${task.title}` : undefined}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!target || busy}
            onClick={() => void submit()}
          >
            Move task
          </Button>
        </>
      }
    >
      <Select
        value={target}
        onChange={(event) => setTarget(event.target.value)}
        aria-label="Move to"
      >
        <option value="">Choose a person</option>
        {team.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
