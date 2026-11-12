/* Journal OS — Channels. Slack-style rooms and DMs where you and your agents
   talk. Agents can say anything, but every change they ask for arrives as an
   approval card and runs only after a person presses Approve.

   Live updates: GET /api/os/w/{ws}/stream is read with fetch (not
   EventSource) so the session token stays in a header instead of the URL.
   Uses helpers from os.js: $, $$, esc, api, guard, toast, S, wsPath,
   pixelSvg, portrait, PORTRAIT, fmtWhen, fmtTime, dayKey, localIso, parseIso. */
'use strict';

const AGENT_FACE = [
  '.....kk.....', '......k.....', '.kkkkkkkkkk.', '.kcccccccck.', '.kcggccggck.', '.kcggccggck.',
  '.kcccccccck.', '.kcckkkkcck.', '.kcccccccck.', '.kkkkkkkkkk.', '...kk..kk...', '............',
];
const AGENT_TINTS = ['c', 'p', 'a', 'b', 'm'];
const TOOL_LABEL = {
  create_event: 'Add to planner', update_event: 'Reschedule', delete_event: 'Delete event',
  create_journal_entry: 'New journal entry', propose_memory: 'Propose memory',
  schedule_companion_activity: 'Companion session', post_message: 'Post in another channel',
};
const TYPE_NOTE = { private: 'private', 'agent-room': 'agent room' };
const MENTION_RE = /(^|[^\w@])@([A-Za-z0-9_-]{1,32})/g;

const H = {
  mounted: false,
  channels: [],
  agents: [],
  agentsById: {},
  pending: [],
  channel: null,
  messages: [],
  thread: null,
  unread: new Set(),
  seen: new Set(),
  dirty: {},
  flushTimer: null,
};

const Harness = { view: harnessView, leave: harnessLeave };

/* ---------------------------------------------------------------- helpers */
const hxHash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const hxIsOwner = () => Boolean(S.ws && S.ws.role === 'owner');
const hxSigil = (ch) => (ch.type === 'dm' ? '@' : '#');
const hxChannelName = (ch) => (ch.type === 'dm' ? (ch.dm_with ? ch.dm_with.name : 'Direct message') : ch.name);
const hxLabel = (ch) => hxSigil(ch) + hxChannelName(ch);

function agentAvatar(a) {
  a = a || {};
  if (a.companion_name && PORTRAIT[a.companion_name]) return portrait(a.companion_name);
  const tint = AGENT_TINTS[hxHash(a.handle || a.id || a.name || '') % AGENT_TINTS.length];
  return pixelSvg(AGENT_FACE.map((r) => r.replace(/c/g, tint)), 'pix', `${a.name || 'Agent'} avatar`);
}
function personAvatar(name) {
  return `<span class="hx-initial" aria-hidden="true">${esc(String(name || '?').trim().charAt(0).toUpperCase() || '?')}</span>`;
}
function hxAvatar(type, id, name) {
  if (type === 'agent') return agentAvatar(H.agentsById[id] || { name, id });
  if (type === 'companion') return portrait(name);
  return personAvatar(name);
}
function hxStamp(iso) {
  const d = new Date(iso || '');
  if (Number.isNaN(d.getTime())) return '';
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return dayKey(d) === dayKey(new Date()) ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${t}`;
}
function hxRich(text) {
  const handles = new Set(H.agents.map((a) => a.handle));
  return esc(text)
    .replace(MENTION_RE, (all, pre, h) => (handles.has(h.toLowerCase()) ? `${pre}<span class="mention">@${h}</span>` : all))
    .replace(/\n/g, '<br>');
}
function hxCanDecide(ap) {
  const agent = H.agentsById[ap.agent_id];
  return hxIsOwner() || Boolean(agent && agent.owner_id === S.user.id);
}
function hxCanPost() {
  const ch = H.channel;
  return Boolean(ch && S.ws.role !== 'viewer' && !ch.archived_at && ch.my_role !== 'observer');
}
const hxNearEnd = (el) => el.scrollHeight - el.scrollTop - el.clientHeight < 140;
function hxScrollEnd(el) { if (el) el.scrollTop = el.scrollHeight; }

/* ---------------------------------------------------------------- routing */
function hxParams() {
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  return { c: q.get('c'), t: q.get('t') };
}
function hxHashFor(channelId, threadId) {
  const q = new URLSearchParams();
  if (channelId) q.set('c', channelId);
  if (threadId) q.set('t', threadId);
  return '#channels' + (q.toString() ? `?${q}` : '');
}
function hxGo(channelId, threadId) {
  const hash = hxHashFor(channelId, threadId);
  if (location.hash === hash) harnessView(); else location.hash = hash;
}

// View changes run one at a time so a quick double click can't mount twice.
let hxBusy = Promise.resolve();
function harnessView() {
  hxBusy = hxBusy.then(hxViewNow, hxViewNow);
  return hxBusy;
}
async function hxViewNow() {
  if (!H.mounted || !$('#hx')) await hxMount();
  const { c, t } = hxParams();
  const target = c && H.channels.find((x) => x.id === c) ? c : (H.channels[0] || {}).id;
  if (!target) { H.channel = null; hxDrawEmpty(); hxDrawSide(); return; }
  if (!H.channel || H.channel.id !== target) await hxOpenChannel(target);
  if ((t || null) !== H.thread) await hxOpenThread(t || null);
}
function harnessLeave() {
  if (!H.mounted) return;
  H.mounted = false;
  LiveFeed.off(hxOnChange);
  LiveFeed.offState(hxLiveState);
  LiveFeed.release('channels');
  clearTimeout(H.flushTimer);
  H.channel = null; H.thread = null; H.messages = [];
}

/* ---------------------------------------------------------------- mount */
async function hxMount() {
  H.mounted = true; H.channel = null; H.thread = null;
  const canCreate = S.ws.role !== 'viewer';
  $('#view').innerHTML = `<div class="view-head"><div><h1>Channels</h1>
      <p>Talk with your agents in channels and direct messages. Anything an agent wants to change arrives as an approval card and waits for you.</p></div>
      <div class="toolbar"><span id="hx-live" class="live-dot" role="status">Connecting</span></div></div>
    <div class="hx" id="hx">
      <aside class="hx-side" aria-label="Channels and agents">
        <div class="hx-side-head"><h2 id="hx-ch-label">Channels</h2>${canCreate ? '<button type="button" class="btn small" data-new-channel aria-label="New channel">+ New</button>' : ''}</div>
        <ul class="hx-list" id="hx-channels" aria-labelledby="hx-ch-label"></ul>
        <div class="hx-side-head"><h2 id="hx-ag-label">Agents</h2>${hxIsOwner() ? '<button type="button" class="btn small" data-new-agent aria-label="New agent">+ New</button>' : ''}</div>
        <ul class="hx-list" id="hx-agents" aria-labelledby="hx-ag-label"></ul>
        <p class="muted hx-side-note">No model is connected yet, so agents answer with a rule-based stand-in.</p>
      </aside>
      <section class="hx-main" id="hx-main" aria-label="Conversation"><p class="loading">Loading channels…</p></section>
      <aside class="hx-thread" id="hx-thread" aria-label="Thread" hidden></aside>
    </div>
    <div id="hx-announce" class="sr" aria-live="polite"></div>`;
  $('#hx').addEventListener('click', hxOnClick);
  LiveFeed.on(hxOnChange);
  LiveFeed.onState(hxLiveState);
  LiveFeed.hold('channels'); // before loading, so nothing that happens meanwhile is missed
  await hxLoadAgents();
  await Promise.all([hxLoadChannels(), hxLoadPending()]);
  hxDrawSide();
}

/* ---------------------------------------------------------------- data */
async function hxLoadChannels() { const r = await guard(() => api('GET', wsPath('/channels'))); if (r) H.channels = r; }
async function hxLoadAgents() {
  const r = await guard(() => api('GET', wsPath('/agents')));
  if (r) { H.agents = r; H.agentsById = Object.fromEntries(r.map((a) => [a.id, a])); }
}
async function hxLoadPending() { const r = await guard(() => api('GET', wsPath('/approvals?status=pending'))); if (r) H.pending = r; }

function hxRefresh(flags, immediate = false) {
  Object.assign(H.dirty, flags);
  clearTimeout(H.flushTimer);
  if (immediate) return hxFlush();
  H.flushTimer = setTimeout(hxFlush, 150);
  return Promise.resolve();
}
let hxFlushing = Promise.resolve();
function hxFlush() {
  hxFlushing = hxFlushing.then(async () => {
    if (!H.mounted) return;
    const d = H.dirty; H.dirty = {};
    if (d.agents) await hxLoadAgents();
    if (d.channels) await hxLoadChannels();
    if (d.pending) await hxLoadPending();
    if (d.channel && H.channel) {
      const ch = await guard(() => api('GET', `/api/os/channels/${H.channel.id}`));
      if (ch && H.channel && ch.id === H.channel.id) {
        const redraw = ch.archived_at !== H.channel.archived_at || ch.my_role !== H.channel.my_role;
        H.channel = ch;
        if (redraw) { hxDrawMain(); d.messages = true; } else hxDrawHead();
      }
    }
    if (d.messages && H.channel) await hxLoadMessages();
    else hxDrawBanner();
    if (d.thread && H.thread) await hxLoadThread();
    hxDrawSide();
  });
  return hxFlushing;
}

/* ---------------------------------------------------------------- sidebar */
function hxDrawSide() {
  const list = $('#hx-channels');
  if (!list) return;
  const waiting = {};
  H.pending.forEach((p) => { waiting[p.channel_id] = (waiting[p.channel_id] || 0) + 1; });
  const sorted = [...H.channels].sort((a, b) => (a.type === 'dm') - (b.type === 'dm') || hxChannelName(a).localeCompare(hxChannelName(b)));
  list.innerHTML = sorted.map((ch) => {
    const n = waiting[ch.id] || 0;
    const current = Boolean(H.channel && H.channel.id === ch.id);
    return `<li><a class="hx-ch" href="${hxHashFor(ch.id)}"${current ? ' aria-current="page"' : ''}>
      <span class="sig" aria-hidden="true">${hxSigil(ch)}</span><span class="nm">${esc(hxChannelName(ch))}</span>
      ${TYPE_NOTE[ch.type] ? `<small>${TYPE_NOTE[ch.type]}</small>` : ''}
      ${H.unread.has(ch.id) && !current ? '<span class="hx-unread" title="New messages"><span class="sr">new messages</span></span>' : ''}
      ${n ? `<span class="hx-count" title="${n} waiting for approval">${n}<span class="sr"> waiting for approval</span></span>` : ''}</a></li>`;
  }).join('') || '<li class="muted">No channels yet.</li>';
  $('#hx-agents').innerHTML = H.agents.map((a) => `<li><button type="button" class="hx-agent" data-dm="${esc(a.id)}" title="Direct message ${esc(a.name)}">
      ${agentAvatar(a)}<span><b>${esc(a.name)}</b><small>@${esc(a.handle)} · ${a.model === 'none' ? 'stand-in' : esc(a.model)}${a.status !== 'active' ? ` · ${esc(a.status)}` : ''}</small></span></button></li>`).join('')
    || '<li class="muted">No agents yet.</li>';
}

/* ---------------------------------------------------------------- empty state */
function hxDrawEmpty() {
  const owner = hxIsOwner();
  $('#hx-main').innerHTML = `<div class="hx-empty panel paper">
    <h2>No channels yet</h2>
    <p>${owner ? 'Start with #general and PATCH, an agent that keeps its memories in PATCH’s ledger. Mention @patch with a planner, journal or memory request, then approve or reject what it proposes.'
    : 'Ask the workspace owner to set up channels and agents.'}</p>
    <div class="toolbar">${owner ? '<button type="button" class="btn primary" id="hx-boot">Create #general with PATCH</button>' : ''}
      ${S.ws.role !== 'viewer' ? '<button type="button" class="btn" data-new-channel>New channel</button>' : ''}</div></div>`;
  const boot = $('#hx-boot');
  if (boot) boot.addEventListener('click', async () => {
    boot.disabled = true;
    const res = await guard(() => api('POST', wsPath('/harness/bootstrap')));
    boot.disabled = false;
    if (!res) return;
    await hxLoadAgents();
    await hxLoadChannels();
    hxGo(res.channel.id);
  });
  $('#hx-thread').hidden = true;
  $('#hx').classList.remove('has-thread');
}

/* ---------------------------------------------------------------- channel */
async function hxOpenChannel(id) {
  const ch = await guard(() => api('GET', `/api/os/channels/${id}`));
  if (!ch) return;
  H.channel = ch; H.thread = null; H.messages = []; H.seen = new Set();
  H.unread.delete(id);
  $('#hx-thread').hidden = true;
  $('#hx').classList.remove('has-thread');
  hxDrawMain();
  await hxLoadMessages(true);
  hxDrawSide();
  const input = $('#hx-input');
  if (input && window.matchMedia('(min-width: 981px)').matches) input.focus();
}

function hxDrawMain() {
  const ch = H.channel;
  $('#hx-main').innerHTML = `<header class="hx-head" id="hx-head"></header>
    <div class="hx-banner" id="hx-banner" hidden></div>
    <ol class="hx-msgs" id="hx-msgs" aria-label="Messages in ${esc(hxLabel(ch))}"></ol>
    ${hxComposer('hx', ch, null)}`;
  hxDrawHead();
  hxBindComposer($('#hx-form'), () => null);
}

function hxDrawHead() {
  const ch = H.channel;
  const head = $('#hx-head');
  if (!ch || !head) return;
  const members = ch.members || [];
  const agentCount = members.filter((m) => m.member_type === 'agent').length;
  const about = ch.type === 'dm'
    ? (ch.dm_with && ch.dm_with.member_type === 'agent' ? 'Direct message with an agent. It answers every message here; no @mention needed.' : 'Direct message.')
    : (ch.description || 'No description.');
  head.innerHTML = `<div class="hx-title"><h2>${esc(hxLabel(ch))}</h2>
      <p class="muted">${esc(about)}${TYPE_NOTE[ch.type] ? ` <span class="chip">${TYPE_NOTE[ch.type]}</span>` : ''}${ch.archived_at ? ' <span class="chip">Archived</span>' : ''}</p></div>
    <button type="button" class="hx-faces" id="hx-members-btn" aria-label="${members.length} members, ${agentCount} of them agents. Show members">
      ${members.slice(0, 5).map((m) => hxAvatar(m.member_type, m.member_id, m.name)).join('')}<span class="hx-faces-n" aria-hidden="true">${members.length}</span></button>`;
  $('#hx-members-btn').addEventListener('click', hxMembersDialog);
}

function hxStarterHint(ch) {
  const agents = (ch.members || []).filter((m) => m.member_type === 'agent');
  if (!agents.length) return 'Add an agent from the members button to work with one here.';
  const example = 'schedule a robotics build session tomorrow at 11 for 90 minutes';
  if (ch.type === 'dm') return `Try: “${example[0].toUpperCase()}${example.slice(1)}”.`;
  const handle = (H.agentsById[agents[0].member_id] || {}).handle || 'patch';
  return `Try: “@${handle} ${example}”.`;
}

async function hxLoadMessages(first = false) {
  const ch = H.channel;
  if (!ch) return;
  const list = await guard(() => api('GET', `/api/os/channels/${ch.id}/messages?limit=100`));
  if (!list || !H.channel || H.channel.id !== ch.id) return;
  hxAnnounce(list, first);
  H.messages = list;
  const el = $('#hx-msgs');
  if (!el) return;
  const stick = first || hxNearEnd(el);
  el.innerHTML = list.length ? list.map((m) => hxMessage(m, false)).join('')
    : `<li class="hx-start"><p class="muted">This is the start of ${esc(hxLabel(ch))}. ${esc(hxStarterHint(ch))}</p></li>`;
  hxDrawBanner();
  if (stick) hxScrollEnd(el);
}

function hxAnnounce(list, first) {
  const fresh = list.filter((m) => !H.seen.has(m.id));
  list.forEach((m) => H.seen.add(m.id));
  if (first) return;
  const lines = fresh.filter((m) => m.author_id !== S.user.id).map((m) => {
    const waiting = (m.approvals || []).filter((a) => a.status === 'pending').length;
    return `${m.author_name}: ${m.content.slice(0, 140)}${waiting ? ` ${waiting} request waiting for approval.` : ''}`;
  });
  const box = $('#hx-announce');
  if (lines.length && box) box.textContent = lines.join(' ');
}

function hxDrawBanner() {
  const b = $('#hx-banner');
  if (!b || !H.channel) return;
  const here = H.pending.filter((p) => p.channel_id === H.channel.id);
  if (!here.length) { b.hidden = true; b.innerHTML = ''; return; }
  b.hidden = false;
  b.innerHTML = `<span>${here.length} ${here.length === 1 ? 'request is' : 'requests are'} waiting for approval. Nothing runs until someone decides.</span>
    <button type="button" class="btn small" data-jump="${esc(here[0].id)}">Show ${here.length === 1 ? 'it' : 'the first'}</button>`;
}

/* ---------------------------------------------------------------- messages + cards */
function hxMessage(m, inThread) {
  const isAgent = m.author_type === 'agent';
  const agent = isAgent ? H.agentsById[m.author_id] : null;
  const chips = isAgent ? `<span class="chip agent">Agent</span>${!agent || agent.model === 'none'
    ? '<span class="chip stub" title="No model is connected. This reply came from the rule-based stand-in.">Stand-in</span>' : ''}` : '';
  const foot = !inThread && !m.thread_id ? `<div class="hx-msg-foot">
      ${m.reply_count ? `<button type="button" class="hx-replies" data-thread="${esc(m.id)}">${m.reply_count} ${m.reply_count === 1 ? 'reply' : 'replies'}</button>` : ''}
      ${hxCanPost() ? `<button type="button" class="hx-reply" data-thread="${esc(m.id)}">Reply in thread</button>` : ''}</div>` : '';
  return `<li class="hx-msg ${esc(m.author_type)}" id="msg-${esc(m.id)}">
    <div class="hx-av">${isAgent ? agentAvatar(agent || { name: m.author_name, id: m.author_id }) : personAvatar(m.author_name)}</div>
    <div class="hx-body">
      <div class="hx-meta"><b>${esc(m.author_name)}</b>${chips}<time datetime="${esc(m.created_at)}">${esc(hxStamp(m.created_at))}</time></div>
      ${m.content ? `<p class="hx-text">${hxRich(m.content)}</p>` : ''}
      ${hxContextLine(m.context)}
      ${(m.approvals || []).map(hxCard).join('')}
      ${foot}
    </div></li>`;
}

function hxContextLine(ctx) {
  if (!ctx || (!ctx.title && !ctx.selection)) return '';
  const parts = [];
  if (ctx.title) parts.push(`${ctx.kind === 'event' ? 'event' : 'journal entry'} “${esc(ctx.title)}”`);
  if (ctx.selection) parts.push(`selected text “${esc(ctx.selection.length > 80 ? `${ctx.selection.slice(0, 80)}…` : ctx.selection)}”`);
  return `<p class="hx-ctx">Shared ${parts.join(' and ')}</p>`;
}

function hxCardFields(ap) {
  const i = ap.tool_input || {};
  const rows = [];
  const add = (k, v) => { if (v !== undefined && v !== null && v !== '') rows.push(`<dt>${k}</dt><dd>${esc(v)}</dd>`); };
  const when = (s) => (s ? fmtWhen(s) : '');
  const target = ap.target ? `${ap.target.title} · ${fmtWhen(ap.target.start_at)}` : (i.event_id ? 'An event that no longer exists' : '');
  switch (ap.tool_name) {
    case 'create_event':
      add('Title', i.title); add('When', when(i.start_at));
      add('Length', i.duration_minutes ? `${i.duration_minutes} min` : (i.end_at ? `until ${fmtTime(i.end_at)}` : '60 min'));
      if (i.recurrence && i.recurrence !== 'none') add('Repeats', i.recurrence);
      if (i.kind && i.kind !== 'event') add('Type', i.kind);
      break;
    case 'update_event': add('Event', target); add('New start', when(i.start_at)); add('New title', i.title); break;
    case 'delete_event': add('Event', target); break;
    case 'create_journal_entry': add('Title', i.title); add('Linked event', target); add('Text', i.body); break;
    case 'propose_memory': add('Memory', i.content); add('Category', i.category); add('Ledger', (H.agentsById[ap.agent_id] || {}).companion_name); break;
    case 'schedule_companion_activity': add('Title', i.title); add('When', when(i.start_at)); add('Companions', (i.participants || []).join(', ')); break;
    case 'post_message':
      add('Channel', ap.target_channel && !ap.target_channel.startsWith('a private') ? `#${ap.target_channel}` : ap.target_channel);
      add('Text', i.content);
      break;
    default: Object.entries(i).forEach(([k, v]) => add(esc(k), typeof v === 'object' ? JSON.stringify(v) : v));
  }
  return rows.length ? `<dl>${rows.join('')}</dl>` : '';
}

function hxResult(ap) {
  const r = ap.result || {};
  if (r.event) return `<div class="row"><a class="btn small" href="#planner" data-goto="${esc(r.event.start_at)}">Show in planner</a><span class="note">Saved “${esc(r.event.title)}” · ${esc(fmtWhen(r.event.start_at))}</span></div>`;
  if (r.entry) return `<div class="row"><a class="btn small" href="#journal?e=${encodeURIComponent(r.entry.id)}">Open entry</a><span class="note">Created “${esc(r.entry.title)}”.</span></div>`;
  if (r.memory) return `<div class="row"><a class="btn small" href="#companion">Review in ledger</a><span class="note">Proposed to ${esc(r.memory.companion_name)}. It stays a proposal until you approve it in the ledger.</span></div>`;
  if (r.deleted) return `<p class="note">Deleted “${esc(r.title || 'event')}”.</p>`;
  if (r.message_id) return `<div class="row"><a class="btn small" href="${hxHashFor((ap.tool_input || {}).channel_id)}">Open channel</a><span class="note">Posted.</span></div>`;
  return '';
}

function hxCard(ap) {
  const label = TOOL_LABEL[ap.tool_name] || ap.tool_name;
  const by = ap.decided_by_name ? ` by ${esc(ap.decided_by_name)}` : '';
  let state = '';
  let below = '';
  if (ap.status === 'pending') {
    state = '<span class="tag wait">Waiting for approval · nothing saved yet</span>';
    below = hxCanDecide(ap)
      ? `<div class="row"><button type="button" class="btn primary" data-decide="approve" data-id="${esc(ap.id)}">Approve &amp; run</button>
         <button type="button" class="btn" data-decide="reject" data-id="${esc(ap.id)}">Reject</button></div>`
      : '<p class="note">Only the workspace owner or this agent’s owner can decide this.</p>';
  } else if (ap.status === 'approved') {
    state = `<span class="tag ok">Approved${by} · ${esc(hxStamp(ap.decided_at))}</span>`;
    below = hxResult(ap);
  } else if (ap.status === 'rejected') {
    state = `<span class="tag no">Rejected${by} · nothing changed</span>`;
  } else {
    state = `<span class="tag err">Failed${by}</span>`;
    below = `<p class="note">${esc((ap.result && ap.result.error) || 'The request could not run.')}</p>`;
  }
  return `<section class="apv ${esc(ap.status)}" data-card="${esc(ap.id)}" tabindex="-1" aria-label="${esc(`${label} request: ${ap.status}`)}">
    <div class="row">${state}<span class="tag">${esc(label)}</span></div>
    <p class="summary">${esc(ap.summary)}</p>
    ${hxCardFields(ap)}
    ${below}</section>`;
}

/* ---------------------------------------------------------------- composer */
function hxComposer(prefix, ch, threadId) {
  if (!hxCanPost()) {
    const why = S.ws.role === 'viewer' ? 'You have view-only access to this workspace.'
      : ch.archived_at ? 'This channel is archived.' : 'You can read this channel but not post in it.';
    return `<p class="hx-note">${why}</p>`;
  }
  const where = threadId ? 'Reply in thread' : `Message ${hxLabel(ch)}`;
  return `<form class="hx-compose" id="${prefix}-form" autocomplete="off">
    <div class="hx-input-wrap">
      <label class="sr" for="${prefix}-input">${esc(where)}</label>
      <textarea id="${prefix}-input" rows="1" placeholder="${esc(where)}" aria-describedby="${prefix}-hint"
        aria-autocomplete="list" aria-controls="${prefix}-mentions" aria-expanded="false"></textarea>
      <ul class="hx-mentions" id="${prefix}-mentions" role="listbox" aria-label="Agents you can mention" hidden></ul>
    </div>
    <button class="btn primary" type="submit">Send</button>
    <p class="hx-hint" id="${prefix}-hint">Type @ to mention an agent · Enter sends · Shift+Enter adds a line</p>
  </form>`;
}

function hxBindComposer(form, threadOf) {
  if (!form) return;
  const ta = $('textarea', form);
  const list = $('.hx-mentions', form);
  const st = { items: [], index: 0, start: -1 };
  const autosize = () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight + 4, 180)}px`; };
  const close = () => { list.hidden = true; st.items = []; ta.setAttribute('aria-expanded', 'false'); ta.removeAttribute('aria-activedescendant'); };
  const paint = () => {
    list.innerHTML = st.items.map((a, i) => `<li role="option" id="${list.id}-${i}" data-i="${i}" aria-selected="${i === st.index}">
      ${agentAvatar(a)}<span><b>${esc(a.name)}</b> <small>@${esc(a.handle)}</small></span></li>`).join('');
    ta.setAttribute('aria-activedescendant', `${list.id}-${st.index}`);
  };
  const update = () => {
    const before = ta.value.slice(0, ta.selectionStart);
    const m = before.match(/(^|[^\w@])@([A-Za-z0-9_-]{0,32})$/);
    if (!m || !H.channel) return close();
    const q = m[2].toLowerCase();
    const here = new Set((H.channel.members || []).filter((x) => x.member_type === 'agent').map((x) => x.member_id));
    st.items = H.agents.filter((a) => here.has(a.id) && a.status === 'active'
      && (a.handle.startsWith(q) || a.name.toLowerCase().startsWith(q))).slice(0, 6);
    if (!st.items.length) return close();
    st.start = ta.selectionStart - m[2].length - 1;
    st.index = 0;
    list.hidden = false;
    ta.setAttribute('aria-expanded', 'true');
    paint();
  };
  const pick = (i) => {
    const a = st.items[i];
    if (!a) return;
    const rest = ta.value.slice(ta.selectionStart);
    ta.value = `${ta.value.slice(0, st.start)}@${a.handle} ${rest.replace(/^\s+/, '')}`;
    const caret = st.start + a.handle.length + 2;
    ta.setSelectionRange(caret, caret);
    close(); autosize(); ta.focus();
  };
  ta.addEventListener('input', () => { autosize(); update(); });
  ta.addEventListener('click', update);
  ta.addEventListener('blur', () => setTimeout(close, 150));
  ta.addEventListener('keydown', (e) => {
    if (!list.hidden && st.items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        st.index = (st.index + (e.key === 'ArrowDown' ? 1 : -1) + st.items.length) % st.items.length;
        paint();
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(st.index); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
  });
  list.addEventListener('mousedown', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); hxSend(form, threadOf()); });
}

async function hxSend(form, threadId) {
  const ta = $('textarea', form);
  const btn = $('button[type=submit]', form);
  const content = ta.value.trim();
  if (!content || !H.channel) return;
  btn.disabled = true;
  const res = await guard(() => api('POST', `/api/os/channels/${H.channel.id}/messages`,
    { content, thread_id: threadId || null, now: localIso(new Date()) }));
  btn.disabled = false;
  if (!res) return;
  ta.value = '';
  ta.style.height = '';
  const cards = res.replies.reduce((n, r) => n + (r.tool_calls || []).length, 0);
  await hxRefresh({ messages: true, thread: Boolean(H.thread), pending: cards > 0 }, true);
  hxScrollEnd(threadId ? $('#hx-thread-msgs') : $('#hx-msgs'));
  ta.focus();
}

/* ---------------------------------------------------------------- thread */
async function hxOpenThread(rootId) {
  H.thread = rootId || null;
  const panel = $('#hx-thread');
  if (!panel || !H.channel) return;
  if (!H.thread) { panel.hidden = true; panel.innerHTML = ''; $('#hx').classList.remove('has-thread'); return; }
  panel.hidden = false;
  $('#hx').classList.add('has-thread');
  panel.innerHTML = `<div class="hx-thread-head"><h2 id="hx-thread-title">Thread</h2>
      <button type="button" class="btn ghost small" data-close-thread>Close</button></div>
    <ol class="hx-msgs" id="hx-thread-msgs" aria-labelledby="hx-thread-title"></ol>
    ${hxComposer('hxt', H.channel, H.thread)}`;
  hxBindComposer($('#hxt-form'), () => H.thread);
  panel.onkeydown = (e) => { if (e.key === 'Escape') hxGo(H.channel.id, null); };
  await hxLoadThread(true);
  const ta = $('#hxt-input');
  if (ta) ta.focus();
}

async function hxLoadThread(first = false) {
  const ch = H.channel;
  const root = H.thread;
  if (!ch || !root) return;
  const list = await guard(() => api('GET', `/api/os/channels/${ch.id}/messages?thread=${encodeURIComponent(root)}`));
  if (!list || H.thread !== root) return;
  const el = $('#hx-thread-msgs');
  if (!el) return;
  const stick = first || hxNearEnd(el);
  el.innerHTML = list.map((m) => hxMessage(m, true)).join('');
  if (stick) hxScrollEnd(el);
}

/* ---------------------------------------------------------------- actions */
async function hxOnClick(e) {
  const t = e.target;
  const decide = t.closest('[data-decide]');
  if (decide) return hxDecide(decide.dataset.id, decide.dataset.decide === 'approve', decide);
  const goto = t.closest('[data-goto]');
  if (goto) { S.cursor = parseIso(goto.dataset.goto); return undefined; } // the link itself navigates
  if (t.closest('[data-close-thread]')) return hxGo(H.channel.id, null);
  const thread = t.closest('[data-thread]');
  if (thread) return hxGo(H.channel.id, thread.dataset.thread);
  const dm = t.closest('[data-dm]');
  if (dm) return hxOpenDm(dm.dataset.dm);
  const jump = t.closest('[data-jump]');
  if (jump) return hxJump(jump.dataset.jump);
  if (t.closest('[data-new-channel]')) return hxNewChannelDialog();
  if (t.closest('[data-new-agent]')) return hxNewAgentDialog();
  return undefined;
}

function hxDoneText(ap) {
  const r = ap.result || {};
  if (r.event) return `Saved “${r.event.title}” to the planner.`;
  if (r.entry) return `Created journal entry “${r.entry.title}”.`;
  if (r.memory) return 'Memory proposed. Approve it in the Companion ledger to keep it.';
  if (r.deleted) return `Deleted “${r.title}”.`;
  if (r.message_id) return 'Posted.';
  return 'Approved.';
}

async function hxDecide(id, approve, btn) {
  const card = btn.closest('.apv');
  $$('button', card).forEach((b) => { b.disabled = true; });
  const res = await guard(() => api('POST', `/api/os/approvals/${id}/${approve ? 'approve' : 'reject'}`, {}));
  if (res) toast(approve ? hxDoneText(res) : 'Rejected. Nothing changed.');
  await hxRefresh({ messages: true, thread: Boolean(H.thread), pending: true }, true);
  const again = $(`[data-card="${CSS.escape(id)}"]`);
  if (again) again.focus();
}

async function hxOpenDm(agentId) {
  const ch = await guard(() => api('POST', wsPath('/dms'), { member_id: agentId, member_type: 'agent' }));
  if (!ch) return;
  if (!H.channels.find((c) => c.id === ch.id)) await hxLoadChannels();
  hxGo(ch.id);
}

async function hxJump(approvalId) {
  let card = $(`#hx-msgs [data-card="${CSS.escape(approvalId)}"]`);
  if (!card) {
    // The request sits in a thread reply: open that thread first.
    const ap = H.pending.find((p) => p.id === approvalId);
    const msg = ap ? await guard(() => api('GET', `/api/os/messages/${ap.message_id}`)) : null;
    if (msg && msg.thread_id) {
      await hxOpenThread(msg.thread_id);
      history.replaceState(null, '', hxHashFor(H.channel.id, msg.thread_id));
      card = $(`#hx-thread-msgs [data-card="${CSS.escape(approvalId)}"]`);
    }
  }
  if (!card) return;
  card.scrollIntoView({ block: 'center' });
  ($('[data-decide="approve"]', card) || card).focus();
}

/* ---------------------------------------------------------------- dialogs */
function hxDialog(html, onSubmit) {
  const dlg = $('#hx-dialog');
  const form = $('#hx-dialog-form');
  form.innerHTML = html;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', form);
    if (btn) btn.disabled = true;
    const ok = await onSubmit(form);
    if (btn) btn.disabled = false;
    if (ok) dlg.close();
  };
  $$('[data-cancel]', form).forEach((b) => b.addEventListener('click', () => dlg.close()));
  dlg.showModal();
  const first = $('input:not([type=checkbox]), select, textarea', form);
  if (first) first.focus();
}

function hxNewChannelDialog() {
  const agents = H.agents.filter((a) => a.status === 'active');
  hxDialog(`<h2 id="hx-dialog-title">New channel</h2>
    <div class="fields">
      <div><label for="nc-name">Name</label><input id="nc-name" required maxlength="40" placeholder="build-log"></div>
      <div><label for="nc-type">Who can see it</label><select id="nc-type">
        <option value="public">Public: everyone in the workspace</option>
        <option value="private">Private: members only</option>
        <option value="agent-room">Agent room: public, for agent work</option></select></div>
      <div class="full"><label for="nc-desc">Description</label><input id="nc-desc" maxlength="300" placeholder="What is this channel for?"></div>
      <div class="full"><label for="nc-instr">Instructions for agents (optional)</label>
        <textarea id="nc-instr" maxlength="4000" placeholder="Shared context every agent here receives once a model is connected."></textarea></div>
      ${agents.length ? `<fieldset class="full hx-pick"><legend>Agents in this channel</legend>${agents.map((a) => `<label class="check"><input type="checkbox" name="agent" value="${esc(a.id)}" checked> ${esc(a.name)} <small>@${esc(a.handle)}</small></label>`).join('')}</fieldset>` : ''}
    </div>
    <div class="dialog-actions"><div></div><div><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit">Create channel</button></div></div>`,
  async (form) => {
    const res = await guard(() => api('POST', wsPath('/channels'), {
      name: $('#nc-name').value, type: $('#nc-type').value, description: $('#nc-desc').value,
      instructions: $('#nc-instr').value, agent_ids: $$('input[name=agent]:checked', form).map((x) => x.value),
    }));
    if (!res) return false;
    await hxLoadChannels();
    hxGo(res.id);
    return true;
  });
}

function hxNewAgentDialog() {
  const resources = [['planner', 'Planner: add, move and delete events'], ['journal', 'Journal: start entries'],
    ['memory', 'Memory: propose to its ledger'], ['channels', 'Channels: post in other channels'],
    ['companion_calendar', 'Companion calendar: sandbox sessions']];
  const defaults = new Set(['planner', 'journal', 'memory', 'channels']);
  hxDialog(`<h2 id="hx-dialog-title">New agent</h2>
    <p class="muted">Agents can only ask. Every change one requests waits for your approval.</p>
    <div class="fields">
      <div><label for="na-name">Name</label><input id="na-name" required maxlength="40" placeholder="Scout"></div>
      <div><label for="na-role">Job</label><input id="na-role" maxlength="120" placeholder="Researcher"></div>
      <div><label for="na-comp">Memory ledger</label><select id="na-comp"><option value="">None: keeps no memories</option>
        ${S.companions.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}’s ledger</option>`).join('')}</select></div>
      <div><label for="na-model">Model</label><input id="na-model" value="none" maxlength="80" aria-describedby="na-model-note">
        <small id="na-model-note" class="muted">No model drivers yet; every agent answers with the stand-in.</small></div>
      <div class="full"><label for="na-prompt">Instructions (optional)</label><textarea id="na-prompt" maxlength="8000" placeholder="How this agent should behave once a model is connected."></textarea></div>
      <fieldset class="full hx-pick"><legend>It may ask to change</legend>
        ${resources.map(([k, text]) => `<label class="check"><input type="checkbox" name="res" value="${k}"${defaults.has(k) ? ' checked' : ''}> ${text}</label>`).join('')}</fieldset>
    </div>
    <div class="dialog-actions"><div></div><div><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit">Create agent</button></div></div>`,
  async (form) => {
    const res = await guard(() => api('POST', wsPath('/agents'), {
      name: $('#na-name').value, role: $('#na-role').value, companion_id: $('#na-comp').value || null,
      model: $('#na-model').value || 'none', system_prompt: $('#na-prompt').value,
      resources: $$('input[name=res]:checked', form).map((x) => x.value),
    }));
    if (!res) return false;
    await hxLoadAgents();
    hxDrawSide();
    toast(`${res.name} is ready. Add it to a channel from the members button, or open a direct message.`);
    return true;
  });
}

function hxMembersDialog() {
  const ch = H.channel;
  if (!ch) return;
  const members = ch.members || [];
  const inChannel = new Set(members.map((m) => m.member_id));
  const addable = H.agents.filter((a) => a.status !== 'archived' && !inChannel.has(a.id));
  const canAdd = S.ws.role !== 'viewer' && ch.type !== 'dm' && !ch.archived_at && addable.length > 0;
  hxDialog(`<h2 id="hx-dialog-title">${esc(hxLabel(ch))}</h2>
    <ul class="hx-members">${members.map((m) => `<li>${hxAvatar(m.member_type, m.member_id, m.name)}
      <span><b>${esc(m.name)}</b> <small>${esc(m.member_type === 'human' ? 'person' : m.member_type)} · ${esc(m.role)}</small></span></li>`).join('')}</ul>
    ${ch.instructions ? `<div><label>Instructions for agents</label><p class="hx-instr">${esc(ch.instructions)}</p></div>` : ''}
    ${canAdd ? `<div class="fields">
      <div><label for="am-agent">Add an agent</label><select id="am-agent">${addable.map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (@${esc(a.handle)})</option>`).join('')}</select></div>
      <div><label for="am-role">As</label><select id="am-role"><option value="member">Member: replies and asks for changes</option><option value="observer">Observer: reads only</option></select></div></div>` : ''}
    <div class="dialog-actions"><div></div><div><button type="button" class="btn" data-cancel>Close</button>${canAdd ? '<button class="btn primary" type="submit">Add agent</button>' : ''}</div></div>`,
  async () => {
    const res = await guard(() => api('POST', `/api/os/channels/${ch.id}/members`,
      { member_id: $('#am-agent').value, member_type: 'agent', role: $('#am-role').value }));
    if (!res) return false;
    toast(`${res.name} joined ${hxLabel(ch)}.`);
    await hxRefresh({ channel: true, channels: true }, true);
    return true;
  });
}

/* ---------------------------------------------------------------- live updates */
// One stream per tab, shared by the Channels view and Barnacle. It runs while
// anything holds it (hold/release) and passes every change to its listeners.
const LiveFeed = {
  listeners: new Set(),
  stateListeners: new Set(),
  holders: new Set(),
  ctrl: null,
  timer: null,
  cursor: null,
  retryMs: 1000,
  fails: 0,
  state: 'off',
  on(fn) { this.listeners.add(fn); },
  off(fn) { this.listeners.delete(fn); },
  onState(fn) { this.stateListeners.add(fn); fn(this.state); },
  offState(fn) { this.stateListeners.delete(fn); },
  hold(key) {
    this.holders.add(key);
    if (!this.ctrl && !this.timer) { this.cursor = null; this.fails = 0; liveConnect(); }
  },
  release(key) {
    this.holders.delete(key);
    if (!this.holders.size) liveDisconnect();
  },
  stopAll() { this.holders.clear(); liveDisconnect(); },
  setState(state) { this.state = state; this.stateListeners.forEach((fn) => fn(state)); },
};

function hxLiveState(state) {
  const el = $('#hx-live');
  if (!el) return;
  el.className = `live-dot ${state}`;
  el.textContent = state === 'on' ? (LiveFeed.retryMs >= 3000 ? 'Live · checks every 3s' : 'Live')
    : state === 'retry' ? 'Reconnecting…' : 'Connecting';
  el.title = state === 'on' ? 'New messages and decisions appear without reloading.' : 'Trying to reach the server.';
}

function liveFrame(frame) {
  let event = 'message';
  let data = '';
  let id = null;
  for (const line of frame.split('\n')) {
    if (!line || line.startsWith(':')) continue;
    const k = line.indexOf(':');
    const field = k < 0 ? line : line.slice(0, k);
    let value = k < 0 ? '' : line.slice(k + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data += (data ? '\n' : '') + value;
    else if (field === 'id') id = value;
    else if (field === 'retry' && /^\d+$/.test(value)) LiveFeed.retryMs = Number(value);
  }
  if (id !== null && /^\d+$/.test(id)) LiveFeed.cursor = Number(id);
  if (event === 'change' && data) {
    let change = null;
    try { change = JSON.parse(data); } catch { return; } // ignore a malformed frame
    LiveFeed.listeners.forEach((fn) => { try { fn(change); } catch (err) { console.error(err); } });
  }
}

function hxOnChange(ev) {
  const here = Boolean(H.channel && ev.channel_id === H.channel.id);
  const f = {};
  if (ev.type === 'message' || ev.type === 'approval') {
    if (here) { f.messages = true; if (H.thread) f.thread = true; } else if (ev.type === 'message') H.unread.add(ev.channel_id);
    f.pending = true;
  } else if (ev.type === 'channel') {
    f.channels = true;
    if (here) f.channel = true;
  } else if (ev.type === 'agent') {
    f.agents = true;
  }
  hxRefresh(f);
}

function liveConnect() {
  const feed = LiveFeed;
  clearTimeout(feed.timer);
  feed.timer = null;
  const ctrl = new AbortController();
  feed.ctrl = ctrl;
  (async () => {
    let ended = false;
    try {
      const url = wsPath('/stream') + (feed.cursor !== null ? `?after=${feed.cursor}` : '');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${S.token}`, Accept: 'text/event-stream' }, cache: 'no-store', signal: ctrl.signal });
      if (res.status === 401) { signOut(true); return; }
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let first = true;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        let cut;
        while ((cut = buf.indexOf('\n\n')) >= 0) { liveFrame(buf.slice(0, cut)); buf = buf.slice(cut + 2); }
        if (first) { first = false; feed.fails = 0; feed.setState('on'); }
      }
      ended = true;
    } catch (err) {
      if (ctrl.signal.aborted) return;
    }
    if (feed.ctrl !== ctrl) return;
    feed.ctrl = null;
    if (!feed.holders.size) return;
    // A stream that ends normally reconnects after the server's `retry`
    // (1s locally; 3s on hosts that answer with one batch, which makes it polling).
    if (!ended) { feed.fails += 1; feed.setState('retry'); }
    feed.timer = setTimeout(liveConnect, ended ? feed.retryMs : Math.min(30000, 1000 * 2 ** feed.fails));
  })();
}

function liveDisconnect() {
  const feed = LiveFeed;
  if (feed.ctrl) feed.ctrl.abort();
  feed.ctrl = null;
  clearTimeout(feed.timer);
  feed.timer = null;
  feed.setState('off');
}
