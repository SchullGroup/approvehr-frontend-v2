"use client";

import { useState } from "react";
import {
  Button,
  Callout,
  Field,
  Modal,
  Select,
  TextLink,
  type AppliedFilter,
} from "@/components/ui";
import type { BoardColumn, Tag } from "@/lib/hiring/pipeline/model";

/**
 * The small questions a bulk action asks before it runs.
 *
 * Each states the number and says who it is for, in the button as well as the
 * title: "Move 42 people", never a bare "Confirm". The reject dialog is shared
 * with the single-card path and lives in `reject-dialog.tsx`.
 */

const people = (count: number): string =>
  `${count.toLocaleString("en-NG")} ${count === 1 ? "person" : "people"}`;

/* ---------------------------------------------------------------- everyone */

/** Asking to take everyone a filter matches, with the exact number. */
export function EveryoneDialog({
  open,
  onClose,
  onConfirm,
  count,
  where,
  applied,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  /** "in Interview", "on this role". */
  where: string;
  applied: readonly AppliedFilter[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Select all ${count.toLocaleString("en-NG")} matching these filters?`}
      description={`That is ${people(count)} ${where}, not just the ones you can see.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            Select all {count.toLocaleString("en-NG")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-body-sm text-body">
        {applied.length === 0 ? (
          <p>No filters are applied, so this is everyone {where}.</p>
        ) : (
          <>
            <p>The filters are:</p>
            <ul className="list-disc pl-5">
              {applied.map((chip) => (
                <li key={`${chip.label}-${chip.value}`}>
                  {chip.label}: {chip.value}
                </li>
              ))}
            </ul>
          </>
        )}
        <p>
          If the list changes before you act, nothing is done and you are told.
        </p>
      </div>
    </Modal>
  );
}

/* -------------------------------------------------------------------- move */

export function BulkMoveDialog({
  open,
  onClose,
  onConfirm,
  count,
  targets,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (stageId: string, name: string) => void;
  count: number;
  /** The stages people can be moved into. */
  targets: readonly BoardColumn[];
}) {
  const [stageId, setStageId] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setStageId("");
  }
  const chosen = targets.find((target) => target.stageId === stageId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Move ${people(count)}`}
      description="Anybody who cannot be moved is listed afterwards, with the reason."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!chosen}
            onClick={() => chosen && onConfirm(stageId, chosen.label)}
          >
            Move {people(count)}
          </Button>
        </>
      }
    >
      <Field label="Move to" required>
        <Select
          value={stageId}
          onChange={(event) => setStageId(event.target.value)}
        >
          <option value="">Choose a stage</option>
          {targets.map((target) => (
            <option key={target.key} value={target.stageId ?? ""}>
              {target.label}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}

/* --------------------------------------------------------------------- tag */

export function BulkTagDialog({
  open,
  onClose,
  onConfirm,
  count,
  tags,
  mode,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (tag: Tag) => void;
  count: number;
  tags: readonly Tag[];
  mode: "tag" | "untag";
}) {
  const [tagId, setTagId] = useState("");
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setTagId("");
  }
  const chosen = tags.find((tag) => tag.id === tagId);
  const adding = mode === "tag";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`${adding ? "Add a tag to" : "Remove a tag from"} ${people(count)}`}
      description={
        adding
          ? "Tags belong to the person, so they stay on file for other roles."
          : "Anybody who does not carry the tag is left as they are."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!chosen}
            onClick={() => chosen && onConfirm(chosen)}
          >
            {adding ? "Add" : "Remove"} the tag for {people(count)}
          </Button>
        </>
      }
    >
      {tags.length === 0 ? (
        <Callout tone="info" title="There are no tags yet">
          Make some in{" "}
          <TextLink href="/hiring/settings/tags">Hiring settings</TextLink>,
          then come back.
        </Callout>
      ) : (
        <Field label="Tag" required>
          <Select
            value={tagId}
            onChange={(event) => setTagId(event.target.value)}
          >
            <option value="">Choose a tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------ talent pool */

export function BulkPoolDialog({
  open,
  onClose,
  onConfirm,
  count,
  on,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  count: number;
  on: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        on
          ? `Keep ${people(count)} in the talent pool?`
          : `Take ${people(count)} out of the talent pool?`
      }
      description={
        on
          ? "They stay on file to be found again for another role. Their application here is not changed."
          : "They are no longer kept for other roles. Their application here is not changed."
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm}>
            {on ? "Keep" : "Take out"} {people(count)}
          </Button>
        </>
      }
    >
      <p className="text-body-sm text-body">
        Keeping somebody on file is a decision about their data. Only keep
        people the company has a reason to contact again.
      </p>
    </Modal>
  );
}
