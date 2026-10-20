import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The page a stranger opens: the company's branding, the advert drawn safely, the
 * form the advert asked for, and what a search engine and a link preview read.
 * `fetch` is the only fake. The page components are async server components, so
 * each test awaits one and renders what it returned.
 */

const API = "https://api.example.test/api/v1";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/careers/acme/payroll-analyst",
}));

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/components/marketing/motion", () => ({
  Reveal: ({ children, as }: { children: React.ReactNode; as?: string }) => {
    const Tag = (as ?? "div") as "div";
    return <Tag>{children}</Tag>;
  },
}));

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const detail = (over: Record<string, unknown> = {}) => ({
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "Run payroll for four hundred people.",
  location: "Lagos",
  employmentType: "FULL_TIME",
  salaryMinKobo: null,
  salaryMaxKobo: null,
  closesOn: null,
  acceptingApplications: true,
  postedOn: "2026-10-01",
  company: "Acme Payroll",
  description: "You will own the monthly run.\n\nWhat you need:\n- Excel",
  descriptionHtml:
    "<p>You will <strong>own</strong> the monthly run.</p><ul><li>Excel</li><li>SQL</li></ul>",
  acceptsCv: true,
  captchaRequired: false,
  branding: {
    name: "Acme Payroll",
    logoUrl: "/api/v1/careers/public/acme/logo?v=abc",
    description: "We run payroll for companies that would rather not.",
    websiteUrl: "https://acme.example",
    accentColor: "#0b6e4f",
  },
  applicationForm: {
    version: 3,
    fields: { phone: "OPTIONAL", cv: "OPTIONAL", coverNote: "OFF" },
    questions: [
      {
        id: "q1",
        kind: "YES_NO",
        label: "Right to work in Nigeria?",
        helpText: null,
        required: true,
        maxWords: null,
        minValue: null,
        maxValue: null,
        choices: null,
      },
      {
        id: "q2",
        kind: "LONG_TEXT",
        label: "Why us?",
        helpText: "A few sentences.",
        required: false,
        maxWords: 50,
        minValue: null,
        maxValue: null,
        choices: null,
      },
    ],
    upload: {
      enabled: true,
      maxBytes: 26214400,
      contentTypes: ["application/pdf"],
    },
  },
  consent: {
    required: true,
    text: "Acme Payroll will keep your application for a year.",
    url: "https://acme.example/privacy",
    version: "default-1",
  },
  seo: {
    indexable: true,
    canonicalPath: "/acme/payroll-analyst",
    title: "Payroll Analyst at Acme Payroll",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Payroll Analyst",
      description: "<p>unused</p>",
      datePosted: "2026-10-01",
      employmentType: "FULL_TIME",
      hiringOrganization: {
        "@type": "Organization",
        name: "Acme Payroll",
        sameAs: "https://acme.example",
      },
      jobLocation: {
        "@type": "Place",
        address: {
          "@type": "PostalAddress",
          addressLocality: "Lagos",
          addressCountry: "NG",
        },
      },
      directApply: true,
    },
  },
  ...over,
});

let fetchMock: ReturnType<typeof vi.fn>;

async function pages() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", API);
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://approvehr.io");
  return {
    one: await import("@/app/(marketing)/careers/[org]/[role]/page"),
    list: await import("@/app/(marketing)/careers/[org]/page"),
  };
}

async function openRole(
  over: Record<string, unknown> = {},
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  fetchMock.mockResolvedValue(json(200, { data: detail(over) }));
  const { one } = await pages();
  const view = render(
    await one.default({
      params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
  return view;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the company on its own page", () => {
  it("opens with the company's name, a line about it and a link to its website", async () => {
    await openRole();
    const brand = within(screen.getByTestId("careers-brand"));
    expect(brand.getByText("Acme Payroll")).toBeInTheDocument();
    expect(
      brand.getByText("We run payroll for companies that would rather not."),
    ).toBeInTheDocument();
    const site = brand.getByRole("link", { name: "acme.example" });
    expect(site).toHaveAttribute("href", "https://acme.example");
    expect(site).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("draws the logo from the API's own address, with no referrer, and alt text that names the company", async () => {
    await openRole();
    const logo = screen.getByAltText("Acme Payroll logo");
    expect(logo).toHaveAttribute(
      "src",
      "https://api.example.test/api/v1/careers/public/acme/logo?v=abc",
    );
    expect(logo).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("will not draw a logo from anywhere but the API", async () => {
    await openRole({
      branding: {
        name: "Acme Payroll",
        logoUrl: "https://evil.example/pixel.png",
        description: null,
        websiteUrl: null,
        accentColor: null,
      },
    });
    expect(screen.queryByAltText("Acme Payroll logo")).not.toBeInTheDocument();
  });

  it("shows only the name when the company set nothing else", async () => {
    await openRole({ branding: undefined });
    const brand = within(screen.getByTestId("careers-brand"));
    expect(brand.getByText("Acme Payroll")).toBeInTheDocument();
    expect(brand.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByTestId("careers-accent")).not.toBeInTheDocument();
  });

  it("uses the accent colour as chosen for the rule, and a readable shade for the button", async () => {
    await openRole({
      branding: {
        name: "Acme Payroll",
        logoUrl: null,
        description: null,
        websiteUrl: null,
        accentColor: "#ffd700",
      },
    });
    expect(screen.getByTestId("careers-accent")).toHaveStyle({
      backgroundColor: "#ffd700",
    });
    const aside = screen.getByTestId("role-aside");
    const button = aside.style.getPropertyValue("--color-accent");
    expect(button).toMatch(/^#[0-9a-f]{6}$/);
    expect(button).not.toBe("#ffd700");
  });

  it("does not re-tint anything for a colour that is not a colour", async () => {
    await openRole({
      branding: {
        name: "Acme Payroll",
        logoUrl: null,
        description: null,
        websiteUrl: null,
        accentColor: "url(javascript:alert(1))",
      },
    });
    expect(screen.queryByTestId("careers-accent")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("role-aside").style.getPropertyValue("--color-accent"),
    ).toBe("");
  });
});

describe("the advert, drawn safely", () => {
  it("draws the description from the cleaned HTML as paragraphs, bold and a list", async () => {
    await openRole();
    const body = screen.getByTestId("rich-text");
    expect(
      within(body).getByText("own", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      within(body)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Excel", "SQL"]);
  });

  it("drops a script and a handler that came through anyway", async () => {
    await openRole({
      descriptionHtml:
        '<p onclick="steal()">Hello</p><script>window.hacked=1</script><img src=x onerror="steal()"><a href="javascript:alert(1)">click</a>',
    });
    const body = screen.getByTestId("rich-text");
    expect(body.innerHTML).not.toContain("<script");
    expect(body.innerHTML).not.toContain("onclick");
    expect(body.innerHTML).not.toContain("javascript:");
    expect(body.querySelector("img")).toBeNull();
    expect(body.textContent).toBe("Helloclick");
  });

  it("keeps the plain words, line breaks and all, for an API that sends no HTML", async () => {
    await openRole({ descriptionHtml: undefined });
    expect(screen.queryByTestId("rich-text")).not.toBeInTheDocument();
    expect(screen.getByText(/You will own the monthly run\./)).toHaveClass(
      "whitespace-pre-line",
    );
  });
});

describe("the form the advert asked for", () => {
  it("draws the advert's own questions, in order, with the notice and its link", async () => {
    await openRole();
    expect(
      screen.getByRole("group", { name: /Right to work in Nigeria\?/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Why us\?/)).toHaveAccessibleDescription(
      /A few sentences\./,
    );
    expect(screen.getByTestId("q-q2-count")).toHaveTextContent("0 of 50 words");
    expect(screen.getByTestId("consent-text")).toHaveTextContent(
      "Acme Payroll will keep your application for a year.",
    );
    expect(
      screen.getByRole("link", { name: "Read the full policy" }),
    ).toHaveAttribute("href", "https://acme.example/privacy");
  });

  it("follows the advert's switches: no note box, a CV box because a bucket is set up", async () => {
    await openRole();
    expect(screen.queryByLabelText(/Anything else/)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeNull();
  });

  it("draws no file box where the API has no bucket, even if the advert would take a CV", async () => {
    await openRole({
      acceptsCv: false,
      applicationForm: {
        ...detail().applicationForm,
        fields: { phone: "OPTIONAL", cv: "OFF", coverNote: "OPTIONAL" },
        upload: { enabled: false, maxBytes: 0, contentTypes: [] },
      },
    });
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("asks for no notice when the company has not switched it on", async () => {
    await openRole({
      consent: { required: false, text: "x", url: null, version: "default-1" },
    });
    expect(screen.queryByTestId("consent-text")).not.toBeInTheDocument();
  });

  it("sends the visitor's ?src= with the application, cleaned, and the notice version they saw", async () => {
    const user = userEvent.setup();
    await openRole({}, { src: "linkedin" });
    fetchMock.mockResolvedValueOnce(
      json(201, {
        data: {
          id: "1",
          company: "Acme Payroll",
          postingTitle: "Payroll Analyst",
          note: "Acme Payroll has your application for Payroll Analyst.",
          cvNote: null,
          reference: "APP-7K2M9Q3X",
          confirmationEmail: true,
        },
      }),
    );
    await user.type(screen.getByLabelText(/First name/), "Chioma");
    await user.type(screen.getByLabelText(/Surname/), "Aduba");
    await user.type(screen.getByLabelText(/^Email/), "chioma@example.com");
    await user.click(
      within(
        screen.getByRole("group", { name: /Right to work/ }),
      ).getByLabelText("Yes"),
    );
    await user.click(screen.getByLabelText(/Acme Payroll will keep/));
    await user.click(screen.getByRole("button", { name: /Send application/ }));

    await screen.findByText("Application sent");
    const [url, init] = fetchMock.mock.calls.at(-1) as [
      string,
      { body: string },
    ];
    expect(url).toBe(`${API}/careers/public/acme/payroll-analyst/apply`);
    expect(JSON.parse(init.body)).toMatchObject({
      src: "linkedin",
      consent: true,
      consentVersion: "default-1",
      answers: { q1: "yes" },
      faxNumber: "",
    });
    expect(screen.getByTestId("apply-reference")).toHaveTextContent(
      "APP-7K2M9Q3X",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "A confirmation email should reach chioma@example.com",
    );
  });

  it("sends the utm values on the link beside the source, and nothing it was not given", async () => {
    const user = userEvent.setup();
    await openRole(
      {
        consent: { required: false, text: "", url: null, version: "x" },
        applicationForm: { ...detail().applicationForm, questions: [] },
      },
      { src: "x", utm_source: "newsletter", utm_campaign: "autumn" },
    );
    fetchMock.mockResolvedValueOnce(
      json(201, {
        data: {
          id: "1",
          company: "Acme",
          postingTitle: "P",
          note: "ok",
          cvNote: null,
          reference: null,
          confirmationEmail: false,
        },
      }),
    );
    await user.type(screen.getByLabelText(/First name/), "A");
    await user.type(screen.getByLabelText(/Surname/), "B");
    await user.type(screen.getByLabelText(/^Email/), "a@b.co");
    await user.click(screen.getByRole("button", { name: /Send application/ }));
    await screen.findByText("Application sent");
    const body = JSON.parse(
      (fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body,
    );
    expect(body.src).toBe("x");
    expect(body.utm).toEqual({ source: "newsletter", campaign: "autumn" });
  });

  it("takes the first of several ?src= values and ignores a hostile one's control characters", async () => {
    const user = userEvent.setup();
    await openRole(
      {
        consent: { required: false, text: "", url: null, version: "x" },
        applicationForm: { ...detail().applicationForm, questions: [] },
      },
      {
        src: ["whatsapp\u0007\u0000", "second"],
      },
    );
    fetchMock.mockResolvedValueOnce(
      json(201, {
        data: {
          id: "1",
          company: "Acme",
          postingTitle: "P",
          note: "ok",
          cvNote: null,
          reference: null,
          confirmationEmail: false,
        },
      }),
    );
    await user.type(screen.getByLabelText(/First name/), "A");
    await user.type(screen.getByLabelText(/Surname/), "B");
    await user.type(screen.getByLabelText(/^Email/), "a@b.co");
    await user.click(screen.getByRole("button", { name: /Send application/ }));
    await screen.findByText("Application sent");
    expect(
      JSON.parse((fetchMock.mock.calls.at(-1)?.[1] as { body: string }).body)
        .src,
    ).toBe("whatsapp");
  });
});

describe("what a search engine reads", () => {
  const ld = (container: HTMLElement) => {
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    return script
      ? (JSON.parse(script.textContent ?? "{}") as Record<string, unknown>)
      : null;
  };

  it("puts a JobPosting on the page, with the page's own address, an identifier and the logo", async () => {
    const { container } = await openRole();
    const data = ld(container);
    expect(data).toMatchObject({
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: "Payroll Analyst",
      url: "https://approvehr.io/careers/acme/payroll-analyst",
      identifier: {
        "@type": "PropertyValue",
        name: "Acme Payroll",
        value: "payroll-analyst",
      },
      directApply: true,
    });
    expect(data?.["hiringOrganization"]).toMatchObject({
      name: "Acme Payroll",
      logo: "https://api.example.test/api/v1/careers/public/acme/logo?v=abc",
    });
  });

  it("describes the advert in cleaned HTML, never the API's string as sent, and never a script", async () => {
    const { container } = await openRole({
      descriptionHtml:
        "<p>Run the <strong>payroll</strong>.</p><script>alert(1)</script>",
    });
    const description = String(ld(container)?.["description"]);
    expect(description).toBe("<p>Run the <strong>payroll</strong>.</p>");
  });

  it("cannot be closed early by a title that contains a script tag", async () => {
    const { container } = await openRole({
      seo: {
        ...detail().seo,
        jsonLd: {
          ...detail().seo.jsonLd,
          title: "</script><script>alert(1)</script>",
        },
      },
    });
    const script = container.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script?.textContent).not.toContain("</script>");
    expect(container.querySelectorAll("script")).toHaveLength(1);
    expect(JSON.parse(script?.textContent ?? "{}").title).toBe(
      "</script><script>alert(1)</script>",
    );
  });

  it("states no salary: the API gives none, and a figure with no period is worse than none", async () => {
    const { container } = await openRole({
      salaryMinKobo: 45_000_000,
      salaryMaxKobo: 65_000_000,
    });
    expect(JSON.stringify(ld(container))).not.toMatch(
      /baseSalary|45000000|450000/,
    );
  });

  it("puts none on a closed advert, which stays readable", async () => {
    const { container } = await openRole({
      acceptingApplications: false,
      closesOn: "2026-09-01",
    });
    expect(ld(container)).toBeNull();
    expect(screen.getByText("Applications have closed")).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("puts none where the API sent no search data", async () => {
    const { container } = await openRole({ seo: undefined });
    expect(ld(container)).toBeNull();
  });

  it("gives a link preview its title, description, canonical address and company", async () => {
    fetchMock.mockResolvedValue(json(200, { data: detail() }));
    const { one } = await pages();
    const meta = await one.generateMetadata({
      params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
    });
    expect(meta.title).toBe("Payroll Analyst at Acme Payroll");
    expect(meta.description).toBe("Run payroll for four hundred people.");
    expect(meta.alternates?.canonical).toBe(
      "https://approvehr.io/careers/acme/payroll-analyst",
    );
    expect(meta.openGraph).toMatchObject({
      type: "website",
      title: "Payroll Analyst at Acme Payroll",
      url: "https://approvehr.io/careers/acme/payroll-analyst",
      siteName: "Acme Payroll",
    });
    expect(meta.twitter).toMatchObject({ card: "summary" });
    expect(meta.robots).toBeUndefined();
  });

  it("asks search engines to stay away when the company said so, or the advert has closed", async () => {
    const { one } = await pages();
    fetchMock.mockResolvedValue(
      json(200, {
        data: detail({ seo: { ...detail().seo, indexable: false } }),
      }),
    );
    expect(
      (
        await one.generateMetadata({
          params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
        })
      ).robots,
    ).toEqual({ index: false, follow: true });

    const closed = await pages();
    fetchMock.mockResolvedValue(
      json(200, { data: detail({ acceptingApplications: false }) }),
    );
    expect(
      (
        await closed.one.generateMetadata({
          params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
        })
      ).robots,
    ).toEqual({ index: false, follow: true });
  });

  it("offers the company's logo as the preview image, and no image when it has none", async () => {
    fetchMock.mockResolvedValue(json(200, { data: detail() }));
    const { one } = await pages();
    const withLogo = await one.generateMetadata({
      params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
    });
    expect(withLogo.openGraph).toMatchObject({
      images: [
        {
          url: "https://api.example.test/api/v1/careers/public/acme/logo?v=abc",
          alt: "Acme Payroll logo",
        },
      ],
    });

    fetchMock.mockResolvedValue(
      json(200, {
        data: detail({ branding: { ...detail().branding, logoUrl: null } }),
      }),
    );
    const bare = await (
      await pages()
    ).one.generateMetadata({
      params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
    });
    expect(bare.openGraph).not.toHaveProperty("images");
  });

  it("falls back to a plain title for an API that sends no search data", async () => {
    fetchMock.mockResolvedValue(
      json(200, { data: detail({ seo: undefined }) }),
    );
    const { one } = await pages();
    const meta = await one.generateMetadata({
      params: Promise.resolve({ org: "acme", role: "payroll-analyst" }),
    });
    expect(meta.title).toBe("Payroll Analyst, Acme Payroll");
  });
});

describe("the company's list of roles", () => {
  const roles = [
    {
      slug: "payroll-analyst",
      title: "Payroll Analyst",
      summary: "Run payroll.",
      location: "Lagos",
      employmentType: "FULL_TIME",
      salaryMinKobo: null,
      salaryMaxKobo: null,
      closesOn: null,
      acceptingApplications: true,
      postedOn: "2026-10-01",
    },
  ];

  it("opens with the company's brand when the API names it, and lists the roles", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        data: roles,
        meta: {
          total: 1,
          company: "Acme Payroll",
          branding: {
            name: "Acme Payroll",
            logoUrl: null,
            description: "Payroll people.",
            websiteUrl: null,
            accentColor: null,
          },
        },
      }),
    );
    const { list } = await pages();
    render(await list.default({ params: Promise.resolve({ org: "acme" }) }));
    expect(
      within(screen.getByTestId("careers-brand")).getByText("Acme Payroll"),
    ).toBeInTheDocument();
    expect(screen.getByText("Payroll people.")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Payroll Analyst" }),
    ).toBeInTheDocument();
  });

  it("does not guess a company's name when the API does not say it", async () => {
    fetchMock.mockResolvedValue(json(200, { data: roles, meta: { total: 1 } }));
    const { list } = await pages();
    render(
      await list.default({ params: Promise.resolve({ org: "acme-ltd" }) }),
    );
    expect(screen.queryByTestId("careers-brand")).not.toBeInTheDocument();
    expect(screen.queryByText(/acme-ltd/i)).not.toBeInTheDocument();
  });
});
