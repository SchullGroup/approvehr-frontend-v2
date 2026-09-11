"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Sparkles } from "lucide-react";
import {
  Button,
  Callout,
  Checkbox,
  Disclosure,
  Field,
  Input,
  Modal,
  Textarea,
  useToast,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui";
import { NOTICE_LINK, NoticeLine } from "@/components/portal/notice-line";
import { actionMessage } from "@/lib/use-action";
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
   * The months being appraised — **not** the deadline.
   *
   * A half runs January to July and is answered in August, and a period that
   * could only say when the form was owed left the months it covered to be
   * inferred from its name. Asked here rather than behind a reveal, because it
   * is the first line of every appraisal form a person reads: "for the period
   * January to July 2026".
   */
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  /** What to say above question 1, and where the company's guide is. */
  const [instructions, setInstructions] = useState("");
  const [guideUrl, setGuideUrl] = useState("");
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
  const [managersCanAddQuestions, setManagersCanAddQuestions] = useState(false);
  /**
   * Field errors and form errors, kept apart.
   *
   * One `error` string used to carry both and it was rendered on **What to
   * call it**, so a failure belonging to the whole form — including a 500 from
   * `POST /cycles` — appeared under the name field and sent somebody off to
   * retype a name that was never the problem. A period whose dates were the
   * wrong way round said so under the name too.
   *
   * An error under a label is a claim about that field. If it is not about
   * that field it belongs above the form, where it does not accuse anything.
   */
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fail = (field: string, message: string) => {
    setErrors({ [field]: message });
    setFormError(null);
  };

  const submit = async () => {
    if (name.trim().length < 3) {
      fail("name", "Name it: people will see this in their inbox.");
      return;
    }
    /* Both or neither, and in order. Checked here so the answer arrives while
       the dialog is open rather than as a server refusal after Create — the
       API enforces the same rule, and these are its own sentences. */
    if (Boolean(periodStart) !== Boolean(periodEnd)) {
      fail(
        "period",
        "A period needs a start and an end. Set both, or clear both.",
      );
      return;
    }
    if (periodStart && periodEnd && periodStart > periodEnd) {
      fail("period", "The period ends before it starts.");
      return;
    }
    if (guideUrl.trim() && !/^https?:\/\//i.test(guideUrl.trim())) {
      fail("guideUrl", "A guide link has to start with http:// or https://.");
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const created = await periods.createCycle(
        name.trim(),
        dueDate || undefined,
        {
          ...(scope.length > 0 ? { departmentIds: scope } : {}),
          ...(remind ? { remindDaysBefore: Number(remind) } : {}),
          ...(managersCanAddQuestions ? { managersCanAddQuestions: true } : {}),
          ...(periodStart && periodEnd ? { periodStart, periodEnd } : {}),
          ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          ...(guideUrl.trim() ? { guideUrl: guideUrl.trim() } : {}),
        },
      );
      onCreated({ id: created.id, name: created.name });
    } catch (caught) {
      /* The whole form, so above the form. `actionMessage` is the one place
         that turns a thrown thing into a sentence for a write — the API's own
         words where it wrote them, and never a status code. */
      setFormError(actionMessage(caught, "the period"));
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
        {/* A line above the first field, not a tinted pitch with a heading
            and a paragraph inside a dialog somebody opened to type a name. */}
        {assistant.available && (
          <NoticeLine tone="muted">
            <Link href="/performance/periods/new" className={NOTICE_LINK}>
              <Sparkles aria-hidden="true" className="mr-1 inline size-3.5" />
              Draft it from a description
            </Link>
            <span>instead, and edit what comes back.</span>
          </NoticeLine>
        )}

        {formError && (
          <Callout tone="danger" title="That period was not created">
            {formError}
          </Callout>
        )}

        <Field
          label="What to call it"
          required
          {...(errors["name"] ? { error: errors["name"] } : {})}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="H2 2026 appraisal"
          />
        </Field>
        {/* The period first, then the deadline. In that order because that is
            the order they appear on the form itself, and because a screen that
            asks for a deadline before it asks what is being appraised invites
            somebody to put the appraisal months in the deadline box — which is
            what only having `dueDate` used to force. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            optional
            label="Period covered — from"
            {...(errors["period"] ? { error: errors["period"] } : {})}
          >
            <Input
              type="date"
              value={periodStart}
              onChange={(event) => setPeriodStart(event.target.value)}
            />
          </Field>
          <Field optional label="to">
            <Input
              type="date"
              value={periodEnd}
              onChange={(event) => setPeriodEnd(event.target.value)}
            />
          </Field>
        </div>

        <Field
          optional
          label="Answers due by"
          help="When the form is owed, which is usually after the period ends."
        >
          <Input
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </Field>

        {/* Behind a reveal: neither is a blocker, and the summary carries the
            current answer so nobody has to open it to check. Same rule as the
            two below — `PARITY.md` Rule 5. */}
        <Disclosure
          title="What to tell people"
          meta={
            instructions.trim()
              ? `${String(instructions.trim().split(/\s+/).length)} words`
              : "Nothing yet"
          }
          hint="Shown above the first question on everybody's form."
        >
          <div className="flex flex-col gap-3">
            <Field optional label="Instructions">
              <Textarea
                rows={5}
                value={instructions}
                placeholder={
                  "This is a mandatory mid-year appraisal covering January to July.\n\n" +
                  "It exists to assess how the half went and agree what the next one is for."
                }
                onChange={(event) => setInstructions(event.target.value)}
              />
            </Field>
            <p className="text-meta text-muted">
              Plain text. Line breaks are kept, so a blank line makes a new
              paragraph.
            </p>
            <Field
              optional
              label="A link to your own guide"
              {...(errors["guideUrl"] ? { error: errors["guideUrl"] } : {})}
            >
              <Input
                type="url"
                inputMode="url"
                value={guideUrl}
                placeholder="https://…"
                onChange={(event) => setGuideUrl(event.target.value)}
              />
            </Field>
          </div>
        </Disclosure>

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
                ? "It goes once, to the people who still owe a form, never to anybody who has already sent theirs. One reminder, not one a day: a nudge people learn to ignore takes the real notifications with it."
                : "Set a due date above first: there is nothing to count back from."}
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
            department, never the whole company. This can be changed later,
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
