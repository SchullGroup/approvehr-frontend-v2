"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Modal,
  Switch,
  TextLink,
  useToast,
} from "@/components/ui";
import { actionMessage } from "@/lib/use-action";
import { useFeatureSettings } from "@/lib/store/features";

/**
 * Whether the two assists are offered: the list of linked tasks beside Confirm on a done-or-not
 * measure, and the finished tasks of the week offered as text when somebody writes a weekly line.
 *
 * ## What the switch decides, and what it does not
 *
 * It decides those two things and nothing else. **Closing a finished task as won't do and accepting
 * one are not behind it.** They are recordings, available to whoever the server says may make them
 * whatever this says, and they change nothing until a person makes one. The card says so, because a
 * switch that looked as if it governed them would be read as the company having decided something it
 * had not.
 *
 * ## Why it asks before it is on
 *
 * The weekly-line suggestions hand a person's finished tasks back to the box a weekly line is written
 * in, which the product had stopped doing. Nothing is filed, submitted, graded or scored by asking:
 * the person edits the text and submits it by hand, as always. It is still a change in what the box
 * offers, so it starts off for every company and turning it on says what it does first. Turning it
 * off is one press and deletes nothing, because the assists store nothing.
 *
 * ## It needs Projects
 *
 * The tasks are on the project boards, so with Projects off nothing is offered however this is set.
 * The card says so rather than leaving a switch that appears to do nothing.
 *
 * ## Three states that are not "off"
 *
 * `workAssists` is `null` when the server has not said: an API one deploy behind, or no server at
 * all. That is not a company's answer, so no switch is offered for it, and four different sentences
 * say which of loading, could not be read, server behind and no server it is. It is the second of the
 * two "work in reviews" switches, and sits under the first.
 */
export function WorkAssistsCard({ connected }: { connected: boolean }) {
  const features = useFeatureSettings();
  const toast = useToast();
  const on = features.workAssists;
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const reading = features.loading && on === null;
  const failed = !features.loading && features.error != null;
  const switchable = connected && on !== null;
  const saving = features.saving === "workAssists";
  const projectsOff = !features.flags.projects;

  /* Not while the save is out: closing would leave the answer (the toast, or a refusal) with nothing
     on screen to say what it was about, and the request goes on regardless. */
  function close() {
    if (!saving) setAsking(false);
  }

  async function save(next: boolean) {
    setProblem(null);
    try {
      await features.setWorkAssists(next);
      setAsking(false);
      toast.push({
        tone: "success",
        title: next
          ? "The two assists are now offered"
          : "The two assists are no longer offered",
        detail: next
          ? "It applies to the next thing anybody does. Nothing is filed, submitted or graded by them."
          : "Nothing is deleted. Tasks closed as won't do and accepted tasks stay as recorded.",
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
          title="Work behind a milestone, and weekly lines"
          level={3}
          description={
            on === true
              ? "Beside Confirm on a done-or-not measure, the tasks linked to it are listed, and a person writing a weekly line can start from the tasks they finished that week."
              : on === false
                ? "Off. Neither is offered. Tasks closed as won't do and accepted tasks stay as recorded."
                : "Whether the linked tasks are listed beside Confirm and finished tasks are offered when somebody writes a weekly line."
          }
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">Reading the setting</p>
          ) : switchable ? (
            <>
              <Switch
                label="Offer the linked tasks beside Confirm, and finished tasks for weekly lines"
                description="A manager confirming a done-or-not measure sees which tasks are linked to it and where each stands. A person writing a weekly line on an agreed objective can add the tasks they finished that week as text to edit. Both are for reading. Neither changes a mark."
                checked={on}
                disabled={!features.editable || saving}
                onChange={(event) => {
                  /* On asks first. Off is one press: nothing is stored by either assist, so there
                     is nothing to be careful about. */
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
                Closing a finished task as won&apos;t do, and accepting one, are
                not behind this switch. They are recordings, and they change
                nothing until a person makes one. Turning this off deletes
                nothing.
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
                ? "This server has not been updated to offer this setting yet, so the linked tasks and the weekly-line suggestions are not offered until it is."
                : "Whether these are offered is a company setting kept on the server, so there is nothing to switch here."}
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="What it does, and what it does not" level={3} />
        <CardBody className="grid gap-6 text-body-sm text-body sm:grid-cols-2">
          <div>
            <p className="font-medium text-ink">What it offers</p>
            <ul className="mt-2 list-disc pl-5">
              <li>
                Beside Confirm on a done-or-not measure: the tasks linked to it,
                open ones first, each with where it stands (open, finished on a
                date, closed as won&apos;t do, accepted by someone)
              </li>
              <li>
                When a person writes a weekly line on an agreed objective: the
                tasks they finished that week under it, as text they can edit
              </li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-ink">What it never does</p>
            <ul className="mt-2 list-disc pl-5">
              <li>Confirm a measure, or say that one is done</li>
              <li>File, submit, grade or score anything</li>
              <li>Change a mark, a score, a band or a rank</li>
              <li>Save a task title anywhere</li>
              <li>Offer anything while Projects is switched off</li>
            </ul>
          </div>
          <p className="sm:col-span-2">
            The list beside Confirm is shown to the people who may confirm the
            measure. The person whose objective it is does not see it. The
            weekly-line suggestions are read only by the person who owns the
            objective, from their own finished tasks.
          </p>
        </CardBody>
      </Card>

      {/* A Modal with its own footer rather than `ConfirmDialog`, which has no idea a request is out:
          Cancel is off and Escape does nothing while the save is, as in the won't-do dialog. */}
      <Modal
        open={asking}
        onClose={close}
        title="Offer the linked tasks and the weekly-line suggestions?"
        size="sm"
        footer={
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={saving}
              onClick={() => void save(true)}
            >
              Switch it on
            </Button>
          </>
        }
      >
        <div className="text-body-sm leading-relaxed text-body">
          <div className="flex flex-col gap-3">
            <p>
              From now on, beside Confirm on a done-or-not measure, the tasks
              linked to that measure are listed with where each stands. And a
              person writing a weekly line on an agreed objective can add the
              tasks they finished that week as text, then edit it.
            </p>
            <ul className="list-disc pl-5">
              <li>
                Nothing is filed, submitted, graded or scored. The person edits
                the text and sends it themselves, as before.
              </li>
              <li>
                The list never says a measure is done and never recommends
                confirming it. A manager still decides.
              </li>
              <li>
                A task&apos;s title is shown to the person whose task it is, in
                the weekly line, and is not saved by this.
              </li>
              <li>It only works while Projects is switched on.</li>
            </ul>
            <p>
              Closing a task as won&apos;t do and accepting a finished task are
              not part of this and stay as they are. Turning it off later
              deletes nothing.
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
