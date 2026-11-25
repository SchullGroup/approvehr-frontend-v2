"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

/**
 * A place in the page header, just left of its action, that a control further
 * down the page may move itself into.
 *
 * It exists for one control: the filter icon of a `FilterBar` that is nothing
 * but the icon. On its own row under the header it floated at the far left of
 * an empty line (Signatures, with "Send for signature" top right and a lone
 * icon below it). The owner asked for it beside the header's button instead.
 *
 * - `HeaderSlotProvider` wraps the signed-in app (`AppShell`), so a page's
 *   header and its body share one.
 * - `PageHeader` renders `<HeaderSlot />` before its action, and only when it
 *   has one.
 * - A control **claims** the slot while it wants it. Two claimants on one page
 *   means neither moves: two filter icons side by side in the header could not
 *   say which list each one filters.
 *
 * The slot is a `display: contents` span, so whatever is portalled into it is
 * an ordinary item in the header's action row and wraps with it on a phone.
 */
type Slot = {
  element: HTMLElement | null;
  setElement: (element: HTMLElement | null) => void;
  claims: number;
  /** Take the slot; call what it returns to give it back. */
  claim: () => () => void;
};

const HeaderSlotContext = createContext<Slot | null>(null);
/* The setter on its own, so `HeaderSlot` hands a plain function to `ref` (it
   never changes, so the header's slot is not torn down on every claim). */
const SetSlotContext = createContext<
  ((element: HTMLElement | null) => void) | null
>(null);

export function HeaderSlotProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [claims, setClaims] = useState(0);
  const claim = useCallback(() => {
    setClaims((count) => count + 1);
    return () => setClaims((count) => count - 1);
  }, []);
  const value = useMemo(
    () => ({ element, setElement, claims, claim }),
    [element, claims, claim],
  );
  return (
    <SetSlotContext.Provider value={setElement}>
      <HeaderSlotContext.Provider value={value}>
        {children}
      </HeaderSlotContext.Provider>
    </SetSlotContext.Provider>
  );
}

/** Where a claimed control lands. Renders nothing outside a provider. */
export function HeaderSlot() {
  const setElement = useContext(SetSlotContext);
  if (!setElement) return null;
  return <span ref={setElement} data-header-slot="" className="contents" />;
}

/** The slot, or `null` outside a provider (a dialog, a test, the setup flow). */
export function useHeaderSlot(): Slot | null {
  return useContext(HeaderSlotContext);
}
