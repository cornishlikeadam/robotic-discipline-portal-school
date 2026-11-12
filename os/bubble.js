/* Journal OS — Barnacle, the floating companion.

   A gold bubble that stays on screen in every Journal OS view and opens a
   chat with one agent (Chief of Staff if there is one, else PATCH). It is a
   DM in the Channels system: messages go through the same `messages` table,
   agent tool calls become the same approval cards, and nothing is written
   until someone presses Approve.

   Three modes, like a video that keeps playing as you browse:
     closed  the bubble alone, in a corner you can drag it to;
     open    a bottom sheet on a phone, a side panel on a wider screen;
     mini    a small floating card (agent, latest line, anything waiting) that
             stays on screen on every view. On a phone, changing views while
             the sheet is open shrinks it to this; tapping it opens it again.

   On a phone it also keeps out of the way: it tucks to the edge while you
   scroll down, hides while you type somewhere else, and the sheet rides
   above the on-screen keyboard.

   Uses helpers from os.js (S, $, $$, esc, api, guard, toast, store, wsPath,
   parseIso, localIso, route) and harness.js (H, hxLoadAgents, hxMessage,
   LiveFeed, hxHashFor, hxRefresh, hxDoneText, agentRuntime, shortModel). */
'use strict';

const BN_DEMO_TEXT = 'Schedule a robotics build session tomorrow at 11 for 90 minutes';
const BN_SUGGESTIONS = [
  'Schedule a robotics build session tomorrow at 11 for 90 minutes',
  'Create a journal entry for my robotics build session',
  'Remember that I test new prints on Thursdays',
];
const BN_CORNERS = ['br', 'bl', 'tr', 'tl'];
const BN_FALLBACK = /^\(([^)]*?)\.?\s*The rule-based stand-in answered instead\.\)\s*/;

const B = {
  mounted: false,
  mode: 'closed', // closed | open | mini
  agentId: null,
  agentName: 'Barnacle',
  channel: null,
  selection: '',
  offered: '',
  hideContext: '',
  peekTimer: null,
  refreshTimer: null,
  tuckTimer: null,
  busy: false,
  sending: false,
  lastLine: '',
  waiting: 0,
  failed: '',
  corner: 'br',
  dragged: false,
};

const Barnacle = { mount: bnMount, unmount: bnUnmount, onRoute: bnOnRoute, notice: bnNotice };

const bnWait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const bnCalm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const bnPhone = () => window.matchMedia('(max-width: 640px)').matches;
const bnTouchy = () => bnPhone() || window.matchMedia('(pointer: coarse)').matches;
const bnView = () => (location.hash || '#planner').slice(1).split('?')[0];
const bnOpen = () => bnSetMode('open');
const bnClose = () => bnSetMode('closed');

/* ---------------------------------------------------------------- mount */
function bnMount() {
  if (B.mounted || !S.user) return;
  B.mounted = true;
  B.corner = BN_CORNERS.includes(store.get('barnacle.corner', 'br')) ? store.get('barnacle.corner', 'br') : 'br';
  const root = document.createElement('div');
  root.className = 'barnacle';
  root.id = 'barnacle';
  root.innerHTML = `
    <section class="bn-panel" id="bn-panel" role="dialog" aria-modal="false" aria-labelledby="bn-title" hidden>
      <header class="bn-head">
        <span class="bn-mark" aria-hidden="true">B</span>
        <div class="bn-who">
          <h2 id="bn-title" tabindex="-1">Barnacle</h2>
          <p id="bn-sub">Your companion on every page</p>
        </div>
        <button type="button" class="bn-wait" id="bn-wait" data-bn="jump-pending" hidden></button>
        <div class="bn-tools">
          <button type="button" class="bn-btn icon" data-bn="minimize" aria-label="Minimize Barnacle" title="Minimize: keep it on screen while you browse">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 12.5h10"/></svg></button>
          <button type="button" class="bn-btn icon" data-bn="close" aria-label="Close Barnacle" title="Close">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg></button>
        </div>
      </header>
      <label class="bn-agent" id="bn-agent-wrap" hidden><span>Talking with</span><select id="bn-agent"></select></label>
      <ol class="bn-msgs" id="bn-msgs" aria-label="Conversation"></ol>
      <div class="bn-ctx" id="bn-ctx" hidden></div>
      <form class="bn-compose" id="bn-form" autocomplete="off">
        <label class="sr" for="bn-input">Message Barnacle</label>
        <textarea id="bn-input" rows="1" placeholder="Message your agent" enterkeyhint="send"></textarea>
        <button type="submit" class="bn-send">Send</button>
      </form>
      <p class="bn-foot"><a class="bn-link" id="bn-full" href="#channels">Open in Channels</a><button type="button" class="bn-link" data-bn="flip-side" id="bn-flip">Move Barnacle to the left</button></p>
    </section>
    <div class="bn-dock" id="bn-dock" data-corner="${B.corner}">
      <div class="bn-peek" id="bn-peek" role="status" hidden></div>
      <div class="bn-mini" id="bn-mini" hidden>
        <button type="button" class="bn-mini-open" data-bn="expand" aria-label="Open the Barnacle chat">
          <span class="bn-mark" aria-hidden="true">B</span>
          <span class="bn-mini-text"><b id="bn-mini-who">Barnacle</b><span id="bn-mini-line">Tap to open the chat</span></span>
          <span class="bn-badge" id="bn-mini-badge" hidden></span>
        </button>
        <button type="button" class="bn-btn icon" data-bn="close" aria-label="Close Barnacle" title="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg></button>
      </div>
      <button type="button" class="bn-bubble" id="bn-bubble" aria-expanded="false" aria-controls="bn-panel" aria-label="Open Barnacle">
        <span class="bn-orb" aria-hidden="true"><span class="bn-b">B</span></span>
        <span class="bn-badge" id="bn-badge" hidden></span>
      </button>
    </div>
    <p class="sr" id="bn-announce" role="status" aria-live="polite"></p>`;
  document.body.appendChild(root);
  document.body.classList.add('has-barnacle');

  const bubble = $('#bn-bubble');
  bubble.addEventListener('pointerdown', bnSnapshotSelection);
  bubble.addEventListener('click', () => { if (B.dragged) return; bnSetMode(B.mode === 'open' ? 'closed' : 'open'); });
  bnDraggable(bubble);
  bnDraggable($('#bn-mini .bn-mini-open'));
  root.addEventListener('click', bnOnClick);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && B.mode === 'open') { e.preventDefault(); bnClose(); }
  });
  $('#bn-agent').addEventListener('change', (e) => { B.agentId = e.target.value; store.set('barnacle.agent', B.agentId); B.channel = null; bnLoad(); });
  bnBindComposer();
  document.addEventListener('selectionchange', bnOnSelectionChange);
  document.addEventListener('mouseup', bnClearStaleSelection);
  document.addEventListener('keyup', bnClearStaleSelection);
  document.addEventListener('focusin', bnOnFocus);
  document.addEventListener('focusout', bnOnFocus);
  window.addEventListener('scroll', bnOnScroll, { passive: true });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', bnOnViewport);
    visualViewport.addEventListener('scroll', bnOnViewport);
  }
  LiveFeed.on(bnOnChange);
  B.agentId = store.get('barnacle.agent', null);
  bnDrawSide();
  bnPlaceTop();
  window.addEventListener('resize', bnPlaceTop);
  bnRefreshBadge();
  bnWave();
  const saved = store.get('barnacle.mode', 'closed');
  if (saved === 'mini' || (saved === 'open' && bnPhone())) bnSetMode('mini', { quiet: true });
  else if (saved === 'open') bnSetMode('open', { quiet: true });
  if (!store.get('barnacle.intro', false)) {
    setTimeout(() => bnPeek(`<p><b>Hi, I’m Barnacle.</b> I stay with you in the planner, journal and channels, and I ask before I change anything.</p>
      <div class="bn-row"><button type="button" class="bn-btn" data-bn="intro-demo">Show me</button><button type="button" class="bn-btn ghost" data-bn="intro-later">Not now</button></div>`, 0), 900);
  }
}

function bnUnmount() {
  if (!B.mounted) return;
  B.mounted = false;
  B.mode = 'closed';
  B.channel = null;
  LiveFeed.off(bnOnChange);
  LiveFeed.release('barnacle');
  document.removeEventListener('selectionchange', bnOnSelectionChange);
  document.removeEventListener('mouseup', bnClearStaleSelection);
  document.removeEventListener('keyup', bnClearStaleSelection);
  document.removeEventListener('focusin', bnOnFocus);
  document.removeEventListener('focusout', bnOnFocus);
  window.removeEventListener('scroll', bnOnScroll);
  window.removeEventListener('resize', bnPlaceTop);
  if (window.visualViewport) {
    visualViewport.removeEventListener('resize', bnOnViewport);
    visualViewport.removeEventListener('scroll', bnOnViewport);
  }
  clearTimeout(B.peekTimer);
  clearTimeout(B.tuckTimer);
  const root = $('#barnacle');
  if (root) root.remove();
  document.body.classList.remove('has-barnacle', 'bn-open', 'bn-kbd');
}

function bnOnRoute() {
  if (!B.mounted) return;
  B.hideContext = '';
  bnHidePeek();
  bnDrawContext();
  // Like a video shrinking into a corner: on a phone the sheet would hide the page you just opened.
  if (B.mode === 'open' && bnPhone()) bnSetMode('mini');
  clearTimeout(B.refreshTimer);
  B.refreshTimer = setTimeout(bnRefreshBadge, 400);
}

/* ---------------------------------------------------------------- modes */
async function bnSetMode(mode, { quiet = false } = {}) {
  if (!B.mounted) return;
  const was = B.mode;
  B.mode = mode;
  store.set('barnacle.mode', mode);
  const panel = $('#bn-panel');
  const bubble = $('#bn-bubble');
  const mini = $('#bn-mini');
  document.body.classList.toggle('bn-open', mode === 'open');
  panel.hidden = mode !== 'open';
  mini.hidden = mode !== 'mini';
  bubble.hidden = mode === 'mini';
  bubble.setAttribute('aria-expanded', String(mode === 'open'));
  if (mode !== 'closed') { bnHidePeek(); bubble.classList.remove('has-news'); LiveFeed.hold('barnacle'); } else LiveFeed.release('barnacle');
  bnRefreshBadge();
  if (mode === 'open') {
    bnOnViewport();
    bnDrawContext();
    await bnLoad();
    if (quiet) return;
    const ta = $('#bn-input');
    if (!bnTouchy() && ta && !$('#bn-form').hidden) ta.focus(); else $('#bn-title').focus();
  } else if (mode === 'mini') {
    if (was !== 'open' && !B.channel) bnLoad();
    bnDrawMini();
    if (!quiet && was === 'open') $('#bn-mini .bn-mini-open').focus();
  } else if (!quiet && was !== 'closed') {
    bubble.focus();
  }
}

function bnDrawMini() {
  const who = $('#bn-mini-who');
  if (!who) return;
  who.textContent = B.agentName;
  const line = B.sending ? `${B.agentName} is thinking…`
    : B.waiting ? `${B.waiting} ${B.waiting === 1 ? 'change is' : 'changes are'} waiting for you`
      : B.lastLine || 'Tap to open the chat';
  $('#bn-mini-line').textContent = line;
  const badge = $('#bn-mini-badge');
  badge.hidden = !B.waiting;
  badge.textContent = B.waiting > 9 ? '9+' : String(B.waiting);
  $('#bn-mini .bn-mini-open').setAttribute('aria-label', `Open the chat with ${B.agentName}. ${line}`);
}

/* ---------------------------------------------------------------- corners + dragging */
function bnDrawSide() {
  const dock = $('#bn-dock');
  if (!dock) return;
  dock.dataset.corner = B.corner;
  $('#barnacle').dataset.side = B.corner.endsWith('l') ? 'left' : 'right';
  $('#barnacle').dataset.edge = B.corner.startsWith('t') ? 'top' : 'bottom';
  $('#bn-flip').textContent = B.corner.endsWith('l') ? 'Move Barnacle to the right' : 'Move Barnacle to the left';
}

function bnMoveTo(corner) {
  const dock = $('#bn-dock');
  const before = dock.getBoundingClientRect();
  B.corner = corner;
  store.set('barnacle.corner', corner);
  bnDrawSide();
  if (bnCalm()) return;
  // Glide from where it was to its new corner (transform only, so it stays smooth).
  const after = dock.getBoundingClientRect();
  dock.style.transition = 'none';
  dock.style.transform = `translate(${before.left - after.left}px, ${before.top - after.top}px)`;
  requestAnimationFrame(() => {
    dock.style.transition = 'transform 320ms cubic-bezier(0.2, 0, 0, 1)';
    dock.style.transform = '';
  });
}

// Drag the bubble or the mini player anywhere; it snaps to the nearest corner when let go.
// The "Move Barnacle to the left/right" button is the single-tap alternative.
function bnDraggable(handle) {
  let start = null;
  handle.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    B.dragged = false;
    try { handle.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  handle.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!start.moved && Math.hypot(dx, dy) < 8) return;
    if (!start.moved) { start.moved = true; $('#bn-dock').classList.add('bn-dragging'); bnHidePeek(); }
    $('#bn-dock').style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const { moved } = start;
    start = null;
    const dock = $('#bn-dock');
    dock.classList.remove('bn-dragging');
    if (!moved) return;
    B.dragged = true;
    setTimeout(() => { B.dragged = false; }, 0); // swallow the click that ends a drag
    const r = dock.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const corner = `${cy < window.innerHeight / 2 ? 't' : 'b'}${cx < window.innerWidth / 2 ? 'l' : 'r'}`;
    bnMoveTo(corner);
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  handle.addEventListener('click', (e) => { if (B.dragged) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}

/* ---------------------------------------------------------------- staying out of the way */
// A top corner sits below the top bar until it scrolls away, so Barnacle never covers Sign out.
function bnPlaceTop() {
  const root = $('#barnacle');
  const bar = document.querySelector('.topbar');
  if (!root || !bar) return;
  root.style.setProperty('--bn-top', `${Math.max(12, Math.round(bar.getBoundingClientRect().bottom) + 12)}px`);
}

let bnLastY = window.scrollY;
function bnOnScroll() {
  bnPlaceTop();
  const dock = $('#bn-dock');
  if (!dock || B.mode === 'open' || !bnTouchy()) return;
  const y = window.scrollY;
  const down = y > bnLastY + 4;
  const up = y < bnLastY - 4;
  bnLastY = y;
  if (down && y > 60) dock.classList.add('bn-tucked');
  if (up) dock.classList.remove('bn-tucked');
  clearTimeout(B.tuckTimer);
  B.tuckTimer = setTimeout(() => dock.classList.remove('bn-tucked'), 1600);
}

// Hide while the person types anywhere else: on a phone the keyboard has already taken half the screen.
function bnOnFocus() {
  setTimeout(() => {
    const el = document.activeElement;
    const typing = Boolean(el && el !== document.body && !el.closest('#barnacle')
      && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
        || (el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|file|color)$/.test(el.type))));
    document.body.classList.toggle('bn-kbd', typing && bnTouchy());
  }, 0);
}

// Keep the sheet above the on-screen keyboard (the layout viewport doesn't shrink for it on iOS).
function bnOnViewport() {
  const root = $('#barnacle');
  if (!root) return;
  const vv = window.visualViewport;
  const kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
  root.style.setProperty('--bn-kb', `${kb}px`);
  root.style.setProperty('--bn-avail', `${vv ? Math.round(vv.height) : window.innerHeight}px`);
}

// A short burst of float and pulse when Barnacle arrives or has news, then it rests (nothing moves for more than a few seconds).
function bnWave() {
  const orb = $('#bn-bubble');
  if (!orb || bnCalm()) return;
  orb.classList.remove('bn-wave');
  void orb.offsetWidth; // restart the sequence
  orb.classList.add('bn-wave');
  clearTimeout(B.waveTimer);
  B.waveTimer = setTimeout(() => orb.classList.remove('bn-wave'), 4800);
}

/* ---------------------------------------------------------------- agent + conversation */
function bnPickAgent() {
  const active = H.agents.filter((a) => a.status === 'active');
  const saved = active.find((a) => a.id === B.agentId);
  const chief = active.find((a) => a.handle === 'chief-of-staff' || /chief of staff/i.test(`${a.name} ${a.role}`));
  const patch = active.find((a) => a.handle === 'patch');
  return saved || chief || patch || active[0] || null;
}

async function bnLoad() {
  if (B.busy) return;
  B.busy = true;
  try {
    await hxLoadAgents();
    const agent = bnPickAgent();
    bnDrawAgentPicker(agent);
    if (!agent) { bnDrawNoAgent(); return; }
    B.agentId = agent.id;
    B.agentName = agent.name;
    $('#bn-title').textContent = agent.name;
    const sub = $('#bn-sub');
    const rt = agentRuntime(agent);
    sub.textContent = rt.kind === 'model' ? `Barnacle · ${shortModel(rt.model)}` : 'Barnacle · rule-based stand-in';
    sub.title = rt.kind === 'model' ? `Replies come from ${rt.model}${rt.provider ? ` via ${rt.provider}` : ''}. Changes still wait for your approval.`
      : 'No model is connected, so replies come from a rule-based stand-in.';
    $('#bn-input').placeholder = `Message ${agent.name}`;
    if (S.ws.role === 'viewer') { bnDrawNote('You have view-only access, so you can’t chat with agents in this workspace.'); return; }
    if (!B.channel || !B.channel.dm_with || B.channel.dm_with.member_id !== agent.id) {
      B.channel = await guard(() => api('POST', wsPath('/dms'), { member_id: agent.id, member_type: 'agent' }));
    }
    if (!B.channel) return;
    $('#bn-full').href = hxHashFor(B.channel.id);
    $('#bn-form').hidden = false;
    await bnLoadMessages(true);
  } finally {
    B.busy = false;
    bnDrawMini();
  }
}

function bnDrawAgentPicker(current) {
  const active = H.agents.filter((a) => a.status === 'active');
  const wrap = $('#bn-agent-wrap');
  wrap.hidden = active.length < 2;
  $('#bn-agent').innerHTML = active.map((a) => `<option value="${esc(a.id)}"${current && a.id === current.id ? ' selected' : ''}>${esc(a.name)} (@${esc(a.handle)})</option>`).join('');
}

function bnDrawNoAgent() {
  $('#bn-form').hidden = true;
  $('#bn-title').textContent = 'Barnacle';
  $('#bn-sub').textContent = 'No agent yet';
  const owner = S.ws.role === 'owner';
  $('#bn-msgs').innerHTML = `<li class="bn-empty"><h3>Meet your first agent</h3>
    <p>${owner ? 'Barnacle talks through an agent. Set up PATCH: it keeps its memories in PATCH’s ledger and asks before changing anything.' : 'Ask the workspace owner to set up an agent.'}</p>
    ${owner ? '<button type="button" class="bn-btn" data-bn="setup">Set up PATCH</button>' : ''}</li>`;
}

function bnDrawNote(text) {
  $('#bn-form').hidden = true;
  $('#bn-msgs').innerHTML = `<li class="bn-empty"><p>${esc(text)}</p></li>`;
}

// One message, plus a quiet notice when a model failed and the stand-in answered for it.
function bnMessage(m) {
  const fell = m.author_type === 'agent' && BN_FALLBACK.exec(m.content || '');
  if (!fell) return hxMessage(m, true);
  const html = hxMessage({ ...m, content: (m.content || '').replace(BN_FALLBACK, '') }, true);
  const note = `<p class="bn-fallback" title="${esc(fell[1])}">The model didn’t answer, so the rule-based stand-in replied.</p>`;
  return html.replace(/<\/div><\/li>\s*$/, `${note}</div></li>`);
}

async function bnLoadMessages(first = false) {
  const ch = B.channel;
  if (!ch) return;
  const list = await guard(() => api('GET', `/api/os/channels/${ch.id}/messages?limit=40`));
  if (!list || !B.channel || B.channel.id !== ch.id) return;
  const el = $('#bn-msgs');
  const stick = first || el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  el.innerHTML = list.length ? list.map(bnMessage).join('') : bnEmpty();
  if (B.failed) el.insertAdjacentHTML('beforeend', bnErrorRow());
  if (stick) el.scrollTop = el.scrollHeight;
  const lastAgent = [...list].reverse().find((m) => m.author_type === 'agent');
  B.lastLine = lastAgent ? (lastAgent.content || '').replace(BN_FALLBACK, '').split('\n')[0].slice(0, 90) : '';
  B.waiting = list.reduce((n, m) => n + (m.approvals || []).filter((a) => a.status === 'pending').length, 0);
  bnDrawWaiting();
  bnDrawMini();
}

function bnEmpty() {
  return `<li class="bn-empty"><h3>No messages yet</h3>
    <p>Ask ${esc(B.agentName)} to plan, write or remember something. Each change comes back as a card, and nothing is saved until you approve it. Open an entry or select text first and ${esc(B.agentName)} can see it too.</p>
    <div class="bn-sugg">${BN_SUGGESTIONS.map((t) => `<button type="button" class="bn-chip-btn" data-bn-fill="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <button type="button" class="bn-btn" data-bn="demo">Play the demo</button></li>`;
}

function bnDrawWaiting() {
  const pill = $('#bn-wait');
  if (!pill) return;
  pill.hidden = !B.waiting;
  pill.textContent = `${B.waiting} waiting`;
  pill.setAttribute('aria-label', `${B.waiting} ${B.waiting === 1 ? 'change is' : 'changes are'} waiting for your approval. Show the first one.`);
}

/* ---------------------------------------------------------------- context */
function bnPageContext() {
  const view = bnView();
  const ctx = { view };
  if (view === 'journal' && S.currentEntry) Object.assign(ctx, { kind: 'journal_entry', id: S.currentEntry.id, title: S.currentEntry.title });
  else if (view === 'planner' && S.lastEvent) Object.assign(ctx, { kind: 'event', id: S.lastEvent.id, title: S.lastEvent.title });
  return ctx;
}

function bnContextKey(ctx) { return ctx.id ? `${ctx.kind}:${ctx.id}` : ''; }

function bnContextToSend() {
  const ctx = bnPageContext();
  const out = { view: ctx.view };
  if (ctx.id && bnContextKey(ctx) !== B.hideContext) Object.assign(out, { kind: ctx.kind, id: ctx.id });
  if (B.selection) out.selection = B.selection;
  return out;
}

function bnDrawContext() {
  const box = $('#bn-ctx');
  if (!box) return;
  const ctx = bnPageContext();
  const chips = [];
  if (ctx.id && bnContextKey(ctx) !== B.hideContext) {
    chips.push(`<span class="bn-chip"><span class="bn-chip-text">${ctx.kind === 'event' ? 'Event' : 'Entry'} · ${esc(ctx.title)}</span>
      <button type="button" data-bn="drop-page" aria-label="Don’t share this ${ctx.kind === 'event' ? 'event' : 'entry'}">×</button></span>`);
  }
  if (B.selection) {
    chips.push(`<span class="bn-chip"><span class="bn-chip-text">Selected · “${esc(B.selection)}”</span>
      <button type="button" data-bn="drop-selection" aria-label="Don’t share the selected text">×</button></span>`);
  }
  box.hidden = !chips.length;
  box.innerHTML = chips.length ? `<span class="bn-ctx-label">Shared with your next message</span>${chips.join('')}` : '';
}

function bnReadSelection() {
  const el = document.activeElement;
  if (el && el.closest && el.closest('#barnacle')) return null; // ignore selections inside Barnacle
  if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && /^(text|search)$/.test(el.type)))) {
    const { selectionStart: a, selectionEnd: b } = el;
    return typeof a === 'number' && b > a ? el.value.slice(a, b) : '';
  }
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed) return '';
  const node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement);
  if (node && node.closest('#barnacle')) return null;
  return sel.toString();
}

function bnSnapshotSelection() {
  const text = bnReadSelection();
  if (text && text.trim().length >= 3) { B.selection = text.trim().replace(/\s+/g, ' ').slice(0, 500); bnDrawContext(); }
}

let bnSelTimer = null;
function bnOnSelectionChange() {
  clearTimeout(bnSelTimer);
  bnSelTimer = setTimeout(() => {
    const text = bnReadSelection();
    if (!text) return;
    const clean = text.trim().replace(/\s+/g, ' ').slice(0, 500);
    if (clean.length < 12) return;
    B.selection = clean;
    bnDrawContext();
    if (B.mode !== 'open' && clean !== B.offered && /^(journal|planner|companion)$/.test(bnView())) {
      B.offered = clean;
      bnPeek(`<p>Want me to keep “${esc(clean.length > 48 ? `${clean.slice(0, 48)}…` : clean)}”?</p>
        <div class="bn-row"><button type="button" class="bn-btn" data-bn="remember">Ask Barnacle</button><button type="button" class="bn-btn ghost" data-bn="peek-close">Dismiss</button></div>`, 7000);
    }
  }, 500);
}

function bnClearStaleSelection(e) {
  if (e.target && e.target.closest && e.target.closest('#barnacle')) return;
  setTimeout(() => {
    if (bnReadSelection() === '' && B.selection) { B.selection = ''; bnDrawContext(); }
  }, 0);
}

/* ---------------------------------------------------------------- peek */
function bnPeek(html, ms) {
  const peek = $('#bn-peek');
  if (!peek || B.mode === 'open') return;
  peek.innerHTML = html;
  peek.hidden = false;
  $('#bn-dock').classList.remove('bn-tucked');
  clearTimeout(B.peekTimer);
  if (ms) B.peekTimer = setTimeout(bnHidePeek, ms);
}

function bnHidePeek() {
  const peek = $('#bn-peek');
  if (peek) { peek.hidden = true; peek.innerHTML = ''; }
  clearTimeout(B.peekTimer);
}

/* ---------------------------------------------------------------- composer + sending */
function bnBindComposer() {
  const form = $('#bn-form');
  const ta = $('#bn-input');
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 2, 140)}px`; };
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  ta.addEventListener('focus', () => setTimeout(bnOnViewport, 300));
  form.addEventListener('submit', (e) => { e.preventDefault(); bnSend(); });
}

function bnErrorRow() {
  return `<li class="bn-error" role="alert"><p>Your message didn’t send. Check your connection, then try again.</p>
    <button type="button" class="bn-btn" data-bn="retry">Try again</button></li>`;
}

async function bnSend(text) {
  const ta = $('#bn-input');
  const btn = $('#bn-form .bn-send');
  const content = (text || ta.value).trim();
  if (!content || !B.channel || B.sending) return;
  B.sending = true;
  B.failed = '';
  btn.disabled = true;
  ta.value = '';
  ta.style.height = '';
  const list = $('#bn-msgs');
  $$('.bn-empty, .bn-error', list).forEach((n) => n.remove());
  // Show the message straight away, with the agent "typing" under it.
  list.insertAdjacentHTML('beforeend', `<li class="hx-msg human bn-sending"><div class="hx-av">${personAvatar(S.user.display_name || S.user.handle)}</div>
      <div class="hx-body"><div class="hx-meta"><b>${esc(S.user.display_name || S.user.handle)}</b><time>Sending…</time></div><p class="hx-text">${esc(content)}</p></div></li>
    <li class="bn-typing" aria-label="${esc(B.agentName)} is thinking"><span class="bn-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>${esc(B.agentName)} is thinking</span></li>`);
  list.scrollTop = list.scrollHeight;
  bnDrawMini();
  let res = null;
  try {
    res = await api('POST', `/api/os/channels/${B.channel.id}/messages`, { content, now: localIso(new Date()), context: bnContextToSend() });
  } catch (err) {
    if (err && err.message === 'Signed out') return;
    res = null;
  } finally {
    B.sending = false;
    btn.disabled = false;
  }
  if (!res) {
    B.failed = content;
    $$('.bn-sending, .bn-typing', list).forEach((n) => n.remove());
    list.insertAdjacentHTML('beforeend', bnErrorRow());
    ta.value = content; // nothing typed is lost
    list.scrollTop = list.scrollHeight;
    bnAnnounce('Your message didn’t send.');
    bnDrawMini();
    return;
  }
  B.selection = '';
  bnDrawContext();
  await bnLoadMessages(true);
  const reply = (res.replies || [])[0];
  const cards = (res.replies || []).reduce((n, r) => n + (r.tool_calls || []).length, 0);
  bnAnnounce(reply ? `${B.agentName} replied${cards ? ` and asked to make ${cards === 1 ? 'a change' : `${cards} changes`}` : ''}.` : 'Sent.');
  if (cards) {
    bnRefreshBadge();
    const last = $$('#bn-msgs .apv.pending').pop();
    if (last) { last.classList.add('bn-new'); last.scrollIntoView({ block: 'nearest' }); }
  }
  if (!bnTouchy()) ta.focus();
}

function bnAnnounce(text) {
  const el = $('#bn-announce');
  if (!el) return;
  el.textContent = '';
  setTimeout(() => { el.textContent = text; }, 50);
}

async function bnDemo() {
  if (B.mode !== 'open') await bnSetMode('open');
  if (!B.channel && S.ws.role === 'owner' && !H.agents.some((a) => a.status === 'active')) {
    // Asking for the demo is asking for an agent to demo with.
    const res = await guard(() => api('POST', wsPath('/harness/bootstrap'), { now: localIso(new Date()) }));
    if (!res) return;
    toast('Set up PATCH for the demo.');
    B.channel = null;
    await bnLoad();
  }
  const ta = $('#bn-input');
  if (!B.channel || !ta || $('#bn-form').hidden) return;
  ta.value = '';
  ta.focus();
  for (const ch of BN_DEMO_TEXT) {
    ta.value += ch;
    if (!bnCalm()) await bnWait(16); // types it out so people can follow along
  }
  await bnWait(bnCalm() ? 0 : 250);
  await bnSend();
  const card = $$('#bn-msgs .apv.pending').pop();
  if (card) toast('That card is real. Approve to save the event, or Reject. Nothing changes until you decide.');
}

/* ---------------------------------------------------------------- clicks */
async function bnOnClick(e) {
  const t = e.target;
  const decide = t.closest('[data-decide]');
  if (decide) return bnDecide(decide.dataset.id, decide.dataset.decide === 'approve', decide);
  const goto = t.closest('[data-goto]');
  if (goto) {
    S.cursor = parseIso(goto.dataset.goto);
    if (bnView() === 'planner') { e.preventDefault(); route(); } // same hash: redraw in place
    else if (bnPhone()) bnSetMode('mini');
    return undefined;
  }
  if (t.closest('#bn-full') && bnPhone()) { bnSetMode('mini'); return undefined; }
  const fill = t.closest('[data-bn-fill]');
  if (fill) { const ta = $('#bn-input'); ta.value = fill.dataset.bnFill; ta.focus(); return undefined; }
  const act = t.closest('[data-bn]');
  if (!act) return undefined;
  switch (act.dataset.bn) {
    case 'close': return bnClose();
    case 'minimize': return bnSetMode('mini');
    case 'expand': return B.dragged ? undefined : bnOpen();
    case 'demo': return bnDemo();
    case 'retry': { const text = B.failed; $$('.bn-error').forEach((n) => n.remove()); $('#bn-input').value = ''; return bnSend(text); }
    case 'jump-pending': {
      const card = $('#bn-msgs .apv.pending');
      if (card) { card.scrollIntoView({ block: 'center', behavior: bnCalm() ? 'auto' : 'smooth' }); ($('[data-decide="approve"]', card) || card).focus({ preventScroll: true }); }
      return undefined;
    }
    case 'flip-side': return bnMoveTo(`${B.corner[0]}${B.corner.endsWith('l') ? 'r' : 'l'}`);
    case 'intro-demo': store.set('barnacle.intro', true); bnHidePeek(); return bnDemo();
    case 'intro-later': store.set('barnacle.intro', true); return bnHidePeek();
    case 'peek-close': return bnHidePeek();
    case 'remember': {
      await bnOpen();
      const ta = $('#bn-input');
      if (ta && !$('#bn-form').hidden) { ta.value = 'Remember this'; ta.focus(); }
      return undefined;
    }
    case 'drop-page': B.hideContext = bnContextKey(bnPageContext()); return bnDrawContext();
    case 'drop-selection': B.selection = ''; return bnDrawContext();
    case 'setup': {
      act.disabled = true;
      const res = await guard(() => api('POST', wsPath('/harness/bootstrap'), { now: localIso(new Date()) }));
      act.disabled = false;
      if (res) { B.channel = null; await bnLoad(); }
      return undefined;
    }
    default: return undefined;
  }
}

async function bnDecide(id, approve, btn) {
  const card = btn.closest('.apv');
  $$('button', card).forEach((b) => { b.disabled = true; });
  const res = await guard(() => api('POST', `/api/os/approvals/${id}/${approve ? 'approve' : 'reject'}`, {}));
  if (res) toast(approve ? hxDoneText(res) : 'Rejected. Nothing changed.');
  await bnLoadMessages();
  bnRefreshBadge();
  // Redraw the page behind the panel if the approved change shows up there.
  const r = (res && res.result) || {};
  const view = bnView();
  if (((r.event || r.deleted) && view === 'planner') || (r.entry && view === 'journal') || (r.memory && view === 'companion')) route();
  if (H.mounted) hxRefresh({ messages: true, thread: Boolean(H.thread), pending: true });
  const again = $(`#bn-msgs [data-card="${CSS.escape(id)}"]`);
  if (again) again.focus();
}

/* ---------------------------------------------------------------- presence */
// An automation posted while the live feed may be idle (it only runs while
// Barnacle or Channels is open), so the clock tells Barnacle directly.
function bnNotice(message, inMyDm) {
  if (!B.mounted) return;
  bnRefreshBadge();
  if (!inMyDm) return;
  if (B.mode !== 'closed' && (!B.channel || B.channel.id === message.channel_id)) bnLoadMessages();
  else if (B.mode === 'closed') { $('#bn-bubble').classList.add('has-news'); bnWave(); }
}

async function bnRefreshBadge() {
  if (!B.mounted) return;
  const pending = await guard(() => api('GET', wsPath('/approvals?status=pending')));
  const badge = $('#bn-badge');
  if (!badge || !pending) return;
  badge.hidden = !pending.length;
  badge.textContent = pending.length > 9 ? '9+' : String(pending.length);
  $('#bn-bubble').setAttribute('aria-label', `${B.mode === 'open' ? 'Close' : 'Open'} Barnacle${pending.length ? `, ${pending.length} waiting for approval` : ''}`);
  if (B.channel) {
    B.waiting = pending.filter((p) => p.channel_id === B.channel.id).length;
    bnDrawWaiting();
    bnDrawMini();
  }
}

function bnOnChange(ev) {
  if (!B.mounted) return;
  const mine = B.channel && ev.channel_id === B.channel.id;
  if (ev.type === 'approval' || ev.type === 'message') {
    clearTimeout(B.refreshTimer);
    B.refreshTimer = setTimeout(() => {
      bnRefreshBadge();
      if (mine && B.mode !== 'closed' && !B.sending) bnLoadMessages();
    }, 200);
  }
  if (mine && B.mode === 'closed' && ev.type === 'message') { $('#bn-bubble').classList.add('has-news'); bnWave(); }
}
