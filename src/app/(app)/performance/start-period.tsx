"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Sparkles } from "lucide-react";
import {
  Button,
  ButtonLink,
  Callout,
  Checkbox,
  Disclosure,
  Field,
  Input,
  Modal,
  useToast,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import { useCan } from "@/lib/permissions";
import { useDepartments } from "@/lib/store/departments";
import { useFeatures } from "@/lib/store/features";
import { useAssistantAvailable } from "@/lib/store/ai";
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
  const assistant = useAssistantAvailable();

  const departments = useDepartments();

  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  /**
   * Who the period covers. **Empty is everybody**, and that is the default.
   *
   * Asked here rather than on the period screen because the API reads it once,
   * at activation — the forms are written in that call, so changing the scope
   * after a period has started moves nobody. Offering it later would be a
   * control that silently does nothing.
   */
  const [scope, setScope] = useState<string[]>([]);
  /** Days before the deadline to chase whoever still owes a form. */
  const [remind, setRemind] = useState("");
  /** Off by default. Lets a manager add their own questions, scoped to their team. */
  const [managersCanAddQuestions, setManagersCanAddQuestions] =
    useState(false);
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
        {
          ...(scope.length > 0 ? { departmentIds: scope } : {}),
          ...(remind ? { remindDaysBefore: Number(remind) } : {}),
          ...(managersCanAddQuestions ? { managersCanAddQuestions: true } : {}),
        },
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
        {/* The other door, and only when there is one.
            ------------------------------------------
            This dialog is right for somebody who already knows what the period
            is asking of everybody. The wizard is for the much commoner case
            where they do not, and it drafts the goals and questions from a
            description. Absent rather than disabled when no assistant is wired,
            because that screen would have nothing to do — same rule the Suggest
            buttons follow. */}
        {assistant.available && (
          <Callout tone="accent" title="Not sure what to put in it?">
            <p>
              Describe the half in a sentence or two and get the company goals
              and the review questions as a draft you edit. Nothing is created
              until you have read it.
            </p>
            <p className="mt-2">
              <ButtonLink
                href="/performance/periods/new"
                variant="secondary"
                size="sm"
              >
                <Sparkles aria-hidden="true" className="size-3.5" />
                Draft it from a description
              </ButtonLink>
            </p>
          </Callout>
        )}

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

        {/* Both closed by default. Neither is a blocker — a period with no
            scope covers everybody and a period with no reminder still works —
            so `PARITY.md` Rule 5 says they may be behind a reveal. The summary
            carries the current answer so nobody has to open it to check. */}
        <Disclosure
          title="Who it covers"
          meta={
            scope.length === 0
              ? "Everybody"
              : `${scope.length} department${scope.length === 1 ? "" : "s"}`
          }
          hint="Everybody, unless you pick specific departments below."
        >
          {departments.flat.length === 0 ? (
            <p className="text-body-sm text-muted">
              There are no departments to narrow this to, so it covers
              everybody.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {departments.flat.map((department) => (
                <Checkbox
                  key={department.id}
                  label={department.name}
                  checked={scope.includes(department.id)}
                  onChange={(event) =>
                    setScope((current) =>
                      event.target.checked
                        ? [...current, department.id]
                        : current.filter((id) => id !== department.id),
                    )
                  }
                />
              ))}
              {scope.length > 0 && (
                <p className="text-meta text-muted">
                  Only people in {scope.length === 1 ? "this" : "these"}{" "}
                  department{scope.length === 1 ? "" : "s"} get a form. This is
                  read when you start the period and cannot be changed
                  afterwards.
                </p>
              )}
            </div>
          )}
        </Disclosure>

        <Disclosure
          title="Chase people automatically"
          meta={
            remind
              ? `${remind} day${remind === "1" ? "" : "s"} before`
              : "Switched off"
          }
          hint="One reminder to whoever still owes a form."
        >
          <div className="flex flex-col gap-2">
            <Field optional label="Days before the deadline">
              <Input
                type="number"
                min={1}
                max={30}
                inputMode="numeric"
                className="w-32"
                value={remind}
                placeholder="e.g. 3"
                disabled={!dueDate}
                onChange={(event) => setRemind(event.target.value)}
              />
            </Field>
            <p className="text-meta text-muted">
              {dueDate
                ? "It goes once, to the people who still owe a form — never to anybody who has already sent theirs. One reminder, not one a day: a nudge people learn to ignore takes the real notifications with it."
                : "Set a due date above first — there is nothing to count back from."}
            </p>
          </div>
        </Disclosure>

        <Disclosure
          title="Let managers add their own questions"
          meta={managersCanAddQuestions ? "On" : "Off"}
          hint="On top of the standard questions, scoped to their own team."
        >
          <Checkbox
            label="Managers can add role-specific questions to this period"
            checked={managersCanAddQuestions}
            onChange={(event) =>
              setManagersCanAddQuestions(event.target.checked)
            }
          />
          <p className="mt-2 text-meta text-muted">
            A question a manager adds is only ever asked of their own
            department — never the whole company. This can be changed later,
            while the period is still a draft.
          </p>
        </Disclosure>
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
