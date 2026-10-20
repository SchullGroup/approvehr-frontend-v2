"use client";

import { useState } from "react";
import { Button, Checkbox, Field, Input, Modal, Switch } from "@/components/ui";
import type { BoardCard, Tag } from "@/lib/hiring/pipeline/model";

/**
 * One person's tags, and whether to keep them on file for another role.
 *
 * ## It belongs to the person, and says so
 *
 * A tag or a place in the talent pool is a fact about the **person**, not about
 * this application: "strong, call again in March" should still be there when they
 * apply for something else. The dialog says that, because a recruiter who tags
 * somebody on one role and finds the tag on another has been surprised by it.
 *
 * Each change is made as it is ticked, with no Save: there is nothing to
 * half-finish, and the board behind it shows the result at once.
 *
 * Keeping somebody in the talent pool is a decision about their data, so it is a
 * deliberate switch with a sentence, not a side effect of tagging.
 */
export function CandidateTagsDialog({
  open,
  onClose,
  card,
  tags,
  onToggleTag,
  onTogglePool,
  onCreateTag,
}: {
  open: boolean;
  onClose: () => void;
  card: BoardCard | null;
  tags: readonly Tag[];
  onToggleTag: (card: BoardCard, tag: Tag, on: boolean) => Promise<void>;
  onTogglePool: (card: BoardCard, on: boolean) => Promise<void>;
  /** Makes the tag and puts it on this person. */
  onCreateTag: (card: BoardCard, name: string) => Promise<void>;
}) {
  /* The last person shown, so the dialog does not go blank while it closes. */
  const [shown, setShown] = useState<BoardCard | null>(card);
  if (card && card !== shown) setShown(card);
  const subject = card ?? shown;

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setName("");
  }

  async function add() {
    if (!subject || name.trim() === "") return;
    setBusy(true);
    try {
      await onCreateTag(subject, name.trim());
      setName("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={subject ? `Tags for ${subject.name}` : "Tags"}
      description="Tags and the talent pool belong to the person, so they stay on file for other roles too."
      footer={<Button onClick={onClose}>Done</Button>}
    >
      {subject && (
        <div className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-1 text-body-sm font-medium text-ink">
              Tags
            </legend>
            {tags.length === 0 && (
              <p className="text-body-sm text-muted">
                No tags yet. Add the first one below.
              </p>
            )}
            {tags.map((tag) => (
              <Checkbox
                key={tag.id}
                label={tag.name}
                checked={subject.tags.some((t) => t.id === tag.id)}
                onChange={(event) =>
                  void onToggleTag(subject, tag, event.target.checked)
                }
              />
            ))}
          </fieldset>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void add();
            }}
          >
            <Field label="New tag" className="flex-1">
              <Input
                value={name}
                maxLength={40}
                onChange={(event) => setName(event.target.value)}
                placeholder="Strong CV"
              />
            </Field>
            <Button
              type="submit"
              variant="secondary"
              loading={busy}
              disabled={name.trim() === ""}
            >
              Add and tag
            </Button>
          </form>

          <Switch
            label="Keep in the talent pool"
            description="They stay on file to be found again for another role. Only keep people the company has a reason to contact."
            checked={subject.talentPool}
            onChange={(event) =>
              void onTogglePool(subject, event.target.checked)
            }
          />
        </div>
      )}
    </Modal>
  );
}
