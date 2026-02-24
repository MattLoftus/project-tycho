import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Station 1 — a 2001: A Space Odyssey–style rotating space station.
// Two wide torus rings connected by a central hub cylinder, joined by radial spokes.

let scene, camera, controls, renderer, camMove;
let stationGroup;
let raycaster, mouse, clickableObjects;
let focusTransition;
let composer, cinematicPass;
const TRANSITION_DURATION = 1800;
let boundOnClick, boundOnMouseMove;
let meshNameMap = new Map();
let cbHover = null, cbBlur = null, cbFocus = null;
let workLightSpots = [];   // { spot, baseIntensity }
let workLightUI = null;    // the slider DOM element + injected style

const STATION_NAME = 'Station 1';

// ── Geometry constants ──
const RING_RADIUS   = 5.0;   // major radius of each ring
const RING_TUBE     = 0.38;  // half the cross-section width/height
const RING_RECT_W   = RING_TUBE * 2;  // vertical extent of rectangular cross-section
const RING_RECT_H   = RING_TUBE * 2;  // radial extent of rectangular cross-section
const HUB_RADIUS    = 0.52;  // hub cylinder radius
const HUB_HEIGHT    = 4.6;   // distance between ring centres × 2 ≈ ring separation
const RING_Y        = 2.3;   // y offset of each ring from centre
const SPOKE_COUNT   = 8;     // spokes per ring
const SPOKE_RADIUS  = 0.07;  // spoke tube radius
const SPOKE_LENGTH  = RING_RADIUS - HUB_RADIUS; // inner edge of ring to hub surface

export function setCallbacks(hover, blur, focus) {
  cbHover = hover; cbBlur = blur; cbFocus = focus;
}

export function init(rendererIn) {
  renderer = rendererIn;
  scene    = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 2000);
  camera.position.set(0, 8, 22);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping  = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 2;
  controls.maxDistance    = 80;
  controls.target.set(0, 0, 0);
  camMove = createCameraMovement(camera, controls);

  const loader = new THREE.TextureLoader();

  // ── Materials ──
  const metalMat = new THREE.MeshPhongMaterial({
    color:     0xc8d0d8,
    specular:  0x7788aa,
    shininess: 55,
  });
  const darkMat = new THREE.MeshPhongMaterial({
    color:     0x5a6270,
    specular:  0x445566,
    shininess: 30,
  });
  const windowGlowMat = new THREE.MeshBasicMaterial({
    color:       0xfff4c2,
    transparent: true,
    opacity:     0.55,
  });
  const windowPaneMat = new THREE.MeshBasicMaterial({
    color:       0xffe090,
    transparent: true,
    opacity:     0.55,
  });
  const etchMat = new THREE.MeshPhongMaterial({
    color:     0x3e4855,
    specular:  0x2a3442,
    shininess: 30,
  });

  stationGroup = new THREE.Group();
  clickableObjects = [];
  meshNameMap = new Map();

  // ── Helper: register mesh ──
  function reg(mesh) {
    meshNameMap.set(mesh, STATION_NAME);
    clickableObjects.push(mesh);
    stationGroup.add(mesh);
    return mesh;
  }

  // ── Central hub ──
  const hubGeo = new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS, HUB_HEIGHT, 24);
  reg(new THREE.Mesh(hubGeo, metalMat));

  // Hub end caps — stepped docking cones
  const capData = [
    { y:  HUB_HEIGHT / 2, flip: false },
    { y: -HUB_HEIGHT / 2, flip: true  },
  ];
  capData.forEach(({ y, flip }) => {
    // Outer collar ring at ring attachment point
    const collarGeo = new THREE.TorusGeometry(HUB_RADIUS * 1.55, HUB_RADIUS * 0.28, 12, 40);
    const collar = new THREE.Mesh(collarGeo, darkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    reg(collar);

    // Tapered docking port
    const coneGeo = new THREE.CylinderGeometry(
      HUB_RADIUS * 0.55, HUB_RADIUS * 0.9, HUB_RADIUS * 1.4, 16
    );
    const cone = new THREE.Mesh(coneGeo, metalMat);
    cone.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 0.7);
    if (flip) cone.scale.y = -1;
    reg(cone);

    // Docking port cap disk
    const portGeo = new THREE.CylinderGeometry(HUB_RADIUS * 0.52, HUB_RADIUS * 0.52, 0.06, 16);
    const port = new THREE.Mesh(portGeo, darkMat);
    port.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 1.4);
    reg(port);
  });

  // ── Rings + spokes ──
  const ringYPositions = [RING_Y, -RING_Y];

  ringYPositions.forEach((ringY) => {
    // Rectangular cross-section ring — sweep a rect shape along a circular path.
    // For a horizontal circle path (XZ plane), ExtrudeGeometry's Frenet frame gives:
    //   shape X → world -Y (vertical),  shape Y → inward radial.
    // So RING_RECT_W controls vertical extent, RING_RECT_H controls radial thickness.
    const rectShape = new THREE.Shape();
    rectShape.moveTo(-RING_RECT_W / 2, -RING_RECT_H / 2);
    rectShape.lineTo(-RING_RECT_W / 2,  RING_RECT_H / 2);
    rectShape.lineTo( RING_RECT_W / 2,  RING_RECT_H / 2);
    rectShape.lineTo( RING_RECT_W / 2, -RING_RECT_H / 2);
    rectShape.closePath();

    const ringPathPts = [];
    for (let i = 0; i < 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      ringPathPts.push(new THREE.Vector3(Math.cos(a) * RING_RADIUS, 0, Math.sin(a) * RING_RADIUS));
    }
    const ringCurve = new THREE.CatmullRomCurve3(ringPathPts, true);
    const ringGeo = new THREE.ExtrudeGeometry(rectShape, {
      extrudePath:   ringCurve,
      steps:         128,
      bevelEnabled:  false,
    });
    const ring = new THREE.Mesh(ringGeo, metalMat);
    ring.position.y = ringY;
    reg(ring);

    // Inner glow strip — thin torus at the inner face of the rectangular ring
    const glowGeo = new THREE.TorusGeometry(RING_RADIUS - RING_TUBE, RING_TUBE * 0.12, 8, 128);
    const glowRing = new THREE.Mesh(glowGeo, windowGlowMat);
    glowRing.rotation.x = Math.PI / 2;
    glowRing.position.y = ringY;
    stationGroup.add(glowRing);

    // Hub collar at spoke base (where spokes meet hub on this ring level)
    const spokCollarGeo = new THREE.TorusGeometry(HUB_RADIUS * 1.3, HUB_RADIUS * 0.18, 12, 40);
    const spokeCollar = new THREE.Mesh(spokCollarGeo, darkMat);
    spokeCollar.rotation.x = Math.PI / 2;
    spokeCollar.position.y = ringY;
    reg(spokeCollar);

    // Spokes — use pivot objects to place them radially
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (i / SPOKE_COUNT) * Math.PI * 2;

      const pivot = new THREE.Object3D();
      pivot.position.y = ringY;
      pivot.rotation.y = angle;
      stationGroup.add(pivot);

      const spokeMid  = HUB_RADIUS + SPOKE_LENGTH / 2;
      const spokeGeo  = new THREE.CylinderGeometry(SPOKE_RADIUS, SPOKE_RADIUS, SPOKE_LENGTH, 8);
      const spokeMesh = new THREE.Mesh(spokeGeo, darkMat);
      spokeMesh.rotation.z = Math.PI / 2;        // align along X axis
      spokeMesh.position.x = spokeMid;            // radially outward
      pivot.add(spokeMesh);

      meshNameMap.set(spokeMesh, STATION_NAME);
      clickableObjects.push(spokeMesh);
    }
  });

  // ── Cross-braces between rings at each spoke position ──
  // Short struts running vertically between the two ring levels along hub surface
  const braceLength = RING_Y * 2 - RING_TUBE * 2; // gap between inner ring surfaces
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const angle  = (i / SPOKE_COUNT) * Math.PI * 2;
    const r      = HUB_RADIUS + SPOKE_LENGTH * 0.88; // close to outer ring, near ring attachment
    const bGeo   = new THREE.CylinderGeometry(SPOKE_RADIUS * 0.7, SPOKE_RADIUS * 0.7, braceLength, 8);
    const bMesh  = new THREE.Mesh(bGeo, darkMat);
    bMesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    reg(bMesh);
  }

  // ── Ring surface details — windows and structural etchings ──
  // Windows are on the outer face (crew looking out at space).
  // Panel seam lines run at spoke positions. Rib bands run circumferentially at the edges.
  // BoxGeometry(radial_thickness, vertical_height, tangential_width) + rotation.y = angle
  // places each box flush against the outer cylindrical face of the ring.
  const N_WIN = 24;  // 3 windows per panel section between each pair of seams

  ringYPositions.forEach((ringY) => {
    // Windows — offset by a half-step so none land directly on a spoke/seam angle
    for (let i = 0; i < N_WIN; i++) {
      const a = (i / N_WIN) * Math.PI * 2 + Math.PI / N_WIN;
      const r = RING_RADIUS + RING_TUBE + 0.006;
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.20, 0.24), windowPaneMat);
      win.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
      win.rotation.y = -a;
      stationGroup.add(win);
    }

    // Panel seam lines — thin dark raised strips at each spoke position
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const a = (i / SPOKE_COUNT) * Math.PI * 2;
      const r = RING_RADIUS + RING_TUBE + 0.013;
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.020, RING_RECT_W + 0.010, 0.016), etchMat);
      seam.position.set(Math.cos(a) * r, ringY, Math.sin(a) * r);
      seam.rotation.y = -a;
      stationGroup.add(seam);
    }

    // Circumferential rib bands — near the top and bottom edges of the outer face
    for (const yOff of [RING_TUBE * 0.88, -RING_TUBE * 0.88]) {
      const rib = new THREE.Mesh(
        new THREE.TorusGeometry(RING_RADIUS + RING_TUBE, 0.026, 6, 128),
        etchMat,
      );
      rib.rotation.x = Math.PI / 2;
      rib.position.y = ringY + yOff;
      stationGroup.add(rib);
    }
  });

  // ── Solar panels ──
  // Flat photovoltaic arrays extending radially outward from each ring,
  // aligned with the spoke directions so the hub–spoke–ring–panel axis is continuous.
  const PANEL_LENGTH = 5.6;   // radial extent
  const PANEL_WIDTH  = 1.5;   // tangential width
  const STRUT_LENGTH = 0.50;  // short bracket from ring outer edge to panel
  const PANEL_START  = RING_RADIUS + RING_TUBE + STRUT_LENGTH;
  const PANEL_MID    = PANEL_START + PANEL_LENGTH / 2;
  const STRUT_MID    = RING_RADIUS + RING_TUBE + STRUT_LENGTH / 2;

  // Photovoltaic material — canvas texture with a 3×11 cell grid and golden separators
  const CELLS_W = 3;   // cells across the panel width  (1.5 units)
  const CELLS_L = 11;  // cells along  the panel length (5.6 units) — proportionate square cells
  const CELL_PX = 64;  // pixels per cell
  const LINE_PX = 4;   // separator line thickness in pixels

  const panelCanvas  = document.createElement('canvas');
  panelCanvas.width  = CELLS_L * CELL_PX;  // 704 — maps to length direction (U)
  panelCanvas.height = CELLS_W * CELL_PX;  // 192 — maps to width  direction (V)
  const pCtx = panelCanvas.getContext('2d');

  // Cell fill — rich medium blue representing the silicon surface
  pCtx.fillStyle = '#3a7eb8';
  pCtx.fillRect(0, 0, panelCanvas.width, panelCanvas.height);

  // Subtle inner highlight per cell — slightly lighter centre gives depth
  pCtx.fillStyle = '#4a90cc';
  const pad = 5;
  for (let col = 0; col < CELLS_L; col++) {
    for (let row = 0; row < CELLS_W; row++) {
      pCtx.fillRect(
        col * CELL_PX + pad, row * CELL_PX + pad,
        CELL_PX - pad * 2,   CELL_PX - pad * 2,
      );
    }
  }

  // Golden separator grid lines
  pCtx.fillStyle = '#c8a030';
  const half = LINE_PX / 2;
  for (let col = 0; col <= CELLS_L; col++) {  // vertical lines (along width)
    pCtx.fillRect(col * CELL_PX - half, 0, LINE_PX, panelCanvas.height);
  }
  for (let row = 0; row <= CELLS_W; row++) {  // horizontal lines (along length)
    pCtx.fillRect(0, row * CELL_PX - half, panelCanvas.width, LINE_PX);
  }

  const panelTex = new THREE.CanvasTexture(panelCanvas);
  const panelMat = new THREE.MeshStandardMaterial({
    map:             panelTex,
    roughness:       0.15,
    metalness:       0.3,
    envMapIntensity: 2.0,
  });

  ringYPositions.forEach((ringY) => {
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (i / SPOKE_COUNT) * Math.PI * 2;

      const pivot = new THREE.Object3D();
      pivot.position.y = ringY;
      pivot.rotation.y = angle;
      stationGroup.add(pivot);

      // Thin strut from ring outer surface to panel
      const strutGeo  = new THREE.CylinderGeometry(SPOKE_RADIUS * 0.55, SPOKE_RADIUS * 0.55, STRUT_LENGTH, 6);
      const strutMesh = new THREE.Mesh(strutGeo, darkMat);
      strutMesh.rotation.z = Math.PI / 2; // align radially
      strutMesh.position.x = STRUT_MID;
      pivot.add(strutMesh);

      // Solar panel — flat box lying in the XZ plane
      const panelGeo  = new THREE.BoxGeometry(PANEL_LENGTH, 0.05, PANEL_WIDTH);
      const panelMesh = new THREE.Mesh(panelGeo, panelMat);
      panelMesh.position.x = PANEL_MID;
      pivot.add(panelMesh);

      meshNameMap.set(panelMesh, STATION_NAME);
      clickableObjects.push(panelMesh);
    }
  });

  // ── SpaceX Starship — docked at top hub port, nose pointing up ──
  // Top docking port sits at: HUB_HEIGHT/2 (hub top) + HUB_RADIUS*1.4 (cone+port height)
  const DOCK_TOP = HUB_HEIGHT / 2 + HUB_RADIUS * 1.4 + 0.03;
  const SR   = 0.42;  // ship body radius
  const SH   = 3.8;   // body cylinder height
  const NH   = 0.65;  // nosecone height — short rounded dome
  const DC_H = 0.50;  // docking collar height

  const shipGrp = new THREE.Group();
  // Flip 180° so nose docks to the port and engines point away.
  // Reposition so the nose tip (at local y = SH + NH) aligns with the top of the docking collar.
  shipGrp.rotation.x = Math.PI;
  shipGrp.position.y = DOCK_TOP + DC_H + SH + NH;
  stationGroup.add(shipGrp);

  const shipMat = new THREE.MeshPhongMaterial({ color: 0xcdd2d8, specular: 0x8899bb, shininess: 75 });
  const engMat  = new THREE.MeshPhongMaterial({ color: 0x2c3540, specular: 0x334455, shininess: 30 });

  function rs(mesh) { // register + add to ship group
    meshNameMap.set(mesh, STATION_NAME);
    clickableObjects.push(mesh);
    shipGrp.add(mesh);
  }

  // Body cylinder (slight taper — wider at base like real Starship)
  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.97, SR, SH, 20), shipMat);
  bodyMesh.position.y = SH / 2;
  rs(bodyMesh);

  // Stainless steel panel seam rings — the most distinctive Starship visual detail
  for (let i = 1; i <= 7; i++) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(SR + 0.005, 0.011, 6, 40), engMat);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = i * SH / 8;
    rs(seam);
  }

  // Engine shroud — dark band at base before engine bells
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.88, SR * 0.96, 0.28, 20), engMat);
  shroud.position.y = 0.14;
  rs(shroud);

  // Raptor engines — 3 inner (sea-level) + 3 outer (vacuum), alternated
  const bellGeo = new THREE.CylinderGeometry(0.044, 0.068, 0.24, 8);
  [
    { r: 0.16, a: 0                }, { r: 0.16, a: (2 * Math.PI) / 3 }, { r: 0.16, a: (4 * Math.PI) / 3 },
    { r: 0.28, a: Math.PI / 3      }, { r: 0.28, a: Math.PI            }, { r: 0.28, a: (5 * Math.PI) / 3 },
  ].forEach(({ r, a }) => {
    const bell = new THREE.Mesh(bellGeo, engMat);
    bell.position.set(Math.cos(a) * r, -0.12, Math.sin(a) * r);
    rs(bell);
  });

  // Aft flaps (2, at ±X) — extend outward at 45° from hinge, then run parallel to body down to base
  const FSPAN = 0.72, FH = 1.65, FT = 0.044;
  // Shape: inner edge runs vertically along body; outer edge goes straight down then
  // the top corner angles back in at 45° to the hinge point on the body.
  //   (0, FH)  ←  hinge on body (top)
  //        \   45° diagonal
  //   (FSPAN, FH-FSPAN)  ← elbow
  //         |  parallel to body
  //   (FSPAN, 0)  ← outer bottom
  //   (0, 0)     ← inner bottom
  // +X flap
  const fsA = new THREE.Shape();
  fsA.moveTo(0, 0); fsA.lineTo(FSPAN, 0); fsA.lineTo(FSPAN, FH - FSPAN); fsA.lineTo(0, FH);
  fsA.closePath();
  const fmA = new THREE.Mesh(new THREE.ExtrudeGeometry(fsA, { depth: FT, bevelEnabled: false }), shipMat);
  fmA.position.set(SR, 0.10, -FT / 2);
  rs(fmA);
  // −X flap (mirrored shape)
  const fsB = new THREE.Shape();
  fsB.moveTo(0, 0); fsB.lineTo(-FSPAN, 0); fsB.lineTo(-FSPAN, FH - FSPAN); fsB.lineTo(0, FH);
  fsB.closePath();
  const fmB = new THREE.Mesh(new THREE.ExtrudeGeometry(fsB, { depth: FT, bevelEnabled: false }), shipMat);
  fmB.position.set(-SR, 0.10, -FT / 2);
  rs(fmB);

  // Nosecone — spherical-cap profile (cos falloff); truncated so the tip is a flat ring
  // that meets the docking collar rather than coming to a sharp point.
  const noseProfile = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const r = SR * 0.97 * Math.cos(t * Math.PI / 2);
    noseProfile.push(new THREE.Vector2(r, t * NH));
    if (r < 0.12) break; // stop before full point — leaves a small flat opening
  }
  const noseM = new THREE.Mesh(new THREE.LatheGeometry(noseProfile, 20), shipMat);
  noseM.position.y = SH;
  rs(noseM);
  // Flat cap sealing the truncated tip
  const noseTipR = noseProfile[noseProfile.length - 1].x;
  const noseTipH = noseProfile[noseProfile.length - 1].y;
  const tipCap = new THREE.Mesh(new THREE.CircleGeometry(noseTipR, 16), shipMat);
  tipCap.position.y = SH + noseTipH;
  rs(tipCap);

  // Forward canards (2, at ±Z) — smaller fins near nose
  const CSPAN = 0.48, CH = 0.70, CT = 0.040;
  const canardGeo = new THREE.BoxGeometry(CT, CH, CSPAN);
  const canA = new THREE.Mesh(canardGeo, shipMat);
  canA.position.set(0, SH - 0.82, SR + CSPAN / 2);
  rs(canA);
  const canB = new THREE.Mesh(canardGeo, shipMat);
  canB.position.set(0, SH - 0.82, -SR - CSPAN / 2);
  rs(canB);

  // ── Docking collar — rigid adapter bridging the station port to the ship nose ──
  // Sits in stationGroup space between DOCK_TOP (port face) and DOCK_TOP+DC_H (nose contact).
  const DC_R    = 0.20;  // collar tube inner radius
  const collarMat = new THREE.MeshPhongMaterial({ color: 0x6a7480, specular: 0x445566, shininess: 40 });
  const collarRingMat = new THREE.MeshPhongMaterial({ color: 0x3e464e, specular: 0x334455, shininess: 55 });

  // Station-side flange ring
  const fA = new THREE.Mesh(new THREE.TorusGeometry(DC_R + 0.06, 0.028, 8, 32), collarRingMat);
  fA.rotation.x = Math.PI / 2;
  fA.position.y = DOCK_TOP;
  reg(fA);

  // Adapter tube
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(DC_R, DC_R, DC_H, 16), collarMat);
  tube.position.y = DOCK_TOP + DC_H / 2;
  reg(tube);

  // Ship-side flange ring (slightly wider — the capture ring that grabs the nose)
  const fB = new THREE.Mesh(new THREE.TorusGeometry(DC_R + 0.10, 0.032, 8, 32), collarRingMat);
  fB.rotation.x = Math.PI / 2;
  fB.position.y = DOCK_TOP + DC_H;
  reg(fB);

  scene.add(stationGroup);

  // ── Lighting ──
  // Key light — simulating distant sunlight
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.6);
  keyLight.position.set(12, 8, 10);
  scene.add(keyLight);

  // Fill light — faint cool bounce from the other side
  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fillLight.position.set(-8, -4, -6);
  scene.add(fillLight);

  // Ambient — very dim; space has no atmosphere to scatter light
  const ambient = new THREE.AmbientLight(0x080a10, 0.6);
  scene.add(ambient);

  // ── Orbital construction lights ──
  // Free-floating work-light rigs positioned around the station.
  // Each rig: housing → hood → glowing lens face, on a slim boom arm.
  // SpotLight is co-located and aimed at the station centre.

  const rigHousingMat = new THREE.MeshPhongMaterial({ color: 0xbcc4ce, specular: 0x556677, shininess: 55 });
  const rigHoodMat    = new THREE.MeshPhongMaterial({ color: 0x2a3038, specular: 0x445566, shininess: 30 });
  const rigArmMat     = new THREE.MeshPhongMaterial({ color: 0x8899aa, specular: 0x334455, shininess: 20 });

  function addConstructionRig(pos, lightColor, intensity, coneAngle) {
    // Fixture group — lookAt(0,0,0) makes local -Z face the station
    const rig = new THREE.Group();
    rig.position.copy(pos);
    rig.lookAt(0, 0, 0);
    scene.add(rig);

    // Main housing body
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.95), rigHousingMat);
    housing.position.z = -0.48;
    rig.add(housing);

    // Wider shroud/hood at the front
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.10), rigHoodMat);
    hood.position.z = -0.97;
    rig.add(hood);

    // Lens indicator — dim enough not to blow out bloom when facing camera
    const lensDimColor = new THREE.Color(lightColor).multiplyScalar(0.18);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.10, 20),
      new THREE.MeshBasicMaterial({ color: lensDimColor }),
    );
    lens.position.z = -1.02; // just proud of the hood face
    rig.add(lens);

    // Boom arm — behind the housing
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), rigArmMat);
    arm.rotation.x = Math.PI / 2;
    arm.position.z = 1.2;
    rig.add(arm);

    // Anchor plate at boom end
    const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.08), rigHoodMat);
    anchor.position.z = 2.44;
    rig.add(anchor);

    // SpotLight from this position pointing at origin
    const spot = new THREE.SpotLight(lightColor, intensity, 0, coneAngle, 0.28, 0);
    spot.position.copy(pos);
    spot.target.position.set(0, 0, 0);
    scene.add(spot);
    scene.add(spot.target);
    return { spot, baseIntensity: intensity };
  }

  // Rig 1 — warm key light, upper-right
  workLightSpots = [
    addConstructionRig(new THREE.Vector3(20, 14,  8), 0xfff8e8, 2.2, Math.PI / 6),
    addConstructionRig(new THREE.Vector3(-17, -11, 14), 0xeef5ff, 1.5, Math.PI / 5),
  ];

  // ── Work-lights intensity slider ──
  // Injected into the page when this view is active; removed on dispose().
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
    position: 'fixed', bottom: '80px', right: '24px', zIndex: '10',
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
  // Run the equirectangular texture through PMREMGenerator so MeshStandardMaterial
  // has a full hemisphere of image-based lighting to reflect from.
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
  raycaster    = new THREE.Raycaster();
  mouse        = new THREE.Vector2();
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
  stationGroup.rotation.y += 0.003 * ts;

  if (focusTransition) {
    const elapsed = performance.now() - focusTransition.startTime;
    const t    = Math.min(elapsed / focusTransition.duration, 1);
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
    controls.target.lerpVectors(focusTransition.startTarget, focusTransition.endTarget, ease);
    camera.position.lerpVectors(focusTransition.startCam, focusTransition.endCam, ease);
    if (t >= 1) focusTransition = null;
  }

  camMove.update(0.016);
  controls.update();
  cinematicPass.uniforms.time.value = performance.now() / 1000;
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
  scene.clear();
}

export function focusOn(mesh) {
  // Always focus the whole station — pull back to a good viewing distance
  const stationPos = new THREE.Vector3(0, 0, 0);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const endCam = stationPos.clone().add(dir.multiplyScalar(14));

  controls.minDistance = 2;
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
