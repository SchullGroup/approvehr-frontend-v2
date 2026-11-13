import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  AddDocumentModal,
  AskForDocumentModal,
  AttachDocumentModal,
  RemindModal,
  WaiveModal,
  type NewDocument,
} from "@/app/(app)/people/documents/dialogs";
import type { ApiDocument, ApiDocumentRequest } from "@/lib/api/documents";
import type { CreateRequestBody, FulfilBody } from "@/lib/api/documents";
import { renderInToasts } from "./pipeline-workspace-helpers";

/**
 * Every document dialog starts blank each time it is opened.
 *
 * The screens keep them mounted so each can animate out, and `Modal` unmounts its
 * children when it closes, so the controls inside start over while a field held
 * above them did not. The file picker therefore read "Choose a file" over a button
 * that was still live and still carried the last file, and the harm is the next
 * record being made out of the last one's entry: a duplicate document, one
 * person's ID card on another's file, the next request answered with the previous
 * request's PDF, a reason typed for one request on the button for another.
 */

const gone = () =>
  waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

const fileInput = () =>
  document.querySelector('input[type="file"]') as HTMLInputElement;

const pdf = (name: string, text = "%PDF-1.4 a") =>
  new File([text], name, { type: "application/pdf" });

/** What `readAsAttachment` makes of a file: its bytes, in base64. */
const base64Of = (text: string) => btoa(text);

const request = (
  over: Partial<ApiDocumentRequest> = {},
): ApiDocumentRequest => ({
  id: "req-1",
  employeeId: "emp-1",
  employeeName: "Ada Okafor",
  employeeNo: "EMP-001",
  name: "Work permit",
  category: "IDENTIFICATION",
  reason: null,
  dueOn: null,
  daysLeft: null,
  overdue: false,
  status: "OPEN",
  requestedById: null,
  requestedByName: null,
  requestedAt: "2026-11-01T09:00:00.000Z",
  documentId: null,
  fulfilledAt: null,
  waivedAt: null,
  waivedReason: null,
  ...over,
});

const onFileDocument = (over: Partial<ApiDocument> = {}): ApiDocument => ({
  id: "doc-1",
  employeeId: "emp-1",
  name: "Passport scan",
  category: "IDENTIFICATION",
  storageKey: null,
  hasFile: true,
  sizeBytes: 10,
  mimeType: "application/pdf",
  verified: false,
  verifiedAt: null,
  uploadedAt: "2026-10-01T09:00:00.000Z",
  archived: false,
  fulfilsRequestId: null,
  ...over,
});

/* ------------------------------------------------------------ add a document */

function AddHarness({
  onAdd,
  canNotify,
}: {
  onAdd: (body: NewDocument) => void;
  canNotify?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open it
      </button>
      <AddDocumentModal
        open={open}
        whose="Ada’s"
        {...(canNotify === undefined ? {} : { canNotify })}
        onClose={() => setOpen(false)}
        onAdd={async (body) => {
          onAdd(body);
          setOpen(false);
        }}
      />
    </>
  );
}

const addIt = () => screen.getByRole("button", { name: "Add it" });

describe("Add a document", () => {
  it("opens blank after a document was added, with the picker and the button agreeing", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddHarness onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.type(screen.getByLabelText(/Name it/), "Employment contract");
    await user.selectOptions(screen.getByLabelText("Kind"), "CONTRACT");
    await user.upload(fileInput(), pdf("contract.pdf", "first file"));
    expect(await screen.findByText("contract.pdf")).toBeInTheDocument();
    await user.click(addIt());
    expect(onAdd).toHaveBeenCalledTimes(1);
    await gone();

    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(screen.getByLabelText(/Name it/)).toHaveValue("");
    expect(screen.getByLabelText("Kind")).toHaveValue("OTHER");
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("contract.pdf")).toBeNull();
    /* What the picker says is what the form holds: nothing, so nothing to press. */
    expect(addIt()).toBeDisabled();
  });

  it("does not make a second document out of the first one's file", async () => {
    /* The harm, not only the symptom: add one, open it again, and press. */
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddHarness onAdd={onAdd} />);

    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.type(screen.getByLabelText(/Name it/), "Employment contract");
    await user.upload(fileInput(), pdf("contract.pdf", "first file"));
    await screen.findByText("contract.pdf");
    await user.click(addIt());
    await gone();

    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.click(addIt());
    expect(onAdd).toHaveBeenCalledTimes(1);

    /* A name alone is still not a document. */
    await user.type(screen.getByLabelText(/Name it/), "Second thing");
    await user.click(addIt());
    expect(onAdd).toHaveBeenCalledTimes(1);

    /* With its own file, it carries its own file and not the first one's. */
    await user.upload(fileInput(), pdf("second.pdf", "second file"));
    await screen.findByText("second.pdf");
    await user.click(addIt());
    expect(onAdd).toHaveBeenCalledTimes(2);
    const second = onAdd.mock.calls[1]?.[0] as NewDocument;
    expect(second.name).toBe("Second thing");
    expect(second.contentBase64).toBe(base64Of("second file"));
    expect(second.contentBase64).not.toBe(base64Of("first file"));
  });

  it("does not bring back what was typed and cancelled", async () => {
    const user = userEvent.setup();
    render(<AddHarness onAdd={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.type(screen.getByLabelText(/Name it/), "Half a thought");
    await user.upload(fileInput(), pdf("draft.pdf"));
    await screen.findByText("draft.pdf");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(screen.getByRole("button", { name: "Open it" }));
    expect(screen.getByLabelText(/Name it/)).toHaveValue("");
    expect(screen.queryByText("draft.pdf")).toBeNull();
    expect(addIt()).toBeDisabled();
  });

  it("does not change what is on screen while it is closing", async () => {
    const user = userEvent.setup();
    render(<AddHarness onAdd={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Open it" }));
    await user.type(screen.getByLabelText(/Name it/), "Still here");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    /* Closed, and still animating out: the same form, not a blank one. */
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Still here");
    await gone();
  });

  it("keeps what is being typed when its caller hands over the same thing again", async () => {
    function Refreshing() {
      const [tick, setTick] = useState(0);
      return (
        <>
          <button type="button" onClick={() => setTick((n) => n + 1)}>
            Refresh
          </button>
          <AddDocumentModal
            open
            /* The same person, as a string built afresh each render: what a
               reload on window focus amounts to. */
            whose={`Ada${"’"}s`}
            onClose={() => {}}
            onAdd={async () => {}}
            key="same"
          />
          <output>{tick}</output>
        </>
      );
    }
    const user = userEvent.setup();
    render(<Refreshing />);

    await user.type(screen.getByLabelText(/Name it/), "Half typed");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Half typed");
  });
});

/* --------------------------------------------------------- ask for a document */

const people = [
  { id: "emp-1", name: "Ada Okafor" },
  { id: "emp-2", name: "Bola Ade" },
];

function AskHarness({
  onAsk,
  initialFor,
}: {
  onAsk: (body: CreateRequestBody) => void;
  initialFor?: () => { employeeId?: string; name?: string } | null;
}) {
  const [asking, setAsking] = useState<{
    employeeId?: string;
    name?: string;
  } | null>(null);
  const [, setTick] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setAsking({})}>
        Ask anything
      </button>
      <button
        type="button"
        onClick={() => setAsking({ employeeId: "emp-1", name: "Work permit" })}
      >
        Ask Ada
      </button>
      <button type="button" onClick={() => setTick((n) => n + 1)}>
        Re-render
      </button>
      <AskForDocumentModal
        open={asking !== null}
        people={people}
        initial={initialFor ? initialFor() : asking}
        onClose={() => setAsking(null)}
        onAsk={async (body) => {
          onAsk(body);
          setAsking(null);
        }}
      />
    </>
  );
}

const askForIt = () => screen.getByRole("button", { name: "Ask for it" });

describe("Ask for a document", () => {
  it("opens on what it is told, and blank when told nothing", async () => {
    const user = userEvent.setup();
    render(<AskHarness onAsk={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Ask Ada" }));
    expect(screen.getByLabelText(/^Who/)).toHaveValue("emp-1");
    expect(screen.getByLabelText(/What you need/)).toHaveValue("Work permit");
    await user.type(screen.getByLabelText(/Why you need it/), "For the visa");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(screen.getByRole("button", { name: "Ask anything" }));
    expect(screen.getByLabelText(/^Who/)).toHaveValue("");
    expect(screen.getByLabelText(/What you need/)).toHaveValue("");
    expect(screen.getByLabelText(/Why you need it/)).toHaveValue("");
    expect(askForIt()).toBeDisabled();
  });

  it("does not put the first request's reason on the second one", async () => {
    const user = userEvent.setup();
    const onAsk = vi.fn();
    render(<AskHarness onAsk={onAsk} />);

    await user.click(screen.getByRole("button", { name: "Ask Ada" }));
    await user.type(screen.getByLabelText(/Why you need it/), "For the visa");
    await user.type(screen.getByLabelText(/Needed by/), "2026-12-01");
    await user.click(askForIt());
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk.mock.calls[0]?.[0]).toMatchObject({
      reason: "For the visa",
      dueOn: "2026-12-01",
    });
    await gone();

    await user.click(screen.getByRole("button", { name: "Ask anything" }));
    await user.selectOptions(screen.getByLabelText(/^Who/), "emp-2");
    await user.type(screen.getByLabelText(/What you need/), "NYSC certificate");
    await user.click(askForIt());

    const second = onAsk.mock.calls[1]?.[0] as CreateRequestBody;
    expect(second.employeeId).toBe("emp-2");
    expect(second.name).toBe("NYSC certificate");
    expect(second).not.toHaveProperty("reason");
    expect(second).not.toHaveProperty("dueOn");
  });

  it("does not lose what is being typed when its seed is handed over again", async () => {
    const user = userEvent.setup();
    render(
      <AskHarness
        onAsk={vi.fn()}
        /* A new object with the same content on every render. */
        initialFor={() => ({ employeeId: "emp-1", name: "Work permit" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Ask Ada" }));
    await user.type(screen.getByLabelText(/Why you need it/), "Half a line");
    await user.click(screen.getByRole("button", { name: "Re-render" }));
    expect(screen.getByLabelText(/Why you need it/)).toHaveValue("Half a line");
  });
});

/* ------------------------------------------------------------- attach it */

function AttachHarness({
  onAttach,
  onFile = [],
  requests = [request()],
  subject = "other",
}: {
  onAttach: (body: FulfilBody) => void;
  onFile?: ApiDocument[];
  requests?: ApiDocumentRequest[];
  subject?: "self" | "other";
}) {
  const [attaching, setAttaching] = useState<ApiDocumentRequest | null>(null);
  return (
    <>
      {requests.map((r) => (
        <button key={r.id} type="button" onClick={() => setAttaching(r)}>
          Attach to {r.name}
        </button>
      ))}
      <AttachDocumentModal
        open={attaching !== null}
        request={attaching}
        onFile={onFile}
        subject={subject}
        onClose={() => setAttaching(null)}
        onAttach={async (body) => {
          onAttach(body);
          setAttaching(null);
        }}
      />
    </>
  );
}

const attachIt = () => screen.getByRole("button", { name: "Attach it" });

describe("Attach it", () => {
  it("opens blank for the next request, not on the last request's file or name", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(
      <AttachHarness
        onAttach={onAttach}
        requests={[
          request(),
          request({ id: "req-2", name: "Degree certificate" }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Attach to Work permit" }),
    );
    await user.clear(screen.getByLabelText(/Name it/));
    await user.type(screen.getByLabelText(/Name it/), "Permit, signed copy");
    await user.upload(fileInput(), pdf("permit.pdf", "the permit"));
    await screen.findByText("permit.pdf");
    await user.click(attachIt());
    expect(onAttach).toHaveBeenCalledTimes(1);
    await gone();

    await user.click(
      screen.getByRole("button", { name: "Attach to Degree certificate" }),
    );
    /* Its own request, from the start. */
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Degree certificate");
    expect(screen.queryByText("permit.pdf")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();
    expect(attachIt()).toBeDisabled();
  });

  it("does not answer the next request with the previous request's PDF", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    render(
      <AttachHarness
        onAttach={onAttach}
        requests={[
          request(),
          request({ id: "req-2", name: "Degree certificate" }),
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Attach to Work permit" }),
    );
    await user.upload(fileInput(), pdf("permit.pdf", "the permit"));
    await screen.findByText("permit.pdf");
    await user.click(attachIt());
    await gone();

    await user.click(
      screen.getByRole("button", { name: "Attach to Degree certificate" }),
    );
    await user.click(attachIt());
    expect(onAttach).toHaveBeenCalledTimes(1);

    await user.upload(fileInput(), pdf("degree.pdf", "the degree"));
    await screen.findByText("degree.pdf");
    await user.click(attachIt());
    const second = onAttach.mock.calls[1]?.[0] as {
      contentBase64: string;
      name: string;
    };
    expect(second.contentBase64).toBe(base64Of("the degree"));
    expect(second.name).toBe("Degree certificate");
  });

  it("opens on what is already on file again, not on the last switch", async () => {
    const user = userEvent.setup();
    render(<AttachHarness onAttach={vi.fn()} onFile={[onFileDocument()]} />);

    await user.click(
      screen.getByRole("button", { name: "Attach to Work permit" }),
    );
    expect(screen.getByLabelText(/Which document/)).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Something new" }));
    expect(screen.queryByLabelText(/Which document/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await gone();

    await user.click(
      screen.getByRole("button", { name: "Attach to Work permit" }),
    );
    expect(screen.getByLabelText(/Which document/)).toBeInTheDocument();
  });

  it("keeps what is being typed when the same request is handed over again", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AttachDocumentModal
        open
        request={request()}
        onFile={[]}
        subject="other"
        onClose={() => {}}
        onAttach={async () => {}}
      />,
    );

    await user.clear(screen.getByLabelText(/Name it/));
    await user.type(screen.getByLabelText(/Name it/), "Typed over it");
    /* The same request, as a new object: what a reload of the file hands over. */
    rerender(
      <AttachDocumentModal
        open
        request={request()}
        onFile={[]}
        subject="other"
        onClose={() => {}}
        onAttach={async () => {}}
      />,
    );
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Typed over it");
  });

  it("starts again if a different request arrives while it is open", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <AttachDocumentModal
        open
        request={request()}
        onFile={[]}
        subject="other"
        onClose={() => {}}
        onAttach={async () => {}}
      />,
    );
    await user.upload(fileInput(), pdf("permit.pdf"));
    await screen.findByText("permit.pdf");

    rerender(
      <AttachDocumentModal
        open
        request={request({ id: "req-9", name: "Degree certificate" })}
        onFile={[]}
        subject="other"
        onClose={() => {}}
        onAttach={async () => {}}
      />,
    );
    expect(screen.queryByText("permit.pdf")).toBeNull();
    expect(screen.getByLabelText(/Name it/)).toHaveValue("Degree certificate");
    expect(attachIt()).toBeDisabled();
  });

  it("falls back to a new file when everything on file has gone since it opened", () => {
    const props = {
      open: true,
      request: request(),
      subject: "other" as const,
      onClose: () => {},
      onAttach: async () => {},
    };
    const { rerender } = render(
      <AttachDocumentModal {...props} onFile={[onFileDocument()]} />,
    );
    expect(screen.getByLabelText(/Which document/)).toBeInTheDocument();

    /* Nothing left to point at: the only way to answer is a new file, and the
       switch that would say so is not drawn. */
    rerender(<AttachDocumentModal {...props} onFile={[]} />);
    expect(screen.queryByLabelText(/Which document/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Choose a file" }),
    ).toBeInTheDocument();
    expect(attachIt()).toBeDisabled();
  });

  it("does not stay on a document that has left the file since it was chosen", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn<(body: FulfilBody) => Promise<void>>(async () => {});
    const first = onFileDocument();
    const second = onFileDocument({ id: "doc-2", name: "Driving licence" });
    const { rerender } = render(
      <AttachDocumentModal
        open
        request={request()}
        onFile={[first, second]}
        subject="other"
        onClose={() => {}}
        onAttach={onAttach}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/Which document/), "doc-2");

    /* The file reloads under the open dialog, and doc-2 is gone from it. */
    rerender(
      <AttachDocumentModal
        open
        request={request()}
        onFile={[first]}
        subject="other"
        onClose={() => {}}
        onAttach={onAttach}
      />,
    );
    await user.click(attachIt());
    expect(onAttach).toHaveBeenCalledWith({ documentId: "doc-1" });
  });
});

/* -------------------------------------------------------------- drop a request */

function WaiveHarness({ onWaive }: { onWaive: (reason: string) => void }) {
  const [waiving, setWaiving] = useState<ApiDocumentRequest | null>(null);
  return (
    <>
      <button type="button" onClick={() => setWaiving(request())}>
        Drop the permit
      </button>
      <button
        type="button"
        onClick={() =>
          setWaiving(request({ id: "req-2", name: "Degree certificate" }))
        }
      >
        Drop the degree
      </button>
      <WaiveModal
        open={waiving !== null}
        request={waiving}
        onClose={() => setWaiving(null)}
        onWaive={async (reason) => {
          onWaive(reason);
          setWaiving(null);
        }}
      />
    </>
  );
}

describe("Stop asking", () => {
  it("does not put one request's reason on the button for the next", async () => {
    const user = userEvent.setup();
    const onWaive = vi.fn();
    render(<WaiveHarness onWaive={onWaive} />);

    await user.click(screen.getByRole("button", { name: "Drop the permit" }));
    await user.type(
      screen.getByLabelText(/Why it is no longer needed/),
      "Left the company",
    );
    await user.click(screen.getByRole("button", { name: "Drop it" }));
    expect(onWaive).toHaveBeenCalledWith("Left the company");
    await gone();

    await user.click(screen.getByRole("button", { name: "Drop the degree" }));
    expect(screen.getByLabelText(/Why it is no longer needed/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Drop it" })).toBeDisabled();
    expect(onWaive).toHaveBeenCalledTimes(1);
  });

  it("keeps the reason being typed when the same request is handed over again", async () => {
    const user = userEvent.setup();
    const waive = async () => {};
    const { rerender } = render(
      <WaiveModal
        open
        request={request()}
        onClose={() => {}}
        onWaive={waive}
      />,
    );
    await user.type(
      screen.getByLabelText(/Why it is no longer needed/),
      "Left the company",
    );

    /* The same request, as a new object: what a reload of the register hands over. */
    rerender(
      <WaiveModal
        open
        request={request()}
        onClose={() => {}}
        onWaive={waive}
      />,
    );
    expect(screen.getByLabelText(/Why it is no longer needed/)).toHaveValue(
      "Left the company",
    );
  });

  it("starts again if a different request arrives while it is open", async () => {
    const user = userEvent.setup();
    const waive = async () => {};
    const { rerender } = render(
      <WaiveModal
        open
        request={request()}
        onClose={() => {}}
        onWaive={waive}
      />,
    );
    await user.type(
      screen.getByLabelText(/Why it is no longer needed/),
      "Left the company",
    );

    rerender(
      <WaiveModal
        open
        request={request({ id: "req-9", name: "Degree certificate" })}
        onClose={() => {}}
        onWaive={waive}
      />,
    );
    expect(screen.getByLabelText(/Why it is no longer needed/)).toHaveValue("");
    expect(screen.getByRole("button", { name: "Drop it" })).toBeDisabled();
  });
});

/* ------------------------------------------------------------------ remind */

function RemindHarness({
  onRemind,
}: {
  onRemind: (id: string) => Promise<{ notifiedEmployee: boolean }>;
}) {
  const [reminding, setReminding] = useState<ApiDocumentRequest | null>(null);
  return (
    <>
      <button type="button" onClick={() => setReminding(request())}>
        Remind Ada
      </button>
      <RemindModal
        open={reminding !== null}
        request={reminding}
        onClose={() => setReminding(null)}
        onRemind={onRemind}
      />
    </>
  );
}

describe("Remind", () => {
  it("sends every time it is opened, and does not say 'Sent' until it has", async () => {
    const user = userEvent.setup();
    let release: (value: { notifiedEmployee: boolean }) => void = () => {};
    const onRemind = vi
      .fn<(id: string) => Promise<{ notifiedEmployee: boolean }>>()
      .mockResolvedValueOnce({ notifiedEmployee: true })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );
    renderInToasts(<RemindHarness onRemind={onRemind} />);

    await user.click(screen.getByRole("button", { name: "Remind Ada" }));
    expect(await screen.findByText(/Sent to Ada/)).toBeInTheDocument();
    expect(onRemind).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Done" }));
    await gone();

    /* The same person again: asking to nudge them again. It must send again,
       and must not carry last time's "Sent" while it does. */
    await user.click(screen.getByRole("button", { name: "Remind Ada" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Sending…")).toBeInTheDocument();
    expect(within(dialog).queryByText(/Sent to Ada/)).toBeNull();
    expect(onRemind).toHaveBeenCalledTimes(2);
    expect(onRemind).toHaveBeenLastCalledWith("req-1");

    release({ notifiedEmployee: false });
    expect(await screen.findByText(/Nothing reached Ada/)).toBeInTheDocument();
  });
});
