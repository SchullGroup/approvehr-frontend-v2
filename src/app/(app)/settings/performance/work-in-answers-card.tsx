"use client";

import { useState } from "react";
import { ConfirmDialog, Switch, useToast } from "@/components/ui";
import { InfoTooltip } from "@/components/ui/field";
import { actionMessage } from "@/lib/use-action";
import { useFeatureSettings } from "@/lib/store/features";

/**
 * Whether people may use their own finished project work in their review answers.
 *
 * ## What the switch decides
 *
 * On, a person writing their self-review can attach finished tasks from their own list to an
 * answer, each with a note of their own; they can flag an item on that list as wrong; and when
 * feedback is asked for, or an appraiser is chosen, the colleagues who shared a project with them
 * are listed first. All of it is evidence for a person to read. **None of it reaches a mark**, and
 * the card says so beside the switch.
 *
 * ## Off for every company, and asked about before it is on
 *
 * It puts a person's name beside the work they chose to show, so it starts off and turning it on
 * asks first, saying what it does and that staff should be told and the company's own data
 * protection checks done before they use it. Turning it off is one press: it stops anything new and
 * **keeps everything already written**, so a pin on a review somebody has sent is still there to be
 * read and nothing is deleted by a switch.
 *
 * ## It needs Projects, so without Projects it is not there
 *
 * The work is finished tasks on the project boards, so with Projects off nothing is offered however
 * this is set, and a switch that appears to do nothing is absent rather than explained. A company that
 * somehow has it on while Projects is off still gets the switch, because turning it off has to stay
 * possible.
 *
 * ## It is a row of the Records card, and it says nothing it does not need to
 *
 * No heading, no line under the switch and no paragraph in the question: what it does, that it never
 * changes a score, and the data-protection advice are behind the icon beside the switch's name, and the
 * question is its title, Cancel and the action.
 *
 * ## States that are not "off"
 *
 * `workInAnswers` is `null` when the server has not said: an API one deploy behind, or no server at
 * all. That is not a company's answer, so no switch is offered for it, and nothing is drawn in its
 * place: the months field above says which of loading, could not be read, server behind and no server
 * it is, once for the card. Showing "off" would be a claim about a setting that does not exist there.
 *
 * This is the first of the "work in reviews" switches. The second, for the two assists, is
 * `work-assists-card.tsx`, under it in the same card.
 */

/** What it does, behind the icon beside the switch's name. */
const INFO =
  "People can attach up to five finished tasks to an answer in their own self-review, each with a short note, and flag a wrong item on their list. Colleagues who shared a project are listed first when feedback is asked for. Task titles aren't saved, and it never changes a score. Turning it off stops anything new and keeps what's there. Before you switch it on, tell your staff and check with whoever handles data protection whether an assessment is needed.";
export function WorkInAnswersCard({ connected }: { connected: boolean }) {
  const features = useFeatureSettings();
  const toast = useToast();
  const on = features.workInAnswers;
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const switchable = connected && on !== null;
  const saving = features.saving === "workInAnswers";
  const projectsOff = !features.flags.projects;

  async function save(next: boolean) {
    setProblem(null);
    try {
      await features.setWorkInAnswers(next);
      setAsking(false);
      toast.push({
        tone: "success",
        title: next
          ? "Work in review answers switched on"
          : "Work in review answers switched off",
        detail: next
          ? "People can add their finished work to their answers from now on."
          : "Work already added stays.",
      });
    } catch (error) {
      setProblem(actionMessage(error, "that setting"));
      setAsking(false);
    }
  }

  /* Absent, not explained: nothing is offered without Projects. A switch that is
     already on stays, so it can still be turned off. */
  if (!switchable || (projectsOff && !on)) return null;

  return (
    <>
      <div className="flex flex-col gap-3 px-5 py-4">
        <Switch
          /* The name is set here and not left to the label, because the label
             holds the tooltip's button and would add its name to the switch's. */
          aria-label="Let people add their finished work to their review answers"
          label={
            <span className="inline-flex items-center gap-1.5">
              Let people add their finished work to their review answers
              <InfoTooltip label="About work in review answers" text={INFO} />
            </span>
          }
          checked={on}
          disabled={!features.editable || saving}
          onChange={(event) => {
            /* On asks first. Off is one press: it keeps what was written and stops anything
               new, so there is nothing to be careful about. */
            if (event.target.checked) setAsking(true);
            else void save(false);
          }}
        />
        {problem && (
          <p role="alert" className="text-body-sm text-danger-text">
            {problem}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Let people add their work to review answers?"
        tone="primary"
        confirmLabel="Switch it on"
        loading={saving}
        onConfirm={() => void save(true)}
        body={null}
      />
    </>
  );
}
