import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createComposer } from '../post.js';
import { sim } from '../sim.js';
import { createCameraMovement } from '../camera-movement.js';

// Station 2 — identical to Station 1 except the rings are segmented:
// each ring is formed from MOD_N cylindrical modules joined by connector collars,
// rather than a continuous smooth torus.

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

const STATION_NAME = 'Station 2';

// ── Geometry constants ──
const RING_RADIUS  = 5.0;
const RING_TUBE    = 0.38;
const HUB_RADIUS   = 0.52;
const HUB_HEIGHT   = 4.6;
const RING_Y       = 2.3;
const SPOKE_COUNT  = 8;
const SPOKE_RADIUS = 0.07;
const SPOKE_LENGTH = RING_RADIUS - HUB_RADIUS;
const MOD_N        = 16;   // cylindrical modules per ring
const CHORD_LEN    = 2 * RING_RADIUS * Math.sin(Math.PI / MOD_N);  // ≈ 1.951
const MOD_LEN      = CHORD_LEN * 0.75;  // shorter than chord so connectors are visible
const CONN_LEN     = CHORD_LEN - MOD_LEN;  // connector fills the gap exactly

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
  const portholeMat = new THREE.MeshBasicMaterial({
    color:       0xffe090,
    transparent: true,
    opacity:     0.52,
  });
  const etch2Mat = new THREE.MeshPhongMaterial({
    color:     0x3e4855,
    specular:  0x2a3442,
    shininess: 30,
  });

  stationGroup = new THREE.Group();
  clickableObjects = [];
  meshNameMap = new Map();

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
    const collarGeo = new THREE.TorusGeometry(HUB_RADIUS * 1.55, HUB_RADIUS * 0.28, 12, 40);
    const collar = new THREE.Mesh(collarGeo, darkMat);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = y;
    reg(collar);

    const coneGeo = new THREE.CylinderGeometry(
      HUB_RADIUS * 0.55, HUB_RADIUS * 0.9, HUB_RADIUS * 1.4, 16
    );
    const cone = new THREE.Mesh(coneGeo, metalMat);
    cone.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 0.7);
    if (flip) cone.scale.y = -1;
    reg(cone);

    const portGeo = new THREE.CylinderGeometry(HUB_RADIUS * 0.52, HUB_RADIUS * 0.52, 0.06, 16);
    const port = new THREE.Mesh(portGeo, darkMat);
    port.position.y = y + (flip ? -1 : 1) * (HUB_RADIUS * 1.4);
    reg(port);
  });

  // ── Rings + spokes ──
  const ringYPositions = [RING_Y, -RING_Y];

  ringYPositions.forEach((ringY) => {
    // Segmented ring — MOD_N cylindrical modules arranged in a circle
    for (let i = 0; i < MOD_N; i++) {
      const angle = (i / MOD_N) * Math.PI * 2;

      // Module pivot — rotated to the right angular position around Y
      const modPivot = new THREE.Object3D();
      modPivot.position.y = ringY;
      modPivot.rotation.y = angle;
      stationGroup.add(modPivot);

      // Cylindrical module — rotation.x = π/2 turns the default Y axis to Z (tangential in pivot space)
      const modGeo  = new THREE.CylinderGeometry(RING_TUBE, RING_TUBE, MOD_LEN, 12);
      const modMesh = new THREE.Mesh(modGeo, metalMat);
      modMesh.rotation.x = Math.PI / 2;
      modMesh.position.x = RING_RADIUS;
      modPivot.add(modMesh);
      meshNameMap.set(modMesh, STATION_NAME);
      clickableObjects.push(modMesh);

      // Window glow strip — thin box sitting just inside the inner face of the module
      // In modPivot space: X is radial, Y is up, Z is tangential.
      const winGeo  = new THREE.BoxGeometry(0.03, RING_TUBE * 0.65, MOD_LEN * 0.78);
      const winMesh = new THREE.Mesh(winGeo, windowGlowMat);
      winMesh.position.x = RING_RADIUS - RING_TUBE * 0.88;
      modPivot.add(winMesh);  // not clickable

      // Connector collar at the midpoint between module i and module i+1
      const colAngle = ((i + 0.5) / MOD_N) * Math.PI * 2;
      const colPivot = new THREE.Object3D();
      colPivot.position.y = ringY;
      colPivot.rotation.y = colAngle;
      stationGroup.add(colPivot);

      const colGeo  = new THREE.CylinderGeometry(RING_TUBE * 0.40, RING_TUBE * 0.40, CONN_LEN, 10);
      const colMesh = new THREE.Mesh(colGeo, darkMat);
      colMesh.rotation.x = Math.PI / 2;
      colMesh.position.x = RING_RADIUS;
      colPivot.add(colMesh);
      meshNameMap.set(colMesh, STATION_NAME);
      clickableObjects.push(colMesh);

      // ── Per-module surface details ──
      // Portholes — two circular windows on the outer face of each module.
      // In modPivot space +X is radially outward, so rotation.y = π/2 makes
      // the CircleGeometry face normal point in +X (outward).
      for (const zOff of [-MOD_LEN * 0.22, MOD_LEN * 0.22]) {
        const port = new THREE.Mesh(new THREE.CircleGeometry(0.090, 14), portholeMat);
        port.position.set(RING_RADIUS + RING_TUBE + 0.007, 0, zOff);
        port.rotation.y = Math.PI / 2;
        modPivot.add(port);
      }

      // End flanges — slightly wider rings at each module end, like pressure-vessel flanges.
      // TorusGeometry default lies in the XY plane; placed at (RING_RADIUS, 0, ±MOD_LEN/2)
      // it wraps around the circular end face of the cylinder.
      for (const zOff of [-MOD_LEN / 2, MOD_LEN / 2]) {
        const flange = new THREE.Mesh(
          new THREE.TorusGeometry(RING_TUBE + 0.030, 0.032, 8, 24),
          etch2Mat,
        );
        flange.position.set(RING_RADIUS, 0, zOff);
        modPivot.add(flange);
      }

      // Mid-body band — thin structural ring around the centre of each module
      const midBand = new THREE.Mesh(
        new THREE.TorusGeometry(RING_TUBE + 0.014, 0.020, 6, 24),
        etch2Mat,
      );
      midBand.position.set(RING_RADIUS, 0, 0);
      modPivot.add(midBand);
    }

    // Hub collar at spoke base (where spokes meet hub on this ring level)
    const spokCollarGeo = new THREE.TorusGeometry(HUB_RADIUS * 1.3, HUB_RADIUS * 0.18, 12, 40);
    const spokeCollar = new THREE.Mesh(spokCollarGeo, darkMat);
    spokeCollar.rotation.x = Math.PI / 2;
    spokeCollar.position.y = ringY;
    reg(spokeCollar);

    // Spokes — pivot objects to place them radially
    for (let i = 0; i < SPOKE_COUNT; i++) {
      const angle = (i / SPOKE_COUNT) * Math.PI * 2;

      const pivot = new THREE.Object3D();
      pivot.position.y = ringY;
      pivot.rotation.y = angle;
      stationGroup.add(pivot);

      const spokeMid  = HUB_RADIUS + SPOKE_LENGTH / 2;
      const spokeGeo  = new THREE.CylinderGeometry(SPOKE_RADIUS, SPOKE_RADIUS, SPOKE_LENGTH, 8);
      const spokeMesh = new THREE.Mesh(spokeGeo, darkMat);
      spokeMesh.rotation.z = Math.PI / 2;
      spokeMesh.position.x = spokeMid;
      pivot.add(spokeMesh);

      meshNameMap.set(spokeMesh, STATION_NAME);
      clickableObjects.push(spokeMesh);
    }
  });

  // ── Cross-braces between rings at each spoke position ──
  const braceLength = RING_Y * 2 - RING_TUBE * 2;
  for (let i = 0; i < SPOKE_COUNT; i++) {
    const angle  = (i / SPOKE_COUNT) * Math.PI * 2;
    const r      = HUB_RADIUS + SPOKE_LENGTH * 0.88;
    const bGeo   = new THREE.CylinderGeometry(SPOKE_RADIUS * 0.7, SPOKE_RADIUS * 0.7, braceLength, 8);
    const bMesh  = new THREE.Mesh(bGeo, darkMat);
    bMesh.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
    reg(bMesh);
  }

  // ── Solar panels ──
  const PANEL_LENGTH = 5.6;
  const PANEL_WIDTH  = 1.5;
  const STRUT_LENGTH = 0.50;
  const PANEL_START  = RING_RADIUS + RING_TUBE + STRUT_LENGTH;
  const PANEL_MID    = PANEL_START + PANEL_LENGTH / 2;
  const STRUT_MID    = RING_RADIUS + RING_TUBE + STRUT_LENGTH / 2;

  const CELLS_W = 3;
  const CELLS_L = 11;
  const CELL_PX = 64;
  const LINE_PX = 4;

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
      pCtx.fillRect(
        col * CELL_PX + pad, row * CELL_PX + pad,
        CELL_PX - pad * 2,   CELL_PX - pad * 2,
      );
    }
  }

  pCtx.fillStyle = '#c8a030';
  const half = LINE_PX / 2;
  for (let col = 0; col <= CELLS_L; col++) {
    pCtx.fillRect(col * CELL_PX - half, 0, LINE_PX, panelCanvas.height);
  }
  for (let row = 0; row <= CELLS_W; row++) {
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

      const strutGeo  = new THREE.CylinderGeometry(SPOKE_RADIUS * 0.55, SPOKE_RADIUS * 0.55, STRUT_LENGTH, 6);
      const strutMesh = new THREE.Mesh(strutGeo, darkMat);
      strutMesh.rotation.z = Math.PI / 2;
      strutMesh.position.x = STRUT_MID;
      pivot.add(strutMesh);

      const panelGeo  = new THREE.BoxGeometry(PANEL_LENGTH, 0.05, PANEL_WIDTH);
      const panelMesh = new THREE.Mesh(panelGeo, panelMat);
      panelMesh.position.x = PANEL_MID;
      pivot.add(panelMesh);

      meshNameMap.set(panelMesh, STATION_NAME);
      clickableObjects.push(panelMesh);
    }
  });

  // ── SpaceX Starship — docked at top hub port, nose pointing up ──
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

  const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.97, SR, SH, 20), shipMat);
  bodyMesh.position.y = SH / 2;
  rs(bodyMesh);

  for (let i = 1; i <= 7; i++) {
    const seam = new THREE.Mesh(new THREE.TorusGeometry(SR + 0.005, 0.011, 6, 40), engMat);
    seam.rotation.x = Math.PI / 2;
    seam.position.y = i * SH / 8;
    rs(seam);
  }

  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(SR * 0.88, SR * 0.96, 0.28, 20), engMat);
  shroud.position.y = 0.14;
  rs(shroud);

  const bellGeo = new THREE.CylinderGeometry(0.044, 0.068, 0.24, 8);
  [
    { r: 0.16, a: 0                }, { r: 0.16, a: (2 * Math.PI) / 3 }, { r: 0.16, a: (4 * Math.PI) / 3 },
    { r: 0.28, a: Math.PI / 3      }, { r: 0.28, a: Math.PI            }, { r: 0.28, a: (5 * Math.PI) / 3 },
  ].forEach(({ r, a }) => {
    const bell = new THREE.Mesh(bellGeo, engMat);
    bell.position.set(Math.cos(a) * r, -0.12, Math.sin(a) * r);
    rs(bell);
  });

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

  const CSPAN = 0.48, CH = 0.70, CT = 0.040;
  const canardGeo = new THREE.BoxGeometry(CT, CH, CSPAN);
  const canA = new THREE.Mesh(canardGeo, shipMat);
  canA.position.set(0, SH - 0.82, SR + CSPAN / 2);
  rs(canA);
  const canB = new THREE.Mesh(canardGeo, shipMat);
  canB.position.set(0, SH - 0.82, -SR - CSPAN / 2);
  rs(canB);

  // ── Docking collar ──
  const DC_R      = 0.20;
  const collarMat     = new THREE.MeshPhongMaterial({ color: 0x6a7480, specular: 0x445566, shininess: 40 });
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

  scene.add(stationGroup);

  // ── Lighting ──
  const keyLight = new THREE.DirectionalLight(0xfff5e8, 1.6);
  keyLight.position.set(12, 8, 10);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fillLight.position.set(-8, -4, -6);
  scene.add(fillLight);

  const ambient = new THREE.AmbientLight(0x080a10, 0.6);
  scene.add(ambient);

  // ── Orbital construction lights ──
  const rigHousingMat = new THREE.MeshPhongMaterial({ color: 0xbcc4ce, specular: 0x556677, shininess: 55 });
  const rigHoodMat    = new THREE.MeshPhongMaterial({ color: 0x2a3038, specular: 0x445566, shininess: 30 });
  const rigArmMat     = new THREE.MeshPhongMaterial({ color: 0x8899aa, specular: 0x334455, shininess: 20 });

  function addConstructionRig(pos, lightColor, intensity, coneAngle) {
    const rig = new THREE.Group();
    rig.position.copy(pos);
    rig.lookAt(0, 0, 0);
    scene.add(rig);

    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.95), rigHousingMat);
    housing.position.z = -0.48;
    rig.add(housing);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.10), rigHoodMat);
    hood.position.z = -0.97;
    rig.add(hood);

    const lensDimColor = new THREE.Color(lightColor).multiplyScalar(0.18);
    const lens = new THREE.Mesh(
      new THREE.CircleGeometry(0.10, 20),
      new THREE.MeshBasicMaterial({ color: lensDimColor }),
    );
    lens.position.z = -1.02;
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
    addConstructionRig(new THREE.Vector3(20, 14,  8), 0xfff8e8, 2.2, Math.PI / 6),
    addConstructionRig(new THREE.Vector3(-17, -11, 14), 0xeef5ff, 1.5, Math.PI / 5),
  ];

  // ── Work-lights intensity slider ──
  const sliderStyle = document.createElement('style');
  sliderStyle.textContent = `
    #wl2-slider::-webkit-slider-thumb {
      -webkit-appearance: none; appearance: none;
      width: 10px; height: 10px;
      background: rgba(140, 210, 255, 0.9); border-radius: 50%;
      box-shadow: 0 0 6px rgba(80, 180, 255, 0.7); cursor: pointer;
    }
    #wl2-slider::-moz-range-thumb {
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
      <span id="wl2-label" style="font-family:'Share Tech Mono',monospace;font-size:13px;
                                   letter-spacing:0.1em;color:rgba(140,210,255,0.9);
                                   min-width:38px;text-align:right;">1.00x</span>
    </div>
    <input id="wl2-slider" type="range" min="0" max="100" value="50" step="1"
      style="-webkit-appearance:none;appearance:none;width:130px;height:2px;
             background:rgba(80,160,220,0.2);outline:none;border:none;cursor:pointer;">
  `;
  document.body.appendChild(wlEl);

  wlEl.querySelector('#wl2-slider').addEventListener('input', (e) => {
    const mult = e.target.value / 50;
    wlEl.querySelector('#wl2-label').textContent = mult.toFixed(2) + 'x';
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
