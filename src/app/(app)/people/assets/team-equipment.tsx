"use client";

import { useMemo, useState } from "react";
import { FilterBar } from "@/components/ui";
import { LoadFailure } from "@/components/portal/load-failure";
import { PageBody, PageHeader } from "@/components/portal/shell";
import {
  useEquipment,
  useRepairs,
  type AssetListParams,
  type EquipmentItem,
  type RepairListParams,
} from "@/lib/store/assets";
import { useListQuery } from "@/lib/use-list-query";
import { ItemPanel } from "./item-panel";
import { RegisterTable } from "./register-table";
import { RepairsPanel, type RepairFilter } from "./repairs-panel";

/**
 * What a Departmental Lead sees at `/people/assets`.
 *
 * The feedback's own table, the middle row: *"View Department Equipment /
 * View Repair Requests"*, ticked for the Departmental Lead and dashed for
 * everything that changes a record. `VIEW_EQUIPMENT_DEPARTMENT` and
 * `VIEW_REPAIRS_DEPARTMENT` have existed on this role since the permissions
 * matrix shipped; nothing before this screen ever read the first one, and
 * the API narrows both to the reader's own department on its own — this
 * component asks for nothing scoped and gets back only what it is allowed
 * to. (The API also has a real branch tier a Branch Manager could use here;
 * this repo's frontend permission catalogue does not expose branch
 * permissions at all yet, for equipment or anything else, so that role still
 * lands on the plain own-kit view below. Wider, pre-existing gap, not this
 * screen's to close.)
 *
 * Deliberately **not** `Register` with a wider filter. That component also
 * renders company-wide totals (`useEquipmentSummary`, never scoped), a
 * "kinds" tab for managing categories, and create/edit/archive actions — none
 * of which this role holds, and offering them would be a set of buttons the
 * API refuses the moment they are pressed. `RegisterTable`, `ItemPanel` and
 * `RepairsPanel` are reused as-is, `canEdit={false}` throughout, because all
 * three already take that flag and degrade to a read view on their own —
 * see `ItemPanel`'s own gate on `onHandOver`/`onEdit`/`onArchive`.
 */
export function TeamEquipment() {
  const list = useListQuery<Record<string, never>>({
    filters: {},
    sort: "tag",
    pageSize: 25,
  });

  const params = useMemo<AssetListParams>(
    () => ({
      page: list.page,
      pageSize: list.pageSize,
      ...(list.params.q ? { q: list.params.q } : {}),
      ...(list.sort ? { sort: list.sort as AssetListParams["sort"] } : {}),
      order: list.order,
    }),
    [list.page, list.pageSize, list.params.q, list.sort, list.order],
  );

  const register = useEquipment(params);
  const [repairFilter, setRepairFilter] = useState<RepairFilter>("open");
  const repairs = useRepairs({
    state: repairFilter,
  } as RepairListParams);

  const [panelId, setPanelId] = useState<string | null>(null);
  const loadError = register.error ?? repairs.error;

  return (
    <>
      <PageHeader title="Equipment" />
      <PageBody className="flex flex-col gap-6">
        {loadError && (
          <LoadFailure subject="your team's equipment" error={loadError} />
        )}

        <RegisterTable
          title="Your team's equipment"
          description="Sorted by tag, click any row for its history. Assigning or editing equipment needs the full register — ask whoever manages it."
          items={register.items}
          loading={register.loading}
          onOpen={(item: EquipmentItem) => setPanelId(item.id)}
          paging={{
            sort: list.sort,
            order: list.order,
            onSort: list.toggleSort,
            page: list.page,
            pageSize: list.pageSize,
            total: register.total,
            onPageChange: list.setPage,
            onPageSizeChange: list.setPageSize,
          }}
          filters={
            <FilterBar
              search={list.search}
              onSearchChange={list.setSearch}
              searchPlaceholder="Tag, name or serial"
              searchLabel="Search by tag, name, serial number, make or model"
              count={register.total}
              noun={["thing", "things"]}
            />
          }
        />

        <RepairsPanel
          repairs={repairs.repairs}
          loading={repairs.loading}
          canEdit={false}
          filter={repairFilter}
          onFilterChange={setRepairFilter}
          onFinish={() => {
            /* canEdit is false, so RepairsPanel never renders the control
               that would call this. */
          }}
        />
      </PageBody>

      {panelId && (
        <ItemPanel
          itemId={panelId}
          canEdit={false}
          onClose={() => setPanelId(null)}
          onEdit={() => {}}
          onHandOver={() => {}}
          onTakeBack={() => {}}
          onLogRepair={() => {}}
          onArchive={() => {}}
          onRestore={() => {}}
          onSetStatus={() => {}}
          onFixed={() => {}}
          onFinishRepair={() => {}}
        />
      )}
    </>
  );
}
