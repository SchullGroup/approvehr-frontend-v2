"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Checkbox,
  Field,
  IconButton,
  Input,
  Modal,
  Select,
} from "@/components/ui";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { PipelineTemplate } from "@/lib/hiring/pipeline/model";
import {
  canRequireScorecards,
  isTerminalType,
  STAGE_TYPE_HELP,
  STAGE_TYPE_LABEL,
  STAGE_TYPE_TONE,
  type StageType,
} from "@/lib/hiring/pipeline/stage-types";
import {
  firstProblem,
  freshStageName,
  insertionIndex,
  isValid,
  moveRefusal,
  moveStage,
  removalRefusal,
  typesStillAvailable,
  validateTemplate,
  withType,
  type TemplateStage,
} from "@/lib/hiring/pipeline/template-rules";

/**
 * Making or changing a pipeline template.
 *
 * ## What a template is, said once and plainly
 *
 * A role copies a template **when it is created**. Changing a template afterwards
 * never touches a role that is already open: people are partway through those, and
 * moving the stages under them is not something a settings page should be able to
 * do. The dialog says so at the top, because it is the first thing somebody editing
 * a template wonders.
 *
 * ## Buttons, not dragging
 *
 * Stages are reordered with up and down buttons that name the stage they move.
 * Dragging is faster for some people and impossible for others, and a settings
 * screen has no reason to need it.
 *
 * ## The rules are shown where they bite
 *
 * One Applied stage, first. An ending (Hired or Rejected), last. Each problem
 * appears under the stage that causes it, before Save, in the words the API would
 * use. The API still has the last word, and what it says is shown too.
 */

let local = 0;
const localId = (): string => {
  local += 1;
  return `new-x${String(local)}`;
};

/** Fixed ids: this runs while rendering, where a counter would not be pure. */
const BLANK_STAGES = (): TemplateStage[] => [
  { id: "new-a", name: "Applied", type: "APPLIED", requiresScorecards: false },
  {
    id: "new-b",
    name: "Interview",
    type: "INTERVIEW",
    requiresScorecards: true,
  },
  { id: "new-c", name: "Hired", type: "HIRED", requiresScorecards: false },
  {
    id: "new-d",
    name: "Rejected",
    type: "REJECTED",
    requiresScorecards: false,
  },
];

export function TemplateEditor({
  open,
  onClose,
  template,
  emailOptions = [],
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** The template being changed, or `null` for a new one. */
  template: PipelineTemplate | null;
  /**
   * The emails a stage can be set to send. Empty, or absent, and the stages offer
   * no choice about email: a server that sends none has nothing to choose from.
   */
  emailOptions?: readonly { id: string; label: string }[];
  /** Rejects with the API's sentence. */
  onSave: (draft: {
    id: string | null;
    name: string;
    stages: TemplateStage[];
  }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [stages, setStages] = useState<TemplateStage[]>([]);
  const [wasOpen, setWasOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  /* Each time it opens it starts from the template, or from a sensible blank.
     Derived while rendering rather than in an effect, so there is no frame that
     shows the last template's stages. */
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(template?.name ?? "");
      setStages(
        template ? template.stages.map((s) => ({ ...s })) : BLANK_STAGES(),
      );
      setRefused(null);
      setTried(false);
      setSaving(false);
    }
  }

  const problems = validateTemplate(name, stages);
  const ok = isValid(problems);

  const patch = (id: string, change: Partial<TemplateStage>) =>
    setStages((list) =>
      list.map((s) => (s.id === id ? { ...s, ...change } : s)),
    );

  const add = () =>
    setStages((list) => {
      const at = insertionIndex(list);
      const next = [...list];
      next.splice(at, 0, {
        id: localId(),
        name: freshStageName(list),
        type: "SCREENING",
        requiresScorecards: false,
      });
      return next;
    });

  async function save() {
    setTried(true);
    if (!ok) return;
    setSaving(true);
    setRefused(null);
    try {
      await onSave({ id: template?.id ?? null, name: name.trim(), stages });
    } catch (error) {
      setRefused(sentenceOf(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={template ? `Edit ${template.name}` : "New pipeline template"}
      description="Roles copy a template when they are created. Changing it later does not change roles that are already open."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            onClick={() => void save()}
            aria-describedby={tried && !ok ? "template-problem" : undefined}
          >
            Save template
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label="Template name"
          required
          {...(tried && problems.name ? { error: problems.name } : {})}
        >
          <Input
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Standard hiring"
          />
        </Field>

        <ol className="flex flex-col gap-3" aria-label="Stages, in order">
          {stages.map((stage, index) => {
            const stageProblem = problems.stages[stage.id];
            const stay = removalRefusal(stages, stage.id);
            const up = moveRefusal(stages, stage.id, -1);
            const down = moveRefusal(stages, stage.id, 1);
            const available = typesStillAvailable(stages, stage.id);
            return (
              <li
                key={stage.id}
                className="flex flex-col gap-2 rounded-md border border-line p-3"
              >
                <div className="flex flex-wrap items-end gap-2">
                  <span
                    aria-hidden="true"
                    className="tabular mb-2 w-5 text-meta text-faint"
                  >
                    {index + 1}
                  </span>
                  <Field
                    label="Stage name"
                    className="min-w-40 flex-1"
                    {...(tried && stageProblem ? { error: stageProblem } : {})}
                  >
                    <Input
                      value={stage.name}
                      maxLength={80}
                      aria-label={`Name of stage ${String(index + 1)}`}
                      onChange={(event) =>
                        patch(stage.id, { name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="What it is for" className="w-44">
                    <Select
                      value={stage.type}
                      aria-label={`What ${stage.name || `stage ${String(index + 1)}`} is for`}
                      onChange={(event) =>
                        setStages((list) =>
                          list.map((s) =>
                            s.id === stage.id
                              ? withType(s, event.target.value as StageType)
                              : s,
                          ),
                        )
                      }
                    >
                      {available.map((type) => (
                        <option key={type} value={type}>
                          {STAGE_TYPE_LABEL[type]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <span className="mb-1 flex items-center gap-1">
                    <IconButton
                      label={`Move ${stage.name || "this stage"} up`}
                      size="sm"
                      disabled={up !== null}
                      onClick={() =>
                        setStages((list) => moveStage(list, stage.id, -1))
                      }
                    >
                      <ArrowUp aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Move ${stage.name || "this stage"} down`}
                      size="sm"
                      disabled={down !== null}
                      onClick={() =>
                        setStages((list) => moveStage(list, stage.id, 1))
                      }
                    >
                      <ArrowDown aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${stage.name || "this stage"}`}
                      size="sm"
                      disabled={stay !== null}
                      onClick={() =>
                        setStages((list) =>
                          list.filter((s) => s.id !== stage.id),
                        )
                      }
                    >
                      <Trash2 aria-hidden="true" />
                    </IconButton>
                  </span>
                </div>

                <p className="flex flex-wrap items-center gap-2 pl-7 text-meta text-muted">
                  <Badge tone={STAGE_TYPE_TONE[stage.type]} size="sm">
                    {STAGE_TYPE_LABEL[stage.type]}
                  </Badge>
                  {STAGE_TYPE_HELP[stage.type]}
                </p>

                {emailOptions.length > 0 && !isTerminalType(stage.type) && (
                  <div className="pl-7">
                    <Field
                      label={`Email when somebody is moved into ${stage.name || "this stage"}`}
                      className="max-w-sm"
                      help="Choosing one sends nothing. Whoever moves a candidate here is asked whether to send it."
                    >
                      <Select
                        value={stage.emailTemplateId ?? ""}
                        onChange={(event) =>
                          patch(stage.id, {
                            emailTemplateId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">No email</option>
                        {emailOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}

                {canRequireScorecards(stage.type) && (
                  <div className="pl-7">
                    <Checkbox
                      label="Needs scorecards before anybody leaves"
                      description="Everyone who interviewed has to submit a scorecard first."
                      checked={stage.requiresScorecards}
                      onChange={(event) =>
                        patch(stage.id, {
                          requiresScorecards: event.target.checked,
                        })
                      }
                    />
                  </div>
                )}

                {stay && (
                  <p className="pl-7 text-meta text-muted">
                    Cannot be removed: {lowerFirst(stay)}
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <div>
          <Button variant="secondary" size="sm" onClick={add}>
            <Plus aria-hidden="true" className="size-3.5" />
            Add a stage
          </Button>
        </div>

        {tried && firstProblem(problems) && !ok && (
          <p
            id="template-problem"
            role="alert"
            className="text-body-sm text-danger-text"
          >
            {firstProblem(problems)}
          </p>
        )}

        {refused && (
          <Callout tone="danger" title="The server did not accept this">
            {refused}
          </Callout>
        )}
      </div>
    </Modal>
  );
}

const lowerFirst = (text: string): string =>
  text.charAt(0).toLowerCase() + text.slice(1);
