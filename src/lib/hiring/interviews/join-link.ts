/**
 * The link to an online interview, as staff paste it.
 *
 * Nothing here makes a meeting: a person creates it in Google Meet, Zoom or Teams and
 * pastes the address. It is checked because it goes into a candidate's email and a
 * calendar file, where a link that is not https, or has a space in it, or is a
 * `javascript:` address somebody pasted by accident, is worse than none.
 *
 * No React, no state.
 */

export const JOIN_LINK_MAX = 1_000;

/** Shown under the box before anything is typed. */
export const JOIN_LINK_HINT = "Paste a Google Meet / Zoom / Teams link";

/** The sentence under the box when it is wrong, or `null` when it is fine or empty. */
export function joinLinkProblem(value: string): string | null {
  const text = value.trim();
  if (text === "") return null;
  if (/\s/.test(text)) return "A link has no spaces in it. Paste it again.";
  if (text.length > JOIN_LINK_MAX)
    return `Keep the link to ${String(JOIN_LINK_MAX)} characters.`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return "That is not a link. Use one that starts with https://";
  }
  if (url.protocol !== "https:") return "Use a link that starts with https://";
  if (url.username !== "" || url.password !== "")
    return "A link with a name or password in it is not accepted.";
  /* A real host name: not localhost, and not a bare address, which is the usual way a
     link that is not what it says it is is written. */
  if (
    url.hostname === "" ||
    !url.hostname.includes(".") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) ||
    url.hostname.startsWith("[")
  )
    return "A join link has to be a full https:// address to a website, like https://meet.example.com/abc.";
  return null;
}

/** What kind of call a link looks like, for the line under it. `null` when it is none we know. */
export function joinLinkProvider(value: string): string | null {
  const text = value.trim();
  if (joinLinkProblem(text) !== null || text === "") return null;
  const host = new URL(text).hostname.toLowerCase();
  if (host === "meet.google.com") return "Google Meet";
  if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom";
  if (host === "teams.microsoft.com" || host === "teams.live.com")
    return "Microsoft Teams";
  return null;
}

/** The link as it should be stored: trimmed, or `null` when there is none. */
export function cleanJoinLink(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}
