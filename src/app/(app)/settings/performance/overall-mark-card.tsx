"use client";

import { Card, CardBody, CardHeader, Switch, useToast } from "@/components/ui";
import { useFeatureSettings } from "@/lib/store/features";

/**
 * Whether an appraisal form ends with an overall mark.
 *
 * ## What the switch decides, and what it does not
 *
 * It decides what a form **offers**. On, the answer flow has a page that asks
 * for one overall mark, in the company's own words from the tab this card sits
 * on. Off, the page is not there and the form is its answers. The API still
 * accepts a mark either way, so a form opened before the switch moved is not
 * refused, and **a mark already given is never hidden or changed**.
 *
 * It is read once, when a form opens. A form already open keeps what it was.
 *
 * ## Why it sits beside the names of the marks
 *
 * The names are what the page offers, so the switch and the names are one
 * question: is there an overall mark, and what is it called. Weights are the
 * other tab because they answer a different one, how a score is assembled.
 *
 * ## What it says about Self-assessment: nothing
 *
 * A manager's overall mark is shown beside the score and is **not counted in
 * it**. Self-assessment is read from the mark somebody gave themselves when
 * there is one, and from how they answered when there is not, so the switch does
 * not decide whether that part has something to count. This card used to warn
 * that a weighted Self-assessment had "nothing to count" while the switch was
 * off, which stopped being true when the part began to read the answers, and a
 * warning about something that no longer happens is worse than none. What the
 * part is read from is the weights tab's to say, once, in the API's words.
 *
 * ## Three states that are not "off"
 *
 * `overallMark` is `null` when the server has not said: an API one deploy
 * behind, or no server at all. That is not a company's answer, so no switch is
 * offered for it. Showing "off" would be a claim about a setting that does not
 * exist there.
 */
export function OverallMarkCard({
  connected,
  onChanged,
}: {
  /** False offline: there is no server holding a company's setting. */
  connected: boolean;
  /** Called after a save, so the weights page re-reads what the API says. */
  onChanged: () => void;
}) {
  const features = useFeatureSettings();
  const toast = useToast();
  const on = features.overallMark;
  const reading = features.loading && on === null;
  const failed = !features.loading && features.error != null;
  const switchable = connected && on !== null;

  async function set(next: boolean) {
    try {
      await features.setOverallMark(next);
      toast.push({
        tone: "success",
        title: next
          ? "Appraisal forms will end with an overall mark"
          : "Appraisal forms will not ask for an overall mark",
        detail:
          "It applies to the next form anybody opens. Marks already given are not touched.",
      });
      onChanged();
    } catch (error) {
      toast.push({
        tone: "danger",
        title: "That was refused",
        ...(error instanceof Error ? { detail: error.message } : {}),
      });
    }
  }

  return (
    <Card>
      <CardHeader
        title="Overall mark on appraisals"
        level={3}
        description={
          on === true
            ? "Each form ends with a page asking for one overall mark."
            : on === false
              ? "Forms do not ask for an overall mark. The answers stand on their own."
              : "Whether each form ends with a page asking for one overall mark."
        }
      />
      <CardBody className="flex flex-col gap-4">
        {reading ? (
          <p className="text-body-sm text-muted">Reading the setting</p>
        ) : switchable ? (
          <>
            <Switch
              label="Ask for an overall mark at the end of an appraisal"
              description="The person picks one of the names below after the questions. It is optional. A manager's overall mark is shown beside the score and is not counted in it."
              checked={on}
              disabled={!features.editable || features.saving === "overallMark"}
              onChange={(event) => void set(event.target.checked)}
            />
            <p className="text-body-sm text-muted">
              It applies to the next form anybody opens. A mark already given is
              never removed or changed.
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
              ? "This server has not been updated to offer this setting yet, so there is nothing to switch. Forms do not ask for an overall mark until it is."
              : "Whether forms ask for an overall mark is a company setting kept on the server, so there is nothing to switch here."}
          </p>
        )}
      </CardBody>
    </Card>
  );
}
