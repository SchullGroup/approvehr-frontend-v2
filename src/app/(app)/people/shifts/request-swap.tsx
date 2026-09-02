"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Spinner,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { spokenDay, timesLabel, type ApiRotaCell } from "@/lib/api/shifts";
import { useRota, useShiftMutations } from "@/lib/store/shifts";

/**
 * "I cannot do Thursday."
 *
 * The one flow on this screen an ordinary member of staff uses, so it is one
 * decision long: pick the colleague. Everything else is derived.
 *
 * ## Why there is no "swap or give away?" choice
 *
 * There cannot be one. Whether this is an exchange or a hand-over is decided by
 * what the colleague is already doing that day, not by a preference:
 *
 * - **They are off that day** → they take the shift. There is nothing to give
 *   back.
 * - **They are working that day** → the two shifts change hands. Handing them a
 *   second shift on a day they already work is a sixteen-hour day, which the API
 *   refuses by name, so it was never an option to offer.
 *
 * So each colleague in the list says which one it will be, and the button says
 * what pressing it does. Asking the user to choose between one real option and
 * one impossible one is the sort of question that looks like flexibility and is
 * actually a trap.
 *
 * ## What happens next
 *
 * The colleague has to agree — a manager cannot agree for them, deliberately —
 * and then somebody who can edit records approves it, which moves both sides of
 * the rota in one go. Until then nothing about the rota has changed.
 */
export function RequestSwapModal({
  open,
  onClose,
  shift,
  employeeId,
  employeeName,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  /** The day being given up. */
  shift: ApiRotaCell;
  /** Whose shift it is. Somebody else's needs permission to edit records. */
  employeeId: string;
  employeeName: string;
  onDone?: () => void;
}) {
  const toast = useToast();
  const { requestSwap } = useShiftMutations();

  /* Everybody, and what they are on that day. One request, and it is what makes
     the list able to say "off that day" rather than making the user guess. */
  const { rota, loading } = useRota({
    from: shift.date,
    to: shift.date,
    includeUnrostered: true,
  });

  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colleagues = useMemo(() => {
    const rows = rota?.rows ?? [];
    return (
      rows
        .filter((row) => row.employeeId !== employeeId)
        .map((row) => ({
          employeeId: row.employeeId,
          name: row.name,
          employeeNo: row.employeeNo,
          theirs: row.days[0] ?? null,
        }))
        /* Somebody already on the same shift that day is dropped: exchanging a
         night for the same night changes nothing, so offering it is offering a
         no-op. Somebody on a *different* shift stays — that is a real swap. */
        .filter((row) => row.theirs?.shiftId !== shift.shiftId)
        .filter((row) =>
          query.trim() === ""
            ? true
            : row.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
    );
  }, [rota, employeeId, query, shift.shiftId]);

  const chosen = colleagues.find((row) => row.employeeId === picked) ?? null;

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    try {
      await requestSwap({
        assignmentId: shift.assignmentId,
        counterpartyId: chosen.employeeId,
        ...(chosen.theirs
          ? { counterpartyAssignmentId: chosen.theirs.assignmentId }
          : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.push({
        title: `Asked ${chosen.name}`,
        tone: "success",
        detail: "They and your manager can both see it.",
      });
      setPicked(null);
      setReason("");
      setQuery("");
      onDone?.();
      onClose();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "That did not go through. Try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ask somebody to cover"
      description={`${employeeName} · ${shift.shiftName}, ${spokenDay(shift.date)}, ${timesLabel(shift)}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="accent"
            onClick={submit}
            loading={busy}
            disabled={!chosen}
          >
            {chosen
              ? chosen.theirs
                ? `Swap with ${chosen.name.split(" ")[0]}`
                : `Ask ${chosen.name.split(" ")[0]}`
              : "Ask"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {error && (
          <p className="rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-body-sm text-ink">
            {error}
          </p>
        )}

        <Field label="Find a colleague" hideLabel>
          {/* `Input` has no prefix prop — the icon is positioned, the input padded. */}
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name"
              className="pl-9"
            />
          </span>
        </Field>

        {loading ? (
          <div className="flex items-center gap-2 text-body-sm text-muted">
            <Spinner size="sm" />
            Loading who is on that day
          </div>
        ) : colleagues.length === 0 ? (
          <p className="text-body-sm text-body">
            Nobody else to ask{query.trim() ? " by that name" : ""}.
          </p>
        ) : (
          <fieldset className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            <legend className="sr-only">
              Who should take {shift.shiftName} on {spokenDay(shift.date)}
            </legend>
            {colleagues.map((row) => {
              const selected = picked === row.employeeId;
              return (
                <label
                  key={row.employeeId}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5",
                    selected
                      ? "border-accent bg-accent-soft"
                      : "border-line bg-surface hover:bg-canvas",
                  )}
                >
                  <input
                    type="radio"
                    name="counterparty"
                    value={row.employeeId}
                    checked={selected}
                    onChange={() => setPicked(row.employeeId)}
                    className="size-4 shrink-0 accent-(--color-accent)"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-medium text-ink">
                      {row.name}
                    </span>
                    <span className="tabular block text-meta text-muted">
                      {row.employeeNo}
                    </span>
                  </span>
                  {row.theirs ? (
                    <Badge tone="info" size="sm">
                      You take {row.theirs.shiftName}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" size="sm">
                      Off that day
                    </Badge>
                  )}
                </label>
              );
            })}
          </fieldset>
        )}

        <Field label="Reason" help="They will see this. One line is plenty.">
          <Textarea
            rows={2}
            maxLength={300}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Family function that evening."
          />
        </Field>
      </div>
    </Modal>
  );
}
