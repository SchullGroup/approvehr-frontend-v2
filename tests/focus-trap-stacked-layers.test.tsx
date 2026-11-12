import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  Button,
  Drawer,
  Modal,
  SearchPicker,
  type PickerOption,
} from "@/components/ui";
import { __scrollLockDepth } from "@/hooks/use-focus-trap";

/**
 * Which open layer owns Tab and Escape.
 *
 * Every open `Modal` and `Drawer` puts its own listener on `document`, and for a
 * long time nothing decided which of them should act. With a dialog open over a
 * side panel (the leave screen's "Decline" inside a request) or over another
 * dialog (the performance screens), both acted on every key:
 *
 * - **Tab.** The panel saw focus outside itself and pulled it in, then the
 *   dialog saw focus outside itself and pulled it back. Both call
 *   `preventDefault`, so the browser never moved focus at all: Tab landed on the
 *   dialog's first control every time and Shift+Tab on its last. The reason box
 *   and the buttons after it could not be reached from the keyboard.
 * - **Escape.** Both called their `onClose`, because `stopPropagation()` on one
 *   `document` listener does not stop another on the same node. One press closed
 *   the dialog and the panel under it, and whatever was in the panel went too.
 *
 * What is pinned here is who owns the keyboard, and that handing it back works:
 * the layer that opened last acts and the ones under it do not, whatever order
 * they are torn down in, and the page scrolls again once the last one is gone.
 * What a single layer does on its own is in the last block, so that "exactly as
 * before" is a claim with tests under it. The picker's own Escape rule is
 * covered for one layer in `search-picker.test.tsx` and for a stack below.
 *
 * ## The `offsetParent` stub
 *
 * The trap decides what is tabbable from `offsetParent`, which jsdom answers
 * with `null` for everything, so it finds nothing and swallows every Tab. That
 * is why the older dialog tests walk around Tab altogether. A browser answers
 * with the parent for anything that is rendered, so this does too, and the trap
 * runs for real: the real `Drawer` and `Modal`, a real Tab through `user-event`.
 */

const realOffsetParent = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "offsetParent",
);

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.isConnected ? (this.parentElement ?? document.body) : null;
    },
  });
});

afterAll(() => {
  if (realOffsetParent) {
    Object.defineProperty(
      HTMLElement.prototype,
      "offsetParent",
      realOffsetParent,
    );
  }
});

afterEach(() => {
  /* A test that fails with a layer still open must not leave the next one
     starting on a locked page. */
  document.body.style.overflow = "";
});

const DRAWER = "Leave request";
const MODAL = "Why are you declining?";

/** Where the dialog is written in the tree, which decides nothing about which one is on top. */
type Arrangement = "inside" | "after" | "before";

const ARRANGEMENTS: [string, Arrangement][] = [
  ["the dialog written inside the panel", "inside"],
  ["the dialog written after the panel", "after"],
  ["the dialog written before the panel", "before"],
];

const noop = () => undefined;

const ADA: PickerOption = { value: "a", label: "Ada Obi" };
const BOLA: PickerOption = { value: "b", label: "Bola Eze" };

type LayersProps = {
  arrangement?: Arrangement;
  drawerOpen?: boolean;
  modalOpen?: boolean;
  dismissible?: boolean;
  withPicker?: boolean;
  onOpenModal?: () => void;
  onDrawerClose?: () => void;
  onModalClose?: () => void;
};

/**
 * A panel with a dialog over it, controlled from outside so a test can open and
 * close either one in either order.
 *
 * The panel holds "Decline" and "Approve"; the dialog holds a reason box and
 * Cancel and Send. Each also has its own close control, which is what makes
 * "the first control" and "the last control" a different thing in each.
 */
function Layers({
  arrangement = "after",
  drawerOpen = true,
  modalOpen = false,
  dismissible = true,
  withPicker = false,
  onOpenModal = noop,
  onDrawerClose = noop,
  onModalClose = noop,
}: LayersProps) {
  const modal = (
    <Modal
      open={modalOpen}
      onClose={onModalClose}
      dismissible={dismissible}
      title={MODAL}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onModalClose}>
            Cancel
          </Button>
          <Button type="button">Send</Button>
        </>
      }
    >
      <textarea aria-label="Reason" />
      {withPicker ? (
        <SearchPicker
          aria-label="Who"
          selected={null}
          onSelect={noop}
          onQueryChange={noop}
          options={[ADA, BOLA]}
        />
      ) : null}
    </Modal>
  );

  return (
    <>
      <button type="button">Page behind</button>
      {arrangement === "before" ? modal : null}
      <Drawer open={drawerOpen} onClose={onDrawerClose} title={DRAWER}>
        <Button type="button" onClick={onOpenModal}>
          Decline
        </Button>
        <Button type="button">Approve</Button>
        {arrangement === "inside" ? modal : null}
      </Drawer>
      {arrangement === "after" ? modal : null}
    </>
  );
}

/** The same, with the state a screen would hold: "Decline" opens the dialog, closing either one shuts it. */
function Screen({
  onDrawerClose = noop,
  onModalClose = noop,
  ...rest
}: Omit<LayersProps, "drawerOpen" | "modalOpen" | "onOpenModal">) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <Layers
      {...rest}
      drawerOpen={drawerOpen}
      modalOpen={modalOpen}
      onOpenModal={() => setModalOpen(true)}
      onDrawerClose={() => {
        onDrawerClose();
        setDrawerOpen(false);
      }}
      onModalClose={() => {
        onModalClose();
        setModalOpen(false);
      }}
    />
  );
}

const dialog = (name: string) => screen.queryByRole("dialog", { name });
const button = (name: string) => screen.getByRole("button", { name });
const focused = () => document.activeElement as HTMLElement;
/** A layer stays in the document for its exit animation after it has closed. */
const gone = (name: string) => waitFor(() => expect(dialog(name)).toBeNull());

describe("a dialog open over a panel", () => {
  it.each(ARRANGEMENTS)(
    "keeps Tab inside the dialog, from the reason box to the last control and round again (%s)",
    async (_name, arrangement) => {
      const user = userEvent.setup();
      render(<Screen arrangement={arrangement} />);
      await user.click(button("Decline"));
      expect(button("Close dialog")).toHaveFocus();

      await user.click(screen.getByLabelText("Reason"));
      await user.tab();
      expect(button("Cancel")).toHaveFocus();
      await user.tab();
      expect(button("Send")).toHaveFocus();
      /* Past the last control it goes to the dialog's first, not on to the
         panel under it or the page behind. */
      await user.tab();
      expect(button("Close dialog")).toHaveFocus();
      expect(dialog(DRAWER)).not.toContainElement(focused());
    },
  );

  it.each(ARRANGEMENTS)(
    "keeps Shift+Tab inside the dialog too, from the first control and from the middle (%s)",
    async (_name, arrangement) => {
      const user = userEvent.setup();
      render(<Screen arrangement={arrangement} />);
      await user.click(button("Decline"));
      expect(button("Close dialog")).toHaveFocus();

      await user.tab({ shift: true });
      expect(button("Send")).toHaveFocus();

      /* From the reason box the previous control is the close control, not the
         last one: a wrong owner jumps to an end instead of taking one step. */
      await user.click(screen.getByLabelText("Reason"));
      await user.tab({ shift: true });
      expect(button("Close dialog")).toHaveFocus();
      expect(dialog(DRAWER)).not.toContainElement(focused());
    },
  );

  it.each(ARRANGEMENTS)(
    "closes only the dialog on the first Escape, and the panel on the next (%s)",
    async (_name, arrangement) => {
      const user = userEvent.setup();
      const onDrawerClose = vi.fn();
      const onModalClose = vi.fn();
      render(
        <Screen
          arrangement={arrangement}
          onDrawerClose={onDrawerClose}
          onModalClose={onModalClose}
        />,
      );
      await user.click(button("Decline"));

      await user.keyboard("{Escape}");
      expect(onModalClose).toHaveBeenCalledTimes(1);
      expect(onDrawerClose).not.toHaveBeenCalled();
      await gone(MODAL);
      expect(dialog(DRAWER)).toBeInTheDocument();

      await user.keyboard("{Escape}");
      expect(onDrawerClose).toHaveBeenCalledTimes(1);
      expect(onModalClose).toHaveBeenCalledTimes(1);
      await gone(DRAWER);
    },
  );

  it.each(ARRANGEMENTS)(
    "hands the keyboard back to the panel the moment the dialog closes (%s)",
    async (_name, arrangement) => {
      const user = userEvent.setup();
      render(<Screen arrangement={arrangement} />);
      await user.click(button("Decline"));
      await user.click(button("Cancel"));
      await gone(MODAL);

      /* Focus goes back to what was focused before the dialog opened. */
      expect(button("Decline")).toHaveFocus();

      /* And the panel's own trap works at once, at both ends. */
      await user.click(button("Approve"));
      await user.tab();
      expect(button("Close panel")).toHaveFocus();
      await user.tab({ shift: true });
      expect(button("Approve")).toHaveFocus();
    },
  );

  it("keeps working when the panel under it is closed from outside first, and frees the page when both are gone", async () => {
    const user = userEvent.setup();
    const onDrawerClose = vi.fn();
    const onModalClose = vi.fn();
    const props = { onDrawerClose, onModalClose };
    const { rerender } = render(<Layers {...props} />);
    rerender(<Layers {...props} modalOpen />);
    expect(button("Close dialog")).toHaveFocus();
    expect(__scrollLockDepth()).toBe(2);

    /* The page behind decides the panel is done, and the dialog stays. Closing
       the layer underneath must not leave the one on top without the keyboard. */
    rerender(<Layers {...props} drawerOpen={false} modalOpen />);
    await gone(DRAWER);
    expect(__scrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(screen.getByLabelText("Reason"));
    await user.tab();
    expect(button("Cancel")).toHaveFocus();
    await user.tab();
    expect(button("Send")).toHaveFocus();
    await user.tab();
    expect(button("Close dialog")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();

    /* Then the dialog goes too, and nothing is left holding the page. */
    rerender(<Layers {...props} drawerOpen={false} />);
    await gone(MODAL);
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("does not let Escape close the panel under a dialog that cannot be dismissed", async () => {
    const user = userEvent.setup();
    const onDrawerClose = vi.fn();
    const onModalClose = vi.fn();
    render(
      <Screen
        dismissible={false}
        onDrawerClose={onDrawerClose}
        onModalClose={onModalClose}
      />,
    );
    await user.click(button("Decline"));
    expect(
      screen.queryByRole("button", { name: "Close dialog" }),
    ).not.toBeInTheDocument();

    /* It declines to close, and that is still its decision to make: the
       panel under it has no say while it is on top. */
    await user.keyboard("{Escape}");
    expect(onModalClose).not.toHaveBeenCalled();
    expect(onDrawerClose).not.toHaveBeenCalled();
    expect(dialog(MODAL)).toBeInTheDocument();
    expect(dialog(DRAWER)).toBeInTheDocument();
  });

  it("lets a picker inside it take the first Escape, the dialog the second and the panel the third", async () => {
    const user = userEvent.setup();
    const onDrawerClose = vi.fn();
    const onModalClose = vi.fn();
    render(
      <Screen
        withPicker
        onDrawerClose={onDrawerClose}
        onModalClose={onModalClose}
      />,
    );
    await user.click(button("Decline"));
    const picker = screen.getByRole("combobox", { name: "Who" });
    await user.click(picker);
    expect(picker).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(picker).toHaveAttribute("aria-expanded", "false");
    expect(onModalClose).not.toHaveBeenCalled();
    expect(onDrawerClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();
    await gone(MODAL);

    await user.keyboard("{Escape}");
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
  });
});

describe("a dialog open over another dialog", () => {
  /*
   * The shape the performance screens use: the questions dialog renders the
   * new-version dialog inside it. Both are `Modal`, so the hook cannot tell this
   * from a panel under a dialog, and these say so.
   */
  const LOWER = "Questions";
  const UPPER = "Start a new version";

  function Pair({
    onLowerClose = noop,
    onUpperClose = noop,
  }: {
    onLowerClose?: () => void;
    onUpperClose?: () => void;
  }) {
    const [upperOpen, setUpperOpen] = useState(false);
    return (
      <Modal
        open
        onClose={onLowerClose}
        title={LOWER}
        footer={<Button type="button">Done</Button>}
      >
        <Button type="button" onClick={() => setUpperOpen(true)}>
          New version
        </Button>
        <Modal
          open={upperOpen}
          onClose={() => {
            onUpperClose();
            setUpperOpen(false);
          }}
          title={UPPER}
          footer={<Button type="button">Start</Button>}
        >
          <textarea aria-label="Why" />
        </Modal>
      </Modal>
    );
  }

  const inDialog = (name: string) => {
    const found = dialog(name);
    if (!found) throw new Error(`"${name}" is not on screen.`);
    return within(found);
  };

  it("keeps Tab in the upper one, round and round, in both directions", async () => {
    const user = userEvent.setup();
    render(<Pair />);
    await user.click(button("New version"));
    expect(
      inDialog(UPPER).getByRole("button", { name: "Close dialog" }),
    ).toHaveFocus();

    await user.click(screen.getByLabelText("Why"));
    await user.tab();
    expect(
      inDialog(UPPER).getByRole("button", { name: "Start" }),
    ).toHaveFocus();
    await user.tab();
    expect(
      inDialog(UPPER).getByRole("button", { name: "Close dialog" }),
    ).toHaveFocus();

    await user.tab({ shift: true });
    expect(
      inDialog(UPPER).getByRole("button", { name: "Start" }),
    ).toHaveFocus();
    expect(dialog(LOWER)).not.toContainElement(focused());
  });

  it("closes only the upper one on the first Escape and the lower on the next", async () => {
    const user = userEvent.setup();
    const onLowerClose = vi.fn();
    const onUpperClose = vi.fn();
    render(<Pair onLowerClose={onLowerClose} onUpperClose={onUpperClose} />);
    await user.click(button("New version"));

    await user.keyboard("{Escape}");
    expect(onUpperClose).toHaveBeenCalledTimes(1);
    expect(onLowerClose).not.toHaveBeenCalled();
    await gone(UPPER);

    await user.keyboard("{Escape}");
    expect(onLowerClose).toHaveBeenCalledTimes(1);
  });
});

describe("two layers that open in the same commit", () => {
  /*
   * React runs a child's effect before its parent's and siblings in tree order,
   * so which of the two registers last depends on how they are written. The
   * stack is in registration order, which would be a trap if the one registered
   * last were not also the one painted last. It is: both are `z-50` portals into
   * the body, so the later in the document is on top, and React puts the two
   * containers into the document in the very same order it runs the two
   * effects. These three arrangements are every way two layers can be written
   * and they all agree, which this checks by asking the document, not by
   * hard-coding an answer. If React ever orders them differently, this fails and
   * the stack needs to break the tie by position in the document instead.
   */
  it.each(ARRANGEMENTS)(
    "give Tab and Escape to the one painted last (%s)",
    async (_name, arrangement) => {
      const user = userEvent.setup();
      const onDrawerClose = vi.fn();
      const onModalClose = vi.fn();
      render(
        <Layers
          arrangement={arrangement}
          drawerOpen
          modalOpen
          onDrawerClose={onDrawerClose}
          onModalClose={onModalClose}
        />,
      );

      const top = screen.getAllByRole("dialog").at(-1);
      if (!top) throw new Error("No dialog is on screen.");
      const owner =
        top === dialog(MODAL)
          ? {
              first: "Close dialog",
              beforeLast: "Cancel",
              last: "Send",
              closes: onModalClose,
              other: onDrawerClose,
            }
          : {
              first: "Close panel",
              beforeLast: "Decline",
              last: "Approve",
              closes: onDrawerClose,
              other: onModalClose,
            };

      /* The last effect to run moved focus, so it is in the one on top. */
      expect(top).toContainElement(focused());

      /* One step back from the last control, then forward again and round. A
         step back is what two fighting owners cannot get right: forward from the
         last control happens to come out right, because the one on top acts
         last, but backward they leave focus where it was. */
      await user.click(button(owner.last));
      await user.tab({ shift: true });
      expect(button(owner.beforeLast)).toHaveFocus();
      await user.tab();
      expect(button(owner.last)).toHaveFocus();
      await user.tab();
      expect(button(owner.first)).toHaveFocus();

      await user.keyboard("{Escape}");
      expect(owner.closes).toHaveBeenCalledTimes(1);
      expect(owner.other).not.toHaveBeenCalled();
    },
  );
});

describe("the page scrolls again, whatever order the layers go in", () => {
  it("when the panel closes first and the dialog after", () => {
    const { rerender } = render(<Layers />);
    rerender(<Layers modalOpen />);
    expect(__scrollLockDepth()).toBe(2);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Layers drawerOpen={false} modalOpen />);
    expect(__scrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Layers drawerOpen={false} />);
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("when the dialog closes first and the panel after", () => {
    const { rerender } = render(<Layers />);
    rerender(<Layers modalOpen />);
    expect(__scrollLockDepth()).toBe(2);

    rerender(<Layers />);
    expect(__scrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");

    rerender(<Layers drawerOpen={false} />);
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it.each(ARRANGEMENTS)(
    "when both are removed in one go, which is what a parent clearing its state does (%s)",
    (_name, arrangement) => {
      const { unmount } = render(
        <Layers arrangement={arrangement} drawerOpen modalOpen />,
      );
      expect(__scrollLockDepth()).toBe(2);
      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(__scrollLockDepth()).toBe(0);
      expect(document.body.style.overflow).toBe("");
    },
  );

  it("and a page that set its own overflow gets that value back, not an empty one", () => {
    document.body.style.overflow = "scroll";
    const { unmount } = render(<Layers modalOpen />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("scroll");
  });
});

describe("under StrictMode, which doubles every effect in development", () => {
  it("counts each layer once and still hands the keyboard down in order", async () => {
    const user = userEvent.setup();
    const onDrawerClose = vi.fn();
    const onModalClose = vi.fn();
    render(
      <StrictMode>
        <Screen onDrawerClose={onDrawerClose} onModalClose={onModalClose} />
      </StrictMode>,
    );
    /* Mounted open, so its effect ran, was undone and ran again: one layer. */
    expect(__scrollLockDepth()).toBe(1);

    await user.click(button("Decline"));
    expect(__scrollLockDepth()).toBe(2);

    await user.keyboard("{Escape}");
    expect(onModalClose).toHaveBeenCalledTimes(1);
    expect(onDrawerClose).not.toHaveBeenCalled();
    await gone(MODAL);
    expect(__scrollLockDepth()).toBe(1);

    await user.keyboard("{Escape}");
    expect(onDrawerClose).toHaveBeenCalledTimes(1);
    await gone(DRAWER);
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("a dialog on its own", () => {
  function Single({
    dismissible = true,
    onClose = noop,
  }: {
    dismissible?: boolean;
    onClose?: () => void;
  }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Open it
        </button>
        <Modal
          open={open}
          dismissible={dismissible}
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          title="Single"
          footer={
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          }
        >
          <textarea aria-label="Notes" />
        </Modal>
      </>
    );
  }

  it("moves focus in when it opens and gives it back to what opened it", async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.click(button("Open it"));
    expect(button("Close dialog")).toHaveFocus();

    await user.keyboard("{Escape}");
    await gone("Single");
    expect(button("Open it")).toHaveFocus();
  });

  it("closes once on one Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Single onClose={onClose} />);
    await user.click(button("Open it"));
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await gone("Single");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("wraps Tab from the last control to the first and Shift+Tab from the first to the last", async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.click(button("Open it"));
    expect(button("Close dialog")).toHaveFocus();

    await user.tab({ shift: true });
    expect(button("Done")).toHaveFocus();
    await user.tab();
    expect(button("Close dialog")).toHaveFocus();
  });

  it("pulls focus that has got out to the page back in, to the end Tab was heading for", async () => {
    const user = userEvent.setup();
    render(<Single />);
    await user.click(button("Open it"));

    button("Open it").focus();
    await user.tab();
    expect(button("Close dialog")).toHaveFocus();

    button("Open it").focus();
    await user.tab({ shift: true });
    expect(button("Done")).toHaveFocus();
  });

  it("locks the page while it is open and gives it back when it closes", async () => {
    const user = userEvent.setup();
    render(<Single />);
    expect(__scrollLockDepth()).toBe(0);

    await user.click(button("Open it"));
    expect(__scrollLockDepth()).toBe(1);
    expect(document.body.style.overflow).toBe("hidden");

    await user.click(button("Done"));
    await gone("Single");
    expect(__scrollLockDepth()).toBe(0);
    expect(document.body.style.overflow).toBe("");
  });

  it("ignores Escape when it cannot be dismissed, and still keeps Tab inside", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Single dismissible={false} onClose={onClose} />);
    await user.click(button("Open it"));
    expect(screen.getByLabelText("Notes")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog("Single")).toBeInTheDocument();

    await user.tab({ shift: true });
    expect(button("Done")).toHaveFocus();
    await user.tab();
    expect(screen.getByLabelText("Notes")).toHaveFocus();
  });
});
