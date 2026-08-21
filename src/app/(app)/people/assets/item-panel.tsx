"use client";

import Link from "next/link";
import {
  ArchiveRestore,
  Pencil,
  Trash2,
  Undo2,
  UserPlus,
  Wrench,
} from "lucide-react";
import {
  Badge,
  Button,
  Callout,
  DescriptionList,
  Drawer,
  Money,
  Spinner,
  Timeline,
  type BadgeTone,
  type TimelineEntry,
} from "@/components/ui";
import {
  CONDITION_LABEL,
  STATUS_LABEL,
  dayLabel,
  daysSince,
  useEquipmentItem,
  type EquipmentItem,
  type Repair,
  type SettableStatus,
} from "@/lib/store/assets";

/** The badge tone for each status. Colour never carries the meaning alone. */
export const STATUS_TONE: Record<EquipmentItem["status"], BadgeTone> = {
  AVAILABLE: "success",
  ASSIGNED: "accent",
  IN_REPAIR: "info",
  RETIRED: "neutral",
  LOST: "danger",
};

/**
 * One piece of equipment, everything known about it.
 *
 * ## Why a panel and not a page
 *
 * The question people arrive with is "who has AHR-LT-01", and the answer is one
 * line in the table behind this. What the panel adds is the history — who had it
 * *before*, and what state it was in each time it changed hands. That is the
 * answer to "who had it when the screen cracked", which is the only question
 * about equipment that ever gets contested. It does not deserve its own URL and
 * a back button; it deserves to be beside the row.
 *
 * ## The three status buttons
 *
 * Lost, turned up, written off. They are buttons rather than a dropdown because
 * each one is a decision with a consequence, and a button can say what the
 * consequence is. "Mark it lost" stays available while somebody is holding it —
 * the assignment deliberately stays open, because they still owe us the thing
 * and it must keep appearing on their exit checklist.
 */
export function ItemPanel({
  itemId,
  canEdit,
  onClose,
  onEdit,
  onHandOver,
  onTakeBack,
  onLogRepair,
  onArchive,
  onRestore,
  onSetStatus,
  onFixed,
  onFinishRepair,
}: {
  itemId: string;
  canEdit: boolean;
  onClose: () => void;
  onEdit: (item: EquipmentItem) => void;
  onHandOver: (item: EquipmentItem) => void;
  onTakeBack: (item: EquipmentItem) => void;
  onLogRepair: (item: EquipmentItem) => void;
  onArchive: (item: EquipmentItem) => void;
  onRestore: (item: EquipmentItem) => void;
  onSetStatus: (item: EquipmentItem, status: SettableStatus) => void;
  /** Back in the store **and** working. Separate because it sets both. */
  onFixed: (item: EquipmentItem) => void;
  onFinishRepair: (repair: Repair) => void;
}) {
  const { detail, loading, error } = useEquipmentItem(itemId);

  return (
    <Drawer
      open
      onClose={onClose}
      width="max-w-xl"
      title={detail?.name ?? "Equipment"}
      description={detail ? `Tag ${detail.tag}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading && (
        <div className="flex items-center gap-2 text-body-sm text-muted">
          <Spinner size="sm" />
          Loading
        </div>
      )}

      {error && (
        <Callout tone="danger" title="Could not load it">
          {error.message}
        </Callout>
      )}

      {detail && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[detail.status]} size="sm" dot>
              {STATUS_LABEL[detail.status]}
            </Badge>
            <Badge tone="neutral" size="sm">
              {CONDITION_LABEL[detail.condition]}
            </Badge>
            {detail.archived && (
              <Badge tone="neutral" size="sm">
                Archived
              </Badge>
            )}
            {!detail.returnRequired && (
              <Badge tone="neutral" size="sm">
                Nobody has to hand it back
              </Badge>
            )}
          </div>

          {detail.holder && (
            <Callout tone="accent" title={`${detail.holder.name} has it`}>
              Since {dayLabel(detail.holder.assignedOn)} —{" "}
              {daysSince(detail.holder.assignedOn)} days. Went out{" "}
              {CONDITION_LABEL[detail.holder.conditionOut].toLowerCase()}.{" "}
              <Link
                href={`/people/${detail.holder.employeeId}`}
                className="font-medium underline underline-offset-4"
              >
                {detail.holder.employeeNo}
              </Link>
            </Callout>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {detail.handOutable && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => onHandOver(detail)}
                >
                  <UserPlus aria-hidden="true" className="size-3.5" />
                  Hand it over
                </Button>
              )}
              {detail.holder && (
                <Button
                  variant="accent"
                  size="sm"
                  onClick={() => onTakeBack(detail)}
                >
                  <Undo2 aria-hidden="true" className="size-3.5" />
                  Take it back
                </Button>
              )}
              {!detail.archived && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onLogRepair(detail)}
                >
                  <Wrench aria-hidden="true" className="size-3.5" />
                  Log a repair
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => onEdit(detail)}>
                <Pencil aria-hidden="true" className="size-3.5" />
                Edit
              </Button>

              {detail.status === "LOST" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetStatus(detail, "AVAILABLE")}
                >
                  It has turned up
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSetStatus(detail, "LOST")}
                >
                  Mark it lost
                </Button>
              )}

              {/* A damaged return sets "Being fixed" without opening a repair
                  job — there is nothing to finish, so the automatic route back
                  into the pool never fires. Without this button that is a dead
                  end, the same shape of bug the API had for LOST.

                  It sets the condition as well as the status, because the words
                  on it say "fixed" and a register that reads "in the store,
                  broken" will hand somebody a broken MiFi. Anything short of
                  working goes through Edit instead. */}
              {detail.status === "IN_REPAIR" &&
                !detail.repairs.some((repair) => repair.open) &&
                !detail.holder && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onFixed(detail)}
                  >
                    It is fixed — back in the store
                  </Button>
                )}

              {detail.status === "RETIRED" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onSetStatus(detail, "AVAILABLE")}
                >
                  Put it back in use
                </Button>
              ) : (
                !detail.holder && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSetStatus(detail, "RETIRED")}
                  >
                    Write it off
                  </Button>
                )
              )}

              {detail.archived ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onRestore(detail)}
                >
                  <ArchiveRestore aria-hidden="true" className="size-3.5" />
                  Bring it back
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onArchive(detail)}
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  Archive
                </Button>
              )}
            </div>
          )}

          <DescriptionList
            items={[
              { term: "Kind", value: detail.kind ?? "Not sorted into a kind" },
              {
                term: "Make and model",
                value:
                  [detail.make, detail.model].filter(Boolean).join(" ") || "—",
              },
              { term: "Serial number", value: detail.serialNumber ?? "—" },
              { term: "Bought", value: dayLabel(detail.purchasedOn) },
              {
                term: "What it cost",
                value:
                  detail.cost === null ? (
                    "Not recorded"
                  ) : (
                    <Money amount={detail.cost} size="sm" decimals />
                  ),
              },
              {
                term: "Hand back on exit",
                value: detail.returnRequired ? "Yes" : "No",
              },
            ]}
          />

          {detail.notes && (
            <p className="whitespace-pre-line rounded-md bg-canvas p-3 text-body-sm leading-relaxed text-body">
              {detail.notes}
            </p>
          )}

          <section>
            <h3 className="text-body font-semibold text-ink">
              Who has had it
            </h3>
            {detail.history.length === 0 ? (
              <p className="mt-2 text-body-sm text-muted">
                Nobody has been given this yet.
              </p>
            ) : (
              <Timeline className="mt-4" entries={historyEntries(detail.history)} />
            )}
          </section>

          <section>
            <h3 className="text-body font-semibold text-ink">Repairs</h3>
            {detail.repairs.length === 0 ? (
              <p className="mt-2 text-body-sm text-muted">
                Nothing has been fixed on this.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {detail.repairs.map((repair) => (
                  <li
                    key={repair.id}
                    className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-3 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink">
                        {repair.description}
                        {repair.open && (
                          <Badge tone="info" size="sm">
                            Still in
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-meta text-muted">
                        {dayLabel(repair.startedOn)}
                        {repair.completedOn
                          ? ` → ${dayLabel(repair.completedOn)}`
                          : ""}
                        {repair.vendor ? ` · ${repair.vendor}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {repair.cost !== null && (
                        <Money amount={repair.cost} size="sm" />
                      )}
                      {repair.open && canEdit && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => onFinishRepair(repair)}
                        >
                          It is fixed
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </Drawer>
  );
}

/**
 * The history as a timeline.
 *
 * An open spell reads "has it now" rather than a blank return date, because a
 * missing date in a list of dates reads as data that failed to load.
 */
function historyEntries(
  history: {
    id: string;
    employeeName: string;
    employeeNo: string;
    assignedOn: string;
    returnedOn: string | null;
    conditionOut: EquipmentItem["condition"];
    conditionBack: EquipmentItem["condition"] | null;
    note: string | null;
  }[],
): TimelineEntry[] {
  return history.map((entry) => ({
    id: entry.id,
    title: entry.employeeName,
    timestamp: entry.returnedOn
      ? `${dayLabel(entry.assignedOn)} → ${dayLabel(entry.returnedOn)}`
      : `${dayLabel(entry.assignedOn)} → has it now`,
    /* No `actor`: the Timeline prefixes it with "by", and "by AHR-0142" reads
       as though a staff number did something. The number belongs in the line
       below, beside the condition it is evidence for. */
    tone: entry.returnedOn === null ? "accent" : "neutral",
    detail: (
      <span className="block whitespace-pre-line">
        {entry.employeeNo} · Out {CONDITION_LABEL[entry.conditionOut].toLowerCase()}
        {entry.conditionBack
          ? `, back ${CONDITION_LABEL[entry.conditionBack].toLowerCase()}`
          : ""}
        {entry.note ? `\n${entry.note}` : ""}
      </span>
    ),
  }));
}
