"use client";

import { useState } from "react";
import { Star, Tags } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Tag,
  useToast,
} from "@/components/ui";
import { CandidateTagsDialog } from "@/components/hiring/candidate-tags-dialog";
import type { ApiApplicationDetail } from "@/lib/api/recruitment";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { BoardCard } from "@/lib/hiring/pipeline/model";
import {
  usePipelineGateway,
  useTags,
} from "@/lib/hiring/pipeline/use-pipeline";

/**
 * A person's tags and whether they are kept on file, on their own record.
 *
 * The same dialog the board opens from a card, so the two cannot disagree about
 * what a tag does: it belongs to the **person**, and follows them to every role.
 * Each change is made as it is ticked and the record is read again after it, so
 * what is shown is what the API now holds.
 */

/** The record as the card the dialog works on. */
export function cardFromDetail(application: ApiApplicationDetail): BoardCard {
  return {
    id: application.id,
    candidateId: application.candidate.id,
    name: application.candidateName,
    email: application.candidateEmail,
    reference: null,
    source: application.candidate.source,
    flagged: false,
    duplicate: false,
    tags: (application.candidate.tags ?? []).map((tag) => ({
      id: tag.id,
      name: tag.name,
      color: tag.color,
    })),
    talentPool: application.candidate.talentPool ?? false,
    stageId: application.stageId,
    stageName: application.stageName,
    stageEnteredAt: application.stageEnteredAt,
    outcome: application.outcome,
    rejectionReason: application.rejectionReason,
  };
}

export function RecordTags({
  application,
  canManage,
  onChanged,
}: {
  application: ApiApplicationDetail;
  canManage: boolean;
  onChanged: () => void;
}) {
  const gateway = usePipelineGateway();
  const tags = useTags();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const card = cardFromDetail(application);

  async function toggleTag(
    subject: BoardCard,
    tag: { id: string; name: string },
    on: boolean,
  ) {
    try {
      await gateway.setTag(subject, tag.id, on);
      onChanged();
    } catch (error) {
      toast.push({
        title: `${subject.name}'s tags were not changed`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  async function togglePool(subject: BoardCard, on: boolean) {
    try {
      await gateway.setTalentPool(subject, on);
      toast.push({
        title: on
          ? `${subject.name} is in the talent pool`
          : `${subject.name} is out of the talent pool`,
        tone: "success",
      });
      onChanged();
    } catch (error) {
      toast.push({
        title: `${subject.name} was not changed`,
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  async function createTag(subject: BoardCard, name: string) {
    try {
      const made = await gateway.tags.create(name);
      tags.reload();
      await toggleTag(subject, made, true);
    } catch (error) {
      toast.push({
        title: "The tag was not made",
        tone: "danger",
        detail: sentenceOf(error),
      });
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="Tags and talent pool"
          description="They belong to the person, so they stay on file for other roles too."
          action={
            canManage ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOpen(true)}
              >
                <Tags aria-hidden="true" className="size-3.5" />
                Edit
              </Button>
            ) : undefined
          }
        />
        <CardBody className="flex flex-col gap-3">
          {card.tags.length === 0 ? (
            <p className="text-body-sm text-muted">No tags yet.</p>
          ) : (
            <ul
              aria-label="Tags on this person"
              className="flex flex-wrap gap-1.5"
            >
              {card.tags.map((tag) => (
                <li key={tag.id}>
                  <Tag>{tag.name}</Tag>
                </li>
              ))}
            </ul>
          )}
          <p className="flex items-center gap-2 text-body-sm text-body">
            {card.talentPool ? (
              <>
                <Badge tone="info" size="sm" icon={<Star />}>
                  Talent pool
                </Badge>
                Kept on file for another role.
              </>
            ) : (
              "Not kept in the talent pool."
            )}
          </p>
        </CardBody>
      </Card>

      <CandidateTagsDialog
        open={open}
        onClose={() => setOpen(false)}
        card={card}
        tags={tags.items}
        onToggleTag={toggleTag}
        onTogglePool={togglePool}
        onCreateTag={createTag}
      />
    </>
  );
}
