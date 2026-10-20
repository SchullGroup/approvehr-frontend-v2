import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";

/**
 * An advert's screen in a demo workspace: no API, so the form lives in this
 * browser, and says so. The share links, the builder, the preview and the guard
 * against leaving with unsaved work all work against the seeded adverts.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/hiring/postings/demo-advert-req-01",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

const ID = "demo-advert-req-01";

const { PostingScreen } =
  await import("@/app/(app)/hiring/postings/[id]/posting-screen");

const mount = (id = ID) =>
  render(
    <ToastProvider>
      <PostingScreen id={id} />
    </ToastProvider>,
  );

const questionCards = () => screen.getAllByTestId("form-question");

describe("the advert's screen", () => {
  it("names the advert, says it is demo data, and keeps the form in this browser", async () => {
    mount();
    expect(
      await screen.findByRole("heading", {
        name: "Senior Backend Engineer",
        level: 1,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Demo data, this browser only").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByText(/kept on this device and are not published anywhere/),
    ).toBeInTheDocument();
  });

  it("says an advert that is not there is not there", async () => {
    mount("no-such-advert");
    expect(
      await screen.findByText("That advert is not here"),
    ).toBeInTheDocument();
  });

  it("links to the advert's applications and to a preview", async () => {
    mount();
    await screen.findByRole("heading", {
      name: "Senior Backend Engineer",
      level: 1,
    });
    expect(screen.getByRole("link", { name: /Applications/ })).toHaveAttribute(
      "href",
      expect.stringContaining(`posting=${ID}`),
    );
    expect(
      screen.getByRole("link", { name: /Preview as an applicant/ }),
    ).toHaveAttribute("href", `/hiring/postings/${ID}/preview`);
  });
});

describe("the links to share", () => {
  it("lists a tagged link for every place, each ending ?src=<place>", async () => {
    mount();
    const links = await screen.findAllByTestId("share-link");
    const urls = links.map(
      (li) => li.querySelector("p.tabular")?.textContent ?? "",
    );
    expect(urls).toHaveLength(6);
    const wanted = [
      "careers-page",
      "linkedin",
      "x",
      "whatsapp",
      "facebook",
      "email",
    ];
    wanted.forEach((channel, i) => {
      expect(urls[i]).toMatch(
        new RegExp(
          `/careers/schull-technologies/senior-backend-engineer\\?src=${channel}$`,
        ),
      );
    });
  });

  it("copies exactly the link shown, and says it has", async () => {
    const user = userEvent.setup();
    mount();
    const [first, linkedin] = await screen.findAllByTestId("share-link");
    expect(first).toBeDefined();
    await user.click(
      within(linkedin!).getByRole("button", { name: "Copy the LinkedIn link" }),
    );
    /* `userEvent.setup()` stands in for the clipboard; read what was written. */
    const copied = await navigator.clipboard.readText();
    expect(copied).toBe(linkedin?.querySelector("p.tabular")?.textContent);
    expect(copied).toMatch(/\?src=linkedin$/);
    expect(
      within(linkedin!).getByRole("button", { name: "Copy the LinkedIn link" }),
    ).toHaveTextContent("Copied");
  });

  it("shows the link to select when the browser will not let the page copy", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn(async () => {
          throw new Error("denied");
        }),
      },
    });
    mount();
    const [, linkedin] = await screen.findAllByTestId("share-link");
    await user.click(
      within(linkedin!).getByRole("button", { name: "Copy the LinkedIn link" }),
    );
    expect(
      await screen.findByText(/Your browser would not copy it/),
    ).toBeInTheDocument();
  });

  it("adds a link for another place by name, tidied, and refuses a blank one", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("share-link");
    await user.type(screen.getByLabelText("Another place"), "Campus Group!");
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    const links = screen.getAllByTestId("share-link");
    expect(links).toHaveLength(7);
    expect(links[6]?.textContent).toMatch(/campus-group/);
    expect(links[6]?.querySelector("p.tabular")?.textContent).toMatch(
      /\?src=campus-group$/,
    );

    await user.type(screen.getByLabelText("Another place"), "   ");
    await user.click(screen.getByRole("button", { name: "Add a link" }));
    expect(
      screen.getByText("Name the place, like jobberman or campus."),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId("share-link")).toHaveLength(7);
  });

  it("says the links open to nothing while the advert is a draft", async () => {
    mount("demo-advert-req-04");
    expect(
      await screen.findByText(/will open to nothing until it is published/),
    ).toBeInTheDocument();
  });
});

describe("the form, edited and saved in this browser", () => {
  it("loads the seeded questions in order", async () => {
    mount();
    await screen.findAllByTestId("form-question");
    expect(
      questionCards().map((card) =>
        within(card)
          .getByLabelText(/^Question/)
          .getAttribute("value"),
      ),
    ).toEqual([
      "Do you have the right to work in Nigeria?",
      "How many years have you worked in this field?",
      "How soon could you start?",
      "Why do you want this job?",
      "A link to your work or your LinkedIn profile",
    ]);
  });

  it("marks the form unsaved as soon as it is edited, and Save clears it", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    expect(screen.getByRole("button", { name: /Save form/ })).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Move question 2 up" }),
    );
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Save form/ })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /Save form/ }));
    await waitFor(() =>
      expect(screen.queryAllByText("Unsaved changes")).toHaveLength(0),
    );
    expect(within(questionCards()[0]!).getByLabelText(/^Question/)).toHaveValue(
      "How many years have you worked in this field?",
    );
  });

  it("refuses to save a question that is not finished, and marks it", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    const first = within(questionCards()[0]!).getByLabelText(/^Question/);
    await user.clear(first);
    await user.click(screen.getByRole("button", { name: /Save form/ }));
    expect(await screen.findByText("Write the question.")).toBeInTheDocument();
    expect(first).toHaveAttribute("aria-invalid", "true");
    expect(screen.getAllByText("Unsaved changes").length).toBeGreaterThan(0);
  });

  it("throws changes away on Discard, after asking", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    await user.click(screen.getByRole("button", { name: "Delete question 1" }));
    expect(questionCards()).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(
      await screen.findByRole("button", { name: "Discard changes" }),
    );
    await waitFor(() => expect(questionCards()).toHaveLength(5));
    expect(screen.queryAllByText("Unsaved changes")).toHaveLength(0);
  });

  it("shows an applicant's view beside the editor that changes as the editor does", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    const preview = within(screen.getByTestId("form-preview"));
    expect(preview.getByText("Why do you want this job?")).toBeInTheDocument();
    expect(preview.getByTestId("q-demo-q-why-count")).toHaveTextContent(
      "0 of 120 words",
    );

    const limit = within(questionCards()[3]!).getByLabelText("Most words");
    await user.clear(limit);
    await user.type(limit, "60");
    expect(preview.getByTestId("q-demo-q-why-count")).toHaveTextContent(
      "0 of 60 words",
    );
  });
});

describe("leaving with unsaved work", () => {
  const leave = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("asks the browser to confirm only while there is something to lose", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findAllByTestId("form-question");
    expect(leave()).toBe(false);

    await user.click(
      screen.getByRole("button", { name: "Move question 2 up" }),
    );
    expect(leave()).toBe(true);

    await user.click(screen.getByRole("button", { name: /Save form/ }));
    await waitFor(() => expect(leave()).toBe(false));
  });

  it("stops a click on a link inside the app unless the person confirms", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    mount();
    await screen.findAllByTestId("form-question");
    await user.click(
      screen.getByRole("button", { name: "Move question 2 up" }),
    );

    const link = screen.getByRole("link", { name: /Applications/ });
    let navigated = 0;
    link.addEventListener("click", (event) => {
      if (!event.defaultPrevented) navigated += 1;
      event.preventDefault();
    });

    confirm.mockReturnValueOnce(false);
    await user.click(link);
    expect(confirm).toHaveBeenCalledWith(
      "You have unsaved changes. Leave without saving them?",
    );
    expect(navigated).toBe(0);

    confirm.mockReturnValueOnce(true);
    await user.click(link);
    expect(navigated).toBe(1);
    confirm.mockRestore();
  });

  it("does not stop a click on a link when nothing is unsaved", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm");
    mount();
    await screen.findAllByTestId("form-question");
    const link = screen.getByRole("link", { name: /Applications/ });
    link.addEventListener("click", (event) => event.preventDefault());
    await user.click(link);
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
    await act(async () => {});
  });
});
