/* Journal OS — phone gestures.

   1. Swipe down on the Barnacle sheet's header (the grab handle) to close it.
      The Close button and Escape do the same without a gesture.
   2. Swipe left or right on the main content to move between Planner, Living
      Journal, Companion and Channels. A bottom nav (under 640px) does the same
      with a tap, for anyone who doesn't swipe.

   Swipes never start inside something that already uses a horizontal drag:
   text fields, sliders, draggable planner events, sideways-scrolling areas,
   dialogs, the teardown frame or Barnacle itself.

   Uses helpers from os.js ($, $$, S, ICONS, pixelSvg) and bubble.js (B, bnClose). */
'use strict';

const GS_TABS = [
  { id: 'planner', label: 'Planner' },
  { id: 'journal', label: 'Journal' },
  { id: 'companion', label: 'Companion' },
  { id: 'channels', label: 'Channels' },
];
const Gestures = { mount: gsMount, unmount: gsUnmount };
const gsCalm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const gsView = () => (location.hash || '#planner').slice(1).split('?')[0];
let gsMounted = false;

function gsMount() {
  if (gsMounted) return;
  gsMounted = true;
  const nav = document.createElement('nav');
  nav.id = 'tabbar';
  nav.className = 'tabbar';
  nav.setAttribute('aria-label', 'Main views');
  nav.innerHTML = GS_TABS.filter((t) => S.registry.some((a) => a.id === t.id)).map((t) => `<a href="#${t.id}" data-tab="${t.id}">
      ${pixelSvg(ICONS[t.id] || ICONS.device, 'pix', '')}<span>${t.label}</span></a>`).join('');
  document.body.appendChild(nav);
  document.body.classList.add('has-tabbar');
  window.addEventListener('hashchange', gsMarkTab);
  gsMarkTab();
  const view = $('#view');
  view.addEventListener('touchstart', gsViewStart, { passive: true });
  view.addEventListener('touchend', gsViewEnd, { passive: true });
  view.addEventListener('touchcancel', gsViewCancel, { passive: true });
  document.addEventListener('pointerdown', gsSheetStart);
}

function gsUnmount() {
  if (!gsMounted) return;
  gsMounted = false;
  const nav = $('#tabbar');
  if (nav) nav.remove();
  document.body.classList.remove('has-tabbar');
  window.removeEventListener('hashchange', gsMarkTab);
  const view = $('#view');
  view.removeEventListener('touchstart', gsViewStart);
  view.removeEventListener('touchend', gsViewEnd);
  view.removeEventListener('touchcancel', gsViewCancel);
  document.removeEventListener('pointerdown', gsSheetStart);
}

function gsMarkTab() {
  const id = gsView();
  $$('#tabbar [data-tab]').forEach((a) => { if (a.dataset.tab === id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
}

/* ---------------------------------------------------------------- swipe between views */
let gsTouch = null;

// True when a horizontal drag starting here already means something else.
function gsBusyTarget(el) {
  if (!el || !el.closest) return true;
  if (el.closest('input, textarea, select, [contenteditable], [draggable="true"], pw-slider, iframe, dialog, #barnacle, .dv-frame')) return true;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.scrollWidth > n.clientWidth + 4 && /(auto|scroll)/.test(getComputedStyle(n).overflowX)) return true;
  }
  return false;
}

function gsViewStart(e) {
  gsTouch = null;
  if (e.touches.length !== 1 || document.querySelector('dialog[open]') || gsBusyTarget(e.target)) return;
  const t = e.touches[0];
  gsTouch = { x: t.clientX, y: t.clientY, at: performance.now() };
}
function gsViewCancel() { gsTouch = null; }
function gsViewEnd(e) {
  const start = gsTouch;
  gsTouch = null;
  if (!start || !e.changedTouches.length) return;
  const sel = window.getSelection();
  if (sel && !sel.isCollapsed) return; // the person was selecting text
  const t = e.changedTouches[0];
  const dx = t.clientX - start.x;
  const dy = t.clientY - start.y;
  if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 2 || performance.now() - start.at > 700) return;
  gsStep(dx < 0 ? 1 : -1);
}

// Next (+1) or previous (-1) main view. Stops at the ends rather than wrapping.
function gsStep(dir) {
  const tabs = $$('#tabbar [data-tab]').map((a) => a.dataset.tab);
  const i = tabs.indexOf(gsView());
  const next = tabs[i + dir];
  if (i < 0 || !next) return false;
  const view = $('#view');
  view.classList.remove('gs-from-right', 'gs-from-left');
  location.hash = `#${next}`;
  if (!gsCalm()) {
    void view.offsetWidth;
    view.classList.add(dir > 0 ? 'gs-from-right' : 'gs-from-left');
    setTimeout(() => view.classList.remove('gs-from-right', 'gs-from-left'), 260);
  }
  window.scrollTo(0, 0);
  return true;
}

/* ---------------------------------------------------------------- swipe the Barnacle sheet down */
function gsSheetStart(e) {
  const head = e.target.closest && e.target.closest('#bn-panel .bn-head');
  if (!head || e.pointerType === 'mouse' || e.target.closest('button, a, select')) return;
  if (!window.matchMedia('(max-width: 640px)').matches) return; // only the bottom sheet drags
  const panel = $('#bn-panel');
  const start = { y: e.clientY, at: performance.now(), id: e.pointerId };
  let dy = 0;
  const move = (ev) => {
    if (ev.pointerId !== start.id) return;
    dy = Math.max(0, ev.clientY - start.y);
    panel.style.transition = 'none';
    panel.style.translate = `0 ${dy}px`;
  };
  const end = (ev) => {
    if (ev.pointerId !== start.id) return;
    head.removeEventListener('pointermove', move);
    head.removeEventListener('pointerup', end);
    head.removeEventListener('pointercancel', end);
    const fast = dy > 24 && dy / Math.max(1, performance.now() - start.at) > 0.5;
    const close = ev.type === 'pointerup' && (dy > 110 || fast);
    const calm = gsCalm();
    panel.style.transition = calm ? 'none' : `translate ${close ? 180 : 260}ms cubic-bezier(0.2, 0, 0, 1)`;
    panel.style.translate = close ? '0 100%' : '0 0';
    setTimeout(() => {
      panel.style.transition = '';
      panel.style.translate = '';
      if (close && typeof bnClose === 'function') bnClose();
    }, calm ? 0 : (close ? 180 : 260));
  };
  try { head.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  head.addEventListener('pointermove', move);
  head.addEventListener('pointerup', end);
  head.addEventListener('pointercancel', end);
}
