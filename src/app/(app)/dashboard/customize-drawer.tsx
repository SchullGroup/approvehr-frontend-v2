"use client";

import { useMemo, useState } from "react";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  Drawer,
  DrawerSection,
  Sortable,
  SortableHandle,
} from "@/components/ui";
import {
  GROUP_LABELS,
  SPAN_CLASS,
  WIDGET_GROUPS,
  availableWidgets,
  type WidgetContext,
  type WidgetSpec,
} from "./catalogue";

/**
 * Where somebody decides what their dashboard is.
 *
 * ## Two lists, and the order of them is the argument
 *
 * **On your dashboard** comes first and is the one that reorders: it is the
 * thing being edited, and the arrangement is most of what people came here to
 * change. **Everything you can add** comes second, grouped by subject, because
 * it is a catalogue somebody browses rather than a list they arrange.
 *
 * A single list with checkboxes was the cheaper build and is worse: it makes
 * "what am I looking at" and "what could I look at" the same question, so the
 * eight cards on somebody's dashboard are scattered through twenty-two rows and
 * the order — the whole point of dragging — is invisible.
 *
 * ## Every change saves immediately
 *
 * There is no Save button and no draft. Adding, removing and reordering each
 * write on the spot, optimistically, and the dashboard behind the drawer moves
 * as they do — which is what makes this direct manipulation rather than a form
 * about a dashboard. A Save button here would mean a person can arrange
 * everything, close the drawer and lose it, and the failure is silent.
 *
 * The one thing that does not save on the spot is **Reset**, which asks first:
 * it throws away an arrangement somebody built, and that is the one act here
 * with anything to lose.
 *
 * ## What is not offered
 *
 * **No resizing.** Each widget declares its own span in the catalogue, because
 * the span is a property of the content — a four-figure stat is a quarter and a
 * twelve-month chart is a half, and a chart squeezed into a quarter is a chart
 * nobody can read. Offering a resize handle would let somebody build a
 * dashboard the data cannot fill, and then the product looks broken rather than
 * the choice looking wrong.
 *
 * **No columns.** One reorderable flow, laid out by span, which is what keeps
 * the same arrangement legible on a phone. A free canvas would need a mobile
 * story of its own, and this product is used on mid-range Android far more than
 * on a wide monitor.
 */
export function CustomizeDrawer({
  open,
  onClose,
  /** In order. The screen's resolved arrangement, not the raw stored ids. */
  chosen,
  context,
  connected,
  saving,
  error,
  onChange,
  onReset,
}: {
  open: boolean;
  onClose: () => void;
  chosen: readonly WidgetSpec[];
  context: WidgetContext;
  /** False offline: the drawer says the arrangement is this browser's only. */
  connected: boolean;
  saving: boolean;
  error: string | null;
  /** The whole arrangement, every time. Order is the value. */
  onChange: (ids: string[]) => void;
  onReset: () => void;
}) {
  const [confirmingReset, setConfirmingReset] = useState(false);

  const available = useMemo(() => availableWidgets(context), [context]);
  const on = useMemo(
    () => new Set(chosen.map((widget) => widget.id)),
    [chosen],
  );

  /* What is left, by group, in catalogue order. A group with nothing left in it
     is not drawn — an empty heading reading "Pay and money" under a dashboard
     that already has all of it is furniture. */
  const remaining = useMemo(
    () =>
      WIDGET_GROUPS.map((group) => ({
        group,
        widgets: available.filter(
          (widget) => widget.group === group && !on.has(widget.id),
        ),
      })).filter((section) => section.widgets.length > 0),
    [available, on],
  );

  const add = (id: string) => onChange([...chosen.map((w) => w.id), id]);
  const remove = (id: string) =>
    onChange(
      chosen.filter((widget) => widget.id !== id).map((widget) => widget.id),
    );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Your dashboard"
      description="Drag to arrange. Everything saves as you go."
      size="lg"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          {confirmingReset ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm text-body">
                Put it back to the standard arrangement for your role?
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onReset();
                  setConfirmingReset(false);
                }}
              >
                Reset it
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setConfirmingReset(false)}
              >
                Keep mine
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw aria-hidden="true" className="size-3.5" />
              Reset to the standard one
            </Button>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      }
    >
      {error && (
        <Callout tone="danger" title="That did not save">
          {error}
        </Callout>
      )}

      {/* Absent when connected rather than a reassuring "saved to your
          account": the note exists to warn, and a badge saying everything is
          normal is the kind of furniture this product does without. */}
      {!connected && (
        <Callout tone="warning" title="This browser only">
          There is no server to save your arrangement to, so it lives in this
          browser and will not follow you to another device. Signed in for real,
          it is kept on your account.
        </Callout>
      )}

      <DrawerSection
        title="On your dashboard"
        action={
          <span className="text-meta text-muted">
            {saving
              ? "Saving…"
              : `${String(chosen.length)} ${chosen.length === 1 ? "card" : "cards"}`}
          </span>
        }
      >
        {chosen.length === 0 ? (
          <p className="text-body-sm text-muted">
            Nothing on it. Your dashboard is the greeting and this button —
            which is a real choice, and it stays until you add something below.
          </p>
        ) : (
          <Sortable
            items={chosen}
            keyOf={(widget) => widget.id}
            labelOf={(widget) => widget.title}
            onReorder={onChange}
            gap={8}
          >
            {(widget, args) => (
              <div
                className={
                  "flex items-start gap-2 rounded-lg border border-line bg-surface p-3"
                }
              >
                <SortableHandle handleProps={args.handleProps} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                    {widget.title}
                    <Badge tone="neutral" size="sm">
                      {SPAN_LABELS[widget.span]}
                    </Badge>
                  </p>
                  <p className="mt-0.5 text-body-sm text-muted">
                    {widget.blurb}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(widget.id)}
                  aria-label={`Take ${widget.title} off your dashboard`}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-canvas hover:text-danger-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-text"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
            )}
          </Sortable>
        )}
      </DrawerSection>

      {remaining.length === 0 ? (
        <DrawerSection title="Everything you can add">
          <p className="text-body-sm text-muted">
            Everything you have access to is already on it. More appears here
            when your company switches a module on, or when somebody gives you a
            permission that unlocks one.
          </p>
        </DrawerSection>
      ) : (
        remaining.map((section) => (
          <DrawerSection
            key={section.group}
            title={GROUP_LABELS[section.group]}
          >
            <ul className="flex flex-col gap-2">
              {section.widgets.map((widget) => (
                <li
                  key={widget.id}
                  className="flex items-start gap-2 rounded-lg border border-dashed border-line p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-body-sm font-medium text-ink">
                      {widget.title}
                      <Badge tone="neutral" size="sm">
                        {SPAN_LABELS[widget.span]}
                      </Badge>
                    </p>
                    <p className="mt-0.5 text-body-sm text-muted">
                      {widget.blurb}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => add(widget.id)}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    Add
                  </Button>
                </li>
              ))}
            </ul>
          </DrawerSection>
        ))
      )}
    </Drawer>
  );
}

/**
 * How wide, in words.
 *
 * "Quarter" rather than "3 columns": nobody is counting the grid, and the
 * useful fact is that four of these fit on a row. It is on the row because a
 * dashboard is a layout, and knowing a chart takes half the width is what
 * stops somebody adding six of them and wondering why it scrolls.
 */
const SPAN_LABELS: Readonly<Record<WidgetSpec["span"], string>> = {
  quarter: "Quarter width",
  third: "Third",
  half: "Half width",
  full: "Full width",
};

/** The trigger. Its own export so the dashboard header can place it. */
export function CustomizeButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onClick}>
      <Check aria-hidden="true" className="size-3.5" />
      Customise
    </Button>
  );
}
