import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiReviewDetail } from "@/lib/api/performance";
import { FinaliseDialog } from "@/app/(app)/performance/reviews/[id]/finalise-dialog";

/**
 * HR can add a recommendation as they make a rating final.
 *
 * The box is offered only where the caller says the reader is HR, because the API
 * refuses a recommendation from anybody else and leaves the rating not final: a
 * box everybody saw would be a box that could cost somebody their finalise. Who
 * will read it is the field's own help, behind its icon.
 */

const review = {
  id: "r-1",
  cycleName: "H2 2026 Appraisal",
  subjectName: "Femi Balogun",
  rating: null,
  overallMark: false,
} as unknown as ApiReviewDetail;

const mount = (
  props: {
    canRecommend?: boolean;
    open?: boolean;
    onConfirm?: (recommendation?: string) => Promise<{
      subjectNotified: boolean | undefined;
    } | null>;
  } = {},
) => {
  const onConfirm =
    props.onConfirm ??
    vi.fn<
      (
        recommendation?: string,
      ) => Promise<{ subjectNotified: boolean | undefined } | null>
    >(async () => ({ subjectNotified: true }));
  const view = render(
    <FinaliseDialog
      open={props.open ?? true}
      review={review}
      {...(props.canRecommend === undefined
        ? {}
        : { canRecommend: props.canRecommend })}
      onClose={() => {}}
      onConfirm={onConfirm}
    />,
  );
  return { onConfirm, view };
};

const box = () => screen.getByLabelText(/Your recommendation/);

afterEach(cleanup);

describe("who is offered the box", () => {
  it("offers it to HR, and says who reads it as the field's help", () => {
    mount({ canRecommend: true });
    expect(box()).toBeInTheDocument();
    expect(box()).toHaveAccessibleDescription(
      "Femi will read it with their rating.",
    );
    /* A tooltip, not a line under the box. */
    expect(
      screen
        .getByText("Femi will read it with their rating.")
        .closest(".sr-only"),
    ).not.toBeNull();
    expect(
      screen.getByText("Your recommendation (optional)"),
    ).toBeInTheDocument();
  });

  it("does not offer it to anybody else", () => {
    mount({ canRecommend: false });
    expect(screen.queryByLabelText(/Your recommendation/)).toBeNull();
    mount();
    expect(screen.queryByLabelText(/Your recommendation/)).toBeNull();
  });

  it("still says what making it final does", () => {
    mount({ canRecommend: true });
    expect(
      screen.getByText(/Femi will read the answers\. This cannot be changed\./),
    ).toBeInTheDocument();
  });
});

describe("what is sent", () => {
  it("sends what was typed, trimmed", async () => {
    const { onConfirm } = mount({ canRecommend: true });
    await userEvent.type(box(), "   Ready for the team lead role.  ");
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith("Ready for the team lead role.");
  });

  it("sends nothing at all when the box is empty, so 'no recommendation' is the absence of one", async () => {
    const { onConfirm } = mount({ canRecommend: true });
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("treats a box of spaces as empty", async () => {
    const { onConfirm } = mount({ canRecommend: true });
    await userEvent.type(box(), "     ");
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });

  it("never sends a recommendation for somebody who was not offered the box", async () => {
    const { onConfirm } = mount({ canRecommend: false });
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith(undefined);
  });
});

describe("the limit", () => {
  const LIMIT = 2000;

  it("is said before the press, with how far over, and holds the button", async () => {
    mount({ canRecommend: true });
    /* Pasted, because typing two thousand characters is a test of the keyboard. */
    await userEvent.click(box());
    await userEvent.paste("x".repeat(LIMIT + 7));
    expect(
      screen.getByText("That is 7 characters over. Keep it to 2,000."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Make it final" }),
    ).toBeDisabled();
  });

  it("lets exactly the limit through", async () => {
    const { onConfirm } = mount({ canRecommend: true });
    await userEvent.click(box());
    await userEvent.paste("x".repeat(LIMIT));
    expect(screen.queryByText(/characters over/)).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it("does not cut a paste short without a word", async () => {
    mount({ canRecommend: true });
    await userEvent.click(box());
    await userEvent.paste("y".repeat(LIMIT + 50));
    expect((box() as HTMLTextAreaElement).value).toHaveLength(LIMIT + 50);
  });
});

describe("a new form each time it is opened", () => {
  it("does not keep what was typed and cancelled", async () => {
    const { view, onConfirm } = mount({ canRecommend: true, open: true });
    await userEvent.type(box(), "A half-written thought");
    view.rerender(
      <FinaliseDialog
        open={false}
        review={review}
        canRecommend
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    view.rerender(
      <FinaliseDialog
        open
        review={review}
        canRecommend
        onClose={() => {}}
        onConfirm={onConfirm}
      />,
    );
    expect((box() as HTMLTextAreaElement).value).toBe("");
  });
});

describe("what the confirmation says", () => {
  it("is the title alone, whether or not a recommendation went", async () => {
    mount({ canRecommend: true });
    await userEvent.type(box(), "Ready for more.");
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Femi Balogun's rating is final",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/recommendation is saved/i)).toBeNull();
    expect(screen.queryByText(/cannot be changed/i)).toBeNull();
  });

  it("stays on its question when the write fails, with what was typed still there", async () => {
    const onConfirm = vi.fn(async () => null);
    mount({ canRecommend: true, onConfirm });
    await userEvent.type(box(), "Do not lose me");
    await userEvent.click(
      screen.getByRole("button", { name: "Make it final" }),
    );
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect((box() as HTMLTextAreaElement).value).toBe("Do not lose me");
    expect(screen.queryByText(/rating is final/)).toBeNull();
  });
});
