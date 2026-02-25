import * as THREE from 'three';
import * as earthView from './views/earth.js';
import * as stationView from './views/station.js';
import * as station2View from './views/station2.js';
import * as solarView from './views/solar.js';
import * as trappistView from './views/trappist.js';
import * as cancriView from './views/cancri.js';
import * as hr8799View from './views/hr8799.js';
import * as kepler16View from './views/kepler16.js';
import * as blackholeV1View from './views/blackhole-v1.js';
import * as blackholeV2View from './views/blackhole.js';
import * as cataclysmicView from './views/cataclysmic.js';
import * as station3View from './views/station3.js';
import * as station4View from './views/station4.js';
import * as lichView from './views/lich.js';
import * as wasp121View from './views/wasp121.js';
import * as proximaView from './views/proxima.js';
import * as pulsarView from './views/pulsar.js';
import { sim } from './sim.js';
import { OBJECT_DATA } from './data.js';

const views = { earth: earthView, station: stationView, station2: station2View, station3: station3View, station4: station4View, solar: solarView, trappist: trappistView, cancri: cancriView, hr8799: hr8799View, kepler16: kepler16View, lich: lichView, wasp121: wasp121View, proxima: proximaView, blackholeV1: blackholeV1View, blackholeV2: blackholeV2View, cataclysmic: cataclysmicView, pulsar: pulsarView };
let activeView = null;
let active = false;
let _renderer = null;

// ── Draggable panels ──
function makeDraggable(panel, handle) {
  let dragging = false;
  let startX, startY, startDragX, startDragY;

  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startDragX = parseFloat(panel.style.getPropertyValue('--drag-x')) || 0;
    startDragY = parseFloat(panel.style.getPropertyValue('--drag-y')) || 0;
    handle.style.cursor = 'grabbing';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    let dx = startDragX + (e.clientX - startX);
    let dy = startDragY + (e.clientY - startY);

    // Clamp so panel stays mostly on-screen
    const rect = panel.getBoundingClientRect();
    const minVisible = 60;
    if (rect.left + (dx - startDragX) < -rect.width + minVisible) dx = -rect.width + minVisible - rect.left + startDragX;
    if (rect.right + (dx - startDragX) > window.innerWidth + rect.width - minVisible) dx = window.innerWidth + rect.width - minVisible - rect.right + startDragX;
    if (rect.top + (dy - startDragY) < 0) dy = -rect.top + startDragY;
    if (rect.bottom + (dy - startDragY) > window.innerHeight) dy = window.innerHeight - rect.bottom + startDragY;

    panel.style.setProperty('--drag-x', dx + 'px');
    panel.style.setProperty('--drag-y', dy + 'px');
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    handle.style.cursor = 'grab';
  });
}

// ── Tooltip ──
const tooltip = document.getElementById('tooltip');
const tooltipName = document.getElementById('tooltip-name');
const tooltipStats = document.getElementById('tooltip-stats');

function showTooltip(name, x, y) {
  const data = OBJECT_DATA[name];
  tooltipName.textContent = name;
  if (data && data.tooltip) {
    tooltipStats.innerHTML = data.tooltip.map((row) =>
      `<div class="tooltip-row">
        <span class="tooltip-label">${row.label}</span>
        <span class="tooltip-value">${row.value}</span>
      </div>`
    ).join('');
  } else {
    tooltipStats.innerHTML = '';
  }
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('visible');
}

function hideTooltip() {
  tooltip.classList.remove('visible');
}

// ── Focus panel ──
const focusPanel = document.getElementById('focus-panel');
const focusPanelName = document.getElementById('focus-panel-name');
const focusPanelType = document.getElementById('focus-panel-type');
const focusPanelRows = document.getElementById('focus-panel-rows');

function showFocusPanel(name) {
  const data = OBJECT_DATA[name];
  focusPanelName.textContent = name;
  focusPanelType.textContent = data ? data.type : '';
  if (data && data.details) {
    focusPanelRows.innerHTML = data.details.map((row) =>
      `<div class="panel-row">
        <span class="panel-label">${row.label}</span>
        <div class="panel-divider"></div>
        <span class="panel-value">${row.value}</span>
      </div>`
    ).join('');
  } else {
    focusPanelRows.innerHTML = '';
  }
  focusPanel.classList.add('visible');

  // Sync primary legend highlights
  const parentName = moonParentMap[name]; // defined only if name is a moon
  legendList.querySelectorAll('.legend-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.name === name || el.dataset.name === parentName);
  });

  // Open the relevant moon drawer, close all others
  const drawerKey = parentName || name;
  legendList.querySelectorAll('.moon-drawer').forEach((drawer) => {
    drawer.classList.toggle('open', drawer.id === `moon-drawer-${drawerKey}`);
  });

  // Highlight active moon inside the drawer
  legendList.querySelectorAll('.moon-item').forEach((el) => {
    el.classList.toggle('active', el.dataset.name === name);
  });
}

function hideFocusPanel() {
  focusPanel.classList.remove('visible');
  legendList.querySelectorAll('.legend-item').forEach((el) => el.classList.remove('active'));
  legendList.querySelectorAll('.moon-drawer').forEach((d) => d.classList.remove('open'));
  legendList.querySelectorAll('.moon-item').forEach((el) => el.classList.remove('active'));
}

document.getElementById('focus-panel-close').addEventListener('click', hideFocusPanel);
makeDraggable(focusPanel, document.getElementById('focus-panel-header'));

// ── Legend ──
const legendList = document.getElementById('legend-list');
let moonParentMap = {}; // moonName → parentPlanetName

function populateLegend() {
  legendList.innerHTML = '';
  moonParentMap = {};

  const objects = activeView.getObjects();
  const primaries = objects.filter((o) => !o.parent);
  const moonsByParent = {};
  objects.filter((o) => o.parent).forEach((o) => {
    moonParentMap[o.name] = o.parent;
    if (!moonsByParent[o.parent]) moonsByParent[o.parent] = [];
    moonsByParent[o.parent].push(o);
  });

  primaries.forEach(({ name, mesh }) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.dataset.name = name;
    item.innerHTML = `<span class="legend-dot"></span><span class="legend-name">${name}</span>`;
    item.addEventListener('click', () => activeView.focusOn(mesh));
    legendList.appendChild(item);

    if (moonsByParent[name]) {
      const drawer = document.createElement('div');
      drawer.className = 'moon-drawer';
      drawer.id = `moon-drawer-${name}`;
      moonsByParent[name].forEach(({ name: moonName, mesh: moonMesh }) => {
        const mi = document.createElement('div');
        mi.className = 'moon-item';
        mi.dataset.name = moonName;
        mi.innerHTML = `<span class="moon-dot"></span><span class="moon-name">${moonName}</span>`;
        mi.addEventListener('click', (e) => { e.stopPropagation(); activeView.focusOn(moonMesh); });
        drawer.appendChild(mi);
      });
      legendList.appendChild(drawer);
    }
  });
}

// ── Flythrough button ──
const flythroughBtn = document.getElementById('flythrough-btn');
const flythroughLabel = document.getElementById('flythrough-label');
const flythroughLabels = { solar: 'Flythrough', blackholeV2: 'Descent' };
let currentFlythroughLabel = 'Flythrough';

function resetFlythroughBtn() {
  flythroughBtn.classList.remove('active');
  flythroughLabel.textContent = currentFlythroughLabel;
}

flythroughBtn.addEventListener('click', () => {
  if (!activeView || !activeView.startFlythrough) return;
  if (activeView.isFlythroughActive()) {
    activeView.cancelFlythrough();
    resetFlythroughBtn();
  } else {
    hideFocusPanel();
    activeView.startFlythrough(resetFlythroughBtn);
    flythroughBtn.classList.add('active');
    flythroughLabel.textContent = 'Stop';
  }
});

window.addEventListener('keydown', (e) => {
  if (!active) return;
  if (e.key === 'Escape' && activeView?.isFlythroughActive?.()) {
    activeView.cancelFlythrough();
    resetFlythroughBtn();
  }
});

// ── Mission Planner ──
const mpBtn = document.getElementById('mission-planner-btn');
const mpPanel = document.getElementById('mission-planner');
const mpClose = document.getElementById('mission-planner-close');
const mpOrigin = document.getElementById('mp-origin');
const mpDest = document.getElementById('mp-dest');
const mpSwap = document.getElementById('mp-swap');
const mpResults = document.getElementById('mp-results');
const mpLaunch = document.getElementById('mp-launch');
const mpCancel = document.getElementById('mp-cancel');
const mpTransferTime = document.getElementById('mp-transfer-time');
const mpDvDepart = document.getElementById('mp-dv-depart');
const mpDvArrive = document.getElementById('mp-dv-arrive');
const mpDvTotal = document.getElementById('mp-dv-total');
const mpPhase = document.getElementById('mp-phase');
const mpWindow = document.getElementById('mp-window');
const mpWindowFill = document.getElementById('mp-window-fill');
const mpWindowStatus = document.getElementById('mp-window-status');
const mpTransitInfo = document.getElementById('mp-transit-info');
const mpTransitProgress = document.getElementById('mp-transit-progress');
const mpWarp = document.getElementById('mp-warp');

let mpOpen = false;
let mpLastTransfer = null;
let warpAnim = null;

function toggleMissionPlanner() {
  mpOpen = !mpOpen;
  if (mpOpen) {
    mpPanel.classList.remove('hidden');
    // Force reflow before adding visible class for transition
    mpPanel.offsetHeight; // eslint-disable-line no-unused-expressions
    mpPanel.classList.add('visible');
    mpBtn.classList.add('active');
    mpComputeTransfer();
  } else {
    mpPanel.classList.remove('visible');
    mpBtn.classList.remove('active');
    const mp = activeView?.getMissionPlanner?.();
    if (mp) mp.cancel();
    mpResetUI();
    setTimeout(() => { if (!mpOpen) mpPanel.classList.add('hidden'); }, 400);
  }
}

function mpResetUI() {
  mpResults.classList.add('hidden');
  mpLaunch.disabled = true;
  mpLaunch.style.display = '';
  mpCancel.style.display = 'none';
  mpWarp.style.display = 'none';
  mpTransitInfo.style.display = 'none';
  mpLastTransfer = null;
  warpAnim = null;
}

function mpComputeTransfer() {
  const mp = activeView?.getMissionPlanner?.();
  const planets = activeView?.getPlanets?.();
  if (!mp || !planets) return;

  const origin = mpOrigin.value;
  const dest = mpDest.value;
  if (origin === dest) {
    mpResetUI();
    return;
  }

  const transfer = mp.compute(origin, dest, planets);
  if (!transfer) { mpResetUI(); return; }

  mpLastTransfer = transfer;
  mpResults.classList.remove('hidden');

  // Populate static stats
  mpTransferTime.textContent = mp.formatDays(transfer.transferDays);
  mpDvDepart.textContent = transfer.dvDep.toFixed(2) + ' km/s';
  mpDvArrive.textContent = transfer.dvArr.toFixed(2) + ' km/s';
  mpDvTotal.textContent = transfer.dvTotal.toFixed(2) + ' km/s';
  mpPhase.textContent = (transfer.phiRequired * 180 / Math.PI).toFixed(1) + '°';
  mpWindow.textContent = mp.formatDays(transfer.windowDays);

  mpLaunch.style.display = '';
  mpCancel.style.display = 'none';
  mpTransitInfo.style.display = 'none';
}

mpBtn.addEventListener('click', toggleMissionPlanner);
mpClose.addEventListener('click', () => { if (mpOpen) toggleMissionPlanner(); });
makeDraggable(mpPanel, document.getElementById('mp-header'));

mpOrigin.addEventListener('change', mpComputeTransfer);
mpDest.addEventListener('change', mpComputeTransfer);
mpSwap.addEventListener('click', () => {
  const tmp = mpOrigin.value;
  mpOrigin.value = mpDest.value;
  mpDest.value = tmp;
  mpComputeTransfer();
});

mpLaunch.addEventListener('click', () => {
  const mp = activeView?.getMissionPlanner?.();
  const planets = activeView?.getPlanets?.();
  if (!mp || !planets) return;
  mp.launch(planets);
  mpLaunch.style.display = 'none';
  mpWarp.style.display = 'none';
  mpCancel.style.display = '';
  mpTransitInfo.style.display = '';
});

mpCancel.addEventListener('click', () => {
  const mp = activeView?.getMissionPlanner?.();
  if (mp) mp.cancel();
  mpLaunch.style.display = '';
  mpCancel.style.display = 'none';
  mpWarp.style.display = 'none';
  mpTransitInfo.style.display = 'none';
  warpAnim = null;
  mpComputeTransfer(); // recompute to show planned arc again
});

mpWarp.addEventListener('click', () => {
  if (warpAnim) return;
  if (!mpLastTransfer || !activeView?.getPlanets || !activeView?.advanceTime) return;

  warpAnim = {
    startTime: performance.now(),
    duration: 1500,
    originName: mpLastTransfer.origin.name,
    destName: mpLastTransfer.dest.name,
    phiRequired: mpLastTransfer.phiRequired,
    w1: mpLastTransfer.w1,
    w2: mpLastTransfer.w2,
  };
  mpWarp.disabled = true;
});

// ── View switching ──
function switchView(name) {
  if (activeView) activeView.dispose();
  focusPanel.classList.remove('visible');
  hideTooltip();
  activeView = views[name];
  activeView.setCallbacks(showTooltip, hideTooltip, showFocusPanel);
  activeView.init(_renderer);
  populateLegend();

  document.querySelectorAll('#space-app #nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === name);
  });

  // Flythrough button — only for views that support it
  const supportsFlythroughViews = ['solar'];
  if (supportsFlythroughViews.includes(name)) {
    currentFlythroughLabel = flythroughLabels[name] || 'Flythrough';
    flythroughBtn.classList.remove('hidden');
  } else {
    flythroughBtn.classList.add('hidden');
  }
  resetFlythroughBtn();

  // Mission planner button — only for solar view
  if (name === 'solar') {
    mpBtn.classList.remove('hidden');
  } else {
    mpBtn.classList.add('hidden');
    if (mpOpen) toggleMissionPlanner();
  }

  // Quality slider — only for views that support it
  const supportsQuality = ['blackholeV2'];
  if (supportsQuality.includes(name)) {
    qualityControl.classList.remove('hidden');
  } else {
    qualityControl.classList.add('hidden');
  }

  // View description
  viewDescriptionText.textContent = viewDescriptions[name] || '';

  // System title bar data
  const meta = viewMeta[name];
  if (meta) {
    spSys.textContent = meta.sys;
    spClass.textContent = meta.cls;
    spDist.textContent = meta.dist;
  }
}

// Nav buttons
document.querySelectorAll('#space-app #nav button').forEach((btn) => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// Speed controller
const speedSlider = document.getElementById('speed-slider');
const speedLabel = document.getElementById('speed-label');
speedSlider.addEventListener('input', () => {
  // Exponential mapping: slider 0–100 → timeScale 0–5x, with 1x at 50
  const raw = parseFloat(speedSlider.value);
  sim.timeScale = Math.pow(5, (raw - 50) / 50);
  speedLabel.textContent = sim.timeScale.toFixed(2) + 'x';
});

// Quality slider (black hole views)
const qualityControl = document.getElementById('quality-control');
const qualitySlider = document.getElementById('quality-slider');
const qualityLabel = document.getElementById('quality-label');
qualitySlider.addEventListener('input', () => {
  const val = parseInt(qualitySlider.value, 10);
  qualityLabel.textContent = val + '%';
  if (activeView && activeView.setQuality) {
    activeView.setQuality(val / 250);
  }
});

// System title bar data (SYS / CLASS / DIST)
const spSys = document.getElementById('sp-sys');
const spClass = document.getElementById('sp-class');
const spDist = document.getElementById('sp-dist');
const viewMeta = {
  earth:        { sys: 'Sol',         cls: 'G2V',          dist: '---' },
  solar:        { sys: 'Sol',         cls: 'G2V',          dist: '---' },
  station:      { sys: 'Sol / LEO',   cls: 'Station',      dist: '---' },
  station2:     { sys: 'Sol / LEO',   cls: 'Station',      dist: '---' },
  station3:     { sys: 'Sol / LEO',   cls: 'Station',      dist: '---' },
  station4:     { sys: 'Sol / LEO',   cls: 'Station',      dist: '---' },
  trappist:     { sys: 'TRAPPIST-1',  cls: 'M8V',          dist: '40.7 ly' },
  cancri:       { sys: '55 Cancri',   cls: 'G8V',          dist: '40.9 ly' },
  hr8799:       { sys: 'HR 8799',     cls: 'A5V',          dist: '129 ly' },
  kepler16:     { sys: 'Kepler-16',   cls: 'K+M Binary',   dist: '245 ly' },
  lich:         { sys: 'PSR B1257+12', cls: 'Pulsar',      dist: '2,300 ly' },
  wasp121:      { sys: 'WASP-121',    cls: 'F6V',          dist: '270 ly' },
  proxima:      { sys: 'Proxima Cen', cls: 'M5.5Ve',       dist: '4.25 ly' },
  blackholeV1:  { sys: 'Gargantua',   cls: 'Black Hole',   dist: '---' },
  blackholeV2:  { sys: 'Gargantua',   cls: 'Black Hole',   dist: '---' },
  cataclysmic:  { sys: 'T CrB',       cls: 'CV Nova',      dist: '2,630 ly' },
  pulsar:       { sys: 'PSR B0531+21', cls: 'Pulsar',      dist: '6,500 ly' },
};

// View descriptions
const viewDescriptionText = document.getElementById('view-description-text');
const viewDescriptions = {
  earth: 'Real-time model of Earth with day/night cycle, cloud layer, and atmospheric scattering. The Moon orbits at true relative distance. Textures derived from NASA Blue Marble imagery.',
  station: 'A rotating dual-torus station inspired by 2001: A Space Odyssey. Two 274 m rings spin at ~2 RPM to produce 1 g of artificial gravity at the rim, connected by a central hub and radial spokes.',
  station2: 'Modular variant with segmented rings \u2014 each torus is formed from 16 cylindrical habitat modules joined by pressurized collars. Same 274 m diameter and ~1 g rim gravity as Station 1.',
  station3: 'Advanced orbital colony (c. 2230) featuring five counter-rotating ring levels, a central command spire, particle accelerator ring, and agricultural domes. 1,300 m central ring, crew capacity ~10,000.',
  station4: 'Von Braun multi-wheel design with five identical 880 m rings connected to a central hub via 40 enclosed spoke corridors. Crew capacity 2,000\u20135,000.',
  solar: 'The Solar System with all eight planets and their major moons on accurate Keplerian orbits. Includes a mission planner for computing Hohmann transfer windows between any two bodies.',
  trappist: 'TRAPPIST-1 \u2014 an ultra-cool M8V red dwarf 40 light-years away hosting seven rocky planets, three within the habitable zone. Orbital periods and radii based on published discovery data.',
  cancri: '55 Cancri (Copernicus) \u2014 a Sun-like G8V star 41 light-years away with five diverse planets, from the lava world 55 Cnc e to the outer super-Jupiter 55 Cnc d. Planet f sits in the habitable zone.',
  hr8799: 'HR 8799 \u2014 the first multi-planet system ever directly imaged. Four self-luminous super-Jupiters orbit a young A5V star 129 light-years away in a near 1:2:4:8 resonance chain.',
  kepler16: 'Kepler-16 \u2014 the first confirmed circumbinary "Tatooine" system. A Saturn-mass planet orbits a K-type/M-type binary pair every 229 days, with both stars eclipsing each other every 41 days.',
  lich: 'PSR B1257+12 (Lich) \u2014 the first confirmed exoplanet system, discovered in 1992 orbiting a millisecond pulsar. Three dead worlds (Draugr, Poltergeist, Phobetor) circle a rapidly spinning neutron star 2,300 light-years away, swept by rotating radiation beams.',
  wasp121: 'WASP-121 \u2014 an ultra-hot Jupiter so close to its F6V host star that it completes an orbit every 1.27 days. Tidally distorted into an egg shape at 2,500 K, with iron and magnesium gas escaping the atmosphere in a comet-like tail.',
  proxima: 'Proxima Centauri \u2014 the nearest star to the Sun at 4.25 light-years. An M5.5Ve flare star with periodic brightness eruptions. Proxima b orbits in the habitable zone; the system is the primary target for interstellar missions.',
  blackholeV1: 'Ray-marched black hole inspired by Interstellar\'s Gargantua. Rays are integrated through a Schwarzschild metric to produce the shadow, photon ring, and gravitationally lensed accretion disk.',
  blackholeV2: 'Higher-fidelity black hole with adjustable quality. The accretion disk uses Keplerian differential rotation with FBM turbulence for realistic swirling cloud structure. Quality slider controls ray-march precision.',
  cataclysmic: 'T Coronae Borealis \u2014 a recurrent nova system where a red giant overflows its Roche lobe, transferring mass onto a white dwarf via an accretion stream and disk. Expected to erupt again as a naked-eye nova.',
  pulsar: 'Crab Pulsar (PSR B0531+21) \u2014 a rapidly spinning neutron star at the heart of the Crab Nebula, rotating 30 times per second. Its misaligned magnetic field produces sweeping radiation beams visible as radio pulses. The surrounding pulsar wind nebula is powered by the pulsar\u2019s rotational energy.',
};

// ── Exported interface ──

export function init(renderer) {
  _renderer = renderer;
  active = true;
  switchView('earth');
  // Update status label
  document.getElementById('status-view').textContent = 'Earth';
}

export function dispose() {
  active = false;
  if (activeView) {
    activeView.dispose();
    activeView = null;
  }
  hideFocusPanel();
  hideTooltip();
  resetFlythroughBtn();
  if (mpOpen) {
    mpOpen = false;
    mpPanel.classList.remove('visible');
    mpPanel.classList.add('hidden');
    mpBtn.classList.remove('active');
    const mp = views.solar?.getMissionPlanner?.();
    if (mp) mp.cancel();
    mpResetUI();
  }
  warpAnim = null;
}

export function animate() {
  // Warp animation — convergent: recompute gap each frame, advance a fraction
  if (warpAnim && activeView?.advanceTime) {
    const wPlanets = activeView.getPlanets();
    const wOrigin = wPlanets?.find(p => p.name === warpAnim.originName);
    const wDest = wPlanets?.find(p => p.name === warpAnim.destName);

    if (wOrigin && wDest) {
      const phiNow = ((wDest.angle - wOrigin.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      let angleDelta = Math.abs(phiNow - warpAnim.phiRequired);
      if (angleDelta > Math.PI) angleDelta = 2 * Math.PI - angleDelta;

      if (angleDelta < 0.05) {
        // Close enough — window open
        warpAnim = null;
        mpWarp.disabled = false;
      } else {
        const elapsed = performance.now() - warpAnim.startTime;
        const t = Math.min(elapsed / warpAnim.duration, 1);
        const wSynodic = Math.abs(warpAnim.w1 - warpAnim.w2);
        const gap = warpAnim.w1 > warpAnim.w2
          ? ((phiNow - warpAnim.phiRequired) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
          : ((warpAnim.phiRequired - phiNow) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
        const framesRemaining = wSynodic > 0 ? gap / wSynodic : 0;

        if (t >= 1) {
          // Time's up — snap to exact alignment
          if (framesRemaining > 0) activeView.advanceTime(framesRemaining);
          warpAnim = null;
          mpWarp.disabled = false;
        } else {
          // Advance a fraction of remaining gap each frame (exponential convergence)
          const fraction = 0.08 + 0.12 * t;
          if (framesRemaining > 0) activeView.advanceTime(framesRemaining * fraction);
        }
      }
    } else {
      warpAnim = null;
      mpWarp.disabled = false;
    }
  }

  if (activeView) activeView.animate();

  // Update mission planner UI in real time
  if (mpOpen && activeView?.getMissionPlanner) {
    const mp = activeView.getMissionPlanner();
    const planets = activeView.getPlanets();
    if (mp && planets) {
      const phase = mp.getPhase();
      if (phase === 'computed' && mpLastTransfer) {
        const originP = planets.find(p => p.name === mpLastTransfer.origin.name);
        const destP = planets.find(p => p.name === mpLastTransfer.dest.name);
        if (originP && destP) {
          const phiCurrent = ((destP.angle - originP.angle) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
          let delta = Math.abs(phiCurrent - mpLastTransfer.phiRequired);
          if (delta > Math.PI) delta = 2 * Math.PI - delta;
          const isOpen = delta < 0.05;
          const progress = Math.max(0, 1 - delta / Math.PI);

          mpWindowFill.style.width = (progress * 100) + '%';
          mpLaunch.disabled = !isOpen;
          if (isOpen) {
            mpWarp.style.display = 'none';
            mpWindowStatus.textContent = 'Launch window open!';
            mpWindowStatus.classList.add('ready');
          } else {
            mpWarp.style.display = '';
            const wSynodic = Math.abs(mpLastTransfer.w1 - mpLastTransfer.w2);
            const gap = mpLastTransfer.w1 > mpLastTransfer.w2
              ? ((phiCurrent - mpLastTransfer.phiRequired) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI)
              : ((mpLastTransfer.phiRequired - phiCurrent) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
            const framesToWin = wSynodic > 0 ? gap / wSynodic : Infinity;
            const daysToWin = framesToWin * (365.25 / (2 * Math.PI / (0.0007 * 0.25)));
            mpWindow.textContent = mp.formatDays(daysToWin);
            mpWindowStatus.textContent = 'Waiting for alignment...';
            mpWindowStatus.classList.remove('ready');
          }
        }
      } else if (phase === 'inTransit') {
        // nothing extra needed; transit info is visual
      } else if (phase === 'idle' && mpLastTransfer) {
        // Transfer completed, reset
        mpLaunch.style.display = '';
        mpCancel.style.display = 'none';
        mpTransitInfo.style.display = 'none';
        mpComputeTransfer();
      }
    }
  }
}

export function resize() {
  if (activeView) activeView.resize();
}
