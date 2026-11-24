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
import {
  LOADING,
  LOAD_FAILED,
  NOT_ON_SERVER,
  NO_SERVER,
  READ_ONLY,
} from "./setting-copy";

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
          ? "Task suggestions switched on"
          : "Task suggestions switched off",
        detail: next
          ? "Nothing is filed or graded by them."
          : "Nothing is deleted.",
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
          title="Task suggestions"
          level={3}
          info="A manager confirming a done-or-not target sees the tasks linked to it. Only people who may confirm see that list, not the person whose objective it is. A person writing a weekly line can add tasks they finished that week; only they see those suggestions. Nothing is filed, graded or scored. Closing a task as won't do, and accepting one, aren't affected by this switch."
        />
        <CardBody className="flex flex-col gap-4">
          {reading ? (
            <p className="text-body-sm text-muted">{LOADING}</p>
          ) : switchable ? (
            <>
              <Switch
                label="Show linked tasks next to Confirm, and suggest finished tasks for weekly lines"
                description="It never changes a score."
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

      {/* A Modal with its own footer rather than `ConfirmDialog`, which has no idea a request is out:
          Cancel is off and Escape does nothing while the save is, as in the won't-do dialog. */}
      <Modal
        open={asking}
        onClose={close}
        title="Switch on task suggestions?"
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
        <div className="flex flex-col gap-3 text-body-sm leading-relaxed text-body">
          <p>
            Managers see the tasks linked to a done-or-not target next to
            Confirm. The list never says a target is done; a manager still
            decides.
          </p>
          <p>
            People writing a weekly line can add the tasks they finished that
            week, then edit the text and send it themselves. Nothing is filed or
            graded for them, and task titles aren&apos;t saved. It needs
            Projects.
          </p>
        </div>
      </Modal>
    </>
  );
}
