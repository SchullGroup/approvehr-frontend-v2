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
import { useEmployeeDirectory } from "@/lib/store/employees-api";

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
 */
export function AskPeersDialog({
  cycleId,
  subjectId,
  subjectName,
  onClose,
  onAsked,
}: {
  cycleId: string;
  subjectId: string;
  subjectName: string;
  onClose: () => void;
  onAsked: () => void;
}) {
  const toast = useToast();
  const { employees, loading } = useEmployeeDirectory({ pageSize: 200 });
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /* Everybody but the subject: the API drops a self-review from the list
     anyway, and offering it would be offering something that silently does
     nothing. */
  const candidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return employees
      .filter((person) => person.id !== subjectId)
      .filter(
        (person) =>
          !term ||
          `${person.firstName} ${person.lastName} ${person.jobTitle}`
            .toLowerCase()
            .includes(term),
      );
  }, [employees, subjectId, query]);

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
      open
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
          <p
            role="status"
            className="rounded-md border border-danger-line bg-danger-soft px-3.5 py-2.5 text-body-sm text-ink"
          >
            {failed}
          </p>
        )}

        <p className="text-body-sm leading-relaxed text-body">
          Each one gets their own form about {subjectName}. Their answers count
          towards the mark only if they are an appraiser with a share of it —
          otherwise they are read as feedback beside it.
        </p>

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
            Reading the directory
          </span>
        ) : candidates.length === 0 ? (
          <p className="py-6 text-body-sm text-body">
            {query.trim()
              ? `Nobody matches “${query.trim()}”.`
              : "There is nobody else on the payroll to ask."}
          </p>
        ) : (
          <ul className="flex max-h-[22rem] flex-col divide-y divide-line overflow-y-auto rounded-md border border-line">
            {candidates.map((person) => (
              <li key={person.id} className="px-3 py-2.5">
                <Checkbox
                  label={`${person.firstName} ${person.lastName}`}
                  {...(person.jobTitle ? { description: person.jobTitle } : {})}
                  checked={picked.has(person.id)}
                  disabled={busy}
                  onChange={() => toggle(person.id)}
                />
              </li>
            ))}
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
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <Users aria-hidden="true" className="size-3.5" />
        Ask colleagues
      </Button>
      {open && (
        <AskPeersDialog
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
