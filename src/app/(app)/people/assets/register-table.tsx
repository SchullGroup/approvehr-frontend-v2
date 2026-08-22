"use client";

import Link from "next/link";
import { Laptop } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Pagination,
  SortableTH,
  TBody,
  TD,
  TDPrimary,
  TH,
  THead,
  TR,
  TableWrap,
} from "@/components/ui";
import type { SortOrder } from "@/lib/use-list-query";
import {
  CONDITION_LABEL,
  STATUS_LABEL,
  dayLabel,
  daysSince,
  type EquipmentItem,
} from "@/lib/store/assets";
import { STATUS_TONE } from "./item-panel";

/**
 * The register: what it is, its tag, who has it, what state it is in, and when
 * it went out.
 *
 * ## Why "who has it" is a name and a link, not a tick
 *
 * The whole point of the table is the middle column. A boolean "assigned" is
 * useless: nobody chases "assigned", they chase Musa. The staff number is under
 * the name because two people share a first name in every company of thirty,
 * and the name links to their record because the next question is always "is he
 * still here".
 *
 * ## One action per row, and it is the obvious one
 *
 * Something nobody has can be handed over. Something somebody has can be taken
 * back. There is never a choice to make, so there is never a menu to open —
 * everything else about an item lives one click away in its panel.
 */
export function RegisterTable({
  title,
  description,
  items,
  loading,
  filters,
  paging,
  onOpen,
  emptyAction,
}: {
  title: string;
  description?: string;
  items: EquipmentItem[];
  loading: boolean;
  filters?: React.ReactNode;
  /**
   * Sorting and paging, from the caller's `useListQuery`.
   *
   * Passed in rather than held here because the *query* belongs to the screen —
   * the register is one table on a tabbed page, and the sort has to travel with
   * the request the screen makes. `total` is the server's count under the
   * filter, and `undefined` while it is unknown.
   */
  paging?: {
    sort: string | undefined;
    order: SortOrder;
    onSort: (column: string, startDescending?: boolean) => void;
    page: number;
    pageSize: number;
    total: number | undefined;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
  };
  onOpen: (item: EquipmentItem) => void;
  emptyAction?: React.ReactNode;
}) {
  /** A sortable header when the caller passes a query, a plain one otherwise. */
  const column = (
    key: string,
    text: string,
    options: { align?: "left" | "right"; startDescending?: boolean } = {},
  ) =>
    paging ? (
      <SortableTH
        column={key}
        active={paging.sort}
        order={paging.order}
        onSort={paging.onSort}
        {...(options.align ? { align: options.align } : {})}
        {...(options.startDescending ? { startDescending: true } : {})}
      >
        {text}
      </SortableTH>
    ) : (
      <TH {...(options.align ? { align: options.align } : {})}>{text}</TH>
    );

  return (
    <Card>
      <CardHeader title={title} {...(description ? { description } : {})} />

      {/* The filters get their own row rather than `CardHeader`'s action slot.
          That slot is `shrink-0`, so four controls in it squeeze the heading to
          one character per line below about 900px — which is most laptops with
          the sidebar open. Their own full-width row wraps instead. */}
      {filters && (
        <CardBody className="border-b border-line">{filters}</CardBody>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<Laptop aria-hidden="true" />}
          title={loading ? "Loading…" : "Nothing here"}
          description={
            loading
              ? "Reading the register."
              : "Nothing matches. Add a laptop, a phone or a SIM card and it shows up here."
          }
          {...(emptyAction && !loading ? { action: emptyAction } : {})}
        />
      ) : (
        <TableWrap className="rounded-none border-0" caption={title}>
          <THead>
            {column("name", "What it is")}
            {column("tag", "Tag")}
            <TH>Who has it</TH>
            {column("status", "State")}
            <TH>Given out</TH>
            {/*
              What it cost and the hand-over actions used to be here.
              Both moved to the item's own panel: a register is a list you scan
              to find something, and eight buttons across ten rows is eighty
              controls for a reader who wants one. Purchase cost is also the one
              column on this table nobody needs to see over somebody's shoulder.
              The row itself opens the panel, and every action lives there.
            */}
            <TH align="right">
              <span className="sr-only">Open</span>
            </TH>
          </THead>
          <TBody>
            {items.map((item) => (
              <TR key={item.id} className={item.archived ? "opacity-60" : undefined}>
                <TDPrimary
                  title={
                    <button
                      type="button"
                      onClick={() => onOpen(item)}
                      className="text-left hover:text-accent-text hover:underline underline-offset-4"
                    >
                      {item.name}
                    </button>
                  }
                  subtitle={
                    [item.kind, [item.make, item.model].filter(Boolean).join(" ")]
                      .filter(Boolean)
                      .join(" · ") || undefined
                  }
                />

                <TD className="tabular whitespace-nowrap text-body-sm text-body">
                  {item.tag}
                </TD>

                <TD>
                  {item.holder ? (
                    <>
                      <Link
                        href={`/people/${item.holder.employeeId}`}
                        className="block font-medium text-ink hover:text-accent-text hover:underline underline-offset-4"
                      >
                        {item.holder.name}
                      </Link>
                      <span className="tabular block text-meta text-muted">
                        {item.holder.employeeNo}
                      </span>
                    </>
                  ) : (
                    <span className="text-body-sm text-muted">Nobody</span>
                  )}
                </TD>

                <TD>
                  <span className="flex flex-col items-start gap-1">
                    <Badge tone={STATUS_TONE[item.status]} size="sm" dot>
                      {STATUS_LABEL[item.status]}
                    </Badge>
                    <span className="text-meta text-muted">
                      {CONDITION_LABEL[item.condition]}
                      {item.archived ? " · archived" : ""}
                    </span>
                  </span>
                </TD>

                <TD className="whitespace-nowrap">
                  {item.holder ? (
                    <>
                      <span className="block text-body-sm text-body">
                        {dayLabel(item.holder.assignedOn)}
                      </span>
                      <span className="block text-meta text-muted">
                        {daysSince(item.holder.assignedOn)} days
                      </span>
                    </>
                  ) : (
                    <span className="text-body-sm text-faint">—</span>
                  )}
                </TD>

                <TD align="right">
                  <Button variant="ghost" size="sm" onClick={() => onOpen(item)}>
                    Details
                  </Button>
                </TD>
              </TR>
            ))}
          </TBody>
        </TableWrap>
      )}

      {paging && items.length > 0 && (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          total={paging.total}
          onPageChange={paging.onPageChange}
          onPageSizeChange={paging.onPageSizeChange}
          noun={["thing", "things"]}
          loading={loading}
        />
      )}
    </Card>
  );
}
