/* Journal OS — client. All data lives on the server (SQLite); this file keeps
   only the session token and view preferences in localStorage. */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const store = {
  get(k, d) { try { const v = localStorage.getItem('jos.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jos.' + k, JSON.stringify(v)); } catch { /* private mode */ } },
  del(k) { try { localStorage.removeItem('jos.' + k); } catch { /* ignore */ } },
};

const S = {
  token: store.get('token', null),
  user: null,
  ws: null,
  storage: null,
  registry: [],
  companions: [],
  view: store.get('calView', window.innerWidth < 640 ? 'day' : 'week'),
  calFilter: store.get('calFilter', 'all'),
  cursor: new Date(),
  events: [],
  entries: [],
  currentEntry: null,
  entryDraft: null,
  selectedCompanion: null,
  pending: null,
};

/* ---------------------------------------------------------------- dates */
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localIso = (d) => `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const parseIso = (s) => { const [d, t = '00:00'] = s.split('T'); const [y, m, dd] = d.split('-').map(Number); const [h, mi] = t.split(':').map(Number); return new Date(y, m - 1, dd, h, mi); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const fmtTime = (s) => parseIso(s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (d, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => d.toLocaleDateString([], opts);
const fmtWhen = (s) => `${fmtDay(parseIso(s))} · ${fmtTime(s)}`;
const minutesBetween = (a, b) => Math.round((parseIso(b) - parseIso(a)) / 60000);
const HOUR_START = 6, HOUR_END = 24;

/* ---------------------------------------------------------------- api */
// Requests run one at a time: serverless hosts start a new instance for every
// concurrent request, and each instance has its own temporary storage.
let apiQueue = Promise.resolve();
function api(method, path, body) {
  const run = apiQueue.then(() => apiNow(method, path, body));
  apiQueue = run.catch(() => {});
  return run;
}
async function apiNow(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = `Bearer ${S.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) {
    netBanner('Offline — the Journal OS server is not reachable. Nothing was saved. Start it with: python3 -m journal_os.server');
    throw new Error('offline');
  }
  netBanner(null);
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && path !== '/api/os/session') { signOut(true); throw new Error('Signed out'); }
  if (!res.ok && res.status !== 422) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}
const wsPath = (p) => `/api/os/w/${S.ws.id}${p}`;

function netBanner(msg) { const b = $('#net-banner'); b.hidden = !msg; b.textContent = msg || ''; }
let toastTimer;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'toast'; }, 3200);
}
async function guard(fn) { try { return await fn(); } catch (e) { if (e.message !== 'offline' && e.message !== 'Signed out') toast(e.message, true); return null; } }

/* ---------------------------------------------------------------- pixel art */
const PAL = { k: '#000', w: '#f3ead8', g: '#d8ff3e', p: '#ff6fae', c: '#5ce1e6', a: '#ffbf3c', b: '#6a9bff', m: '#8fd16a', s: '#8a8598', r: '#ff6b5b', d: '#2f2b3a', n: '#7a5a3a' };
const ICONS = {
  planner: ['..k......k..', '.kkkkkkkkkk.', '.kggggggggk.', '.kggggggggk.', '.kwwwwwwwwk.', '.kwkwkwkwwk.', '.kwwwwwwwwk.', '.kwkwkwppwk.', '.kwwwwwppwk.', '.kwkwkwkwwk.', '.kwwwwwwwwk.', '.kkkkkkkkkk.'],
  journal: ['............', '.kkkkk.kkkk.', 'kwwwwwkwwwwk', 'kwkkwwkwkkwk', 'kwwwwwkwwwwk', 'kwkkkwkwkkwk', 'kwwwwwkwwwwk', 'kwkkwwkwkkwk', 'kwwwwwkwwppk', 'kwwwwwkwwppk', '.kkkkkkkkkk.', '.....kk.....'],
  companion: ['..kk....kk..', '..kck..kck..', '..kck..kck..', '..kck..kck..', '.kkkkkkkkkk.', '.kwwwwwwwwk.', '.kwgkwwkgwk.', '.kwwwwwwwwk.', '.kwwwkkwwwk.', '.kwwwwwwwwk.', '..kkkkkkkk..', '...k....k...'],
  together: ['............', '.kk.kk......', 'kppkppk.....', 'kppppppk.kk.', 'kppppppkkcck', '.kppppkkcccc', '..kppkkcccck', '...kk.kcccck', '.......kcck.', '........kk..', '............', '............'],
  zine: ['kkkkkkkkkk..', 'kwwwwwwwwkk.', 'kwppppwwwkwk', 'kwppppwwwkkk', 'kwwwwwwwwwwk', 'kwkkkkkkkwwk', 'kwwwwwwwwwwk', 'kwkkkkwcccwk', 'kwwwwwwcccwk', 'kwkkkkwcccwk', 'kwwwwwwwwwwk', 'kkkkkkkkkkkk'],
  cafe: ['.....gg.....', '.....kk.....', '..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwkkkkkkwwk', 'kwkggkkggkwk', 'kwkkkkkkkkwk', '.kwwwwwwwwk.', '..kkkkkkkk..', '...kmmmmk...', '..kkmmmmkk..', '..kk....kk..'],
  school: ['............', '.....kk.....', '...kkcckk...', '.kkccccccck.', 'kccccccccccck'.slice(0, 12), '.kkccccccckk', '...kkcckk.ak', '...kwwwwk..a', '...kwwwwk..a', '....kkkk..aa', '............', '............'],
  studio: ['.........kk.', '........kaak', '.......kaak.', '......kaak..', '.....kaak...', '....kaak....', '...kbbk.....', '..kbbk......', '..kwk.......', '.kkk........', '.k..........', '............'],
  world: ['....kkkk....', '..kkmmcckk..', '.kmmmccccck.', '.kmmcccmmck.', 'kccccccmmmck', 'kcccmmccccck', 'kccmmmmcccck', 'kcccmmccmmck', '.kccccccmmk.', '.kcccccccck.', '..kkcccckk..', '....kkkk....'],
  autonomy: ['.....kk.....', '..k.kssk.k..', '.ksksssskskk'.slice(0, 12), '..kssssssk..', '.ksssddsssk.', 'kssssddssssk', 'kssssddssssk', '.ksssddsssk.', '..kssssssk..', '.ksksssskskk'.slice(0, 12), '..k.kssk.k..', '.....kk.....'],
  collab: ['............', '..kkk...kkk.', '.kaaak.kccck', '.kaaak.kccck', '..kkk...kkk.', '.kaaaaakcccck'.slice(0, 12), 'kaaaaakccccc', 'kaaaaakccccc', 'kaaaaakccccc', '............', '............', '............'],
  channels: ['............', '.kkkkkkkkkk.', 'kwwwwwwwwwwk', 'kwwwkwwkwwwk', 'kwkkkkkkkkwk', 'kwwwkwwkwwwk', 'kwwwkwwkwwwk', 'kwkkkkkkkkwk', 'kwwwkwwkwwwk', 'kwwwwwwwwaak', '.kkkkkkkkkk.', '..kk........'],
  device: ['..kkkkkkkk..', '.kssssssssk.', '.kskkkkkksk.', '.kskggggksk.', '.kskgkkgksk.', '.kskggggksk.', '.kskkkkkksk.', '.kssssssssk.', '.kskkssppsk.', '.kssssssssk.', '.kssssssssk.', '..kkkkkkkk..'],
};
const PORTRAIT = {
  PATCH: { ear: 'c', eye: 'g', body: 'w' },
  MOSS: { ear: 'm', eye: 'a', body: 'm' },
  PIP: { ear: 'p', eye: 'c', body: 'a' },
};
function pixelSvg(rows, cls = 'pix', label = '') {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  let rects = '';
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (PAL[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PAL[ch]}"/>`; }));
  return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>${rects}</svg>`;
}
function portrait(name) {
  const p = PORTRAIT[name] || { ear: 's', eye: 'g', body: 'w' };
  const rows = ICONS.companion.map((r) => r.replace(/c/g, p.ear).replace(/w/g, p.body).replace(/g/g, p.eye));
  return pixelSvg(rows, 'pix', `${name} pixel portrait`);
}

/* ---------------------------------------------------------------- session */
async function boot() {
  $('#signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const handle = $('#handle').value.trim();
    const data = await guard(() => api('POST', '/api/os/session', { handle }));
    if (!data) return;
    S.token = data.token; store.set('token', data.token);
    await enter();
  });
  $('#sign-out').addEventListener('click', () => guard(async () => { await api('DELETE', '/api/os/session'); signOut(); }));
  $('#command-form').addEventListener('submit', (e) => { e.preventDefault(); runCommand($('#command-input').value); });
  window.addEventListener('hashchange', route);
  window.addEventListener('beforeunload', (e) => { if (S.entryDraft && S.entryDraft.dirty) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#command-input').focus(); }
  });
  S.registry = (await guard(() => api('GET', '/api/os/registry'))) || [];
  if (S.token) await enter(); else showSignin();
}

function showSignin() { $('#signin').hidden = false; $('#app').hidden = true; $('#sign-out').hidden = true; $('#who').textContent = ''; $('#handle').focus(); }

function signOut(expired = false) {
  if (typeof Harness !== 'undefined') Harness.leave();
  if (typeof Barnacle !== 'undefined') Barnacle.unmount();
  if (typeof AutoTick !== 'undefined') AutoTick.stop();
  if (typeof Gestures !== 'undefined') Gestures.unmount();
  if (typeof LiveFeed !== 'undefined') LiveFeed.stopAll();
  S.token = null; S.user = null; store.del('token');
  showSignin();
  if (expired) toast('Session ended — sign in again.', true);
}

async function enter() {
  const me = await guard(() => api('GET', '/api/os/me'));
  if (!me) return;
  S.user = me.user; S.ws = me.workspaces.find((w) => w.kind === 'personal') || me.workspaces[0]; S.storage = me.storage;
  $('#signin').hidden = true; $('#app').hidden = false; $('#sign-out').hidden = false;
  $('#who').textContent = `@${S.user.handle} · ${S.ws.name}`;
  const badge = $('#storage-badge');
  badge.hidden = false; badge.className = `chip ${S.storage}`;
  badge.textContent = S.storage === 'durable' ? 'Saved to disk' : 'Demo storage — resets';
  badge.title = S.storage === 'durable' ? 'SQLite file on this machine' : 'Serverless /tmp storage. Do not enter real personal data.';
  S.companions = (await guard(() => api('GET', wsPath('/companions')))) || [];
  S.selectedCompanion = S.selectedCompanion || (S.companions.find((c) => c.name === 'PATCH') || S.companions[0] || {}).id;
  renderDock();
  if (typeof Barnacle !== 'undefined') Barnacle.mount();
  if (typeof AutoTick !== 'undefined') AutoTick.start();
  if (typeof Gestures !== 'undefined') Gestures.mount();
  if (!location.hash) location.hash = '#planner'; else route();
}

/* ---------------------------------------------------------------- dock + routing */
const STATUS_LABEL = { live: 'Live', 'live-partial': 'Partly live', existing: 'Existing module', planned: 'Planned' };
const THEME = { signal: 'var(--lime)', paper: 'var(--paper)', phosphor: 'var(--moss)', candy: 'var(--pink)', riso: 'var(--pink)', chalk: 'var(--cyan)', blueprint: 'var(--blue)', moss: 'var(--moss)', steel: 'var(--steel)', beacon: 'var(--amber)' };

function renderDock() {
  $('#dock').innerHTML = S.registry.map((a) => {
    const external = !a.route.startsWith('#');
    return `<a class="card ${a.status}" href="${esc(a.route)}" data-app="${a.id}" style="--accent:${THEME[a.theme] || 'var(--lime)'}"
      ${external ? 'data-external="1"' : ''} title="${esc(a.blurb)}">
      ${pixelSvg(ICONS[a.id] || ICONS.device)}
      <b>${esc(a.name)}</b>
      <span class="chip ${a.status}">${STATUS_LABEL[a.status] || a.status}${external ? ' ↗' : ''}</span>
    </a>`;
  }).join('');
}

function route() {
  if (!S.user) return;
  const id = (location.hash || '#planner').slice(1).split('?')[0];
  const pv = $('#preview');
  if (pv.classList.contains('done') && pv.dataset.route !== id) pv.hidden = true;
  $$('#dock .card').forEach((c) => c.setAttribute('aria-current', c.dataset.app === id ? 'page' : 'false'));
  const harnessReady = typeof Harness !== 'undefined';
  if (id !== 'channels' && harnessReady) Harness.leave();
  const views = { planner: viewPlanner, journal: viewJournal, companion: viewCompanion, together: viewTogether,
    channels: harnessReady ? () => Harness.view() : () => viewStatus(id), device: viewDevice };
  const fn = views[id] || (() => viewStatus(id));
  if (typeof Barnacle !== 'undefined') Barnacle.onRoute(id);
  fn();
}

/* ---------------------------------------------------------------- command + preview */
async function runCommand(text) {
  text = (text || '').trim();
  if (!text) return;
  const pv = $('#preview');
  pv.hidden = false; pv.className = 'preview'; pv.innerHTML = '<p class="loading">Interpreting…</p>';
  const res = await guard(() => api('POST', wsPath('/commands'), { text, now: localIso(new Date()) }));
  if (!res) { pv.hidden = true; return; }
  if (!res.ok) {
    pv.className = 'preview error';
    pv.innerHTML = `<h2>Not understood</h2><p class="summary">${esc(res.reason)}</p>
      <div class="row">${res.examples.map((x) => `<button type="button" class="btn small" data-ex="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="row"><button type="button" class="btn ghost small" data-close>Dismiss</button></div>`;
    $$('[data-ex]', pv).forEach((b) => b.addEventListener('click', () => { $('#command-input').value = b.dataset.ex; runCommand(b.dataset.ex); }));
    $('[data-close]', pv).addEventListener('click', () => { pv.hidden = true; });
    return;
  }
  S.pending = res;
  renderPreview(res);
}

const ACTION_LABEL = {
  create_event: 'Add to planner', update_event: 'Reschedule', delete_event: 'Delete event',
  create_journal_entry: 'New journal entry', propose_memory: 'Propose memory', schedule_companion_activity: 'Companion sandbox session',
};

function renderPreview(p) {
  const pv = $('#preview'); const d = p.payload;
  const known = S.events.filter((e) => e.calendar === 'personal');
  if (d.event_id && p.target && !known.find((e) => e.id === d.event_id)) known.unshift({ id: d.event_id, ...p.target });
  const evOpts = () => `<option value="">— none —</option>` + known.map((e) => `<option value="${e.id}" ${e.id === d.event_id ? 'selected' : ''}>${esc(e.title)} · ${esc(fmtWhen(e.start_at))}</option>`).join('');
  let fields = '';
  const dateTime = (iso) => `<div><label for="pv-date">Date</label><input id="pv-date" type="date" value="${iso.slice(0, 10)}"></div>
    <div><label for="pv-time">Start</label><input id="pv-time" type="time" value="${iso.slice(11, 16)}"></div>`;
  if (p.action === 'create_event') {
    fields = `<div style="grid-column:span 2"><label for="pv-title">Title</label><input id="pv-title" value="${esc(d.title)}"></div>${dateTime(d.start_at)}
      <div><label for="pv-dur">Minutes</label><input id="pv-dur" type="number" min="5" max="1440" step="5" value="${d.duration_minutes}"></div>
      <div><label for="pv-kind">Type</label><select id="pv-kind">${['event', 'task', 'reminder', 'routine'].map((k) => `<option ${k === d.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div><label for="pv-rec">Repeats</label><select id="pv-rec">${['none', 'daily', 'weekly'].map((k) => `<option ${k === d.recurrence ? 'selected' : ''}>${k}</option>`).join('')}</select></div>`;
  } else if (p.action === 'update_event') {
    fields = `<div style="grid-column:span 2"><label>Event</label><input value="${esc(p.target ? p.target.title + ' · now ' + fmtWhen(p.target.start_at) : d.event_id)}" disabled></div>${dateTime(d.start_at)}`;
  } else if (p.action === 'delete_event') {
    fields = `<div style="grid-column:1/-1"><label>Event</label><input value="${esc(p.target ? p.target.title + ' · ' + fmtWhen(p.target.start_at) : d.event_id)}" disabled></div>`;
  } else if (p.action === 'create_journal_entry') {
    fields = `<div><label for="pv-title">Title</label><input id="pv-title" value="${esc(d.title)}"></div>
      <div><label for="pv-link">Linked event</label><select id="pv-link">${evOpts()}</select></div>
      <div style="grid-column:1/-1"><label for="pv-body">First lines (optional)</label><textarea id="pv-body" style="min-height:70px">${esc(d.body)}</textarea></div>`;
  } else if (p.action === 'propose_memory') {
    fields = `<div style="grid-column:1/-1"><label for="pv-content">Memory text</label><input id="pv-content" value="${esc(d.content)}"></div>
      <div><label for="pv-cat">Category</label><select id="pv-cat">${['interest', 'project', 'routine', 'observation'].map((k) => `<option ${k === d.category ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div><label for="pv-comp">Companion</label><select id="pv-comp">${S.companions.map((c) => `<option value="${c.id}" ${c.id === S.selectedCompanion ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>`;
  } else if (p.action === 'schedule_companion_activity') {
    fields = `<div style="grid-column:span 2"><label for="pv-title">Title</label><input id="pv-title" value="${esc(d.title)}"></div>${dateTime(d.start_at)}
      <div><label for="pv-dur">Minutes</label><input id="pv-dur" type="number" min="5" max="600" step="5" value="${d.duration_minutes}"></div>`;
  }
  pv.className = 'preview';
  pv.innerHTML = `<div class="row"><span class="tag">PREVIEW · NOTHING SAVED YET</span><span class="tag">${esc(ACTION_LABEL[p.action])}</span></div>
    <p class="summary">${esc(p.summary)}</p>
    ${p.notes && p.notes.length ? `<ul class="notes">${p.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="fields">${fields}</div>
    <div class="row">
      <button type="button" class="btn primary" id="pv-approve">${p.action === 'delete_event' ? 'Approve delete' : 'Approve & save'}</button>
      <button type="button" class="btn" id="pv-reject">Reject</button>
      <span class="muted">Request: “${esc(p.input_text)}”</span>
    </div>`;
  $('#pv-approve').addEventListener('click', approvePending);
  $('#pv-reject').addEventListener('click', rejectPending);
  const first = $('input:not([disabled]), select', pv);
  (first || $('#pv-approve')).focus();
}

function collectEdits(p) {
  const v = (id) => { const el = $('#' + id); return el ? el.value : undefined; };
  const out = {};
  if (v('pv-title') !== undefined) out.title = v('pv-title');
  if (v('pv-date') !== undefined) out.start_at = `${v('pv-date')}T${v('pv-time')}`;
  if (v('pv-dur') !== undefined) out.duration_minutes = Number(v('pv-dur'));
  if (v('pv-kind') !== undefined) out.kind = v('pv-kind');
  if (v('pv-rec') !== undefined) out.recurrence = v('pv-rec');
  if (v('pv-link') !== undefined) out.event_id = v('pv-link') || null;
  if (v('pv-body') !== undefined) out.body = v('pv-body');
  if (v('pv-content') !== undefined) out.content = v('pv-content');
  if (v('pv-cat') !== undefined) out.category = v('pv-cat');
  if (v('pv-comp') !== undefined) out.companion_id = v('pv-comp');
  if (out.kind && out.recurrence && out.recurrence !== 'none' && out.kind === 'event') out.kind = 'routine';
  return out;
}

async function approvePending() {
  const p = S.pending; if (!p) return;
  const btn = $('#pv-approve'); btn.disabled = true;
  const res = await guard(() => api('POST', `/api/os/actions/${p.id}/approve`, { payload: collectEdits(p) }));
  btn.disabled = false;
  if (!res) return;
  S.pending = null;
  const pv = $('#preview'); pv.className = 'preview done'; pv.dataset.route = (location.hash || '#planner').slice(1).split('?')[0];
  const r = res.result || {};
  let link = '';
  if (r.event) link = `<a class="btn small" href="#planner" data-goto="${r.event.start_at}">Show in planner</a>`;
  if (r.entry) link = `<a class="btn small" href="#journal?e=${r.entry.id}">Open entry</a>`;
  if (r.memory) link = `<a class="btn small" href="#companion">Review in ledger</a>`;
  if (r.event && r.event.calendar === 'companion') link = `<a class="btn small" href="#together">Open Together</a>`;
  pv.innerHTML = `<div class="row"><span class="tag">DONE · ${esc(res.status)}</span></div>
    <p class="summary">${esc(resultText(res))}</p>
    <div class="row">${link}<button type="button" class="btn ghost small" data-close>Close</button></div>`;
  $('[data-close]', pv).addEventListener('click', () => { pv.hidden = true; });
  const goto = $('[data-goto]', pv);
  if (goto) goto.addEventListener('click', () => { S.cursor = parseIso(goto.dataset.goto); });
  $('#command-input').value = '';
  if (r.event && r.event.calendar === 'personal') S.cursor = parseIso(r.event.start_at);
  route();
}

function resultText(res) {
  const r = res.result || {};
  if (r.event) return `Saved “${r.event.title}” · ${fmtWhen(r.event.start_at)} – ${fmtTime(r.event.end_at)} (${r.event.calendar} calendar).`;
  if (r.deleted) return `Deleted “${r.title}”.`;
  if (r.entry) return `Created journal entry “${r.entry.title}”${r.entry.event ? ` linked to “${r.entry.event.title}”` : ''}.`;
  if (r.memory) return `${r.memory.companion_name} proposed a memory. It is not permanent until you approve it in the Companion ledger.`;
  return 'Done.';
}

async function rejectPending() {
  const p = S.pending; if (!p) return;
  await guard(() => api('POST', `/api/os/actions/${p.id}/reject`));
  S.pending = null;
  const pv = $('#preview'); pv.className = 'preview'; pv.innerHTML = `<p class="summary">Rejected. Nothing changed.</p>`;
  setTimeout(() => { pv.hidden = true; }, 1600);
}

/* ---------------------------------------------------------------- planner */
function rangeFor(view, cursor) {
  if (view === 'day') { const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()); return [s, addDays(s, 1)]; }
  if (view === 'week') { const s = startOfWeek(cursor); return [s, addDays(s, 7)]; }
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const s = startOfWeek(first); return [s, addDays(s, 42)];
}

async function loadEvents(start, end) {
  const q = `?start=${localIso(start)}&end=${localIso(end)}`;
  const evs = await guard(() => api('GET', wsPath('/events' + q)));
  S.events = evs || [];
  return S.events;
}

async function viewPlanner() {
  const v = $('#view');
  const [start, end] = rangeFor(S.view, S.cursor);
  const label = S.view === 'month' ? S.cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })
    : S.view === 'day' ? fmtDay(S.cursor, { weekday: 'long', month: 'long', day: 'numeric' })
      : `${fmtDay(start, { month: 'short', day: 'numeric' })} – ${fmtDay(addDays(end, -1), { month: 'short', day: 'numeric', year: 'numeric' })}`;
  v.innerHTML = `<div class="view-head"><div><h1>Planner</h1><p>${esc(label)}</p></div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Move">
        <button class="btn small" data-nav="-1" aria-label="Previous">◀</button><button class="btn small" data-nav="0">Today</button><button class="btn small" data-nav="1" aria-label="Next">▶</button>
      </div>
      <div class="seg" role="group" aria-label="View">${['day', 'week', 'month'].map((x) => `<button class="btn small" data-view="${x}" aria-pressed="${S.view === x}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}</div>
      <label class="sr" for="cal-filter">Calendars</label>
      <select id="cal-filter" style="width:auto;min-height:36px">
        <option value="all" ${S.calFilter === 'all' ? 'selected' : ''}>All calendars</option>
        <option value="personal" ${S.calFilter === 'personal' ? 'selected' : ''}>Personal only</option>
        <option value="companion" ${S.calFilter === 'companion' ? 'selected' : ''}>Companion only</option>
      </select>
      <button class="btn primary small" id="new-event">+ New</button>
    </div></div>
    <div class="planner"><div id="cal" class="cal"><p class="loading">Loading events…</p></div><aside class="agenda" id="agenda"></aside></div>`;
  $$('[data-nav]', v).forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.nav);
    if (n === 0) S.cursor = new Date();
    else if (S.view === 'day') S.cursor = addDays(S.cursor, n);
    else if (S.view === 'week') S.cursor = addDays(S.cursor, 7 * n);
    else S.cursor = new Date(S.cursor.getFullYear(), S.cursor.getMonth() + n, 1);
    viewPlanner();
  }));
  $$('[data-view]', v).forEach((b) => b.addEventListener('click', () => { S.view = b.dataset.view; store.set('calView', S.view); viewPlanner(); }));
  $('#cal-filter').addEventListener('change', (e) => { S.calFilter = e.target.value; store.set('calFilter', S.calFilter); drawCalendar(start, end); });
  $('#new-event').addEventListener('click', () => {
    const base = S.view === 'day' ? S.cursor : new Date();
    const s = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.min(Math.max(new Date().getHours() + 1, 8), 22), 0);
    openEventDialog(null, { start_at: localIso(s) });
  });
  await loadEvents(start, end);
  drawCalendar(start, end);
}

function visibleEvents() { return S.events.filter((e) => S.calFilter === 'all' || e.calendar === S.calFilter); }
function evClass(e) { return `ev ${e.calendar === 'companion' ? 'companion' : e.kind}${e.completed ? ' done' : ''}`; }

function drawCalendar(start, end) {
  const cal = $('#cal'); if (!cal) return;
  const evs = visibleEvents();
  if (S.view === 'month') drawMonth(cal, start, evs); else drawDays(cal, start, S.view === 'day' ? 1 : 7, evs);
  drawAgenda();
}

function drawDays(cal, start, n, evs) {
  const days = [...Array(n)].map((_, i) => addDays(start, i));
  const today = dayKey(new Date());
  const cols = `56px repeat(${n}, 1fr)`;
  const slots = (HOUR_END - HOUR_START) * 2;
  cal.innerHTML = `<div class="cal-head" style="grid-template-columns:${cols}"><div></div>${days.map((d) => `<div class="${dayKey(d) === today ? 'today' : ''}">${esc(fmtDay(d, { weekday: 'short', day: 'numeric' }))}</div>`).join('')}</div>
    <div class="cal-body" style="grid-template-columns:${cols}">
      <div class="hours">${[...Array(HOUR_END - HOUR_START)].map((_, i) => `<div>${new Date(2000, 0, 1, HOUR_START + i).toLocaleTimeString([], { hour: 'numeric' })}</div>`).join('')}</div>
      ${days.map((d) => `<div class="daycol ${dayKey(d) === today ? 'today' : ''}" data-day="${dayKey(d)}" role="group" aria-label="${esc(fmtDay(d, { weekday: 'long', month: 'long', day: 'numeric' }))}">
        ${[...Array(slots)].map((_, i) => `<div class="slot" data-min="${HOUR_START * 60 + i * 30}"></div>`).join('')}</div>`).join('')}
    </div>`;
  const hourPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 48;
  days.forEach((d) => {
    const col = $(`.daycol[data-day="${dayKey(d)}"]`, cal);
    const mine = evs.filter((e) => e.start_at.slice(0, 10) === dayKey(d));
    mine.forEach((e) => {
      const s = parseIso(e.start_at);
      const mins = s.getHours() * 60 + s.getMinutes();
      const top = Math.max(0, (mins - HOUR_START * 60) / 60 * hourPx);
      const height = Math.max(22, minutesBetween(e.start_at, e.end_at) / 60 * hourPx - 2);
      const b = document.createElement('button');
      b.type = 'button'; b.className = evClass(e); b.draggable = true;
      b.style.top = `${top}px`; b.style.height = `${height}px`;
      b.dataset.id = e.id; b.dataset.start = e.start_at;
      b.setAttribute('aria-label', `${e.title}, ${fmtWhen(e.start_at)} to ${fmtTime(e.end_at)}${e.calendar === 'companion' ? ', companion calendar' : ''}${e.completed ? ', completed' : ''}`);
      b.innerHTML = `<b>${esc(e.title)}</b><span>${esc(fmtTime(e.start_at))}${e.recurrence !== 'none' ? ' ↻' : ''}</span>`;
      b.addEventListener('click', () => openEventDialog(e));
      b.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', JSON.stringify({ id: e.id, start: e.start_at })); b.classList.add('dragging'); });
      b.addEventListener('dragend', () => b.classList.remove('dragging'));
      col.appendChild(b);
    });
    if (dayKey(d) === dayKey(new Date())) {
      const now = new Date(); const line = document.createElement('div'); line.className = 'now-line';
      line.style.top = `${((now.getHours() * 60 + now.getMinutes()) - HOUR_START * 60) / 60 * hourPx}px`; col.appendChild(line);
    }
    $$('.slot', col).forEach((slot) => {
      slot.addEventListener('dragover', (ev) => { ev.preventDefault(); slot.classList.add('over'); });
      slot.addEventListener('dragleave', () => slot.classList.remove('over'));
      slot.addEventListener('drop', (ev) => {
        ev.preventDefault(); slot.classList.remove('over');
        const m = Number(slot.dataset.min);
        dropMove(ev, `${col.dataset.day}T${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
      });
      slot.addEventListener('dblclick', () => { const m = Number(slot.dataset.min); openEventDialog(null, { start_at: `${col.dataset.day}T${pad(Math.floor(m / 60))}:${pad(m % 60)}` }); });
    });
  });
  const body = $('.cal-body', cal);
  const first = evs.length ? Math.min(...evs.map((e) => parseIso(e.start_at).getHours())) : 8;
  body.scrollTop = Math.max(0, (Math.min(first, 9) - HOUR_START) * hourPx - 10);
}

function drawMonth(cal, start, evs) {
  const month = S.cursor.getMonth(); const today = dayKey(new Date());
  const days = [...Array(42)].map((_, i) => addDays(start, i));
  cal.innerHTML = `<div class="cal-head" style="grid-template-columns:repeat(7,1fr)">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div>${d}</div>`).join('')}</div>
    <div class="month">${days.map((d) => `<div class="mcell ${d.getMonth() !== month ? 'other' : ''} ${dayKey(d) === today ? 'today' : ''}" data-day="${dayKey(d)}">
      <span class="mnum">${d.getDate()}</span></div>`).join('')}</div>`;
  evs.forEach((e) => {
    const cell = $(`.mcell[data-day="${e.start_at.slice(0, 10)}"]`, cal); if (!cell) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = evClass(e) + ' mchip'; b.draggable = true;
    b.textContent = `${fmtTime(e.start_at)} ${e.title}`;
    b.setAttribute('aria-label', `${e.title}, ${fmtWhen(e.start_at)}`);
    b.addEventListener('click', () => openEventDialog(e));
    b.addEventListener('dragstart', (ev) => ev.dataTransfer.setData('text/plain', JSON.stringify({ id: e.id, start: e.start_at })));
    cell.appendChild(b);
  });
  $$('.mcell', cal).forEach((cell) => {
    // On a touch screen, tapping a day opens it in the day view, where events are big enough to tap.
    cell.addEventListener('click', (ev) => {
      if (ev.target.closest('.mchip') || !window.matchMedia('(pointer: coarse), (max-width: 640px)').matches) return;
      S.cursor = parseIso(`${cell.dataset.day}T00:00`); S.view = 'day'; store.set('calView', 'day'); viewPlanner();
    });
    cell.addEventListener('dragover', (ev) => { ev.preventDefault(); cell.classList.add('over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('over'));
    cell.addEventListener('drop', (ev) => {
      ev.preventDefault(); cell.classList.remove('over');
      let data; try { data = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
      dropMove(ev, `${cell.dataset.day}T${data.start.slice(11, 16)}`);
    });
  });
}

async function dropMove(ev, newOccStart) {
  let data; try { data = JSON.parse(ev.dataTransfer.getData('text/plain')); } catch { return; }
  if (data.start === newOccStart) return;
  // Recurring occurrences shift the whole series by the same offset.
  const series = await guard(() => api('GET', `/api/os/events/${data.id}`)); if (!series) return;
  const delta = parseIso(newOccStart) - parseIso(data.start);
  const newStart = localIso(new Date(parseIso(series.start_at).getTime() + delta));
  const res = await guard(() => api('POST', `/api/os/events/${data.id}`, { start_at: newStart }));
  if (res) { toast(`Moved “${res.title}” to ${fmtWhen(newOccStart)}`); viewPlanner(); }
}

function drawAgenda() {
  const a = $('#agenda'); if (!a) return;
  const now = localIso(new Date());
  const upcoming = visibleEvents().filter((e) => e.end_at >= now).slice(0, 8);
  a.innerHTML = `<section class="panel"><h2>Up next</h2>${upcoming.length ? `<ol>${upcoming.map((e) => `<li><button type="button" class="${e.calendar === 'companion' ? 'companion' : e.kind}" data-id="${e.id}" data-start="${e.start_at}">
      ${esc(e.title)}${e.completed ? ' ✓' : ''}<small>${esc(fmtWhen(e.start_at))}${e.calendar === 'companion' ? ' · companion' : ''}</small></button></li>`).join('')}</ol>` : '<p class="empty">Nothing ahead in this range. Try “Schedule a robotics build session tomorrow at 11 for 90 minutes”.</p>'}</section>
    <section class="panel"><h2>Key</h2><div class="legend">
      <span style="--c:var(--lime)">Event</span><span style="--c:var(--cyan)">Task</span><span style="--c:var(--amber)">Reminder</span><span style="--c:var(--blue)">Routine</span><span style="--c:var(--pink)">Companion</span></div>
      <p class="muted">Drag an event to move it. Double-click an empty slot to add one. Press / to type a request.</p></section>
    <section class="panel"><h2>Your data</h2><div class="toolbar">
      <button class="btn small" id="export-btn">Export JSON</button>
      <label class="btn small" for="import-file" style="margin:0;text-transform:none;font:inherit;font-weight:650;color:inherit">Import JSON</label>
      <input id="import-file" type="file" accept="application/json" class="sr">
    </div></section>`;
  $$('#agenda li button').forEach((b) => b.addEventListener('click', () => { const e = S.events.find((x) => x.id === b.dataset.id && x.start_at === b.dataset.start); if (e) openEventDialog(e); }));
  $('#export-btn').addEventListener('click', () => guard(async () => { download(`journal-os-${dayKey(new Date())}.json`, await api('GET', wsPath('/export'))); }));
  $('#import-file').addEventListener('change', (e) => guard(async () => {
    const f = e.target.files[0]; if (!f) return;
    const data = JSON.parse(await f.text());
    if (!confirm(`Import ${(data.events || []).length} events and ${(data.journal_entries || []).length} journal entries as new records?`)) return;
    const r = await api('POST', wsPath('/import'), data);
    toast(`Imported ${r.imported_events} events, ${r.imported_entries} entries`); viewPlanner();
  }));
}

function download(name, obj) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openEventDialog(ev, defaults = {}) {
  const dlg = $('#event-dialog'); const f = $('#event-form');
  const e = ev || { title: '', kind: 'event', recurrence: 'none', calendar: 'personal', notes: '', completed: false, ...defaults };
  const start = e.start_at || localIso(new Date());
  const dur = ev ? minutesBetween(ev.start_at, ev.end_at) : 60;
  const isOcc = ev && ev.occurrence_of && ev.recurrence !== 'none';
  if (ev && ev.id) S.lastEvent = { id: ev.id, title: ev.title }; // Barnacle can offer help with it
  f.innerHTML = `<h2 id="event-dialog-title">${ev ? 'Edit' : 'New'} ${e.calendar === 'companion' ? 'companion activity' : 'event'}</h2>
    ${isOcc ? '<p class="muted">This repeats. Changes apply to the whole series.</p>' : ''}
    ${e.calendar === 'companion' ? `<p class="muted">Companion sandbox calendar · ${esc((e.participants || []).join(' & '))}. Separate from your personal schedule.</p>` : ''}
    <div class="fields">
      <div class="full"><label for="ef-title">Title</label><input id="ef-title" required value="${esc(e.title)}"></div>
      <div><label for="ef-date">Date</label><input id="ef-date" type="date" required value="${start.slice(0, 10)}"></div>
      <div><label for="ef-time">Start</label><input id="ef-time" type="time" required value="${start.slice(11, 16)}"></div>
      <div><label for="ef-dur">Length (minutes)</label><input id="ef-dur" type="number" min="5" max="1440" step="5" value="${dur}"></div>
      <div><label for="ef-kind">Type</label><select id="ef-kind" ${e.calendar === 'companion' ? 'disabled' : ''}>${['event', 'task', 'reminder', 'routine'].map((k) => `<option ${k === e.kind ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div><label for="ef-rec">Repeats</label><select id="ef-rec" ${e.calendar === 'companion' ? 'disabled' : ''}>${['none', 'daily', 'weekly'].map((k) => `<option ${k === e.recurrence ? 'selected' : ''}>${k}</option>`).join('')}</select></div>
      <div><label>&nbsp;</label><span class="check"><input id="ef-done" type="checkbox" ${e.completed ? 'checked' : ''}><label for="ef-done" style="margin:0;text-transform:none;font:15px var(--body);color:#111">Completed</label></span></div>
      <div class="full"><label for="ef-notes">Notes</label><textarea id="ef-notes">${esc(e.notes)}</textarea></div>
    </div>
    <div class="dialog-actions">
      <div>${ev ? `<button type="button" class="btn danger" id="ef-del">Delete</button>` : ''}${ev && e.calendar === 'personal' ? `<button type="button" class="btn" id="ef-journal">Journal this</button>` : ''}</div>
      <div><button type="button" class="btn" id="ef-cancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
    </div>`;
  f.onsubmit = async (submit) => {
    submit.preventDefault();
    const body = {
      title: $('#ef-title').value, start_at: `${$('#ef-date').value}T${$('#ef-time').value}`,
      duration_minutes: Number($('#ef-dur').value), notes: $('#ef-notes').value, completed: $('#ef-done').checked,
    };
    if (e.calendar !== 'companion') { body.kind = $('#ef-kind').value; body.recurrence = $('#ef-rec').value; }
    if (isOcc) {
      // keep the series anchor, shift by the occurrence offset
      const series = await guard(() => api('GET', `/api/os/events/${ev.id}`)); if (!series) return;
      const delta = parseIso(body.start_at) - parseIso(ev.start_at);
      body.start_at = localIso(new Date(parseIso(series.start_at).getTime() + delta));
    }
    const res = await guard(() => (ev ? api('POST', `/api/os/events/${ev.id}`, body) : api('POST', wsPath('/events'), body)));
    if (!res) return;
    dlg.close(); toast(`${ev ? 'Updated' : 'Saved'} “${res.title}”`);
    if (!ev) S.cursor = parseIso(res.start_at);
    route();
  };
  $('#ef-cancel').onclick = () => dlg.close();
  if (ev) {
    $('#ef-del').onclick = async () => {
      if (!confirm(`Delete “${e.title}”${isOcc ? ' and every repeat' : ''}? This cannot be undone.`)) return;
      const r = await guard(() => api('DELETE', `/api/os/events/${ev.id}`));
      if (r) { dlg.close(); toast(`Deleted “${e.title}”`); route(); }
    };
    const j = $('#ef-journal');
    if (j) j.onclick = () => { dlg.close(); S.entryDraft = { title: `Notes: ${e.title}`, body: '', tags: '', event_id: ev.id, dirty: true }; S.currentEntry = null; location.hash = '#journal?new=1'; };
  }
  dlg.showModal();
  $('#ef-title').focus();
}

/* ---------------------------------------------------------------- journal */
async function viewJournal() {
  const v = $('#view');
  const params = new URLSearchParams((location.hash.split('?')[1]) || '');
  v.innerHTML = `<div class="view-head"><div><h1>Living Journal</h1><p>Entries link to planner events. Companion sandbox logs are marked fictional.</p></div>
    <div class="toolbar"><button class="btn primary small" id="new-entry">+ New entry</button></div></div>
    <div class="grid-2"><section class="panel"><h2>Entries</h2><ul class="entry-list" id="entries"><li class="loading">Loading…</li></ul></section>
    <section class="panel paper" id="editor-panel"></section></div>`;
  $('#new-entry').addEventListener('click', () => { S.currentEntry = null; S.entryDraft = { title: '', body: '', tags: '', event_id: null, dirty: false }; drawEditor(); drawEntryList(); });
  const [entries, events] = await Promise.all([guard(() => api('GET', wsPath('/journal'))), guard(() => api('GET', wsPath('/events?calendar=personal')))]);
  S.entries = entries || []; S.allPersonalEvents = events || [];
  const want = params.get('e');
  if (want) { S.currentEntry = S.entries.find((x) => x.id === want) || null; S.entryDraft = null; }
  else if (params.get('new') && S.entryDraft) S.currentEntry = null;
  else if (!S.entryDraft || !S.entryDraft.dirty) { S.currentEntry = S.currentEntry && S.entries.find((x) => x.id === S.currentEntry.id) || S.entries[0] || null; S.entryDraft = null; }
  drawEntryList(); drawEditor();
}

function drawEntryList() {
  const ul = $('#entries'); if (!ul) return;
  ul.innerHTML = S.entries.length ? S.entries.map((en) => `<li><button type="button" data-id="${en.id}" aria-current="${S.currentEntry && S.currentEntry.id === en.id}">
    ${esc(en.title)} ${en.origin === 'companion_sandbox' ? '<span class="chip fictional">Fictional</span>' : ''}
    <small>${esc(new Date(en.updated_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${en.event ? ' · ↳ ' + esc(en.event.title) : ''}</small></button></li>`).join('')
    : '<li class="empty">No entries yet.</li>';
  $$('button', ul).forEach((b) => b.addEventListener('click', () => {
    if (S.entryDraft && S.entryDraft.dirty && !confirm('Discard unsaved changes to this entry?')) return;
    S.currentEntry = S.entries.find((x) => x.id === b.dataset.id); S.entryDraft = null; drawEntryList(); drawEditor();
  }));
}

function drawEditor() {
  const p = $('#editor-panel'); if (!p) return;
  const en = S.currentEntry;
  const d = S.entryDraft || (en ? { title: en.title, body: en.body, tags: en.tags.join(', '), event_id: en.event_id, dirty: false } : null);
  if (!d) { p.innerHTML = '<h2>Write</h2><p class="empty" style="color:#555">Select an entry or start a new one.</p>'; return; }
  S.entryDraft = d;
  const evs = S.allPersonalEvents || [];
  const extraEvent = en && en.event && !evs.find((x) => x.id === en.event.id) ? [en.event] : [];
  p.innerHTML = `<div class="editor">
    <div class="row" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
      <h2 style="margin:0">${en ? 'Edit entry' : 'New entry'}</h2>
      ${en && en.origin === 'companion_sandbox' ? '<span class="chip fictional">Fictional sandbox log</span>' : ''}
      <span id="dirty" class="muted">${d.dirty ? 'Unsaved changes' : en ? 'Saved' : ''}</span></div>
    <div><label for="je-title">Title</label><input id="je-title" value="${esc(d.title)}" required></div>
    <div class="meta">
      <div><label for="je-event">Linked event</label><select id="je-event"><option value="">— none —</option>
        ${[...extraEvent, ...evs].map((x) => `<option value="${x.id}" ${x.id === d.event_id ? 'selected' : ''}>${esc(x.title)} · ${esc(fmtWhen(x.start_at))}</option>`).join('')}</select></div>
      <div><label for="je-tags">Tags (comma separated)</label><input id="je-tags" value="${esc(d.tags)}"></div>
    </div>
    ${d.event_id ? `<div><span class="link-pill">↳ linked: ${esc((evs.find((x) => x.id === d.event_id) || (en && en.event) || {}).title || d.event_id)}</span> <a href="#planner" id="je-goto" style="color:#000">show in planner</a></div>` : ''}
    <div><label for="je-body">Entry</label><textarea id="je-body" class="body">${esc(d.body)}</textarea></div>
    <div class="toolbar">
      <button class="btn primary" id="je-save">Save entry</button>
      ${en ? '<button class="btn" id="je-mem">Ask companion to remember…</button><button class="btn danger" id="je-del">Delete</button>' : ''}
    </div>
    <div id="mem-form"></div>
    ${en ? `<p class="muted">Created ${esc(new Date(en.created_at).toLocaleString())} · updated ${esc(new Date(en.updated_at).toLocaleString())}</p>` : ''}
  </div>`;
  const mark = () => { d.dirty = true; $('#dirty').textContent = 'Unsaved changes'; };
  ['je-title', 'je-tags', 'je-body'].forEach((id) => $('#' + id).addEventListener('input', (e) => { d[{ 'je-title': 'title', 'je-tags': 'tags', 'je-body': 'body' }[id]] = e.target.value; mark(); }));
  $('#je-event').addEventListener('change', (e) => { d.event_id = e.target.value || null; mark(); drawEditor(); });
  const goto = $('#je-goto');
  if (goto) goto.addEventListener('click', () => { const x = evs.find((y) => y.id === d.event_id) || (en && en.event); if (x) S.cursor = parseIso(x.start_at); });
  $('#je-save').addEventListener('click', async () => {
    const body = { title: d.title, body: d.body, tags: d.tags, event_id: d.event_id };
    const res = await guard(() => (en ? api('POST', `/api/os/journal/${en.id}`, body) : api('POST', wsPath('/journal'), body)));
    if (!res) return;
    toast('Entry saved'); S.currentEntry = res; S.entryDraft = null;
    const i = S.entries.findIndex((x) => x.id === res.id); if (i >= 0) S.entries.splice(i, 1); S.entries.unshift(res);
    drawEntryList(); drawEditor();
  });
  if (en) {
    $('#je-del').addEventListener('click', async () => {
      if (!confirm(`Delete entry “${en.title}”? This cannot be undone.`)) return;
      if (await guard(() => api('DELETE', `/api/os/journal/${en.id}`))) { toast('Entry deleted'); S.currentEntry = null; S.entryDraft = null; viewJournal(); }
    });
    $('#je-mem').addEventListener('click', () => drawMemoryForm(en));
  }
}

function drawMemoryForm(en) {
  const box = $('#mem-form');
  const firstSentence = (en.body || en.title).split(/(?<=[.!?])\s/)[0].slice(0, 300);
  box.innerHTML = `<div class="panel" style="background:#fff;box-shadow:3px 3px 0 #000">
    <h3>Propose a memory</h3><p class="muted">The companion only keeps this after you approve it in the Companion ledger.</p>
    <label for="mf-content">What should it remember?</label><input id="mf-content" value="${esc(firstSentence)}">
    <div class="meta" style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
      <div><label for="mf-comp">Companion</label><select id="mf-comp">${S.companions.map((c) => `<option value="${c.id}" ${c.id === S.selectedCompanion ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
      <div><label for="mf-cat">Category</label><select id="mf-cat">${['project', 'interest', 'routine', 'observation'].map((k) => `<option>${k}</option>`).join('')}</select></div>
    </div>
    <div class="toolbar" style="margin-top:10px"><button class="btn primary" id="mf-go">Propose</button><button class="btn" id="mf-x">Cancel</button></div></div>`;
  $('#mf-x').onclick = () => { box.innerHTML = ''; };
  $('#mf-go').onclick = async () => {
    const res = await guard(() => api('POST', wsPath('/memories'), { companion_id: $('#mf-comp').value, category: $('#mf-cat').value, content: $('#mf-content').value, journal_entry_id: en.id, event_id: en.event_id }));
    if (!res) return;
    S.selectedCompanion = res.companion_id;
    box.innerHTML = `<p class="muted">Proposed to ${esc(res.companion_name)}. <a href="#companion" style="color:#000">Review it in the ledger →</a></p>`;
  };
  $('#mf-content').focus();
}

/* ---------------------------------------------------------------- companion */
async function viewCompanion() {
  const v = $('#view');
  const c = S.companions.find((x) => x.id === S.selectedCompanion) || S.companions[0];
  if (!c) { v.innerHTML = '<p class="empty">No companions in this workspace.</p>'; return; }
  S.selectedCompanion = c.id;
  v.innerHTML = `<div class="view-head"><div><h1>Companion</h1><p>Animal Scrypt identity and memory ledger. Nothing becomes a permanent memory without your approval.</p></div></div>
    <div class="companions" role="group" aria-label="Choose companion">${S.companions.map((x) => `<button type="button" class="comp" data-id="${x.id}" aria-pressed="${x.id === c.id}">${portrait(x.name)}<b>${esc(x.name)}</b></button>`).join('')}</div>
    <div class="grid-3" style="margin-top:18px">
      <section class="panel"><h2>${esc(c.name)}</h2><p class="lore">${esc(c.authored_lore)}</p>
        <dl class="spec"><dt>id</dt><dd>${esc(c.id)}</dd><dt>chassis</dt><dd>${esc(c.chassis_spec.proportion_class)}</dd><dt>tint</dt><dd>${esc(c.chassis_spec.translucent_tint)}</dd>
        <dt>stage</dt><dd>${esc(c.chassis_spec.progression_stage)}</dd><dt>voice</dt><dd>${esc(c.voice_constraints.aesthetic)}, ≤${esc(c.voice_constraints.max_sentences)} sentences</dd><dt>autonomy</dt><dd>Manual (only mode built)</dd></dl>
        <h3>Permissions</h3><ul class="log" id="grants"></ul>
        <div class="toolbar" style="margin-top:12px"><button class="btn" id="export-mem">Export identity + approved memories</button></div>
        <p class="muted">Authored lore is fixed character canon. It is stored apart from memories about you.</p></section>
      <section class="panel"><h2>Memory ledger</h2><div id="ledger" class="stack"><p class="loading">Loading…</p></div>
        <h3>Add a proposal</h3>
        <div class="stack"><label class="sr" for="new-mem">New memory text</label><input id="new-mem" placeholder="e.g. I test new prints on Thursdays">
        <div class="toolbar"><select id="new-mem-cat" style="width:auto">${['interest', 'project', 'routine', 'observation'].map((k) => `<option>${k}</option>`).join('')}</select><button class="btn small" id="new-mem-go">Propose</button></div></div></section>
      <section class="panel"><h2>Action history</h2><ul class="log" id="actions"></ul><h3>Audit log</h3><ul class="log" id="audit"></ul></section>
    </div>`;
  $$('.comp', v).forEach((b) => b.addEventListener('click', () => { S.selectedCompanion = b.dataset.id; viewCompanion(); }));
  $('#export-mem').addEventListener('click', () => guard(async () => download(`${c.name.toLowerCase()}-identity-${dayKey(new Date())}.json`, await api('GET', wsPath(`/companions/${c.id}/export`)))));
  $('#new-mem-go').addEventListener('click', async () => {
    const content = $('#new-mem').value.trim(); if (!content) return;
    if (await guard(() => api('POST', wsPath('/memories'), { companion_id: c.id, category: $('#new-mem-cat').value, content }))) { $('#new-mem').value = ''; drawLedger(c); }
  });
  drawLedger(c);
  const [grants, acts, audit] = await Promise.all([guard(() => api('GET', wsPath('/grants'))), guard(() => api('GET', wsPath('/actions'))), guard(() => api('GET', wsPath('/audit')))]);
  $('#grants').innerHTML = (grants || []).filter((g) => g.grantee === `companion:${c.id}`).map((g) => `<li><span>${esc(g.resource)}</span><span class="st">${esc(g.permission)}</span></li>`).join('') || '<li>none</li>';
  $('#actions').innerHTML = (acts || []).map((a) => `<li title="${esc(a.summary)}"><span>${esc(a.input_text.slice(0, 48))}</span><span class="st st-${a.status}">${a.status}</span></li>`).join('') || '<li>No requests yet.</li>';
  $('#audit').innerHTML = (audit || []).map((a) => `<li><span>${esc(a.action)}</span><span>${esc(new Date(a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</span></li>`).join('');
}

async function drawLedger(c) {
  const box = $('#ledger'); if (!box) return;
  const mems = (await guard(() => api('GET', wsPath(`/memories?companion_id=${c.id}`)))) || [];
  const proposed = mems.filter((m) => m.status === 'PROPOSED'); const approved = mems.filter((m) => m.status === 'APPROVED');
  const src = (m) => (m.journal_entry_id ? ` · <a href="#journal?e=${m.journal_entry_id}">from journal</a>` : '');
  box.innerHTML = `<h3 style="margin-top:0">Waiting for you (${proposed.length})</h3>
    ${proposed.map((m) => `<div class="mem proposed" data-id="${m.id}"><small>${esc(m.category)} · proposed ${esc(new Date(m.created_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${src(m)}</small>
      <label class="sr" for="m-${m.id}">Memory text</label><textarea id="m-${m.id}">${esc(m.content)}</textarea>
      <div class="row"><button class="btn primary small" data-act="approve">Approve</button><button class="btn small" data-act="reject">Reject</button></div></div>`).join('') || '<p class="empty">No proposals.</p>'}
    <h3>Approved (${approved.length})</h3>
    ${approved.map((m) => `<div class="mem" data-id="${m.id}"><small>${esc(m.category)} · approved ${esc(new Date(m.approved_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}${src(m)}</small>
      <div>${esc(m.content)}</div><div class="row"><span></span><button class="btn ghost small" data-act="forget">Forget</button></div></div>`).join('') || '<p class="empty">No approved memories yet.</p>'}`;
  $$('.mem', box).forEach((el) => $$('[data-act]', el).forEach((b) => b.addEventListener('click', async () => {
    const id = el.dataset.id; const act = b.dataset.act;
    if (act === 'forget' && !confirm('Forget this memory? It will be removed from the companion and from exports.')) return;
    const res = await guard(() => (act === 'forget' ? api('POST', `/api/os/memories/${id}/forget`)
      : api('POST', `/api/os/memories/${id}/review`, { approve: act === 'approve', content: $(`#m-${id}`).value })));
    if (res) { toast(act === 'approve' ? 'Memory approved' : act === 'reject' ? 'Proposal rejected' : 'Memory forgotten'); drawLedger(c); }
  })));
}

/* ---------------------------------------------------------------- together */
async function viewTogether() {
  const v = $('#view');
  v.innerHTML = `<div class="view-head"><div><h1>Together</h1><p>Companion-to-companion sandbox sessions. They live on the companion calendar, never change your personal schedule, and never read your memories.</p></div></div>
    <div class="grid-2"><section class="panel"><h2>Plan a session</h2>
      <div class="stack"><fieldset style="border:0;padding:0;margin:0"><legend class="sr">Companions</legend>
        <div class="companions">${S.companions.map((c) => `<label class="comp" style="cursor:pointer"><input type="checkbox" value="${esc(c.name)}" ${c.name !== 'PATCH' ? 'checked' : ''} class="sr tg-pick">${portrait(c.name)}<b>${esc(c.name)}</b></label>`).join('')}</div></fieldset>
      <div class="meta" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><label for="tg-date">Date</label><input id="tg-date" type="date" value="${dayKey(new Date())}"></div>
      <div><label for="tg-time">Time</label><input id="tg-time" type="time" value="19:00"></div></div>
      <button class="btn primary" id="tg-plan">Preview session</button>
      <p class="muted">Cross-account play (your companion with a friend's) is disabled until identity verification and mutual consent are built.</p></div></section>
    <section class="panel"><h2>Companion calendar</h2><div id="tg-list" class="stack"><p class="loading">Loading…</p></div></section></div>`;
  const syncPicks = () => $$('.tg-pick', v).forEach((i) => i.closest('.comp').setAttribute('aria-pressed', String(i.checked)));
  $$('.tg-pick', v).forEach((i) => i.addEventListener('change', syncPicks)); syncPicks();
  $('#tg-plan').addEventListener('click', () => {
    const names = $$('.tg-pick:checked', v).map((i) => i.value);
    if (names.length < 2) { toast('Pick at least two companions', true); return; }
    const d = parseIso(`${$('#tg-date').value}T${$('#tg-time').value}`);
    const text = `Plan a play session for ${names.join(' and ')} on ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(' ', '').toLowerCase()}`;
    $('#command-input').value = text; runCommand(text); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const evs = (await guard(() => api('GET', wsPath('/events?calendar=companion')))) || [];
  const list = $('#tg-list'); if (!list) return;
  list.innerHTML = evs.length ? evs.slice().reverse().map((e) => `<div class="mem ${e.completed ? '' : 'proposed'}"><small>${esc(fmtWhen(e.start_at))} · ${esc(e.participants.join(' & '))}</small>
      <div><b>${esc(e.title)}</b></div>
      <div class="row"><span class="muted">${e.completed ? 'Ran in sandbox ✓' : 'Scheduled'}</span>
      ${e.completed ? '<a class="btn small" href="#journal" data-disc="' + e.id + '">Read discovery</a>' : `<button class="btn primary small" data-run="${e.id}">Run in sandbox</button>`}</div></div>`).join('')
    : '<p class="empty">No sessions yet. Try “Plan a play session for MOSS and PIP tonight”.</p>';
  $$('[data-run]', list).forEach((b) => b.addEventListener('click', async () => {
    b.disabled = true;
    const r = await guard(() => api('POST', `/api/os/events/${b.dataset.run}/run-sandbox`));
    if (r) { toast(`Simulation ${r.outcome} — discovery logged`); location.hash = `#journal?e=${r.entry.id}`; } else b.disabled = false;
  }));
  $$('[data-disc]', list).forEach((a) => a.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const entries = (await guard(() => api('GET', wsPath('/journal')))) || [];
    const en = entries.find((x) => x.event_id === a.dataset.disc && x.origin === 'companion_sandbox');
    location.hash = en ? `#journal?e=${en.id}` : '#journal';
  }));
}

/* ---------------------------------------------------------------- companion device */
// The teardown is a self-contained page (built by tools/teardown from device/model.js),
// so it runs in a frame and keeps its own controls, worker and downloads.
function viewDevice() {
  $('#view').innerHTML = `<div class="view-head"><div><h1>Companion Device</h1>
      <p>PATCH as a small pixel world you can take apart. Slide it open, pose the ears, drain the battery, change the time of day, tap a part to isolate it, and recolor it.</p></div>
      <div class="toolbar"><span class="chip live-partial">Concept</span>
        <a class="btn small" href="/os/device/teardown.html" target="_blank" rel="noopener">Open full screen</a></div></div>
    <ul class="dv-specs" aria-label="Concept specifications">
      <li><b>≈ 198 × 120 × 90 mm</b><span>size</span></li><li><b>ARM + NPU</b><span>on-device AI</span></li>
      <li><b>3,000–4,000 mAh</b><span>4–8 h active</span></li><li><b>Mic array · camera · speaker</b><span>senses</span></li>
      <li><b>Magnetic dock</b><span>pogo-pin charging</span></li></ul>
    <div class="dv-frame"><iframe src="/os/device/teardown.html" title="PATCH pixel world: an interactive pixel-art model of the companion robot" loading="lazy"></iframe></div>`;
}

/* ---------------------------------------------------------------- planned / status */
function viewStatus(id) {
  const app = S.registry.find((a) => a.id === id);
  const v = $('#view');
  if (!app) { v.innerHTML = `<p class="empty">Unknown module “${esc(id)}”. <a href="#planner">Back to planner</a></p>`; return; }
  v.innerHTML = `<div class="view-head"><div><h1>${esc(app.name)}</h1><p><span class="chip ${app.status}">${STATUS_LABEL[app.status]}</span></p></div></div>
    <section class="panel status-card">${pixelSvg(ICONS[app.id] || ICONS.device, 'pix', '')}<p>${esc(app.blurb)}</p>
    <p class="muted">This card is in the registry so the roadmap is visible. It does not pretend to work: there is no ${esc(app.name.toLowerCase())} functionality in this release.</p>
    <a class="btn" href="#planner">Back to planner</a></section>`;
  $('.status-card .pix').style.cssText = 'width:96px;height:96px';
}

// Start after every deferred script (os.js, harness.js) has run.
document.addEventListener('DOMContentLoaded', boot);
