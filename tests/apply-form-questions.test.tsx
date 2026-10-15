import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApplyForm } from "@/components/marketing/apply/apply-form";
import type {
  ApplyClient,
  ApplyPayload,
  UploadCall,
} from "@/lib/marketing/apply-client";
import type { UploadOutcome } from "@/lib/marketing/apply-upload";
import {
  blankQuestion,
  defaultDefinition,
  type FormDefinition,
  type FormQuestion,
} from "@/lib/marketing/apply-form";
import type { ApplyOutcome } from "@/lib/marketing/careers";

/**
 * The form an applicant fills in, with the advert's own questions.
 *
 * The client is the only fake: `submit` and `upload` are what the API would do, and
 * every test reads the page, presses what a person would press, and checks what
 * was sent. Nothing here reaches into the component.
 */

const accepted = (over: Record<string, unknown> = {}): ApplyOutcome => ({
  ok: true,
  value: {
    id: "app-1",
    company: "Acme Ltd",
    postingTitle: "Payroll Analyst",
    note: "Acme Ltd has your application for Payroll Analyst.",
    cvNote: null,
    reference: null,
    confirmationEmail: false,
    ...over,
  },
});

const refused = (
  kind: "invalid" | "refused",
  fields: Record<string, string> = {},
  message = "That did not go through.",
): ApplyOutcome => ({
  ok: false,
  kind,
  message,
  fields,
  retryAfterSeconds: null,
});

const uploaded = (name = "cv.pdf", size = 1200): UploadOutcome => ({
  ok: true,
  file: { key: `org/cvs/post/${name}`, name, sizeBytes: size },
});

function makeClient(over: Partial<ApplyClient> = {}) {
  const submit = vi.fn<(payload: ApplyPayload) => Promise<ApplyOutcome>>(
    async () => accepted(),
  );
  const upload = vi.fn<(call: UploadCall) => Promise<UploadOutcome>>(
    async (call) => uploaded(call.file.name, call.file.size),
  );
  const client: ApplyClient = { mode: "live", upload, submit, ...over };
  return { client, submit, upload };
}

const q = (over: Partial<FormQuestion> & { kind: FormQuestion["kind"] }) => {
  const { kind, ...rest } = over;
  return { ...blankQuestion(kind, rest.id ?? "x"), ...rest };
};

function definition(
  questions: FormQuestion[],
  over: Partial<FormDefinition> = {},
): FormDefinition {
  return { ...defaultDefinition(), questions, ...over };
}

function mount(
  form: FormDefinition,
  options: {
    client?: ApplyClient;
    uploadsEnabled?: boolean;
    src?: string | null;
    userOptions?: Parameters<typeof userEvent.setup>[0];
  } = {},
) {
  const made = makeClient();
  const client = options.client ?? made.client;
  const user = userEvent.setup(options.userOptions);
  render(
    <ApplyForm
      client={client}
      form={form}
      roleTitle="Payroll Analyst"
      company="Acme Ltd"
      uploadsEnabled={options.uploadsEnabled ?? true}
      src={options.src ?? null}
    />,
  );
  return { user, client, submit: made.submit, upload: made.upload };
}

async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/First name/), "Chioma");
  await user.type(screen.getByLabelText(/Surname/), "Aduba");
  await user.type(screen.getByLabelText(/^Email/), "chioma@example.com");
}

const send = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole("button", { name: /Send application/ }));

const pdf = (name = "cv.pdf", size?: number) => {
  const file = new File(["%PDF-1.4 test"], name, { type: "application/pdf" });
  if (size !== undefined) Object.defineProperty(file, "size", { value: size });
  return file;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the standard boxes follow the advert's switches", () => {
  it("shows phone, CV and note by default, and marks what is optional", () => {
    mount(defaultDefinition());
    expect(screen.getByLabelText(/Phone/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Your CV/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Anything else/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/covering letter/i)).not.toBeInTheDocument();
  });

  it("leaves a box out when the advert switches it off", () => {
    mount(
      definition([], {
        standard: {
          phone: "OFF",
          coverNote: "OFF",
          cv: "OFF",
        },
      }),
    );
    expect(screen.queryByLabelText(/Phone/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Your CV/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Anything else/)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/First name/)).toBeInTheDocument();
  });

  it("draws no file box at all where the API cannot take a file, and says to paste a link", () => {
    mount(definition([q({ id: "f", kind: "FILE", label: "Certificate" })]), {
      uploadsEnabled: false,
    });
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(screen.queryByTestId("cv-upload")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Certificate/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/put a link to your CV in the note/),
    ).toBeInTheDocument();
  });

  it("requires a phone number when the advert says so, and checks its shape", async () => {
    const { user, submit } = mount(
      definition([], {
        standard: { ...defaultDefinition().standard, phone: "REQUIRED" },
      }),
    );
    await fillIn(user);
    await send(user);
    expect(
      await screen.findAllByText("Enter a phone number we can reach you on."),
    ).not.toHaveLength(0);

    await user.type(screen.getByLabelText(/Phone/), "abc");
    await send(user);
    expect(
      (await screen.findAllByText(/Use digits, spaces/)).length,
    ).toBeGreaterThan(0);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("every kind of question is a labelled control", () => {
  const all = (): FormQuestion[] => [
    q({ id: "s", kind: "SHORT_TEXT", label: "Current job title" }),
    q({ id: "l", kind: "LONG_TEXT", label: "Why us?", wordLimit: 20 }),
    q({
      id: "one",
      kind: "SINGLE_CHOICE",
      label: "Best tool",
      options: [
        { id: "o1", label: "Excel" },
        { id: "o2", label: "SQL" },
      ],
    }),
    q({
      id: "many",
      kind: "MULTI_CHOICE",
      label: "Tools used",
      options: [
        { id: "m1", label: "Excel" },
        { id: "m2", label: "SQL" },
        { id: "m3", label: "Python" },
      ],
    }),
    q({ id: "yn", kind: "YES_NO", label: "Right to work in Nigeria?" }),
    q({
      id: "n",
      kind: "NUMBER",
      label: "Years of experience",
      min: 0,
      max: 50,
    }),
    q({ id: "u", kind: "URL", label: "Portfolio" }),
    q({ id: "f", kind: "FILE", label: "Certificate" }),
  ];

  it("draws each with its question as the label, in the order given", () => {
    mount(definition(all()));
    expect(screen.getByLabelText(/Current job title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Why us\?/)).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /Best tool/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /Tools used/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: /Right to work in Nigeria\?/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Years of experience/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Portfolio/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Certificate/)).toBeInTheDocument();

    const labels = ["Current job title", "Why us?", "Best tool", "Tools used"];
    const html = document.body.textContent ?? "";
    const positions = labels.map((label) => html.indexOf(label));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows helper text and says what a number may be", () => {
    mount(
      definition([
        q({
          id: "n",
          kind: "NUMBER",
          label: "Notice period (weeks)",
          helper: "Whole weeks.",
          min: 0,
          max: 12,
        }),
      ]),
    );
    const input = screen.getByLabelText(/Notice period/);
    expect(input).toHaveAccessibleDescription("Whole weeks. From 0 to 12.");
  });

  it("sends every kind of answer, choices by their stable id", async () => {
    const { user, submit } = mount(definition(all()));
    await fillIn(user);
    await user.type(screen.getByLabelText(/Current job title/), "Payroll lead");
    await user.type(screen.getByLabelText(/Why us\?/), "I like numbers");
    await user.click(
      screen.getByLabelText("SQL", { selector: "[name=q-one]" }),
    );
    const many = within(screen.getByRole("group", { name: /Tools used/ }));
    await user.click(many.getByLabelText("Excel"));
    await user.click(many.getByLabelText("Python"));
    await user.click(
      within(
        screen.getByRole("group", { name: /Right to work in Nigeria\?/ }),
      ).getByLabelText("Yes"),
    );
    await user.type(screen.getByLabelText(/Years of experience/), "7");
    await user.type(
      screen.getByLabelText(/Portfolio/),
      "https://me.example.com",
    );
    await user.upload(screen.getByLabelText(/Certificate/), pdf("cert.pdf"));
    await screen.findByTestId("q-f-name");

    await send(user);
    await screen.findByText("Application sent");

    const payload = submit.mock.calls[0]?.[0] as ApplyPayload;
    expect(payload.answers).toEqual({
      s: "Payroll lead",
      l: "I like numbers",
      one: "o2",
      many: ["m1", "m3"],
      yn: "yes",
      n: "7",
      u: "https://me.example.com",
      f: { key: "org/cvs/post/cert.pdf", name: "cert.pdf", sizeBytes: 13 },
    });
  });

  it("sends nothing for a question left blank, rather than an empty answer", async () => {
    const { user, submit } = mount(definition(all()));
    await fillIn(user);
    await send(user);
    await screen.findByText("Application sent");
    const payload = submit.mock.calls[0]?.[0] as ApplyPayload;
    expect(
      Object.values(payload.answers).every((value) => value === null),
    ).toBe(true);
  });
});

describe("a long answer with a word limit", () => {
  const long = () =>
    definition([
      q({ id: "l", kind: "LONG_TEXT", label: "Why us?", wordLimit: 5 }),
    ]);

  it("counts words as they are typed", async () => {
    const { user } = mount(long());
    expect(screen.getByTestId("q-l-count")).toHaveTextContent("0 of 5 words");
    await user.type(screen.getByLabelText(/Why us\?/), "one two three");
    expect(screen.getByTestId("q-l-count")).toHaveTextContent("3 of 5 words");
    await user.type(screen.getByLabelText(/Why us\?/), " four");
    expect(screen.getByTestId("q-l-count")).toHaveTextContent("4 of 5 words");
  });

  it("hides the changing figure from a screen reader and announces only when the situation changes", async () => {
    const { user } = mount(long());
    const counter = screen.getByTestId("q-l-count");
    expect(counter).toHaveAttribute("aria-hidden", "true");
    const status = counter.parentElement?.querySelector(
      "[role=status]",
    ) as HTMLElement;
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("");

    await user.type(screen.getByLabelText(/Why us\?/), "one two three");
    expect(status).toHaveTextContent("");
    await user.type(screen.getByLabelText(/Why us\?/), " four");
    expect(status).toHaveTextContent("1 word left.");
    await user.type(screen.getByLabelText(/Why us\?/), " five six");
    expect(status).toHaveTextContent("1 word over the limit.");
  });

  it("refuses an answer over the limit, says by how many, and sends nothing", async () => {
    const { user, submit } = mount(long());
    await fillIn(user);
    await user.type(
      screen.getByLabelText(/Why us\?/),
      "one two three four five six seven",
    );
    await send(user);

    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent("That is 2 words over the 5 word limit.");
    expect(
      screen.getAllByText("That is 2 words over the 5 word limit.").length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Why us\?/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("accepts exactly the limit", async () => {
    const { user, submit } = mount(long());
    await fillIn(user);
    await user.type(
      screen.getByLabelText(/Why us\?/),
      "one two three four five",
    );
    await send(user);
    await screen.findByText("Application sent");
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe("checking before anything is sent", () => {
  it("gathers every problem into a summary, moves focus to it, and each line goes to its box", async () => {
    const { user, submit } = mount(
      definition([
        q({ id: "t", kind: "SHORT_TEXT", label: "Job title", required: true }),
        q({
          id: "c",
          kind: "SINGLE_CHOICE",
          label: "Best tool",
          required: true,
          options: [
            { id: "o1", label: "Excel" },
            { id: "o2", label: "SQL" },
          ],
        }),
      ]),
    );
    await send(user);

    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveFocus();
    expect(
      within(summary).getByRole("heading", {
        name: "5 things need fixing before you send",
      }),
    ).toBeInTheDocument();
    expect(submit).not.toHaveBeenCalled();

    await user.click(within(summary).getByRole("link", { name: "Job title" }));
    expect(screen.getByLabelText(/Job title/)).toHaveFocus();

    await user.click(within(summary).getByRole("link", { name: "Best tool" }));
    expect(screen.getByRole("group", { name: /Best tool/ })).toHaveFocus();
  });

  it("clears a problem as soon as its box is corrected", async () => {
    const { user } = mount(
      definition([
        q({ id: "t", kind: "SHORT_TEXT", label: "Job title", required: true }),
      ]),
    );
    await fillIn(user);
    await send(user);
    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent("Job title");

    await user.type(screen.getByLabelText(/Job title/), "Analyst");
    expect(screen.queryByTestId("apply-error-summary")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Job title/)).not.toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("does not make a required question optional or the reverse", () => {
    mount(
      definition([
        q({ id: "a", kind: "SHORT_TEXT", label: "Needed", required: true }),
        q({ id: "b", kind: "SHORT_TEXT", label: "Extra", required: false }),
      ]),
    );
    expect(screen.getByLabelText(/Needed/)).toBeRequired();
    expect(screen.getByLabelText(/Extra/)).not.toBeRequired();
  });
});

describe("files", () => {
  const withCv = (profile: "OPTIONAL" | "REQUIRED" = "OPTIONAL") =>
    definition([], {
      standard: { ...defaultDefinition().standard, cv: profile },
    });

  it("states the limits before anyone chooses a file", () => {
    mount(withCv());
    expect(
      screen.getByText(/PDF, Word or a photo\. Up to 25 MB\./),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Your CV/)).toHaveAttribute(
      "accept",
      expect.stringContaining(".pdf"),
    );
  });

  it("uploads a file, shows it, and sends its key with the application", async () => {
    const { user, submit, upload } = mount(withCv());
    await fillIn(user);
    await user.upload(screen.getByLabelText(/Your CV/), pdf("Chioma CV.pdf"));

    expect(await screen.findByTestId("cv-name")).toHaveTextContent(
      "Chioma CV.pdf",
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]?.[0].profile).toBe("document");

    await send(user);
    await screen.findByText("Application sent");
    const payload = submit.mock.calls[0]?.[0] as ApplyPayload;
    expect(payload.cv).toEqual({
      key: "org/cvs/post/Chioma CV.pdf",
      name: "Chioma CV.pdf",
      sizeBytes: 13,
    });
  });

  it("shows progress while a file goes up, with a way to cancel", async () => {
    let finish: (outcome: UploadOutcome) => void = () => {};
    let report: (fraction: number) => void = () => {};
    const { client, upload } = makeClient();
    upload.mockImplementation(
      (call) =>
        new Promise<UploadOutcome>((resolve) => {
          finish = resolve;
          report = call.onProgress ?? (() => {});
          call.signal?.addEventListener("abort", () =>
            resolve({
              ok: false,
              message: "Upload cancelled.",
              retryable: true,
              cancelled: true,
            }),
          );
        }),
    );
    const { user } = mount(withCv(), { client });
    await user.upload(screen.getByLabelText(/Your CV/), pdf());

    const bar = await screen.findByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    report(0.42);
    await waitFor(() => expect(bar).toHaveAttribute("aria-valuenow", "42"));
    expect(screen.getByText(/42% of/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("progressbar")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Choose a file")).toBeInTheDocument();
    void finish;
  });

  it("refuses a file that is too big, or the wrong kind, without a request", async () => {
    const { user, upload } = mount(withCv(), {
      userOptions: { applyAccept: false },
    });
    const input = screen.getByLabelText(/Your CV/);

    await user.upload(input, pdf("huge.pdf", 30 * 1024 * 1024));
    expect(
      await screen.findByText(/That file is 30 MB\. The limit is 25 MB\./),
    ).toBeInTheDocument();

    await user.upload(
      input,
      new File(["MZ"], "setup.exe", { type: "application/x-msdownload" }),
    );
    expect(
      await screen.findByText(/PDF, Word or a photo only\./),
    ).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it("keeps the form filled and offers to try the same file again after a failure", async () => {
    const { client, upload } = makeClient();
    upload
      .mockResolvedValueOnce({
        ok: false,
        message: "The connection dropped before the file arrived.",
        retryable: true,
      })
      .mockResolvedValueOnce(uploaded("cv.pdf", 13));
    const { user } = mount(withCv(), { client });
    await fillIn(user);
    await user.upload(screen.getByLabelText(/Your CV/), pdf());

    expect(
      await screen.findByText(
        "The connection dropped before the file arrived.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/First name/)).toHaveValue("Chioma");

    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(await screen.findByTestId("cv-name")).toHaveTextContent("cv.pdf");
    expect(upload).toHaveBeenCalledTimes(2);
    /* The same file, not a new choice. */
    expect(upload.mock.calls[1]?.[0].file).toBe(upload.mock.calls[0]?.[0].file);
  });

  it("does not offer Try again for a file that will never be accepted", async () => {
    const { client, upload } = makeClient();
    upload.mockResolvedValueOnce({
      ok: false,
      message: "That type of file cannot be uploaded.",
      retryable: false,
    });
    const { user } = mount(withCv(), { client });
    await user.upload(screen.getByLabelText(/Your CV/), pdf());
    await screen.findByText("That type of file cannot be uploaded.");
    expect(
      screen.queryByRole("button", { name: /Try again/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Choose another")).toBeInTheDocument();
  });

  it("removes an attached file, and sends none", async () => {
    const { user, submit } = mount(withCv());
    await fillIn(user);
    await user.upload(screen.getByLabelText(/Your CV/), pdf());
    await screen.findByTestId("cv-name");
    await user.click(screen.getByRole("button", { name: "Remove cv.pdf" }));
    expect(screen.queryByTestId("cv-name")).not.toBeInTheDocument();

    await send(user);
    await screen.findByText("Application sent");
    expect((submit.mock.calls[0]?.[0] as ApplyPayload).cv).toBeNull();
  });

  it("will not send while a file is still going up, and says so at the file", async () => {
    const { client, upload } = makeClient();
    upload.mockImplementation(() => new Promise<UploadOutcome>(() => {}));
    const { user, submit } = mount(withCv(), { client });
    await fillIn(user);
    await user.upload(screen.getByLabelText(/Your CV/), pdf());
    await screen.findByRole("progressbar");

    await send(user);
    expect(
      (await screen.findAllByText("Wait for this file to finish uploading."))
        .length,
    ).toBeGreaterThan(0);
    expect(submit).not.toHaveBeenCalled();
  });

  it("makes a required CV required, and a required file question too", async () => {
    const { user, submit } = mount(
      definition(
        [q({ id: "f", kind: "FILE", label: "Certificate", required: true })],
        {
          standard: { ...defaultDefinition().standard, cv: "REQUIRED" },
        },
      ),
    );
    await fillIn(user);
    await send(user);
    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent("Attach your CV.");
    expect(summary).toHaveTextContent("Attach a file.");
    expect(submit).not.toHaveBeenCalled();

    await user.click(within(summary).getByRole("link", { name: "Your CV" }));
    expect(screen.getByLabelText(/Your CV/)).toHaveFocus();
  });

  it("takes a covering letter as a file question, the same way", async () => {
    const { user, submit } = mount(
      definition([
        q({ id: "cl", kind: "FILE", label: "Your covering letter" }),
      ]),
    );
    await fillIn(user);
    await user.upload(
      screen.getByLabelText(/covering letter/i),
      pdf("letter.pdf"),
    );
    await screen.findByTestId("q-cl-name");
    await send(user);
    await screen.findByText("Application sent");
    expect(
      (submit.mock.calls[0]?.[0] as ApplyPayload).answers["cl"],
    ).toMatchObject({ name: "letter.pdf" });
  });
});

describe("the privacy notice", () => {
  const consenting = () =>
    definition([], {
      consent: {
        enabled: true,
        text: "We keep your application for a year.",
        url: "https://acme.example/privacy",
        ref: "custom-2",
      },
    });

  it("shows nothing when the company has not switched it on", () => {
    mount(defaultDefinition());
    expect(screen.queryByTestId("consent-text")).not.toBeInTheDocument();
  });

  it("links to the company's full policy when it gave one", () => {
    mount(consenting());
    expect(
      screen.getByRole("link", { name: "Read the full policy" }),
    ).toHaveAttribute("href", "https://acme.example/privacy");
  });

  it("shows the notice with its checkbox, and will not send until it is ticked", async () => {
    const { user, submit } = mount(consenting());
    expect(screen.getByTestId("consent-text")).toHaveTextContent(
      "We keep your application for a year.",
    );
    await fillIn(user);
    await send(user);

    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent(
      "Tick the box to say you agree, then send.",
    );
    expect(submit).not.toHaveBeenCalled();

    await user.click(screen.getByLabelText(/We keep your application/));
    await send(user);
    await screen.findByText("Application sent");
    expect((submit.mock.calls[0]?.[0] as ApplyPayload).consent).toEqual({
      text: "We keep your application for a year.",
      ref: "custom-2",
    });
  });
});

describe("what the API refuses, shown where it is about", () => {
  it("puts a server refusal of an answer at that question and in the summary", async () => {
    const { client, submit } = makeClient();
    submit.mockResolvedValueOnce(
      refused("invalid", { "answers.t": "That answer is not allowed." }),
    );
    const { user } = mount(
      definition([q({ id: "t", kind: "SHORT_TEXT", label: "Job title" })]),
      { client },
    );
    await fillIn(user);
    await user.type(screen.getByLabelText(/Job title/), "x");
    await send(user);

    expect(await screen.findByTestId("apply-error-summary")).toHaveFocus();
    expect(screen.getByLabelText(/Job title/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(/Job title/)).toHaveAccessibleDescription(
      "That answer is not allowed.",
    );
    expect(screen.getByLabelText(/First name/)).toHaveValue("Chioma");
  });

  it("understands the other spellings of a field the API may use", async () => {
    const { client, submit } = makeClient();
    submit.mockResolvedValueOnce(
      refused("invalid", {
        coverNote: "Too long.",
        cvKey: "That file is no longer there. Upload it again.",
      }),
    );
    const { user } = mount(defaultDefinition(), { client });
    await fillIn(user);
    await send(user);
    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent("Your note");
    expect(summary).toHaveTextContent("Your CV");
  });
});

describe("when the advert's form changes while somebody fills it in", () => {
  it("says so, asks the page to read the advert again, and keeps everything typed", async () => {
    const { client, submit } = makeClient();
    submit.mockResolvedValueOnce(
      refused("invalid", { "answers.q_added_later": "Answer this question." }),
    );
    const onFormChanged = vi.fn();
    const user = userEvent.setup();
    const first = definition([
      q({ id: "t", kind: "SHORT_TEXT", label: "Job title" }),
    ]);
    const view = render(
      <ApplyForm
        client={client}
        form={first}
        roleTitle="Payroll Analyst"
        company="Acme Ltd"
        onFormChanged={onFormChanged}
      />,
    );
    await fillIn(user);
    await user.type(screen.getByLabelText(/Job title/), "Payroll lead");
    await send(user);

    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent(
      "The form changed while you were filling it in",
    );
    expect(summary).not.toHaveTextContent("q_added_later");
    expect(onFormChanged).toHaveBeenCalledTimes(1);

    /* The page answers with the new form: the new question is there, and what
       was typed is still there beside it. */
    view.rerender(
      <ApplyForm
        client={client}
        form={definition([
          q({ id: "t", kind: "SHORT_TEXT", label: "Job title" }),
          q({
            id: "q_added_later",
            kind: "SHORT_TEXT",
            label: "Notice period",
            required: true,
          }),
        ])}
        roleTitle="Payroll Analyst"
        company="Acme Ltd"
        onFormChanged={onFormChanged}
      />,
    );
    expect(screen.getByLabelText(/Notice period/)).toBeRequired();
    expect(screen.getByLabelText(/First name/)).toHaveValue("Chioma");
    expect(screen.getByLabelText(/Job title/)).toHaveValue("Payroll lead");
  });

  it("still names the other fields the API objected to", async () => {
    const { client, submit } = makeClient();
    submit.mockResolvedValueOnce(
      refused("invalid", {
        "answers.q_added_later": "Answer this question.",
        phone: "Enter a phone number.",
      }),
    );
    const { user } = mount(defaultDefinition(), { client });
    await fillIn(user);
    await send(user);
    const summary = await screen.findByTestId("apply-error-summary");
    expect(summary).toHaveTextContent("The form changed");
    expect(summary).toHaveTextContent("Enter a phone number.");
  });
});

describe("the honeypot", () => {
  it("is untouched by a person filling in every visible box, and sent empty", async () => {
    const { user, submit } = mount(
      definition([q({ id: "t", kind: "SHORT_TEXT", label: "Job title" })]),
    );
    await fillIn(user);
    await user.type(screen.getByLabelText(/Job title/), "Analyst");
    const trap = screen
      .getByTestId("apply-honeypot")
      .querySelector("input") as HTMLInputElement;
    expect(trap.value).toBe("");
    await send(user);
    await screen.findByText("Application sent");
    expect((submit.mock.calls[0]?.[0] as ApplyPayload).extra).toEqual({
      faxNumber: "",
    });
  });

  it("is not a text box a screen reader or a tab key can reach, however many questions there are", async () => {
    const { user } = mount(
      definition([
        q({ id: "a", kind: "SHORT_TEXT", label: "One" }),
        q({ id: "b", kind: "LONG_TEXT", label: "Two", wordLimit: null }),
      ]),
    );
    expect(
      screen.getAllByRole("textbox").map((box) => box.getAttribute("name")),
    ).not.toContain("faxNumber");
    const trap = screen
      .getByTestId("apply-honeypot")
      .querySelector("input") as HTMLInputElement;
    for (let i = 0; i < 14; i += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(trap);
    }
  });
});

describe("where the visitor came from", () => {
  it("sends the link's source with the application", async () => {
    const { user, submit } = mount(defaultDefinition(), { src: "linkedin" });
    await fillIn(user);
    await send(user);
    await screen.findByText("Application sent");
    expect((submit.mock.calls[0]?.[0] as ApplyPayload).src).toBe("linkedin");
  });

  it("sends none when there was none", async () => {
    const { user, submit } = mount(defaultDefinition());
    await fillIn(user);
    await send(user);
    await screen.findByText("Application sent");
    expect((submit.mock.calls[0]?.[0] as ApplyPayload).src).toBeNull();
  });
});

describe("what the applicant is told after sending", () => {
  async function sentWith(result: Record<string, unknown>) {
    const { client, submit } = makeClient();
    submit.mockResolvedValueOnce(accepted(result));
    const { user } = mount(defaultDefinition(), { client });
    await fillIn(user);
    await send(user);
    await screen.findByText("Application sent");
    return screen.getByRole("status");
  }

  it("says a confirmation email should arrive only when the API says one is expected", async () => {
    const panel = await sentWith({
      reference: "APP-7K2M9Q",
      confirmationEmail: true,
    });
    expect(panel).toHaveTextContent(
      "A confirmation email should reach chioma@example.com in a few minutes",
    );
    expect(panel).not.toHaveTextContent(/has been sent|we have sent|we sent/i);
    expect(screen.getByTestId("apply-reference")).toHaveTextContent(
      "APP-7K2M9Q",
    );
  });

  it("makes no such promise when the API does not say one is expected", async () => {
    const panel = await sentWith({
      reference: "APP-7K2M9Q",
      confirmationEmail: false,
    });
    expect(panel).not.toHaveTextContent(/should reach/);
    expect(panel).toHaveTextContent("We have not sent a confirmation email");
    expect(panel).toHaveTextContent("chioma@example.com");
    expect(panel).toHaveTextContent("APP-7K2M9Q");
  });

  it("makes no promise when an older API sends no such field at all", async () => {
    const panel = await sentWith({ confirmationEmail: undefined });
    expect(panel).not.toHaveTextContent(/should reach/);
    expect(panel).toHaveTextContent("We have not sent a confirmation email");
  });

  it("shows a reference only when the API gave one", async () => {
    const panel = await sentWith({ reference: null });
    expect(panel).not.toHaveTextContent(/reference/i);
  });

  it("takes focus to the confirmation so a screen reader says it", async () => {
    await sentWith({});
    expect(
      screen.getByRole("heading", { name: "Application sent" }),
    ).toHaveFocus();
  });
});

describe("a preview and a demo send nothing and say so", () => {
  it("labels a preview, never claims an email, and lets you fill it in again", async () => {
    const { client, submit } = makeClient({ mode: "preview" });
    const { user } = mount(defaultDefinition(), { client });
    expect(screen.getByTestId("apply-mode-note")).toHaveTextContent(
      "Preview. This is what an applicant sees. Nothing you do here is sent or saved.",
    );
    await fillIn(user);
    await send(user);
    expect(
      await screen.findByRole("heading", {
        name: "This is what they see after sending",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).not.toHaveTextContent(/confirmation/i);
    expect(submit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Fill it in again" }));
    expect(screen.getByLabelText(/First name/)).toHaveValue("");
  });

  it("labels a demo upload as staying on the device", () => {
    const { client } = makeClient({ mode: "demo" });
    mount(defaultDefinition(), { client });
    expect(screen.getByTestId("apply-mode-note")).toHaveTextContent(/Demo\./);
    expect(
      screen.getByText(
        /Demo: the file stays on this device and is not stored\./,
      ),
    ).toBeInTheDocument();
  });
});
