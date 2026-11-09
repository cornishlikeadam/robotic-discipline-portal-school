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

// --- 0. THREE COMPANY IDENTITIES INFRASTRUCTURE THESIS (SAVED PREVIOUS STATE) ---
const threeIdentitiesThesis = {
  roboticDiscipline: {
    title: 'Robotic Discipline (Animal Scrypt × Disciple × Madken): Three Company Identities',
    winner: 'Identity 3 — Vertically Integrated Physical-Digital Companion & Memory Infrastructure',
    summary:
      'We see three possible identities for Robotic Discipline: (1) a consumer collectible studio, (2) a B2B AI agent & educational software tool, or (3) a vertically integrated physical-digital companion and memory infrastructure company. The third has the largest long-term potential because we are not simply selling plastic shells or wrapping chat prompts—we are building the hardware identity layer (NTAG215 NFC/QR physical binding), the human-approved memory ledger (PROPOSED -> APPROVED -> DELETED), and the 20% single-hop royalty rail governing how persistent artificial animals live across homes, schools, and creators.',
    identities: [
      {
        tier: 'Identity 1',
        name: 'Consumer Collectible Studio',
        scope: 'Sells 3D-printed figures and character art drops.',
        limitation: 'Transactional one-off merch without durable recurring memory or protocol lock-in.'
      },
      {
        tier: 'Identity 2',
        name: 'B2B AI Agent & Classroom Software',
        scope: 'Provides browser-based learning exercises and prompt workflows.',
        limitation: 'Pure software SaaS is easily commoditized without a physical anchor in the room.'
      },
      {
        tier: 'Identity 3 (Chosen Core)',
        name: 'Vertically Integrated Companion & Memory Infrastructure',
        scope: 'Owns the physical shell specification, cryptographic NFC/QR pairing, consent-first 7-day memory ledger, and 20% creator royalty settlement.',
        limitation: 'Highest long-term moat: governs how physical objects and persistent AI minds bind together.'
      }
    ]
  },
  foodRecovery: {
    title: 'Surplus Food Systems (Kindred’s Waitlist / Constant Gardener Track): Three Company Identities',
    winner: 'Identity 3 — Vertically Integrated Food Recovery Infrastructure',
    summary:
      'I see three possible identities for the company: a consumer food marketplace, a B2B inventory intelligence company, or a vertically integrated food recovery infrastructure company. The third has the biggest long-term potential, because you are not simply facilitating food transactions. You are developing the intelligence and physical infrastructure governing what happens to surplus food before it becomes waste.',
    identities: [
      {
        tier: 'Identity 1',
        name: 'Consumer Food Marketplace',
        scope: 'Connects shoppers with discounted surplus meals or grocers.',
        limitation: 'Facilitates end-of-line transactions after surplus has already accumulated.'
      },
      {
        tier: 'Identity 2',
        name: 'B2B Inventory Intelligence',
        scope: 'Forecasting dashboards for kitchens, farms, and grocers.',
        limitation: 'Advisory software alone cannot move or repurpose physical perishable inventory.'
      },
      {
        tier: 'Identity 3 (Chosen Core)',
        name: 'Vertically Integrated Food Recovery Infrastructure',
        scope: 'Combines predictive surplus intelligence with physical cold-chain routing, local redistribution hubs, and automated recovery before food becomes waste.',
        limitation: 'Governs the full physical + digital lifecycle of surplus nutrition.'
      }
    ]
  }
};

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
      tagline: 'Flagship 5-stop kinetic causeway world driving early cohort, food recovery & companion waitlist signups.',
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
          pitch: 'Inspect the Three Company Identities thesis & vertically integrated infrastructure.',
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
      tagline: 'Robotic Discipline (Animal Scrypt × Disciple × Madken) vertically integrated operating engine.',
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
  const b1 = visitedStops.size >= 3; // Portal Gear
  const b2 = visitedZones.size >= 3; // Map Explorer
  const b3 = notes.length >= 1;      // Memory Steward
  const b4 = !!seedBundle;           // Blueprint Reader
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

// --- 4. VIEW: PORTAL MACHINE STORY MAPS (#portal) + THREE IDENTITIES THESIS ---
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

  return `
    <div class="page-intro">
      <h1>PORTAL MACHINE<br><span style="color:var(--accent)">STORY MAPS.</span></h1>
      <p>A stationary home screen where every icon opens a living causeway world. Trigger the chain reaction, pause at each stop, or jump into the reengineered Pizza Ninjas × Spellverse World Map.</p>
      <div class="actions" style="margin-top:16px">
        <a href="#map" class="button">🌍 Launch Full World Map (Pizza Ninjas × Spellverse) ↗</a>
        <a href="#blueprint" class="button secondary" data-open-doc="PORTAL_MACHINE_BLUEPRINT">Read 12-Section Blueprint ↗</a>
      </div>
    </div>

    <!-- LAYER 1: STATIONARY HOME SCREEN OF LIVING APPS -->
    <section class="portal-desktop" aria-label="Portal Machine Stationary App Home Screen">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <div>
          <span style="font-size:11px;letter-spacing:1.4px;color:var(--accent)">LAYER 1 // STATIONARY APP HOME SCREEN</span>
          <h2 style="font-size:30px;margin-top:4px">Select a Living App to Launch Its World</h2>
        </div>
        <a href="#map" class="button orange">Teleport to World Map ↗</a>
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

    <!-- LAYER 3: THREE COMPANY IDENTITIES INFRASTRUCTURE THESIS (SAVED STATE) -->
    <section class="causeway-machine" style="margin-top:24px" aria-label="Three Company Identities Strategic Architecture">
      <span style="font-size:11px;letter-spacing:1.4px;color:var(--lime)">STRATEGIC ARCHITECTURE // THREE COMPANY IDENTITIES THESIS</span>
      <h2 style="font-size:32px;margin-top:4px">Why Vertically Integrated Infrastructure Wins</h2>
      <div class="workbench" style="margin-top:14px">
        <div class="panel" style="border-left:4px solid var(--accent)">
          <h3 style="font-size:22px;color:var(--accent)">1. ${esc(threeIdentitiesThesis.roboticDiscipline.title)}</h3>
          <p style="font-size:14px;color:#e5e0d6">${esc(threeIdentitiesThesis.roboticDiscipline.summary)}</p>
          <ul style="font-size:13px;color:#c3beb5;padding-left:18px;margin-top:10px">
            ${threeIdentitiesThesis.roboticDiscipline.identities
              .map(i => `<li style="margin-bottom:6px"><strong>${esc(i.tier)} — ${esc(i.name)}:</strong> ${esc(i.scope)} <em>(${esc(i.limitation)})</em></li>`)
              .join('')}
          </ul>
        </div>
        <div class="panel" style="border-left:4px solid var(--lime)">
          <h3 style="font-size:22px;color:var(--lime)">2. ${esc(threeIdentitiesThesis.foodRecovery.title)}</h3>
          <p style="font-size:14px;color:#e5e0d6">${esc(threeIdentitiesThesis.foodRecovery.summary)}</p>
          <ul style="font-size:13px;color:#c3beb5;padding-left:18px;margin-top:10px">
            ${threeIdentitiesThesis.foodRecovery.identities
              .map(i => `<li style="margin-bottom:6px"><strong>${esc(i.tier)} — ${esc(i.name)}:</strong> ${esc(i.scope)} <em>(${esc(i.limitation)})</em></li>`)
              .join('')}
          </ul>
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

// --- 8. ORIGINAL SCHOOL VIEWS (#school, #lab, #companions, #studio, #notebook, #about) ---
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
  return `<div class="page-intro"><h1>CURIOUS PEOPLE.<br>USEFUL MACHINES.</h1><p>Robotic Discipline School &amp; Portal Machine Story Maps are part of Robotic Discipline (Animal Scrypt × Disciple × Madken), founded by Kendren “KJ” Cornish.</p></div><div class="about-copy"><h2>Unified Architecture.</h2><p>This forked edition combines the reengineered Pizza Ninjas IP School × Taproot Wizards Spellverse interactive world map, the Portal Machine Story Maps cause-and-effect funnel engine, the Three Company Identities thesis, and the complete White Paper &amp; Blueprint visual studio.</p><div class="actions" style="margin-top:16px"><a href="#map" class="button">Explore World Map ↗</a><a href="#portal" class="button orange">Open Portal Machine ↗</a></div></div>`;
}

// ============================================================================
// 9. REENGINEERED WORLD MAP: PIZZA NINJAS IP SCHOOL × SPELLVERSE × PREVIOUS STATE
// ============================================================================
const mapZones = [
  {
    id: 'make',
    kind: 'zone',
    name: 'Making Workshop',
    short: 'MAKE',
    x: 20,
    y: 40,
    companion: 'PATCH / Curious maker',
    text: 'Start at the workbench. Turn a sheet of paper into a character, then notice what helps it stand.',
    infraNote: 'Identity 3 Layer: Physical 3D-printed shell prototyping + NTAG215 base slot.',
    action: 'Try the paper-machine exercise',
    lesson: 'paper',
    starters: ['What fold gives a paper character the widest stance?', 'How does WAVE-08 fit the 28mm NTAG215 tag?']
  },
  {
    id: 'memory',
    kind: 'zone',
    name: 'Memory Archive',
    short: 'REMEMBER',
    x: 50,
    y: 34,
    companion: 'PATCH / Your say comes first',
    text: 'Design one useful project memory. Decide what to approve, edit, or discard before keeping a note in your browser.',
    infraNote: 'Identity 3 Layer: Human-in-the-loop PROPOSED -> APPROVED -> DELETED 7-day memory ledger.',
    action: 'Explore memory boundaries',
    lesson: 'memory',
    starters: ['What is one boundary every AI companion should respect?', 'Why require explicit human approval for 7-day recall?']
  },
  {
    id: 'lab',
    kind: 'zone',
    name: 'Reengineering Lab',
    short: 'REENGINEER',
    x: 82,
    y: 40,
    companion: 'MOSS / Look a little closer',
    text: 'Choose an unpowered everyday object. Map its parts, question one design decision, and sketch a clearer second version.',
    infraNote: 'Identity 3 Layer: Reverse-engineering physical mechanisms and vertically integrated infrastructure.',
    action: 'Enter the Reengineering Lab',
    lesson: 'reverse',
    starters: ['Which everyday object on your desk has the best hinge?', 'How do we govern surplus food before it becomes waste?']
  },
  {
    id: 'garden',
    kind: 'zone',
    name: 'Quiet Garden',
    short: 'REST',
    x: 17,
    y: 86,
    companion: 'MOSS / The steady observer',
    text: 'Take a pause. Look away from your screen, notice one thing around you, and return when you want. No countdown, streak, or score.',
    infraNote: 'Identity 3 Layer: Zero-shame dormancy & Constant Gardener food recovery rhythms.',
    action: 'Meet MOSS and the companions',
    route: 'companions',
    starters: ['Why does zero-shame dormancy beat daily streak pressure?', 'How can Savannah urban gardens link to Kindred’s Waitlist?']
  },
  {
    id: 'yard',
    kind: 'zone',
    name: 'Co-making Yard',
    short: 'TOGETHER',
    x: 49,
    y: 89,
    companion: 'PIP / Another point of view',
    text: 'Try a quiet making session with someone you choose. Shared attention without a performative feed.',
    infraNote: 'Identity 3 Layer: Bilateral memory fragments requiring two-party consent.',
    action: 'Try a side-by-side session',
    lesson: 'together',
    starters: ['What changes when two people build quietly for 15 minutes?', 'How does bilateral memory consent work?']
  },
  {
    id: 'studio',
    kind: 'zone',
    name: 'Concept Studio',
    short: 'IMAGINE',
    x: 82,
    y: 86,
    companion: 'PIP / The bright collaborator',
    text: 'Turn your idea into a reusable image prompt with the School palette, original companions, and a clear headline.',
    infraNote: 'Identity 3 Layer: 20% single-hop parent creator royalty rail in SQLite.',
    action: 'Build a concept prompt',
    route: 'studio',
    starters: ['Share your favorite headline in the School visual language!', 'How does the 20% single-hop royalty reward parent creators?']
  }
];

// Spellverse Portal Gateways on the Map (linking directly to the 6 Portal Machine Living Worlds)
const mapPortals = [
  {
    id: 'portal-kindreds-waitlist',
    kind: 'portal',
    portalAppId: 'kindreds-waitlist',
    name: "Portal: Kindred's Waitlist",
    short: 'PORTAL 01',
    x: 34,
    y: 22,
    companion: 'SPELLVERSE GATEWAY // FOOD & COMPANION INFRASTRUCTURE',
    text: 'Flagship 5-stop kinetic causeway world. Develops the intelligence and physical infrastructure governing surplus food before it becomes waste + early SCAD companion cohort.',
    infraNote: 'Three Identities Winner: Vertically Integrated Food Recovery & Companion Infrastructure.',
    action: "Launch Kindred's Waitlist Causeway",
    starters: ['Why is vertically integrated food recovery bigger than a consumer marketplace?', 'Who is joining the Savannah / SCAD founding cohort?']
  },
  {
    id: 'portal-company',
    kind: 'portal',
    portalAppId: 'company',
    name: 'Portal: Company Lab & Royalty Rail',
    short: 'PORTAL 02',
    x: 67,
    y: 22,
    companion: 'SPELLVERSE GATEWAY // ANIMAL SCRYPT × MADKEN',
    text: 'Inspect the 4-tier price ladder ($45 V1 shell to $2,500 Founding Cohort), the 20% single-hop creator royalty ledger, and the Stage 1/2 Investor Data Room.',
    infraNote: 'Three Identities Winner: Vertically Integrated Physical-Digital Companion Infrastructure.',
    action: 'Open Company Lab Causeway',
    starters: ['How does the $45 + $9/mo V1 unit economics scale across 4 tiers?', 'Test the simulated creator-to-owner 20% royalty transfer!']
  },
  {
    id: 'portal-research',
    kind: 'portal',
    portalAppId: 'research',
    name: 'Portal: Research & White Paper',
    short: 'PORTAL 03',
    x: 34,
    y: 64,
    companion: 'SPELLVERSE GATEWAY // /SEED/00-29 & CAD BLUEPRINT',
    text: 'Read and visually edit all 38 documents in the White Paper & Blueprint Studio, customize the WAVE-08 translucent shell, and browse 15 open-source VC tools.',
    infraNote: 'Full /seed/00-29 operating book + 12-section Portal Machine Story Maps specification.',
    action: 'Open White Paper & Blueprint Studio',
    route: 'blueprint',
    starters: ['Which chapter of /seed/00-29 is most useful for hardware founders?', 'Try changing the WAVE-08 shell tint in #blueprint!']
  },
  {
    id: 'portal-social',
    kind: 'portal',
    portalAppId: 'dating-social',
    name: 'Portal: Parallel Presence Social',
    short: 'PORTAL 04',
    x: 66,
    y: 64,
    companion: 'SPELLVERSE GATEWAY // CO-MAKING RITUALS',
    text: 'Low-pressure parallel presence and shared ritual objects instead of swipe fatigue or streak anxiety.',
    infraNote: 'Bilateral memory fragments + 15-minute quiet co-making blocks.',
    action: 'Enter Social Portal Causeway',
    starters: ['How do paired shells create parallel presence without screen fatigue?']
  },
  {
    id: 'companion-plaza',
    kind: 'companion',
    name: 'Central Companion Plaza (PATCH, MOSS, PIP & WAVE-08)',
    short: 'PLAZA',
    x: 50,
    y: 52,
    companion: 'HEART OF CAPITAL CAMPUS // ALL COMPANIONS',
    text: 'Meet PATCH the curious maker rabbit, MOSS the steady observer tortoise, PIP the bright collaborator bird, and the WAVE-08 translucent scout unit.',
    infraNote: 'One physical 3D-printed shell + NTAG215 tag bound to one persistent AI personality.',
    action: 'Meet the Companions',
    route: 'companions',
    starters: ['Are you team PATCH, team MOSS, or team PIP?', 'What personality trait should our next physical shell carry?']
  }
];

// Default on-map Idea Dots (.msgdot) inspired by Pizza Ninjas IP School
const defaultIdeaDots = [
  {
    id: 'idea-food-infra',
    kind: 'idea',
    name: 'Idea: Surplus Food Infrastructure before Waste',
    short: 'IDEA DOT',
    x: 27,
    y: 53,
    author: 'KJ Cornish',
    companion: 'COMMUNITY IDEA PIN // THREE IDENTITIES THESIS',
    text: 'Instead of just a consumer food marketplace or B2B inventory dashboard, build the vertically integrated intelligence + physical cold-chain routing governing surplus food before it becomes waste.',
    infraNote: 'Pinned to Kindred’s Waitlist & Constant Gardener track.',
    action: 'Open Portal Machine',
    route: 'portal',
    starters: ['How can campus dining halls and local grocers plug into this node?']
  },
  {
    id: 'idea-nfc-shell',
    kind: 'idea',
    name: 'Idea: Translucent Cobalt Shell + 28mm NTAG215',
    short: 'IDEA DOT',
    x: 73,
    y: 54,
    author: 'SCAD Maker #04',
    companion: 'COMMUNITY IDEA PIN // HARDWARE SHELL',
    text: 'Snap-fit 2.4mm translucent PETG/resin shell with a bottom bayonet cap so anyone can inspect or swap the NTAG215 NFC tag without tools.',
    infraNote: 'Pinned to CAD Blueprint Studio (#blueprint).',
    action: 'Inspect CAD Schematic',
    route: 'blueprint',
    starters: ['Should we offer glow-in-the-dark filament for Cohort 1?']
  }
];

let mapIdeaDots = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('rd-map-idea-dots') || 'null');
    return Array.isArray(saved) && saved.length ? saved : defaultIdeaDots;
  } catch {
    return defaultIdeaDots;
  }
})();

let spotChats = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem('rd-map-spot-chats') || 'null');
    if (saved && typeof saved === 'object') return saved;
  } catch {}
  return {
    make: [
      { author: 'KJ Cornish', time: '2h ago', text: 'Welcome to the Making Workshop! Start with one folded sheet of paper or inspect the WAVE-08 shell.' },
      { author: 'Maya (SCAD ID)', time: '1h ago', text: 'Widening the base flange by 4mm kept our paper prototype standing through the whole critique.' }
    ],
    memory: [
      { author: 'PATCH_OS', time: '3h ago', text: 'Memory Rule #1: Nothing enters the 7-day recall ledger until you click Approve.' }
    ],
    'portal-kindreds-waitlist': [
      { author: 'KJ Cornish', time: '4h ago', text: 'Three possible identities: consumer marketplace, B2B inventory intelligence, or vertically integrated infrastructure. We are building #3.' }
    ]
  };
})();

let selectedZone = 'make';
let placingIdeaMode = false;
let activeMapModal = ''; // '', 'community', 'wiki', 'welcome'
let wikiCategory = 'All';
let wikiSearch = '';
let teleportQueue = [];

// Camera state for Pizza Ninjas full-stage pan/zoom + flyTo
let mapView = { x: 0, y: 0, scale: 1, fit: 1 };
let flyAnimFrame = 0;
let birdAnimFrame = 0;
let keyLoopFrame = 0;
let heldKeys = { up: false, down: false, left: false, right: false, z: false, x: false };
let mapResizeObserver;

// Web Audio Synth Radio State (Pizza Ninjas #musichud)
const radioTracks = [
  { title: 'SCAD Fabrication Lo-Fi', artist: 'Robotic Discipline Radio', tempo: 92, notes: [261.63, 329.63, 392.0, 523.25, 440.0, 392.0, 329.63, 293.66] },
  { title: 'Spellverse Leyline Arp', artist: 'Taproot × Animal Scrypt', tempo: 108, notes: [293.66, 369.99, 440.0, 587.33, 554.37, 440.0, 369.99, 329.63] },
  { title: 'Capital Campus 8-Bit', artist: 'Pizza Ninjas IP Tribute', tempo: 118, notes: [329.63, 392.0, 493.88, 659.25, 587.33, 493.88, 392.0, 329.63] },
  { title: 'Savannah Moss Drift', artist: 'MOSS & Constant Gardener', tempo: 78, notes: [220.0, 277.18, 329.63, 440.0, 392.0, 329.63, 277.18, 246.94] }
];
let radioIndex = 0;
let radioPlaying = false;
let radioLiked = false;
let radioExpanded = false;
let radioInterval = null;
let audioCtx = null;
let radioStep = 0;

function toggleRadioPlay(forceState) {
  const next = typeof forceState === 'boolean' ? forceState : !radioPlaying;
  radioPlaying = next;
  if (radioInterval) {
    clearInterval(radioInterval);
    radioInterval = null;
  }
  if (radioPlaying) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const tr = radioTracks[radioIndex];
      const stepMs = Math.round((60 / tr.tempo) * 500);
      radioInterval = setInterval(() => {
        if (!radioPlaying || !audioCtx) return;
        const freq = tr.notes[radioStep % tr.notes.length];
        radioStep += 1;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.035, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0008, audioCtx.currentTime + stepMs / 1000);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + stepMs / 1000);
      }, stepMs);
    } catch {
      // AudioContext blocked or unsupported in headless test
    }
  }
  updateRadioDom();
}

function updateRadioDom() {
  const tr = radioTracks[radioIndex];
  const titleEl = document.querySelector('#tracktitle');
  const artistEl = document.querySelector('#trackartist');
  const playBtn = document.querySelector('#playpausebtn');
  const likeBtn = document.querySelector('#likebtn');
  const extrasEl = document.querySelector('#radioextras');
  if (titleEl) titleEl.textContent = tr.title;
  if (artistEl) artistEl.textContent = tr.artist;
  if (playBtn) playBtn.textContent = radioPlaying ? '⏸' : '▶';
  if (likeBtn) {
    likeBtn.classList.toggle('liked', radioLiked);
    likeBtn.textContent = radioLiked ? '♥' : '♡';
  }
  if (extrasEl) extrasEl.classList.toggle('open', radioExpanded);
}

function getAllMapSpots() {
  return [...mapZones, ...mapPortals, ...mapIdeaDots];
}

function getSpotById(id) {
  return getAllMapSpots().find(s => s.id === id) || mapZones[0];
}

function zoneDetail(z) {
  return `<div class="map-detail-heading"><span class="map-signal" aria-hidden="true"></span><h2>${esc(z.name)}</h2></div><p class="map-companion">${esc(z.companion)}</p><p>${esc(z.text)}</p>${z.infraNote ? `<p class="small" style="color:var(--lime);margin-top:6px"><strong>Infrastructure Layer:</strong> ${esc(z.infraNote)}</p>` : ''}<div class="actions" style="margin-top:12px"><button class="button" id="enter-zone" data-zone-target="${esc(z.id)}">${esc(z.action)} ↗</button><button class="button secondary" type="button" id="open-wiki-from-spot">Open World Wiki ↗</button></div><p class="small">Pizza Ninjas IP School × Spellverse World Map. Activities open on this site.</p>`;
}

function renderSpotChatHtml(spot) {
  const list = spotChats[spot.id] || [];
  const starters = spot.starters || ['What would you build or improve at this campus node?'];
  return `
    <div id="chathead">
      <div id="chatheadtop">
        <span id="chatbuilding">${esc(spot.name)}</span>
        <button type="button" id="chatclose" aria-label="Minimize thread">−</button>
      </div>
      <div id="chatdesc">${esc(spot.companion)} — ${esc(spot.infraNote || spot.text)}</div>
    </div>
    <div id="chatprompts">
      <div id="chatpromptlabel">Discussion Starters (Click to Fill)</div>
      ${starters.map(p => `<button type="button" class="chatprompt" data-starter-prompt="${esc(p)}">“${esc(p)}”</button>`).join('')}
    </div>
    <div id="chatmsgs">
      ${
        list.length
          ? list
              .map(
                m => `<div class="cmsg">
                  <div class="cmsg-head"><span class="cmsg-author">${esc(m.author)}</span><span class="cmsg-time">${esc(m.time)}</span></div>
                  <div class="cmsg-text">${esc(m.text)}</div>
                </div>`
              )
              .join('')
          : `<div class="cmsg"><div class="cmsg-text">No notes pinned here yet. Start the thread below!</div></div>`
      }
    </div>
    <form id="chatinputrow">
      <input type="text" id="chatinput" placeholder="Drop a reply at ${esc(spot.name)}..." maxlength="280" required />
      <button type="submit" id="chatsend">Post ↗</button>
    </form>
  `;
}

function renderCommunityModalHtml() {
  const totalReplies = Object.values(spotChats).reduce((acc, arr) => acc + arr.length, 0);
  const weeks = [
    ['Week 1', 'Paper Machines & Translucent Shell Form', 'COMPLETE', '100%'],
    ['Week 2', 'NTAG215 NFC Cryptographic Binding & Identity', 'COMPLETE', '100%'],
    ['Week 3', '7-Day Human-Approved Memory Ledger', 'ACTIVE NOW', '78%'],
    ['Week 4', '20% Single-Hop Creator Royalty Settlement', 'UP NEXT', '45%'],
    ['Week 5', 'Portal Machine 5-Stop Causeway Funnels', 'IN PROGRESS', '85%'],
    ['Week 6', 'Three Company Identities: Food & Companion Infra', 'IN PROGRESS', '70%'],
    ['Week 7', 'Savannah / SCAD 3-Adult Live Recall Study', 'SCHEDULED', '30%'],
    ['Week 8', 'Demo Day, Investor Data Room & Cohort Launch', 'SCHEDULED', '20%']
  ];
  return `
    <div class="pz-modal-backdrop" id="communitymodal" role="dialog" aria-modal="true" aria-label="8-Week IP School & SCAD Accelerator">
      <div class="pz-modal">
        <div class="pz-modal-header">
          <div>
            <span style="font-size:11px;letter-spacing:1.4px;color:var(--accent)">PIZZA NINJAS IP SCHOOL × ROBOTIC DISCIPLINE ACCELERATOR</span>
            <h2>8-WEEK CAPITAL CAMPUS &amp; SPELLVERSE ROADMAP</h2>
          </div>
          <button type="button" class="pz-modal-close" data-close-modal="true">✕</button>
        </div>
        <div class="pz-modal-body">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:22px">
            <div class="panel" style="display:flex;align-items:center;gap:12px">
              <svg width="28" height="28"><use href="#metric-contributions"/></svg>
              <div><strong style="font-size:22px;color:var(--accent)">${visitedZones.size + visitedStops.size}</strong><div class="small">Zones &amp; Stops Explored</div></div>
            </div>
            <div class="panel" style="display:flex;align-items:center;gap:12px">
              <svg width="28" height="28"><use href="#metric-ideas"/></svg>
              <div><strong style="font-size:22px;color:var(--lime)">${mapIdeaDots.length}</strong><div class="small">On-Map Idea Dots</div></div>
            </div>
            <div class="panel" style="display:flex;align-items:center;gap:12px">
              <svg width="28" height="28"><use href="#metric-replies"/></svg>
              <div><strong style="font-size:22px;color:var(--orange)">${totalReplies}</strong><div class="small">Campus Spot Replies</div></div>
            </div>
            <div class="panel" style="display:flex;align-items:center;gap:12px">
              <svg width="28" height="28"><use href="#metric-wiki"/></svg>
              <div><strong style="font-size:22px;color:#38bdf8">38</strong><div class="small">/seed/ Wiki Chapters</div></div>
            </div>
          </div>

          <h3>8-Week Curriculum &amp; Build Milestones</h3>
          <div class="lesson-grid" style="margin-top:12px">
            ${weeks
              .map(
                ([wk, title, status, pct]) => `<div class="panel">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--accent)"><span>${wk}</span><span>${status} (${pct})</span></div>
                  <h4 style="font-size:20px;margin:6px 0">${title}</h4>
                  <div style="height:6px;background:#26262b;border-radius:99px;overflow:hidden"><div style="width:${pct};height:100%;background:linear-gradient(90deg,#fe5400,#ffd400)"></div></div>
                </div>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWikiModalHtml() {
  const wikiEntries = [
    {
      cat: 'Three Identities',
      title: threeIdentitiesThesis.roboticDiscipline.title,
      body: threeIdentitiesThesis.roboticDiscipline.summary
    },
    {
      cat: 'Three Identities',
      title: threeIdentitiesThesis.foodRecovery.title,
      body: threeIdentitiesThesis.foodRecovery.summary
    },
    ...mapZones.map(z => ({
      cat: 'Campus Zones',
      title: `${z.name} (${z.short})`,
      body: `${z.text} — ${z.infraNote}`
    })),
    ...mapPortals.map(p => ({
      cat: 'Spellverse Portals',
      title: p.name,
      body: `${p.text} — ${p.infraNote}`
    })),
    {
      cat: 'Companions',
      title: 'PATCH, MOSS, PIP & WAVE-08 Hardware Spec',
      body: 'PATCH (curious maker rabbit), MOSS (steady observer tortoise), PIP (bright collaborator bird), and WAVE-08 (Cobalt Scout 3D-printed 2.4mm translucent shell with 28mm NTAG215 NFC base cavity and 20% single-hop royalty ledger).'
    }
  ];

  const cats = ['All', 'Three Identities', 'Campus Zones', 'Spellverse Portals', 'Companions'];
  const filtered = wikiEntries.filter(e => {
    if (wikiCategory !== 'All' && e.cat !== wikiCategory) return false;
    if (wikiSearch && !`${e.title} ${e.body}`.toLowerCase().includes(wikiSearch.toLowerCase())) return false;
    return true;
  });

  return `
    <div class="pz-modal-backdrop" id="wikimodal" role="dialog" aria-modal="true" aria-label="World Wiki & Three Identities Codex">
      <div class="pz-modal">
        <div class="pz-modal-header">
          <div>
            <span style="font-size:11px;letter-spacing:1.4px;color:var(--lime)">WORLD WIKI &amp; SPELLVERSE CODEX</span>
            <h2>CAPITAL CAMPUS, THREE IDENTITIES &amp; /SEED/ LORE</h2>
          </div>
          <button type="button" class="pz-modal-close" data-close-modal="true">✕</button>
        </div>
        <div class="pz-modal-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">
            <input type="search" id="wiki-search-input" value="${esc(wikiSearch)}" placeholder="Search World Wiki, Three Identities, companions, zones..." style="flex:1;min-width:220px" />
            <a href="#blueprint" class="button orange" data-close-modal="true">Open Full 38-Doc White Paper Studio ↗</a>
          </div>
          <div class="filter-row" style="margin-bottom:16px">
            ${cats.map(c => `<button type="button" class="filter" aria-pressed="${wikiCategory === c}" data-wiki-cat="${c}">${c}</button>`).join('')}
          </div>
          <div class="lesson-grid">
            ${filtered
              .map(
                e => `<article class="panel">
                  <span style="font-size:10px;color:var(--accent);letter-spacing:1px">${esc(e.cat.toUpperCase())}</span>
                  <h3 style="font-size:21px;margin:6px 0">${esc(e.title)}</h3>
                  <p style="font-size:13.5px;color:#d7d2c8">${esc(e.body)}</p>
                </article>`
              )
              .join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWelcomeModalHtml() {
  return `
    <div class="pz-modal-backdrop" id="welcome-modal" role="dialog" aria-modal="true" aria-label="Welcome to Capital Campus">
      <div id="welcomecard">
        <span style="font-size:11px;letter-spacing:1.6px;color:var(--accent)">PIZZA NINJAS IP SCHOOL × SPELLVERSE × ROBOTIC DISCIPLINE</span>
        <h2>WELCOME TO CAPITAL CAMPUS</h2>
        <p>Explore an interactive living world that unites our entire previous state—the <strong>Portal Machine Story Maps</strong>, the <strong>Three Company Identities Infrastructure Thesis</strong>, the <strong>38-Document White Paper &amp; CAD Blueprint Studio</strong>, and the <strong>6 Robotic Discipline School Zones</strong>.</p>
        <p style="font-size:13px;color:#bdb7ad">
          • <strong>Drag or use Arrow Keys</strong> to pan across the illustrated island.<br>
          • <strong>Press Z / X</strong> to zoom in and out.<br>
          • <strong>Press SPACEBAR (Teleport)</strong> to fly smoothly from beacon to beacon.<br>
          • <strong>Click any Pin or Idea Dot</strong> to open its Pocket Card, curved guide line, and live discussion thread.
        </p>
        <div class="actions" style="justify-content:center;margin-top:18px">
          <button type="button" class="button" data-close-modal="true">Enter the World Map ↗</button>
          <a href="#portal" class="button secondary" data-close-modal="true">Open 6-App Portal Machine</a>
        </div>
      </div>
    </div>
  `;
}

function schoolMap() {
  const z = getSpotById(selectedZone);
  const tr = radioTracks[radioIndex];

  // Ley-lines connecting central plaza (50,52) to all 6 zones and 4 portals
  const leyLinesSvg = `
    <svg class="spellverse-leylines" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden="true">
      ${[...mapZones, ...mapPortals]
        .map(node => {
          const x1 = 50 * 12;
          const y1 = 52 * 8;
          const x2 = node.x * 12;
          const y2 = node.y * 8;
          return `<line class="ley-path" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`;
        })
        .join('')}
      <circle cx="600" cy="416" r="68" fill="none" stroke="rgba(255,212,0,0.3)" stroke-width="2" stroke-dasharray="6 6"/>
    </svg>
  `;

  return `
    <div class="map-intro">
      <div>
        <h1>FIND YOUR NEXT<br>“WHAT IF?”</h1>
        <p>Reengineered with the <strong>Pizza Ninjas IP School</strong> &amp; <strong>Taproot Wizards Spellverse</strong> stage engine: full-canvas pan/zoom, Golden-Ratio Fibonacci bird flocks, drifting cloud shaders, physical <code>Z</code>/<code>X</code>/<code>Space</code>/<code>Arrow</code> keycaps, synth radio, and on-map idea pins.</p>
      </div>
      <div class="actions">
        <a class="button orange" href="#portal">Open 6-App Portal Machine ↗</a>
        <a class="button secondary" href="#blueprint">White Paper &amp; CAD Studio ↗</a>
        <a class="text-link" href="#school">Browse all exercises ↗</a>
      </div>
    </div>

    <section class="map-shell" id="pz-stage" aria-label="Interactive Pizza Ninjas x Spellverse School World">
      <!-- 1. MAP VIEWPORT & WORLD CANVAS -->
      <div id="map-viewport" class="map-viewport" tabindex="0" aria-label="School map. Drag to explore, press Space to teleport.">
        <div id="map-world" class="map-world">
          <img src="assets/school-world-map.png" alt="Original illustrated campus with six buildings and gardens connected around a companion plaza." width="1536" height="1024" draggable="false">
          ${leyLinesSvg}

          <!-- 6 Original School Campus Zone Pins -->
          ${mapZones
            .map(
              zone => `<button type="button" class="map-pin ${zone.id === selectedZone ? 'selected' : ''}" data-zone="${esc(zone.id)}" style="left:${zone.x}%;top:${zone.y}%" aria-label="Explore ${esc(zone.name)}" aria-pressed="${zone.id === selectedZone}">
                <span class="pin-dot" aria-hidden="true"></span>
                <span>${esc(zone.name)}</span>
              </button>`
            )
            .join('')}

          <!-- 4 Spellverse × Portal Machine Gateway Pins -->
          ${mapPortals
            .filter(p => p.kind === 'portal')
            .map(
              p => `<button type="button" class="portal-pin ${p.id === selectedZone ? 'selected' : ''}" data-zone="${esc(p.id)}" style="left:${p.x}%;top:${p.y}%" aria-label="${esc(p.name)}" aria-pressed="${p.id === selectedZone}">
                <span class="pin-dot" aria-hidden="true"></span>
                <span>${esc(p.name)}</span>
              </button>`
            )
            .join('')}

          <!-- Central Companion Plaza Pin -->
          <button type="button" class="companion-pin ${selectedZone === 'companion-plaza' ? 'selected' : ''}" data-zone="companion-plaza" data-companion-map="true" style="left:50%;top:52%" aria-label="Meet the companions at the central plaza">
            <span>⚡ COMPANION PLAZA (PATCH · MOSS · PIP) ↗</span>
          </button>

          <!-- On-Map Community Idea Dots (.msgdot) -->
          ${mapIdeaDots
            .map(
              d => `<button type="button" class="msgdot ${d.id === selectedZone ? 'selected' : ''}" data-zone="${esc(d.id)}" style="left:${d.x}%;top:${d.y}%" title="${esc(d.name)} (${esc(d.author)})" aria-label="${esc(d.name)}"></button>`
            )
            .join('')}
        </div>
      </div>

      <!-- 2. ATMOSPHERIC WORLD FX LAYER (7 Clouds + Sunwash + Fibonacci Birds Canvas) -->
      <div id="worldFx" aria-hidden="true">
        <div id="worldFxTrack">
          <div id="clouds">
            <div class="cloud far" style="width:360px;height:130px;left:4%;top:8%;--cdur:78s;--cdelay:-12s"></div>
            <div class="cloud c2" style="width:420px;height:150px;left:32%;top:5%;--cdur:94s;--cdelay:-38s"></div>
            <div class="cloud c3 near" style="width:480px;height:170px;left:66%;top:12%;--cdur:68s;--cdelay:-21s"></div>
            <div class="cloud far" style="width:340px;height:120px;left:14%;top:58%;--cdur:88s;--cdelay:-45s"></div>
            <div class="cloud c2" style="width:390px;height:140px;left:54%;top:72%;--cdur:82s;--cdelay:-19s"></div>
            <div class="cloud c3" style="width:320px;height:115px;left:78%;top:48%;--cdur:74s;--cdelay:-8s"></div>
            <div class="cloud far" style="width:410px;height:145px;left:40%;top:36%;--cdur:102s;--cdelay:-60s"></div>
          </div>
          <div id="sunwash"></div>
          <div id="atmosphere"></div>
          <canvas id="birds" width="1200" height="800"></canvas>
        </div>
      </div>

      <!-- 3. CURVED DASHED SVG GUIDE LINE (#chatguide) CONNECTING #spotcard TO ACTIVE PIN -->
      <svg id="chatguide" aria-hidden="true">
        <path id="chatguidepath" d="" />
        <circle id="chatguidedot" cx="-100" cy="-100" r="6" />
      </svg>

      <!-- 4. FLOATING HUD LAYER (#mapui) -->
      <div id="mapui">
        <!-- TOP BAR: Left Radio Pill + Center 8-Week Marquee + Right Action Pills -->
        <div id="maptopbar">
          <!-- Left: Synth Radio Pill (#musichud) -->
          <div id="musichud">
            <div id="radiobar">
              <div id="radiodisc" aria-hidden="true"></div>
              <div id="trackmeta" id="radio-expand-trigger" title="Click to toggle tracklist">
                <div id="tracktitle">${esc(tr.title)}</div>
                <div id="trackartist">${esc(tr.artist)}</div>
              </div>
              <button type="button" class="mbtn" id="prevbtn" aria-label="Previous track">⏮</button>
              <button type="button" class="mbtn" id="playpausebtn" aria-label="Play or pause radio">${radioPlaying ? '⏸' : '▶'}</button>
              <button type="button" class="mbtn" id="nextbtn" aria-label="Next track">⏭</button>
              <button type="button" class="mbtn ${radioLiked ? 'liked' : ''}" id="likebtn" aria-label="Like track">${radioLiked ? '♥' : '♡'}</button>
            </div>
            <div id="radioextras" class="${radioExpanded ? 'open' : ''}">
              <div style="font-size:10px;color:var(--accent);letter-spacing:1px">CAMPUS SYNTH RADIO (4 TRACKS)</div>
              ${radioTracks
                .map(
                  (t, idx) => `<button type="button" data-radio-idx="${idx}" style="text-align:left;background:${idx === radioIndex ? 'rgba(255,212,0,0.16)' : 'transparent'};border:1px solid #353845;color:#fff;padding:5px 8px;border-radius:6px;font-size:11px;cursor:pointer">
                    ${idx + 1}. ${esc(t.title)} — <span style="color:#9d9992">${esc(t.artist)}</span>
                  </button>`
                )
                .join('')}
            </div>
          </div>

          <!-- Center: 8-Week IP School & SCAD Accelerator Marquee + Live Countdown (#weekstrip) -->
          <div id="weekstrip" role="button" tabindex="0" aria-label="Open 8-Week IP School & SCAD Accelerator Modal">
            <span class="wtag">WEEK 3 OF 8</span>
            <div class="wgoal">
              <div class="marquee-track">
                <span>PIZZA NINJAS IP SCHOOL × SPELLVERSE × ROBOTIC DISCIPLINE — THREE COMPANY IDENTITIES: VERTICALLY INTEGRATED INFRASTRUCTURE — CLICK TO VIEW 8-WEEK ROADMAP &amp; LEADERBOARD &nbsp;&bull;&nbsp;</span>
                <span>PIZZA NINJAS IP SCHOOL × SPELLVERSE × ROBOTIC DISCIPLINE — THREE COMPANY IDENTITIES: VERTICALLY INTEGRATED INFRASTRUCTURE — CLICK TO VIEW 8-WEEK ROADMAP &amp; LEADERBOARD &nbsp;&bull;&nbsp;</span>
              </div>
            </div>
            <span class="wclock" id="pz-countdown">04d 11h 42m</span>
          </div>

          <!-- Right: Action Pills (#toplinks) -->
          <div id="toplinks">
            <button type="button" class="toppill" id="wikibtn">✦ World Wiki &amp; 3 Identities</button>
            <button type="button" class="toppill" id="open-community-btn">8-Week School</button>
            <button type="button" class="toppill" id="open-welcome-btn">Welcome</button>
            <button type="button" class="toppill" id="map-minus" aria-label="Zoom out">−</button>
            <output id="map-zoom" aria-label="Map zoom" style="font-size:11px;font-weight:700;padding:0 4px;align-self:center">100%</output>
            <button type="button" class="toppill" id="map-plus" aria-label="Zoom in">+</button>
            <button type="button" class="toppill" id="map-reset">Reset</button>
          </div>
        </div>

        <!-- LEFT POCKET PLACE CARD (#spotcard) -->
        <aside id="spotcard" aria-live="polite">
          <div class="spot-kicker">${esc(z.short || 'CAMPUS BEACON')} // ${visitedZones.size} ZONES EXPLORED</div>
          <h2>${esc(z.name)}</h2>
          <p><strong>${esc(z.companion)}</strong><br>${esc(z.text)}</p>
          ${z.infraNote ? `<p style="font-size:11.5px;color:var(--lime);border-left:2px solid var(--lime);padding-left:8px">${esc(z.infraNote)}</p>` : ''}
          <div class="spot-actions">
            <button type="button" class="button" id="enter-zone" data-zone-target="${esc(z.id)}" style="padding:8px 12px;font-size:12px">${esc(z.action)} ↗</button>
            <button type="button" class="button secondary" id="fly-spot-btn" style="padding:8px 12px;font-size:12px">🎯 Focus</button>
          </div>
        </aside>

        <!-- RIGHT FLOATING DISCUSSION THREAD (#chatroom) -->
        <aside id="chatroom" aria-label="Spot Discussion Thread">
          ${renderSpotChatHtml(z)}
        </aside>

        <!-- BOTTOM-LEFT ZOOM KEYCAPS (#blhud: Z and X) -->
        <div id="blhud">
          <div id="zoomhud">
            <div class="hudtitle">Zoom with Z and X</div>
            <div class="zrow">
              <div class="key" id="kz" data-keycap="z" role="button" tabindex="0" aria-label="Zoom in with Z"><span class="kcap">Z</span></div>
              <div class="key" id="kx" data-keycap="x" role="button" tabindex="0" aria-label="Zoom out with X"><span class="kcap">X</span></div>
            </div>
          </div>
        </div>

        <!-- BOTTOM-CENTER TELEPORT SPACEBAR KEYCAP (#spacehud) + DROP IDEA BUTTON (#chatplace) -->
        <div id="spacehud">
          <button type="button" id="chatplace" class="${placingIdeaMode ? 'active' : ''}">
            <svg width="14" height="14" style="vertical-align:-2px;margin-right:4px"><use href="#icon-quill"/></svg>
            ${placingIdeaMode ? 'Click Anywhere on Map to Plant Idea Pin (Esc to Cancel)' : '💬 Drop an Idea on the Map'}
          </button>
          <div class="hudtitle">Press Space to Teleport</div>
          <div class="key" id="kspace" data-keycap="space" role="button" tabindex="0" aria-label="Teleport to next spot">
            <span class="kcap">SPACE — TELEPORT</span>
          </div>
        </div>

        <!-- BOTTOM-RIGHT ARROW KEYCAPS (#panhud) -->
        <div id="panhud">
          <div class="hudtitle">Navigate with arrow keys</div>
          <div class="arrowgrid">
            <div class="key up" id="kup" data-keycap="up" role="button" tabindex="0" aria-label="Pan up"><span class="kcap">▲</span></div>
            <div class="key left" id="kleft" data-keycap="left" role="button" tabindex="0" aria-label="Pan left"><span class="kcap">◀</span></div>
            <div class="key down" id="kdown" data-keycap="down" role="button" tabindex="0" aria-label="Pan down"><span class="kcap">▼</span></div>
            <div class="key right" id="kright" data-keycap="right" role="button" tabindex="0" aria-label="Pan right"><span class="kcap">▶</span></div>
          </div>
        </div>
      </div>

      <!-- ACTIVE MODAL OVERLAY (8-Week School / World Wiki / Welcome) -->
      <div id="pz-modal-host">
        ${activeMapModal === 'community' ? renderCommunityModalHtml() : ''}
        ${activeMapModal === 'wiki' ? renderWikiModalHtml() : ''}
        ${activeMapModal === 'welcome' ? renderWelcomeModalHtml() : ''}
      </div>
    </section>

    <!-- DIRECTORY & DETAIL PANEL BELOW STAGE (PRESERVED FROM PREVIOUS STATE) -->
    <div class="map-bottom">
      <nav class="map-directory" aria-label="Choose a map destination">
        ${[...mapZones, ...mapPortals]
          .map(
            item => `<button type="button" data-zone="${esc(item.id)}" class="${selectedZone === item.id ? 'selected' : ''}" aria-pressed="${selectedZone === item.id}">
              <span>${esc(item.short)}</span>${esc(item.name)}<span aria-hidden="true">↗</span>
            </button>`
          )
          .join('')}
      </nav>
      <section id="map-detail" class="map-detail" aria-live="polite" aria-atomic="true">
        ${zoneDetail(z)}
      </section>
    </div>
  `;
}

// Update the curved dashed SVG line (#chatguide) from #spotcard to the active pin
function updateChatGuideLine() {
  const stage = document.querySelector('#pz-stage');
  const card = document.querySelector('#spotcard');
  const pathEl = document.querySelector('#chatguidepath');
  const dotEl = document.querySelector('#chatguidedot');
  const pinEl = document.querySelector(`[data-zone="${selectedZone}"]`);
  if (!stage || !card || !pathEl || !dotEl || !pinEl) return;

  const sr = stage.getBoundingClientRect();
  const cr = card.getBoundingClientRect();
  const pr = pinEl.getBoundingClientRect();

  const x1 = cr.right - sr.left - 6;
  const y1 = cr.top - sr.top + cr.height * 0.45;
  const x2 = pr.left - sr.left + pr.width * 0.5;
  const y2 = pr.top - sr.top + pr.height * 0.5;

  const dx = x2 - x1;
  const cx1 = x1 + dx * 0.45;
  const cy1 = y1 - Math.min(70, Math.abs(dx) * 0.2);
  const cx2 = x1 + dx * 0.75;
  const cy2 = y2 - 20;

  pathEl.setAttribute('d', `M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${cx1.toFixed(1)} ${cy1.toFixed(1)}, ${cx2.toFixed(1)} ${cy2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}`);
  dotEl.setAttribute('cx', x2.toFixed(1));
  dotEl.setAttribute('cy', y2.toFixed(1));
}

function selectZone(id, shouldFly = true) {
  const z = getSpotById(id);
  if (!z) return;
  selectedZone = z.id;
  visitedZones.add(z.id);
  updateQuestHud();

  document.querySelectorAll('[data-zone]').forEach(b => {
    const isSel = b.dataset.zone === z.id;
    b.classList.toggle('selected', isSel);
    b.setAttribute('aria-pressed', String(isSel));
  });

  const detailEl = document.querySelector('#map-detail');
  if (detailEl) detailEl.innerHTML = zoneDetail(z);

  const spotCard = document.querySelector('#spotcard');
  if (spotCard) {
    spotCard.innerHTML = `
      <div class="spot-kicker">${esc(z.short || 'CAMPUS BEACON')} // ${visitedZones.size} ZONES EXPLORED</div>
      <h2>${esc(z.name)}</h2>
      <p><strong>${esc(z.companion)}</strong><br>${esc(z.text)}</p>
      ${z.infraNote ? `<p style="font-size:11.5px;color:var(--lime);border-left:2px solid var(--lime);padding-left:8px">${esc(z.infraNote)}</p>` : ''}
      <div class="spot-actions">
        <button type="button" class="button" id="enter-zone" data-zone-target="${esc(z.id)}" style="padding:8px 12px;font-size:12px">${esc(z.action)} ↗</button>
        <button type="button" class="button secondary" id="fly-spot-btn" style="padding:8px 12px;font-size:12px">🎯 Focus</button>
      </div>
    `;
  }

  const chatRoom = document.querySelector('#chatroom');
  if (chatRoom) {
    chatRoom.style.display = '';
    chatRoom.innerHTML = renderSpotChatHtml(z);
  }

  if (shouldFly) {
    flyTo(z.x / 100, z.y / 100, Math.max(mapView.scale, mapView.fit * 1.32), 620);
  } else {
    updateChatGuideLine();
  }
}

// Smooth camera glide (Pizza Ninjas flyTo)
function flyTo(fx, fy, targetScale, durationMs = 650) {
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  cancelAnimationFrame(flyAnimFrame);

  const startScale = mapView.scale;
  const endScale = Math.max(mapView.fit, Math.min(mapView.fit * 3, targetScale || startScale));
  const startX = mapView.x;
  const startY = mapView.y;

  const targetX = vp.clientWidth * 0.5 - fx * 1200 * endScale;
  const targetY = vp.clientHeight * 0.5 - fy * 800 * endScale;
  const t0 = performance.now();

  function step(now) {
    const p = Math.min(1, (now - t0) / durationMs);
    const ease = 1 - Math.pow(1 - p, 3); // cubic ease-out
    mapView.scale = startScale + (endScale - startScale) * ease;
    mapView.x = startX + (targetX - startX) * ease;
    mapView.y = startY + (targetY - startY) * ease;
    renderMap();
    if (p < 1) {
      flyAnimFrame = requestAnimationFrame(step);
    }
  }
  flyAnimFrame = requestAnimationFrame(step);
}

// Teleport to a random unvisited spot (Spacebar mechanic from Pizza Ninjas)
function teleportNextSpot() {
  const all = getAllMapSpots();
  if (!teleportQueue.length) {
    teleportQueue = all.map(s => s.id).filter(id => id !== selectedZone);
    // Shuffle
    for (let i = teleportQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teleportQueue[i], teleportQueue[j]] = [teleportQueue[j], teleportQueue[i]];
    }
  }
  const nextId = teleportQueue.pop() || all[0].id;
  selectZone(nextId, true);
  const spot = getSpotById(nextId);
  toast(`⚡ Teleported to ${spot.name}!`);
}

function renderMap() {
  const vp = document.querySelector('#map-viewport');
  const world = document.querySelector('#map-world');
  if (!vp || !world) return;
  const w = vp.clientWidth;
  const h = vp.clientHeight;
  const mw = 1200 * mapView.scale;
  const mh = 800 * mapView.scale;
  mapView.x = mw <= w ? (w - mw) / 2 : Math.max(w - mw - 60, Math.min(60, mapView.x));
  mapView.y = mh <= h ? (h - mh) / 2 : Math.max(h - mh - 60, Math.min(60, mapView.y));

  world.style.transform = `translate(${mapView.x}px,${mapView.y}px) scale(${mapView.scale})`;
  world.style.setProperty('--pin-scale', 1 / mapView.scale);

  // Sync #worldFxTrack with world transform so clouds & birds drift in world space
  const fxTrack = document.querySelector('#worldFxTrack');
  if (fxTrack) {
    fxTrack.style.transform = `translate(${mapView.x}px,${mapView.y}px) scale(${mapView.scale})`;
  }

  const zoom = Math.round((mapView.scale / mapView.fit) * 100);
  const zoomOut = document.querySelector('#map-zoom');
  if (zoomOut) zoomOut.textContent = `${zoom}%`;
  const minusBtn = document.querySelector('#map-minus');
  const plusBtn = document.querySelector('#map-plus');
  if (minusBtn) minusBtn.disabled = zoom <= 100;
  if (plusBtn) plusBtn.disabled = zoom >= 300;

  updateChatGuideLine();
}

function resetMap() {
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  mapView.fit = Math.max(0.4, Math.min(vp.clientWidth / 1200, vp.clientHeight / 800));
  mapView.scale = mapView.fit;
  mapView.x = (vp.clientWidth - 1200 * mapView.scale) / 2;
  mapView.y = (vp.clientHeight - 800 * mapView.scale) / 2;
  renderMap();
}

function zoomMap(factor) {
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  const old = mapView.scale;
  const next = Math.max(mapView.fit, Math.min(mapView.fit * 3, old * factor));
  const cx = vp.clientWidth / 2;
  const cy = vp.clientHeight / 2;
  mapView.x = cx - ((cx - mapView.x) * next) / old;
  mapView.y = cy - ((cy - mapView.y) * next) / old;
  mapView.scale = next;
  renderMap();
}

// Golden-Ratio Fibonacci Bird Flocks on <canvas id="birds"> (from Pizza Ninjas)
function startFibonacciBirds() {
  cancelAnimationFrame(birdAnimFrame);
  const canvas = document.querySelector('#birds');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const W = 1200;
  const H = 800;
  const PHI = (1 + Math.sqrt(5)) / 2;
  const GOLD = (2 * Math.PI) / (PHI * PHI);
  const FIB = [1, 2, 3, 5, 8, 1];
  const PALETTE = ['#ffffff', '#fff3c4', '#ffd400', '#e0f2fe', '#fef08a'];

  const flocks = FIB.map((count, fi) => {
    const angle = (fi * GOLD) % (Math.PI * 2);
    return {
      cx: ((fi * 233) % (W - 200)) + 100,
      cy: ((fi * 144) % (H - 160)) + 80,
      vx: Math.cos(angle) * (0.42 + (fi % 3) * 0.14),
      vy: Math.sin(angle) * (0.28 + (fi % 2) * 0.12),
      birds: Array.from({ length: count }, (_, bi) => ({
        ox: Math.cos(bi * GOLD) * (12 + bi * 7),
        oy: Math.sin(bi * GOLD) * (10 + bi * 6),
        phase: (bi * GOLD) % (Math.PI * 2),
        size: 4.2 + ((bi + fi) % 3) * 1.1,
        color: PALETTE[(fi + bi) % PALETTE.length]
      }))
    };
  });

  function drawBirds(now) {
    if (!document.querySelector('#birds')) return;
    ctx.clearRect(0, 0, W, H);
    const t = now * 0.006;

    for (const f of flocks) {
      f.cx = (f.cx + f.vx + W) % W;
      f.cy = (f.cy + f.vy + H) % H;
      const heading = Math.atan2(f.vy, f.vx);

      for (const b of f.birds) {
        const bx = f.cx + b.ox + Math.sin(t * 0.4 + b.phase) * 4;
        const by = f.cy + b.oy + Math.cos(t * 0.35 + b.phase) * 3;
        const flap = Math.sin(t * 1.9 + b.phase);
        const s = b.size;

        // Soft shadow on water/island below
        ctx.save();
        ctx.translate(bx + 8, by + 18);
        ctx.rotate(heading);
        ctx.strokeStyle = 'rgba(0, 20, 35, 0.22)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-s, flap * s * 0.45);
        ctx.quadraticCurveTo(0, 0, s, flap * s * 0.45);
        ctx.stroke();
        ctx.restore();

        // Bird V-wing silhouette
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(heading);
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s, flap * s * 0.65);
        ctx.quadraticCurveTo(-s * 0.2, -s * 0.25, 0, 0);
        ctx.quadraticCurveTo(s * 0.2, -s * 0.25, s, flap * s * 0.65);
        ctx.stroke();
        ctx.restore();
      }
    }
    birdAnimFrame = requestAnimationFrame(drawBirds);
  }
  birdAnimFrame = requestAnimationFrame(drawBirds);
}

// 60fps Continuous Keycap Pan/Zoom Loop (Z, X, Arrow Keys)
function ensureKeyLoop() {
  if (keyLoopFrame) return;
  function tick() {
    const any = heldKeys.up || heldKeys.down || heldKeys.left || heldKeys.right || heldKeys.z || heldKeys.x;
    if (!any || !document.querySelector('#map-viewport')) {
      keyLoopFrame = 0;
      return;
    }
    const panStep = 10;
    if (heldKeys.left) mapView.x += panStep;
    if (heldKeys.right) mapView.x -= panStep;
    if (heldKeys.up) mapView.y += panStep;
    if (heldKeys.down) mapView.y -= panStep;
    if (heldKeys.z) zoomMap(1.022);
    if (heldKeys.x) zoomMap(0.978);
    if (heldKeys.left || heldKeys.right || heldKeys.up || heldKeys.down) renderMap();
    keyLoopFrame = requestAnimationFrame(tick);
  }
  keyLoopFrame = requestAnimationFrame(tick);
}

function setKeycapDown(name, isDown) {
  if (name in heldKeys) {
    heldKeys[name] = isDown;
    if (isDown) ensureKeyLoop();
  }
  const idMap = { z: '#kz', x: '#kx', space: '#kspace', up: '#kup', down: '#kdown', left: '#kleft', right: '#kright' };
  const el = document.querySelector(idMap[name]);
  if (el) el.classList.toggle('down', isDown);
}

function initMap() {
  if (mapResizeObserver) mapResizeObserver.disconnect();
  const vp = document.querySelector('#map-viewport');
  if (!vp) return;
  resetMap();
  mapResizeObserver = new ResizeObserver(resetMap);
  mapResizeObserver.observe(vp);

  startFibonacciBirds();
  updateChatGuideLine();

  let drag = null;
  vp.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;

    // If user is in "Drop an Idea on the Map" mode, plant a new .msgdot at click coordinates!
    if (placingIdeaMode) {
      const world = document.querySelector('#map-world');
      if (world) {
        const rect = world.getBoundingClientRect();
        const xPct = Math.max(5, Math.min(95, Math.round(((e.clientX - rect.left) / rect.width) * 100)));
        const yPct = Math.max(8, Math.min(92, Math.round(((e.clientY - rect.top) / rect.height) * 100)));
        const ideaTitle = window.prompt('Name your campus idea or infrastructure note:', 'New Surplus / Companion Node');
        placingIdeaMode = false;
        if (ideaTitle && ideaTitle.trim()) {
          const newDot = {
            id: 'idea-' + Date.now(),
            kind: 'idea',
            name: `Idea: ${ideaTitle.trim()}`,
            short: 'IDEA DOT',
            x: xPct,
            y: yPct,
            author: 'Campus Builder',
            companion: 'COMMUNITY IDEA PIN // ON-MAP DROP',
            text: ideaTitle.trim(),
            infraNote: 'Planted directly on the Capital Campus × Spellverse World Map.',
            action: 'Open Lab Exercise',
            lesson: 'reverse',
            starters: [`How would we prototype "${ideaTitle.trim()}" in Week 3?`]
          };
          mapIdeaDots.push(newDot);
          try {
            localStorage.setItem('rd-map-idea-dots', JSON.stringify(mapIdeaDots));
          } catch {}
          selectedZone = newDot.id;
          route();
          toast('💬 Planted your idea dot on the campus map!');
          return;
        }
        route();
      }
      return;
    }

    cancelAnimationFrame(flyAnimFrame);
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

  // Wheel zoom on stage
  vp.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      zoomMap(e.deltaY < 0 ? 1.12 : 0.89);
    },
    { passive: false }
  );
}

// Keyboard listeners for Pizza Ninjas mechanical keycaps (Z, X, Space, Arrow keys, Escape)
window.addEventListener('keydown', e => {
  if (!document.querySelector('#pz-stage')) return;
  const tag = (e.target && e.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable)) return;

  const k = e.key.toLowerCase();
  if (k === 'z') {
    e.preventDefault();
    setKeycapDown('z', true);
  } else if (k === 'x') {
    e.preventDefault();
    setKeycapDown('x', true);
  } else if (k === ' ' || e.code === 'Space') {
    e.preventDefault();
    setKeycapDown('space', true);
    teleportNextSpot();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    setKeycapDown('up', true);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setKeycapDown('down', true);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    setKeycapDown('left', true);
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    setKeycapDown('right', true);
  } else if (e.key === 'Escape') {
    if (placingIdeaMode || activeMapModal) {
      placingIdeaMode = false;
      activeMapModal = '';
      route();
    }
  }
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'z') setKeycapDown('z', false);
  else if (k === 'x') setKeycapDown('x', false);
  else if (k === ' ' || e.code === 'Space') setKeycapDown('space', false);
  else if (e.key === 'ArrowUp') setKeycapDown('up', false);
  else if (e.key === 'ArrowDown') setKeycapDown('down', false);
  else if (e.key === 'ArrowLeft') setKeycapDown('left', false);
  else if (e.key === 'ArrowRight') setKeycapDown('right', false);
});

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
  const key = location.hash.slice(1) || 'map';
  const view = views[key] ? key : 'map';
  if (view !== 'map') {
    document.body.classList.remove('world-fullscreen');
    cancelAnimationFrame(birdAnimFrame);
  }
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

// On-screen keycap pointer hold support
document.addEventListener('pointerdown', e => {
  const keyEl = e.target.closest('[data-keycap]');
  if (!keyEl) return;
  const k = keyEl.dataset.keycap;
  if (k === 'space') {
    setKeycapDown('space', true);
    teleportNextSpot();
    setTimeout(() => setKeycapDown('space', false), 220);
  } else {
    setKeycapDown(k, true);
  }
});

document.addEventListener('pointerup', () => {
  ['z', 'x', 'up', 'down', 'left', 'right'].forEach(k => setKeycapDown(k, false));
});

document.addEventListener('click', async e => {
  const openDocLink = e.target.closest('[data-open-doc]');
  if (openDocLink) {
    selectedDocId = openDocLink.dataset.openDoc;
  }

  // Close modal backdrop or button
  if (e.target.matches('[data-close-modal="true"]') || e.target.classList.contains('pz-modal-backdrop')) {
    activeMapModal = '';
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = '';
    return;
  }

  // Weekstrip opens 8-Week IP School modal
  if (e.target.closest('#weekstrip') || e.target.closest('#open-community-btn')) {
    activeMapModal = 'community';
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = renderCommunityModalHtml();
    return;
  }

  // Wiki button opens World Wiki modal
  if (e.target.closest('#wikibtn') || e.target.closest('#open-wiki-from-spot')) {
    activeMapModal = 'wiki';
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = renderWikiModalHtml();
    return;
  }

  // Welcome button opens Welcome Card modal
  if (e.target.closest('#open-welcome-btn')) {
    activeMapModal = 'welcome';
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = renderWelcomeModalHtml();
    return;
  }

  // Wiki category filter inside modal
  const wikiCatBtn = e.target.closest('[data-wiki-cat]');
  if (wikiCatBtn) {
    wikiCategory = wikiCatBtn.dataset.wikiCat;
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = renderWikiModalHtml();
    return;
  }

  // Trackmeta click toggles radio tracklist
  if (e.target.closest('#trackmeta') || e.target.closest('#radiodisc')) {
    radioExpanded = !radioExpanded;
    updateRadioDom();
    return;
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

  // Fullscreen World Map toggle
  if (b.id === 'toggle-fullscreen-world') {
    if (location.hash.slice(1) !== 'map') {
      location.hash = 'map';
    }
    document.body.classList.toggle('world-fullscreen');
    b.textContent = document.body.classList.contains('world-fullscreen') ? '✕ Exit Fullscreen' : '⛶ Fullscreen Map';
    setTimeout(resetMap, 60);
    return;
  }

  // Synth Radio buttons
  if (b.id === 'playpausebtn') {
    toggleRadioPlay();
    return;
  }
  if (b.id === 'nextbtn') {
    radioIndex = (radioIndex + 1) % radioTracks.length;
    if (radioPlaying) toggleRadioPlay(true);
    else updateRadioDom();
    return;
  }
  if (b.id === 'prevbtn') {
    radioIndex = (radioIndex - 1 + radioTracks.length) % radioTracks.length;
    if (radioPlaying) toggleRadioPlay(true);
    else updateRadioDom();
    return;
  }
  if (b.id === 'likebtn') {
    radioLiked = !radioLiked;
    updateRadioDom();
    toast(radioLiked ? `Saved "${radioTracks[radioIndex].title}" to favorites.` : 'Removed from favorites.');
    return;
  }
  if (b.dataset.radioIdx !== undefined) {
    radioIndex = parseInt(b.dataset.radioIdx, 10);
    toggleRadioPlay(true);
    return;
  }

  // Spot chat starter prompt click
  if (b.dataset.starterPrompt) {
    const inp = document.querySelector('#chatinput');
    if (inp) {
      inp.value = b.dataset.starterPrompt;
      inp.focus();
    }
    return;
  }
  if (b.id === 'chatclose') {
    const cr = document.querySelector('#chatroom');
    if (cr) cr.style.display = cr.style.display === 'none' ? '' : 'none';
    return;
  }
  if (b.id === 'chatplace') {
    placingIdeaMode = !placingIdeaMode;
    b.classList.toggle('active', placingIdeaMode);
    b.innerHTML = placingIdeaMode
      ? 'Click Anywhere on Map to Plant Idea Pin (Esc to Cancel)'
      : '<svg width="14" height="14" style="vertical-align:-2px;margin-right:4px"><use href="#icon-quill"/></svg> 💬 Drop an Idea on the Map';
    if (placingIdeaMode) toast('Click any spot on the illustrated island to plant your Idea Dot!');
    return;
  }
  if (b.id === 'fly-spot-btn') {
    const z = getSpotById(selectedZone);
    flyTo(z.x / 100, z.y / 100, mapView.fit * 1.65, 650);
    return;
  }

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
    selectZone(b.dataset.zone, true);
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
  if (b.id === 'enter-zone') {
    const z = getSpotById(b.dataset.zoneTarget);
    if (z.portalAppId) {
      activeAppId = z.portalAppId;
      activeStopIndex = 0;
      visitedStops.add(`${activeAppId}:0`);
      logPortalEvent('app_opened', activeAppId);
      location.hash = 'portal';
      return;
    }
    if (z.lesson) {
      currentLesson = lessons.find(l => l.id === z.lesson) || lessons[0];
      location.hash = 'lab';
    } else if (z.route) {
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

// Submit handler for Portal Machine Waitlist Form AND Map Spot Discussion Thread
document.addEventListener('submit', async e => {
  if (e.target.id === 'chatinputrow') {
    e.preventDefault();
    const inp = document.querySelector('#chatinput');
    if (!inp || !inp.value.trim()) return;
    const text = inp.value.trim();
    if (!spotChats[selectedZone]) spotChats[selectedZone] = [];
    spotChats[selectedZone].push({
      author: 'You (Campus Builder)',
      time: 'Just now',
      text
    });
    try {
      localStorage.setItem('rd-map-spot-chats', JSON.stringify(spotChats));
    } catch {}
    const spot = getSpotById(selectedZone);
    const chatRoom = document.querySelector('#chatroom');
    if (chatRoom) chatRoom.innerHTML = renderSpotChatHtml(spot);
    toast(`Posted reply to ${spot.name}!`);
    return;
  }

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
  if (e.target.id === 'wiki-search-input') {
    wikiSearch = e.target.value;
    const host = document.querySelector('#pz-modal-host');
    if (host) host.innerHTML = renderWikiModalHtml();
    const inp = document.querySelector('#wiki-search-input');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(wikiSearch.length, wikiSearch.length);
    }
    return;
  }
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
