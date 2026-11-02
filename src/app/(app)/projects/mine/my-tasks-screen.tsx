"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListChecks } from "lucide-react";
import {
  Badge,
  Button,
  Disclosure,
  EmptyState,
  Input,
  LoadState,
  SegmentedControl,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";
import { PageBody, PageHeader } from "@/components/portal/shell";
import { ProjectsOff } from "@/components/projects/module-off";
import { PersonalIssueDrawer } from "@/components/projects/personal-issue-drawer";
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
import { useProjectsGate } from "@/lib/store/project-session";
import { useOrgTimezone } from "@/lib/store/session";
import { dayIn, formatDateShort, todayIn } from "@/lib/time";

/**
 * `/projects/mine`: your own list, apart from any board.
 *
 * Quick add at the top (Enter adds; "Add details" opens a description), then the
 * open tasks in To do and In progress, and what you finished this week, closed.
 * A row opens the issue drawer. "Set by" appears only when somebody else put the
 * task on your list.
 *
 * "Attach files" sits beside the date, and the form takes files dropped on it.
 * Adding makes the task first, then uploads and records each file on it. A file
 * that fails stays listed with why, under "MY-7 was added", with Try again —
 * the task is never added twice.
 */

type Filter = "open" | "done" | "overdue";

type Loaded =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "ready"; open: PersonalTask[]; done: PersonalTask[] };

/** The Monday on or before a `YYYY-MM-DD` day. */
function weekStart(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

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
  const [filter, setFilter] = useState<Filter>("open");
  const [data, setData] = useState<Loaded>({ status: "loading" });
  const [openId, setOpenId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      projectsApi.mineTasks("open", controller.signal),
      projectsApi.mineTasks("done", controller.signal),
    ])
      .then(([open, done]) => setData({ status: "ready", open, done }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        /* With a list already on screen a failed refresh stays quiet. */
        setData((prev) =>
          prev.status === "ready" ? prev : { status: "error", error },
        );
      });
    return () => controller.abort();
  }, [version]);

  if (data.status === "error" && isModuleOff(data.error)) {
    return <ProjectsOff />;
  }

  const all =
    data.status === "ready"
      ? [...data.open, ...data.done]
      : ([] as PersonalTask[]);
  const top = (rows: PersonalTask[]) => rows.filter((t) => t.parentId === null);

  return (
    <>
      <PageHeader
        title="My tasks"
        description="Your own list, apart from any project."
        action={
          <SegmentedControl<Filter>
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open" },
              { value: "done", label: "Done" },
              { value: "overdue", label: "Overdue" },
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

        <LoadState
          loading={data.status === "loading"}
          error={data.status === "error" ? data.error : null}
          onRetry={reload}
          subject="your tasks"
          skeleton="list"
        >
          {data.status === "ready" && (
            <Lists
              filter={filter}
              open={top(data.open)}
              done={top(data.done)}
              today={today}
              timeZone={timeZone}
              onOpen={setOpenId}
            />
          )}
        </LoadState>
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
      });
      setText("");
      setDue("");
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
          onChange={(event) => setDue(event.target.value)}
          aria-label="Due date"
          className="w-auto"
        />
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
  today,
  timeZone,
  onOpen,
}: {
  filter: Filter;
  open: PersonalTask[];
  done: PersonalTask[];
  today: string;
  timeZone: string;
  onOpen: (id: string) => void;
}) {
  const since = weekStart(today);
  const overdue = useMemo(
    () => open.filter((t) => t.dueDate !== null && t.dueDate < today),
    [open, today],
  );
  const finishedThisWeek = useMemo(
    () =>
      done.filter((t) => {
        const day = t.doneAt ? dayIn(t.doneAt, timeZone) : null;
        return day !== null && day >= since;
      }),
    [done, since, timeZone],
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
    return done.length === 0 ? (
      <EmptyState
        icon={<ListChecks />}
        title="Nothing finished yet"
        description="Tasks you finish show here."
      />
    ) : (
      <Group title="Done" count={done.length}>
        {done.map(row)}
      </Group>
    );
  }

  if (filter === "overdue") {
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

  if (open.length === 0 && finishedThisWeek.length === 0) {
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
      {finishedThisWeek.length > 0 && (
        <Disclosure
          title="Done this week"
          meta={String(finishedThisWeek.length)}
        >
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {finishedThisWeek.map(row)}
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
  count: number;
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
  const late = !finished && task.dueDate !== null && task.dueDate < today;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(task.id)}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent-text sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_auto]"
      >
        <span className="tabular text-meta text-muted">{task.key}</span>
        <span
          className={
            finished
              ? "min-w-0 truncate text-body-sm text-muted line-through"
              : "min-w-0 truncate text-body-sm text-ink"
          }
        >
          {task.title}
        </span>
        <span className="col-start-2 flex items-center gap-2 text-meta text-muted sm:col-start-auto">
          {task.dueDate ? (
            <>
              <span>Due {formatDateShort(task.dueDate, timeZone)}</span>
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
          {task.setBy ? `Set by ${task.setBy.name}` : ""}
        </span>
      </button>
    </li>
  );
}
