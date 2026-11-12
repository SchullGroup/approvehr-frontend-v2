"use client";

import { DueTimeInput } from "@/components/projects/due-time-input";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  Field,
  FilterBar,
  Input,
  LoadState,
  SegmentedControl,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { FinishTag } from "@/components/projects/finish-tag";
import { ProjectsOff } from "@/components/projects/module-off";
import { MyTasksBoard } from "@/components/projects/my-tasks-board";
import { PersonalIssueDrawer } from "@/components/projects/personal-issue-drawer";
import { useQueryParam } from "@/components/projects/use-query-param";
import {
  AttachButton,
  StagedList,
  attachStaged,
  useDropTarget,
  useStagedFiles,
} from "@/components/projects/task-files";
import {
  isModuleOff,
  projectsApi,
  type PersonalTask,
} from "@/lib/api/projects";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { dueLabel, isPastDue, nowHHMMIn } from "@/lib/projects/due";
import { finishedMeta } from "@/lib/projects/finish-marks";
import {
  assigneeSummary,
  matchesMyTask,
  rowTarget,
  taskDepartmentOptions,
} from "@/lib/projects/my-tasks";
import {
  LAYOUT_STORAGE_KEY,
  layoutOf,
  type MyTasksLayout,
} from "@/lib/projects/my-tasks-board";
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { formatDateShort, todayIn } from "@/lib/time";

/**
 * `/projects/mine`: everything you have to do, from your own list and from boards.
 *
 * Quick add at the top (Enter adds; "Add details" opens a description), then a
 * search and a project-department filter, then the open tasks in To do and In
 * progress, and what you finished in the last 14 days, closed. Older finished
 * work is under Archive, a page at a time. The segment is in the address bar
 * (`?show=`), so Back from a board returns to it.
 *
 * Each row says where it lives: a board's name, "Personal", or "Shared by …". A
 * personal row opens the drawer here; a board row opens on its board; a board
 * task from a project you have left opens nowhere.
 *
 * "Attach files" sits beside the date, and the form takes files dropped on it.
 * Adding makes the task first, then uploads and records each file on it. A file
 * that fails stays listed with why, under "MY-7 was added", with Try again —
 * the task is never added twice.
 *
 * Open and Done can be shown as a list or as a board (To do, In progress, Done
 * across every list and board; see `MyTasksBoard`). The choice is remembered in
 * this browser. Overdue and Archive are always lists: one is a slice of the open
 * work by date, the other is paged history, and neither has columns to move
 * between.
 */

type Filter = "open" | "done" | "overdue" | "archive";

const FILTERS: readonly Filter[] = ["open", "done", "overdue", "archive"];
const filterOf = (value: string): Filter =>
  (FILTERS as readonly string[]).includes(value) ? (value as Filter) : "open";

/** A refetch on returning to the tab waits this long since the last load. */
const REFETCH_GAP_MS = 2000;

type Loaded =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; open: PersonalTask[]; done: PersonalTask[] };

export function MyTasksScreen() {
  const gate = useProjectsGate();
  if (gate.loading) {
    return (
      <>
        <PageHeader title="My tasks" />
        <PageBody>
          <Skeleton className="h-40" aria-label="Loading your tasks" />
        </PageBody>
      </>
    );
  }
  if (!gate.enabled) return <ProjectsOff />;
  return <Tasks />;
}

function Tasks() {
  const toast = useToast();
  const timeZone = useOrgTimezone();
  const today = todayIn(timeZone);
  /* The segment is this screen's own state, started from `?show=` and written
     back to it, so Back from a board lands on the segment that was open. */
  const [showParam, setShowParam] = useQueryParam("show", "open");
  const [filter, setFilterState] = useState<Filter>(() => filterOf(showParam));
  const setShow = (next: Filter) => {
    setFilterState(next);
    setShowParam(next);
  };
  const [layout, setLayoutState] = useState<MyTasksLayout>("list");
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read after mount to match the server render
      setLayoutState(layoutOf(localStorage.getItem(LAYOUT_STORAGE_KEY)));
    } catch {
      /* storage unavailable: the list */
    }
  }, []);
  const setLayout = (next: MyTasksLayout) => {
    setLayoutState(next);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, next);
    } catch {
      /* not remembered */
    }
  };
  const boardable = filter === "open" || filter === "done";
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("");
  const [data, setData] = useState<Loaded>({ status: "loading" });
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const loadedAt = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      projectsApi.mineTasks("open", controller.signal),
      projectsApi.mineTasks("done", controller.signal),
    ])
      .then(([open, done]) => {
        loadedAt.current = Date.now(); // reads-the-clock: an elapsed-time gap for refetch, never a calendar day
        setRefreshFailed(false);
        setData({ status: "ready", open, done });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        /* With a list already on screen a failed refresh keeps it, and says so. */
        setData((prev) => {
          if (prev.status !== "ready") return { status: "error", error };
          return prev;
        });
        setRefreshFailed(true);
      });
    return () => controller.abort();
  }, [version]);

  /* Back from a board (where a task may have been finished) or another tab:
     load again, at most once every couple of seconds. */
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - loadedAt.current > REFETCH_GAP_MS) reload(); // reads-the-clock: an elapsed-time gap, never a calendar day
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  if (data.status === "error" && isModuleOff(data.error)) {
    return <ProjectsOff />;
  }

  const all =
    data.status === "ready"
      ? [...data.open, ...data.done]
      : ([] as PersonalTask[]);
  /* A sub-task a colleague shared without its parent has no row to sit under,
     so it is listed on its own. */
  const top = (rows: PersonalTask[]) => {
    const ids = new Set(rows.map((t) => t.id));
    return rows.filter((t) => t.parentId === null || !ids.has(t.parentId));
  };

  const departments = taskDepartmentOptions(all);
  const departmentLabel = departments.find(
    (d) => d.value === department,
  )?.label;
  const narrow = (rows: PersonalTask[]) =>
    rows.filter((t) => matchesMyTask(t, query, department));
  const filtering = query.trim() !== "" || department !== "";
  const clearFilters = () => {
    setQuery("");
    setDepartment("");
  };

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Everything you have to do: your own list and the tasks you are on in projects."
        action={
          <SegmentedControl<Filter>
            label="Show"
            value={filter}
            onChange={(next) => setShow(next)}
            options={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
              { value: "overdue", label: "Overdue" },
              { value: "archive", label: "Archive" },
            ]}
          />
        }
      />
      <PageBody className="space-y-6">
        <QuickAdd
          onAdded={() => {
            toast.push({ tone: "success", title: "Task added" });
            reload();
          }}
        />

        <FilterBar
          search={query}
          onSearchChange={setQuery}
          searchPlaceholder="Search tasks"
          searchLabel="Search your tasks by title or key"
          applied={
            departmentLabel
              ? [
                  {
                    label: "Project department",
                    value: departmentLabel,
                    onClear: () => setDepartment(""),
                  },
                ]
              : []
          }
          onClearAll={clearFilters}
        >
          {departments.length > 1 && (
            <Field
              label="Project department"
              help="By the project's department"
            >
              <Select
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FilterBar>

        {boardable && (
          <div className="flex justify-end">
            <SegmentedControl<MyTasksLayout>
              label="Layout"
              value={layout}
              onChange={setLayout}
              options={[
                { value: "list", label: "List" },
                { value: "board", label: "Board" },
              ]}
            />
          </div>
        )}

        {refreshFailed && data.status === "ready" && (
          <p className="text-body-sm text-muted" role="status">
            Couldn&apos;t refresh.{" "}
            <button
              type="button"
              onClick={reload}
              className="font-medium text-accent-text underline-offset-4 hover:underline"
            >
              Try again
            </button>
          </p>
        )}

        {filter === "archive" ? (
          <ArchiveList
            query={query}
            department={department}
            timeZone={timeZone}
            onOpen={setOpenId}
            onClearFilters={clearFilters}
          />
        ) : (
          <LoadState
            loading={data.status === "loading"}
            error={data.status === "error" ? data.error : null}
            onRetry={reload}
            subject="your tasks"
            skeleton="list"
          >
            {data.status === "ready" && boardable && layout === "board" ? (
              <MyTasksBoard
                tasks={[...top(narrow(data.open)), ...top(narrow(data.done))]}
                source={data}
                today={today}
                timeZone={timeZone}
                filtering={filtering}
                onClearFilters={clearFilters}
                onOpen={setOpenId}
                onMoved={reload}
              />
            ) : data.status === "ready" ? (
              <Lists
                filter={filter}
                open={top(narrow(data.open))}
                done={top(narrow(data.done))}
                filtering={filtering}
                onClearFilters={clearFilters}
                today={today}
                timeZone={timeZone}
                onOpen={setOpenId}
              />
            ) : null}
          </LoadState>
        )}
      </PageBody>

      <PersonalIssueDrawer
        issueId={openId}
        issues={all}
        onClose={() => setOpenId(null)}
        onChanged={reload}
        onOpen={setOpenId}
      />
    </>
  );
}

/* ------------------------------------------------------------------ quick add */

function QuickAdd({ onAdded }: { onAdded: () => void }) {
  const toast = useToast();
  const title = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [dueTime, setDueTime] = useState<string | null>(null);
  const [details, setDetails] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const staged = useStagedFiles();
  const drop = useDropTarget((files) => staged.add(files));
  /* Files for the next task, and files that did not attach to one already added. */
  const fresh = staged.items.filter((item) => item.target === null);
  /* Every task a file did not attach to, oldest first, each with its files. */
  const leftovers = staged.items.reduce<
    { task: { id: string; key: string }; items: typeof staged.items }[]
  >((groups, item) => {
    if (!item.target) return groups;
    const group = groups.find((g) => g.task.id === item.target?.id);
    if (group) group.items.push(item);
    else groups.push({ task: item.target, items: [item] });
    return groups;
  }, []);

  async function retry(task: { id: string; key: string }, items: typeof fresh) {
    if (busy) return;
    setBusy(true);
    await attachStaged(task, items, staged);
    setBusy(false);
  }

  async function submit() {
    const name = text.trim();
    if (!name || busy) return;
    setBusy(true);
    const files = fresh;
    try {
      const made = await projectsApi.createMineTask({
        title: name,
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(due ? { dueDate: due } : {}),
        ...(due && dueTime ? { dueTime } : {}),
      });
      setText("");
      setDue("");
      setDueTime(null);
      setDescription("");
      setDetails(false);
      onAdded();
      title.current?.focus();
      /* Refused files were never going anywhere; the task exists now. */
      for (const item of files) if (item.refused) staged.remove(item.id);
      await attachStaged({ id: made.id, key: made.key }, files, staged);
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "Could not add the task",
        detail:
          error instanceof ApiError
            ? error.message
            : "Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      aria-label="Add a task"
      {...drop.handlers}
      className={cn(
        "space-y-3 rounded-lg border border-line bg-canvas p-4",
        drop.over && "outline-2 outline-offset-2 outline-dashed outline-accent",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={title}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="What needs doing?"
          aria-label="What needs doing?"
          autoComplete="off"
          maxLength={240}
          className="min-w-0 flex-1 basis-64"
        />
        <Input
          type="date"
          value={due}
          onChange={(event) => {
            setDue(event.target.value);
            if (!event.target.value) setDueTime(null);
          }}
          aria-label="Due date"
          className="w-auto"
        />
        <DueTimeInput date={due} value={dueTime} onChange={setDueTime} />
        <AttachButton
          size="md"
          disabled={busy}
          onFiles={(files) => void staged.add(files)}
        />
        <Button type="submit" variant="primary" disabled={!text.trim() || busy}>
          Add task
        </Button>
      </div>
      <div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={details}
          onClick={() => setDetails((v) => !v)}
        >
          Add details
        </Button>
      </div>
      {details && (
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          aria-label="Description"
          placeholder="Say more about it, if that helps. Drop files here to attach them."
        />
      )}
      <StagedList
        items={fresh}
        onRemove={staged.remove}
        busy={busy}
        label="Files to attach"
      />
      {leftovers.map(({ task, items }) => (
        <div key={task.id} className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-body-sm text-ink">
              {task.key} was added. These files didn&apos;t attach to it:
            </p>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              loading={busy}
              aria-label={`Try again to attach files to ${task.key}`}
              onClick={() => void retry(task, items)}
            >
              Try again
            </Button>
          </div>
          <StagedList
            items={items}
            onRemove={staged.remove}
            busy={busy}
            label={`Files that didn't attach to ${task.key}`}
          />
        </div>
      ))}
    </form>
  );
}

/* ----------------------------------------------------------------------- lists */

function Lists({
  filter,
  open,
  done,
  filtering,
  onClearFilters,
  today,
  timeZone,
  onOpen,
}: {
  filter: Exclude<Filter, "archive">;
  open: PersonalTask[];
  done: PersonalTask[];
  filtering: boolean;
  onClearFilters: () => void;
  today: string;
  timeZone: string;
  onOpen: (id: string) => void;
}) {
  const nowHHMM = nowHHMMIn(timeZone);
  const overdue = open.filter((t) => isPastDue(t, today, nowHHMM));
  /* `done` is the API's: finished in the last 14 company days. */
  const noMatch = (
    <EmptyState
      icon={<ListChecks />}
      title="No tasks match these filters"
      description="Try another search or department, or clear the filters."
      action={
        <Button variant="secondary" onClick={onClearFilters}>
          Clear filters
        </Button>
      }
    />
  );

  const row = (t: PersonalTask) => (
    <TaskRow
      key={t.id}
      task={t}
      today={today}
      timeZone={timeZone}
      onOpen={onOpen}
    />
  );

  if (filter === "done") {
    if (done.length === 0 && filtering) return noMatch;
    return done.length === 0 ? (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing finished in the last 14 days"
        description="Tasks you finish show here for 14 days, then move to the Archive."
      />
    ) : (
      <Group title="Done (last 14 days)" count={finishedMeta(done)}>
        {done.map(row)}
      </Group>
    );
  }

  if (filter === "overdue") {
    if (overdue.length === 0 && filtering) return noMatch;
    return overdue.length === 0 ? (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing overdue"
        description="Everything on your list is on time."
      />
    ) : (
      <Group title="Overdue" count={overdue.length}>
        {overdue.map(row)}
      </Group>
    );
  }

  const todo = open.filter((t) => t.statusCategory === "TODO");
  const doing = open.filter((t) => t.statusCategory === "IN_PROGRESS");

  if (open.length === 0 && done.length === 0 && filtering) return noMatch;
  if (open.length === 0 && done.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing on your list"
        description="Add the first thing you need to do above."
      />
    );
  }

  return (
    <div className="space-y-6">
      {todo.length > 0 && (
        <Group title="To do" count={todo.length}>
          {todo.map(row)}
        </Group>
      )}
      {doing.length > 0 && (
        <Group title="In progress" count={doing.length}>
          {doing.map(row)}
        </Group>
      )}
      {done.length > 0 && (
        <Disclosure title="Done (last 14 days)" meta={finishedMeta(done)}>
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {done.map(row)}
          </ul>
        </Disclosure>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  /** A number, or words where a bare number would count something that is not what the title says. */
  count: number | string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-body-sm font-semibold text-ink">
        {title}{" "}
        <span className="tabular font-normal text-muted">({count})</span>
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {children}
      </ul>
    </section>
  );
}

/** Where a row lives, right after its title: the board, "Personal" or "Shared by …". */
function SourceChip({ task }: { task: PersonalTask }) {
  if (task.sharedBy) return null;
  return (
    <Badge tone="neutral" size="sm">
      {task.project.personal ? "Personal" : task.project.name || "Project"}
    </Badge>
  );
}

function TaskRow({
  task,
  today,
  timeZone,
  onOpen,
}: {
  task: PersonalTask;
  today: string;
  timeZone: string;
  onOpen: (id: string) => void;
}) {
  const finished = task.statusCategory === "DONE";
  const late = !finished && isPastDue(task, today, nowHHMMIn(timeZone));
  const target = rowTarget(task);
  const cells = (
    <>
      <span className="tabular text-meta text-muted">{task.key}</span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={
            finished
              ? "min-w-0 truncate text-body-sm text-muted line-through"
              : "min-w-0 truncate text-body-sm text-ink"
          }
        >
          {task.title}
        </span>
        <SourceChip task={task} />
        <FinishTag wontDo={task.wontDo} accepted={task.accepted} />
      </span>
      <span className="col-start-2 flex items-center gap-2 text-meta text-muted sm:col-start-auto">
        {task.lostAccess ? (
          <span>You&apos;re no longer on this project</span>
        ) : task.dueDate ? (
          <>
            <span>{dueLabel(task, today)}</span>
            {late && (
              <Badge tone="danger" size="sm">
                Overdue
              </Badge>
            )}
          </>
        ) : (
          <span>No date</span>
        )}
      </span>
      <span className="col-start-2 text-meta text-muted sm:col-start-auto">
        {task.sharedBy
          ? `Shared by ${task.sharedBy.name}`
          : task.setBy
            ? `Set by ${task.setBy.name}`
            : ""}
      </span>
    </>
  );
  const layout =
    "grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]";
  const focus =
    "hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text";
  if (target.kind === "none") {
    return (
      <li>
        <div className={cn(layout, "opacity-70")}>{cells}</div>
      </li>
    );
  }
  if (target.kind === "board") {
    return (
      <li>
        <Link href={target.href} className={cn(layout, focus)}>
          {cells}
        </Link>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className={cn(layout, focus)}
      >
        {cells}
      </button>
    </li>
  );
}

/* --------------------------------------------------------------------- archive */

type ArchiveState =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | {
      status: "ready";
      rows: PersonalTask[];
      total: number;
      hasMore: boolean;
      page: number;
      more: "idle" | "loading" | "failed";
    };

/** Search waits this long after the last keystroke before asking the server. */
const ARCHIVE_SEARCH_DEBOUNCE_MS = 300;

function ArchiveList({
  query,
  department,
  timeZone,
  onOpen,
  onClearFilters,
}: {
  query: string;
  department: string;
  timeZone: string;
  onOpen: (id: string) => void;
  onClearFilters: () => void;
}) {
  const [q, setQ] = useState(query.trim());
  const [state, setState] = useState<ArchiveState>({ status: "loading" });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const timer = setTimeout(
      () => setQ(query.trim()),
      ARCHIVE_SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [query]);

  /* A new search (or a retry) starts again at page one, from a skeleton. */
  const requestKey = `${q}\u0000${String(version)}`;
  const [seenKey, setSeenKey] = useState(requestKey);
  if (requestKey !== seenKey) {
    setSeenKey(requestKey);
    setState({ status: "loading" });
  }
  useEffect(() => {
    const controller = new AbortController();
    projectsApi
      .mineArchive({ page: 1, q }, controller.signal)
      .then((page) =>
        setState({
          status: "ready",
          rows: page.rows,
          total: page.total,
          hasMore: page.hasMore,
          page: 1,
          more: "idle",
        }),
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: "error", error });
      });
    return () => controller.abort();
  }, [q, version]);

  const loadMore = () => {
    if (state.status !== "ready" || state.more === "loading") return;
    const next = state.page + 1;
    setState({ ...state, more: "loading" });
    projectsApi
      .mineArchive({ page: next, q })
      .then((page) =>
        setState((prev) =>
          prev.status === "ready"
            ? {
                ...prev,
                rows: [...prev.rows, ...page.rows],
                total: page.total,
                hasMore: page.hasMore,
                page: next,
                more: "idle",
              }
            : prev,
        ),
      )
      .catch(() =>
        setState((prev) =>
          prev.status === "ready" ? { ...prev, more: "failed" } : prev,
        ),
      );
  };

  if (state.status === "loading" || state.status === "error") {
    return (
      <LoadState
        loading={state.status === "loading"}
        error={state.status === "error" ? state.error : null}
        onRetry={() => setVersion((v) => v + 1)}
        subject="your archive"
        skeleton={
          <div className="space-y-2" aria-label="Loading your archive">
            {[0, 1, 2, 3, 4].map((n) => (
              <Skeleton key={n} className="h-12" />
            ))}
          </div>
        }
      >
        {null}
      </LoadState>
    );
  }

  /* The project-department filter narrows the rows already loaded; the search
     runs on the server across the whole archive. */
  const rows = state.rows.filter((t) => matchesMyTask(t, "", department));

  if (state.total === 0 && !q) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing archived yet"
        description="Tasks you finished more than 14 days ago appear here."
      />
    );
  }
  if (rows.length === 0 && !state.hasMore) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title={
          q
            ? `No archived tasks match "${q}"`
            : "No archived tasks match these filters"
        }
        description="Try another search, or clear it to see the whole archive."
        action={
          <Button variant="secondary" onClick={onClearFilters}>
            Clear search
          </Button>
        }
      />
    );
  }

  return (
    <section aria-label="Archive" className="space-y-3">
      <p className="tabular text-body-sm text-muted" aria-live="polite">
        {state.total === 1
          ? "1 archived task"
          : `${String(state.total)} archived tasks`}
      </p>
      <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_minmax(0,1fr)] gap-x-4 px-3 text-meta font-semibold text-muted sm:grid">
        <span>Task</span>
        <span>Project</span>
        <span>Completed on</span>
        <span>Assignees</span>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {rows.map((task) => {
          const target = rowTarget(task);
          const names = task.assignees.map((a) => a.name);
          const cells = (
            <>
              <span className="min-w-0">
                <span className="tabular mr-2 text-meta text-muted">
                  {task.key}
                </span>
                <span className="text-body-sm text-ink">{task.title}</span>
                <span className="ml-2 inline-flex gap-2 align-baseline">
                  <FinishTag wontDo={task.wontDo} accepted={task.accepted} />
                </span>
              </span>
              <span className="min-w-0 truncate text-body-sm text-muted">
                {task.project.personal ? "Personal" : task.project.name}
              </span>
              <span className="tabular text-body-sm text-muted">
                {/* In a Done column and not finished: it was not completed, so the column does not say so. */}
                {task.wontDo
                  ? `Won't do ${formatDateShort(task.wontDo.at, timeZone)}`
                  : task.doneAt
                    ? formatDateShort(task.doneAt.slice(0, 10), timeZone)
                    : "Not recorded"}
              </span>
              <span
                className="min-w-0 truncate text-body-sm text-muted"
                title={names.join(", ")}
                aria-label={
                  names.length ? `Assignees: ${names.join(", ")}` : undefined
                }
              >
                {task.lostAccess
                  ? "You're no longer on this project"
                  : assigneeSummary(names)}
              </span>
            </>
          );
          const layout =
            "grid w-full grid-cols-1 gap-y-1 px-3 py-2.5 text-left sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_8rem_minmax(0,1fr)] sm:items-center sm:gap-x-4";
          const focus =
            "hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text";
          return (
            <li key={task.id}>
              {target.kind === "board" ? (
                <Link href={target.href} className={cn(layout, focus)}>
                  {cells}
                </Link>
              ) : target.kind === "drawer" ? (
                <button
                  type="button"
                  onClick={() => onOpen(task.id)}
                  className={cn(layout, focus)}
                >
                  {cells}
                </button>
              ) : (
                <div className={cn(layout, "opacity-70")}>{cells}</div>
              )}
            </li>
          );
        })}
      </ul>
      {state.more === "failed" && (
        <p className="text-body-sm text-muted" role="status">
          Couldn&apos;t load more.{" "}
          <button
            type="button"
            onClick={loadMore}
            className="font-medium text-accent-text underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </p>
      )}
      {state.hasMore && state.more !== "failed" && (
        <Button
          variant="secondary"
          onClick={loadMore}
          loading={state.more === "loading"}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
