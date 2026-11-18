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
          ? "People can now use their own work in their review answers"
          : "People can no longer add work to their review answers",
        detail: next
          ? "It applies to the next thing anybody does. Nothing already written is touched."
          : "Everything already written stays, and can still be read by the people who could read it.",
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
          description={
            on === true
              ? "People can attach their own finished project work to the answers in their self-review, and flag an item on their list as wrong."
              : on === false
                ? "Off. Nobody can attach project work to an answer. Work already attached stays where it is."
                : "Whether people can use their own finished project work in their review answers."
          }
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">Reading the setting</p>
          ) : switchable ? (
            <>
              <Switch
                label="Let people use their own project work in their review answers"
                description="They can pin finished tasks to an answer with a note, flag an item as wrong, and see colleagues who shared a project first when feedback is asked for. It is evidence to read and never changes a mark."
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
                  Projects is switched off, so nothing is offered yet however
                  this is set. Switch it on under{" "}
                  <TextLink href="/settings/features">Features</TextLink>.
                </p>
              )}
              <p className="text-body-sm text-muted">
                Turning it off stops anything new. Everything already written
                stays, and can still be read by the people who could read it.
              </p>
              {!features.editable && (
                <p className="text-body-sm text-muted">
                  Read-only: changing this needs the Manage settings permission.
                </p>
              )}
            </>
          ) : failed ? (
            <p className="text-body-sm text-muted">
              The setting could not be read, so no switch is shown rather than a
              guess. Reload the page to try again.
            </p>
          ) : (
            <p className="text-body-sm text-muted">
              {connected
                ? "This server has not been updated to offer this setting yet, so people cannot use their work in their review answers until it is."
                : "Whether people can use their work in their review answers is a company setting kept on the server, so there is nothing to switch here."}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What it does, and what it does not" level={3} />
        <CardBody className="grid gap-6 text-body-sm text-body sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">What people can do</p>
            <ul className="mt-2 list-disc pl-5">
              <li>
                Attach up to five finished tasks to an answer in their own
                self-review, each with a note of up to 280 characters
              </li>
              <li>Take one off again until they send the review</li>
              <li>Flag an item on their list as wrong, with a reason</li>
              <li>
                See the colleagues who shared a project with someone listed
                first when feedback is asked for or an appraiser is chosen
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink">What it never does</p>
            <ul className="mt-2 list-disc pl-5">
              <li>Change a mark, a score, a band or a rank</li>
              <li>Save a task title with an attached task</li>
              <li>Remove anything from the finished-work list</li>
              <li>Choose anybody for anybody: a person still picks</li>
              <li>Offer anything while Projects is switched off</li>
            </ul>
          </div>
          <p className="sm:col-span-2">
            What a person attaches is read by the people who can read the
            review. A flag is read by the people who can read that person&apos;s
            work: the person, their manager, an assigned appraiser and HR. Both
            are for reading beside the answers. The full list of finished work
            stays one press away, so what somebody chose to show is never the
            whole picture.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title="Let people use their own work in their review answers?"
        tone="primary"
        confirmLabel="Switch it on"
        loading={saving}
        onConfirm={() => void save(true)}
        body={
          <div className="flex flex-col gap-3">
            <p>
              From now on a person writing their self-review can attach finished
              tasks from their own list to an answer, each with a note of their
              own. The task&apos;s title is not saved with it.
            </p>
            <ul className="list-disc pl-5">
              <li>
                The people who read the review see what was attached beside the
                answer, and the full list of finished work stays one press away
                for them.
              </li>
              <li>
                A person can flag an item on their list as wrong. It does not
                remove the item or change a mark.
              </li>
              <li>
                When feedback is asked for, or an appraiser is chosen, the
                colleagues who shared a project with the person are listed
                first. Nobody is chosen for anybody.
              </li>
              <li>It only works while Projects is switched on.</li>
            </ul>
            <p>
              Before you switch it on, tell your staff, and check with whoever
              looks after data protection at your company whether an assessment
              should be filed first. This page does not do that for you.
            </p>
            <p>
              Turning it off later stops anything new and keeps everything
              already written.
            </p>
          </div>
        }
      />
    </>
  );
}
