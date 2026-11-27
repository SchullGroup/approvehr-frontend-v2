"use client";

import { useMemo, useState } from "react";
import { Search, Users } from "lucide-react";
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { performanceApi } from "@/lib/api/performance";
import {
  orderBySharedProjects,
  sharedLabel,
} from "@/lib/performance/work-in-answers";
import { useEmployeeDirectory } from "@/lib/store/employees-api";
import { useFeatureSettings } from "@/lib/store/features";
import { useMyAppraisers } from "@/lib/store/performance";
import { useSession } from "@/lib/store/session";
import { useSharedProjects } from "@/lib/store/shared-projects";
import { useHeldWhileOpen } from "@/lib/use-held-while-open";

/**
 * Asking colleagues to review somebody — the 360 half of an appraisal.
 *
 * ## The door this closes
 *
 * `POST /cycles/:id/peer-reviews` was written, guarded and tested, and had
 * **no caller anywhere in the frontend**. Peer answers were already *read* —
 * `now.tsx` renders `peerFeedback`, the register counts peer reviews, the
 * appraiser map weights them — so the product could display 360 feedback it
 * had no way of ever asking for. This is the ask.
 *
 * ## Why it is per person and not per cycle
 *
 * Who somebody's colleagues are is a fact about that person, not about the
 * period: the people best placed to judge the Lagos migration are not the
 * people best placed to judge the payroll rewrite. The API agrees — it takes
 * one `subjectId` and a list of peers, and refuses a caller who is neither HR
 * nor that person's manager, because nobody else knows who their peers are.
 *
 * ## Nothing is undone by asking twice
 *
 * The API `skipDuplicates` on the reviews it writes, so asking the same
 * colleague again is a no-op rather than a second form in their queue. That
 * is what makes it safe to reopen this and add one more name later.
 *
 * ## Colleagues who shared a project come first
 *
 * Where the company has switched on "Work in review answers", the people who were
 * members of a project with the subject are listed first and each says how many they
 * shared. It orders the list and nothing else: nobody is chosen, nobody is left out,
 * and a person is still picked by ticking them. It asks only when the dialog is open,
 * and **where the server says nothing** (the setting is off, this reader is not one
 * it answers, the request failed) the list is exactly what it was, with no claim that
 * anybody shared nothing.
 *
 * The order is held the moment somebody reaches into the list, and let go when the dialog
 * closes: an answer that lands while a person is about to tick a name must not move the
 * names. It then applies the next time the dialog is opened.
 *
 * ## Who is not offered, and who is labelled
 *
 * Neither the person nor the person asking is offered: asking yourself for feedback on
 * somebody whose review you are already writing is a form that adds nothing (UAT
 * 25 Nov, F38). The subject's own appraisers are **labelled, not hidden**: somebody who
 * already appraises them can still be asked, but the list says they do, so the person
 * choosing is not left to remember. That is read from the same "who appraises this
 * person" answer the employee's own page reads; where it does not come, nothing is
 * labelled and nobody is left out.
 */
export function AskPeersDialog({
  open,
  cycleId,
  subjectId,
  subjectName,
  onClose,
  onAsked,
}: {
  open: boolean;
  cycleId: string;
  subjectId: string;
  subjectName: string;
  onClose: () => void;
  onAsked: () => void;
}) {
  const toast = useToast();
  /* `people`, not `employees`: a line manager is sent lookup rows only, and the
     full rows left their list empty (UAT 23 Nov, U101 / PERF-21). */
  const { people, loading } = useEmployeeDirectory({ pageSize: 200 });
  const { workInAnswers } = useFeatureSettings();
  /* The person asking: `employeeId` and not `actingId`, which is "" for an account
     with no staff record and must match nobody. */
  const { employeeId: asker } = useSession();
  const subjectsAppraisers = useMyAppraisers(open ? cycleId : null, subjectId);
  const alsoAppraise = useMemo(
    () =>
      new Set(
        (subjectsAppraisers.row?.appraisers ?? []).map(
          (one) => one.appraiserId,
        ),
      ),
    [subjectsAppraisers.row],
  );
  const shared = useSharedProjects(subjectId, open && workInAnswers === true);
  const colleagues = useHeldWhileOpen(shared.colleagues, open);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* Everybody but the subject and the person asking: the API drops a self-review
     from the list anyway, and offering it would be offering something that
     silently does nothing. */
  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    const listed = people
      .filter((person) => person.id !== subjectId && person.id !== asker)
      .filter(
        (person) =>
          !term ||
          `${person.fullName} ${person.jobTitle}`.toLowerCase().includes(term),
      );
    /* Those who shared a project first, when the server said who; otherwise the list as it came. */
    return orderBySharedProjects(listed, colleagues.shown);
  }, [people, subjectId, asker, query, colleagues.shown]);

  const toggle = (id: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const send = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const result = await performanceApi.askPeers(cycleId, subjectId, [
        ...picked,
      ]);
      toast.push({
        title: `${result.asked} asked about ${subjectName}`,
        tone: "success",
        detail:
          result.notified === result.asked
            ? "Each of them has a form waiting in the app."
            : `${result.notified} were told in the app; the rest have no sign-in yet.`,
      });
      onAsked();
    } catch (caught) {
      setFailed(
        caught instanceof ApiError
          ? caught.message
          : "That did not send. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Who should give feedback on ${subjectName}?`}
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-muted">
            {picked.size === 0
              ? "Nobody chosen yet"
              : `${picked.size} ${picked.size === 1 ? "colleague" : "colleagues"} will be asked`}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={busy}
              disabled={busy || picked.size === 0}
              onClick={() => void send()}
            >
              Ask {picked.size > 0 ? picked.size : ""}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {failed && (
          <p role="status" className="text-body-sm text-danger-text">
            {failed}
          </p>
        )}

        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <Input
            value={query}
            placeholder="Search by name or job title"
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loading ? (
          <span className="flex items-center gap-2 py-6 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading the directory
          </span>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-body-sm text-body">
            {query.trim()
              ? `Nobody matches “${query.trim()}”.`
              : "There is nobody else on the payroll to ask."}
          </p>
        ) : (
          <ul
            className="flex max-h-[22rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line"
            onPointerDownCapture={colleagues.hold}
            onKeyDownCapture={colleagues.hold}
          >
            {candidates.map(({ person, shared: count }) => {
              const detail = [
                person.jobTitle,
                ...(alsoAppraise.has(person.id)
                  ? [`Also appraises ${subjectName}`]
                  : []),
                ...(count > 0 ? [sharedLabel(count)] : []),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={person.id} className="px-3 py-2.5">
                  <Checkbox
                    label={person.fullName}
                    {...(detail ? { description: detail } : {})}
                    checked={picked.has(person.id)}
                    disabled={busy}
                    onChange={() => toggle(person.id)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/** The button, so the register row does not carry the open/closed state. */
export function AskPeersButton({
  cycleId,
  subjectId,
  subjectName,
  onAsked,
}: {
  cycleId: string;
  subjectId: string;
  subjectName: string;
  onAsked: () => void;
}) {
  const [open, setOpen] = useState(false);
  /* Nothing is read until it is first opened: the dialog reads the staff list,
     and a review page or a table of sixty rows should not, for a button that is
     usually not pressed. It stays mounted after, so it can animate out. */
  const [everOpened, setEverOpened] = useState(false);
  if (open && !everOpened) setEverOpened(true);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Users aria-hidden="true" className="size-3.5" />
        Ask colleagues
      </Button>
      {everOpened && (
        <AskPeersDialog
          open={open}
          cycleId={cycleId}
          subjectId={subjectId}
          subjectName={subjectName}
          onClose={() => setOpen(false)}
          onAsked={() => {
            setOpen(false);
            onAsked();
          }}
        />
      )}
    </>
  );
}
