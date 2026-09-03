"use client";

import { useState } from "react";
import {
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/components/ui";
import type { ApiKbArticleDetail, ApiKbCategoryFlat } from "@/lib/api/knowledge";

/**
 * Write an article, or fix one.
 *
 * ## Two buttons on a new article, one on an edit
 *
 * "Save as draft" and "Publish now" are both on the create dialog because both
 * are real intentions: an answer typed straight off the back of a question
 * should go live in one click, and half an answer should not. An edit saves;
 * publishing an existing draft is a control on the row, where the state is
 * visible.
 *
 * ## The link is only editable on an existing article
 *
 * A new article gets its link from its title, because asking somebody to invent
 * a URL segment before they can write a sentence is exactly the configuration
 * step this product exists to remove. On an existing article the field appears —
 * the link may need fixing — with the warning that it is already in somebody's
 * bookmarks. Renaming the title never touches it.
 *
 * ## No attachments
 *
 * The body is text. File upload is not wired anywhere in this product, so there
 * is no attach control here to fail — the field says so once and the working
 * path is to write the steps out.
 */
export function ArticleForm({
  open,
  article,
  sections,
  /** Prefills the title. Used by the backlog: a failed search becomes an article. */
  suggestedTitle,
  onClose,
  onCreate,
  onSave,
}: {
  open: boolean;
  /**
   * Null to write a new one.
   *
   * The **detail** shape, not a list row: a list row carries an excerpt, and
   * loading an editor with an excerpt in it would silently truncate the article
   * on the next save. The caller fetches the detail before opening this.
   */
  article: ApiKbArticleDetail | null;
  sections: ApiKbCategoryFlat[];
  suggestedTitle?: string;
  onClose: () => void;
  onCreate: (body: {
    title: string;
    body: string;
    categoryId?: string;
    publish: boolean;
  }) => Promise<void>;
  onSave: (
    id: string,
    body: { title: string; body: string; slug?: string; categoryId: string | null },
  ) => Promise<void>;
}) {
  const editing = article !== null;

  /* Keyed by the article being edited, so opening the dialog on a different row
     re-mounts these with the right values rather than needing a reset effect. */
  const [title, setTitle] = useState(article?.title ?? suggestedTitle ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [slug, setSlug] = useState(article?.slug ?? "");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? "");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const valid = title.trim().length >= 3 && body.trim().length > 0;

  const run = async (action: () => Promise<void>) => {
    setProblem(null);
    setSaving(true);
    try {
      await action();
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : "That did not save. Try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit article" : "Write an article"}
      description={
        editing
          ? undefined
          : "Answer one question, in the words the person asking would use."
      }
      footer={
        editing ? (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="accent"
              loading={saving}
              disabled={!valid}
              onClick={() =>
                void run(async () => {
                  await onSave(article.id, {
                    title: title.trim(),
                    body: body.trim(),
                    ...(slug.trim() && slug.trim() !== article.slug
                      ? { slug: slug.trim() }
                      : {}),
                    categoryId: categoryId === "" ? null : categoryId,
                  });
                })
              }
            >
              Save
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              loading={saving}
              disabled={!valid}
              onClick={() =>
                void run(async () => {
                  await onCreate({
                    title: title.trim(),
                    body: body.trim(),
                    ...(categoryId ? { categoryId } : {}),
                    publish: false,
                  });
                })
              }
            >
              Save as draft
            </Button>
            <Button
              variant="accent"
              loading={saving}
              disabled={!valid}
              onClick={() =>
                void run(async () => {
                  await onCreate({
                    title: title.trim(),
                    body: body.trim(),
                    ...(categoryId ? { categoryId } : {}),
                    publish: true,
                  });
                })
              }
            >
              Publish now
            </Button>
          </>
        )
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Title"
          required
          help="What somebody would type into the search box."
        >
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="How to read your payslip"
            maxLength={160}
          />
        </Field>

        <Field label="Section" help="Where it sits in the help centre.">
          <Select
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            <option value="">No section</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {"— ".repeat(section.depth)}
                {section.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="The answer"
          required
          help="Short paragraphs, plain words. Text only: you cannot attach a file here yet, so write the steps out."
        >
          <Textarea
            rows={12}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Your payslip has three parts…"
          />
        </Field>

        {editing && (
          <Field
            label="Link"
            help="People may already have shared this link. Changing it breaks theirs."
          >
            <Input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={article.slug}
            />
          </Field>
        )}

        {problem && (
          <p className="text-body-sm leading-relaxed text-danger-text">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
