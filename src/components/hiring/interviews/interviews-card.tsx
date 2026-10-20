"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, CardBody, CardHeader, useToast } from "@/components/ui";
import type { Person } from "@/components/hiring/people-editor";
import { ApiError } from "@/lib/api/client";
import { usePanelPeople } from "@/lib/hiring/access/use-panel-people";
import { seatKey } from "@/lib/hiring/comms/seats";
import type {
  CancelInput,
  ChangeInput,
  ChangeResult,
  InterviewView,
  ScheduleInput,
} from "@/lib/hiring/interviews/model";
import { useInterviewsGateway } from "@/lib/hiring/interviews/use-interviews";
import {
  useEmailReadiness,
  useStageMail,
} from "@/lib/hiring/pipeline/use-comms";
import { useOrgTimezone } from "@/lib/store/session";
import { useLoaded } from "@/lib/use-loaded";
import {
  CancelInterviewDialog,
  NotifyInterviewDialog,
  RescheduleInterviewDialog,
  ScheduleInterviewDialog,
} from "./interview-dialogs";
import { InterviewCard } from "./interview-card";
import { InterviewReminders } from "./interview-reminders";

/**
 * The Interviews card of a record: every interview, a way to book one, and the dialogs
 * to book, change and cancel.
 *
 * ## One card for a connected record and a practice one
 *
 * Both draw this. What differs is behind `useInterviewsGateway`: the API, or a book kept
 * in this browser. The scorecard controls exist only on a connected record and arrive as
 * slots, so a practice board does not show a button that cannot work.
 *
 * ## Optimistic, and put back with the API's sentence
 *
 * Cancelling or moving an interview shows its new state at once, marked "Saving". If the
 * API refuses, the card goes back to what it was and the dialog shows the API's own
 * sentence with what was typed kept, so a refusal is never a card that quietly lies.
 * The overlay lasts only until the list is re-read: it is tied to the array it was made
 * against, and a new array (a reload, a change in the practice book) retires it.
 *
 * ## It never says a message went out unless the API said so
 *
 * What each message came to is shown in the dialog once it is done, and stays on the
 * card under "Emails about this interview".
 */

type Patch = Partial<InterviewView> & { saving?: boolean };

export function InterviewsCard({
  applicationId,
  requisitionId,
  stageId,
  stageName,
  candidateName,
  role,
  interviews,
  canManage,
  onChanged,
  onNotice,
  scorecardActions,
  scorecardPanel,
  badge,
}: {
  applicationId: string;
  requisitionId: string;
  stageId: string | null;
  stageName: string | null;
  candidateName: string;
  role: string | null;
  interviews: readonly InterviewView[];
  canManage: boolean;
  /** Re-read the record. Called after anything that changed. */
  onChanged: () => void;
  /** Where a refusal that has no dialog is said. Falls back to a toast. */
  onNotice?: (tone: "success" | "warning" | "danger", text: string) => void;
  scorecardActions?: (interview: InterviewView) => React.ReactNode;
  scorecardPanel?: (interview: InterviewView) => React.ReactNode;
  /** Beside the Schedule button: where the interviews came from, on a practice record. */
  badge?: React.ReactNode;
}) {
  const gateway = useInterviewsGateway();
  const timeZone = useOrgTimezone();
  const toast = useToast();
  const readiness = useEmailReadiness(canManage);
  const stageMail = useStageMail(requisitionId, canManage);
  /* Staff and invited accounts alike: a company without Core HR has no staff list. */
  const directory = usePanelPeople(requisitionId, canManage);
  const explainer = useLoaded(
    `interview-explainer:${gateway.mode}`,
    canManage,
    (signal) => gateway.explainer(signal),
  );

  const [scheduling, setScheduling] = useState(false);
  const [rescheduling, setRescheduling] = useState<InterviewView | null>(null);
  const [cancelling, setCancelling] = useState<InterviewView | null>(null);
  const [notifying, setNotifying] = useState<InterviewView | null>(null);
  const [overlay, setOverlay] = useState<{
    base: readonly InterviewView[];
    patches: Record<string, Patch>;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const patches = overlay && overlay.base === interviews ? overlay.patches : {};
  const shown = interviews.map((iv) =>
    patches[iv.id] ? { ...iv, ...patches[iv.id] } : iv,
  );

  const stagePanel: Person[] | null =
    stageMail.stages
      ?.find((stage) => stage.stageId === stageId)
      ?.panel?.map((member) => ({
        id: seatKey(member),
        name: member.name,
      })) ?? null;

  const supported = readiness.data?.supported === true;
  const getFile = (iv: InterviewView) => gateway.calendarFile(iv, "staff");

  const say = (
    tone: "success" | "warning" | "danger",
    text: string,
    title = "That did not work",
  ) =>
    onNotice
      ? onNotice(tone, text)
      : toast.push({
          title,
          tone: tone === "warning" ? "info" : tone,
          detail: text,
        });

  /** Show a change at once; put it back, with the API's sentence, if it is refused. */
  async function optimistic(
    iv: InterviewView,
    patch: Patch,
    run: () => Promise<ChangeResult | undefined>,
  ): Promise<ChangeResult | undefined> {
    setOverlay({
      base: interviews,
      patches: { ...patches, [iv.id]: { ...patch, saving: true } },
    });
    try {
      const result = await run();
      /* The server's own answer stands in until the list is re-read. */
      setOverlay({
        base: interviews,
        patches: result
          ? { ...patches, [iv.id]: { ...result.interview } }
          : { ...patches },
      });
      onChanged();
      return result;
    } catch (error) {
      setOverlay({ base: interviews, patches: { ...patches } });
      throw error;
    }
  }

  const schedule = async (input: ScheduleInput): Promise<ChangeResult> => {
    const result = await gateway.schedule(
      {
        applicationId,
        candidateName,
        role,
        stageName,
        stageSeats: (stagePanel ?? []).map((person) => person.id),
      },
      input,
    );
    onChanged();
    return result;
  };

  const change = async (
    iv: InterviewView,
    input: ChangeInput,
  ): Promise<ChangeResult> => {
    const { sendUpdate, ...fields } = input;
    void sendUpdate;
    const result = await optimistic(iv, fields as Patch, () =>
      gateway.change(iv, input),
    );
    if (!result) throw new ApiError(0, "no_answer", "No answer came back.");
    return result;
  };

  const cancel = async (
    iv: InterviewView,
    input: CancelInput,
  ): Promise<ChangeResult> => {
    const result = await optimistic(
      iv,
      {
        status: "CANCELLED",
        ...(gateway.storesCancelReason ? { cancelReason: input.reason } : {}),
      },
      () => gateway.cancel(iv, input),
    );
    if (!result) throw new ApiError(0, "no_answer", "No answer came back.");
    return result;
  };

  /**
   * Turn the candidate's reminders for one interview off or on: shown at once, put back
   * with the API's sentence if it is refused. Turning them off takes what was planned for
   * the candidate off the list; the API's answer then says what stands.
   */
  async function candidateReminders(iv: InterviewView, on: boolean) {
    setBusyId(iv.id);
    try {
      await optimistic(
        iv,
        {
          candidateReminders: on,
          ...(iv.reminders && !on
            ? {
                reminders: {
                  ...iv.reminders,
                  items: iv.reminders.items.filter(
                    (item) =>
                      !(
                        item.audience === "CANDIDATE" &&
                        item.status === "planned"
                      ),
                  ),
                },
              }
            : {}),
        },
        () => gateway.setCandidateReminders(iv, on),
      );
    } catch (error) {
      say(
        "danger",
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const notify = async (iv: InterviewView): Promise<ChangeResult> => {
    const result = await gateway.notify(iv);
    onChanged();
    return result;
  };

  async function settle(iv: InterviewView, what: "COMPLETED" | "NO_SHOW") {
    setBusyId(iv.id);
    try {
      await optimistic(iv, { status: what }, async () => {
        if (what === "COMPLETED") await gateway.complete(iv.id);
        else await gateway.noShow(iv.id);
        return undefined;
      });
    } catch (error) {
      say(
        "danger",
        error instanceof ApiError
          ? error.message
          : "Something went wrong. Try again.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Interviews"
          action={
            canManage || badge ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {badge}
                {canManage && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setScheduling(true)}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    Schedule
                  </Button>
                )}
              </span>
            ) : undefined
          }
        />
        <CardBody className="flex flex-col gap-2.5">
          {shown.length === 0 && (
            <p className="text-body-sm text-muted">Nothing scheduled.</p>
          )}
          {shown.map((iv) => (
            <InterviewCard
              key={iv.id}
              interview={iv}
              timeZone={timeZone}
              canManage={canManage}
              busy={busyId === iv.id}
              getFile={getFile}
              onReschedule={setRescheduling}
              onCancel={setCancelling}
              onComplete={(target) => void settle(target, "COMPLETED")}
              onNoShow={(target) => void settle(target, "NO_SHOW")}
              {...(supported ? { onNotify: setNotifying } : {})}
              scorecardActions={scorecardActions?.(iv)}
              scorecardPanel={scorecardPanel?.(iv)}
              reminders={
                <InterviewReminders
                  interview={iv}
                  timeZone={timeZone}
                  now={gateway.now()}
                  canManage={canManage}
                  busy={busyId === iv.id}
                  onCandidateReminders={(target, on) =>
                    void candidateReminders(target, on)
                  }
                />
              }
            />
          ))}
        </CardBody>
      </Card>

      {/* Each dialog stays mounted regardless of its gating state: `Modal` decides
          whether to render from the real `open` prop, so it can see that value go
          false and play its own exit animation. */}
      <ScheduleInterviewDialog
        open={scheduling}
        onClose={() => setScheduling(false)}
        onConfirm={schedule}
        getFile={getFile}
        candidateName={candidateName}
        timeZone={timeZone}
        now={gateway.now()}
        stagePanel={stagePanel}
        people={directory.people}
        peopleLoading={directory.loading}
        panelSupported={supported}
        readiness={supported ? readiness.data : null}
        explainer={explainer.data}
      />

      <RescheduleInterviewDialog
        open={rescheduling !== null}
        interview={rescheduling}
        onClose={() => setRescheduling(null)}
        onConfirm={(input) =>
          rescheduling
            ? change(rescheduling, input)
            : Promise.reject(new ApiError(0, "none", "Nothing is selected."))
        }
        getFile={getFile}
        timeZone={timeZone}
        now={gateway.now()}
        readiness={supported ? readiness.data : null}
        explainer={explainer.data}
      />

      <NotifyInterviewDialog
        open={notifying !== null}
        interview={notifying}
        onClose={() => setNotifying(null)}
        onConfirm={() =>
          notifying
            ? notify(notifying)
            : Promise.reject(new ApiError(0, "none", "Nothing is selected."))
        }
        getFile={getFile}
        timeZone={timeZone}
        readiness={supported ? readiness.data : null}
        explainer={explainer.data}
      />

      <CancelInterviewDialog
        open={cancelling !== null}
        interview={cancelling}
        onClose={() => setCancelling(null)}
        onConfirm={(input) =>
          cancelling
            ? cancel(cancelling, input)
            : Promise.reject(new ApiError(0, "none", "Nothing is selected."))
        }
        getFile={getFile}
        timeZone={timeZone}
        readiness={supported ? readiness.data : null}
        explainer={explainer.data}
        askReason={gateway.storesCancelReason}
      />
    </>
  );
}
