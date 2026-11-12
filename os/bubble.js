/* Journal OS — Barnacle, the floating companion.

   A gold bubble that stays on screen in every Journal OS view and opens a
   compact chat with one agent (Chief of Staff if there is one, else PATCH).
   It is a DM in the Channels system: messages go through the same
   `messages` table, agent tool calls become the same approval cards, and
   nothing is written until someone presses Approve.

   It can share lightweight context with the agent: the journal entry or
   event you have open and any text you selected. The panel shows what will
   be shared and lets you remove it before sending.

   Uses helpers from os.js (S, $, $$, esc, api, guard, toast, store, wsPath,
   parseIso, localIso) and harness.js (H, hxLoadAgents, hxMessage, LiveFeed,
   hxHashFor, hxRefresh). */
'use strict';

const BN_DEMO_TEXT = 'Schedule a robotics build session tomorrow at 11 for 90 minutes';
const BN_SUGGESTIONS = [
  'Schedule a robotics build session tomorrow at 11 for 90 minutes',
  'Create a journal entry for my robotics build session',
  'Remember that I test new prints on Thursdays',
];

const B = {
  mounted: false,
  open: false,
  agentId: null,
  channel: null,
  selection: '',
  offered: '',
  hideContext: '',
  peekTimer: null,
  refreshTimer: null,
  busy: false,
};

const Barnacle = { mount: bnMount, unmount: bnUnmount, onRoute: bnOnRoute };

const bnWait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const bnCalm = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const bnPhone = () => window.matchMedia('(max-width: 640px)').matches;
const bnView = () => (location.hash || '#planner').slice(1).split('?')[0];

/* ---------------------------------------------------------------- mount */
function bnMount() {
  if (B.mounted || !S.user) return;
  B.mounted = true;
  const root = document.createElement('div');
  root.className = 'barnacle';
  root.id = 'barnacle';
  root.innerHTML = `
    <div class="bn-peek" id="bn-peek" role="status" hidden></div>
    <section class="bn-panel" id="bn-panel" role="dialog" aria-modal="false" aria-labelledby="bn-title" hidden>
      <header class="bn-head">
        <span class="bn-mark" aria-hidden="true">B</span>
        <div class="bn-who">
          <h2 id="bn-title" tabindex="-1">Barnacle</h2>
          <p id="bn-sub">Your companion on every page</p>
        </div>
        <div class="bn-tools">
          <button type="button" class="bn-btn ghost" data-bn="demo">Demo</button>
          <a class="bn-btn ghost" id="bn-full" href="#channels" title="Open this conversation in Channels">Channels</a>
          <button type="button" class="bn-btn icon" data-bn="close" aria-label="Close Barnacle">×</button>
        </div>
      </header>
      <label class="bn-agent" id="bn-agent-wrap" hidden><span>Talking with</span><select id="bn-agent"></select></label>
      <ol class="bn-msgs" id="bn-msgs" aria-label="Conversation"></ol>
      <div class="bn-ctx" id="bn-ctx" hidden></div>
      <form class="bn-compose" id="bn-form" autocomplete="off">
        <label class="sr" for="bn-input">Message Barnacle</label>
        <textarea id="bn-input" rows="1" placeholder="Message your agent"></textarea>
        <button type="submit" class="bn-send" aria-label="Send">Send</button>
      </form>
    </section>
    <button type="button" class="bn-bubble" id="bn-bubble" aria-expanded="false" aria-controls="bn-panel" aria-label="Open Barnacle">
      <span class="bn-orb" aria-hidden="true"><span class="bn-b">B</span></span>
      <span class="bn-badge" id="bn-badge" hidden></span>
    </button>`;
  document.body.appendChild(root);
  document.body.classList.add('has-barnacle');

  $('#bn-bubble').addEventListener('pointerdown', bnSnapshotSelection);
  $('#bn-bubble').addEventListener('click', () => (B.open ? bnClose() : bnOpen()));
  root.addEventListener('click', bnOnClick);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && B.open) { e.preventDefault(); bnClose(); } });
  $('#bn-agent').addEventListener('change', (e) => { B.agentId = e.target.value; store.set('barnacle.agent', B.agentId); B.channel = null; bnLoad(); });
  bnBindComposer();
  document.addEventListener('selectionchange', bnOnSelectionChange);
  document.addEventListener('mouseup', bnClearStaleSelection);
  document.addEventListener('keyup', bnClearStaleSelection);
  LiveFeed.on(bnOnChange);
  B.agentId = store.get('barnacle.agent', null);
  bnRefreshBadge();
  if (!store.get('barnacle.intro', false)) {
    setTimeout(() => bnPeek(`<p><b>Hi, I’m Barnacle.</b> I stay with you in the planner, journal and channels, and I ask before I change anything.</p>
      <div class="bn-row"><button type="button" class="bn-btn" data-bn="intro-demo">Show me</button><button type="button" class="bn-btn ghost" data-bn="intro-later">Not now</button></div>`, 0), 900);
  }
}

function bnUnmount() {
  if (!B.mounted) return;
  B.mounted = false;
  B.open = false;
  B.channel = null;
  LiveFeed.off(bnOnChange);
  LiveFeed.release('barnacle');
  document.removeEventListener('selectionchange', bnOnSelectionChange);
  document.removeEventListener('mouseup', bnClearStaleSelection);
  document.removeEventListener('keyup', bnClearStaleSelection);
  clearTimeout(B.peekTimer);
  const root = $('#barnacle');
  if (root) root.remove();
  document.body.classList.remove('has-barnacle', 'bn-open');
}

function bnOnRoute() {
  if (!B.mounted) return;
  B.hideContext = '';
  bnHidePeek();
  bnDrawContext();
  clearTimeout(B.refreshTimer);
  B.refreshTimer = setTimeout(bnRefreshBadge, 400);
}

/* ---------------------------------------------------------------- open / close */
async function bnOpen() {
  if (!B.mounted) return;
  bnHidePeek();
  B.open = true;
  document.body.classList.add('bn-open');
  $('#bn-panel').hidden = false;
  $('#bn-bubble').setAttribute('aria-expanded', 'true');
  $('#bn-bubble').setAttribute('aria-label', 'Close Barnacle');
  $('#bn-bubble').classList.remove('has-news');
  LiveFeed.hold('barnacle');
  bnDrawContext();
  await bnLoad();
  const ta = $('#bn-input');
  if (!bnPhone() && ta && !$('#bn-form').hidden) ta.focus(); else $('#bn-title').focus();
}

function bnClose() {
  B.open = false;
  document.body.classList.remove('bn-open');
  $('#bn-panel').hidden = true;
  const bubble = $('#bn-bubble');
  bubble.setAttribute('aria-expanded', 'false');
  bubble.setAttribute('aria-label', 'Open Barnacle');
  LiveFeed.release('barnacle');
  bubble.focus();
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
    const sub = $('#bn-sub');
    sub.textContent = `with ${agent.name}${agent.model === 'none' ? ' · stand-in' : ''}`;
    sub.title = agent.model === 'none' ? 'No model is connected yet, so replies come from a rule-based stand-in.' : agent.model;
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
  $('#bn-sub').textContent = 'No agent yet';
  const owner = S.ws.role === 'owner';
  $('#bn-msgs').innerHTML = `<li class="bn-intro"><h3>Meet your first agent</h3>
    <p>${owner ? 'Barnacle talks through an agent. Set up PATCH, who keeps its memories in PATCH’s ledger and asks before changing anything.' : 'Ask the workspace owner to set up an agent.'}</p>
    ${owner ? '<button type="button" class="bn-btn" data-bn="setup">Set up PATCH</button>' : ''}</li>`;
}

function bnDrawNote(text) {
  $('#bn-form').hidden = true;
  $('#bn-msgs').innerHTML = `<li class="bn-intro"><p>${esc(text)}</p></li>`;
}

async function bnLoadMessages(first = false) {
  const ch = B.channel;
  if (!ch) return;
  const list = await guard(() => api('GET', `/api/os/channels/${ch.id}/messages?limit=40`));
  if (!list || !B.channel || B.channel.id !== ch.id) return;
  const el = $('#bn-msgs');
  const stick = first || el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  el.innerHTML = list.length ? list.map((m) => hxMessage(m, true)).join('') : bnIntro();
  if (stick) el.scrollTop = el.scrollHeight;
}

function bnIntro() {
  return `<li class="bn-intro"><h3>On every page, asking first</h3>
    <p>Ask for planner, journal or memory changes. Each one comes back as a card, and nothing is saved until you approve it. Open an entry or select text and I can see it too.</p>
    <div class="bn-sugg">${BN_SUGGESTIONS.map((t) => `<button type="button" class="bn-chip-btn" data-bn-fill="${esc(t)}">${esc(t)}</button>`).join('')}</div>
    <button type="button" class="bn-btn" data-bn="demo">Play the demo</button></li>`;
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
    chips.push(`<span class="bn-chip">${ctx.kind === 'event' ? 'Event' : 'Journal entry'} · “${esc(ctx.title)}”
      <button type="button" data-bn="drop-page" aria-label="Don't share this ${ctx.kind === 'event' ? 'event' : 'entry'}">×</button></span>`);
  }
  if (B.selection) {
    chips.push(`<span class="bn-chip">Selected · “${esc(B.selection.length > 60 ? `${B.selection.slice(0, 60)}…` : B.selection)}”
      <button type="button" data-bn="drop-selection" aria-label="Don't share the selected text">×</button></span>`);
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
    if (!B.open && clean !== B.offered && /^(journal|planner|companion)$/.test(bnView())) {
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
  if (!peek || B.open) return;
  peek.innerHTML = html;
  peek.hidden = false;
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
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 4, 140)}px`; };
  ta.addEventListener('input', autosize);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); bnSend(); });
}

async function bnSend() {
  const ta = $('#bn-input');
  const btn = $('#bn-form .bn-send');
  const content = ta.value.trim();
  if (!content || !B.channel) return;
  btn.disabled = true;
  const res = await guard(() => api('POST', `/api/os/channels/${B.channel.id}/messages`,
    { content, now: localIso(new Date()), context: bnContextToSend() }));
  btn.disabled = false;
  if (!res) return;
  ta.value = '';
  ta.style.height = '';
  B.selection = '';
  bnDrawContext();
  await bnLoadMessages(true);
  const cards = res.replies.reduce((n, r) => n + (r.tool_calls || []).length, 0);
  if (cards) {
    bnRefreshBadge();
    const last = $$('#bn-msgs .apv.pending').pop();
    if (last) { last.classList.add('bn-new'); last.scrollIntoView({ block: 'nearest' }); }
  }
  if (!bnPhone()) ta.focus();
}

async function bnDemo() {
  if (!B.open) await bnOpen();
  if (!B.channel && S.ws.role === 'owner' && !H.agents.some((a) => a.status === 'active')) {
    // Asking for the demo is asking for an agent to demo with.
    const res = await guard(() => api('POST', wsPath('/harness/bootstrap')));
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
    return undefined;
  }
  const fill = t.closest('[data-bn-fill]');
  if (fill) { const ta = $('#bn-input'); ta.value = fill.dataset.bnFill; ta.focus(); return undefined; }
  const act = t.closest('[data-bn]');
  if (!act) return undefined;
  switch (act.dataset.bn) {
    case 'close': return bnClose();
    case 'demo': return bnDemo();
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
      const res = await guard(() => api('POST', wsPath('/harness/bootstrap')));
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
async function bnRefreshBadge() {
  if (!B.mounted) return;
  const pending = await guard(() => api('GET', wsPath('/approvals?status=pending')));
  const badge = $('#bn-badge');
  if (!badge || !pending) return;
  badge.hidden = !pending.length;
  badge.textContent = pending.length > 9 ? '9+' : String(pending.length);
  $('#bn-bubble').setAttribute('aria-label', `${B.open ? 'Close' : 'Open'} Barnacle${pending.length ? `, ${pending.length} waiting for approval` : ''}`);
}

function bnOnChange(ev) {
  if (!B.mounted) return;
  const mine = B.channel && ev.channel_id === B.channel.id;
  if (ev.type === 'approval' || ev.type === 'message') {
    clearTimeout(B.refreshTimer);
    B.refreshTimer = setTimeout(() => {
      bnRefreshBadge();
      if (mine && B.open) bnLoadMessages();
    }, 200);
  }
  if (mine && !B.open && ev.type === 'message') $('#bn-bubble').classList.add('has-news');
}
