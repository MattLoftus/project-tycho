import * as THREE from 'three';
import * as spaceApp from './space-app.js';
import * as surfaceApp from './surface-app.js';
import * as oceanApp from './ocean-app.js';
import * as specialApp from './special-app.js';
import { inject } from '@vercel/analytics';

inject();

const apps = {
  space:   { module: spaceApp,   container: 'space-app',   exposure: 1.2 },
  surface: { module: surfaceApp, container: 'surface-app', exposure: 1.15 },
  ocean:   { module: oceanApp,   container: 'ocean-app',   exposure: 1.0 },
  special: { module: specialApp, container: 'special-app', exposure: 1.1 },
};
let activeApp = null;

// Shared renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// App switching
function switchApp(name) {
  if (activeApp === name) return;
  if (activeApp) {
    apps[activeApp].module.dispose();
    document.getElementById(apps[activeApp].container).style.display = 'none';
  }
  activeApp = name;
  renderer.toneMappingExposure = apps[name].exposure;
  document.getElementById(apps[name].container).style.display = '';
  // Some apps have async init (e.g. special-app loading heightmaps)
  const result = apps[name].module.init(renderer);
  if (result && typeof result.catch === 'function') result.catch(console.error);

  document.querySelectorAll('.app-switch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.app === name);
  });
}

// Switcher buttons
document.querySelectorAll('.app-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => switchApp(btn.dataset.app));
});

// Start with space sim
switchApp('space');

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  if (activeApp) apps[activeApp].module.animate();
}
animate();

// Resize
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (activeApp) apps[activeApp].module.resize();
});

// Live UTC clock
function updateClock() {
  const now = new Date();
  const h = String(now.getUTCHours()).padStart(2, '0');
  const m = String(now.getUTCMinutes()).padStart(2, '0');
  const s = String(now.getUTCSeconds()).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${h}:${m}:${s} UTC`;
}
updateClock();
setInterval(updateClock, 1000);

// Update status label on nav switch
document.querySelectorAll('#space-app #nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const el = document.getElementById('status-view');
    if (el) el.textContent = btn.textContent;
  });
});

// Collapsible navs for mobile
function setupCollapsibleNav(navId, collapseId, expandId) {
  const navEl = document.getElementById(navId);
  const collapseBtn = document.getElementById(collapseId);
  const expandBtn = document.getElementById(expandId);
  if (!navEl || !collapseBtn || !expandBtn) return;

  collapseBtn.addEventListener('click', () => {
    navEl.classList.add('collapsed');
    expandBtn.classList.add('visible');
  });
  expandBtn.addEventListener('click', () => {
    navEl.classList.remove('collapsed');
    expandBtn.classList.remove('visible');
  });

  // Auto-collapse on small screens
  if (window.matchMedia('(max-width: 768px)').matches) {
    navEl.classList.add('collapsed');
    expandBtn.classList.add('visible');
  }
}

setupCollapsibleNav('nav', 'nav-collapse-btn', 'nav-expand-tab');
setupCollapsibleNav('view-nav', 'sv-nav-collapse', 'sv-nav-expand');
setupCollapsibleNav('oc-view-nav', 'oc-nav-collapse', 'oc-nav-expand');
setupCollapsibleNav('sv-right-panels', 'sv-rpanel-collapse', 'sv-rpanel-expand');
setupCollapsibleNav('oc-right-panels', 'oc-rpanel-collapse', 'oc-rpanel-expand');

// Mobile D-pad
document.querySelectorAll('#mobile-dpad .dpad-btn').forEach(btn => {
  const key = btn.dataset.key;

  function sendKey(type) {
    window.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('pressed');
    sendKey('keydown');
  });

  btn.addEventListener('pointerup', (e) => {
    e.preventDefault();
    btn.classList.remove('pressed');
    sendKey('keyup');
  });

  btn.addEventListener('pointerleave', () => {
    if (btn.classList.contains('pressed')) {
      btn.classList.remove('pressed');
      sendKey('keyup');
    }
  });
});
