"use client";

import { createContext } from "react";

/**
 * Whether something is rendering inside a `Modal` or a `Drawer`.
 *
 * A notice on a page can sit behind an icon: the reader is looking at a screen
 * and the icon is one more thing on it. A notice in a dialog is different: it
 * is the sentence beside the button that decides, "this ends nothing on its
 * own", "this cannot be undone", and a consequence that needs a hover to be
 * read is one that gets agreed to unread. `Callout` reads this to keep its words
 * on the page inside a dialog.
 */
export const InDialog = createContext(false);
