/* =========================================================
   BINARY / IP CONVERSION ACTIVITY — CONFIG
   Edit this block to change how many questions of each type
   are generated, the bit width, decimal range, and which CIDR
   values are allowed for the subnet-mask questions.
========================================================= */
const QUESTION_CONFIG = {
    // Phase 1: individual decimal <-> binary conversions
    enableD2B: true,
    enableB2D: true,
    numIndividual: 10,
    bitWidth: 8,
    decMin: 0,
    decMax: 255,

    // Phase 2: IP address + subnet mask conversions
    enableIPPhase: true,
    enableIPD2B: true,
    enableIPB2D: true,
    numIP: 4,
    enableMask: true,
    enableMaskC2D: true,
    enableMaskD2B: true,
    numMask: 20,
    cidrList: "8,10,16,18,24,25,26,27,28,29,30",

    // Phase 7: classful CIDR identification — given an IP address, identify
    // its default CIDR prefix based on address class (A: 1–126 -> /8,
    // B: 128–191 -> /16, C: 192–223 -> /24). Loopback (127.x) is excluded.
    enableClassCidr: true,
    numClassCidr: 10,

    // Grading
    strictLeadingZeros: true // binary answers must match bit-width exactly
};

let studentDatabase = [];
let exerciseData = {}; 
let currentFile = "";
let currentUser = "";

// Settings and Mode Management
let appSettings = {
    mode: 'exam', // 'practice' or 'exam'
    timerMinutes: 30,
    autoShowSample: true // whether the console panel auto-opens when an exercise has sample output; device-based default set below
};

let timerIntervalId = null;
let timeRemaining = 0; // in seconds
let examEndTimestamp = null; // epoch ms the exam timer should expire at; persisted per-student so a reload resumes the real deadline instead of granting a fresh timer

window.onload = async function() {
    // Native HTML5 drag-and-drop (used for line ordering) does not fire on
    // touchscreens. Flag touch devices so CSS can hide the drag handle and
    // reveal the Up/Down buttons and Jump-to dropdown instead.
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isTouchDevice) {
        document.body.classList.add('touch-device');
    }

    // The sidebar defaults to open on desktop and closed on mobile, so the
    // hamburger button's label needs to match whichever is current.
    initSidebarToggleLabel();

    // The global "auto-show sample output" setting defaults to ON on
    // desktop (room to show it automatically) and OFF on mobile (screen
    // space is tight). It's a one-time default only — from here on it's a
    // normal setting the student can flip in the Settings modal, and the
    // drawer tab is always available to pull the console into view by hand
    // regardless of this setting.
    initSampleAutoShowDefault();

    try {
        const res = await fetch('students.csv');
        const text = await res.text();
        const rows = text.split('\n').slice(1);
        studentDatabase = rows.map(row => {
            const [email, id] = row.split(',');
            return { email: email?.trim(), id: id?.trim() };
        });
    } catch (err) { console.error("Database failed to load."); }
};

// --- HAMBURGER MENU / OFF-CANVAS SIDEBAR (mobile: overlay) ---
function openSidebar() {
    document.getElementById('sidebarNav').classList.add('sidebar-open');
    document.getElementById('sidebarBackdrop').classList.add('show');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-expanded', 'true');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-label', 'Hide exercise list');
    // Prevent the page behind the panel from scrolling while it's open
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.getElementById('sidebarNav').classList.remove('sidebar-open');
    document.getElementById('sidebarBackdrop').classList.remove('show');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-expanded', 'false');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-label', 'Show exercise list');
    document.body.style.overflow = '';
}

// --- LIVE TIMESTAMP (day, date, time — seconds re-animate on every tick) ---
function startUserClock() {
    updateUserTimestamp();
    setInterval(updateUserTimestamp, 1000);
}

function updateUserTimestamp() {
    const el = document.getElementById('userTimestamp');
    if (!el) return;

    const now = new Date();
    const dayName = now.toLocaleDateString(undefined, { weekday: 'long' });
    const dateStr = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

    let hours = now.getHours();
    const period = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');

    el.innerHTML = `<div class="timestamp-date">${dayName}, ${dateStr}</div><div class="timestamp-time">${hours}:${minutes}<span class="timestamp-seconds" id="timestampSeconds">:${seconds}</span> ${period}</div>`;

    // Restart the pulse animation each tick so the seconds visibly "beat"
    // in sync with the clock, rather than animating once and going static.
    const secondsEl = document.getElementById('timestampSeconds');
    if (secondsEl) {
        secondsEl.classList.remove('tick');
        void secondsEl.offsetWidth; // force reflow to restart the CSS animation
        secondsEl.classList.add('tick');
    }
}

// --- SIDEBAR WATERMARK (screenshot deterrent) ---
// Renders a faint, randomly-generated QR-code-like pattern behind the
// sidebar. It isn't a real scannable code — it's just visual noise meant
// to make it obvious/awkward if a student tries to pass off an edited
// screenshot of their scores as the genuine app, since a fresh random
// pattern is drawn every login and a doctored screenshot would need to
// fake it convincingly too.
function classifyQrModule(x, y, moduleCount) {
    // Three finder-pattern corners (top-left, top-right, bottom-left),
    // each with a 1-module quiet border, like a real QR code.
    const finderZones = [
        { x0: 0, y0: 0 },
        { x0: moduleCount - 7, y0: 0 },
        { x0: 0, y0: moduleCount - 7 }
    ];

    for (const zone of finderZones) {
        const lx = x - zone.x0;
        const ly = y - zone.y0;
        if (lx >= -1 && lx <= 7 && ly >= -1 && ly <= 7) {
            if (lx < 0 || lx > 6 || ly < 0 || ly > 6) return 'blank'; // quiet zone
            const onBorder = (lx === 0 || lx === 6 || ly === 0 || ly === 6);
            const inCenter = (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4);
            return (onBorder || inCenter) ? 'filled' : 'blank';
        }
    }

    // Timing strips: alternating modules along row/column 6, outside the finders
    if (y === 6 || x === 6) {
        return ((x + y) % 2 === 0) ? 'filled' : 'blank';
    }

    return 'data';
}

function generateQrWatermarkDataUrl() {
    const moduleCount = 21;
    const moduleSize = 6;
    const size = moduleCount * moduleSize;

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(98, 0, 238, 0.05)'; // subtle — matches the theme's primary color

    for (let y = 0; y < moduleCount; y++) {
        for (let x = 0; x < moduleCount; x++) {
            const type = classifyQrModule(x, y, moduleCount);
            let filled;
            if (type === 'filled') filled = true;
            else if (type === 'blank') filled = false;
            else filled = Math.random() < 0.42; // random "data" noise

            if (filled) {
                ctx.fillRect(x * moduleSize, y * moduleSize, moduleSize, moduleSize);
            }
        }
    }

    return canvas.toDataURL('image/png');
}

function applySidebarWatermark() {
    const sidebar = document.getElementById('sidebarNav');
    if (!sidebar) return;
    sidebar.style.backgroundImage = `url(${generateQrWatermarkDataUrl()})`;
    sidebar.style.backgroundRepeat = 'repeat';
}

// --- SIDEBAR COLLAPSE (desktop: in-layout panel, no backdrop/scroll-lock) ---
function collapseDesktopSidebar() {
    document.getElementById('sidebarNav').classList.add('sidebar-collapsed');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-expanded', 'false');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-label', 'Show exercise list');
}

function expandDesktopSidebar() {
    document.getElementById('sidebarNav').classList.remove('sidebar-collapsed');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-expanded', 'true');
    document.getElementById('sidebarToggleBtn').setAttribute('aria-label', 'Hide exercise list');
}

// Single entry point for the hamburger button. Behavior depends on viewport:
// on mobile the sidebar is an off-canvas overlay (hidden by default), on
// desktop it's a normal layout panel (visible by default) that can now be
// collapsed to reclaim horizontal space.
function toggleSidebar() {
    const sidebar = document.getElementById('sidebarNav');
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
        if (sidebar.classList.contains('sidebar-open')) {
            closeSidebar();
        } else {
            openSidebar();
        }
    } else {
        if (sidebar.classList.contains('sidebar-collapsed')) {
            expandDesktopSidebar();
        } else {
            collapseDesktopSidebar();
        }
    }
}

// Set the hamburger button's initial label to match each breakpoint's
// default sidebar state (open on desktop, closed on mobile) — otherwise
// the aria-label baked into the HTML would only be correct for mobile.
function initSidebarToggleLabel() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const btn = document.getElementById('sidebarToggleBtn');
    if (!btn) return;
    if (isMobile) {
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-label', 'Show exercise list');
    } else {
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('aria-label', 'Hide exercise list');
    }
}

// --- SAMPLE OUTPUT: GLOBAL AUTO-SHOW SETTING ---
// This is a global preference (configured in the Settings modal) rather
// than a per-exercise control: it decides whether the console panel opens
// automatically whenever the student switches to an activity that has
// sample output. Manually pulling the panel into view for any individual
// activity is handled separately by the drawer tab.
function initSampleAutoShowDefault() {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    appSettings.autoShowSample = !isMobile;
}

function applyAutoShowForCurrentExercise() {
    if (!currentFile) return;
    const ex = exerciseData[currentFile];
    const hasSampleOutput = !!(ex && ex.sampleOutput && ex.sampleOutput.trim().length > 0);
    if (hasSampleOutput && appSettings.autoShowSample) {
        showSampleOutput(currentFile);
    } else {
        closeSampleOutputModal();
    }
}

// Close the off-canvas panel automatically after picking an exercise, but
// only on screens narrow enough that the sidebar is an overlay in the
// first place — on desktop the sidebar stays put (collapsing is a manual,
// explicit choice there, not something exercise selection should trigger).
function closeSidebarIfMobile() {
    if (window.matchMedia('(max-width: 768px)').matches) {
        closeSidebar();
    }
}

// Close on Escape for keyboard users (mobile overlay only — desktop's
// collapsed sidebar isn't a modal, so Escape shouldn't touch it)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const sidebar = document.getElementById('sidebarNav');
        if (sidebar && sidebar.classList.contains('sidebar-open')) {
            closeSidebar();
        }
        const consolePanel = document.getElementById('sampleOutputPanel');
        if (consolePanel && consolePanel.classList.contains('open')) {
            closeSampleOutputModal();
        }
    }
});

async function handleLogin() {
    const email = document.getElementById('emailInput').value.trim();
    const id = document.getElementById('studentNumInput').value.trim();
    const user = studentDatabase.find(s => s.email === email && s.id === id);
    
    if (user) {
        currentUser = email;
        document.getElementById('loginOverlay').style.display = 'none';
        document.getElementById('appContainer').style.display = 'flex';
        document.getElementById('userDisplay').textContent = email;
        startUserClock();
        applySidebarWatermark();

        const { session: resumedSession, isExpired } = await loadAllExercises();

        // Start timer if in exam mode — resuming the real deadline (not a
        // fresh countdown) if this student already has a persisted session.
        if (appSettings.mode === 'exam') {
            if (isExpired) {
                // Time was already up (or the exam was already completed)
                // before this login/reload — stay locked, no timer.
                stopTimer();
                document.getElementById('timerContainer').style.display = 'none';
                document.getElementById('actionButton').disabled = true;
                saveExamSession();
            } else if (resumedSession && typeof resumedSession.examEndTimestamp === 'number') {
                const remaining = Math.max(0, Math.round((resumedSession.examEndTimestamp - Date.now()) / 1000));
                startTimer(remaining);
            } else {
                startTimer();
            }
        }
    } else {
        const errorEl = document.getElementById('loginError');
        errorEl.textContent = "❌ Invalid email or student number. Please try again.";
        errorEl.className = "error-text show";
    }
}

// --- PER-STUDENT DETERMINISTIC SHUFFLE ---
// Simple string hash -> 32-bit seed, used to seed a PRNG so the same
// student always gets the same "random" exercise order.
function hashStringToSeed(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0; // force 32-bit int
    }
    return hash >>> 0;
}

// mulberry32: small, fast, deterministic PRNG. Given the same seed it
// always produces the same sequence of numbers.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Returns a shuffled copy of `array`, seeded by `email` so that a given
// student always gets the same order (stable across reloads/resumed exam
// sessions), while different students get different orders from each other.
function shuffleExercisesForStudent(array, email) {
    const rng = mulberry32(hashStringToSeed(email || ''));
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

/* =========================================================
   BINARY / IP CONVERSION ACTIVITY — QUESTION GENERATION
   Ported from the standalone conversion-lab reference. Uses the
   same seeded mulberry32 PRNG already defined above, so a given
   seed string always reproduces the exact same question set.
========================================================= */
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pickRandom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function genIndividualQuestions(s, rng) {
    const types = [];
    if (s.enableD2B) types.push('d2b');
    if (s.enableB2D) types.push('b2d');
    if (types.length === 0) return [];

    const bitWidth = parseInt(s.bitWidth, 10);
    const capMax = Math.pow(2, bitWidth) - 1;
    const min = Math.max(0, Math.min(s.decMin, capMax));
    const max = Math.max(min, Math.min(s.decMax, capMax));

    const out = [];
    for (let i = 0; i < s.numIndividual; i++) {
        const type = types[i % types.length];
        const dec = randInt(rng, min, max);
        const bin = dec.toString(2).padStart(bitWidth, '0');
        if (type === 'd2b') {
            out.push({
                type: 'd2b',
                promptHtml: `Convert the decimal number <b>${dec}</b> to <b>${bitWidth}-bit</b> binary.`,
                correct: bin, bitWidth, given: dec
            });
        } else {
            out.push({
                type: 'b2d',
                promptHtml: `Convert the binary number <b>${bin}</b> to decimal.`,
                correct: String(dec), bitWidth, given: bin
            });
        }
    }
    return out;
}

function randomIP(rng) { return [randInt(rng, 0, 255), randInt(rng, 0, 255), randInt(rng, 0, 255), randInt(rng, 0, 255)]; }
function ipToBinDotted(ip) { return ip.map(o => o.toString(2).padStart(8, '0')).join('.'); }

function genIPQuestions(s, rng) {
    if (!s.enableIPPhase) return [];
    const out = [];

    const types = [];
    if (s.enableIPD2B) types.push('ip_d2b');
    if (s.enableIPB2D) types.push('ip_b2d');
    if (types.length > 0) {
        for (let i = 0; i < s.numIP; i++) {
            const type = types[i % types.length];
            const ip = randomIP(rng);
            const decStr = ip.join('.');
            const binStr = ipToBinDotted(ip);
            if (type === 'ip_d2b') {
                out.push({ type: 'ip_d2b', promptHtml: `Convert the IP address <b>${decStr}</b> to binary (8 bits per octet).`, correct: binStr, given: decStr });
            } else {
                out.push({ type: 'ip_b2d', promptHtml: `Convert the binary IP address <b>${binStr}</b> to dotted-decimal.`, correct: decStr, given: binStr });
            }
        }
    }

    if (s.enableMask && s.numMask > 0) {
        const cidrOptions = (s.cidrList || "").split(',').map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 32);
        const maskTypes = [];
        if (s.enableMaskC2D) maskTypes.push('mask_c2d');
        if (s.enableMaskD2B) maskTypes.push('mask_d2b');
        if (cidrOptions.length > 0 && maskTypes.length > 0) {
            for (let i = 0; i < s.numMask; i++) {
                const cidr = pickRandom(rng, cidrOptions);
                const maskBits = '1'.repeat(cidr) + '0'.repeat(32 - cidr);
                const octetsBin = [maskBits.substr(0, 8), maskBits.substr(8, 8), maskBits.substr(16, 8), maskBits.substr(24, 8)];
                const octetsDec = octetsBin.map(o => parseInt(o, 2));
                const decStr = octetsDec.join('.');
                const binStr = octetsBin.join('.');
                const type = maskTypes[i % maskTypes.length];
                if (type === 'mask_c2d') {
                    out.push({ type: 'mask_c2d', promptHtml: `Convert the subnet mask <b>/${cidr}</b> (CIDR) to dotted-decimal notation.`, correct: decStr, given: cidr });
                } else {
                    out.push({ type: 'mask_d2b', promptHtml: `Convert the subnet mask <b>${decStr}</b> to binary (8 bits per octet).`, correct: binStr, given: decStr });
                }
            }
        }
    }
    return out;
}

// --- CLASSFUL CIDR IDENTIFICATION (Phase 7) ---
// Given an IP address, the student identifies its default CIDR prefix
// based on the traditional IPv4 address class (A/B/C). Class D (224–239,
// multicast) and Class E (240–255, reserved) don't have a classful default
// mask, so they're never generated; 127.x.x.x (loopback) is skipped too.
const CLASSFUL_CIDR_RANGES = [
    { cls: 'A', min: 1, max: 126, cidr: 8 },   // 127 reserved for loopback
    { cls: 'B', min: 128, max: 191, cidr: 16 },
    { cls: 'C', min: 192, max: 223, cidr: 24 }
];

function randomIPInRange(rng, range) {
    const firstOctet = randInt(rng, range.min, range.max);
    const rest = [randInt(rng, 0, 255), randInt(rng, 0, 255), randInt(rng, 0, 255)];
    return [firstOctet, ...rest].join('.');
}

function genClassCidrQuestions(s, rng) {
    if (!s.enableClassCidr || !s.numClassCidr) return [];

    // Guarantee every class (A, B, C) appears at least once: assign classes
    // round-robin across the requested slots (so with numClassCidr >= 3 each
    // class is covered, and any extra slots cycle back through A/B/C again),
    // then shuffle deterministically so the guaranteed A/B/C questions don't
    // always land in the first three slots or the same relative order.
    const assignments = [];
    for (let i = 0; i < s.numClassCidr; i++) {
        assignments.push(CLASSFUL_CIDR_RANGES[i % CLASSFUL_CIDR_RANGES.length]);
    }
    for (let i = assignments.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
    }

    return assignments.map(range => ({
        type: 'class_cidr',
        promptHtml: `Identify the CIDR notation based on IP address class.`,
        correct: String(range.cidr),
        given: randomIPInRange(rng, range)
    }));
}

function questionTypeLabel(type) {
    switch (type) {
        case 'd2b': return 'Dec→Bin';
        case 'b2d': return 'Bin→Dec';
        case 'ip_d2b': return 'IP Dec→Bin';
        case 'ip_b2d': return 'IP Bin→Dec';
        case 'mask_c2d': return 'CIDR→Mask';
        case 'mask_d2b': return 'Mask→Bin';
        case 'class_cidr': return 'Class→CIDR';
        default: return '';
    }
}

// Builds the full, ordered list of named question "exercises" for a given
// seed string. Exam mode seeds with the student's email (unique, stable
// per student across reloads); practice mode uses one fixed seed so every
// student practices the same set. Grouped by phase, numbered within each
// phase, matching the sidebar's one-entry-per-question structure.
function buildConversionQuestions(seedStr) {
    const rng = mulberry32(hashStringToSeed(seedStr || ''));
    const individual = genIndividualQuestions(QUESTION_CONFIG, rng);
    const ipQuestions = genIPQuestions(QUESTION_CONFIG, rng);
    const classCidrQuestions = genClassCidrQuestions(QUESTION_CONFIG, rng);

    // Split the individual-conversion pool by direction so decimal->binary
    // and binary->decimal each get their own phase, rather than being
    // interleaved within one phase.
    const decToBin = individual.filter(q => q.type === 'd2b');
    const binToDec = individual.filter(q => q.type === 'b2d');

    // Split the IP/subnetting pool into four distinct phases: pure IP
    // address conversions (both directions) and subnet-mask conversions
    // (both directions) each get their own phase.
    const ipToBinary = ipQuestions.filter(q => q.type === 'ip_d2b');
    const ipToDecimal = ipQuestions.filter(q => q.type === 'ip_b2d');
    const cidrToMask = ipQuestions.filter(q => q.type === 'mask_c2d');
    const maskToBinary = ipQuestions.filter(q => q.type === 'mask_d2b');

    const list = [];
    decToBin.forEach((q, i) => list.push({
        name: `dec2bin-q${i + 1}`,
        phase: 'Phase 1 · Decimal → Binary',
        label: `Phase 1 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    binToDec.forEach((q, i) => list.push({
        name: `bin2dec-q${i + 1}`,
        phase: 'Phase 2 · Binary → Decimal',
        label: `Phase 2 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    ipToBinary.forEach((q, i) => list.push({
        name: `ipdecbin-q${i + 1}`,
        phase: 'Phase 3 · IP Decimal → Binary',
        label: `Phase 3 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    ipToDecimal.forEach((q, i) => list.push({
        name: `ipbindec-q${i + 1}`,
        phase: 'Phase 4 · IP Binary → Decimal',
        label: `Phase 4 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    cidrToMask.forEach((q, i) => list.push({
        name: `cidrmask-q${i + 1}`,
        phase: 'Phase 5 · CIDR → Mask',
        label: `Phase 5 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    maskToBinary.forEach((q, i) => list.push({
        name: `maskbin-q${i + 1}`,
        phase: 'Phase 6 · Mask → Binary',
        label: `Phase 6 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    classCidrQuestions.forEach((q, i) => list.push({
        name: `classcidr-q${i + 1}`,
        phase: 'Phase 7 · Class-Based CIDR',
        label: `Phase 7 – Q${i + 1} (${questionTypeLabel(q.type)})`,
        shortLabel: `Q${i + 1} · ${questionTypeLabel(q.type)}`,
        q
    }));
    return list;
}

async function loadAllExercises() {
    const list = document.getElementById('fileList');
    list.innerHTML = ""; 
    document.getElementById('loader').style.display = 'block';

    // Exam mode: seed question generation with the student's email, so
    // the exact same numbers/questions reappear on reload (stable across
    // resumed exam sessions) while differing from student to student.
    // Practice mode uses one fixed seed so every student practices the
    // same set.
    const seedStr = (appSettings.mode === 'exam' && currentUser)
        ? currentUser
        : 'practice-default-seed';

    const questionList = buildConversionQuestions(seedStr);

    let lastPhase = null;
    for (const item of questionList) {
        exerciseData[item.name] = buildConversionExerciseData(item);

        // Insert a non-interactive phase header whenever the phase changes
        // (list is already grouped/ordered by phase from buildConversionQuestions).
        if (item.phase !== lastPhase) {
            const headerLi = document.createElement('li');
            headerLi.className = 'sidebar-phase-header';
            headerLi.textContent = item.phase;
            headerLi.setAttribute('role', 'presentation');
            list.appendChild(headerLi);
            lastPhase = item.phase;
        }

        const li = document.createElement('li');
        const safeId = item.name;
        li.id = `nav-${safeId}`;

        li.innerHTML = `
            <span>${item.shortLabel}</span>
            <span class="nav-score" id="score-${safeId}">0/${exerciseData[item.name].answers.length}</span>
        `;

        li.onclick = () => {
            switchExercise(item.name, li);
            closeSidebarIfMobile();
        };
        list.appendChild(li);

        // Initialize sidebar score and summary
        updateSidebarScore(item.name);
        updateSummaryPanel();
    }
    document.getElementById('loader').style.display = 'none';

    // --- Restore any persisted exam-mode progress for this student ---
    // Keyed by email, so a page reload/reconnect during an exam resumes
    // exactly where the student left off (locked exercises, scores, line
    // order) instead of silently wiping their answers and handing them a
    // brand-new timer.
    let resumedSession = null;
    let isExpired = false;
    if (appSettings.mode === 'exam' && currentUser) {
        resumedSession = loadExamSession(currentUser);
        if (resumedSession) {
            applySavedExerciseStates(resumedSession);
            isExpired = !!resumedSession.completed ||
                (typeof resumedSession.examEndTimestamp === 'number' && Date.now() >= resumedSession.examEndTimestamp);
            if (isExpired) {
                // Lock every exercise, including ones never opened, so a
                // reload after time's up can't be used to keep answering.
                for (const file in exerciseData) {
                    exerciseData[file].locked = true;
                }
            }
        }
    }

    const firstQuestionItem = list.querySelector('li:not(.sidebar-phase-header)');
    if (firstQuestionItem) firstQuestionItem.click();

    // Attach action button handler (delegates to verify or reset depending on locked state)
    document.getElementById('actionButton').addEventListener('click', () => {
        const actionBtn = document.getElementById('actionButton');
        const ex = exerciseData[currentFile];
        if (!currentFile) return;
        if (ex && ex.locked) {
            resetCurrentExercise();
        } else {
            checkAnswers();
        }
    });

    return { session: resumedSession, isExpired };
}

// Applies a previously-saved exam session (locked state, score, and line
// order per exercise) onto the freshly-loaded exerciseData. Must run after
// exerciseData has been populated (each exercise re-shuffles on every page
// load, but userOrder is stored as original line indices, so it re-applies
// correctly regardless of the new shuffle).
function applySavedExerciseStates(session) {
    if (!session || !session.exercises) return;
    for (const file in session.exercises) {
        const saved = session.exercises[file];
        const ex = exerciseData[file];
        if (!ex || !saved) continue;
        ex.locked = !!saved.locked;
        ex.score = saved.score || 0;
        ex.isPartial = !!saved.isPartial;
        if (ex.isLineOrdering && Array.isArray(saved.userOrder) && saved.userOrder.length) {
            ex.userOrder = saved.userOrder;
        }
        if (ex.isConversionQuestion && typeof saved.userAnswer === 'string') {
            ex.userAnswer = saved.userAnswer;
        }
        updateSidebarScore(file);
    }
    updateSummaryPanel();
}

// Fisher-Yates shuffle that guarantees a derangement (no item in original position)
function createDerangement(length) {
    if (length <= 1) return [...Array(length).keys()];
    
    let attempt = 0;
    let derangement;
    let isValid;
    
    do {
        // Fisher-Yates shuffle
        derangement = [...Array(length).keys()];
        for (let i = length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [derangement[i], derangement[j]] = [derangement[j], derangement[i]];
        }
        
        // Check if it's a valid derangement (no item in original position)
        isValid = true;
        for (let i = 0; i < length; i++) {
            if (derangement[i] === i) {
                isValid = false;
                break;
            }
        }
        
        attempt++;
    } while (!isValid && attempt < 100); // Max 100 attempts to prevent infinite loop
    
    // Fallback: if derangement fails, manually create one
    if (!isValid) {
        derangement = [...Array(length).keys()];
        const rotations = Math.max(1, Math.floor(length / 2));
        for (let i = 0; i < rotations; i++) {
            derangement.push(derangement.shift());
        }
    }
    
    return derangement;
}

function parseJavaCode(raw) {
    // Extract sample output from a leading block comment (/* ... */) if present
    let sampleOutput = '';
    const commentMatch = raw.match(/\/\*[\s\S]*?\*\//);
    if (commentMatch) {
        const comment = commentMatch[0];
        // Find 'Sample Output:' marker (case-insensitive)
        const markerIndex = comment.search(/Sample Output:/i);
        if (markerIndex >= 0) {
            // Extract everything after the marker up to end of comment
            let after = comment.slice(markerIndex + 'Sample Output:'.length);

            // Strip the block comment's closing "*/" (and any whitespace
            // right before it) from the very end BEFORE splitting into
            // lines. Doing this first means a genuine blank line the
            // author intentionally included in the sample output (e.g. a
            // trailing blank row) can't get confused with — and dropped
            // along with — the leftover artifact the closer would
            // otherwise leave behind on its own line.
            after = after.replace(/\s*\*\/\s*$/, '');

            // Strip only the JavaDoc-style comment prefix from each line: an
            // optional single leading space, the '*', and at most one space
            // right after it. Anything beyond that single space is real
            // indentation belonging to the program's actual output (e.g. an
            // ASCII-art shape) and must be preserved exactly as-is.
            let sampleLines = after.split('\n').map(l => l.replace(/^ ?\*\s?/, ''));

            // Drop only the leading blank line produced by the newline
            // right after "Sample Output:" itself. Any blank line(s)
            // further in — including a trailing one — are part of the
            // real output and are left untouched.
            while (sampleLines.length && sampleLines[0].trim() === '') {
                sampleLines.shift();
            }

            // Trailing whitespace on a line doesn't affect how it renders,
            // so it's safe to trim per line without touching leading spaces.
            sampleOutput = sampleLines.map(l => l.replace(/\s+$/, '')).join('\n');
        }

        // Remove the entire leading comment block from the raw source before parsing lines
        raw = raw.replace(commentMatch[0], '');
    }

    // Split code into lines and filter out empty lines
    const lines = raw.split('\n').filter(line => line.trim().length > 0);
    
    // Escape HTML
    const escapedLines = lines.map(line => 
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    );
    
    // Create shuffled version using derangement (no item in original position)
    const shuffledIndices = createDerangement(escapedLines.length);
    const shuffledLines = shuffledIndices.map(idx => escapedLines[idx]);
    
    // Generate fixed line numbers column and draggable code area
    let lineNumbersHtml = '<div class="line-numbers-column">';
    for (let i = 0; i < escapedLines.length; i++) {
        lineNumbersHtml += `<div class="line-number">${i + 1}</div>`;
    }
    lineNumbersHtml += '</div>';
    
    // Build draggable items (no line numbers attached)
    let codeAreaHtml = '<div class="code-ordering-area" id="orderingArea">';
    shuffledLines.forEach((line, idx) => {
        const originalIdx = shuffledIndices[idx];
        
        codeAreaHtml += `<div class="draggable-line" draggable="true" data-original-idx="${originalIdx}">
                            <span class="drag-handle">⋮⋮</span>
                            <div class="updown-buttons">
                                <button type="button" class="move-up-btn" aria-label="Move line up">▲</button>
                                <button type="button" class="move-down-btn" aria-label="Move line down">▼</button>
                            </div>
                            <code>${line}</code>
                        </div>`;
    });
    codeAreaHtml += '</div>';
    
    // Wrap both in a container
    const html = `<div class="code-ordering-container">${lineNumbersHtml}${codeAreaHtml}</div>`;
    
    // For compatibility, 'answers' stores the correct order
    const answers = escapedLines.map((_, idx) => [idx.toString()]);
    
    // Identify duplicate lines and map which positions are valid for each line's content
    const lineGroups = {}; // content -> array of original indices
    escapedLines.forEach((line, idx) => {
        if (!lineGroups[line]) {
            lineGroups[line] = [];
        }
        lineGroups[line].push(idx);
    });
    
    // Create a map: originalIdx -> valid positions for that line's content
    const validPositionsMap = {};
    escapedLines.forEach((line, idx) => {
        validPositionsMap[idx] = lineGroups[line].sort((a, b) => a - b);
    });
    
    return { 
        html, 
        answers, 
        sampleOutput,
        originalLines: escapedLines,
        originalIndices: [...escapedLines.keys()],
        shuffledIndices: shuffledIndices,
        validPositionsMap: validPositionsMap,
        lineGroups: lineGroups,
        userOrder: [],
        score: 0, 
        locked: false, 
        isPartial: false,
        isLineOrdering: true
    };
}

/* =========================================================
   BINARY / IP CONVERSION ACTIVITY — EXERCISE DATA / RENDERING / GRADING
   Builds an object shaped like the exerciseData entries the rest of the
   app already expects (locked/score/answers/html), so the sidebar,
   scoring, exam persistence, and lock/reset flow all work unmodified.
========================================================= */
function buildConversionExerciseData(item) {
    const q = item.q;
    // IP address questions (Phase 3 · IP Dec→Bin and Phase 4 · IP Bin→Dec)
    // are graded per octet — 4 "lines" so 1 point per octet, up to 4 points
    // total — instead of a single all-or-nothing point. Everything else
    // (mask questions, individual dec/bin questions) stays at 1 point.
    const isOctetScored = (q.type === 'ip_d2b' || q.type === 'ip_b2d');
    return {
        html: renderQuestionHtml(item.name, q),
        answers: isOctetScored ? [[], [], [], []] : [[q.correct]], // length drives the score denominator everywhere (sidebar, summary, exam completion)
        correct: q.correct,
        type: q.type,
        bitWidth: q.bitWidth,
        given: q.given,
        promptHtml: q.promptHtml,
        label: item.label,
        shortLabel: item.shortLabel,
        phase: item.phase,
        sampleOutput: '',
        userAnswer: '',
        score: 0,
        locked: false,
        isPartial: false,
        isConversionQuestion: true,
        isLineOrdering: false
    };
}

function renderBitGroup(qid, width) {
    let html = `<div class="bitgroup" data-qid="${qid}">`;
    for (let i = 0; i < width; i++) {
        html += `<input class="bitbox" maxlength="1" inputmode="numeric" data-idx="${i}" data-qid="${qid}">`;
        if ((i + 1) % 4 === 0 && i !== width - 1) html += `<span class="bytesep"></span>`;
    }
    html += `</div>`;
    return html;
}

function renderIpOctetInputs(qid, kind) {
    const cls = kind === 'bin' ? 'ip-octet-bin' : 'ip-octet-dec';
    const maxlen = kind === 'bin' ? 8 : 3;
    const placeholder = kind === 'bin' ? '00000000' : '0';
    let html = '';
    for (let i = 0; i < 4; i++) {
        html += `<input type="text" class="${cls}" maxlength="${maxlen}" inputmode="numeric" data-qid="${qid}" data-oct="${i}" placeholder="${placeholder}">`;
        if (i < 3) html += `<span class="octet-dot">.</span>`;
    }
    return html;
}

// Renders "192.168.1.0 / ___" — the IP address followed by a slash and an
// underline-style blank for the CIDR prefix number (no boxed border, just
// a line to write on). Reuses the "answer-input-num" class so the existing
// collect/restore/enable-disable wiring (shared with the b2d question
// type) picks it up with no extra plumbing; inline styles override that
// class's default boxed look for this specific input.
function renderClassCidrInput(qid, ip) {
    const lineStyle = 'border:none;border-bottom:2px solid currentColor;background:transparent;' +
        'width:2.5ch;text-align:center;padding:0 2px;box-shadow:none;border-radius:0;';
    return `<span class="cidr-ip-text">${ip}</span><span class="cidr-slash">/</span><input type="text" class="answer-input-num cidr-answer-input" data-qid="${qid}" maxlength="2" inputmode="numeric" style="${lineStyle}">`;
}

function renderQuestionHtml(qid, q) {
    let inputHtml = '';
    if (q.type === 'd2b') {
        inputHtml = renderBitGroup(qid, q.bitWidth);
    } else if (q.type === 'b2d') {
        inputHtml = `<input type="text" class="answer-input-num" data-qid="${qid}" inputmode="numeric" placeholder="decimal">`;
    } else if (q.type === 'ip_d2b' || q.type === 'mask_d2b') {
        inputHtml = renderIpOctetInputs(qid, 'bin');
    } else if (q.type === 'ip_b2d' || q.type === 'mask_c2d') {
        inputHtml = renderIpOctetInputs(qid, 'dec');
    } else if (q.type === 'class_cidr') {
        inputHtml = renderClassCidrInput(qid, q.given);
    }
    return `<div class="conversion-question">
                <div class="conversion-prompt">${q.promptHtml}</div>
                <div class="conversion-answer-row">${inputHtml}</div>
            </div>`;
}

// Reads whatever is currently typed into the DOM for the active question.
// Only one question's inputs exist in #codeDisplay at a time, so no qid
// scoping is needed on the selectors.
function collectConversionAnswer(ex) {
    if (!ex) return '';
    if (ex.type === 'd2b') {
        return Array.from(document.querySelectorAll('.bitbox')).map(b => b.value || '_').join('');
    }
    if (ex.type === 'b2d' || ex.type === 'class_cidr') {
        const inp = document.querySelector('.answer-input-num');
        return inp ? inp.value.trim() : '';
    }
    if (ex.type === 'ip_d2b' || ex.type === 'mask_d2b') {
        const parts = [0, 1, 2, 3].map(i => {
            const el = document.querySelector(`.ip-octet-bin[data-oct="${i}"]`);
            return el ? el.value.trim() : '';
        });
        return parts.join('.');
    }
    if (ex.type === 'ip_b2d' || ex.type === 'mask_c2d') {
        const parts = [0, 1, 2, 3].map(i => {
            const el = document.querySelector(`.ip-octet-dec[data-oct="${i}"]`);
            return el ? el.value.trim() : '';
        });
        return parts.join('.');
    }
    return '';
}

function gradeConversionAnswer(ex, userAnswer) {
    if (!ex) return false;
    // Exact match required for binary answers (leading zeros matter).
    return (userAnswer || '').trim() === (ex.correct || '').trim();
}

// Returns { score, allCorrect } for the current question. IP address
// questions (Phase 3/4) are graded per octet — 1 point for each of the 4
// octets that matches — so partial credit is possible. Every other
// conversion type (individual dec/bin, subnet mask) is still all-or-nothing
// (1 point), matching ex.answers.length set in buildConversionExerciseData.
function gradeConversionScore(ex, userAnswer) {
    if (!ex) return { score: 0, allCorrect: false };
    if (ex.type === 'ip_d2b' || ex.type === 'ip_b2d') {
        const correctParts = (ex.correct || '').split('.');
        const userParts = (userAnswer || '').split('.');
        let score = 0;
        for (let i = 0; i < correctParts.length; i++) {
            if ((userParts[i] || '').trim() === correctParts[i].trim()) score++;
        }
        return { score, allCorrect: score === correctParts.length };
    }
    const isCorrect = gradeConversionAnswer(ex, userAnswer);
    return { score: isCorrect ? 1 : 0, allCorrect: isCorrect };
}

// Repopulates the current question's inputs from a previously saved
// ex.userAnswer (e.g. after switching away and back, or resuming an
// exam session mid-question).
function restoreConversionAnswer(ex) {
    if (!ex || !ex.userAnswer) return;
    if (ex.type === 'd2b') {
        const chars = ex.userAnswer.split('');
        document.querySelectorAll('.bitbox').forEach((box, i) => {
            const c = chars[i];
            box.classList.remove('on', 'off');
            if (c === '0' || c === '1') {
                box.value = c;
                box.classList.add(c === '1' ? 'on' : 'off');
            }
        });
    } else if (ex.type === 'b2d' || ex.type === 'class_cidr') {
        const inp = document.querySelector('.answer-input-num');
        if (inp) inp.value = ex.userAnswer;
    } else if (ex.type === 'ip_d2b' || ex.type === 'mask_d2b') {
        const parts = ex.userAnswer.split('.');
        document.querySelectorAll('.ip-octet-bin').forEach(el => {
            const idx = parseInt(el.dataset.oct, 10);
            el.value = parts[idx] || '';
        });
    } else if (ex.type === 'ip_b2d' || ex.type === 'mask_c2d') {
        const parts = ex.userAnswer.split('.');
        document.querySelectorAll('.ip-octet-dec').forEach(el => {
            const idx = parseInt(el.dataset.oct, 10);
            el.value = parts[idx] || '';
        });
    }
}

// Persists the in-progress answer for the current question (debounced by
// the caller via the input event) and, in exam mode, saves the session so
// a reload mid-question doesn't lose it.
function saveConversionProgress() {
    const ex = exerciseData[currentFile];
    if (!ex || !ex.isConversionQuestion || ex.locked) return;
    ex.userAnswer = collectConversionAnswer(ex);
    if (appSettings.mode === 'exam') saveExamSession();
}

// Wires up input formatting/auto-advance for bit boxes, and plain change
// listeners for the other input types, on whatever is currently rendered
// in #codeDisplay.
function attachConversionInputHandlers(ex) {
    if (!ex) return;
    if (ex.type === 'd2b') {
        const boxes = Array.from(document.querySelectorAll('.bitbox'));
        boxes.forEach((box, idx) => {
            box.addEventListener('input', e => {
                let v = e.target.value.replace(/[^01]/g, '').slice(-1);
                e.target.value = v;
                e.target.classList.remove('on', 'off');
                if (v === '1') e.target.classList.add('on');
                else if (v === '0') e.target.classList.add('off');
                if (v && idx < boxes.length - 1) boxes[idx + 1].focus();
                saveConversionProgress();
            });
            box.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !e.target.value && idx > 0) boxes[idx - 1].focus();
                if (e.key === 'ArrowLeft' && idx > 0) boxes[idx - 1].focus();
                if (e.key === 'ArrowRight' && idx < boxes.length - 1) boxes[idx + 1].focus();
            });
        });
    } else {
        document.querySelectorAll('.answer-input-num, .ip-octet-bin, .ip-octet-dec').forEach(inp => {
            inp.addEventListener('input', () => saveConversionProgress());
        });
    }
}

function saveProgress(index, value) {
    if (exerciseData[currentFile]) {
        if (exerciseData[currentFile].isLineOrdering) {
            // For line ordering, progress tracking happens via drag/drop
            return;
        } else {
            // Legacy: for fill-in-the-blank
            exerciseData[currentFile].userProgress[index] = value;
        }
    }
}

function setInputsDisabled(disabled) {
    const ex = exerciseData[currentFile];
    
    // Handle line ordering exercises
    if (ex && ex.isLineOrdering) {
        const draggableLines = document.querySelectorAll('.draggable-line');
        draggableLines.forEach(line => {
            line.draggable = !disabled;
            const jumpSelect = line.querySelector('.jump-to-select');
            if (jumpSelect) jumpSelect.disabled = disabled;
            if (disabled) {
                line.classList.add('locked');
                line.setAttribute('title', 'Locked');
            } else {
                line.classList.remove('locked');
                line.removeAttribute('title');
            }
        });
        refreshUpDownButtonStates(disabled);
    }

    // Handle binary/IP conversion questions
    if (ex && ex.isConversionQuestion) {
        document.querySelectorAll('.bitbox, .answer-input-num, .ip-octet-bin, .ip-octet-dec').forEach(inp => {
            inp.disabled = disabled;
            if (disabled) {
                inp.classList.add('locked');
                inp.setAttribute('title', 'Locked');
            } else {
                inp.classList.remove('locked');
                inp.removeAttribute('title');
            }
        });
    }
    
    // Legacy: handle fill-in-the-blank exercises
    const inputs = document.querySelectorAll('.code-input');
    inputs.forEach(input => {
        input.disabled = disabled;
        if (disabled) {
            input.classList.add('locked');
            input.setAttribute('title', 'Locked');
        } else {
            input.classList.remove('locked');
            input.removeAttribute('title');
        }
    });
    
    const editor = document.querySelector('.code-editor');
    if (editor) {
        if (disabled) editor.classList.add('locked'); 
        else editor.classList.remove('locked');
    }
}

function updateSidebarScore(file) {
    const safeId = file.replace(/\./g, '-');
    const scoreSpan = document.getElementById(`score-${safeId}`);
    const ex = exerciseData[file];
    if (!scoreSpan || !ex) return;
    scoreSpan.textContent = `${ex.score}/${ex.answers.length}`;
    
    // Remove all score classes first
    scoreSpan.classList.remove('completed-score', 'partial-score');
    
    // Add appropriate class based on score
    if (ex.score === ex.answers.length) {
        scoreSpan.classList.add('completed-score');  // 100% correct
    } else if (ex.score > 0) {
        scoreSpan.classList.add('partial-score');     // Partial correct
    }
    // If score is 0, keep default styling (unanswered)
}

function updateSummaryPanel() {
    let totalGot = 0;
    let totalPossible = 0;
    for (const file in exerciseData) {
        const ex = exerciseData[file];
        totalGot += Number(ex.score || 0);
        totalPossible += ex.answers.length;
    }
    document.getElementById('summaryValue').textContent = `${totalGot} / ${totalPossible}`;

    // Keep the sidebar QR code in sync with the running total so it always
    // reflects the student's current score, not just the score at the end.
    // Encryption is async, so this fires and updates the QR once ready.
    if (currentUser) {
        buildResultsShareUrl(totalGot, totalPossible).then(shareUrl => {
            renderQrInto('sidebarQrCodeBox', shareUrl, 110);
        });
    }
}

function switchExercise(name, el) {
    currentFile = name;
    document.querySelectorAll('.sidebar li').forEach(l => l.classList.remove('active'));
    el.classList.add('active');
    
    document.getElementById('currentFileName').textContent = exerciseData[name].label || name;
    const display = document.getElementById('codeDisplay');
    display.innerHTML = exerciseData[name].html;

    // Handle line ordering exercises
    if (exerciseData[name].isLineOrdering) {
        setupDragAndDrop();
        setupJumpToUI(name);
        restoreUserOrder(name);
        setupUpDownButtons();
    } else if (exerciseData[name].isConversionQuestion) {
        attachConversionInputHandlers(exerciseData[name]);
        restoreConversionAnswer(exerciseData[name]);
    } else {
        // Legacy: fill-in-the-blank handling
        const inputs = display.querySelectorAll('.code-input');
        inputs.forEach((input, index) => {
            input.value = exerciseData[name].userProgress[index];
        });
    }

    // Restore disabled state and styles if previously verified (locked)
    const ex = exerciseData[name];
    if (ex.locked) {
        if (ex.isLineOrdering) {
            document.querySelectorAll('.draggable-line').forEach(draggableEl => {
                draggableEl.draggable = false;
                draggableEl.classList.add('locked');
                const jumpSelect = draggableEl.querySelector('.jump-to-select');
                if (jumpSelect) jumpSelect.disabled = true;
            });
            // Re-derive correct/incorrect styling from the (possibly
            // restored) line order, since the DOM was just rebuilt from
            // ex.html above and doesn't carry the classes over on its own.
            applyLineOrderingLockedStyling(ex);
        } else if (ex.isConversionQuestion) {
            const { allCorrect } = gradeConversionScore(ex, ex.userAnswer);
            const qCard = document.querySelector('.conversion-question');
            if (qCard) qCard.classList.add(allCorrect ? 'correct' : 'incorrect');
        } else {
            const inputs = display.querySelectorAll('.code-input');
            inputs.forEach((input, idx) => {
                const val = input.value.trim();
                if (ex.answers[idx].includes(val)) {
                    input.style.borderBottomColor = "var(--secondary)";
                } else {
                    input.style.borderBottomColor = "var(--error)";
                }
            });
        }
        setInputsDisabled(true);
        
        // Only allow reset in practice mode
        if (appSettings.mode === 'practice') {
            document.getElementById('actionButton').textContent = 'Reset';
        } else {
            document.getElementById('actionButton').textContent = 'Locked';
            document.getElementById('actionButton').disabled = true;
        }
    } else {
        // Editable
        setInputsDisabled(false);
        if (!ex.isLineOrdering && !ex.isConversionQuestion) {
            display.querySelectorAll('.code-input').forEach(i => i.style.borderBottomColor = 'var(--secondary)');
        }
        document.getElementById('actionButton').textContent = 'Verify Answer';
        document.getElementById('actionButton').disabled = false;
    }

    updateSidebarScore(name);
    updateSummaryPanel();
    document.getElementById('feedback').textContent = "";

    // Auto-show/hide the console panel per the global "Sample Output"
    // setting (Settings modal), which now applies uniformly across every
    // activity rather than being toggled per exercise. The drawer tab
    // (updated inside showSampleOutput/closeSampleOutputModal) remains
    // available for the student to manually pull the panel into view for
    // this activity regardless of the setting.
    applyAutoShowForCurrentExercise();
}

// Marks each draggable line in the current #orderingArea as correct/incorrect
// based on its DOM position vs. ex.validPositionsMap. Shared by checkAnswers
// (right after verifying) and by switchExercise (when redisplaying an
// already-locked exercise, e.g. after restoring a persisted exam session),
// so the green/red styling matches the stored result either way.
function applyLineOrderingLockedStyling(ex) {
    if (!ex || !ex.isLineOrdering) return [];
    const orderingArea = document.getElementById('orderingArea');
    if (!orderingArea) return [];

    const orderedLines = Array.from(orderingArea.querySelectorAll('.draggable-line'));
    const usedValidPositions = new Set();

    orderedLines.forEach((lineEl, idx) => {
        lineEl.classList.remove('correct', 'incorrect');
        const originalIdx = parseInt(lineEl.getAttribute('data-original-idx'));
        const validPositions = ex.validPositionsMap[originalIdx];

        let isCorrect = false;
        if (validPositions && validPositions.length === 1) {
            isCorrect = (originalIdx === idx);
        } else if (validPositions && validPositions.length > 1) {
            isCorrect = validPositions.includes(idx) && !usedValidPositions.has(idx);
            if (isCorrect) usedValidPositions.add(idx);
        }

        lineEl.classList.add(isCorrect ? 'correct' : 'incorrect');
    });

    return orderedLines;
}

function checkAnswers() {
    if (!currentFile) return;
    const ex = exerciseData[currentFile];
    let score = 0;

    if (ex.isLineOrdering) {
        // Save user's ordering before verification
        const orderingArea = document.getElementById('orderingArea');
        const orderedLinesBefore = Array.from(orderingArea.querySelectorAll('.draggable-line'));
        ex.userOrder = orderedLinesBefore.map(el => parseInt(el.getAttribute('data-original-idx')));

        // Verify line ordering (with semantic equivalence for identical
        // lines) and apply correct/incorrect styling in one pass.
        const orderedLines = applyLineOrderingLockedStyling(ex);
        score = orderedLines.filter(el => el.classList.contains('correct')).length;
    } else if (ex.isConversionQuestion) {
        ex.userAnswer = collectConversionAnswer(ex);
        const { score: earnedScore, allCorrect } = gradeConversionScore(ex, ex.userAnswer);
        score = earnedScore;
        const qCard = document.querySelector('.conversion-question');
        if (qCard) qCard.classList.add(allCorrect ? 'correct' : 'incorrect');
    } else {
        // Legacy: fill-in-the-blank verification
        const inputs = document.querySelectorAll('.code-input');
        const correctArr = ex.answers;

        inputs.forEach((input, index) => {
            const val = input.value.trim();
            if (correctArr[index].includes(val)) {
                input.style.borderBottomColor = "var(--secondary)";
                score++;
            } else {
                input.style.borderBottomColor = "var(--error)";
            }
        });
    }

    // Lock inputs and mark exercise locked
    setInputsDisabled(true);
    ex.score = score;
    ex.locked = true;
    
    const totalLines = ex.answers.length;
    ex.isPartial = score > 0 && score < totalLines;

    // Update Sidebar Score
    updateSidebarScore(currentFile);
    updateSummaryPanel();

    const msg = document.getElementById('feedback');
    if (score === totalLines) {
        msg.textContent = ex.isConversionQuestion
            ? "✨ Correct! ✨"
            : "✨ Perfect! All lines in correct order! ✨";
        msg.className = "success show";
        // Bigger & longer confetti
        triggerBigConfetti();
    } else if (ex.isConversionQuestion) {
        // Neither mode reveals the correct value here: practice mode lets
        // the student reset and try again, and exam mode has no reset, so
        // showing it would double as an answer key mid-exam.
        if (totalLines > 1) {
            // Octet-scored (Phase 3 · IP Dec→Bin / Phase 4 · IP Bin→Dec):
            // partial credit is possible, so surface how many octets were
            // right rather than a flat "not quite".
            msg.textContent = (appSettings.mode === 'practice')
                ? `${score}/${totalLines} octets correct — try again.`
                : `${score}/${totalLines} octets correct.`;
            msg.className = score > 0 ? "warning show" : "error show";
        } else {
            msg.textContent = "Not quite" + (appSettings.mode === 'practice' ? " — try again." : ".");
            msg.className = "error show";
        }
    } else {
        msg.textContent = `Progress: ${score}/${totalLines} correct.`;
        msg.className = "warning show";
    }

    // Change action button based on mode
    const actionBtn = document.getElementById('actionButton');
    if (appSettings.mode === 'exam') {
        actionBtn.textContent = 'Locked';
        actionBtn.disabled = true;

        // Persist this student's progress so it survives a reload.
        saveExamSession();

        // Check if all exercises have been answered in exam mode
        if (checkIfAllAnswered()) {
            // Stop timer early and show score summary
            stopTimer();
            setTimeout(() => {
                showScoreSummaryModal('Congratulations! All exercises completed before time ran out!', 'success');
            }, 500);
        }
    } else {
        actionBtn.textContent = 'Reset';
    }
}

function resetCurrentExercise() {
    if (!currentFile) return;
    
    // Prevent reset in exam mode
    if (appSettings.mode === 'exam') {
        showAlertModal('Reset Not Allowed', 'Reset is not allowed in Exam Mode.');
        return;
    }
    
    const ex = exerciseData[currentFile];
    
    if (ex.isLineOrdering) {
        ex.userOrder = [];
        const orderingArea = document.getElementById('orderingArea');
        
        // Reshuffle the lines back to their original shuffled positions
        const shuffledLines = ex.shuffledIndices.map(origIdx => {
            const draggableEl = orderingArea.querySelector(`[data-original-idx="${origIdx}"]`);
            return draggableEl;
        });
        
        // Sort by current position in shuffled order and re-render
        shuffledLines.forEach((el, idx) => {
            if (el) {
                orderingArea.appendChild(el);
                el.classList.remove('correct', 'incorrect');
            }
        });
        setupDragAndDrop();
        setupJumpToUI(currentFile);
        setupUpDownButtons();
    } else if (ex.isConversionQuestion) {
        ex.userAnswer = '';
        document.querySelectorAll('.bitbox').forEach(b => {
            b.value = '';
            b.classList.remove('on', 'off');
        });
        document.querySelectorAll('.answer-input-num, .ip-octet-bin, .ip-octet-dec').forEach(i => i.value = '');
        const qCard = document.querySelector('.conversion-question');
        if (qCard) qCard.classList.remove('correct', 'incorrect');
    } else {
        // Legacy: fill-in-the-blank reset
        ex.userProgress = ex.userProgress.map(() => "");
        const display = document.getElementById('codeDisplay');
        const inputs = display.querySelectorAll('.code-input');
        inputs.forEach((input) => {
            input.value = '';
            input.style.borderBottomColor = 'var(--secondary)';
        });
    }
    
    ex.score = 0;
    ex.locked = false;
    setInputsDisabled(false);

    // Update sidebar and summary
    updateSidebarScore(currentFile);
    updateSummaryPanel();

    // Reset feedback and action button
    const feedbackEl = document.getElementById('feedback');
    feedbackEl.textContent = '';
    feedbackEl.className = '';
    document.getElementById('actionButton').textContent = 'Verify Answer';
}

function triggerConfetti() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#6200ee', '#03dac6', '#ffca28']
    });
}

function triggerBigConfetti() {
    // Burst multiple waves for a bigger, longer celebration
    const colors = ['#6200ee', '#03dac6', '#ffca28', '#ff4081', '#00bcd4'];
    const bursts = [
        { particleCount: 300, spread: 120, startVelocity: 40 },
        { particleCount: 200, spread: 140, startVelocity: 30 },
        { particleCount: 150, spread: 160, startVelocity: 20 }
    ];

    let delay = 0;
    bursts.forEach(b => {
        setTimeout(() => {
            confetti(Object.assign({}, b, { origin: { y: 0.6 }, colors }));
        }, delay);
        delay += 500; // space the bursts
    });
}
function exportProgress() {
    let csv = "Student,Exercise,Score\n";
    for (const file in exerciseData) {
        const ex = exerciseData[file];
        const label = (ex.label || file).replace(/"/g, '""');
        csv += `${currentUser},"${label}",${ex.score || 0}/${ex.answers.length}\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentUser}_results.csv`;
    a.click();
}

// --- SETTINGS AND MODE MANAGEMENT ---
function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
    document.getElementById('settingsOverlay').style.display = 'block';
    
    // Set current settings in the modal
    document.querySelector(`input[name="mode"][value="${appSettings.mode}"]`).checked = true;
    document.getElementById('timerInput').value = appSettings.timerMinutes;

    const autoShowToggle = document.getElementById('autoShowSampleToggle');
    if (autoShowToggle) {
        autoShowToggle.checked = appSettings.autoShowSample;
    }
    
    // Show/hide timer section based on mode
    const timerSection = document.getElementById('timerSection');
    if (appSettings.mode === 'exam') {
        timerSection.style.display = 'block';
    } else {
        timerSection.style.display = 'none';
    }
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
    document.getElementById('settingsOverlay').style.display = 'none';
}

function handleModeChange() {
    const selectedMode = document.querySelector('input[name="mode"]:checked').value;
    const timerSection = document.getElementById('timerSection');
    
    if (selectedMode === 'exam') {
        timerSection.style.display = 'block';
    } else {
        timerSection.style.display = 'none';
    }
}

function validateTimerInput(input) {
    let value = parseInt(input.value, 10);
    
    if (isNaN(value)) {
        input.classList.add('invalid');
        return false;
    }
    
    if (value < 1) {
        input.value = '1';
        input.classList.remove('invalid');
    } else if (value > 999) {
        input.value = '999';
        input.classList.remove('invalid');
    } else {
        input.classList.remove('invalid');
    }
    
    return true;
}

function saveSettings() {
    const selectedMode = document.querySelector('input[name="mode"]:checked').value;
    const timerInput = document.getElementById('timerInput');
    const timerValue = parseInt(timerInput.value, 10);
    
    // Validate timer input
    if (selectedMode === 'exam') {
        if (isNaN(timerValue) || timerValue < 1 || timerValue > 999) {
            alert('Please enter a valid timer value between 1 and 999 minutes.');
            return;
        }
        appSettings.timerMinutes = timerValue;
    }
    
    appSettings.mode = selectedMode;

    const autoShowToggle = document.getElementById('autoShowSampleToggle');
    if (autoShowToggle) {
        appSettings.autoShowSample = autoShowToggle.checked;
    }

    closeSettingsModal();

    // Re-apply the (possibly just-changed) auto-show preference to
    // whatever exercise is currently open, so the console panel reacts
    // immediately rather than waiting for the next exercise switch.
    applyAutoShowForCurrentExercise();
    
    // Show toast notification
    showNotification(`Settings saved! Mode: ${selectedMode === 'exam' ? 'Exam (' + timerValue + ' min)' : 'Practice'}`);
}

function showNotification(message) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: var(--primary);
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        z-index: 2001;
        animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// --- EXAM SESSION PERSISTENCE (keyed by student email) ---
// Exam mode only: keeps each student's in-progress or completed exam
// (locked/unlocked state, score, and line order per exercise, plus the
// real timer deadline) in localStorage so a page reload, browser crash,
// or accidental tab close doesn't cost them their progress or hand them
// a brand-new full-length timer. Practice mode is intentionally not
// persisted — there's nothing at stake in a reset there.
function getExamStorageKey(email) {
    return `examSession_${email}`;
}

function saveExamSession() {
    if (appSettings.mode !== 'exam' || !currentUser) return;

    const exercises = {};
    for (const file in exerciseData) {
        const ex = exerciseData[file];
        exercises[file] = {
            locked: !!ex.locked,
            score: ex.score || 0,
            isPartial: !!ex.isPartial,
            userOrder: ex.isLineOrdering ? (ex.userOrder || []) : undefined,
            userAnswer: ex.isConversionQuestion ? (ex.userAnswer || '') : undefined
        };
    }

    const isTimeUp = typeof examEndTimestamp === 'number' && Date.now() >= examEndTimestamp;

    const session = {
        timerMinutes: appSettings.timerMinutes,
        examEndTimestamp: examEndTimestamp,
        completed: checkIfAllAnswered() || isTimeUp,
        exercises,
        savedAt: Date.now()
    };

    try {
        localStorage.setItem(getExamStorageKey(currentUser), JSON.stringify(session));
    } catch (e) {
        console.warn('Could not save exam session progress:', e);
    }
}

function loadExamSession(email) {
    try {
        const raw = localStorage.getItem(getExamStorageKey(email));
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        console.warn('Could not load exam session progress:', e);
        return null;
    }
}

// Timer Management
// resumeSeconds, when provided, resumes a persisted exam session at the
// real remaining time (e.g. after a page reload) instead of granting a
// fresh full-length timer.
function startTimer(resumeSeconds) {
    if (appSettings.mode !== 'exam') {
        return;
    }

    if (typeof resumeSeconds === 'number' && resumeSeconds >= 0) {
        timeRemaining = resumeSeconds;
        examEndTimestamp = Date.now() + timeRemaining * 1000;
    } else {
        timeRemaining = appSettings.timerMinutes * 60; // Convert to seconds
        examEndTimestamp = Date.now() + timeRemaining * 1000;
    }

    const timerContainer = document.getElementById('timerContainer');
    timerContainer.style.display = 'flex';

    updateTimerDisplay();
    saveExamSession(); // persist the deadline right away, before any answers are checked

    let tickCount = 0;
    timerIntervalId = setInterval(() => {
        // Recompute from the fixed deadline each tick (rather than just
        // decrementing) so setInterval drift can't desync the displayed
        // time — or a persisted deadline — from the real cutoff.
        timeRemaining = Math.max(0, Math.round((examEndTimestamp - Date.now()) / 1000));
        updateTimerDisplay();

        // Throttle persistence to avoid writing to storage every second.
        tickCount++;
        if (tickCount % 5 === 0) {
            saveExamSession();
        }

        if (timeRemaining <= 0) {
            clearInterval(timerIntervalId);
            handleTimerExpired();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('timerDisplay').textContent = display;
    
    const timerDisplay = document.getElementById('timerDisplay');
    timerDisplay.classList.remove('warning', 'critical');
    
    if (timeRemaining <= 60) {
        timerDisplay.classList.add('critical');
    } else if (timeRemaining <= 300) {
        timerDisplay.classList.add('warning');
    }
}

function stopTimer() {
    if (timerIntervalId) {
        clearInterval(timerIntervalId);
        timerIntervalId = null;
    }
    const timerContainer = document.getElementById('timerContainer');
    timerContainer.style.display = 'none';
}

function handleTimerExpired() {
    stopTimer();
    
    // Lock all exercises
    for (const file in exerciseData) {
        if (!exerciseData[file].locked) {
            exerciseData[file].locked = true;
        }
    }
    setInputsDisabled(true);
    document.getElementById('actionButton').disabled = true;

    // Persist the final, fully-locked state for this student.
    saveExamSession();

    // Show score summary modal
    showScoreSummaryModal('Time is up! Your exam session has ended.', 'warning');
}

// --- DRAG AND DROP LINE ORDERING ---
function setupDragAndDrop() {
    const orderingArea = document.getElementById('orderingArea');
    
    if (!orderingArea) return;
    
    // Attach listeners to all draggable lines
    const draggableLines = orderingArea.querySelectorAll('.draggable-line');
    draggableLines.forEach(line => attachDragListeners(line));
    
    // Setup drop zone for the single ordering area
    setupDropZone(orderingArea);
}

function attachDragListeners(element) {
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragend', handleDragEnd);
}

function handleDragStart(e) {
    if (exerciseData[currentFile]?.locked) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    this.classList.add('dragging');
    draggedElement = this;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    // Remove any drop placeholder when dragging ends
    document.querySelectorAll('.drop-placeholder').forEach(p => p.remove());
}

function setupDropZone(zone) {
    if (!zone) return;

    // Create a single placeholder element used during drag to indicate insertion point
    const placeholder = document.createElement('div');
    placeholder.className = 'drop-placeholder';

    zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        zone.classList.add('drag-over');

        // Determine nearest element to insert before based on mouse Y
        const afterElement = getDragAfterElement(zone, e.clientY);

        if (!afterElement) {
            // Append to end
            if (zone.lastElementChild !== placeholder) zone.appendChild(placeholder);
        } else {
            if (afterElement !== placeholder) zone.insertBefore(placeholder, afterElement);
        }
    });

    zone.addEventListener('dragleave', (e) => {
        // If leaving the zone entirely, remove visual hints
        const related = e.relatedTarget;
        if (!related || !zone.contains(related)) {
            zone.classList.remove('drag-over');
            placeholder.remove();
        }
    });

    zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');

        if (exerciseData[currentFile]?.locked || !draggedElement) return;

        // Insert dragged element at placeholder position if present
        const ph = zone.querySelector('.drop-placeholder');
        if (ph) {
            zone.insertBefore(draggedElement, ph);
            ph.remove();
        } else {
            zone.appendChild(draggedElement);
        }
    });
}

// Helper: returns the first element that the dragged item should be placed before
function getDragAfterElement(container, y) {
    const draggableLines = [...container.querySelectorAll('.draggable-line:not(.dragging)')];

    return draggableLines.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > (closest.offset || Number.NEGATIVE_INFINITY)) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element || null;
}

function restoreUserOrder(fileName) {
    const ex = exerciseData[fileName];
    if (!ex.isLineOrdering || ex.userOrder.length === 0) return;
    
    const orderingArea = document.getElementById('orderingArea');
    if (!orderingArea) return;
    
    // Reorder lines based on saved userOrder
    ex.userOrder.forEach(origIdx => {
        const draggableEl = orderingArea.querySelector(`[data-original-idx="${origIdx}"]`);
        if (draggableEl) {
            orderingArea.appendChild(draggableEl);
        }
    });
}

let draggedElement = null;

// --- UP/DOWN BUTTONS (touch-friendly alternative to drag-and-drop) ---
function setupUpDownButtons() {
    const orderingArea = document.getElementById('orderingArea');
    if (!orderingArea) return;

    const draggableLines = orderingArea.querySelectorAll('.draggable-line');

    draggableLines.forEach(lineEl => {
        const upBtn = lineEl.querySelector('.move-up-btn');
        const downBtn = lineEl.querySelector('.move-down-btn');
        if (!upBtn || !downBtn) return;

        // Avoid stacking duplicate listeners if this is called more than once
        upBtn.replaceWith(upBtn.cloneNode(true));
        downBtn.replaceWith(downBtn.cloneNode(true));
    });

    // Re-query after cloning, then attach fresh listeners
    orderingArea.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLineByOffset(btn.closest('.draggable-line'), -1);
        });
    });
    orderingArea.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveLineByOffset(btn.closest('.draggable-line'), 1);
        });
    });

    refreshUpDownButtonStates();
}

function moveLineByOffset(lineEl, offset) {
    if (!lineEl || exerciseData[currentFile]?.locked) return;

    const orderingArea = document.getElementById('orderingArea');
    const allLines = Array.from(orderingArea.querySelectorAll('.draggable-line'));
    const currentIdx = allLines.indexOf(lineEl);
    const targetIdx = currentIdx + offset;

    if (targetIdx < 0 || targetIdx >= allLines.length) return; // out of bounds

    const targetEl = allLines[targetIdx];

    // Capture each affected row's position before the DOM move (FLIP: First)
    const movedFirstRect = lineEl.getBoundingClientRect();
    const targetFirstRect = targetEl.getBoundingClientRect();

    if (offset < 0) {
        orderingArea.insertBefore(lineEl, allLines[targetIdx]);
    } else {
        orderingArea.insertBefore(lineEl, targetEl.nextSibling);
    }

    // Animate both the moved row and the row it displaced sliding into place
    animateRowSwap(lineEl, movedFirstRect);
    animateRowSwap(targetEl, targetFirstRect);

    refreshUpDownButtonStates();
}

// Slides an element from its previous position (firstRect) to wherever it
// now sits in the DOM (Last), using the FLIP technique: Invert the visual
// position with a transform, then Play by transitioning that transform away.
function animateRowSwap(el, firstRect) {
    const lastRect = el.getBoundingClientRect();
    const deltaY = firstRect.top - lastRect.top;

    if (!deltaY) return; // already in place, nothing to animate

    el.style.transition = 'none';
    el.style.transform = `translateY(${deltaY}px)`;
    el.style.zIndex = '5';
    el.classList.add('swapping');

    // Wait a frame so the browser paints the inverted position before we
    // transition it away, otherwise the transform jump itself would animate.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            el.style.transition = 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)';
            el.style.transform = '';
        });
    });

    const cleanup = () => {
        el.style.transition = '';
        el.style.zIndex = '';
        el.classList.remove('swapping');
        el.removeEventListener('transitionend', cleanup);
    };
    el.addEventListener('transitionend', cleanup);
}

// Disable Up on the first line and Down on the last line.
// forceLocked lets callers (like setInputsDisabled) specify the lock state
// directly, since ex.locked isn't always updated yet at call time.
function refreshUpDownButtonStates(forceLocked) {
    const orderingArea = document.getElementById('orderingArea');
    if (!orderingArea) return;

    const allLines = Array.from(orderingArea.querySelectorAll('.draggable-line'));
    const locked = forceLocked !== undefined ? forceLocked : exerciseData[currentFile]?.locked;

    allLines.forEach((lineEl, idx) => {
        const upBtn = lineEl.querySelector('.move-up-btn');
        const downBtn = lineEl.querySelector('.move-down-btn');
        if (upBtn) upBtn.disabled = locked || idx === 0;
        if (downBtn) downBtn.disabled = locked || idx === allLines.length - 1;
    });
}

// --- JUMP-TO POSITIONING UI ---
function setupJumpToUI(fileName) {
    const orderingArea = document.getElementById('orderingArea');
    if (!orderingArea) return;

    const draggableLines = orderingArea.querySelectorAll('.draggable-line');
    const totalLines = draggableLines.length;

    draggableLines.forEach(draggableEl => {
        // Remove old dropdown if exists
        const oldDropdown = draggableEl.querySelector('.jump-to-container');
        if (oldDropdown) oldDropdown.remove();

        // Create jump-to dropdown container
        const jumpToDiv = document.createElement('div');
        jumpToDiv.className = 'jump-to-container';
        
        // Build options for all available line positions
        let optionsHtml = '<option value="">Jump to →</option>';
        for (let i = 1; i <= totalLines; i++) {
            optionsHtml += `<option value="${i - 1}">Line ${i}</option>`;
        }
        
        jumpToDiv.innerHTML = `<select class="jump-to-select">${optionsHtml}</select>`;
        
        // Add change handler
        jumpToDiv.querySelector('.jump-to-select').addEventListener('change', (e) => {
            if (e.target.value === '') return;
            const targetIdx = parseInt(e.target.value);
            moveLineToPosition(orderingArea, draggableEl, targetIdx);
            e.target.value = ''; // Reset dropdown
        });

        draggableEl.appendChild(jumpToDiv);
    });
}

function moveLineToPosition(container, draggableElement, targetIdx) {
    if (exerciseData[currentFile]?.locked) return;

    const allDraggableLines = Array.from(container.querySelectorAll('.draggable-line'));
    const currentIdx = allDraggableLines.indexOf(draggableElement);

    if (currentIdx === targetIdx) return; // Already at target

    // Remove from current position
    container.removeChild(draggableElement);

    // Insert at target position
    if (targetIdx >= allDraggableLines.length - 1) {
        container.appendChild(draggableElement);
    } else {
        const targetElement = allDraggableLines[targetIdx];
        container.insertBefore(draggableElement, targetElement);
    }

    refreshUpDownButtonStates();
}

// --- ALERT AND SCORE SUMMARY MODALS ---
function showAlertModal(title, message) {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    document.getElementById('alertModal').style.display = 'block';
    document.getElementById('alertOverlay').style.display = 'block';
}

function closeAlertModal() {
    document.getElementById('alertModal').style.display = 'none';
    document.getElementById('alertOverlay').style.display = 'none';
}

// --- SAMPLE OUTPUT CONSOLE PANEL (slides in from the right) ---
function showSampleOutput(fileName) {
    const ex = exerciseData[fileName];
    const panel = document.getElementById('sampleOutputPanel');
    const overlay = document.getElementById('sampleOutputOverlay');
    const content = document.getElementById('sampleOutputContent');
    if (!ex || !panel || !overlay || !content) return;

    content.textContent = ex.sampleOutput && ex.sampleOutput.length ? ex.sampleOutput : 'No sample output available.';

    overlay.style.display = 'block';
    panel.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    updateConsoleDrawerTab(true);
    // Force the transform to its initial state before adding .open so the
    // slide-in transition actually plays (rather than snapping into place)
    // even if the panel was just re-shown right after being closed.
    requestAnimationFrame(() => {
        panel.classList.add('open');
    });
}

function closeSampleOutputModal() {
    const panel = document.getElementById('sampleOutputPanel');
    const overlay = document.getElementById('sampleOutputOverlay');
    if (!panel) return;

    const wasOpen = panel.classList.contains('open');
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    updateConsoleDrawerTab(false);

    if (overlay) {
        overlay.setAttribute('aria-hidden', 'true');
        if (wasOpen) {
            // Wait for the slide-out transition to finish before hiding the
            // overlay, otherwise it disappears abruptly mid-animation.
            const onTransitionEnd = () => {
                overlay.style.display = 'none';
                panel.removeEventListener('transitionend', onTransitionEnd);
            };
            panel.addEventListener('transitionend', onTransitionEnd);
        } else {
            // Nothing was actually open, so there's no transition to wait
            // for — hide the overlay immediately instead of leaving a
            // transitionend listener that would never fire.
            overlay.style.display = 'none';
        }
    }
}

// --- CONSOLE DRAWER TAB ---
// A per-activity handle, always available (when the current exercise has
// sample output) for pulling the console into view by hand, independent of
// the global auto-show setting.
function toggleConsolePanel() {
    const panel = document.getElementById('sampleOutputPanel');
    if (!panel || !currentFile) return;
    if (panel.classList.contains('open')) {
        closeSampleOutputModal();
    } else {
        showSampleOutput(currentFile);
    }
}

function updateConsoleDrawerTab(forceOpen) {
    const tab = document.getElementById('consoleDrawerTab');
    const panel = document.getElementById('sampleOutputPanel');
    if (!tab || !panel) return;

    const ex = exerciseData[currentFile];
    const hasSampleOutput = !!(ex && ex.sampleOutput && ex.sampleOutput.trim().length > 0);
    const isOpen = forceOpen !== undefined ? forceOpen : panel.classList.contains('open');

    tab.style.display = (hasSampleOutput && !isOpen) ? 'flex' : 'none';
    tab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function getCleanSourceUrl() {
    // Full source URL — host and path — with the query string/hash AND
    // the protocol stripped off. The protocol isn't needed: results.html
    // already strips "https://" before displaying it, and every "/" or
    // ":" left in a URL param gets percent-encoded to 3 characters
    // (e.g. "/" -> "%2F"), which is the single biggest thing bloating
    // the QR's data length. Dropping "https://" alone removes 8 raw
    // characters (and avoids encoding its ":" and "//").
    return window.location.href.split(/[?#]/)[0].replace(/^https?:\/\//i, '');
}

function getActivityName() {
    // The web app's own page title, used as the "activity name" field.
    return document.title;
}

// --- QR PAYLOAD ENCRYPTION ---
// Runs entirely in the browser, so this passphrase is visible to anyone
// who reads this file — it is NOT a security boundary. It only keeps the
// score/email/timestamp out of the *plain* QR payload/URL so a casual
// scan or glance at the address bar doesn't show readable data. This
// passphrase MUST exactly match the one in results.html.
const QR_SHARED_PASSPHRASE = 'AA-9002341ds2sd14-dsfs12sd-54231hg';
const QR_SALT_STRING = 'java-activity-qr-salt-v1';

async function deriveQrKey() {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(QR_SHARED_PASSPHRASE),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: enc.encode(QR_SALT_STRING),
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function bufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function encryptQrPayload(dataObj) {
    const key = await deriveQrKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const plaintext = enc.encode(JSON.stringify(dataObj));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

    // Pack iv + ciphertext into a single token so results.html only needs
    // one query parameter to decrypt.
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return bufferToBase64Url(combined);
}

async function buildResultsShareUrl(rawScore, maxScore) {
    // Keep the ENCRYPTED payload as short as possible: short keys only,
    // no domain name inside it (see note below on why the domain travels
    // separately). A shorter encrypted payload lets the QR library pick
    // a lower "version," meaning fewer total modules (squares) — each
    // one rendered bigger and easier for a phone camera to resolve.
    const payload = {
        e: currentUser,
        t: Math.floor(Date.now() / 1000), // unix seconds, shorter than ISO string
        s: rawScore,
        m: maxScore
    };

    const token = await encryptQrPayload(payload);
    const url = new URL('https://mratamayo-tsatinc.github.io/qr/it5b-w4.html');
    url.searchParams.set('d', token);
    url.searchParams.set('a', getCleanSourceUrl());
    url.searchParams.set('n', getActivityName());
    return url.toString();
}

function renderResultsQrCode(shareUrl) {
    // Bigger box for the same module count = each square renders larger
    // and more visible, on top of the data-shrinking above.
    renderQrInto('qrCodeBox', shareUrl, 260);
    renderQrInto('sidebarQrCodeBox', shareUrl, 170);
}

function renderQrInto(boxId, shareUrl, size) {
    const box = document.getElementById(boxId);
    if (!box || typeof QRCode === 'undefined') return;
    box.innerHTML = ''; // clear any previously rendered code first
    new QRCode(box, {
        text: shareUrl,
        width: size,
        height: size,
        colorDark: '#1a1a1a',
        colorLight: '#ffffff',
        // L = lowest error correction (~7% recoverable). Combined with a
        // short payload, this keeps the QR at a low "version" — fewer
        // total modules (squares), each rendered bigger at the same box
        // size, which is what actually makes a phone camera able to
        // resolve it. (More error correction sounds safer but backfires:
        // it adds redundancy bytes, which forces MORE modules for the
        // same data, making each one smaller.)
        correctLevel: QRCode.CorrectLevel.L
    });
}

function calculateTotalScore() {
    let totalGot = 0;
    let totalPossible = 0;
    for (const file in exerciseData) {
        const ex = exerciseData[file];
        totalGot += Number(ex.score || 0);
        totalPossible += ex.answers.length;
    }
    return { got: totalGot, possible: totalPossible };
}

async function showScoreSummaryModal(completionMessage, messageType = 'success') {
    const { got, possible } = calculateTotalScore();
    
    document.getElementById('finalScore').textContent = got;
    document.getElementById('maxScore').textContent = possible;
    document.getElementById('summaryEmail').textContent = currentUser;
    
    const messageElement = document.getElementById('completionMessage');
    messageElement.textContent = completionMessage;
    messageElement.className = `completion-message ${messageType}`;

    const shareUrl = await buildResultsShareUrl(got, possible);
    renderResultsQrCode(shareUrl);
    
    document.getElementById('scoreSummaryModal').style.display = 'block';
    document.getElementById('scoreSummaryOverlay').style.display = 'block';
}

function closeSummaryModal() {
    document.getElementById('scoreSummaryModal').style.display = 'none';
    document.getElementById('scoreSummaryOverlay').style.display = 'none';
}

// Check if all exercises have been answered
function checkIfAllAnswered() {
    for (const file in exerciseData) {
        const ex = exerciseData[file];
        if (!ex.locked || ex.score === 0) {
            return false;
        }
    }
    return true;
}
