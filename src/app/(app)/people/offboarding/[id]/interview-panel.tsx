"use client";

import { useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  DescriptionList,
  Field,
  Modal,
  Radio,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiExitInterview, InterviewBody } from "@/lib/api/offboarding";
import { shortDate } from "@/lib/today";

/**
 * The exit interview.
 *
 * ## Why "they would not say" is a real answer
 *
 * `wouldRecommend` stays empty unless somebody picks a number. Coercing a
 * refusal to a 3 quietly poisons every average built on it, and "declined to
 * answer" is a finding — often the most useful one in the file.
 *
 * Same reasoning behind the "They did not want an interview" option: a leaver
 * who says no is a recorded outcome, not a gap somebody forgot to fill.
 *
 * ## Not on the leaver's own screen
 *
 * `EDIT_RECORDS` both ways, read and write, and the panel is not rendered
 * without it. What somebody says on the way out is about their colleagues as
 * often as about the job, and it is not directory information.
 */
export function InterviewPanel({
  interview,
  employeeFirstName,
  closed,
  onSave,
}: {
  interview: ApiExitInterview | null;
  employeeFirstName: string;
  closed: boolean;
  onSave: (body: InterviewBody) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const recorded = interview?.recorded === true;
  const declined = interview?.declinedAt !== null && interview?.declinedAt !== undefined;

  return (
    <>
      <Card>
        <CardHeader
          title="Exit interview"
          level={3}
          action={
            closed && !recorded ? undefined : (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                {recorded ? "Edit" : "Record it"}
              </Button>
            )
          }
        />
        <CardBody>
          {!recorded ? (
            <p className="text-body-sm text-muted">Not recorded yet.</p>
          ) : declined ? (
            <p className="text-body-sm text-body">
              {employeeFirstName} did not want an interview.
            </p>
          ) : (
            <DescriptionList
              items={[
                {
                  term: "Why they really left",
                  value: interview.primaryReason ?? "Not said",
                },
                {
                  term: "Would recommend us",
                  value:
                    interview.wouldRecommend === null
                      ? "Would not say"
                      : `${interview.wouldRecommend} out of 5`,
                },
                {
                  term: "Would come back",
                  value:
                    interview.wouldReturn === null
                      ? "Would not say"
                      : interview.wouldReturn
                        ? "Yes"
                        : "No",
                },
                { term: "What worked", value: interview.whatWorked ?? "—" },
                { term: "What did not", value: interview.whatDidNot ?? "—" },
                ...(interview.notes ? [{ term: "Notes", value: interview.notes }] : []),
                {
                  term: "Recorded by",
                  value: `${interview.conductedByName ?? "—"}${
                    interview.conductedAt
                      ? ` · ${shortDate(interview.conductedAt.slice(0, 10))}`
                      : ""
                  }`,
                },
              ]}
            />
          )}
        </CardBody>
      </Card>

      {editing && (
        <InterviewDialog
          interview={interview}
          employeeFirstName={employeeFirstName}
          onClose={() => setEditing(false)}
          onSave={async (body) => {
            await onSave(body);
            setEditing(false);
          }}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------------- */

function InterviewDialog({
  interview,
  employeeFirstName,
  onClose,
  onSave,
}: {
  interview: ApiExitInterview | null;
  employeeFirstName: string;
  onClose: () => void;
  onSave: (body: InterviewBody) => Promise<void>;
}) {
  const toast = useToast();
  const [declined, setDeclined] = useState(
    interview?.declinedAt !== null && interview?.declinedAt !== undefined,
  );
  const [primaryReason, setPrimaryReason] = useState(interview?.primaryReason ?? "");
  const [wouldRecommend, setWouldRecommend] = useState(
    interview?.wouldRecommend === null || interview?.wouldRecommend === undefined
      ? ""
      : String(interview.wouldRecommend),
  );
  const [wouldReturn, setWouldReturn] = useState(
    interview?.wouldReturn === null || interview?.wouldReturn === undefined
      ? ""
      : interview.wouldReturn
        ? "yes"
        : "no",
  );
  const [whatWorked, setWhatWorked] = useState(interview?.whatWorked ?? "");
  const [whatDidNot, setWhatDidNot] = useState(interview?.whatDidNot ?? "");
  const [busy, setBusy] = useState(false);

  const anyAnswer =
    primaryReason.trim() !== "" ||
    wouldRecommend !== "" ||
    wouldReturn !== "" ||
    whatWorked.trim() !== "" ||
    whatDidNot.trim() !== "";
  const ready = declined || anyAnswer;

  async function submit() {
    setBusy(true);
    try {
      await onSave(
        declined
          ? { declined: true }
          : {
              ...(primaryReason.trim() ? { primaryReason: primaryReason.trim() } : {}),
              ...(wouldRecommend !== ""
                ? { wouldRecommend: Number(wouldRecommend) }
                : {}),
              ...(wouldReturn !== "" ? { wouldReturn: wouldReturn === "yes" } : {}),
              ...(whatWorked.trim() ? { whatWorked: whatWorked.trim() } : {}),
              ...(whatDidNot.trim() ? { whatDidNot: whatDidNot.trim() } : {}),
            },
      );
      toast.push({ title: "Saved", tone: "success" });
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
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Exit interview"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!ready || busy}
            onClick={() => void submit()}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2.5">
          <Radio
            name="exit-interview-held"
            checked={!declined}
            onChange={() => setDeclined(false)}
            label="We spoke to them"
          />
          <Radio
            name="exit-interview-held"
            checked={declined}
            onChange={() => setDeclined(true)}
            label={`${employeeFirstName} did not want an interview`}
          />
        </div>

        {!declined && (
          <>
            <Field
              label="Why they really left"
              help="Often not what the letter said."
            >
              <Textarea
                rows={2}
                value={primaryReason}
                maxLength={500}
                onChange={(e) => setPrimaryReason(e.target.value)}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Would they recommend working here">
                <Select
                  value={wouldRecommend}
                  onChange={(e) => setWouldRecommend(e.target.value)}
                >
                  <option value="">They would not say</option>
                  <option value="1">1 — definitely not</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                  <option value="5">5 — definitely</option>
                </Select>
              </Field>

              <Field label="Would they come back">
                <Select
                  value={wouldReturn}
                  onChange={(e) => setWouldReturn(e.target.value)}
                >
                  <option value="">They would not say</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            </div>

            <Field label="What worked">
              <Textarea
                rows={3}
                value={whatWorked}
                maxLength={2000}
                onChange={(e) => setWhatWorked(e.target.value)}
              />
            </Field>

            <Field label="What did not">
              <Textarea
                rows={3}
                value={whatDidNot}
                maxLength={2000}
                onChange={(e) => setWhatDidNot(e.target.value)}
              />
            </Field>
          </>
        )}
      </div>
    </Modal>
  );
}
