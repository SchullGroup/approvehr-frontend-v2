"use client";

import { useState } from "react";
import {
  Badge,
  Disclosure,
  Field,
  Select,
  TextLink,
  useToast,
} from "@/components/ui";
import { PeopleEditor, type Person } from "@/components/hiring/people-editor";
import type {
  EmailCatalog,
  PanelMember,
  StageSetting,
} from "@/lib/hiring/comms/model";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { PipelineGateway } from "@/lib/hiring/pipeline/gateway";
import {
  STAGE_TYPE_LABEL,
  STAGE_TYPE_TONE,
  isTerminalType,
} from "@/lib/hiring/pipeline/stage-types";
import { usePanelPeople } from "@/lib/hiring/access/use-panel-people";
import { seatKey, splitSeats } from "@/lib/hiring/comms/seats";

/**
 * For each stage of a role: which email is sent to whoever is moved into it, and who
 * sits on an interview stage's panel.
 *
 * ## An email is attached to a stage, and sent by a person
 *
 * Choosing an email here sends nothing. It means that when somebody on your team
 * moves a candidate into the stage, they are asked whether to send it (and
 * can say no). The ends of the pipeline, Hired and Rejected, have none: nobody is
 * dragged into them.
 *
 * ## A panel is who sees the stage, not who decides
 *
 * People on an interview stage's panel can read the applications in that stage and
 * score the interviews they are invited to, from their own "My interviews" page, and
 * nothing else about the company's hiring. They see a name, the role and a CV, not
 * contact details, and they score blind: they never see a colleague's scorecard.
 */

export function StageComms({
  requisitionId,
  gateway,
  stages,
  catalog,
  canManage,
  onChanged,
}: {
  requisitionId: string;
  gateway: PipelineGateway;
  stages: readonly StageSetting[];
  catalog: EmailCatalog;
  canManage: boolean;
  onChanged: () => void;
}) {
  const toast = useToast();
  /* Staff, and the people invited to this job who have an account: a company
     without Core HR has no staff to choose from. */
  const directory = usePanelPeople(requisitionId, canManage);
  const [busy, setBusy] = useState<string | null>(null);

  const middle = stages.filter((stage) => !isTerminalType(stage.type));
  const sending = middle.filter((stage) => stage.emailTemplateId).length;
  const paneled = middle.filter(
    (stage) => stage.panel !== null && stage.panel.length > 0,
  ).length;

  async function run(
    key: string,
    what: () => Promise<unknown>,
    done: string,
  ): Promise<void> {
    setBusy(key);
    try {
      await what();
      onChanged();
      toast.push({ title: done, tone: "success" });
    } catch (error) {
      toast.push({
        title: "That did not work",
        tone: "danger",
        detail: sentenceOf(error),
      });
    } finally {
      setBusy(null);
    }
  }

  const live = catalog.templates.filter((template) => !template.archived);

  return (
    <Disclosure
      title="Stage emails and interview panels"
      meta={
        <span className="flex items-center gap-1.5">
          <Badge tone="neutral" size="sm">
            {sending === 1
              ? "1 stage sends an email"
              : `${String(sending)} stages send an email`}
          </Badge>
          <Badge tone="neutral" size="sm">
            {paneled === 1 ? "1 panel" : `${String(paneled)} panels`}
          </Badge>
        </span>
      }
      hint="Which stages send an email when somebody is moved in, and who is on the panel for interviews."
    >
      <div className="flex flex-col gap-4">
        <p className="text-body-sm text-muted">
          Choosing an email sends nothing. It means whoever moves a candidate
          into the stage is asked whether to send it. Write them in{" "}
          <TextLink href="/hiring/settings/emails">Hiring settings</TextLink>.
        </p>
        <ul className="flex flex-col gap-3">
          {middle.map((stage) => {
            const chosen = live.find((t) => t.id === stage.emailTemplateId);
            return (
              <li
                key={stage.stageId}
                className="flex flex-col gap-3 rounded-md border border-line p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-body-sm font-medium text-ink">
                    {stage.name}
                  </span>
                  {stage.type && (
                    <Badge tone={STAGE_TYPE_TONE[stage.type]} size="sm">
                      {STAGE_TYPE_LABEL[stage.type]}
                    </Badge>
                  )}
                </div>

                <Field
                  label={`Email when somebody is moved into ${stage.name}`}
                  className="max-w-md"
                >
                  <Select
                    value={chosen ? chosen.id : ""}
                    disabled={!canManage || busy !== null}
                    onChange={(event) => {
                      const next = event.target.value || null;
                      void run(
                        `email:${stage.stageId}`,
                        () =>
                          gateway.stages.setEmail(
                            requisitionId,
                            stage.stageId,
                            next,
                          ),
                        next
                          ? `${stage.name} will offer to send ${live.find((t) => t.id === next)?.name ?? "that email"}`
                          : `${stage.name} sends no email`,
                      );
                    }}
                  >
                    <option value="">No email</option>
                    {live.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.kindLabel.toLowerCase()})
                      </option>
                    ))}
                  </Select>
                </Field>

                {stage.panel !== null && (
                  <PanelEditor
                    stage={stage}
                    members={stage.panel}
                    people={directory.people}
                    loading={directory.loading}
                    disabled={!canManage || busy !== null}
                    onChange={(keys, done) =>
                      run(
                        `panel:${stage.stageId}`,
                        () =>
                          gateway.stages.setPanel(
                            requisitionId,
                            stage.stageId,
                            splitSeats(keys),
                          ),
                        done,
                      )
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Disclosure>
  );
}

function PanelEditor({
  stage,
  members,
  people,
  loading,
  disabled,
  onChange,
}: {
  stage: StageSetting;
  members: readonly PanelMember[];
  people: readonly Person[];
  loading: boolean;
  disabled: boolean;
  /** The seats, as `seatKey`s: staff and invited accounts together. */
  onChange: (seats: string[], done: string) => Promise<void>;
}) {
  const have = members.map(seatKey);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-body-sm font-medium text-ink">
        Panel for {stage.name}
      </p>
      <PeopleEditor
        label={`Panel for ${stage.name}`}
        empty="Nobody is on this panel. An interview booked here is scored by anybody who manages hiring."
        members={members.map((member) => ({
          id: seatKey(member),
          name: member.name,
        }))}
        people={people}
        loading={loading}
        disabled={disabled}
        addPlaceholder="Add somebody to the panel"
        onAdd={(person) =>
          void onChange(
            [...have, person.id],
            `${person.name} is on the ${stage.name} panel`,
          )
        }
        onRemove={(person) =>
          void onChange(
            have.filter((id) => id !== person.id),
            `${person.name} is off the ${stage.name} panel`,
          )
        }
      />
    </div>
  );
}
