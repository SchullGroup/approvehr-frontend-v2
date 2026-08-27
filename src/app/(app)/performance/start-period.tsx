"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange } from "lucide-react";
import {
  Button,
  Field,
  Input,
  Modal,
  useToast,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { useFeatures } from "@/lib/store/features";
import { useCycleMutations } from "@/lib/store/performance";

/**
 * Starting an appraisal period, from wherever somebody had the thought.
 *
 * ## One dialog, several buttons
 *
 * The product owner's words: "there should always be multiple buttons leading to
 * the same action to ensure users aren't looking for stuff." So the *act* is one
 * component and the *entries* are many — the performance landing, the objectives
 * queue, the approvals inbox, the dashboard greeting, and one person's record.
 * Three implementations of "new period" would drift in three directions and the
 * one somebody found would be the one that had not been fixed.
 *
 * `StartPeriodButton` renders **nothing** when the company has appraisals
 * switched off or the reader cannot run one, which is what makes it safe to drop
 * onto screens that have nothing to do with performance. A dead button on the
 * dashboard is worse than no button.
 *
 * ## What it does, and what it deliberately does not
 *
 * It creates the period and then goes to it. It does **not** start it in the
 * same breath, and that is the honest order rather than a missing feature: the
 * API refuses a period with no questions, and it refuses a new question once one
 * has started — so a dialog that created and started in one click would lock
 * every company to whatever single question the dialog had room for.
 *
 * The next screen is where the questions and the start button live, and
 * nobody is asked anything until somebody presses it there.
 *
 * ## "Period", not "cycle"
 *
 * `ReviewCycle` is the model's name. An **appraisal period** is what it is called
 * to a person, and this is the third time the engine's word has leaked into the
 * interface — "prepare a run" and "leaver" were the same mistake. The store, the
 * API wrapper and the database still say cycle; nothing a user reads does.
 */
export function StartPeriodDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** The new period's id. The caller decides where to go with it. */
  onCreated: (period: { id: string; name: string }) => void;
}) {
  const periods = useCycleMutations();

  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (name.trim().length < 3) {
      setError("Name it — people will see this in their inbox.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const created = await periods.createCycle(
        name.trim(),
        dueDate || undefined,
      );
      onCreated({ id: created.id, name: created.name });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Could not create that period.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Start an appraisal period"
      size="sm"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void submit()}
          >
            Create the period
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="What to call it" required {...(error ? { error } : {})}>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="H2 2026 appraisal"
          />
        </Field>
        <Field optional label="Answers due by">
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

/**
 * The button, wherever it is wanted.
 *
 * `variant` defaults to secondary on purpose. This is the page's own action on
 * the performance screens and passes `accent` there; on somebody's record or the
 * dashboard it is one of several things a person might do, and a blue primary on
 * every screen in the product would make none of them read as the suggestion.
 */
export function StartPeriodButton({
  variant = "secondary",
  size = "sm",
  block = false,
  label = "Start an appraisal period",
  withIcon = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  label?: string;
  withIcon?: boolean;
}) {
  const features = useFeatures();
  const canManage = useCan("MANAGE_SETTINGS");
  const router = useRouter();
  const toast = useToast();

  const [open, setOpen] = useState(false);

  /* Absent, not disabled. A company that has not turned appraisals on has no
     business being shown the door to them on its dashboard, and somebody who
     cannot run one would only find out by clicking. */
  if (features.loading || !features.appraisals || !canManage) return null;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        block={block}
        onClick={() => setOpen(true)}
      >
        {withIcon && <CalendarRange aria-hidden="true" className="size-3.5" />}
        {label}
      </Button>

      {open && (
        <StartPeriodDialog
          onClose={() => setOpen(false)}
          onCreated={(period) => {
            setOpen(false);
            toast.push({
              title: `${period.name} created`,
              tone: "success",
              detail: "Add the questions, then start it.",
            });
            router.push(`/performance/periods/${period.id}`);
          }}
        />
      )}
    </>
  );
}
