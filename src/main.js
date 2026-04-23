import * as THREE from 'three';
import * as spaceApp from './space-app.js';
import * as surfaceApp from './surface-app.js';
import * as oceanApp from './ocean-app.js';
import * as spacetimeApp from './spacetime-app.js';
import * as specialApp from './special-app.js';
import { inject } from '@vercel/analytics';

inject();

const apps = {
  space:     { module: spaceApp,     container: 'space-app',     exposure: 1.2,  title: 'Space Sim' },
  surface:   { module: surfaceApp,   container: 'surface-app',   exposure: 1.15, title: 'Surface' },
  ocean:     { module: oceanApp,     container: 'ocean-app',     exposure: 1.0,  title: 'Ocean' },
  spacetime: { module: spacetimeApp, container: 'spacetime-app', exposure: 1.1,  title: 'Spacetime' },
  special:   { module: specialApp,   container: 'special-app',   exposure: 1.1,  title: 'Special' },
};
const DEFAULT_APP = 'space';
let activeApp = null;

// ── URL routing ─────────────────────────────────────────────────────────────
// Each top-level section gets a URL path (e.g. /spacetime). The path is the
// app name; the root path "/" maps to the default app.
function appFromPath(pathname) {
  const slug = (pathname || '/').replace(/^\/+/, '').split('/')[0].toLowerCase();
  return apps[slug] ? slug : DEFAULT_APP;
}
function pathForApp(name) {
  return '/' + name;
}

// Shared renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
document.getElementById('canvas-container').appendChild(renderer.domElement);

// App switching. `pushUrl` controls whether we update history (user action) or
// leave the URL alone (popstate / initial boot).
function switchApp(name, pushUrl = true) {
  if (!apps[name]) name = DEFAULT_APP;
  if (activeApp === name) return;
  if (activeApp) {
    apps[activeApp].module.dispose();
  }
  activeApp = name;
  renderer.toneMappingExposure = apps[name].exposure;
  // Hide EVERY other app container — not just the previously-active one.
  // On a fresh page load with a non-default URL (e.g. /spacetime), the old
  // "hide previous only" logic left the default app's markup visible because
  // it had never been hidden by a prior switch.
  for (const appName in apps) {
    const el = document.getElementById(apps[appName].container);
    if (el) el.style.display = appName === name ? '' : 'none';
  }
  // Some apps have async init (e.g. special-app loading heightmaps)
  const result = apps[name].module.init(renderer);
  if (result && typeof result.catch === 'function') result.catch(console.error);

  document.querySelectorAll('.app-switch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.app === name);
  });
  // Tag body with active app name so CSS can respond (e.g. hide mobile d-pad)
  document.body.classList.forEach(c => {
    if (c.startsWith('app-')) document.body.classList.remove(c);
  });
  document.body.classList.add('app-' + name);

  // URL + title
  document.title = `Project Tycho — ${apps[name].title}`;
  if (pushUrl) {
    const targetPath = pathForApp(name);
    if (location.pathname !== targetPath) {
      history.pushState({ app: name }, '', targetPath);
    }
  }
}

// Switcher buttons
document.querySelectorAll('.app-switch-btn').forEach(btn => {
  btn.addEventListener('click', () => switchApp(btn.dataset.app));
});

// Browser back/forward
window.addEventListener('popstate', () => {
  switchApp(appFromPath(location.pathname), false);
});

// Start from the current URL (falls back to default if unrecognised)
switchApp(appFromPath(location.pathname), false);

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
