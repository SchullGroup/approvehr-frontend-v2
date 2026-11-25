"use client";

import { useState } from "react";
import {
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Switch,
  TextLink,
  useToast,
} from "@/components/ui";
import { actionMessage } from "@/lib/use-action";
import { useFeatureSettings } from "@/lib/store/features";
import {
  LOADING,
  LOAD_FAILED,
  NOT_ON_SERVER,
  NO_SERVER,
  READ_ONLY,
} from "./setting-copy";

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
 * ## It needs Projects
 *
 * The work is finished tasks on the project boards, so with Projects off nothing is offered however
 * this is set. The card says so rather than leaving a switch that appears to do nothing.
 *
 * ## Three states that are not "off"
 *
 * `workInAnswers` is `null` when the server has not said: an API one deploy behind, or no server at
 * all. That is not a company's answer, so no switch is offered for it. Showing "off" would be a claim
 * about a setting that does not exist there. Four different sentences say which of loading, could not
 * be read, server behind and no server it is.
 *
 * This is the first of the "work in reviews" switches. The second, for the two assists, is
 * `work-assists-card.tsx`, under it in the same tab.
 */
export function WorkInAnswersCard({ connected }: { connected: boolean }) {
  const features = useFeatureSettings();
  const toast = useToast();
  const on = features.workInAnswers;
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reading = features.loading && on === null;
  const failed = !features.loading && features.error != null;
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

  return (
    <>
      <Card>
        <CardHeader
          title="Work in review answers"
          level={3}
          info="People can attach up to five finished tasks to an answer in their own self-review, each with a short note, and flag a wrong item on their list. Colleagues who shared a project are listed first when feedback is asked for. Task titles aren't saved, and it never changes a score. Turning it off stops anything new and keeps what's there."
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">{LOADING}</p>
          ) : switchable ? (
            <>
              <Switch
                label="Let people add their finished work to their review answers"
                description="It never changes a score."
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
              {projectsOff && (
                <p className="text-body-sm text-muted">
                  Needs Projects. Turn it on in{" "}
                  <TextLink href="/settings/features">Features</TextLink>.
                </p>
              )}
              {!features.editable && (
                <p className="text-body-sm text-muted">{READ_ONLY}</p>
              )}
            </>
          ) : failed ? (
            <p className="text-body-sm text-muted">{LOAD_FAILED}</p>
          ) : (
            <p className="text-body-sm text-muted">
              {connected ? NOT_ON_SERVER : NO_SERVER}
            </p>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Let people add their work to review answers?"
        tone="primary"
        confirmLabel="Switch it on"
        loading={saving}
        onConfirm={() => void save(true)}
        body={
          <div className="flex flex-col gap-3">
            <p>
              People can attach finished tasks from their own list to their
              self-review answers, with a note. Task titles aren&apos;t saved.
              Reviewers see what was attached and can still open the full list.
            </p>
            <p>
              People can also flag a wrong item on their list, and colleagues
              who shared a project are listed first when feedback is asked for.
              It needs Projects.
            </p>
            <p>
              Before you switch it on, tell your staff and check with whoever
              handles data protection whether an assessment is needed.
            </p>
          </div>
        }
      />
    </>
  );
}
