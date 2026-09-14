import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ApiBoard } from "@/lib/api/announcements";
import type { ApiDocument, ApiDocumentRequest } from "@/lib/api/documents";

/**
 * A sixth spelling of the batch's bug, found by whole-branch review: an
 * *instant* (a real timestamp, not a date-only value) reduced to its *UTC*
 * calendar day for display, either via `.slice(0, 10)` or a hand-rolled
 * UTC-getter formatter — invisible to every guardrail in this batch, because
 * none of them looked for a reduction that never calls `new Date()` itself
 * (the value already *is* one, handed in as a prop) and never chains off
 * `toISOString()`.
 *
 * Each instant below is 16:30 UTC on 23 July — already 24 July in
 * Pacific/Auckland (UTC+13). The old, UTC-getter code would print "23 Jul
 * 2026"; the company's zone says "24 Jul 2026".
 */
vi.mock("@/lib/store/session", () => ({
  useOrgTimezone: () => "Pacific/Auckland",
}));

const INSTANT = "2026-07-23T16:30:00.000Z";

describe("an instant renders in the company's zone, not UTC's", () => {
  it("AnnouncementsPanel's notice date", async () => {
    const { AnnouncementsPanel } =
      await import("@/app/(app)/dashboard/announcements-panel");

    const board: ApiBoard = {
      notices: [
        {
          id: "notice-1",
          title: "Payroll moves to the 25th",
          body: "Starting next month.",
          pinned: false,
          publishedAt: INSTANT,
          departmentNames: [],
          postedByName: "Amara Nwachukwu",
        },
      ],
      total: 1,
    };

    render(<AnnouncementsPanel board={board} />);

    expect(screen.getByText(/24 Jul 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/23 Jul 2026/)).not.toBeInTheDocument();
  });

  it("DocumentRow's uploaded date", async () => {
    const { DocumentRow } =
      await import("@/app/(app)/people/documents/document-rows");

    const document: ApiDocument = {
      id: "doc-1",
      employeeId: "emp-1",
      name: "Contract",
      category: "CONTRACT",
      storageKey: "docs/doc-1",
      hasFile: true,
      sizeBytes: 1024,
      mimeType: "application/pdf",
      verified: false,
      verifiedAt: null,
      uploadedAt: INSTANT,
      archived: false,
      fulfilsRequestId: null,
    };

    render(<DocumentRow document={document} />);

    expect(screen.getByText(/24 Jul 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/23 Jul 2026/)).not.toBeInTheDocument();
  });

  it("RequestRow's received date", async () => {
    const { RequestRow } =
      await import("@/app/(app)/people/documents/document-rows");

    const request: ApiDocumentRequest = {
      id: "req-1",
      employeeId: "emp-1",
      employeeName: "Amara Nwachukwu",
      employeeNo: "EMP-1",
      name: "Contract",
      category: "CONTRACT",
      reason: null,
      dueOn: null,
      daysLeft: null,
      overdue: false,
      status: "FULFILLED",
      requestedById: null,
      requestedByName: null,
      requestedAt: INSTANT,
      documentId: "doc-1",
      fulfilledAt: INSTANT,
      waivedAt: null,
      waivedReason: null,
    };

    render(<RequestRow request={request} />);

    expect(screen.getByText(/Received 24 Jul 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/23 Jul 2026/)).not.toBeInTheDocument();
  });
});
