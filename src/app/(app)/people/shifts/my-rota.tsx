"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import {
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import {
  shortDay,
  spokenDay,
  timesLabel,
  type ApiRotaCell,
  type ApiSwap,
} from "@/lib/api/shifts";
import { useSession } from "@/lib/store/session";
import { swapAsk, useMyRota, useShiftMutations } from "@/lib/store/shifts";
import { colourFor, shiftColours } from "./palette";
import { RequestSwapModal } from "./request-swap";
import { DeclineSwapModal } from "./swaps";

/**
 * Your own shifts, for `/profile`.
 *
 * Exported from the shifts directory rather than written again inside the
 * profile screen, so there is one component that knows what a rota looks like to
 * the person working it. The same argument as `MyLoans`.
 *
 * ## Three things, in this order
 *
 * 1. **Anything waiting on you.** A colleague asking you to take Thursday night
 *    is the only thing here that is a task, and a rota that buries it is a rota
 *    where cover requests go unanswered for a week. It is above the shifts for
 *    that reason.
 * 2. **Your next shift**, in full — the answer to why somebody opened this.
 * 3. **The rest of the month**, as a list. Not a grid: a grid of one person is a
 *    list with extra columns.
 *
 * ## What it does not render
 *
 * Nothing, when this sign-in has no staff record. An accountant with a login and
 * no employment has no rota, and a card saying so is a card explaining itself.
 * The profile page composes this; it does not need to know.
 */
export function MyRota({ className }: { className?: string }) {
  const toast = useToast();
  const { employeeId, displayName } = useSession();
  const { myRota, loading, noRecord, reload } = useMyRota();
  const { acceptSwap, declineSwap } = useShiftMutations();

  const [asking, setAsking] = useState<ApiRotaCell | null>(null);
  const [declining, setDeclining] = useState<ApiSwap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const colours = useMemo(() => {
    const seen = new Map<string, { id: string; startTime: string }>();
    for (const day of myRota?.days ?? []) {
      seen.set(day.shiftId, { id: day.shiftId, startTime: day.startTime });
    }
    return shiftColours([...seen.values()]);
  }, [myRota]);

  if (noRecord) return null;

  const run = async (id: string, action: () => Promise<unknown>, done: string) => {
    setBusy(id);
    try {
      await action();
      toast.push({ title: done, tone: "success" });
      reload();
    } catch (caught) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail:
          caught instanceof ApiError
            ? caught.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setBusy(null);
    }
  };

  const next = myRota?.next ?? null;
  const rest = (myRota?.days ?? []).filter(
    (day) => day.assignmentId !== next?.assignmentId,
  );
  /* Eight, not the whole four weeks. A profile page is a summary, and thirteen
     identical night rows is the same information as three plus a link. */
  const upcoming = rest.slice(0, 8);
  const hidden = rest.length - upcoming.length;

  return (
    <>
      <Card className={className}>
        <CardHeader
          title="My shifts"
          description={
            myRota && myRota.rosteredDays > 0
              ? `${myRota.rosteredDays} ${myRota.rosteredDays === 1 ? "day" : "days"} between ${shortDay(myRota.from)} and ${shortDay(myRota.to)}`
              : undefined
          }
          level={3}
        />
        <CardBody className="flex flex-col gap-4">
          {loading ? (
            <span className="flex items-center gap-2 text-[0.875rem] text-muted">
              <Spinner size="sm" />
              Loading
            </span>
          ) : (
            <>
              {/* Anything waiting on an answer comes first. */}
              {(myRota?.awaitingMe ?? []).map((swap) => (
                <div
                  key={swap.id}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-warning-line bg-warning-soft px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.875rem] font-semibold text-ink">
                      {swap.requester?.name ?? "A colleague"} asked you to cover
                    </p>
                    <p className="mt-0.5 text-[0.875rem] text-body">
                      {swapAsk(swap)}
                    </p>
                    {swap.reason && (
                      <p className="mt-1 text-[0.875rem] italic text-muted">
                        “{swap.reason}”
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      variant="approve"
                      size="sm"
                      loading={busy === swap.id}
                      onClick={() =>
                        void run(
                          swap.id,
                          () => acceptSwap(swap.id),
                          "Agreed. Your manager approves it from here.",
                        )
                      }
                    >
                      Agree
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === swap.id}
                      onClick={() => setDeclining(swap)}
                    >
                      Turn down
                    </Button>
                  </div>
                </div>
              ))}

              {!myRota || myRota.rosteredDays === 0 ? (
                <p className="text-[0.875rem] leading-relaxed text-body">
                  You are not on a rota for the next four weeks.
                </p>
              ) : (
                <>
                  {next && (
                    <div
                      className={cn(
                        "flex flex-wrap items-center gap-3 rounded-md border px-3.5 py-3",
                        colourFor(colours, next.shiftId).block,
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "h-9 w-[3px] shrink-0 rounded-full",
                          colourFor(colours, next.shiftId).bar,
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-muted">
                          Next
                        </p>
                        <p className="text-[0.9375rem] font-semibold text-ink">
                          {next.shiftName} · {spokenDay(next.date)}
                        </p>
                        <p className="tabular text-[0.875rem] text-body">
                          {timesLabel(next)}
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setAsking(next)}>
                        Ask somebody to cover
                      </Button>
                    </div>
                  )}

                  {upcoming.length > 0 && (
                    <ul className="flex flex-col divide-y divide-line">
                      {upcoming.map((day) => {
                        const colour = colourFor(colours, day.shiftId);
                        return (
                          <li
                            key={day.assignmentId}
                            className="flex flex-wrap items-center gap-3 py-2"
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-2.5 shrink-0 rounded-sm",
                                colour.swatch,
                              )}
                            />
                            <span className="tabular w-24 shrink-0 text-[0.875rem] text-body">
                              {shortDay(day.date)}
                            </span>
                            <span className="min-w-0 flex-1 text-[0.875rem] text-ink">
                              <span className="font-semibold">
                                {day.shortName}
                              </span>{" "}
                              {day.shiftName}{" "}
                              <span className="tabular text-muted">
                                {timesLabel(day)}
                              </span>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setAsking(day)}
                            >
                              Ask cover
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="flex flex-wrap items-center gap-3">
                    <ButtonLink size="sm" href="/people/shifts">
                      See the whole rota
                    </ButtonLink>
                    {hidden > 0 && (
                      <span className="text-[0.875rem] text-muted">
                        {hidden} more{" "}
                        {hidden === 1 ? "day" : "days"} to {shortDay(myRota.to)}
                      </span>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </CardBody>
      </Card>

      {asking && employeeId && (
        <RequestSwapModal
          open
          onClose={() => setAsking(null)}
          shift={asking}
          employeeId={employeeId}
          employeeName={displayName ?? "You"}
          onDone={reload}
        />
      )}

      <DeclineSwapModal
        swap={declining}
        onClose={() => setDeclining(null)}
        onDecline={async (reason) => {
          if (!declining) return;
          const target = declining;
          setDeclining(null);
          await run(
            target.id,
            () => declineSwap(target.id, reason),
            "Turned down. They have been told why.",
          );
        }}
      />
    </>
  );
}
