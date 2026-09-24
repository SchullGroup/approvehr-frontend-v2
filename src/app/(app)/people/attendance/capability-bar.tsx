"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Button,
  Card,
  CardBody,
  Modal,
  Switch,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { FEATURE_COPY, useFeatureSettings } from "@/lib/store/features";
import { useAttendancePolicy } from "@/lib/store/attendance";
import { OvertimeEnableSwitch } from "@/app/(app)/settings/overtime/form";
import { ApprovalWorkflow } from "@/app/(app)/settings/leave/form";

/**
 * The on/off switches for Time & Leave, reached from a button on the
 * Attendance tab's own header.
 *
 * ## Why here, and why only here
 *
 * Attendance is first in this module's own nav group, and the request was for
 * one door rather than the same four switches repeated across Attendance,
 * Leave, Shifts and Overtime — a company checks its capability posture once,
 * not once per screen it happens to be looking at.
 *
 * ## A modal, not a form
 *
 * Every switch here is the same immediate-save on/off decision its standalone
 * settings page already offers, imported rather than reimplemented — never a
 * second store, never a second `save` call. Rates, caps, entitlements and
 * holidays stay on `/settings/overtime` and `/settings/leave`; this is the
 * on/off layer only. It used to sit open-by-default in the page body as a
 * `Disclosure`, ahead of the clock-in card everybody actually opens this
 * screen for; a button beside "Invite staff" gets it off the page entirely
 * until somebody asks for it, with no ceremony beyond the switches themselves
 * — so there is no footer, no save button, nothing to confirm.
 *
 * ## Omitted rather than shown disabled, per switch and for the button itself
 *
 * A manager who can approve leave but holds neither `MANAGE_PAY_STRUCTURE` nor
 * `MANAGE_SETTINGS` should not find an "Attendance settings" button that opens
 * onto nothing — so the whole button is absent for them, not merely empty
 * inside. Each switch then makes its own, narrower version of the same call.
 */
export function AttendanceSettingsButton() {
  const canOvertime = useCan("MANAGE_PAY_STRUCTURE");
  const canSettings = useCan("MANAGE_SETTINGS");
  const [open, setOpen] = useState(false);

  /* A bare permission check, on purpose — matching `canSeeRoster` on this same
     screen rather than special-casing demo mode. A demo persona is still a
     persona: `attendance-screen.tsx` already hides the roster from a plain
     employee offline, and a settings button that opened onto nothing for the
     same reader would be the one inconsistent surface on the page. */
  if (!canOvertime && !canSettings) return null;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <SlidersHorizontal aria-hidden="true" className="size-4" />
        Attendance settings
      </Button>
      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Attendance settings"
          description="Overtime, leave approval, shifts and self clock-in — switched on or off without leaving this tab. Rates, caps and entitlements still live on their own settings pages."
        >
          <div className="flex flex-col gap-4">
            <OvertimeEnableSwitch />
            <LeaveApprovalWorkflowSlot />
            <ShiftsEnableSwitch />
            <SelfServiceClockInSwitch />
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * `ApprovalWorkflow` (`settings/leave/form.tsx`) is reused exactly as its own
 * settings page renders it, disabled control and all — right there, where
 * somebody is already looking at leave types and entitlements. Here, on a
 * capability bar rather than a settings page, the same disabled control would
 * be dead furniture for anybody without `MANAGE_SETTINGS`, so this is the one
 * place that principle is applied from outside the component instead of
 * inside it.
 */
function LeaveApprovalWorkflowSlot() {
  const features = useFeatureSettings();
  if (!features.editable) return null;
  return <ApprovalWorkflow />;
}

function ShiftsEnableSwitch() {
  const features = useFeatureSettings();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  if (!features.editable) return null;

  async function toggle(next: boolean) {
    setPending(true);
    try {
      await features.setFeature("shifts", next);
      toast.push({
        title: `${FEATURE_COPY.shifts.label} ${next ? "is on" : "is off"}`,
        tone: next ? "success" : "info",
        ...(next
          ? {}
          : { detail: "Nothing was deleted. Switch it back on any time." }),
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardBody>
        <Switch
          label={FEATURE_COPY.shifts.label}
          description={FEATURE_COPY.shifts.line}
          checked={features.flags.shifts}
          disabled={features.loading || pending}
          onChange={(event) => void toggle(event.target.checked)}
        />
      </CardBody>
    </Card>
  );
}

function SelfServiceClockInSwitch() {
  const { policy, loading, saving, editable, save } = useAttendancePolicy();
  const toast = useToast();

  if (!editable) return null;

  async function toggle(next: boolean) {
    try {
      await save({ selfServiceClockIn: next });
      toast.push({
        title: next
          ? "Staff clock themselves in again"
          : "Only HR records attendance now",
        tone: "success",
      });
    } catch (error) {
      toast.push({
        title: "That did not save",
        tone: "danger",
        detail:
          error instanceof ApiError
            ? error.message
            : "Something went wrong. Try again.",
      });
    }
  }

  return (
    <Card>
      <CardBody>
        <Switch
          label="Staff clock themselves in"
          description="Off means only HR records attendance, and the clock-in button on everybody's own screen disappears: attendance itself stays on."
          checked={policy.selfServiceClockIn}
          disabled={loading || saving}
          onChange={(event) => void toggle(event.target.checked)}
        />
      </CardBody>
    </Card>
  );
}
