// A field being typed in is kept where it can be seen: above the on-screen keyboard, below the bars that stay on
// top of the page (the gym's client tabs, marked data-sticky-top), with room under it for what comes next (the
// rest of a set row marked data-keep — its ✓ — and the next set). On phones only the app's main area scrolls.

const reduceMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The element that scrolls `el` (an overflow box such as the app's main area or a sheet), if any. */
export function scrollBoxOf(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === 'auto' || o === 'scroll') return p;
  }
  return null;
}

/** The part of `box` that can be seen: below what is stuck on its top, above the keyboard (client coordinates). */
export function visiblePart(box: HTMLElement) {
  const vv = window.visualViewport;
  const b = box.getBoundingClientRect();
  let top = Math.max(b.top, vv ? vv.offsetTop : 0);
  const bottom = Math.min(b.bottom, vv ? vv.offsetTop + vv.height : window.innerHeight);
  for (const bar of box.querySelectorAll<HTMLElement>('[data-sticky-top]')) {
    const r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top <= top + 1 && r.bottom > top) top = r.bottom;
  }
  return { top, bottom };
}

/**
 * Scrolls the box of `el` as little as needed so that `el` (with its data-keep row) is in view, with room below it.
 * Nothing moves when it is in view already. Not while the page is pinch-zoomed.
 */
export function keepInView(el: HTMLElement, { smooth = true }: { smooth?: boolean } = {}) {
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) > 0.01) return;
  const box = scrollBoxOf(el);
  if (!box || box.scrollHeight <= box.clientHeight) return;
  const target = (el.closest('[data-keep]') as HTMLElement | null) || el;
  const r = target.getBoundingClientRect();
  if (!r.height) return;
  const { top, bottom } = visiblePart(box);
  // The next row or two stay in sight under the one being filled in.
  const room = Math.min(110, Math.max(0, (bottom - top - r.height) * 0.35));
  let dy = 0;
  if (r.bottom > bottom - room) dy = r.bottom - (bottom - room);
  if (r.top - dy < top + 8) dy = r.top - (top + 8);
  if (Math.abs(dy) < 2) return;
  box.scrollBy({ top: dy, behavior: smooth && !reduceMotion() ? 'smooth' : 'auto' });
}
