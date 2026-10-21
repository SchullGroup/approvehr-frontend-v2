/**
 * What makes the recording legible: a visible cursor, a ripple where it clicks,
 * and a caption bar saying what the person is doing and why.
 *
 * It is drawn **inside the page**, so it is in the video by construction and
 * needs no ffmpeg and no post-processing. That also means it must never change
 * what the app does:
 *
 * - every node is `pointer-events: none`, so a click lands on the product and
 *   not on the overlay;
 * - it is `aria-hidden` and carries `data-walk-overlay`, so assistive technology
 *   and the accessibility scan both leave it alone (the scan excludes `#__walk`);
 * - it hangs off `<html>`, not `<body>`, so a framework replacing the body does
 *   not take it away;
 * - it only ever reads mouse events. It writes nothing the product can see.
 *
 * ## The caption flips to the top when the pointer goes near the bottom
 *
 * A caption at the bottom of a 720px page covers the footer of every dialog, and
 * a recording of somebody clicking "Save" under a black bar shows nothing. So the
 * bar sits at the bottom until the pointer comes within 120px of it, then moves to
 * the top; the top bar of the app is rarely where the next click is.
 *
 * `OVERLAY_SCRIPT` is a string because it runs in the page, not here: it is
 * installed with `addInitScript`, so it is there on the first frame of every
 * navigation, including the ones the journey did not ask for (a redirect).
 */

export const OVERLAY_SCRIPT = String.raw`
(() => {
  if (window.__walkOverlay) return;

  const state = { x: -100, y: -100 };
  let cursor, caption, chapterEl, textEl;

  const mount = () => {
    /* An init script can run before the page has a root element at all. There is
       nothing to hang the overlay on yet, so wait for the next call: a mouse
       move, or DOMContentLoaded, both of which come after. */
    if (!document.documentElement) return;
    if (document.getElementById("__walk")) return;
    const root = document.createElement("div");
    root.id = "__walk";
    root.setAttribute("aria-hidden", "true");
    root.setAttribute("data-walk-overlay", "");
    root.style.cssText =
      "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";

    cursor = document.createElement("div");
    cursor.style.cssText =
      "position:fixed;left:0;top:0;width:28px;height:28px;pointer-events:none;" +
      "transform:translate(-100px,-100px);transition:transform 60ms linear;";
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 2 L4 22 L9.5 17 L13 25 L16.5 23.5 L13 15.5 L21 15.5 Z" ' +
      'fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';

    caption = document.createElement("div");
    caption.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;display:none;padding:10px 24px;" +
      "background:rgba(15,23,42,0.93);color:#fff;font:18px/1.35 system-ui,sans-serif;" +
      "transition:top 160ms ease,bottom 160ms ease;pointer-events:none;";
    chapterEl = document.createElement("div");
    chapterEl.style.cssText =
      "font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#9fb3c8;";
    textEl = document.createElement("div");
    caption.append(chapterEl, textEl);

    root.append(cursor, caption);
    document.documentElement.appendChild(root);
  };

  const place = () => {
    if (!cursor) return;
    cursor.style.transform = "translate(" + state.x + "px," + state.y + "px)";
    if (!caption) return;
    const nearBottom = state.y > window.innerHeight - 120;
    caption.style.top = nearBottom ? "0" : "auto";
    caption.style.bottom = nearBottom ? "auto" : "0";
  };

  const ripple = (x, y) => {
    const ring = document.createElement("div");
    ring.style.cssText =
      "position:fixed;left:" + (x - 22) + "px;top:" + (y - 22) + "px;width:44px;height:44px;" +
      "border-radius:50%;border:3px solid #2563eb;background:rgba(37,99,235,.18);" +
      "pointer-events:none;";
    document.getElementById("__walk")?.appendChild(ring);
    const animation = ring.animate(
      [
        { transform: "scale(0.35)", opacity: 1 },
        { transform: "scale(1.5)", opacity: 0 },
      ],
      { duration: 550, easing: "ease-out" },
    );
    animation.onfinish = () => ring.remove();
  };

  window.addEventListener(
    "mousemove",
    (event) => {
      mount();
      state.x = event.clientX;
      state.y = event.clientY;
      place();
    },
    { capture: true, passive: true },
  );
  window.addEventListener(
    "mousedown",
    (event) => {
      mount();
      state.x = event.clientX;
      state.y = event.clientY;
      place();
      ripple(event.clientX, event.clientY);
    },
    { capture: true, passive: true },
  );

  /* The API is defined before the first attempt to mount, so a mount that has
     to wait cannot take the caption function down with it. */
  window.__walkOverlay = {
    caption(chapter, text) {
      mount();
      if (!caption) return;
      chapterEl.textContent = chapter;
      textEl.textContent = text;
      caption.style.display = text || chapter ? "block" : "none";
      place();
    },
    clear() {
      if (caption) caption.style.display = "none";
    },
  };

  document.addEventListener("DOMContentLoaded", mount);
  mount();
})();
`;
