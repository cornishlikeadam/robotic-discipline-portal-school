'use strict';

const VERCEL_API_BASE = window.location.hostname.endsWith('github.io')
  ? 'https://robotic-discipline-portal-school.vercel.app'
  : '';

const main = document.querySelector('main');
const art = [
  'assets/01-make-and-learn.png',
  'assets/02-your-project-your-say.png',
  'assets/03-build-side-by-side.png'
];

// --- 1. PORTAL MACHINE STORY MAPS CONFIG (6 Living Apps + 5 Stops per World) ---
const defaultPortalConfig = {
  title: 'Portal Machine Story Maps',
  subtitle: 'Home screen -> living worlds -> staged funnels -> conversion',
  apps: [
    {
      id: 'kindreds-waitlist',
      name: "Kindred's Waitlist",
      glyph: 'KW',
      color: '#ffd400',
      tagline: 'Flagship 5-stop kinetic causeway world driving early cohort & waitlist signups.',
      stops: [
        {
          step: 1,
          label: 'Social Portal',
          pitch: 'Low-pressure parallel presence and co-making rituals instead of performative feeds.',
          cta: 'Enter the social experiment',
          link: '#companions'
        },
        {
          step: 2,
          label: 'Portfolio Gallery',
          pitch: 'Explore the physical-digital character shells, campaign art, and zine terminal.',
          cta: 'View the creative archive',
          link: '#studio'
        },
        {
          step: 3,
          label: 'Company Lab',
          pitch: 'Inspect the Robotic Discipline × Animal Scrypt × Madken engineering hands-on lab.',
          cta: 'Explore the systems being built',
          link: '#lab'
        },
        {
          step: 4,
          label: 'Research Observatory',
          pitch: 'Read the full White Paper, 8-Layer Blueprint, and /seed/00-29 operating book.',
          cta: 'Open the research notes',
          link: '#blueprint'
        },
        {
          step: 5,
          label: 'Final Waitlist Portal',
          pitch: 'You reached the conversion chamber. Join the Savannah / SCAD early tester & founder list.',
          cta: "Join Kindred's Waitlist",
          link: '#waitlist-form'
        }
      ]
    },
    {
      id: 'dating-social',
      name: 'Dating / Social Portal',
      glyph: 'SP',
      color: '#f472b6',
      tagline: 'Parallel-presence shared ritual objects and zero-shame dormancy.',
      stops: [
        { step: 1, label: 'Social Portal', pitch: 'Meet through shared making rituals instead of swiping.', cta: 'Meet PIP & Companions', link: '#companions' },
        { step: 2, label: 'Co-making Yard', pitch: 'Side-by-side 15-minute quiet build blocks on the campus map.', cta: 'Open Campus Map', link: '#map' },
        { step: 3, label: 'Bilateral Memory Fragment', pitch: 'Both humans must approve before a shared summary is kept.', cta: 'Try Together Exercise', link: '#lab' },
        { step: 4, label: 'Research Observatory', pitch: 'Read how parallel presence works in our White Paper.', cta: 'Read White Paper', link: '#blueprint' },
        { step: 5, label: 'Final Waitlist Portal', pitch: 'Reserve your paired companion shells.', cta: "Join Kindred's Waitlist", link: '#waitlist-form' }
      ]
    },
    {
      id: 'portfolio',
      name: 'Portfolio Gallery',
      glyph: 'PG',
      color: '#c084fc',
      tagline: 'Original campaign concepts, 3D-printed shells, and zine typography.',
      stops: [
        { step: 1, label: 'Portfolio Gallery', pitch: 'Inspect PATCH, MOSS, and PIP character concept sheets.', cta: 'View Companions', link: '#companions' },
        { step: 2, label: 'Concept Studio', pitch: 'Generate a locked visual brief in the School palette.', cta: 'Open Concept Studio', link: '#studio' },
        { step: 3, label: 'Visual CAD Blueprint', pitch: 'Customize the WAVE-08 translucent shell and NTAG215 slot.', cta: 'Open CAD Blueprint', link: '#blueprint' },
        { step: 4, label: 'Campus World Map', pitch: 'Pan and zoom across the 6 illustrated campus buildings.', cta: 'Explore Map', link: '#map' },
        { step: 5, label: 'Final Waitlist Portal', pitch: 'Request a custom Living World build or studio call.', cta: 'Book / Join Waitlist', link: '#waitlist-form' }
      ]
    },
    {
      id: 'company',
      name: 'Company Lab',
      glyph: 'CL',
      color: '#fe5400',
      tagline: 'Robotic Discipline (Animal Scrypt × Disciple × Madken) operating engine.',
      stops: [
        { step: 1, label: 'Company Lab', pitch: 'One company: Animal Scrypt product, Disciple studio, Madken mark.', cta: 'Read Master Context', link: '#blueprint' },
        { step: 2, label: '4-Tier Price Ladder', pitch: '$45 + $9/mo V1 shell scaling to $2,500 Founding Cohort.', cta: 'Inspect Pricing & CFO', link: '#dataroom' },
        { step: 3, label: '20% Royalty Loop', pitch: 'Single-hop parent maker royalty recorded in SQLite ledger.', cta: 'View Blueprint', link: '#blueprint' },
        { step: 4, label: 'Investor Data Room', pitch: 'Stage 1 public rooms + Stage 2 NDA-gated diligence rooms.', cta: 'Open Data Room', link: '#dataroom' },
        { step: 5, label: 'Final Waitlist Portal', pitch: 'Connect with founder Kendren "KJ" Cornish.', cta: 'Join Founder Updates', link: '#waitlist-form' }
      ]
    },
    {
      id: 'research',
      name: 'Research Observatory',
      glyph: 'RO',
      color: '#38bdf8',
      tagline: 'Embodied AI identity, explicit memory ledgers, and methods white paper.',
      stops: [
        { step: 1, label: 'Research Observatory', pitch: 'Identity, Embodiment, and Royalties for a Persistent Artificial Animal.', cta: 'Read White Paper', link: '#blueprint' },
        { step: 2, label: 'Memory Boundary Lab', pitch: 'PROPOSED -> APPROVED -> DELETED human-in-the-loop ledger.', cta: 'Try Memory Lab', link: '#lab' },
        { step: 3, label: 'Your Browser Notebook', pitch: 'Inspect and export your own approved project notes as JSON.', cta: 'Open Notebook', link: '#notebook' },
        { step: 4, label: 'VC & Founder Tools', pitch: 'Search 15 open-source startup & venture capital repositories.', cta: 'Open VC Directory', link: '#directory' },
        { step: 5, label: 'Final Waitlist Portal', pitch: 'Participate in the 3-adult 7-day recall study in Savannah.', cta: 'Sign Up for Study', link: '#waitlist-form' }
      ]
    },
    {
      id: 'more-school',
      name: 'Robotic Discipline School',
      glyph: 'RD',
      color: '#D8FF3E',
      tagline: 'Make, learn, and reengineer everyday objects with hands-on exercises.',
      stops: [
        { step: 1, label: 'Making Workshop', pitch: 'Build a little paper machine and test what helps it stand.', cta: 'Start Paper Exercise', link: '#school' },
        { step: 2, label: 'Reengineering Lab', pitch: 'Read an unpowered everyday object like a blueprint.', cta: 'Enter Lab', link: '#lab' },
        { step: 3, label: 'Interactive Campus Map', pitch: 'Explore all 6 campus zones on the illustrated world map.', cta: 'Open Campus Map', link: '#map' },
        { step: 4, label: 'Portal Machine Blueprint', pitch: 'Read the 12-section Portal Machine Story Maps specification.', cta: 'Read Spec', link: '#blueprint' },
        { step: 5, label: 'Final Waitlist Portal', pitch: 'Get notified when the next School workshop drops.', cta: 'Join School List', link: '#waitlist-form' }
      ]
    }
  ]
};

let portalConfig = (() => {
  try {
    const saved = localStorage.getItem('rd-portal-config');
    return saved ? JSON.parse(saved) : defaultPortalConfig;
  } catch {
    return defaultPortalConfig;
  }
})();

let activeAppId = 'kindreds-waitlist';
let machineStarted = true;
let activeStopIndex = 0;
let visitedStops = new Set(['kindreds-waitlist:0']);
let visitedZones = new Set(['make']);
let portalEvents = [];
let seedBundle = null;
let selectedDocId = 'PORTAL_MACHINE_BLUEPRINT';
let ndaUnlocked = false;
let vcFilterCat = '';
let vcFilterStage = '';
let vcSearchQ = '';

function logPortalEvent(eventName, detail = '') {
  const entry = {
    event: eventName,
    app: activeAppId,
    stop: activeStopIndex + 1,
    detail,
    timestamp: new Date().toISOString()
  };
  portalEvents.unshift(entry);
  portalEvents = portalEvents.slice(0, 25);
  updateQuestHud();
}

// --- 2. GAMIFICATION QUEST HUD ---
function readNotes() {
  try {
    const data = JSON.parse(localStorage.getItem('rd-approved-notes') || '[]');
    if (!Array.isArray(data)) return [];
    return data.filter(n => n && typeof n.text === 'string' && typeof n.date === 'string' && typeof n.id === 'string').slice(0, 100);
  } catch {
    return [];
  }
}
let notes = readNotes();
let storageError = '';

function updateQuestHud() {
  const b1 = visitedStops.size >= 3; // Portal Engineer
  const b2 = visitedZones.size >= 3; // Campus Explorer
  const b3 = notes.length >= 1;      // Memory Steward
  const b4 = !!seedBundle;           // Blueprint Architect
  const badges = [
    ['Portal Gear', b1],
    ['Map Explorer', b2],
    ['Memory Steward', b3],
    ['Blueprint Reader', b4]
  ];
  const unlockedCount = badges.filter(b => b[1]).length;
  const xpEl = document.querySelector('#quest-xp');
  const fillEl = document.querySelector('#quest-fill');
  const badgesEl = document.querySelector('#quest-badges');
  if (xpEl) xpEl.textContent = `${unlockedCount} / 4 BADGES`;
  if (fillEl) fillEl.style.width = `${Math.max(10, unlockedCount * 25)}%`;
  if (badgesEl) {
    badgesEl.innerHTML = badges
      .map(([name, on]) => `<span class="q-badge ${on ? 'unlocked' : ''}">${on ? '★ ' : ''}${name}</span>`)
      .join('');
  }
}

// --- 3. SCHOOL LESSONS & MAP DATA ---
const lessons = [
  {
    id: 'paper',
    category: 'Make',
    title: 'Build a little paper machine.',
    time: '20 MIN',
    image: 0,
    description: 'Turn one sheet of paper into a character. Explore shape, structure, and the way things stand.',
    steps: [
      ['Observe', 'Find a small cardboard package. Sketch its folds without opening it.'],
      ['Unfold', 'Carefully open the empty package. Notice which tabs hold the shape together.'],
      ['Rebuild', 'Make your own paper character from a new sheet. Use a wide base to help it stand.'],
      ['Reflect', 'What would you change about its structure? Write one project note.']
    ]
  },
  {
    id: 'memory',
    category: 'Think',
    title: 'Design a memory with boundaries.',
    time: '15 MIN',
    image: 1,
    description: 'Decide what a companion should remember—and what it should leave alone.',
    steps: [
      ['Choose a project', 'Describe a creative project using no sensitive personal information.'],
      ['Propose one memory', 'Write the smallest project note that would help you resume tomorrow.'],
      ['Set a boundary', 'List one thing the companion should not infer or retain.'],
      ['Review', 'Edit your note, then explicitly keep it or discard it.']
    ]
  },
  {
    id: 'together',
    category: 'Together',
    title: 'Make quietly. Side by side.',
    time: '15 MIN',
    image: 2,
    description: 'Try a short co-making ritual with a friend. Shared attention, without a conversation to perform.',
    steps: [
      ['Invite a person', 'Agree together on a short, quiet making session. This site does not send invitations.'],
      ['Pick a small task', 'Each person chooses their own sketch, paper model or repair plan.'],
      ['Make alongside', 'Use your own timer for 10 minutes. Sharing work is optional.'],
      ['Close gently', 'Share one thing you noticed, if you want. Keep only your own approved project note.']
    ]
  },
  {
    id: 'reverse',
    category: 'Reengineer',
    title: 'Read an object like a blueprint.',
    time: '25 MIN',
    image: 0,
    description: 'Trace the decisions inside an everyday object. Sketch a clearer, simpler second version.',
    steps: [
      ['Select safely', 'Choose an unpowered everyday object, such as a cardboard stand, pen case or book holder.'],
      ['Map the parts', 'Sketch its parts, joints and materials. You do not need to take it apart.'],
      ['Find the friction', 'Identify one awkward interaction. What tradeoff created it?'],
      ['Propose a revision', 'Sketch one improvement and describe what you would test next.']
    ]
  }
];

let currentLesson = lessons[3];
let selectedFilter = 'All';
let draft = '';

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(s) {
  const t = document.querySelector('.toast');
  if (!t) return;
  t.textContent = s;
  t.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => t.classList.remove('show'), 4200);
}

function updateCount() {
  const el = document.querySelector('#note-count');
  if (el) el.textContent = notes.length;
  updateQuestHud();
}

function persist() {
  try {
    localStorage.setItem('rd-approved-notes', JSON.stringify(notes));
    storageError = '';
    return true;
  } catch {
    storageError = 'Browser storage is unavailable. Your note is held in this tab only; export it before leaving.';
    return false;
  }
}

// --- 4. VIEW: PORTAL MACHINE STORY MAPS (#portal) ---
function portalView() {
  const appObj = portalConfig.apps.find(a => a.id === activeAppId) || portalConfig.apps[0];
  const currentStop = appObj.stops[activeStopIndex] || appObj.stops[0];

  const appIconsHtml = portalConfig.apps
    .map(
      a => `<button type="button" class="living-app-btn ${a.id === appObj.id ? 'active' : ''}" data-portal-app="${esc(a.id)}">
        <span class="app-glyph" style="background:${esc(a.color)}">${esc(a.glyph)}</span>
        <strong style="font-size:13px">${esc(a.name)}</strong>
        <span style="font-size:10px;color:#9d9992;margin-top:3px">5-Stop World ↗</span>
      </button>`
    )
    .join('');

  const stopsHtml = appObj.stops
    .map((s, idx) => {
      const isCurrent = idx === activeStopIndex;
      const isVisited = visitedStops.has(`${appObj.id}:${idx}`);
      return `<div class="stop-node ${isCurrent ? 'current' : ''} ${isVisited ? 'visited' : ''}" data-stop-idx="${idx}" style="cursor:pointer">
        <span class="stop-badge">STOP ${idx + 1} ${isCurrent ? '● ACTIVE' : isVisited ? '✓' : ''}</span>
        <h3 style="font-size:21px;margin:4px 0 6px">${esc(s.label)}</h3>
        <p style="font-size:12px;color:#bdb7ad;margin:0">${esc(s.pitch)}</p>
      </div>`;
    })
    .join('');

  const gearAngle = activeStopIndex * 72;
  const progressPct = ((activeStopIndex + 1) / appObj.stops.length) * 100;

  return `
    <div class="page-intro">
      <h1>PORTAL MACHINE<br><span style="color:var(--accent)">STORY MAPS.</span></h1>
      <p>A stationary home screen where every icon opens a living causeway world. Trigger the chain reaction, pause at each stop, and convert curiosity into action.</p>
    </div>

    <!-- LAYER 1: STATIONARY HOME SCREEN OF LIVING APPS -->
    <section class="portal-desktop" aria-label="Portal Machine Stationary App Home Screen">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <span style="font-size:11px;letter-spacing:1.4px;color:var(--accent)">LAYER 1 // STATIONARY APP HOME SCREEN</span>
          <h2 style="font-size:30px;margin-top:4px">Select a Living App to Launch Its World</h2>
        </div>
        <a href="#blueprint" class="button secondary" data-open-doc="PORTAL_MACHINE_BLUEPRINT">Read 12-Section Blueprint ↗</a>
      </div>
      <div class="app-icon-grid">${appIconsHtml}</div>
    </section>

    <!-- LAYER 2: KINETIC CHAIN-REACTION CAUSEWAY MACHINE -->
    <section class="causeway-machine" aria-label="Active Living World Chain Reaction Funnel">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid #343434;padding-bottom:14px">
        <div>
          <span style="font-size:11px;letter-spacing:1.4px;color:var(--orange)">LAYER 2 // ACTIVE CAUSEWAY WORLD: ${esc(appObj.name.toUpperCase())}</span>
          <h2 style="font-size:34px;margin-top:4px">${esc(appObj.tagline)}</h2>
        </div>
        <button type="button" class="button orange" id="portal-start-btn">⚡ Pull Start Lever (Reset Chain Reaction)</button>
      </div>

      <!-- Animated SVG Domino / Gear Causeway Illustration -->
      <div style="margin:18px 0;background:#0c0d12;border:1px solid #2e323d;border-radius:12px;padding:14px">
        <svg viewBox="0 0 900 130" style="width:100%;height:auto;display:block" aria-label="Animated cause-and-effect domino gear path">
          <!-- Signal Causeway Pipe -->
          <line x1="70" y1="65" x2="830" y2="65" stroke="#292d38" stroke-width="10" stroke-linecap="round"/>
          <line x1="70" y1="65" x2="${70 + (760 * activeStopIndex) / 4}" y2="65" stroke="${esc(appObj.color)}" stroke-width="10" stroke-linecap="round"/>
          ${appObj.stops
            .map((s, idx) => {
              const cx = 70 + idx * 190;
              const active = idx <= activeStopIndex;
              return `
                <g transform="translate(${cx},65)">
                  <circle r="28" fill="${active ? appObj.color : '#191b22'}" stroke="#e5e0d6" stroke-width="3"/>
                  <circle r="12" fill="#141416" transform="rotate(${gearAngle})"/>
                  <text y="5" text-anchor="middle" fill="#e5e0d6" font-family="Barlow,sans-serif" font-size="14">${idx + 1}</text>
                  <text y="48" text-anchor="middle" fill="${active ? '#ffd400' : '#8e8a84'}" font-family="Barlow,sans-serif" font-size="13">${esc(s.label)}</text>
                </g>
              `;
            })
            .join('')}
        </svg>
      </div>

      <!-- 5 Interactive Stop Nodes -->
      <div class="stop-nodes">${stopsHtml}</div>

      <!-- Active Stop Pause Chamber + Primary Action + Continue Journey -->
      <div class="workbench" style="margin-top:20px">
        <div class="panel" style="border:2px solid var(--accent)">
          <span style="font-size:11px;letter-spacing:1.2px;color:var(--accent)">PAUSE STOP ${currentStop.step} OF ${appObj.stops.length} // CAUSE &amp; EFFECT CHOICE</span>
          <h2 style="margin-top:6px">${esc(currentStop.label)}</h2>
          <p style="font-size:16px;color:#e5e0d6">${esc(currentStop.pitch)}</p>
          <div class="actions" style="margin-top:18px">
            <button type="button" class="button" id="portal-primary-cta" data-target-link="${esc(currentStop.link)}">
              ${esc(currentStop.cta)} ↗
            </button>
            ${
              activeStopIndex < appObj.stops.length - 1
                ? `<button type="button" class="button orange" id="portal-continue-btn">Continue Journey (Next Stop &rarr;)</button>`
                : `<span style="color:var(--lime);font-weight:bold;font-size:13px">★ Final Conversion Chamber Reached!</span>`
            }
          </div>

          <!-- Final Portal Conversion Waitlist Form -->
          <form id="waitlist-form" style="margin-top:22px;padding-top:18px;border-top:1px dashed #49453d">
            <h3 style="font-size:22px">Final Portal Conversion: Join ${esc(appObj.name)}</h3>
            <p class="small">Captures lead locally and syncs to the Vercel serverless backend (<code>/api/portal/lead</code>).</p>
            <div style="display:grid;grid-template-columns:1fr 1fr auto;gap:10px;margin-top:10px">
              <input type="text" id="lead-name" placeholder="Your name (e.g. KJ Cornish)" required />
              <input type="email" id="lead-email" placeholder="Email (e.g. kj@scad.edu)" required />
              <button type="submit" class="button">Submit ↗</button>
            </div>
            <div id="lead-status" class="status"></div>
          </form>
        </div>

        <!-- Telemetry & JSON World Customizer -->
        <div class="panel">
          <h3 style="font-size:24px">Live Funnel Telemetry &amp; JSON Editor</h3>
          <p class="small">Tracks <code>app_opened</code>, <code>start_clicked</code>, <code>stop_viewed</code>, <code>primary_link_clicked</code>, <code>continue_clicked</code>, <code>final_cta_clicked</code>, and <code>waitlist_submitted</code>.</p>
          <pre style="background:#141416;padding:12px;border:1px solid #3c3935;font-size:11.5px;max-height:170px;overflow-y:auto;color:var(--lime)">${esc(
            JSON.stringify(portalEvents.slice(0, 6), null, 2)
          )}</pre>
          <details style="margin-top:12px">
            <summary style="cursor:pointer;color:var(--accent);font-weight:bold;font-size:13px">Customize Living World Stops (JSON Engine)</summary>
            <textarea id="portal-json-editor" style="min-height:160px;font-family:monospace;font-size:12px;margin-top:8px">${esc(
              JSON.stringify(portalConfig, null, 2)
            )}</textarea>
            <button type="button" class="button secondary" id="save-portal-json" style="margin-top:8px">Save World Config</button>
          </details>
        </div>
      </div>
    </section>
  `;
}

// --- 5. VIEW: VISUAL DESIGN STUDIO, CAD BLUEPRINT & WHITE PAPER READER/EDITOR (#blueprint) ---
function blueprintView() {
  if (!seedBundle) {
    return `<div class="page-intro"><h1>LOADING WHITE PAPER &amp; BLUEPRINT STUDIO...</h1><p>Fetching <code>seed-bundle.json</code> (38 documents, CAD schematic, and 15 VC tools)...</p></div>`;
  }
  const docEntry = seedBundle.documents[selectedDocId] || seedBundle.documents['PORTAL_MACHINE_BLUEPRINT'];
  const savedOverride = localStorage.getItem('rd-doc-edit-' + selectedDocId);
  const htmlToRender = savedOverride || docEntry.html;

  const optionsHtml = seedBundle.doc_index
    .map(([id, label]) => `<option value="${esc(id)}" ${id === selectedDocId ? 'selected' : ''}>${esc(label)}</option>`)
    .join('');

  return `
    <div class="page-intro">
      <h1>WHITE PAPER, CAD BLUEPRINT &amp;<br><span style="color:var(--accent)">VISUAL STUDIO.</span></h1>
      <p>Read the entire Robotic Discipline × Animal Scrypt × Portal Machine Story Maps White Paper and <code>/seed/00-29</code> operating book as a formatted publication, customize the hardware shell &amp; colors live, and click any text to edit it visually on the page.</p>
    </div>

    <!-- Interactive Hardware & Shell Blueprint Schematic -->
    <section class="causeway-machine" style="margin-bottom:24px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
        <span style="font-size:11px;letter-spacing:1.4px;color:var(--accent)">INTERACTIVE HARDWARE &amp; SHELL CAD BLUEPRINT // ANIMAL SCRYPT &times; MADKEN</span>
        <span id="cad-unit-label" style="font-family:monospace;font-size:12px;color:var(--lime)">UNIT: WAVE-08 (Cobalt Scout) | 28mm NTAG215 | 2.4mm Wall</span>
      </div>
      <div class="workbench">
        <svg id="cad-svg" viewBox="0 0 440 240" style="width:100%;height:auto;background:#090d14;border:1px solid #334155;border-radius:8px">
          <polygon id="cad-ear-l" points="145,50 165,16 185,50" fill="#0e62d1" fill-opacity="0.6" stroke="#93c5fd" stroke-width="1.5"/>
          <polygon id="cad-ear-r" points="235,50 255,16 275,50" fill="#0e62d1" fill-opacity="0.6" stroke="#93c5fd" stroke-width="1.5"/>
          <rect id="cad-head" x="140" y="46" width="140" height="74" rx="14" fill="#0e62d1" fill-opacity="0.68" stroke="#bfdbfe" stroke-width="2"/>
          <rect x="156" y="64" width="108" height="32" rx="6" fill="#090d14" stroke="#60a5fa" stroke-width="1.2"/>
          <circle id="cad-eye-l" cx="182" cy="80" r="8" fill="#16c784"/>
          <circle id="cad-eye-r" cx="238" cy="80" r="8" fill="#16c784"/>
          <rect id="cad-torso" x="152" y="126" width="116" height="70" rx="10" fill="#0e62d1" fill-opacity="0.62" stroke="#bfdbfe" stroke-width="2"/>
          <circle id="cad-core" cx="210" cy="160" r="13" fill="#16c784" fill-opacity="0.4" stroke="#16c784" stroke-width="2"/>
          <rect x="135" y="200" width="150" height="20" rx="4" fill="#1e293b" stroke="#94a3b8" stroke-width="1.5"/>
          <rect x="170" y="204" width="80" height="12" rx="2" fill="none" stroke="#ffd400" stroke-width="1.8" stroke-dasharray="4,2"/>
          <text x="14" y="28" fill="#93c5fd" font-family="monospace" font-size="10">FIG 1. TRANSLUCENT ARTICULATED SHELL</text>
          <text x="14" y="214" fill="#ffd400" font-family="monospace" font-size="10">NTAG215 NFC BASE CAVITY (28MM)</text>
        </svg>
        <div class="panel">
          <h3 style="font-size:24px">Live Visual Design &amp; Shell Inspector</h3>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">
            <label style="font-size:11px">Shell Translucent Tint
              <input type="color" id="cad-shell-color" value="#0e62d1" style="height:36px;padding:2px" />
            </label>
            <label style="font-size:11px">Optic Core LED Color
              <input type="color" id="cad-optic-color" value="#16c784" style="height:36px;padding:2px" />
            </label>
            <label style="font-size:11px">Paper Sheet Color
              <input type="color" id="wp-paper-color" value="#EFE6D4" style="height:36px;padding:2px" />
            </label>
            <label style="font-size:11px">Accent Highlight Color
              <input type="color" id="wp-accent-color" value="#ffd400" style="height:36px;padding:2px" />
            </label>
          </div>
          <p class="small" style="margin-top:10px">Pick any color above to update the hardware schematic and publication sheet in real time.</p>
        </div>
      </div>
    </section>

    <!-- Document Selector + Visual Contenteditable Toolbar + Formatted Paper Sheet -->
    <section>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:14px">
        <div style="flex:1;min-width:260px">
          <label for="doc-picker" style="font-size:11px;letter-spacing:1px;color:var(--accent)">SELECT WHITE PAPER, BLUEPRINT OR /SEED/ CHAPTER (38 DOCUMENTS)</label>
          <select id="doc-picker" style="margin-top:4px;font-weight:bold">${optionsHtml}</select>
        </div>
        <div class="actions">
          <button type="button" class="button" id="toggle-visual-edit">✎ Click to Visually Edit Text</button>
          <button type="button" class="button orange" id="save-visual-edit">Save Edits</button>
          <button type="button" class="button secondary" id="download-doc-md">Download .md</button>
          <button type="button" class="button secondary" onclick="window.print()">Print / PDF</button>
        </div>
      </div>

      <article id="wp-sheet" class="paper-sheet" contenteditable="false">
        ${htmlToRender}
      </article>
    </section>
  `;
}

// --- 6. VIEW: INVESTOR DATA ROOM (#dataroom) ---
function dataroomView() {
  const rooms = seedBundle ? seedBundle.dataroom_rooms : [];
  const s1 = rooms.filter(r => r.tier === 'STAGE_1');
  const s2 = rooms.filter(r => r.tier === 'STAGE_2');

  return `
    <div class="page-intro">
      <h1>SELF-HOSTED<br><span style="color:var(--accent)">INVESTOR DATA ROOM.</span></h1>
      <p>Stage 1 rooms are open for pre-seed diligence. Stage 2 rooms (Financials, Cap Table, Legal, Tax, IP) are locked behind the interactive NDA state machine.</p>
    </div>

    <div class="panel" style="margin-bottom:24px;border:2px solid var(--accent)">
      <h2 style="font-size:28px">Interactive Stage 2 NDA Gate</h2>
      <p>Current Viewer Status: <strong style="color:var(--accent)">${ndaUnlocked ? 'STAGE 2 UNLOCKED (NDA SIGNED & FOUNDER APPROVED)' : 'STAGE 1 ONLY (STAGE 2 LOCKED)'}</strong></p>
      <div class="actions">
        <button type="button" class="button" id="btn-unlock-nda">${ndaUnlocked ? 'Lock Stage 2 Rooms' : 'Sign & Founder-Approve NDA (Unlock Stage 2) ↗'}</button>
        <a href="#blueprint" class="button secondary" data-open-doc="11-deck-investor.md">Read 10-Slide Investor Deck ↗</a>
      </div>
    </div>

    <h2>Stage 1 Rooms (Pre-NDA Public)</h2>
    <div class="lesson-grid" style="margin:16px 0 32px">
      ${s1.map(r => `<article class="panel">
        <span style="font-size:10px;color:var(--lime)">STAGE 1 // UNLOCKED</span>
        <h3 style="margin:6px 0">${esc(r.title)}</h3>
        <p>${esc(r.summary)}</p>
        <p class="small" style="color:#e5e0d6">${esc(r.corpus)}</p>
      </article>`).join('')}
    </div>

    <h2>Stage 2 Rooms (Confidential — NDA Required)</h2>
    <div class="lesson-grid" style="margin-top:16px">
      ${s2.map(r => `<article class="panel" style="opacity:${ndaUnlocked ? '1' : '0.6'}">
        <span style="font-size:10px;color:${ndaUnlocked ? 'var(--lime)' : 'var(--orange)'}">${ndaUnlocked ? 'STAGE 2 // NDA VERIFIED' : 'LOCKED // 403 FORBIDDEN'}</span>
        <h3 style="margin:6px 0">${esc(r.title)}</h3>
        <p>${esc(r.summary)}</p>
        <p class="small" style="color:#e5e0d6">${ndaUnlocked ? esc(r.corpus) : '[Sign & Approve NDA above to inspect Stage 2 confidential corpus]'}</p>
      </article>`).join('')}
    </div>
  `;
}

// --- 7. VIEW: VC TOOLS DIRECTORY (#directory) ---
function directoryView() {
  const tools = seedBundle ? seedBundle.vc_tools : [];
  const filtered = tools.filter(t => {
    if (vcFilterCat && t.category.toLowerCase() !== vcFilterCat.toLowerCase()) return false;
    if (vcFilterStage && t.stage.toLowerCase() !== vcFilterStage.toLowerCase()) return false;
    if (vcSearchQ) {
      const q = vcSearchQ.toLowerCase();
      return t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q) || t.category.toLowerCase().includes(q);
    }
    return true;
  });

  const stages = ['All', 'Pre-seed', 'Seed', 'All stages'];
  const cats = ['All', 'fundraising', 'market research', 'startup metrics', 'due diligence', 'deal sourcing', 'AI tools'];

  return `
    <div class="page-intro">
      <h1>OPEN-SOURCE VC &amp;<br><span style="color:var(--accent)">STARTUP TOOLS.</span></h1>
      <p>Searchable index of 15 open-source repositories for pre-seed founders, accelerators, and venture diligence.</p>
    </div>

    <div class="panel" style="margin-bottom:24px">
      <input type="search" id="vc-search" value="${esc(vcSearchQ)}" placeholder="Search tools, categories, languages..." />
      <div class="filter-row" style="margin-top:12px">
        ${stages.map(s => `<button type="button" class="filter" aria-pressed="${(vcFilterStage || 'All') === s}" data-vc-stage="${s === 'All' ? '' : s}">${s}</button>`).join('')}
      </div>
      <div class="filter-row">
        ${cats.map(c => `<button type="button" class="filter" aria-pressed="${(vcFilterCat || 'All') === c}" data-vc-cat="${c === 'All' ? '' : c}">${c}</button>`).join('')}
      </div>
    </div>

    <div class="lesson-grid">
      ${filtered.map(t => `<article class="panel">
        <div class="lesson-top" style="margin-top:0">
          <span>${esc(t.stage.toUpperCase())}</span>
          <span>${esc(t.category.toUpperCase())}</span>
        </div>
        <h3 style="margin:10px 0"><a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${esc(t.name)} ↗</a></h3>
        <p>${esc(t.description)}</p>
        <p class="small">Language: ${esc(t.language)} | Stars: ${esc(t.stars)}</p>
      </article>`).join('')}
    </div>
  `;
}

// --- 8. ORIGINAL SCHOOL VIEWS (#school, #lab, #companions, #studio, #notebook, #about, #map) ---
function lessonMarkup(l) {
  return `<article class="lesson"><img src="${art[l.image]}" alt="${['PATCH, MOSS and PIP at a making workbench', 'PATCH presenting a note with Approve, Edit and Discard choices', 'Three companions making at a shared workbench'][l.image]}" loading="lazy" width="1122" height="1402"><div class="lesson-top"><span>${l.category.toUpperCase()}</span><span>${l.time} / SELF-GUIDED</span></div><h3>${l.title}</h3><p>${l.description}</p><button type="button" data-lesson="${l.id}">Try this exercise ↗</button></article>`;
}

function school() {
  return `<section class="hero"><div class="hero-copy"><h1>MAKE THE<br>MACHINE<br><span>MAKE SENSE.</span></h1><p>A school for curious minds. Make a little, take a closer look, and reengineer the things around you.</p><div class="actions"><a class="button" href="#map">Explore the school map <span aria-hidden="true">↗</span></a><a class="button orange" href="#portal">Open Portal Machine Maps ↗</a><a class="text-link" href="#companions">Meet your companions</a></div><p class="meta">HANDS-ON EXERCISES. HUMAN CHOICES. ORIGINAL CHARACTERS.</p></div><div class="hero-art"><img src="${art[0]}" alt="Make something. Learn something. PATCH the rabbit and two companions build a paper robot." width="1122" height="1402" fetchpriority="high"><span class="art-caption">CHARACTER CONCEPT ART</span></div></section><section aria-labelledby="exercise-title"><div class="section-heading"><h2 id="exercise-title">A little practice goes a long way.</h2><p>Pick something small. See where it takes you.</p></div><div class="filter-row" role="group" aria-label="Filter exercises">${['All', 'Make', 'Think', 'Together', 'Reengineer'].map(f => `<button class="filter" aria-pressed="${selectedFilter === f}" data-filter="${f}">${f}</button>`).join('')}</div><div class="lesson-grid" id="lesson-grid">${lessons.filter(l => selectedFilter === 'All' || l.category === selectedFilter).map(lessonMarkup).join('')}</div></section><section class="manifesto"><h2>LESS CONSUMING.<br>MORE UNDERSTANDING.</h2><div><p>Reengineering starts with a question: why was it made this way? Learn to notice the parts, choices, and possibilities inside everyday things.</p><a href="#lab">Start with an object on your desk ↗</a></div></section>`;
}

function lab() {
  return `<div class="page-intro"><h1>TAKE A CLOSER LOOK.</h1><p>The Reengineering Lab turns curiosity into a small, hands-on experiment. Pick a guide, try the steps, and leave with a thought of your own.</p></div><div class="workbench"><section class="panel"><h2>Your next experiment.</h2><div class="form-field"><label for="exercise-select">Choose an exercise</label><select id="exercise-select">${lessons.map(l => `<option value="${l.id}" ${l.id === currentLesson.id ? 'selected' : ''}>${l.title} — ${l.time.toLowerCase()}</option>`).join('')}</select></div><ol class="checklist">${currentLesson.steps.map(([h, t], i) => `<li><input type="checkbox" id="step-${i}"><label for="step-${i}"><strong>${i + 1}. ${h}</strong>${t}</label></li>`).join('')}</ol><p id="step-status" class="small" role="status">Work at your own pace. Steps stay in this session only.</p><div class="form-field"><label for="project-note">What did you notice?</label><textarea id="project-note" maxlength="2000" placeholder="One design choice, one surprise, or one thing to try next…">${esc(draft)}</textarea></div><p class="small">Nothing you type here is sent to an AI. A note is kept only after you review and approve it.</p><button class="button" id="review-note">Review my note ↗</button><div id="review-area"></div></section><aside><img class="lab-art" src="${art[currentLesson.image]}" alt="Robotic Discipline companion concept illustration" width="1122" height="1402"><section class="panel"><h2>YOUR SAY COMES FIRST.</h2><p>Characters are part of the learning world. This site's exercises and notebook work without a live AI companion.</p><a class="text-link" href="#notebook">Open your notebook ↗</a></section></aside></div>`;
}

function companions() {
  return `<div class="page-intro"><h1>SMALL COMPANIONS.<br>DIFFERENT PERSPECTIVES.</h1><p>A curious maker, a steady observer, and a bright collaborator. Meet the original character concepts behind the School.</p></div><div class="workbench"><div>${[['P.', 'PATCH', 'The curious maker.', 'A robotic rabbit with one folded ear and a habit of asking what happens next. A character concept for hands-on creative practice.'], ['M.', 'MOSS', 'The steady observer.', 'A modular tortoise who takes time to notice the structure underneath. A character concept for looking closely and reflecting.'], ['P.', 'PIP', 'The bright collaborator.', 'A little bird with room for another point of view. A character concept for making things alongside other people.']].map(([l, n, h, d]) => `<section class="companion-row"><span class="letter" aria-hidden="true">${l}</span><div><h2>${n}</h2><p><strong>${h}</strong><br>${d}</p></div></section>`).join('')}<p class="small">These are original campaign concepts, not available robot products. Physical figures, docking, and live AI behavior remain future directions.</p><a class="button" href="#studio">Make a concept prompt ↗</a></div><img class="wide-art" src="${art[2]}" alt="MOSS, PIP and PATCH building side by side" width="1122" height="1402"></div>`;
}

function studio() {
  return `<div class="page-intro"><h1>GIVE YOUR IDEA<br>A STARTING POINT.</h1><p>Build a reusable creative brief in the School's visual language. This tool writes a prompt you can take to your image tool—it doesn't generate an image.</p></div><div class="workbench"><section class="panel"><h2>Shape the concept.</h2><div class="form-field"><label for="concept-subject">What are we making?</label><input id="concept-subject" maxlength="180" placeholder="A poster about repairing an everyday object"></div><div class="form-field"><label for="concept-character">Choose a companion</label><select id="concept-character"><option>PATCH — curious maker</option><option>MOSS — steady observer</option><option>PIP — bright collaborator</option><option>The whole companion cast</option></select></div><div class="form-field"><label for="concept-format">Format</label><select id="concept-format"><option>Portrait 4:5 campaign poster</option><option>Square lesson illustration</option><option>Landscape 16:9 storyboard frame</option></select></div><div class="form-field"><label for="concept-headline">Exact headline</label><input id="concept-headline" maxlength="90" placeholder="REPAIR IS A WAY OF LEARNING."></div><p class="small">Use an original idea. Keep claims about products and outcomes accurate.</p><button class="button" id="build-prompt">Build my prompt ↗</button><div id="studio-status" class="status" role="status"></div></section><section class="panel"><h2>Your creative brief.</h2><p>Original characters. Flat fills. Clear purpose.</p><div id="prompt-output" class="prompt-output">Add your idea and headline, then build your prompt.</div><div class="actions" style="margin-top:20px"><button class="button secondary" id="copy-prompt" disabled>Copy prompt</button><button class="button secondary" id="download-prompt" disabled>Download .txt</button></div></section></div>`;
}

function notebook() {
  return `<div class="page-intro"><h1>THE THOUGHTS<br>YOU CHOOSE TO KEEP.</h1><p>Your approved project notes, kept in this browser. Nothing here is sent to a server or shared with a companion.</p></div><div class="actions"><a class="button" href="#lab">Write a project note ↗</a><button id="export-notes" class="button secondary" ${notes.length ? '' : 'disabled'}>Export notebook</button></div>${storageError ? `<p class="status">${esc(storageError)}</p>` : ''}<div style="margin-top:30px">${notes.length ? notes.slice().reverse().map(n => `<article class="note"><time datetime="${esc(n.date)}">${esc(new Date(n.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }))}</time><p>${esc(n.text)}</p><button data-delete="${esc(n.id)}">Delete this note</button></article>`).join('') : `<section class="empty"><h2>A fresh page.</h2><p>Try an exercise in the lab. Review a thought, then decide if it belongs here.</p></section>`}</div>`;
}

function about() {
  return `<div class="page-intro"><h1>CURIOUS PEOPLE.<br>USEFUL MACHINES.</h1><p>Robotic Discipline School &amp; Portal Machine Story Maps are part of Robotic Discipline (Animal Scrypt × Disciple × Madken), founded by Kendren “KJ” Cornish.</p></div><div class="about-copy"><h2>Unified Architecture.</h2><p>This forked edition combines the Portal Machine Story Maps cause-and-effect funnel engine, the interactive Robotic Discipline School campus map and exercises, and the complete White Paper &amp; Blueprint visual studio.</p><a href="#portal" class="button">Back to Portal Machine ↗</a></div>`;
}

const mapZones = [
  { id: 'make', name: 'Making Workshop', short: 'MAKE', x: 20, y: 40, companion: 'PATCH / Curious maker', text: 'Start at the workbench. Turn a sheet of paper into a character, then notice what helps it stand.', action: 'Try the paper-machine exercise', lesson: 'paper' },
  { id: 'memory', name: 'Memory Archive', short: 'REMEMBER', x: 50, y: 36, companion: 'PATCH / Your say comes first', text: 'Design one useful project memory. Decide what to approve, edit, or discard before keeping a note in your browser.', action: 'Explore memory boundaries', lesson: 'memory' },
  { id: 'lab', name: 'Reengineering Lab', short: 'REENGINEER', x: 82, y: 40, companion: 'MOSS / Look a little closer', text: 'Choose an unpowered everyday object. Map its parts, question one design decision, and sketch a clearer second version.', action: 'Enter the Reengineering Lab', lesson: 'reverse' },
  { id: 'garden', name: 'Quiet Garden', short: 'REST', x: 17, y: 89, companion: 'MOSS / The steady observer', text: 'Take a pause. Look away from your screen, notice one thing around you, and return when you want. No countdown, streak, or score.', action: 'Meet MOSS and the companions', route: 'companions' },
  { id: 'yard', name: 'Co-making Yard', short: 'TOGETHER', x: 49, y: 92, companion: 'PIP / Another point of view', text: 'Try a quiet making session with someone you choose. This is a self-guided activity; the map does not show live visitors or connect people automatically.', action: 'Try a side-by-side session', lesson: 'together' },
  { id: 'studio', name: 'Concept Studio', short: 'IMAGINE', x: 82, y: 89, companion: 'PIP / The bright collaborator', text: 'Turn your idea into a reusable image prompt with the School palette, original companions, and a clear headline.', action: 'Build a concept prompt', route: 'studio' }
];

let selectedZone = 'make';
let mapView = { x: 0, y: 0, scale: 1, fit: 1 };
let mapResizeObserver;

function zoneDetail(z) {
  return `<div class="map-detail-heading"><span class="map-signal" aria-hidden="true"></span><h2>${z.name}</h2></div><p class="map-companion">${z.companion}</p><p>${z.text}</p><button class="button" id="enter-zone" data-zone-target="${z.id}">${z.action} ↗</button><p class="small">Illustrated school world. Activities open on this site.</p>`;
}

function schoolMap() {
  const z = mapZones.find(z => z.id === selectedZone);
  return `<div class="map-intro"><div><h1>FIND YOUR NEXT<br>“WHAT IF?”</h1><p>A little world for making, remembering, and seeing things differently. Choose a place to begin.</p></div><a class="text-link" href="#school">Browse all exercises ↗</a></div><section class="map-shell" aria-label="Interactive school world"><div class="map-toolbar"><span>THE SCHOOL WORLD (${visitedZones.size} / 6 ZONES EXPLORED)</span><div class="map-tools" role="group" aria-label="Map view controls"><button type="button" id="map-minus" aria-label="Zoom out">−</button><output id="map-zoom" aria-label="Map zoom">100%</output><button type="button" id="map-plus" aria-label="Zoom in">+</button><button type="button" id="map-reset">Reset view</button></div></div><div id="map-viewport" class="map-viewport" tabindex="0" aria-label="School map. Drag to explore."><div id="map-world" class="map-world"><img src="assets/school-world-map.png" alt="Original illustrated campus with six buildings and gardens connected around a companion plaza." width="1536" height="1024" draggable="false">${mapZones.map(z => `<button type="button" class="map-pin ${z.id === selectedZone ? 'selected' : ''}" data-zone="${z.id}" style="left:${z.x}%;top:${z.y}%" aria-label="Explore ${z.name}" aria-pressed="${z.id === selectedZone}"><span class="pin-dot" aria-hidden="true"></span><span>${z.name}</span></button>`).join('')}<button type="button" class="companion-pin" data-companion-map="true" style="left:50%;top:49%" aria-label="Meet the companions at the central plaza"><span>MEET THE COMPANIONS ↗</span></button></div></div><p class="map-help">Drag to explore · + / − to zoom · Arrow keys to pan · Select a place to see what’s inside.</p></section><div class="map-bottom"><nav class="map-directory" aria-label="Choose a map destination">${mapZones.map(z => `<button type="button" data-zone="${z.id}" class="${selectedZone === z.id ? 'selected' : ''}" aria-pressed="${z.id === selectedZone}"><span>${z.short}</span>${z.name}<span aria-hidden="true">↗</span></button>`).join('')}</nav><section id="map-detail" class="map-detail" aria-live="polite" aria-atomic="true">${zoneDetail(z)}</section></div>`;
}

function selectZone(id) {
  const z = mapZones.find(z => z.id === id);
  if (!z) return;
  selectedZone = id;
  visitedZones.add(id);
  updateQuestHud();
  document.querySelectorAll('[data-zone]').forEach(b => {
    b.classList.toggle('selected', b.dataset.zone === id);
    b.setAttribute('aria-pressed', String(b.dataset.zone === id));
  });
  const detailEl = document.querySelector('#map-detail');
  if (detailEl) detailEl.innerHTML = zoneDetail(z);
}

function renderMap() {
  const vp = document.querySelector('#map-viewport'), world = document.querySelector('#map-world');
  if (!vp || !world) return;
  const w = vp.clientWidth, h = vp.clientHeight, mw = 1200 * mapView.scale, mh = 800 * mapView.scale;
  mapView.x = mw <= w ? (w - mw) / 2 : Math.max(w - mw - 30, Math.min(30, mapView.x));
  mapView.y = mh <= h ? (h - mh) / 2 : Math.max(h - mh - 30, Math.min(30, mapView.y));
  world.style.transform = `translate(${mapView.x}px,${mapView.y}px) scale(${mapView.scale})`;
  world.style.setProperty('--pin-scale', 1 / mapView.scale);
  const zoom = Math.round((mapView.scale / mapView.fit) * 100);
  document.querySelector('#map-zoom').textContent = `${zoom}%`;
  document.querySelector('#map-minus').disabled = zoom <= 100;
  document.querySelector('#map-plus').disabled = zoom >= 300;
}

function resetMap() {
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  mapView.fit = Math.min(vp.clientWidth / 1200, vp.clientHeight / 800);
  mapView.scale = mapView.fit;
  mapView.x = 0;
  mapView.y = 0;
  renderMap();
}

function zoomMap(factor) {
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  const old = mapView.scale, next = Math.max(mapView.fit, Math.min(mapView.fit * 3, old * factor));
  const cx = vp.clientWidth / 2, cy = vp.clientHeight / 2;
  mapView.x = cx - ((cx - mapView.x) * next) / old;
  mapView.y = cy - ((cy - mapView.y) * next) / old;
  mapView.scale = next;
  renderMap();
}

function initMap() {
  if (mapResizeObserver) mapResizeObserver.disconnect();
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  resetMap();
  mapResizeObserver = new ResizeObserver(resetMap);
  mapResizeObserver.observe(vp);
  let drag = null;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    drag = { px: e.clientX, py: e.clientY, x: mapView.x, y: mapView.y };
    vp.setPointerCapture(e.pointerId);
    vp.classList.add('dragging');
  });
  vp.addEventListener('pointermove', e => {
    if (!drag) return;
    mapView.x = drag.x + e.clientX - drag.px;
    mapView.y = drag.y + e.clientY - drag.py;
    renderMap();
  });
  const stop = () => {
    drag = null;
    vp.classList.remove('dragging');
  };
  vp.addEventListener('pointerup', stop);
  vp.addEventListener('pointercancel', stop);
}

const views = {
  portal: portalView,
  map: schoolMap,
  blueprint: blueprintView,
  school,
  lab,
  companions,
  studio,
  notebook,
  dataroom: dataroomView,
  directory: directoryView,
  about
};

function route() {
  const key = location.hash.slice(1) || 'portal';
  const view = views[key] ? key : 'portal';
  main.innerHTML = views[view]();
  document.querySelectorAll('[data-route]').forEach(a => {
    const on = a.dataset.route === view;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const mob = document.querySelector('#mobile-nav');
  if (mob) mob.hidden = true;
  const menuBtn = document.querySelector('.menu-button');
  if (menuBtn) menuBtn.setAttribute('aria-expanded', 'false');
  updateCount();
  window.scrollTo(0, 0);
  if (view === 'map') requestAnimationFrame(initMap);
}

function download(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}

let promptText = '';

document.addEventListener('click', async e => {
  const openDocLink = e.target.closest('[data-open-doc]');
  if (openDocLink) {
    selectedDocId = openDocLink.dataset.openDoc;
  }

  const stopCard = e.target.closest('[data-stop-idx]');
  if (stopCard) {
    activeStopIndex = parseInt(stopCard.dataset.stopIdx, 10);
    visitedStops.add(`${activeAppId}:${activeStopIndex}`);
    logPortalEvent('stop_viewed', `Stop ${activeStopIndex + 1}`);
    route();
    return;
  }

  const b = e.target.closest('button');
  if (!b) return;

  // Portal Machine Living App selection
  if (b.dataset.portalApp) {
    activeAppId = b.dataset.portalApp;
    activeStopIndex = 0;
    visitedStops.add(`${activeAppId}:0`);
    logPortalEvent('app_opened', activeAppId);
    route();
    return;
  }
  if (b.id === 'portal-start-btn') {
    activeStopIndex = 0;
    visitedStops.add(`${activeAppId}:0`);
    logPortalEvent('start_clicked', activeAppId);
    toast('Chain reaction lever pulled! Starting at Stop 1.');
    route();
    return;
  }
  if (b.id === 'portal-continue-btn') {
    const appObj = portalConfig.apps.find(a => a.id === activeAppId) || portalConfig.apps[0];
    if (activeStopIndex < appObj.stops.length - 1) {
      activeStopIndex += 1;
      visitedStops.add(`${activeAppId}:${activeStopIndex}`);
      logPortalEvent('continue_clicked', `Advanced to Stop ${activeStopIndex + 1}`);
      logPortalEvent('stop_viewed', appObj.stops[activeStopIndex].label);
      route();
    }
    return;
  }
  if (b.id === 'portal-primary-cta') {
    const target = b.dataset.targetLink || '#waitlist-form';
    const isFinal = activeStopIndex === 4;
    logPortalEvent(isFinal ? 'final_cta_clicked' : 'primary_link_clicked', target);
    if (target === '#waitlist-form') {
      const formEl = document.querySelector('#lead-name');
      if (formEl) formEl.focus();
    } else if (target.startsWith('#')) {
      location.hash = target.slice(1);
    }
    return;
  }
  if (b.id === 'save-portal-json') {
    try {
      const parsed = JSON.parse(document.querySelector('#portal-json-editor').value);
      portalConfig = parsed;
      localStorage.setItem('rd-portal-config', JSON.stringify(parsed));
      toast('Saved Living World JSON configuration.');
      route();
    } catch {
      toast('Invalid JSON format. Check your syntax.');
    }
    return;
  }

  // Visual Blueprint & White Paper Studio actions
  if (b.id === 'toggle-visual-edit') {
    const sheet = document.querySelector('#wp-sheet');
    if (!sheet) return;
    const isOn = sheet.getAttribute('contenteditable') === 'true';
    sheet.setAttribute('contenteditable', isOn ? 'false' : 'true');
    b.textContent = isOn ? '✎ Click to Visually Edit Text' : '✓ Visual Editing Active (Click Sheet Below)';
    if (!isOn) sheet.focus();
    return;
  }
  if (b.id === 'save-visual-edit') {
    const sheet = document.querySelector('#wp-sheet');
    if (!sheet) return;
    localStorage.setItem('rd-doc-edit-' + selectedDocId, sheet.innerHTML);
    toast(`Saved visual edits to ${selectedDocId}.`);
    return;
  }
  if (b.id === 'download-doc-md') {
    const sheet = document.querySelector('#wp-sheet');
    const text = sheet ? sheet.innerText : '';
    download(`${selectedDocId.replace(/[^a-zA-Z0-9._-]/g, '_')}.md`, text, 'text/markdown');
    return;
  }

  // Data Room NDA unlock
  if (b.id === 'btn-unlock-nda') {
    ndaUnlocked = !ndaUnlocked;
    toast(ndaUnlocked ? 'Stage 2 NDA Signed & Approved. Confidential rooms unlocked.' : 'Stage 2 rooms locked.');
    route();
    return;
  }

  // VC Tools filters
  if (b.dataset.vcStage !== undefined) {
    vcFilterStage = b.dataset.vcStage;
    route();
    return;
  }
  if (b.dataset.vcCat !== undefined) {
    vcFilterCat = b.dataset.vcCat;
    route();
    return;
  }

  // Campus Map controls
  if (b.dataset.zone) {
    selectZone(b.dataset.zone);
    return;
  }
  if (b.id === 'map-plus') {
    zoomMap(1.25);
    return;
  }
  if (b.id === 'map-minus') {
    zoomMap(0.8);
    return;
  }
  if (b.id === 'map-reset') {
    resetMap();
    return;
  }
  if (b.dataset.companionMap) {
    location.hash = 'companions';
    return;
  }
  if (b.id === 'enter-zone') {
    const z = mapZones.find(z => z.id === b.dataset.zoneTarget);
    if (z.lesson) {
      currentLesson = lessons.find(l => l.id === z.lesson);
      location.hash = 'lab';
    } else {
      location.hash = z.route;
    }
    return;
  }

  // Mobile Menu & School Exercises
  if (b.classList.contains('menu-button')) {
    const n = document.querySelector('#mobile-nav');
    n.hidden = !n.hidden;
    b.setAttribute('aria-expanded', String(!n.hidden));
    return;
  }
  if (b.dataset.filter) {
    selectedFilter = b.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.filter === selectedFilter)));
    document.querySelector('#lesson-grid').innerHTML = lessons.filter(l => selectedFilter === 'All' || l.category === selectedFilter).map(lessonMarkup).join('');
    return;
  }
  if (b.dataset.lesson) {
    currentLesson = lessons.find(l => l.id === b.dataset.lesson);
    location.hash = 'lab';
    return;
  }
  if (b.id === 'review-note') {
    draft = document.querySelector('#project-note').value.trim();
    if (!draft) {
      toast('Write one observation before reviewing your note.');
      document.querySelector('#project-note').focus();
      return;
    }
    document.querySelector('#review-area').innerHTML = `<section class="review"><h3>KEEP THIS PROJECT NOTE?</h3><blockquote>${esc(draft)}</blockquote><p class="small">Approve to store this note in this browser. You can delete or export it later.</p><div class="actions"><button class="button" id="approve-note">Approve & keep</button><button class="button secondary" id="edit-note">Edit</button><button class="button secondary" id="discard-note">Discard</button></div></section>`;
    document.querySelector('#approve-note').focus();
    return;
  }
  if (b.id === 'edit-note') {
    document.querySelector('#review-area').innerHTML = '';
    document.querySelector('#project-note').focus();
    return;
  }
  if (b.id === 'discard-note') {
    draft = '';
    document.querySelector('#project-note').value = '';
    document.querySelector('#review-area').innerHTML = '';
    toast('Draft discarded. Nothing was kept.');
    return;
  }
  if (b.id === 'approve-note') {
    if (!draft) return;
    notes.push({ id: crypto.randomUUID(), text: draft, date: new Date().toISOString(), source: 'approved-by-user' });
    const stored = persist();
    draft = '';
    document.querySelector('#project-note').value = '';
    document.querySelector('#review-area').innerHTML = '';
    updateCount();
    toast(stored ? 'Note approved and kept in this browser (+Memory Steward Badge!).' : storageError);
    return;
  }
  if (b.dataset.delete) {
    notes = notes.filter(n => n.id !== b.dataset.delete);
    persist();
    route();
    toast('Note deleted from this browser.');
    return;
  }
  if (b.id === 'export-notes') {
    download('robotic-discipline-notebook.json', JSON.stringify({ format: 'rd-school-notebook-v1', exportedAt: new Date().toISOString(), notes }, null, 2), 'application/json');
    toast('Notebook exported.');
    return;
  }
  if (b.id === 'build-prompt') {
    const subject = document.querySelector('#concept-subject').value.trim();
    const headline = document.querySelector('#concept-headline').value.trim();
    if (!subject || !headline) {
      document.querySelector('#studio-status').textContent = 'Add an idea and an exact headline to build your brief.';
      return;
    }
    promptText = `Create an original ${document.querySelector('#concept-format').value} for ROBOTIC DISCIPLINE SCHOOL.\n\nSubject: ${subject}\nCompanion: ${document.querySelector('#concept-character').value}\nExact headline: "${headline}"\n\nVisual direction: midnight charcoal #141416, dark surfaces #1D1D1D, warm gray #C3BEB5 text, ember orange #FE5400, signal yellow #FFD400. Flat 2D cel fills, thick black outlines, condensed grotesk headlines.`;
    document.querySelector('#prompt-output').textContent = promptText;
    document.querySelector('#copy-prompt').disabled = false;
    document.querySelector('#download-prompt').disabled = false;
    document.querySelector('#studio-status').textContent = 'Your concept prompt is ready.';
    return;
  }
  if (b.id === 'copy-prompt') {
    try {
      await navigator.clipboard.writeText(promptText);
      toast('Prompt copied.');
    } catch {
      toast('Clipboard unavailable.');
    }
    return;
  }
  if (b.id === 'download-prompt') {
    download('robotic-discipline-concept.txt', promptText, 'text/plain');
  }
});

// Submit handler for Portal Machine Waitlist Form
document.addEventListener('submit', async e => {
  if (e.target.id === 'waitlist-form') {
    e.preventDefault();
    const name = document.querySelector('#lead-name').value.trim();
    const email = document.querySelector('#lead-email').value.trim();
    const appObj = portalConfig.apps.find(a => a.id === activeAppId) || portalConfig.apps[0];
    const currentStop = appObj.stops[activeStopIndex] || appObj.stops[0];
    logPortalEvent('waitlist_submitted', `${name} <${email}>`);
    const payload = {
      name,
      email,
      source_app: activeAppId,
      selected_stop: currentStop.label,
      final_cta: currentStop.cta
    };
    const leads = JSON.parse(localStorage.getItem('rd-portal-leads') || '[]');
    leads.push({ ...payload, timestamp: new Date().toISOString() });
    localStorage.setItem('rd-portal-leads', JSON.stringify(leads));
    try {
      await fetch(`${VERCEL_API_BASE}/api/portal/lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {
      // Offline / static fallback already saved in localStorage
    }
    const st = document.querySelector('#lead-status');
    if (st) st.textContent = `✓ Added ${name} (${email}) to ${appObj.name}!`;
    toast(`Joined ${appObj.name}!`);
    e.target.reset();
  }
});

document.addEventListener('input', e => {
  if (e.target.id === 'project-note') {
    draft = e.target.value;
    const rev = document.querySelector('#review-area');
    if (rev) rev.innerHTML = '';
  }
  if (e.target.id === 'vc-search') {
    vcSearchQ = e.target.value;
    route();
    const input = document.querySelector('#vc-search');
    if (input) {
      input.focus();
      input.setSelectionRange(vcSearchQ.length, vcSearchQ.length);
    }
  }
  if (e.target.id === 'cad-shell-color') {
    const val = e.target.value;
    ['cad-ear-l', 'cad-ear-r', 'cad-head', 'cad-torso'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('fill', val);
    });
  }
  if (e.target.id === 'cad-optic-color') {
    const val = e.target.value;
    ['cad-eye-l', 'cad-eye-r', 'cad-core'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.setAttribute('fill', val);
    });
  }
  if (e.target.id === 'wp-paper-color') {
    document.documentElement.style.setProperty('--paper', e.target.value);
  }
  if (e.target.id === 'wp-accent-color') {
    document.documentElement.style.setProperty('--accent', e.target.value);
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'doc-picker') {
    selectedDocId = e.target.value;
    route();
  }
  if (e.target.id === 'exercise-select') {
    draft = document.querySelector('#project-note').value;
    currentLesson = lessons.find(l => l.id === e.target.value);
    main.innerHTML = lab();
  }
  if (e.target.matches('.checklist input')) {
    const boxes = [...document.querySelectorAll('.checklist input')];
    const done = boxes.filter(x => x.checked).length;
    document.querySelector('#step-status').textContent =
      done === boxes.length ? 'You worked through every step. Capture a thought below.' : `${done} of ${boxes.length} steps explored. Take your time.`;
  }
});

window.addEventListener('hashchange', () => {
  route();
  main.focus({ preventScroll: true });
});

// Load seed-bundle.json on startup so #blueprint, #dataroom, and #directory work on both github.io and Vercel
fetch('seed-bundle.json')
  .then(r => r.json())
  .then(data => {
    seedBundle = data;
    updateQuestHud();
    if (['blueprint', 'dataroom', 'directory'].includes(location.hash.slice(1))) {
      route();
    }
  })
  .catch(() => {});

logPortalEvent('app_opened', activeAppId);
route();
