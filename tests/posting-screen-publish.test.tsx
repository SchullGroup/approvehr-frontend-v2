import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { ApiForm, ApiFormQuestion } from "@/lib/api/careers";

/**
 * An advert can be published from its own page (UAT 23 Nov, U99 / PERF-19). The
 * page used to say it could only be published "from Job adverts".
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/hiring/postings/post-1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/api/client", async (original) => {
  const real = await original<typeof import("@/lib/api/client")>();
  return { ...real, tokens: { ...real.tokens, has: () => true } };
});

vi.mock("@/lib/permissions", () => ({
  usePermissions: () => ({ can: () => true, loading: false }),
  useCan: () => true,
}));

const getPosting = vi.fn();
const getForm = vi.fn();
const putForm = vi.fn();
const getSettings = vi.fn();
const shareLinks = vi.fn();
const publishPosting = vi.fn();

vi.mock("@/lib/api/careers", async (original) => {
  const real = await original<typeof import("@/lib/api/careers")>();
  return {
    ...real,
    careersApi: {
      ...real.careersApi,
      getPosting: (...a: unknown[]) => getPosting(...a),
      getForm: (...a: unknown[]) => getForm(...a),
      putForm: (...a: unknown[]) => putForm(...a),
      getSettings: (...a: unknown[]) => getSettings(...a),
      shareLinks: (...a: unknown[]) => shareLinks(...a),
      publishPosting: (...a: unknown[]) => publishPosting(...a),
    },
  };
});

const { PostingScreen } =
  await import("@/app/(app)/hiring/postings/[id]/posting-screen");

const Q1 = "0198c0de-0000-7000-8000-000000000001";
const Q2 = "0198c0de-0000-7000-8000-000000000002";
const NEW = "0198c0de-0000-7000-8000-000000000003";

const apiQ = (over: Partial<ApiFormQuestion> = {}): ApiFormQuestion => ({
  id: Q1,
  order: 0,
  kind: "YES_NO",
  label: "Right to work in Nigeria?",
  helpText: null,
  required: true,
  maxWords: null,
  minValue: null,
  maxValue: null,
  choices: null,
  knockout: { flagWhen: false },
  origin: null,
  answerCount: 7,
  ...over,
});

const form = (
  questions: ApiFormQuestion[] = [
    apiQ(),
    apiQ({
      id: Q2,
      kind: "SHORT_TEXT",
      label: "Job title",
      required: false,
      knockout: null,
      answerCount: 0,
    }),
  ],
): ApiForm => ({
  postingId: "post-1",
  formVersion: 4,
  applications: 7,
  settings: {
    phoneMode: "OPTIONAL",
    cvMode: "OPTIONAL",
    coverNoteMode: "OPTIONAL",
  },
  questions,
  limits: {
    maxQuestions: 20,
    maxFileQuestions: 3,
    maxChoices: 30,
    labelChars: 300,
    helpTextChars: 500,
    choiceLabelChars: 120,
    longTextMaxWords: 1000,
  },
  kinds: [],
});

const settings = (over: Record<string, unknown> = {}) => ({
  branding: {
    displayName: null,
    name: "Acme Ltd",
    companyName: "Acme Ltd",
    description: null,
    websiteUrl: null,
    accentColor: null,
    logoUrl: null,
  },
  contact: { replyToEmail: null },
  consent: {
    required: true,
    text: "We keep it.",
    customText: null,
    url: null,
    version: "default-1",
    isDefault: true,
    needsReview: true,
    reviewNote: null,
    standardText: "",
  },
  acknowledgement: { enabled: true, willSend: false, blockedBy: [] },
  search: { indexable: true },
  deployment: { fileUploads: true },
  ...over,
});

const posting = (over: Record<string, unknown> = {}) => ({
  id: "post-1",
  slug: "payroll-analyst",
  title: "Payroll Analyst",
  summary: "Run payroll.",
  description: "Run payroll for four hundred people every month.",
  descriptionHtml: null,
  location: "Lagos",
  employmentType: "FULL_TIME",
  showSalary: false,
  salaryMinKobo: null,
  salaryMaxKobo: null,
  status: "PUBLISHED",
  publishedAt: "2026-10-01T09:00:00.000Z",
  closesOn: null,
  acceptingApplications: true,
  requisitionId: null,
  requisitionReference: null,
  requisitionStatus: null,
  applicationCount: 7,
  publicPath: "/acme/payroll-analyst",
  createdAt: "2026-10-01T09:00:00.000Z",
  applications: { waiting: 1, advanced: 0, declined: 0, withdrawn: 0 },
  ...over,
});

const links = (live = true) => ({
  postingId: "post-1",
  live,
  page: "https://approvehr.io/careers/acme/payroll-analyst",
  links: [
    {
      channel: "careers-page",
      label: "Your careers page",
      url: "https://approvehr.io/careers/acme/payroll-analyst?src=careers-page",
      shareUrl: null,
    },
    {
      channel: "linkedin",
      label: "LinkedIn",
      url: "https://approvehr.io/careers/acme/payroll-analyst?src=linkedin",
      shareUrl: "https://www.linkedin.com/sharing/share-offsite/?url=x",
    },
  ],
});

const mount = () =>
  render(
    <ToastProvider>
      <PostingScreen id="post-1" />
    </ToastProvider>,
  );

const cards = () => screen.getAllByTestId("form-question");

beforeEach(() => {
  for (const fn of [
    getPosting,
    getForm,
    putForm,
    getSettings,
    shareLinks,
    publishPosting,
  ])
    fn.mockReset();
  getPosting.mockResolvedValue(
    posting({
      status: "DRAFT",
      publishedAt: null,
      acceptingApplications: false,
    }),
  );
  getForm.mockResolvedValue(form());
  getSettings.mockResolvedValue(settings());
  shareLinks.mockResolvedValue(links());
});

describe("publishing from the advert", () => {
  it("offers Publish on a draft, asks first, then publishes this advert", async () => {
    publishPosting.mockResolvedValue(posting());
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    expect(publishPosting).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Run payroll for four hundred people every month.",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Publish it" }),
    );
    await waitFor(() => expect(publishPosting).toHaveBeenCalledWith("post-1"));
    expect(
      await screen.findByText("Payroll Analyst is live"),
    ).toBeInTheDocument();
  });

  it("no longer sends somebody to Job adverts to publish", async () => {
    mount();
    await screen.findByRole("button", { name: "Publish" });
    expect(screen.queryByText(/published from/)).toBeNull();
  });

  it("says why it was refused, in the server's words", async () => {
    publishPosting.mockRejectedValue(
      new ApiError(409, "conflict", "The role is not approved yet."),
    );
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    await user.click(screen.getByRole("button", { name: "Publish it" }));
    expect(
      await screen.findByText("The role is not approved yet."),
    ).toBeInTheDocument();
  });

  it("is not offered on a live advert", async () => {
    getPosting.mockResolvedValue(posting());
    mount();
    await screen.findByText(/It is live at/);
    expect(screen.queryByRole("button", { name: "Publish" })).toBeNull();
  });
});
