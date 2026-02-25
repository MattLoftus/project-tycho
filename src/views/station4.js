import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Station 4 — Realistic multi-ring station.
// Five identical rings connected to a central hub via enclosed spoke corridors.
// Everything rotates as one unit for uniform artificial gravity.

let scene, camera, controls, renderer, camMove;
let stationGroup;
let raycaster, mouse, clickableObjects;
let focusTransition;
let composer, cinematicPass;
const TRANSITION_DURATION = 1800;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let workLightSpots = [];
let workLightUI = null;
let beacons = [];

const STATION_NAME = 'Station 4';

// ── Geometry constants ──
const HUB_RADIUS   = 1.2;
const HUB_HEIGHT   = 26;       // y = -13 to +13
const RING_RADIUS  = 16;
const RING_CROSS   = 2.0;      // width & height of ring cross-section
const RING_HALF    = RING_CROSS / 2;
const RING_COUNT   = 5;
const RING_YS      = [-10, -5, 0, 5, 10];
const SPOKE_COUNT  = 8;
const SPOKE_CROSS  = 0.8;      // enclosed corridor cross-section
const SPOKE_HALF   = SPOKE_CROSS / 2;

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene    = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 15, 50);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 3;
  controls.maxDistance    = 150;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  // ── Materials ──
  const metalMat = new THREE.MeshPhongMaterial({ color: 0xc8d0d8, specular: 0x7788aa, shininess: 55 });
  const darkMat  = new THREE.MeshPhongMaterial({ color: 0x5a6270, specular: 0x445566, shininess: 30 });
  const etchMat  = new THREE.MeshPhongMaterial({ color: 0x3e4855, specular: 0x2a3442, shininess: 30 });
  const windowGlowMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2, transparent: true, opacity: 0.55 });
  const windowPaneMat = new THREE.MeshBasicMaterial({ color: 0xffe090, transparent: true, opacity: 0.55 });
  const redBeaconMat  = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 1.0 });
  const whiteBeaconMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0 });

  stationGroup = new THREE.Group();
  clickableObjects = [];
  meshNameMap = new Map();
  beacons = [];

  function reg(mesh) {
    meshNameMap.set(mesh, STATION_NAME);
    clickableObjects.push(mesh);
    stationGroup.add(mesh);
    return mesh;
  }

  // ═══════════════════════════════════════════
  // 1. CENTRAL HUB
  // ═══════════════════════════════════════════

  const hubGeo = new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS, HUB_HEIGHT, 24);
  reg(new THREE.Mesh(hubGeo, metalMat));

  // Hub end caps — stepped docking cones (same as Station 1)
  [{ y: HUB_HEIGHT / 2, flip: false }, { y: -HUB_HEIGHT / 2, flip: true }].forEach(({ y, flip }) => {
    const collarGeo = new THREE.TorusGeometry(HUB_RADIUS * 1.55, HUB_RADIUS * 0.28, 12, 40);
    const collar = new THREE.Mesh(collarGeo, darkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    reg(collar);

    const coneGeo = new THREE.CylinderGeometry(HUB_RADIUS * 0.55, HUB_RADIUS * 0.9, HUB_RADIUS * 1.4, 16);
    const cone = new THREE.Mesh(coneGeo, metalMat);
    cone.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 0.7);
    if (flip) cone.scale.y = -1;
    reg(cone);

    const portGeo = new THREE.CylinderGeometry(HUB_RADIUS * 0.52, HUB_RADIUS * 0.52, 0.06, 16);
    const port = new THREE.Mesh(portGeo, darkMat);
    port.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 1.4);
    reg(port);
  });

  // Hub collar rings at each ring Y level (where spoke corridors attach)
  RING_YS.forEach((ringY) => {
    const collarGeo = new THREE.TorusGeometry(HUB_RADIUS + 0.3, 0.18, 12, 40);
    const collar = new THREE.Mesh(collarGeo, darkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = ringY;
    reg(collar);
  });

  // Hub detail bands between ring levels
  for (let i = 0; i < 8; i++) {
    const bandY = -12 + i * 3;
    const band = new THREE.Mesh(new THREE.TorusGeometry(HUB_RADIUS + 0.06, 0.04, 8, 32), etchMat);
    band.rotation.x = Math.PI / 2;
    band.position.y = bandY;
    stationGroup.add(band);
  }

  // ═══════════════════════════════════════════
  // 2. RINGS + SPOKE CORRIDORS + SOLAR PANELS
  // ═══════════════════════════════════════════

  // Solar panel canvas texture (shared)
  const CELLS_W = 3, CELLS_L = 11, CELL_PX = 64, LINE_PX = 4;
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

  // Panel dimensions
  const PANEL_LENGTH = 7.0;
  const PANEL_WIDTH  = 2.0;
  const STRUT_LENGTH = 0.6;
  const PANEL_START  = RING_RADIUS + RING_HALF + STRUT_LENGTH;
  const PANEL_MID    = PANEL_START + PANEL_LENGTH / 2;
  const STRUT_MID    = RING_RADIUS + RING_HALF + STRUT_LENGTH / 2;

  // Shared corridor geometry pieces
  const SPOKE_LENGTH = RING_RADIUS - RING_HALF - HUB_RADIUS - 0.3;
  const SPOKE_START  = HUB_RADIUS + 0.3;

  RING_YS.forEach((ringY, ringIdx) => {
    // ── Ring body ──
    const rectShape = new THREE.Shape();
    rectShape.moveTo(-RING_CROSS / 2, -RING_CROSS / 2);
    rectShape.lineTo(-RING_CROSS / 2,  RING_CROSS / 2);
    rectShape.lineTo( RING_CROSS / 2,  RING_CROSS / 2);
    rectShape.lineTo( RING_CROSS / 2, -RING_CROSS / 2);
    rectShape.closePath();

    const ringPathPts = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      ringPathPts.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS));
    }
    const ringCurve = new THREE.CatmullRomCurve3(ringPathPts, true);
    const ringGeo = new THREE.ExtrudeGeometry(rectShape, { extrudePath: ringCurve, steps: 128, bevelEnabled: false });
    const ring = new THREE.Mesh(ringGeo, metalMat);
    ring.position.y = ringY;
    reg(ring);

    // Inner window glow strip
    const glowGeo = new THREE.TorusGeometry(RING_RADIUS - RING_HALF, RING_HALF * 0.08, 8, 128);
    const glowRing = new THREE.Mesh(glowGeo, windowGlowMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = ringY;
    stationGroup.add(glowRing);

    // Structural ribs (top & bottom edges)
    for (const yOff of [RING_HALF * 0.88, -RING_HALF * 0.88]) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS + RING_HALF, 0.035, 6, 128),
        etchMat,
      );
      rib.rotation.x = Math.PI / 2;
      rib.position.y = ringY + yOff;
      stationGroup.add(rib);
    }

    // Windows on outer face
    const N_WIN = 48;
    for (let i = 0; i < N_WIN; i++) {
      const a = (i / N_WIN) * Math.PI * 2 + Math.PI / N_WIN;
      const r = RING_RADIUS + RING_HALF + 0.006;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.30, 0.40), windowPaneMat);
      win.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
      win.rotation.y = -a;
      stationGroup.add(win);
    }

    // Panel seam lines at spoke positions
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const a = (i / SPOKE_COUNT) * Math.PI * 2;
      const r = RING_RADIUS + RING_HALF + 0.015;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.025, RING_CROSS + 0.01, 0.02), etchMat);
      seam.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
      seam.rotation.y = -a;
      stationGroup.add(seam);
    }

    // ── Enclosed spoke corridors ──
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (i / SPOKE_COUNT) * Math.PI * 2;

      const pivot = new THREE.Object3D();
      pivot.position.y = ringY;
      pivot.rotation.y = angle;
      stationGroup.add(pivot);

      // Corridor body — rectangular cross-section extruded along radial line
      const corrShape = new THREE.Shape();
      corrShape.moveTo(-SPOKE_HALF, -SPOKE_HALF);
      corrShape.lineTo(-SPOKE_HALF,  SPOKE_HALF);
      corrShape.lineTo( SPOKE_HALF,  SPOKE_HALF);
      corrShape.lineTo( SPOKE_HALF, -SPOKE_HALF);
      corrShape.closePath();

      // Radial path from hub surface to ring inner surface
      const corrPath = [];
      const nPts = 16;
      for (let p = 0; p <= nPts; p++) {
        const t = p / nPts;
        corrPath.push(new THREE.Vector3(SPOKE_START + t * SPOKE_LENGTH, 0, 0));
      }
      const corrCurve = new THREE.CatmullRomCurve3(corrPath, false);
      const corrGeo = new THREE.ExtrudeGeometry(corrShape, {
        extrudePath: corrCurve,
        steps: 16,
        bevelEnabled: false,
      });
      const corrMesh = new THREE.Mesh(corrGeo, metalMat);
      pivot.add(corrMesh);
      meshNameMap.set(corrMesh, STATION_NAME);
      clickableObjects.push(corrMesh);

      // Collar flange at hub end
      const hubCollar = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, SPOKE_CROSS + 0.2, SPOKE_CROSS + 0.2),
        darkMat,
      );
      hubCollar.position.x = SPOKE_START;
      pivot.add(hubCollar);

      // Collar flange at ring end
      const ringCollar = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, SPOKE_CROSS + 0.2, SPOKE_CROSS + 0.2),
        darkMat,
      );
      ringCollar.position.x = SPOKE_START + SPOKE_LENGTH;
      pivot.add(ringCollar);

      // Porthole windows along the corridor (top face, every ~2.5 units)
      const windowSpacing = 2.5;
      const nWindows = Math.floor(SPOKE_LENGTH / windowSpacing);
      for (let w = 1; w <= nWindows; w++) {
        const wx = SPOKE_START + w * windowSpacing;
        if (wx > SPOKE_START + SPOKE_LENGTH - 0.5) break;

        // Top window
        const topWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.015, 0.3),
          windowPaneMat,
        );
        topWin.position.set(wx, SPOKE_HALF + 0.008, 0);
        pivot.add(topWin);

        // Side window (left)
        const sideWin = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.3, 0.015),
          windowPaneMat,
        );
        sideWin.position.set(wx, 0, SPOKE_HALF + 0.008);
        pivot.add(sideWin);
      }

      // Structural detail bands along corridor
      for (let b = 0; b < 3; b++) {
        const bx = SPOKE_START + (b + 1) * SPOKE_LENGTH / 4;
        const bandGeo = new THREE.BoxGeometry(0.04, SPOKE_CROSS + 0.06, SPOKE_CROSS + 0.06);
        const bandMesh = new THREE.Mesh(bandGeo, etchMat);
        bandMesh.position.x = bx;
        pivot.add(bandMesh);
      }
    }

    // ── Solar panels ──
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (i / SPOKE_COUNT) * Math.PI * 2 + Math.PI / SPOKE_COUNT; // offset from spokes
      const pivot = new THREE.Object3D();
      pivot.position.y = ringY;
      pivot.rotation.y = angle;
      stationGroup.add(pivot);

      // Strut
      const strutGeo = new THREE.CylinderGeometry(0.05, 0.05, STRUT_LENGTH, 6);
      const strutMesh = new THREE.Mesh(strutGeo, darkMat);
      strutMesh.rotation.z = Math.PI / 2;
      strutMesh.position.x = STRUT_MID;
      pivot.add(strutMesh);

      // Panel
      const panelGeo = new THREE.BoxGeometry(PANEL_LENGTH, 0.05, PANEL_WIDTH);
      const panelMesh = new THREE.Mesh(panelGeo, panelMat);
      panelMesh.position.x = PANEL_MID;
      pivot.add(panelMesh);
      meshNameMap.set(panelMesh, STATION_NAME);
      clickableObjects.push(panelMesh);
    }

    // ── Nav light beacons ──
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 8;
      const r = RING_RADIUS + RING_HALF + 0.12;
      const bMesh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 8, 8), whiteBeaconMat.clone());
      bMesh.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
      stationGroup.add(bMesh);
      beacons.push({ mesh: bMesh, phase: ringIdx * 0.4 + i * 0.5, period: 2.0, style: 'blink' });
    }
  });

  // ═══════════════════════════════════════════
  // 3. CROSS-BRACES BETWEEN RING LEVELS
  // ═══════════════════════════════════════════

  for (let g = 0; g < RING_COUNT - 1; g++) {
    const yA = RING_YS[g];
    const yB = RING_YS[g + 1];
    const gap = yB - yA;

    for (let i = 0; i < SPOKE_COUNT; i++) {
      const a = (i / SPOKE_COUNT) * Math.PI * 2;

      // Vertical brace at ring radius
      const brace = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, gap - RING_CROSS, 6),
        darkMat,
      );
      brace.position.set(
        Math.cos(a) * RING_RADIUS,
        (yA + yB) / 2,
        Math.sin(a) * RING_RADIUS,
      );
      stationGroup.add(brace);

      // Diagonal brace (offset by half spoke for X-pattern)
      const a2 = a + Math.PI / SPOKE_COUNT;
      const diagLen = Math.sqrt((gap - RING_CROSS) * (gap - RING_CROSS) + 4);
      const diag = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, diagLen, 6),
        etchMat,
      );
      diag.position.set(
        Math.cos(a2) * RING_RADIUS,
        (yA + yB) / 2,
        Math.sin(a2) * RING_RADIUS,
      );
      // Tilt for diagonal
      const diagAngle = Math.atan2(2, gap - RING_CROSS);
      diag.rotation.z = diagAngle;
      diag.rotation.y = a2;
      stationGroup.add(diag);
    }
  }

  // ═══════════════════════════════════════════
  // 4. STARSHIP (docked at top hub port)
  // ═══════════════════════════════════════════

  const DOCK_TOP = HUB_HEIGHT / 2 + HUB_RADIUS * 1.4 + 0.03;
  const SR   = 0.42;
  const SH   = 3.8;
  const NH   = 0.65;
  const DC_H = 0.50;

  const shipGrp = new THREE.Group();
  shipGrp.rotation.x = Math.PI;
  shipGrp.position.y = DOCK_TOP + DC_H + SH + NH;
  stationGroup.add(shipGrp);

  const shipMat = new THREE.MeshPhongMaterial({ color: 0xcdd2d8, specular: 0x8899bb, shininess: 75 });
  const engMat  = new THREE.MeshPhongMaterial({ color: 0x2c3540, specular: 0x334455, shininess: 30 });

  function rs(mesh) {
    meshNameMap.set(mesh, STATION_NAME);
    clickableObjects.push(mesh);
    shipGrp.add(mesh);
  }

  // Body
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.97, SR, SH, 20), shipMat);
  bodyMesh.position.y = SH / 2;
  rs(bodyMesh);

  // Panel seam rings
  for (let i = 1; i <= 7; i++) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(SR + 0.005, 0.011, 6, 40), engMat);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = i * SH / 8;
    rs(seam);
  }

  // Engine shroud
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.88, SR * 0.96, 0.28, 20), engMat);
  shroud.position.y = 0.14;
  rs(shroud);

  // Raptor engines
  const bellGeo = new THREE.CylinderGeometry(0.044, 0.068, 0.24, 8);
  [
    { r: 0.16, a: 0 }, { r: 0.16, a: (2 * Math.PI) / 3 }, { r: 0.16, a: (4 * Math.PI) / 3 },
    { r: 0.28, a: Math.PI / 3 }, { r: 0.28, a: Math.PI }, { r: 0.28, a: (5 * Math.PI) / 3 },
  ].forEach(({ r, a }) => {
    const bell = new THREE.Mesh(bellGeo, engMat);
    bell.position.set(Math.cos(a) * r, -0.12, Math.sin(a) * r);
    rs(bell);
  });

  // Aft flaps
  const FSPAN = 0.72, FH = 1.65, FT = 0.044;
  const fsA = new THREE.Shape();
  fsA.moveTo(0, 0); fsA.lineTo(FSPAN, 0); fsA.lineTo(FSPAN, FH - FSPAN); fsA.lineTo(0, FH);
  fsA.closePath();
  const fmA = new THREE.Mesh(new THREE.ExtrudeGeometry(fsA, { depth: FT, bevelEnabled: false }), shipMat);
  fmA.position.set(SR, 0.10, -FT / 2);
  rs(fmA);

  const fsB = new THREE.Shape();
  fsB.moveTo(0, 0); fsB.lineTo(-FSPAN, 0); fsB.lineTo(-FSPAN, FH - FSPAN); fsB.lineTo(0, FH);
  fsB.closePath();
  const fmB = new THREE.Mesh(new THREE.ExtrudeGeometry(fsB, { depth: FT, bevelEnabled: false }), shipMat);
  fmB.position.set(-SR, 0.10, -FT / 2);
  rs(fmB);

  // Nosecone
  const noseProfile = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = SR * 0.97 * Math.cos(t * Math.PI / 2);
    noseProfile.push(new THREE.Vector2(r, t * NH));
    if (r < 0.12) break;
  }
  const noseM = new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 20), shipMat);
  noseM.position.y = SH;
  rs(noseM);

  const noseTipR = noseProfile[noseProfile.length - 1].x;
  const noseTipH = noseProfile[noseProfile.length - 1].y;
  const tipCap = new THREE.Mesh(new THREE.CircleGeometry(noseTipR, 16), shipMat);
  tipCap.position.y = SH + noseTipH;
  rs(tipCap);

  // Forward canards
  const CSPAN = 0.48, CH = 0.70, CT = 0.040;
  const canardGeo = new THREE.BoxGeometry(CT, CH, CSPAN);
  const canA = new THREE.Mesh(canardGeo, shipMat);
  canA.position.set(0, SH - 0.82, SR + CSPAN / 2);
  rs(canA);
  const canB = new THREE.Mesh(canardGeo, shipMat);
  canB.position.set(0, SH - 0.82, -SR - CSPAN / 2);
  rs(canB);

  // Docking collar
  const DC_R = 0.20;
  const collarMat = new THREE.MeshPhongMaterial({ color: 0x6a7480, specular: 0x445566, shininess: 40 });
  const collarRingMat = new THREE.MeshPhongMaterial({ color: 0x3e464e, specular: 0x334455, shininess: 55 });

  const fA = new THREE.Mesh(new THREE.TorusGeometry(DC_R + 0.06, 0.028, 8, 32), collarRingMat);
  fA.rotation.x = Math.PI / 2;
  fA.position.y = DOCK_TOP;
  reg(fA);

  const tube = new THREE.Mesh(new THREE.CylinderGeometry(DC_R, DC_R, DC_H, 16), collarMat);
  tube.position.y = DOCK_TOP + DC_H / 2;
  reg(tube);

  const fB = new THREE.Mesh(new THREE.TorusGeometry(DC_R + 0.10, 0.032, 8, 32), collarRingMat);
  fB.rotation.x = Math.PI / 2;
  fB.position.y = DOCK_TOP + DC_H;
  reg(fB);

  // ═══════════════════════════════════════════
  // 5. NAVIGATION BEACONS
  // ═══════════════════════════════════════════

  // Red tip beacons (top of Starship & bottom of hub)
  const topBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), redBeaconMat.clone());
  topBeacon.position.y = DOCK_TOP + DC_H + SH + NH + 0.5;
  stationGroup.add(topBeacon);
  beacons.push({ mesh: topBeacon, phase: 0, period: 1.5, style: 'blink' });

  const botBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), redBeaconMat.clone());
  botBeacon.position.y = -HUB_HEIGHT / 2 - HUB_RADIUS * 1.5;
  stationGroup.add(botBeacon);
  beacons.push({ mesh: botBeacon, phase: 0.75, period: 1.5, style: 'blink' });

  scene.add(stationGroup);

  // ═══════════════════════════════════════════
  // 6. LIGHTING
  // ═══════════════════════════════════════════

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.6);
  keyLight.position.set(25, 18, 20);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fillLight.position.set(-15, -8, -12);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x080a10, 0.6);
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
    addConstructionRig(new THREE.Vector3(35, 25, 15), 0xfff8e8, 2.5, Math.PI / 6),
    addConstructionRig(new THREE.Vector3(-30, -18, 28), 0xeef5ff, 1.8, Math.PI / 5),
  ];

  // Work-lights intensity slider
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
  post.bloomPass.strength  = 0.60;
  post.bloomPass.threshold = 0.62;
}

export function animate() {
  const ts = sim.timeScale;
  const time = performance.now() / 1000;

  // Single rotation — entire station rotates as one unit
  stationGroup.rotation.y += 0.002 * ts;

  // Beacon animations
  beacons.forEach((b) => {
    const cycle = ((time + b.phase) % b.period) / b.period;
    if (b.style === 'blink') {
      b.mesh.material.opacity = cycle < 0.2 ? 1.0 : 0.05;
    } else {
      b.mesh.material.opacity = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(cycle * Math.PI * 2));
    }
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
  beacons = [];
  scene.clear();
}

export function focusOn(mesh) {
  const stationPos = new THREE.Vector3(0, 0, 0);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = stationPos.clone().add(dir.multiplyScalar(30));

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
  return [{ name: STATION_NAME, mesh: stationGroup }];
}
