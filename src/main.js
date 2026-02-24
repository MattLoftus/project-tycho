import * as THREE from 'three';
import * as spaceApp from './space-app.js';
import * as surfaceApp from './surface-app.js';

const apps = {
  space:   { module: spaceApp,   container: 'space-app',   exposure: 1.2 },
  surface: { module: surfaceApp, container: 'surface-app', exposure: 1.15 },
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
  apps[name].module.init(renderer);

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
