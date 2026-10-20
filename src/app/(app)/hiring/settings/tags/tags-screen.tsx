"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Skeleton,
  Tag,
  useToast,
} from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { sentenceOf } from "@/lib/hiring/pipeline/errors";
import type { Tag as TagRecord } from "@/lib/hiring/pipeline/model";
import {
  usePipelineGateway,
  useTags,
} from "@/lib/hiring/pipeline/use-pipeline";
import { HiringSettingsShell } from "../settings-shell";

/**
 * The tags a company puts on candidates.
 *
 * A tag belongs to the **person**, not to one application, so it is still there
 * when they apply for something else. Deleting one takes it off everybody who has
 * it, and the dialog says how many that is before it happens.
 */

export function TagsScreen() {
  const gateway = usePipelineGateway();
  const tags = useTags();
  const toast = useToast();
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [removing, setRemoving] = useState<TagRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function run(what: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setProblem(null);
    try {
      await what();
      tags.reload();
      if (done) toast.push({ title: done, tone: "success" });
      return true;
    } catch (error) {
      setProblem(sentenceOf(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <HiringSettingsShell
      active="/hiring/settings/tags"
      title="Tags"
      description="Labels for candidates: a strong CV, somebody to call back. A tag stays with the person, so it is still there when they apply for something else."
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() === "") return;
          void run(
            () => gateway.tags.create(name.trim()),
            `"${name.trim()}" added`,
          ).then((ok) => {
            if (ok) setName("");
          });
        }}
      >
        <Field label="New tag" className="min-w-64 flex-1">
          <Input
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            placeholder="Strong CV"
          />
        </Field>
        <Button
          type="submit"
          variant="accent"
          loading={busy && name !== ""}
          disabled={name.trim() === ""}
        >
          Add tag
        </Button>
      </form>

      {problem && (
        <p role="alert" className="text-body-sm text-danger-text">
          {problem}
        </p>
      )}

      {tags.loading ? (
        <>
          <Skeleton className="h-28 w-full" />
          <span className="sr-only-focusable">Loading the tags</span>
        </>
      ) : tags.error ? (
        <LoadFailure
          subject="the tags"
          error={tags.error}
          onRetry={tags.reload}
        />
      ) : tags.items.length === 0 ? (
        <Card>
          <EmptyState
            title="No tags yet"
            description="Add the first one above, then put it on people from the board."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-line">
            {tags.items.map((tag) => (
              <li
                key={tag.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                {renaming === tag.id ? (
                  <form
                    className="flex min-w-64 flex-1 flex-wrap items-center gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void run(
                        () => gateway.tags.rename(tag.id, draft.trim()),
                        "Tag renamed",
                      ).then((ok) => {
                        if (ok) setRenaming(null);
                      });
                    }}
                  >
                    <Input
                      value={draft}
                      maxLength={40}
                      aria-label={`Rename ${tag.name}`}
                      className="min-w-48 flex-1"
                      onChange={(event) => setDraft(event.target.value)}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="secondary"
                      disabled={draft.trim() === "" || busy}
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setRenaming(null)}
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      <Tag>{tag.name}</Tag>
                      {tag.uses !== undefined && (
                        <span className="ml-2 text-meta text-muted">
                          On {tag.uses} {tag.uses === 1 ? "person" : "people"}
                        </span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Rename ${tag.name}`}
                      onClick={() => {
                        setRenaming(tag.id);
                        setDraft(tag.name);
                      }}
                    >
                      <Pencil aria-hidden="true" className="size-3.5" />
                      Rename
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Delete ${tag.name}`}
                      onClick={() => setRemoving(tag)}
                    >
                      <Trash2 aria-hidden="true" className="size-3.5" />
                      Delete
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={removing ? `Delete "${removing.name}"?` : "Delete tag?"}
        body={
          removing?.uses
            ? `It comes off ${String(removing.uses)} ${removing.uses === 1 ? "person" : "people"}. Nobody is rejected, moved or changed in any other way.`
            : "Nobody has it, so nobody is affected."
        }
        confirmLabel="Delete tag"
        loading={busy}
        onConfirm={() => {
          if (!removing) return;
          void run(
            () => gateway.tags.remove(removing.id),
            `"${removing.name}" deleted`,
          ).then((ok) => {
            if (ok) setRemoving(null);
          });
        }}
      />
    </HiringSettingsShell>
  );
}
