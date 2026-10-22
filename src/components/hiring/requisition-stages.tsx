"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Field,
  IconButton,
  Input,
  Select,
} from "@/components/ui";
import type { ApiStage } from "@/lib/api/recruitment";
import {
  canRequireScorecards,
  STAGE_TYPE_HELP,
  STAGE_TYPE_LABEL,
  STAGE_TYPE_TONE,
  type StageType,
} from "@/lib/hiring/pipeline/stage-types";
import {
  moveRefusal,
  removalRefusal,
  typesStillAvailable,
  type TemplateStage,
} from "@/lib/hiring/pipeline/template-rules";

/**
 * One role's own stages, with what each is for.
 *
 * A role copied its stages from a template when it was made and they are its own
 * from then on: changing the template does not change them, and changing them
 * does not change the template. This card is where they are changed.
 *
 * ## Whose rule is it
 *
 * The type-based rules — one Applied stage, first; an ending last; the last way to
 * end not removable — are checked here so the button is not offered for a change
 * that cannot work, and each says why. Anything that depends on **who is in a
 * stage** (an occupied stage cannot be removed) is the API's to say, and is shown
 * as the API wrote it.
 */

/** A role's stage as the rules module reads it. A stage with no type is a middle one. */
const asRule = (stage: ApiStage): TemplateStage => ({
  id: stage.id,
  name: stage.name,
  type: stage.type ?? "SCREENING",
  requiresScorecards: stage.requiresScorecards,
});

export type StageBody = {
  name?: string;
  type?: StageType;
  requiresScorecards?: boolean;
};

export function RequisitionStages({
  stages,
  canManage,
  busy,
  onAdd,
  onUpdate,
  onMove,
  onRemove,
}: {
  stages: readonly (ApiStage & { currentCount: number })[];
  canManage: boolean;
  busy: boolean;
  onAdd: (body: {
    name: string;
    type: StageType;
    requiresScorecards: boolean;
  }) => Promise<boolean>;
  onUpdate: (stage: ApiStage, body: StageBody) => Promise<boolean>;
  onMove: (stageId: string, delta: -1 | 1) => Promise<void>;
  onRemove: (stage: ApiStage) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<StageType>("SCREENING");
  const [scored, setScored] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    type: StageType;
    scored: boolean;
  }>({ name: "", type: "SCREENING", scored: false });

  const ordered = [...stages].sort((a, b) => a.order - b.order);
  const rules = ordered.map(asRule);
  const typed = ordered.some((stage) => stage.type !== undefined);

  async function add() {
    if (!name.trim()) return;
    const ok = await onAdd({
      name: name.trim(),
      type,
      requiresScorecards: canRequireScorecards(type) && scored,
    });
    if (ok) {
      setName("");
      setType("SCREENING");
      setScored(false);
      setAdding(false);
    }
  }

  async function save(stage: ApiStage) {
    const body: StageBody = {};
    const next = draft.name.trim();
    if (next.length === 0) {
      setEditing(null);
      return;
    }
    if (next !== stage.name) body.name = next;
    if (typed && draft.type !== (stage.type ?? "SCREENING"))
      body.type = draft.type;
    const wants = canRequireScorecards(draft.type) && draft.scored;
    if (wants !== stage.requiresScorecards) body.requiresScorecards = wants;
    if (Object.keys(body).length === 0) {
      setEditing(null);
      return;
    }
    const ok = await onUpdate(stage, body);
    if (ok) setEditing(null);
  }

  return (
    <Card>
      <CardHeader
        title="Pipeline stages"
        description="These are this role's own. Changing the company's templates does not change them."
        action={
          canManage ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus aria-hidden="true" className="size-3.5" />
              Add stage
            </Button>
          ) : undefined
        }
      />
      {adding && canManage && (
        <CardBody className="flex flex-wrap items-end gap-3 border-b border-line">
          <Field label="Stage name" className="min-w-48 flex-1">
            <Input
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="Technical interview"
            />
          </Field>
          {typed && (
            <Field label="What it is for" className="w-44">
              <Select
                value={type}
                onChange={(e) => setType(e.currentTarget.value as StageType)}
              >
                {typesStillAvailable(rules)
                  .filter((t) => t !== "HIRED" && t !== "REJECTED")
                  .map((t) => (
                    <option key={t} value={t}>
                      {STAGE_TYPE_LABEL[t]}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {canRequireScorecards(type) && (
            <Checkbox
              label="Requires scorecards to leave"
              checked={scored}
              onChange={(e) => setScored(e.currentTarget.checked)}
            />
          )}
          <Button
            variant="accent"
            size="sm"
            loading={busy}
            disabled={!name.trim()}
            onClick={() => void add()}
          >
            Add
          </Button>
        </CardBody>
      )}
      <CardBody>
        <ul className="flex flex-col gap-2">
          {ordered.map((s, index) => {
            const stay = removalRefusal(rules, s.id);
            const up = moveRefusal(rules, s.id, -1);
            const down = moveRefusal(rules, s.id, 1);
            const available = typesStillAvailable(rules, s.id);
            return (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2.5"
              >
                {editing === s.id ? (
                  <div className="flex w-full flex-col gap-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <Field label="Stage name" className="min-w-48 flex-1">
                        <Input
                          value={draft.name}
                          onChange={(e) =>
                            setDraft({ ...draft, name: e.currentTarget.value })
                          }
                          aria-label={`Rename ${s.name}`}
                        />
                      </Field>
                      {typed && (
                        <Field label="What it is for" className="w-44">
                          <Select
                            value={draft.type}
                            aria-label={`What ${s.name} is for`}
                            onChange={(e) => {
                              const next = e.currentTarget.value as StageType;
                              setDraft({
                                ...draft,
                                type: next,
                                scored: canRequireScorecards(next)
                                  ? draft.scored
                                  : false,
                              });
                            }}
                          >
                            {available.map((t) => (
                              <option key={t} value={t}>
                                {STAGE_TYPE_LABEL[t]}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      )}
                    </div>
                    {canRequireScorecards(draft.type) && (
                      <Checkbox
                        label="Requires scorecards to leave"
                        checked={draft.scored}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            scored: e.currentTarget.checked,
                          })
                        }
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={busy}
                        disabled={draft.name.trim().length === 0}
                        onClick={() => void save(s)}
                      >
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="flex min-w-48 flex-1 flex-wrap items-center gap-2">
                      <span className="text-body-sm font-medium text-ink">
                        {s.name}
                      </span>
                      {s.type && (
                        <Badge
                          tone={STAGE_TYPE_TONE[s.type]}
                          size="sm"
                          title={STAGE_TYPE_HELP[s.type]}
                        >
                          {STAGE_TYPE_LABEL[s.type]}
                        </Badge>
                      )}
                      {s.requiresScorecards && (
                        <Badge tone="neutral" size="sm">
                          Needs scorecards to leave
                        </Badge>
                      )}
                      {/* Informational only — the count an "occupied stage"
                          refusal would name. Never used to disable Remove here;
                          the server decides that. */}
                      {s.currentCount > 0 && (
                        <Badge tone="neutral" size="sm">
                          {s.currentCount === 1
                            ? "1 person here"
                            : `${String(s.currentCount)} people here`}
                        </Badge>
                      )}
                    </span>
                    {canManage && (
                      <span className="flex shrink-0 items-center gap-1">
                        <IconButton
                          label={`Move ${s.name} up`}
                          size="sm"
                          disabled={busy || index === 0 || up !== null}
                          title={up ?? `Move ${s.name} up`}
                          onClick={() => void onMove(s.id, -1)}
                        >
                          <ArrowUp aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Move ${s.name} down`}
                          size="sm"
                          disabled={
                            busy ||
                            index === ordered.length - 1 ||
                            down !== null
                          }
                          title={down ?? `Move ${s.name} down`}
                          onClick={() => void onMove(s.id, 1)}
                        >
                          <ArrowDown aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Edit ${s.name}`}
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            setEditing(s.id);
                            setDraft({
                              name: s.name,
                              type: s.type ?? "SCREENING",
                              scored: s.requiresScorecards,
                            });
                          }}
                        >
                          <Pencil aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          label={`Remove ${s.name}`}
                          size="sm"
                          disabled={busy || stay !== null}
                          title={stay ?? `Remove ${s.name}`}
                          onClick={() => void onRemove(s)}
                        >
                          <Trash2 aria-hidden="true" />
                        </IconButton>
                      </span>
                    )}
                    {canManage && stay && s.type && (
                      <p className="w-full text-meta text-muted">
                        Cannot be removed: {stay.charAt(0).toLowerCase()}
                        {stay.slice(1)}
                      </p>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  );
}
