"use client";

import { useState } from "react";
import { FolderOpen, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui";
import type { ApiKbCategory, ApiKbCategoryFlat } from "@/lib/api/knowledge";
import type { useKbCategories } from "@/lib/store/knowledge";

type Sections = ReturnType<typeof useKbCategories>;

/**
 * The sections of the help centre.
 *
 * Deliberately plain: a list, a name, a count, and two controls. The tree can
 * nest — a company that wants Payroll → Pension is not blocked — but nothing
 * here encourages it, because a help centre with four sections is easier to
 * read than one with forty.
 *
 * Deleting refuses on the API while anything is filed inside, and the refusal
 * *names* the articles. That message is worth more than any confirmation copy
 * this screen could write, so it is shown verbatim.
 */
export function SectionsPanel({
  sections,
  onProblem,
  onDone,
}: {
  sections: Sections;
  /** Reports an API refusal upward, so one toast handler covers the screen. */
  onProblem: (message: string) => void;
  onDone: (message: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<ApiKbCategoryFlat | null>(null);
  const [deleting, setDeleting] = useState<ApiKbCategoryFlat | null>(null);

  const run = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      onDone(success);
      return true;
    } catch (error) {
      onProblem(
        error instanceof Error
          ? error.message
          : "That did not work. Try again.",
      );
      return false;
    }
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Sections"
          description="How the help centre is grouped."
          action={
            sections.editable ? (
              <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" className="size-4" />
                Add section
              </Button>
            ) : undefined
          }
        />

        {sections.tree.length === 0 ? (
          <EmptyState
            compact
            icon={<FolderOpen aria-hidden="true" />}
            title={sections.loading ? "Loading…" : "No sections yet"}
            description={
              sections.loading
                ? undefined
                : "Articles work without one, but people browse by section."
            }
            action={
              sections.editable && !sections.loading ? (
                <Button variant="accent" size="sm" onClick={() => setAdding(true)}>
                  Add the first section
                </Button>
              ) : undefined
            }
          />
        ) : (
          <CardBody className="flex flex-col gap-1.5">
            {flatten(sections.tree).map((section) => (
              <div
                key={section.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line p-2.5"
                style={section.depth > 0 ? { marginLeft: section.depth * 18 } : undefined}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md",
                    "bg-sunken text-muted [&>svg]:size-3.5",
                  )}
                >
                  <FolderOpen aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-sm font-medium text-ink">
                    {section.name}
                  </span>
                  <span className="block text-meta text-muted">
                    /{section.slug}
                  </span>
                </span>
                <span className="tabular shrink-0 text-body-sm text-muted">
                  {section.articles === 1 ? "1 article" : `${section.articles} articles`}
                </span>
                {sections.editable && (
                  <span className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRenaming(section)}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Delete ${section.name}`}
                      onClick={() => setDeleting(section)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                    </Button>
                  </span>
                )}
              </div>
            ))}
          </CardBody>
        )}
      </Card>

      {adding && (
        <SectionDialog
          title="Add a section"
          options={sections.flat}
          onClose={() => setAdding(false)}
          onSubmit={async (name, parentId) => {
            const ok = await run(
              () =>
                sections.create({
                  name,
                  ...(parentId ? { parentId } : {}),
                }),
              `${name} added`,
            );
            if (ok) setAdding(false);
          }}
        />
      )}

      {renaming && (
        <SectionDialog
          title={`Rename ${renaming.name}`}
          initialName={renaming.name}
          initialParentId={renaming.parentId ?? ""}
          options={sections.flat.filter((option) => option.id !== renaming.id)}
          onClose={() => setRenaming(null)}
          onSubmit={async (name, parentId) => {
            const ok = await run(
              () =>
                sections.update(renaming.id, {
                  name,
                  parentId: parentId === "" ? null : parentId,
                }),
              "Saved",
            );
            if (ok) setRenaming(null);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting?.name ?? ""}?`}
        confirmLabel="Delete section"
        tone="danger"
        body="It has to be empty first — move the articles somewhere else and this will go. The articles themselves are never deleted."
        onConfirm={async () => {
          if (!deleting) return;
          const ok = await run(
            () => sections.remove(deleting.id),
            `${deleting.name} deleted`,
          );
          if (ok) setDeleting(null);
        }}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */

/** Depth-first, so the rendered order matches the indent. */
function flatten(nodes: ApiKbCategory[]): ApiKbCategoryFlat[] {
  const out: ApiKbCategoryFlat[] = [];
  const walk = (list: ApiKbCategory[]) => {
    for (const node of list) {
      const { children, ...rest } = node;
      out.push(rest);
      walk(children);
    }
  };
  walk(nodes);
  return out;
}

function SectionDialog({
  title,
  initialName = "",
  initialParentId = "",
  options,
  onClose,
  onSubmit,
}: {
  title: string;
  initialName?: string;
  initialParentId?: string;
  options: ApiKbCategoryFlat[];
  onClose: () => void;
  onSubmit: (name: string, parentId: string) => Promise<void>;
}) {
  const [name, setName] = useState(initialName);
  const [parentId, setParentId] = useState(initialParentId);
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="accent"
            loading={saving}
            disabled={name.trim().length < 2}
            onClick={() => {
              setSaving(true);
              void onSubmit(name.trim(), parentId).finally(() => setSaving(false));
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" required help="What staff will see in the sidebar.">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Getting paid"
            maxLength={80}
          />
        </Field>
        <Field label="Inside" help="Leave this alone for a top-level section.">
          <Select
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            <option value="">Top level</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {"— ".repeat(option.depth)}
                {option.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
