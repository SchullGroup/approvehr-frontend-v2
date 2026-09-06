"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Checkbox,
  Field,
  Input,
  Modal,
  Radio,
  Textarea,
} from "@/components/ui";
import {
  DRAFT_EFFECT,
  type AnnouncementAudience,
  type ApiAnnouncement,
} from "@/lib/api/announcements";

/**
 * Writing a notice.
 *
 * ## The two buttons are the feature
 *
 * "Save as a draft" and "Publish" are separate, both on a new notice and on an
 * existing draft, because they are separate decisions with different audiences:
 * one reaches nobody, the other reaches everybody. A single Save with a
 * "published" switch would hide the moment the company started speaking inside a
 * field assignment, and somebody would flip it while tidying up.
 *
 * Editing a **live** notice has one button, because it is already published and
 * saving does not change that. Correcting the wrong date on the closure notice
 * everybody is reading is exactly what this form is for — unlike a policy, whose
 * wording is frozen once somebody has accepted it.
 *
 * ## The audience refusal is shown here as well as enforced there
 *
 * "Only some departments" with nothing ticked is refused by the API, and the
 * Publish button is disabled with the same sentence while somebody is still
 * choosing. Both, never one: a form that only checks locally is a form that
 * disagrees with the server the first time a department is archived, and a form
 * that only checks remotely makes somebody submit to find out.
 *
 * ## No rich text
 *
 * A plain `Textarea`. The API stores plain text and everything that renders a
 * notice renders it as paragraphs, so an editor offering bold would be offering
 * markup that comes out as literal asterisks. Blank lines make paragraphs and
 * that is the whole format.
 */

/** Matches the API's cap. Beyond this it is a policy, and there is a screen for that. */
const BODY_LIMIT = 4_000;
const TITLE_LIMIT = 140;

export type Draft = {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  departmentIds: string[];
  pinned: boolean;
  /** `YYYY-MM-DD`, or empty for no date. */
  expiresOn: string;
};

export function AnnouncementForm({
  notice,
  departments,
  onClose,
  onSave,
}: {
  /** Absent when writing a new one. */
  notice?: ApiAnnouncement;
  departments: { id: string; name: string }[];
  onClose: () => void;
  /** `publish` is what the pressed button asked for. */
  onSave: (draft: Draft, publish: boolean) => Promise<void>;
}) {
  const editing = notice !== undefined;
  const live = notice?.published === true;

  const [title, setTitle] = useState(notice?.title ?? "");
  const [body, setBody] = useState(notice?.body ?? "");
  const [audience, setAudience] = useState<AnnouncementAudience>(
    notice?.audience ?? "EVERYONE",
  );
  const [departmentIds, setDepartmentIds] = useState<string[]>(
    notice?.departmentIds ?? [],
  );
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [expiresOn, setExpiresOn] = useState(notice?.expiresOn ?? "");
  const [busy, setBusy] = useState(false);

  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();

  const titleError =
    trimmedTitle.length > 0 && trimmedTitle.length < 3
      ? "Give it a title of at least three characters."
      : title.length > TITLE_LIMIT
        ? "Shorten the title — it has to read on one line on the dashboard."
        : undefined;

  const bodyError =
    body.length > BODY_LIMIT
      ? "That is longer than a notice. If it is a policy or a handbook section, write it in Policies instead."
      : undefined;

  /* The API's own refusal, shown while somebody is still choosing rather than
     after they submit. `lib/api/performance.ts#weightProblem` is the same
     pattern: the server check stands, this is not instead of it. */
  const audienceProblem =
    audience === "DEPARTMENTS" && departmentIds.length === 0
      ? "Choose at least one department, or address it to everybody. A notice with no department reaches nobody and still looks published."
      : undefined;

  const complete =
    trimmedTitle.length >= 3 &&
    trimmedBody.length > 0 &&
    titleError === undefined &&
    bodyError === undefined &&
    audienceProblem === undefined;

  function toggleDepartment(id: string, on: boolean) {
    setDepartmentIds((current) =>
      on ? [...current, id] : current.filter((existing) => existing !== id),
    );
  }

  async function save(publish: boolean) {
    setBusy(true);
    try {
      await onSave(
        {
          title: trimmedTitle,
          body: trimmedBody,
          audience,
          departmentIds: audience === "DEPARTMENTS" ? departmentIds : [],
          pinned,
          expiresOn,
        },
        publish,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={editing ? `Edit “${notice.title}”` : "Write a notice"}
      description={
        live
          ? "This one is on the board. Saving changes what people are reading now."
          : "Everybody with an account sees it on their dashboard once you publish."
      }
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>

          {live ? (
            <Button
              variant="accent"
              disabled={!complete || busy}
              loading={busy}
              onClick={() => void save(false)}
            >
              Save changes
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={!complete || busy}
                onClick={() => void save(false)}
              >
                Save as a draft
              </Button>
              <Button
                variant="accent"
                disabled={!complete || busy}
                loading={busy}
                onClick={() => void save(true)}
              >
                Publish it
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <Field label="Title" required error={titleError}>
          <Input
            value={title}
            autoFocus={!editing}
            maxLength={TITLE_LIMIT + 20}
            placeholder="Payday moves to the 27th this month"
            onChange={(event) => {
              const next = event.target.value;
              setTitle(next);
            }}
          />
        </Field>

        <Field
          label="The notice"
          required
          error={bodyError}
          help={`Plain text. A blank line starts a new paragraph. ${
            BODY_LIMIT - body.length
          } characters left.`}
        >
          <Textarea
            value={body}
            rows={8}
            placeholder={
              "The 28th falls on a Sunday, so salaries go out on Friday the 27th.\n\nNothing else about the run changes."
            }
            onChange={(event) => {
              const next = event.target.value;
              setBody(next);
            }}
          />
        </Field>

        <fieldset className="flex flex-col gap-2.5">
          <legend className="text-body-sm font-medium text-ink">Who it is for</legend>
          <Radio
            name="announcement-audience"
            label="Everybody"
            description="Every account, including anybody without a staff record."
            checked={audience === "EVERYONE"}
            onChange={() => setAudience("EVERYONE")}
          />
          <Radio
            name="announcement-audience"
            label="Only some departments"
            description="Staff whose department is ticked below. Nobody else sees it."
            checked={audience === "DEPARTMENTS"}
            onChange={() => setAudience("DEPARTMENTS")}
          />
        </fieldset>

        {audience === "DEPARTMENTS" && (
          <div className="flex flex-col gap-2.5 rounded-lg border border-line p-3.5">
            {departments.length === 0 ? (
              <p className="text-body-sm text-muted">
                No departments on file yet, so there is nothing to address this to.
                Address it to everybody, or set up departments first.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {departments.map((department) => (
                  <Checkbox
                    key={department.id}
                    label={department.name}
                    checked={departmentIds.includes(department.id)}
                    onChange={(event) => {
                      const on = event.target.checked;
                      toggleDepartment(department.id, on);
                    }}
                  />
                ))}
              </div>
            )}

            {audienceProblem && (
              <p className="text-body-sm text-warning-text">{audienceProblem}</p>
            )}
          </div>
        )}

        <Field
          label="Take it down on"
          help="Optional, and inclusive: it stays up all of that day. Leave it empty and it stays until somebody takes it down."
        >
          <Input
            type="date"
            value={expiresOn}
            onChange={(event) => {
              const next = event.target.value;
              setExpiresOn(next);
            }}
          />
        </Field>

        <Checkbox
          label="Pin it to the top"
          description="Above newer notices, however long ago it went up. For the fire drill, not the canteen menu."
          checked={pinned}
          onChange={(event) => {
            const next = event.target.checked;
            setPinned(next);
          }}
        />

        {!editing && (
          <Callout tone="info" title="Saving a draft tells nobody">
            {DRAFT_EFFECT}
          </Callout>
        )}
      </div>
    </Modal>
  );
}
