import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Station 3 — Advanced Orbital Colony (c. 2230).
// A massive multi-level station with counter-rotating ring pairs,
// central command spire, particle accelerator, agricultural domes,
// hangar bays, radiator fins, and animated navigation beacons.

let scene, camera, controls, renderer, camMove;
let raycaster, mouse, clickableObjects;
let focusTransition;
let composer, cinematicPass;
const TRANSITION_DURATION = 1800;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let workLightSpots = [];
let workLightUI = null;

const STATION_NAME = 'Station 3';

// ── Animation state ──
let ringLevels = [];       // { innerGroup, outerGroup }
let beacons = [];          // { mesh, phase, period, style }
let thrusterGlows = [];    // meshes
let scienceGlowMesh = null;
let agriGlows = [];        // meshes
let acceleratorGroup = null;

// ── Ring level definitions ──
const LEVELS = [
  { y: -10, innerR: 12, outerR: 20, type: 'industrial' },
  { y:  -5, innerR: 14, outerR: 22, type: 'habitat' },
  { y:   0, innerR: 16, outerR: 24, type: 'habitat_main' },
  { y:   5, innerR: 14, outerR: 22, type: 'habitat' },
  { y:  10, innerR: 10, outerR: 18, type: 'science' },
];

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene    = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 20, 60);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 3;
  controls.maxDistance    = 200;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  // ── Materials ──
  const metalMat = new THREE.MeshPhongMaterial({ color: 0xd0d8e0, specular: 0x8899bb, shininess: 60 });
  const darkMat  = new THREE.MeshPhongMaterial({ color: 0x4a5260, specular: 0x445566, shininess: 35 });
  const etchMat  = new THREE.MeshPhongMaterial({ color: 0x3a4450, specular: 0x2a3442, shininess: 30 });
  const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.55 });
  const windowPaneMat = new THREE.MeshBasicMaterial({ color: 0xffe090, transparent: true, opacity: 0.55 });
  const glassMat = new THREE.MeshPhongMaterial({ color: 0x88aacc, transparent: true, opacity: 0.25, specular: 0xffffff, shininess: 100 });
  const agriGlassMat = new THREE.MeshPhongMaterial({ color: 0x66aa88, transparent: true, opacity: 0.30, specular: 0xaaffcc, shininess: 80 });
  const greenGlowMat = new THREE.MeshBasicMaterial({ color: 0x44cc66, transparent: true, opacity: 0.15 });
  const radiatorMat  = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.7, metalness: 0.5 });
  const engineMat    = new THREE.MeshPhongMaterial({ color: 0x2c3540, specular: 0x334455, shininess: 30 });
  const thrusterGlowMatDef = new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.6 });
  const scienceGlowMatDef  = new THREE.MeshBasicMaterial({ color: 0x00ccff, transparent: true, opacity: 0.4 });
  const redBeaconMat   = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 1.0 });
  const whiteBeaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });
  const greenBeaconMat = new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 1.0 });
  const blueBeaconMat  = new THREE.MeshBasicMaterial({ color: 0x2288ff, transparent: true, opacity: 1.0 });
  const hangarOpenMat  = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
  const beaconOrangeMat = new THREE.MeshBasicMaterial({ color: 0xff8800, transparent: true, opacity: 0.9 });

  clickableObjects = [];
  meshNameMap = new Map();
  ringLevels = [];
  beacons = [];
  thrusterGlows = [];
  agriGlows = [];

  const stationCore = new THREE.Group(); // non-rotating frame

  function reg(mesh, parent) {
    meshNameMap.set(mesh, STATION_NAME);
    clickableObjects.push(mesh);
    (parent || stationCore).add(mesh);
    return mesh;
  }

  // ═══════════════════════════════════════════
  // 1. CENTRAL SPIRE
  // ═══════════════════════════════════════════

  // Lower engine mount
  const engineMount = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.5, 24), darkMat);
  engineMount.position.y = -14.75;
  reg(engineMount);

  // Main spire body (lower section)
  const spireLower = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 20, 24), metalMat);
  spireLower.position.y = -4;
  reg(spireLower);

  // Upper spire section
  const spireUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.4, 8, 24), metalMat);
  spireUpper.position.y = 10;
  reg(spireUpper);

  // Spire detail bands
  for (let i = 0; i < 6; i++) {
    const bandY = -12 + i * 5;
    const rAtY = bandY < 6 ? THREE.MathUtils.lerp(1.8, 1.4, (bandY + 14) / 20)
                            : THREE.MathUtils.lerp(1.4, 1.0, (bandY - 6) / 8);
    const band = new THREE.Mesh(new THREE.TorusGeometry(rAtY + 0.08, 0.06, 8, 32), etchMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = bandY;
    stationCore.add(band);
  }

  // Spire collar rings at each level Y (where spokes attach)
  LEVELS.forEach((lv) => {
    const rAtY = lv.y < 6 ? THREE.MathUtils.lerp(1.8, 1.4, (lv.y + 14) / 20)
                           : THREE.MathUtils.lerp(1.4, 1.0, (lv.y - 6) / 8);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(rAtY + 0.4, 0.2, 12, 32), darkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = lv.y;
    reg(collar);
  });

  // Observation dome at top
  const domeGeo = new THREE.SphereGeometry(1.2, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, glassMat);
  dome.position.y = 14;
  reg(dome);

  const domeRing = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.15, 12, 32), darkMat);
  domeRing.rotation.x = Math.PI / 2;
  domeRing.position.y = 14;
  reg(domeRing);

  // Bottom thruster nozzles (4×)
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.6, 1.2, 12),
      engineMat,
    );
    nozzle.position.set(Math.cos(angle) * 1.4, -15.35, Math.sin(angle) * 1.4);
    reg(nozzle);

    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 16),
      thrusterGlowMatDef.clone(),
    );
    glow.rotation.x = Math.PI / 2;
    glow.position.set(Math.cos(angle) * 1.4, -15.95, Math.sin(angle) * 1.4);
    stationCore.add(glow);
    thrusterGlows.push(glow);
  }

  // ═══════════════════════════════════════════
  // 2. RING LEVELS
  // ═══════════════════════════════════════════

  // Solar panel canvas texture (shared)
  const CELLS_W = 3, CELLS_L = 14, CELL_PX = 64, LINE_PX = 4;
  const panelCanvas  = document.createElement('canvas');
  panelCanvas.width  = CELLS_L * CELL_PX;
  panelCanvas.height = CELLS_W * CELL_PX;
  const pCtx = panelCanvas.getContext('2d');
  pCtx.fillStyle = '#3a7eb8';
  pCtx.fillRect(0, 0, panelCanvas.width, panelCanvas.height);
  pCtx.fillStyle = '#4a90cc';
  const pad = 5;
  for (let col = 0; col < CELLS_L; col++) {
    for (let row = 0; row < CELLS_W; row++) {
      pCtx.fillRect(col * CELL_PX + pad, row * CELL_PX + pad, CELL_PX - pad * 2, CELL_PX - pad * 2);
    }
  }
  pCtx.fillStyle = '#c8a030';
  const half = LINE_PX / 2;
  for (let col = 0; col <= CELLS_L; col++) pCtx.fillRect(col * CELL_PX - half, 0, LINE_PX, panelCanvas.height);
  for (let row = 0; row <= CELLS_W; row++) pCtx.fillRect(0, row * CELL_PX - half, panelCanvas.width, LINE_PX);
  const panelTex = new THREE.CanvasTexture(panelCanvas);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.15, metalness: 0.3, envMapIntensity: 2.0 });

  function buildRing(radius, crossW, crossH, y, parent) {
    const rectShape = new THREE.Shape();
    rectShape.moveTo(-crossW / 2, -crossH / 2);
    rectShape.lineTo(-crossW / 2,  crossH / 2);
    rectShape.lineTo( crossW / 2,  crossH / 2);
    rectShape.lineTo( crossW / 2, -crossH / 2);
    rectShape.closePath();

    const pts = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
    }
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const geo = new THREE.ExtrudeGeometry(rectShape, { extrudePath: curve, steps: 128, bevelEnabled: false });
    const mesh = new THREE.Mesh(geo, metalMat);
    mesh.position.y = y;
    reg(mesh, parent);

    // Window glow strip
    const glowGeo = new THREE.TorusGeometry(radius - crossH / 2, crossH * 0.06, 8, 128);
    const glow = new THREE.Mesh(glowGeo, windowGlowMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = y;
    parent.add(glow);

    // Structural ribs
    for (const yOff of [crossW * 0.44, -crossW * 0.44]) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(radius + crossH / 2, 0.04, 6, 128), etchMat);
      rib.rotation.x = Math.PI / 2;
      rib.position.y = y + yOff;
      parent.add(rib);
    }

    // Windows
    const nWin = Math.round(radius * 3);
    for (let i = 0; i < nWin; i++) {
      const a = (i / nWin) * Math.PI * 2 + Math.PI / nWin;
      const r = radius + crossH / 2 + 0.006;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.35, 0.45), windowPaneMat);
      win.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      win.rotation.y = -a;
      parent.add(win);
    }

    // Panel seams
    const nSeams = 12;
    for (let i = 0; i < nSeams; i++) {
      const a = (i / nSeams) * Math.PI * 2;
      const r = radius + crossH / 2 + 0.015;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, crossW + 0.01, 0.02), etchMat);
      seam.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      seam.rotation.y = -a;
      parent.add(seam);
    }
  }

  function buildSpokes(fromR, toR, count, y, parent) {
    const spokeR = 0.10;
    const length = toR - fromR;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const pivot = new THREE.Object3D();
      pivot.position.y = y;
      pivot.rotation.y = angle;
      parent.add(pivot);

      const mid = fromR + length / 2;
      const geo = new THREE.CylinderGeometry(spokeR, spokeR, length, 8);
      const mesh = new THREE.Mesh(geo, darkMat);
      mesh.rotation.z = Math.PI / 2;
      mesh.position.x = mid;
      pivot.add(mesh);
      meshNameMap.set(mesh, STATION_NAME);
      clickableObjects.push(mesh);

      // Collar at ring junction
      const collarGeo = new THREE.TorusGeometry(spokeR * 2.5, spokeR * 0.6, 8, 16);
      const collarA = new THREE.Mesh(collarGeo, darkMat);
      collarA.rotation.z = Math.PI / 2;
      collarA.position.x = toR;
      pivot.add(collarA);
    }
  }

  LEVELS.forEach((lv, lvIdx) => {
    const innerGroup = new THREE.Group();
    const outerGroup = new THREE.Group();
    stationCore.add(innerGroup);
    stationCore.add(outerGroup);

    // Spire radius at this level
    const spireR = lv.y < 6
      ? THREE.MathUtils.lerp(1.8, 1.4, (lv.y + 14) / 20)
      : THREE.MathUtils.lerp(1.4, 1.0, (lv.y - 6) / 8);

    // Inner ring
    buildRing(lv.innerR, 1.4, 1.4, lv.y, innerGroup);

    // Outer ring
    buildRing(lv.outerR, 1.8, 1.8, lv.y, outerGroup);

    // Inner spokes (spire → inner ring)
    buildSpokes(spireR + 0.3, lv.innerR - 0.7, 12, lv.y, innerGroup);

    // Outer spokes (inner ring → outer ring)
    buildSpokes(lv.innerR + 0.7, lv.outerR - 0.9, 12, lv.y, outerGroup);

    // Nav lights on outer ring (4 per level)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const r = lv.outerR + 0.9 + 0.1;
      const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), whiteBeaconMat.clone());
      bMesh.position.set(Math.cos(a) * r, lv.y, Math.sin(a) * r);
      outerGroup.add(bMesh);
      beacons.push({ mesh: bMesh, phase: lvIdx * 0.4 + i * 0.5, period: 2.0, style: 'blink' });
    }

    // ── Level-specific features ──

    // Level 0: Hangar bays
    if (lv.type === 'industrial') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
        const r = lv.outerR + 0.9 + 1.5;

        const hangar = new THREE.Mesh(new THREE.BoxGeometry(4.0, 2.5, 3.0), metalMat);
        hangar.position.set(Math.cos(a) * r, lv.y, Math.sin(a) * r);
        hangar.rotation.y = -a;
        reg(hangar, outerGroup);

        // Dark opening
        const opening = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.0, 0.1), hangarOpenMat);
        opening.position.set(Math.cos(a) * (r - 1.45), lv.y, Math.sin(a) * (r - 1.45));
        opening.rotation.y = -a;
        outerGroup.add(opening);

        // Guide lights along opening edges
        const guideGeo = new THREE.BoxGeometry(0.08, 0.08, 3.0);
        for (const yOff of [0.95, -0.95]) {
          const guide = new THREE.Mesh(guideGeo, beaconOrangeMat.clone());
          guide.position.set(Math.cos(a) * r, lv.y + yOff, Math.sin(a) * r);
          guide.rotation.y = -a;
          outerGroup.add(guide);
        }

        // Hangar approach lights
        for (let s = 0; s < 2; s++) {
          const bMat = s === 0 ? greenBeaconMat.clone() : redBeaconMat.clone();
          const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), bMat);
          const offset = s === 0 ? 1.3 : -1.3;
          bMesh.position.set(
            Math.cos(a) * (r - 1.5) + Math.cos(a + Math.PI / 2) * offset,
            lv.y,
            Math.sin(a) * (r - 1.5) + Math.sin(a + Math.PI / 2) * offset,
          );
          outerGroup.add(bMesh);
          beacons.push({ mesh: bMesh, phase: i * 0.2, period: 0.8, style: 'blink' });
        }

        // Docked shuttle (simple)
        const shuttleBody = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.25, 1.8, 8),
          darkMat,
        );
        shuttleBody.rotation.z = Math.PI / 2;
        shuttleBody.position.set(Math.cos(a) * (r + 0.2), lv.y + 0.3, Math.sin(a) * (r + 0.2));
        shuttleBody.rotation.y = -a;
        outerGroup.add(shuttleBody);

        const shuttleNose = new THREE.Mesh(
          new THREE.ConeGeometry(0.2, 0.5, 8),
          metalMat,
        );
        shuttleNose.rotation.z = -Math.PI / 2;
        shuttleNose.position.set(
          Math.cos(a) * (r + 0.2) + Math.cos(a) * -1.15,
          lv.y + 0.3,
          Math.sin(a) * (r + 0.2) + Math.sin(a) * -1.15,
        );
        shuttleNose.rotation.y = -a;
        outerGroup.add(shuttleNose);
      }

      // Thruster pods on level 0
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = lv.outerR + 0.9 + 0.5;

        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.5), darkMat);
        pod.position.set(Math.cos(a) * r, lv.y, Math.sin(a) * r);
        pod.rotation.y = -a;
        reg(pod, outerGroup);

        const nozzle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.3, 0.6, 10),
          engineMat,
        );
        nozzle.position.set(Math.cos(a) * (r + 1.0), lv.y, Math.sin(a) * (r + 1.0));
        outerGroup.add(nozzle);

        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), thrusterGlowMatDef.clone());
        glow.position.set(Math.cos(a) * (r + 1.35), lv.y, Math.sin(a) * (r + 1.35));
        glow.rotation.y = -a + Math.PI;
        outerGroup.add(glow);
        thrusterGlows.push(glow);
      }
    }

    // Levels 1 & 3: Radiator fins + solar panels
    if (lv.type === 'habitat') {
      // Radiator fins (4 per level)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        const rStart = lv.outerR + 0.9 + 0.5;

        const pivot = new THREE.Object3D();
        pivot.position.y = lv.y;
        pivot.rotation.y = a;
        outerGroup.add(pivot);

        // Support strut
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6), darkMat);
        strut.rotation.z = Math.PI / 2;
        strut.position.x = rStart;
        pivot.add(strut);

        // Radiator panel
        const radPanel = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.06, 3.0), radiatorMat);
        radPanel.position.x = rStart + 4.5;
        pivot.add(radPanel);
        meshNameMap.set(radPanel, STATION_NAME);
        clickableObjects.push(radPanel);

        // Heat pipe detail lines
        for (let j = 0; j < 6; j++) {
          const line = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.025, 0.03), etchMat);
          line.position.set(rStart + 4.5, 0.04, -1.2 + j * 0.48);
          pivot.add(line);
        }
      }

      // Solar panels (4 per level, interleaved with radiators)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const rStart = lv.outerR + 0.9 + 0.5;

        const pivot = new THREE.Object3D();
        pivot.position.y = lv.y;
        pivot.rotation.y = a;
        outerGroup.add(pivot);

        const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), darkMat);
        strut.rotation.z = Math.PI / 2;
        strut.position.x = rStart;
        pivot.add(strut);

        const sp = new THREE.Mesh(new THREE.BoxGeometry(12.0, 0.05, 3.5), panelMat);
        sp.position.x = rStart + 6.5;
        pivot.add(sp);
        meshNameMap.set(sp, STATION_NAME);
        clickableObjects.push(sp);
      }
    }

    // Level 2: Agricultural domes
    if (lv.type === 'habitat_main') {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = lv.outerR + 0.9 + 0.2;

        const dGeo = new THREE.SphereGeometry(1.5, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const dMesh = new THREE.Mesh(dGeo, agriGlassMat);
        dMesh.position.set(Math.cos(a) * r, lv.y + 0.9, Math.sin(a) * r);
        reg(dMesh, outerGroup);

        const dBase = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.12, 8, 24), darkMat);
        dBase.rotation.x = Math.PI / 2;
        dBase.position.set(Math.cos(a) * r, lv.y + 0.9, Math.sin(a) * r);
        outerGroup.add(dBase);

        const interiorGlow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 16), greenGlowMat.clone());
        interiorGlow.rotation.x = -Math.PI / 2;
        interiorGlow.position.set(Math.cos(a) * r, lv.y + 0.95, Math.sin(a) * r);
        outerGroup.add(interiorGlow);
        agriGlows.push(interiorGlow);
      }
    }

    // Level 4: Thruster pods
    if (lv.type === 'science') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const r = lv.outerR + 0.9 + 0.5;

        const pod = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 1.5), darkMat);
        pod.position.set(Math.cos(a) * r, lv.y, Math.sin(a) * r);
        pod.rotation.y = -a;
        reg(pod, outerGroup);

        const nozzle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.3, 0.6, 10),
          engineMat,
        );
        nozzle.position.set(Math.cos(a) * (r + 1.0), lv.y, Math.sin(a) * (r + 1.0));
        outerGroup.add(nozzle);

        const glow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 12), thrusterGlowMatDef.clone());
        glow.position.set(Math.cos(a) * (r + 1.35), lv.y, Math.sin(a) * (r + 1.35));
        glow.rotation.y = -a + Math.PI;
        outerGroup.add(glow);
        thrusterGlows.push(glow);
      }
    }

    ringLevels.push({ innerGroup, outerGroup });
  });

  // ═══════════════════════════════════════════
  // 3. CROSS-BRACES BETWEEN LEVELS
  // ═══════════════════════════════════════════

  for (let g = 0; g < LEVELS.length - 1; g++) {
    const lvA = LEVELS[g];
    const lvB = LEVELS[g + 1];
    const gap = lvB.y - lvA.y;

    // Vertical braces on inner radius (use average of the two levels' inner radii)
    const avgInner = (lvA.innerR + lvB.innerR) / 2;
    const avgOuter = (lvA.outerR + lvB.outerR) / 2;

    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;

      // Inner vertical brace
      const bI = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, gap, 6), darkMat);
      bI.position.set(Math.cos(a) * avgInner, (lvA.y + lvB.y) / 2, Math.sin(a) * avgInner);
      stationCore.add(bI);

      // Outer vertical brace
      const bO = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, gap, 6), darkMat);
      bO.position.set(Math.cos(a) * avgOuter, (lvA.y + lvB.y) / 2, Math.sin(a) * avgOuter);
      stationCore.add(bO);
    }

    // Diagonal X-braces (every other spoke position)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const diagLen = Math.sqrt(gap * gap + (avgOuter - avgInner) * (avgOuter - avgInner));
      const diagAngle = Math.atan2(avgOuter - avgInner, gap);

      const diag = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, diagLen, 6), etchMat);
      diag.position.set(
        Math.cos(a) * (avgInner + avgOuter) / 2,
        (lvA.y + lvB.y) / 2,
        Math.sin(a) * (avgInner + avgOuter) / 2,
      );
      diag.rotation.z = diagAngle;
      diag.rotation.y = a;
      stationCore.add(diag);
    }
  }

  // ═══════════════════════════════════════════
  // 4. PARTICLE ACCELERATOR RING
  // ═══════════════════════════════════════════

  acceleratorGroup = new THREE.Group();
  stationCore.add(acceleratorGroup);

  const accelTube = new THREE.Mesh(
    new THREE.TorusGeometry(28.0, 0.4, 12, 128),
    metalMat,
  );
  accelTube.rotation.x = Math.PI / 2;
  accelTube.position.y = 12.5;
  reg(accelTube, acceleratorGroup);

  // Science glow ring
  scienceGlowMesh = new THREE.Mesh(
    new THREE.TorusGeometry(28.0, 0.15, 8, 128),
    scienceGlowMatDef,
  );
  scienceGlowMesh.rotation.x = Math.PI / 2;
  scienceGlowMesh.position.y = 12.5;
  acceleratorGroup.add(scienceGlowMesh);

  // Detector housings
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const det = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), darkMat);
    det.position.set(Math.cos(a) * 28.0, 12.5, Math.sin(a) * 28.0);
    det.rotation.y = -a;
    reg(det, acceleratorGroup);
  }

  // Support pylons from level 4 outer ring
  const lv4 = LEVELS[4];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const fromR = lv4.outerR + 0.9;
    const toR = 28.0;
    const fromY = lv4.y;
    const toY = 12.5;
    const dx = Math.cos(a) * (toR - fromR);
    const dz = Math.sin(a) * (toR - fromR);
    const dy = toY - fromY;
    const length = Math.sqrt(dx * dx + dy * dy + dz * dz);

    const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 6), darkMat);
    pylon.position.set(
      Math.cos(a) * (fromR + toR) / 2,
      (fromY + toY) / 2,
      Math.sin(a) * (fromR + toR) / 2,
    );
    // Orient the pylon toward the accelerator ring point
    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
    pylon.quaternion.copy(quat);
    stationCore.add(pylon);
  }

  // ═══════════════════════════════════════════
  // 5. COMMUNICATION ARRAY
  // ═══════════════════════════════════════════

  // Antenna mast
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 8), darkMat);
  mast.position.y = 16.7;
  reg(mast);

  // Primary dish (parabolic via LatheGeometry)
  const DISH_R = 2.0, DISH_D = 0.6;
  const dishProfile = [];
  for (let i = 0; i <= 20; i++) {
    const t = i / 20;
    dishProfile.push(new THREE.Vector2(DISH_R * t, DISH_D * t * t));
  }
  const dishGeo = new THREE.LatheGeometry(dishProfile, 24);
  const primaryDish = new THREE.Mesh(dishGeo, metalMat);
  primaryDish.position.y = 17.0;
  primaryDish.rotation.x = -0.26; // tilt 15°
  reg(primaryDish);

  // Feed horn
  const feedHorn = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), darkMat);
  feedHorn.position.set(0, 17.6, -0.5);
  stationCore.add(feedHorn);

  // Support struts for primary dish
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.0, 6), darkMat);
    strut.position.set(Math.cos(a) * 1.0, 17.3, Math.sin(a) * 1.0 - 0.3);
    strut.rotation.z = Math.cos(a) * 0.3;
    strut.rotation.x = Math.sin(a) * 0.3;
    stationCore.add(strut);
  }

  // Secondary dish (smaller)
  const DISH2_R = 0.8, DISH2_D = 0.3;
  const dishProfile2 = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    dishProfile2.push(new THREE.Vector2(DISH2_R * t, DISH2_D * t * t));
  }
  const secondaryDish = new THREE.Mesh(new THREE.LatheGeometry(dishProfile2, 16), metalMat);
  secondaryDish.position.set(1.2, 16.0, 0);
  secondaryDish.rotation.x = 0.35; // tilt -20°
  reg(secondaryDish);

  // ═══════════════════════════════════════════
  // 6. NAVIGATION BEACONS
  // ═══════════════════════════════════════════

  // Top beacon
  const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), redBeaconMat.clone());
  topBeacon.position.y = 18.5;
  stationCore.add(topBeacon);
  beacons.push({ mesh: topBeacon, phase: 0, period: 1.5, style: 'blink' });

  // Bottom beacon
  const botBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), redBeaconMat.clone());
  botBeacon.position.y = -16.0;
  stationCore.add(botBeacon);
  beacons.push({ mesh: botBeacon, phase: 0.75, period: 1.5, style: 'blink' });

  // Spire marker lights (blue)
  for (let i = 0; i < 6; i++) {
    const bandY = -12 + i * 5;
    const rAtY = bandY < 6 ? THREE.MathUtils.lerp(1.8, 1.4, (bandY + 14) / 20)
                            : THREE.MathUtils.lerp(1.4, 1.0, (bandY - 6) / 8);
    const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), blueBeaconMat.clone());
    bMesh.position.set(rAtY + 0.15, bandY, 0);
    stationCore.add(bMesh);
    beacons.push({ mesh: bMesh, phase: i * 0.5, period: 3.0, style: 'pulse' });
  }

  scene.add(stationCore);

  // ═══════════════════════════════════════════
  // 7. LIGHTING
  // ═══════════════════════════════════════════

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 0.95);
  keyLight.position.set(30, 20, 25);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.18);
  fillLight.position.set(-8, -4, -6);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0x4466aa, 0.25);
  rimLight.position.set(-25, -10, -20);
  scene.add(rimLight);

  const ambient = new THREE.AmbientLight(0x080a10, 0.3);
  scene.add(ambient);

  // Construction lighting rigs
  const rigHousingMat = new THREE.MeshPhongMaterial({ color: 0xbcc4ce, specular: 0x556677, shininess: 55 });
  const rigHoodMat    = new THREE.MeshPhongMaterial({ color: 0x2a3038, specular: 0x445566, shininess: 30 });
  const rigArmMat     = new THREE.MeshPhongMaterial({ color: 0x8899aa, specular: 0x334455, shininess: 20 });

  function addConstructionRig(pos, lightColor, intensity, coneAngle) {
    const rig = new THREE.Group();
    rig.position.copy(pos);
    rig.lookAt(0, 0, 0);
    scene.add(rig);

    rig.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.95), rigHousingMat));
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.10), rigHoodMat);
    hood.position.z = -0.52;
    rig.add(hood);

    const lensDimColor = new THREE.Color(lightColor).multiplyScalar(0.18);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.10, 20),
      new THREE.MeshBasicMaterial({ color: lensDimColor }),
    );
    lens.position.z = -0.57;
    rig.add(lens);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), rigArmMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = 1.2;
    rig.add(arm);

    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.08), rigHoodMat);
    anchor.position.z = 2.44;
    rig.add(anchor);

    const spot = new THREE.SpotLight(lightColor, intensity, 0, coneAngle, 0.28, 0);
    spot.position.copy(pos);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
    return { spot, baseIntensity: intensity };
  }

  workLightSpots = [
    addConstructionRig(new THREE.Vector3(45, 30, 20), 0xfff8e8, 1.5, Math.PI / 6),
    addConstructionRig(new THREE.Vector3(-40, -20, 35), 0xeef5ff, 1.0, Math.PI / 5),
  ];

  // ── Work-lights intensity slider ──
  const sliderStyle = document.createElement('style');
  sliderStyle.textContent = `
    #wl-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 10px; height: 10px;
      background: rgba(140, 210, 255, 0.9); border-radius: 50%;
      box-shadow: 0 0 6px rgba(80, 180, 255, 0.7); cursor: pointer;
    }
    #wl-slider::-moz-range-thumb {
      width: 10px; height: 10px;
      background: rgba(140, 210, 255, 0.9); border-radius: 50%;
      border: none; box-shadow: 0 0 6px rgba(80, 180, 255, 0.7);
    }
  `;
  document.head.appendChild(sliderStyle);

  const wlEl = document.createElement('div');
  Object.assign(wlEl.style, {
    position: 'fixed', bottom: '20px', right: '180px', zIndex: '10',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    gap: '6px', pointerEvents: 'auto',
  });
  wlEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;">
      <span style="font-family:'Share Tech Mono',monospace;font-size:11px;
                   letter-spacing:0.25em;color:rgba(80,160,220,0.5);text-transform:uppercase;">
        Work Lights
      </span>
      <span id="wl-label" style="font-family:'Share Tech Mono',monospace;font-size:13px;
                                  letter-spacing:0.1em;color:rgba(140,210,255,0.9);
                                  min-width:38px;text-align:right;">1.00x</span>
    </div>
    <input id="wl-slider" type="range" min="0" max="100" value="50" step="1"
      style="-webkit-appearance:none;appearance:none;width:130px;height:2px;
             background:rgba(80,160,220,0.2);outline:none;border:none;cursor:pointer;">
  `;
  document.body.appendChild(wlEl);

  wlEl.querySelector('#wl-slider').addEventListener('input', (e) => {
    const mult = e.target.value / 50;
    wlEl.querySelector('#wl-label').textContent = mult.toFixed(2) + 'x';
    workLightSpots.forEach(({ spot, baseIntensity }) => {
      spot.intensity = baseIntensity * mult;
    });
  });

  workLightUI = { el: wlEl, style: sliderStyle };

  // ── Starfield + environment map ──
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const bgLoader = new THREE.TextureLoader();
  bgLoader.load('/textures/starfield.jpg', (tex) => {
    const envMap = pmrem.fromEquirectangular(tex).texture;
    scene.background = tex;
    scene.environment = envMap;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    pmrem.dispose();
  });

  // ── Input ──
  raycaster = new THREE.Raycaster();
  mouse     = new THREE.Vector2();
  focusTransition = null;

  boundOnClick = (event) => {
    if (event.detail === 0) return;
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) focusOn(hits[0].object);
  };

  boundOnMouseMove = (event) => {
    mouse.x =  (event.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(clickableObjects, true);
    if (hits.length > 0) {
      renderer.domElement.style.cursor = 'pointer';
      if (cbHover) cbHover(STATION_NAME, event.clientX, event.clientY);
    } else {
      renderer.domElement.style.cursor = 'default';
      if (cbBlur) cbBlur();
    }
  };

  renderer.domElement.addEventListener('click',     boundOnClick);
  renderer.domElement.addEventListener('mousemove', boundOnMouseMove);

  // ── Post-processing ──
  const post = createComposer(renderer, scene, camera);
  composer      = post.composer;
  cinematicPass = post.cinematicPass;
  post.bloomPass.strength  = 0.70;
  post.bloomPass.threshold = 0.55;
}

export function animate() {
  const ts = sim.timeScale;
  const time = performance.now() / 1000;

  // Counter-rotating rings
  const baseSpeed = 0.002;
  ringLevels.forEach((lv) => {
    lv.innerGroup.rotation.y += baseSpeed * ts;
    lv.outerGroup.rotation.y -= baseSpeed * 0.6 * ts;
  });

  // Particle accelerator slow rotation
  if (acceleratorGroup) {
    acceleratorGroup.rotation.y += baseSpeed * 0.15 * ts;
  }

  // Beacon animations
  beacons.forEach((b) => {
    const cycle = ((time + b.phase) % b.period) / b.period;
    if (b.style === 'blink') {
      b.mesh.material.opacity = cycle < 0.2 ? 1.0 : 0.05;
    } else {
      // pulse (sine wave)
      b.mesh.material.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(cycle * Math.PI * 2));
    }
  });

  // Thruster glow pulse
  thrusterGlows.forEach((glow, i) => {
    glow.material.opacity = 0.4 + 0.2 * Math.sin(time * 1.5 + i * 0.7);
  });

  // Science ring glow
  if (scienceGlowMesh) {
    scienceGlowMesh.material.opacity = 0.3 + 0.15 * Math.sin(time * 2.0);
  }

  // Agricultural dome interior flicker
  agriGlows.forEach((g, i) => {
    g.material.opacity = 0.12 + 0.05 * Math.sin(time * 0.8 + i * 1.2);
  });

  // Focus transition
  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t    = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (t >= 1) focusTransition = null;
  }

  camMove.update(0.016);
  controls.update();
  cinematicPass.uniforms.time.value = time;
  composer.render();
}

export function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  composer.setSize(window.innerWidth, window.innerHeight);
}

export function dispose() {
  renderer.domElement.removeEventListener('click',     boundOnClick);
  renderer.domElement.removeEventListener('mousemove', boundOnMouseMove);
  renderer.domElement.style.cursor = 'default';
  focusTransition = null;
  camMove.dispose();
  if (workLightUI) {
    workLightUI.el.remove();
    workLightUI.style.remove();
    workLightUI = null;
  }
  workLightSpots = [];
  ringLevels = [];
  beacons = [];
  thrusterGlows = [];
  agriGlows = [];
  scienceGlowMesh = null;
  acceleratorGroup = null;
  scene.clear();
}

export function focusOn(mesh) {
  const stationPos = new THREE.Vector3(0, 0, 0);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = stationPos.clone().add(dir.multiplyScalar(40));

  controls.minDistance = 3;
  if (cbFocus) cbFocus(STATION_NAME);

  focusTransition = {
    startCam:    camera.position.clone(),
    endCam,
    startTarget: controls.target.clone(),
    endTarget:   stationPos.clone(),
    startTime:   performance.now(),
    duration:    TRANSITION_DURATION,
  };
}

export function getObjects() {
  return [{ name: STATION_NAME, mesh: scene }];
}
